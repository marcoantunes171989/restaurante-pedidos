-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 179 (lista de notas). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t179_res (ok boolean, msg text);
create temp table t179_ids (k text primary key, v text);
grant all on t179_res, t179_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t179_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; b bigint; d uuid;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F179 A', 'F179A') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('F179 B', 'F179B') returning id into b;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F179 Caixa', 'f179.caixa@teste.local', 'Operador', true, array['cashier'], a);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, protocolo, chave, valor_total)
    values (a, 55, 1, 1, 'homologacao', gen_random_uuid(), 'autorizado', '135260000000001', '35261112345678000195550010000000011234567890', 44) returning id into d;
  insert into public.loja_fiscal_evento_sefaz (documento_id, loja_id, tp_evento, n_seq, status, protocolo, xml, sha256)
    values (d, a, '110110', 1, 'registrado', '135260000000002', '<x/>', repeat('a', 64));
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key) values (a, 65, 1, 1, 'homologacao', gen_random_uuid());
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key) values (b, 65, 1, 1, 'homologacao', gen_random_uuid());
  insert into t179_ids values ('A', a::text), ('B', b::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f179.caixa@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t179_ids where k='A'); b bigint := (select v::bigint from t179_ids where k='B'); r jsonb;
begin
  r := public.app_fiscal_listar_documentos(a);
  perform pg_temp.chk(jsonb_array_length(r->'documentos') = 2, 'lista as 2 notas da própria loja');
  perform pg_temp.chk((select bool_or((x->>'cartas_correcao')::int = 1 and x->'ultimo_evento'->>'tipo' = '110110') from jsonb_array_elements(r->'documentos') x), 'mostra a CC-e registrada');
  perform pg_temp.chk(r::text not like '%<x/>%', 'não devolve XML');
  r := public.app_fiscal_listar_documentos(b);
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'não lista notas de outra loja');
  r := public.app_fiscal_listar_documentos(a, 1);
  perform pg_temp.chk(jsonb_array_length(r->'documentos') = 1, 'respeita o limite');
end $$;

reset role;
do $$
declare f int := (select count(*) from t179_res where not ok); t int := (select count(*) from t179_res);
begin
  raise notice 'RESULTADO 179: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
