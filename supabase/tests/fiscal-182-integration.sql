-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 182 (contingência SVC da NF-e). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t182_res (ok boolean, msg text);
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t182_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;

do $$
declare a bigint; o55 uuid; o65 uuid; r jsonb; r2 jsonb; c uuid; d public.loja_fiscal_documento%rowtype;
        ch text; ch9 text; x text; cont public.loja_fiscal_contingencia%rowtype; p jsonb;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F182 A', 'F182A') returning id into a;
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 55, 1, 'homologacao', 21), (a, 65, 1, 'homologacao', 51);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 55, 1, 20, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o55;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 50, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o65;

  -- regras de entrada
  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', null, 9::smallint);
  perform pg_temp.chk(r->>'code' = 'SO_NFCE', 'NF-e não vai para a contingência off-line (9)');
  r := public.app_fiscal_contingencia_abrir(o65, now(), 'SEFAZ SP fora do ar no momento', null, 6::smallint);
  perform pg_temp.chk(r->>'code' = 'SVC_SO_NFE', 'NFC-e não vai para a SVC');
  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', now() + interval '1 day', 6::smallint);
  perform pg_temp.chk(r->>'code' = 'PRAZO_INVALIDO', 'SVC não tem prazo de transmissão');
  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', null, 5::smallint);
  perform pg_temp.chk(r->>'code' = 'TP_EMIS_INVALIDO', 'forma de emissão fora de 6/7/9 é recusada');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_contingencia where loja_id = a) = 0
    and (select proximo_numero from public.loja_fiscal_serie where loja_id = a and modelo = 55) = 21, 'recusas não gastam número');

  -- abre na SVC-AN
  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', null, 6::smallint);
  c := (r->>'documento_id')::uuid;
  select * into d from public.loja_fiscal_documento where id = c;
  perform pg_temp.chk((r->>'ok')::boolean and d.tp_emis = 6 and d.numero = 21 and d.modelo = 55 and d.status = 'contingencia', 'NF-e na SVC: número novo, tp_emis 6');
  perform pg_temp.chk((select prazo is null from public.loja_fiscal_contingencia where documento_id = c), 'nota da SVC sem prazo');
  r2 := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', null, 6::smallint);
  perform pg_temp.chk((r2->>'reutilizado')::boolean and r2->>'documento_id' = c::text, 'repetir devolve a mesma nota');

  -- guarda o XML
  ch9 := '352611' || '12345678000195' || '55' || '001' || '000000021' || '9' || '12345678' || '0';
  ch  := '352611' || '12345678000195' || '55' || '001' || '000000021' || '6' || '12345678' || '0';
  r := public.app_fiscal_contingencia_salvar_xml(c, ch9, '<NFe><infNFe Id="NFe' || ch9 || '"><tpEmis>9</tpEmis></infNFe><Signature/></NFe>', null);
  perform pg_temp.chk(r->>'code' = 'CHAVE_INVALIDA', 'chave com tpEmis diferente do da nota é recusada');
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, '<NFe><infNFe Id="NFe' || ch || '"><tpEmis>1</tpEmis></infNFe><Signature/></NFe>', null);
  perform pg_temp.chk(r->>'code' = 'XML_INVALIDO', 'XML sem tpEmis 6 é recusado');
  x := '<NFe><infNFe Id="NFe' || ch || '"><tpEmis>6</tpEmis></infNFe><Signature/></NFe>';
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, x, null);
  select * into cont from public.loja_fiscal_contingencia where documento_id = c;
  perform pg_temp.chk((r->>'ok')::boolean and cont.xml_assinado = x and (select chave from public.loja_fiscal_documento where id = c) = ch, 'guarda o XML da SVC');

  -- fila e tentativas
  p := public.app_fiscal_contingencia_pendentes(a, 50);
  perform pg_temp.chk(exists (select 1 from jsonb_array_elements(p->'pendentes') e where e->>'documento_id' = c::text
    and (e->>'vencida')::boolean = false and (e->>'tp_emis')::int = 6), 'fila mostra a nota da SVC, nunca vencida');
  r := public.app_fiscal_documento_registrar_resultado(c, 'enviado', ch, null, 'Enviando à SVC-AN', null, null);
  perform pg_temp.chk((r->>'ok')::boolean and (select tentativas from public.loja_fiscal_contingencia where documento_id = c) = 1, 'conta tentativa da SVC');

  -- chamada antiga (4 parâmetros por nome) continua valendo para a NFC-e
  r := public.app_fiscal_contingencia_abrir(p_origem_documento_id => o65, p_dh_cont => now(), p_x_just => 'SEFAZ SP fora do ar no momento', p_prazo => now() + interval '1 day');
  perform pg_temp.chk((r->>'ok')::boolean and (select tp_emis from public.loja_fiscal_documento where id = (r->>'documento_id')::uuid) = 9, 'chamada antiga abre off-line (9)');

  -- ACL e assinatura
  perform pg_temp.chk(to_regprocedure('public.app_fiscal_contingencia_abrir(uuid,timestamptz,text,timestamptz)') is null, 'assinatura antiga removida');
  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_contingencia_abrir(uuid,timestamptz,text,timestamptz,smallint)', 'execute')
    and not has_function_privilege('anon', 'public.app_fiscal_contingencia_abrir(uuid,timestamptz,text,timestamptz,smallint)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_contingencia_abrir(uuid,timestamptz,text,timestamptz,smallint)', 'execute'), 'só o servidor abre contingência');
  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_contingencia_salvar_xml(uuid,text,text,text)', 'execute'), 'só o servidor guarda XML');
end $$;

do $$
declare f int := (select count(*) from t182_res where not ok); t int := (select count(*) from t182_res);
begin
  raise notice 'RESULTADO 182: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
