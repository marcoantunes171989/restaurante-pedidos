-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 181 (lista com contingência). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t181_res (ok boolean, msg text);
create temp table t181_ids (k text primary key, v text);
grant all on t181_res, t181_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t181_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; b bigint; o uuid; r jsonb;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F181 A', 'F181A') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('F181 B', 'F181B') returning id into b;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F181 Caixa', 'f181.caixa@teste.local', 'Operador', true, array['cashier'], a);
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 65, 1, 'homologacao', 21);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 20, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o;
  r := public.app_fiscal_contingencia_abrir(o, now() - interval '2 days', 'SEFAZ fora do ar no momento', now() - interval '1 day');
  insert into t181_ids values ('A', a::text), ('B', b::text), ('O', o::text), ('C', r->>'documento_id');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f181.caixa@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t181_ids where k='A'); b bigint := (select v::bigint from t181_ids where k='B');
        o text := (select v from t181_ids where k='O'); c text := (select v from t181_ids where k='C'); r jsonb; xo jsonb; xc jsonb;
begin
  r := public.app_fiscal_listar_documentos(a);
  select x into xo from jsonb_array_elements(r->'documentos') x where x->>'id' = o;
  select x into xc from jsonb_array_elements(r->'documentos') x where x->>'id' = c;
  perform pg_temp.chk((xc->>'tp_emis')::int = 9 and (xc->'contingencia'->>'numero_origem')::int = 20, 'nota off-line mostra tp_emis 9 e a nota de origem');
  perform pg_temp.chk((xc->'contingencia'->>'vencida')::boolean and (xc->'contingencia'->>'assinada')::boolean = false, 'mostra prazo vencido e se já foi assinada');
  perform pg_temp.chk((xo->>'contingencia_numero')::int = 21 and xo->'contingencia' = 'null'::jsonb, 'nota de origem mostra o número da off-line');
  perform pg_temp.chk(r::text not like '%xml_assinado%' and r::text not like '%<NFe%', 'não devolve XML');
  r := public.app_fiscal_listar_documentos(b);
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'continua sem acesso a outra loja');
end $$;
reset role;

do $$
declare f int := (select count(*) from t181_res where not ok); t int := (select count(*) from t181_res);
begin
  raise notice 'RESULTADO 181: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
