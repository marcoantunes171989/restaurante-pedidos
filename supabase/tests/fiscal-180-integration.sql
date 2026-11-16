-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 180 (contingência off-line NFC-e). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t180_res (ok boolean, msg text);
create temp table t180_ids (k text primary key, v text);
grant all on t180_res, t180_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t180_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; o uuid; aut uuid; nfe uuid;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F180 A', 'F180A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F180 Caixa', 'f180.caixa@teste.local', 'Operador', true, array['cashier'], a);
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 65, 1, 'homologacao', 21);
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 55, 1, 'homologacao', 5);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, qtd_itens, pedidos_ids, rascunho)
    values (a, 65, 1, 20, 'homologacao', gen_random_uuid(), 'enviado', 60.90, 1, array['P1'], '{"dados":{"x":1}}') returning id into o;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status)
    values (a, 65, 1, 19, 'homologacao', gen_random_uuid(), 'autorizado') returning id into aut;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status)
    values (a, 55, 1, 4, 'homologacao', gen_random_uuid(), 'erro') returning id into nfe;
  insert into t180_ids values ('A', a::text), ('O', o::text), ('AUT', aut::text), ('NFE', nfe::text);
end $$;

-- Usuário comum NÃO acessa nada disso.
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f180.caixa@teste.local"}', true);
do $$
declare o uuid := (select v::uuid from t180_ids where k='O');
begin
  begin
    perform public.app_fiscal_contingencia_abrir(o, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
    perform pg_temp.chk(false, 'authenticated não abre contingência');
  exception when insufficient_privilege then perform pg_temp.chk(true, 'authenticated não abre contingência');
  end;
  begin
    perform 1 from public.loja_fiscal_contingencia;
    perform pg_temp.chk(false, 'authenticated não lê a tabela');
  exception when insufficient_privilege then perform pg_temp.chk(true, 'authenticated não lê a tabela');
  end;
end $$;
reset role;

set local role service_role;
do $$
declare a bigint := (select v::bigint from t180_ids where k='A');
        o uuid := (select v::uuid from t180_ids where k='O');
        aut uuid := (select v::uuid from t180_ids where k='AUT');
        nfe uuid := (select v::uuid from t180_ids where k='NFE');
        r jsonb; r2 jsonb; c uuid; ch text; chErrada text; xml text;
begin
  r := public.app_fiscal_contingencia_abrir(nfe, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
  perform pg_temp.chk(r->>'code' = 'SO_NFCE', 'NF-e não entra em contingência off-line');
  r := public.app_fiscal_contingencia_abrir(aut, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
  perform pg_temp.chk(r->>'code' = 'STATUS_NAO_PERMITE', 'nota autorizada não abre contingência');
  r := public.app_fiscal_contingencia_abrir(o, now(), 'curta', now() + interval '1 day');
  perform pg_temp.chk(r->>'code' = 'JUSTIFICATIVA_INVALIDA', 'justificativa < 15 recusada');
  r := public.app_fiscal_contingencia_abrir(o, now(), 'SEFAZ fora do ar no momento', now() - interval '1 hour');
  perform pg_temp.chk(r->>'code' = 'PRAZO_INVALIDO', 'prazo antes da entrada recusado');

  r := public.app_fiscal_contingencia_abrir(o, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
  c := (r->>'documento_id')::uuid;
  perform pg_temp.chk((r->>'ok')::boolean and (r->>'numero')::int = 21 and (r->>'serie')::int = 1, 'reserva o número NOVO (21) na mesma série');
  perform pg_temp.chk((select tp_emis = 9 and status = 'contingencia' and valor_total = 60.90 and pedidos_ids = array['P1'] from public.loja_fiscal_documento where id = c), 'nota off-line tp_emis 9 com os dados da venda');
  perform pg_temp.chk((select proximo_numero from public.loja_fiscal_serie where loja_id = a and modelo = 65) = 22, 'série avança');
  perform pg_temp.chk((select status from public.loja_fiscal_documento where id = o) = 'enviado', 'nota de origem fica como estava (consultar depois)');
  r2 := public.app_fiscal_contingencia_abrir(o, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
  perform pg_temp.chk((r2->>'reutilizado')::boolean and (r2->>'documento_id')::uuid = c, 'repetir devolve a mesma contingência');
  perform pg_temp.chk((select proximo_numero from public.loja_fiscal_serie where loja_id = a and modelo = 65) = 22, 'repetir não gasta número');
  r := public.app_fiscal_contingencia_abrir(c, now(), 'SEFAZ fora do ar no momento', now() + interval '1 day');
  perform pg_temp.chk(r->>'code' = 'JA_E_CONTINGENCIA', 'contingência de contingência recusada');

  r := public.app_fiscal_documento_para_emissao(o);
  perform pg_temp.chk((r->'documento'->>'contingencia_documento_id')::uuid = c and (r->'documento'->>'tp_emis')::int = 1, 'origem informa a contingência aberta');

  ch := '3526111234567800019565001000000021923456789' || '0';
  chErrada := '3526111234567800019565001000000021123456789' || '0';
  xml := '<NFe><infNFe Id="NFe' || ch || '"><ide><tpEmis>9</tpEmis></ide></infNFe><Signature/></NFe>';
  r := public.app_fiscal_contingencia_salvar_xml(c, chErrada, xml, 'qr');
  perform pg_temp.chk(r->>'code' = 'CHAVE_INVALIDA', 'chave sem tpEmis 9 recusada');
  r := public.app_fiscal_contingencia_salvar_xml(c, '3526111234567800019565001000000022923456789' || '0', xml, 'qr');
  perform pg_temp.chk(r->>'code' = 'CHAVE_INVALIDA', 'chave com outro número recusada');
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, replace(xml, '<tpEmis>9', '<tpEmis>1'), 'qr');
  perform pg_temp.chk(r->>'code' = 'XML_INVALIDO', 'XML sem tpEmis 9 recusado');
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, xml, 'https://qr');
  perform pg_temp.chk((r->>'ok')::boolean and (select chave from public.loja_fiscal_documento where id = c) = ch, 'guarda o XML assinado e a chave');
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, xml || ' ', 'qr');
  perform pg_temp.chk(r->>'code' = 'XML_JA_ASSINADO', 'não troca o XML já assinado');

  r := public.app_fiscal_contingencia_para_transmitir(c);
  perform pg_temp.chk(r->'documento'->>'xml_assinado' = xml and (r->'documento'->>'origem_documento_id')::uuid = o, 'servidor lê o XML para transmitir');
  r := public.app_fiscal_contingencia_pendentes(a);
  perform pg_temp.chk(jsonb_array_length(r->'pendentes') = 1 and (r->'pendentes'->0->>'assinada')::boolean, 'aparece na fila de pendentes');

  r := public.app_fiscal_documento_registrar_resultado(c, 'rejeitado', ch, 999, 'Rejeição de teste', null, null);
  perform pg_temp.chk((r->>'ok')::boolean and (select tentativas from public.loja_fiscal_contingencia where documento_id = c) = 1, 'contingência → rejeitada conta tentativa');
  r := public.app_fiscal_contingencia_salvar_xml(c, ch, xml || ' ', 'qr');
  perform pg_temp.chk((r->>'ok')::boolean and (select status from public.loja_fiscal_documento where id = c) = 'contingencia', 'rejeitada: refaz com a mesma chave');
  r := public.app_fiscal_contingencia_salvar_xml(c, '3526111234567800019565001000000021987654321' || '0', xml, 'qr');
  perform pg_temp.chk(r->>'code' in ('XML_JA_ASSINADO', 'CHAVE_DIFERENTE'), 'refazer não troca a chave');
  r := public.app_fiscal_documento_registrar_resultado(c, 'autorizado', ch, 100, 'Autorizado', '135260000000099', now(), '<nfeProc><protNFe/></nfeProc>');
  perform pg_temp.chk((r->>'ok')::boolean, 'contingência → autorizada');
  r := public.app_fiscal_contingencia_pendentes(a);
  perform pg_temp.chk(jsonb_array_length(r->'pendentes') = 0, 'autorizada sai da fila');

  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where documento_id in (o, c)
                        and tipo in ('CONTINGENCIA_ABERTA', 'RESERVADO_CONTINGENCIA', 'CONTINGENCIA_ASSINADA', 'CONTINGENCIA_REFEITA')) = 4, 'trilha registra abertura, reserva, assinatura e refação');
end $$;
reset role;

-- Nem o dono do banco apaga (trigger), mesmo sem RLS no caminho.
do $$
begin
  begin
    delete from public.loja_fiscal_contingencia;
    perform pg_temp.chk(false, 'nota em contingência não pode ser apagada');
  exception when others then perform pg_temp.chk(sqlstate = 'P0001' and sqlerrm like '%pode ser apagada%', 'nota em contingência não pode ser apagada');
  end;
end $$;

do $$
declare f int := (select count(*) from t180_res where not ok); t int := (select count(*) from t180_res);
begin
  raise notice 'RESULTADO 180: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
