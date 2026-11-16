-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 188 (corrigir e emitir de novo a rejeitada).
--  Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t188_res (ok boolean, msg text);
create temp table t188_ids (k text primary key, v text);
grant all on t188_res, t188_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t188_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; d uuid; d2 uuid; d3 uuid; v jsonb;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F188 A', 'F188A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F188 Admin', 'f188.admin@teste.local', 'Gerente', true, array['admin'], a);
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F188 Caixa', 'f188.caixa@teste.local', 'Operador', true, array['cashier'], a);
  v := '{"apto": true, "pedidosIds": ["P1"], "totais": {"vNF": 30, "vProd": 30}, "pagamentos": [{"meio": "17", "valor": 30}], "pendencias": [],
         "itens": [{"seq": 1, "nome": "X", "valorBruto": 30, "quantidade": 1, "produtoId": 10, "fiscal": {"ncm": "00000000"}, "pendencias": []}]}';
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, chave, cstat, xmotivo, rascunho)
    values (a, 65, 1, 5, 'homologacao', gen_random_uuid(), 'rejeitado', 30, '35261111222333000181650010000000051000000050', 778, 'Rejeicao: NCM inexistente',
            jsonb_build_object('venda', v, 'dados', '{"chave":"x"}'::jsonb)) returning id into d;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, cstat, rascunho)
    values (a, 65, 1, 6, 'homologacao', gen_random_uuid(), 'rejeitado', 30, 302, jsonb_build_object('venda', v)) returning id into d2;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, rascunho)
    values (a, 65, 1, 7, 'homologacao', gen_random_uuid(), 'autorizado', 30, jsonb_build_object('venda', v)) returning id into d3;
  insert into t188_ids values ('A', a::text), ('D', d::text), ('D2', d2::text), ('D3', d3::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f188.caixa@teste.local"}', true);
do $$
declare d uuid := (select v::uuid from t188_ids where k = 'D');
begin
  perform pg_temp.chk(public.app_fiscal_documento_venda(d)->>'code' = 'NAO_ENCONTRADO', 'caixa não lê a venda da nota (só quem configura)');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d, '{}'::jsonb)->>'code' = 'NAO_ENCONTRADO', 'caixa não refaz');
end $$;

select set_config('request.jwt.claims', '{"email":"f188.admin@teste.local"}', true);
do $$
declare d uuid := (select v::uuid from t188_ids where k = 'D'); d2 uuid := (select v::uuid from t188_ids where k = 'D2'); d3 uuid := (select v::uuid from t188_ids where k = 'D3');
  r jsonb; v jsonb; nova jsonb;
begin
  r := public.app_fiscal_documento_venda(d);
  perform pg_temp.chk((r->>'ok')::boolean and (r->'venda'->'totais'->>'vNF')::numeric = 30 and (r->>'cstat')::int = 778, 'admin lê a venda e o motivo da rejeição');
  v := r->'venda';
  nova := jsonb_set(v, '{itens,0,fiscal}', '{"ncm": "21069090"}');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d, jsonb_set(nova, '{totais,vNF}', '25'))->>'code' = 'VENDA_DIVERGENTE', 'valor diferente: recusa');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d, jsonb_set(nova, '{itens,0,quantidade}', '2'))->>'code' = 'VENDA_DIVERGENTE', 'item diferente: recusa');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d, jsonb_set(nova, '{apto}', 'false'))->>'code' = 'VENDA_COM_PENDENCIA', 'ainda com pendência: recusa');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d2, nova)->>'code' = 'NUMERO_USADO', 'uso denegado (302): não refaz');
  perform pg_temp.chk(public.app_fiscal_documento_refazer(d3, nova)->>'code' = 'STATUS_NAO_PERMITE', 'autorizada: não refaz');
  r := public.app_fiscal_documento_refazer(d, nova);
  perform pg_temp.chk((r->>'ok')::boolean and (r->>'numero')::int = 5, 'rejeitada com a parte fiscal corrigida: refaz');
end $$;
reset role;

do $$
declare d uuid := (select v::uuid from t188_ids where k = 'D'); x public.loja_fiscal_documento%rowtype;
begin
  select * into x from public.loja_fiscal_documento where id = d;
  perform pg_temp.chk(x.status = 'reservado' and x.chave is null and not (x.rascunho ? 'dados') and x.rascunho->'venda'->'itens'->0->'fiscal'->>'ncm' = '21069090',
    'volta a reservada, sem chave e sem dados do XML, com a venda corrigida');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where documento_id = d and tipo = 'REFEITO' and payload->>'cStat_rejeicao' = '778') = 1, 'histórico guarda o motivo da rejeição');
  perform pg_temp.chk(not has_function_privilege('anon', 'public.app_fiscal_documento_refazer(uuid,jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.app_fiscal_documento_refazer(uuid,jsonb)', 'execute'), 'permissões');
end $$;

do $$
declare f int := (select count(*) from t188_res where not ok); t int := (select count(*) from t188_res);
begin
  raise notice 'RESULTADO 188: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
