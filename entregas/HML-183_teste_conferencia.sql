-- PEDIDO PRIME — HML — teste opcional da 183 (não grava nada: termina em ROLLBACK)
-- Resultado esperado no fim: "RESULTADO 183: 17 testes, 0 falha(s)"

-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 183 (EPEC da NF-e). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t183_res (ok boolean, msg text);
create temp table t183_ids (k text primary key, v text);
grant all on t183_res, t183_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t183_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; o55 uuid; o65 uuid; r jsonb; c uuid; d public.loja_fiscal_documento%rowtype; ch text; x text; px text; p jsonb; t jsonb;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F183 A', 'F183A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F183 Caixa', 'f183.gestor@teste.local', 'Operador', true, array['cashier'], a);
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 55, 1, 'homologacao', 31), (a, 65, 1, 'homologacao', 61);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 55, 1, 30, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o55;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 60, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o65;

  r := public.app_fiscal_contingencia_abrir(o65, now(), 'SEFAZ SP fora do ar no momento', now() + interval '7 days', 4::smallint);
  perform pg_temp.chk(r->>'code' = 'SVC_SO_NFE', 'EPEC só para NF-e');
  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', null, 4::smallint);
  perform pg_temp.chk(r->>'code' = 'PRAZO_INVALIDO', 'EPEC exige prazo');

  r := public.app_fiscal_contingencia_abrir(o55, now(), 'SEFAZ SP fora do ar no momento', now() + interval '168 hours', 4::smallint);
  c := (r->>'documento_id')::uuid;
  select * into d from public.loja_fiscal_documento where id = c;
  perform pg_temp.chk((r->>'ok')::boolean and d.tp_emis = 4 and d.numero = 31, 'EPEC: número novo, tp_emis 4');

  ch := '352611' || '12345678000195' || '55' || '001' || '000000031' || '4' || '12345678' || '0';
  r := public.app_fiscal_contingencia_registrar_epec(c, '891260000000001', now(), '<procEventoNFe/>', 136, 'ok');
  perform pg_temp.chk(r->>'code' = 'NAO_ASSINADA', 'EPEC só depois da NF-e assinada');
  x := '<NFe><infNFe Id="NFe' || ch || '"><tpEmis>4</tpEmis></infNFe><Signature/></NFe>';
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, x, null);
  perform pg_temp.chk((r->>'ok')::boolean, 'guarda a NF-e tpEmis 4');

  px := '<procEventoNFe versao="1.00"><evento><infEvento><chNFe>' || ch || '</chNFe><tpEvento>110140</tpEvento></infEvento></evento></procEventoNFe>';
  r := public.app_fiscal_contingencia_registrar_epec(c, '12', now(), px, 136, 'ok');
  perform pg_temp.chk(r->>'code' = 'PROTOCOLO_INVALIDO', 'protocolo do EPEC tem 15 dígitos');
  r := public.app_fiscal_contingencia_registrar_epec(c, '891260000000001', now(), replace(px, '110140', '110111'), 136, 'ok');
  perform pg_temp.chk(r->>'code' = 'XML_INVALIDO', 'XML precisa ser do evento 110140 desta chave');
  r := public.app_fiscal_contingencia_registrar_epec(c, '891260000000001', now(), px, 136, 'Evento registrado');
  perform pg_temp.chk((r->>'ok')::boolean and (select epec_protocolo from public.loja_fiscal_contingencia where documento_id = c) = '891260000000001', 'guarda o EPEC');
  r := public.app_fiscal_contingencia_registrar_epec(c, '891260000000001', now(), px, 136, 'Evento registrado');
  perform pg_temp.chk((r->>'reutilizado')::boolean, 'repetir com o mesmo protocolo só confirma');
  r := public.app_fiscal_contingencia_registrar_epec(c, '891260000000002', now(), px, 136, 'Evento registrado');
  perform pg_temp.chk(r->>'code' = 'EPEC_JA_REGISTRADO', 'não troca o protocolo do EPEC');
  r := public.app_fiscal_contingencia_registrar_epec(o55, '891260000000001', now(), px, 136, 'ok');
  perform pg_temp.chk(r->>'code' = 'NAO_E_CONTINGENCIA', 'nota de origem não recebe EPEC');

  t := public.app_fiscal_contingencia_para_transmitir(c);
  perform pg_temp.chk(t->'documento'->>'epec_protocolo' = '891260000000001' and (t->'documento'->>'tp_emis')::int = 4, 'servidor vê o EPEC ao transmitir');
  p := public.app_fiscal_contingencia_pendentes(a, 50);
  perform pg_temp.chk(exists (select 1 from jsonb_array_elements(p->'pendentes') e where e->>'documento_id' = c::text and (e->>'epec')::boolean), 'fila marca o EPEC');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where documento_id = c and tipo = 'EPEC_REGISTRADO') = 1, 'histórico registra o EPEC uma vez');

  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_contingencia_registrar_epec(uuid,text,timestamptz,text,integer,text)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_contingencia_registrar_epec(uuid,text,timestamptz,text,integer,text)', 'execute'), 'só o servidor registra EPEC');
  insert into t183_ids values ('A', a::text), ('C', c::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f183.gestor@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t183_ids where k='A'); c text := (select v from t183_ids where k='C'); r jsonb; xc jsonb;
begin
  r := public.app_fiscal_listar_documentos(a);
  select x into xc from jsonb_array_elements(r->'documentos') x where x->>'id' = c;
  perform pg_temp.chk(xc->'contingencia'->>'epec_protocolo' = '891260000000001', 'lista mostra o protocolo do EPEC');
  perform pg_temp.chk(r::text not like '%procEventoNFe%' and r::text not like '%<NFe%', 'lista não devolve XML');
end $$;
reset role;

do $$
declare f int := (select count(*) from t183_res where not ok); t int := (select count(*) from t183_res);
begin
  raise notice 'RESULTADO 183: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
