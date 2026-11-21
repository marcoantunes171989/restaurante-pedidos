-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 187 (pedidos/valor na emissão; nota cancelada
--  comprova a homologação). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t187_res (ok boolean, msg text);
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t187_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;

do $$
declare a bigint; d uuid; r jsonb; f text[];
begin
  insert into public.tab_lojas (nome, prefixo, documento) values ('F187 A', 'F187A', '11222333000181') returning id into a;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, qtd_itens, pedidos_ids)
    values (a, 65, 1, 1, 'homologacao', gen_random_uuid(), 'reservado', 46.90, 2, array['P1', 'P2']) returning id into d;
  r := public.app_fiscal_documento_para_emissao(d);
  perform pg_temp.chk((r->'documento'->'pedidos_ids') = '["P1", "P2"]'::jsonb, 'emissão recebe os pedidos da nota');
  perform pg_temp.chk((r->'documento'->>'valor_total')::numeric = 46.90 and (r->'documento'->>'qtd_itens')::int = 2, 'emissão recebe o valor e a quantidade');
  perform pg_temp.chk(r->'documento'->>'rascunho' is not null and r->'documento'->>'tp_emis' = '1', 'campos de antes continuam');

  f := public.app_fiscal_producao_faltas(a, true, false);
  perform pg_temp.chk('Pelo menos 1 NFC-e autorizada em homologação.' = any(f), 'sem nota autorizada: falta');
  update public.loja_fiscal_documento set status = 'rejeitado' where id = d;
  f := public.app_fiscal_producao_faltas(a, true, false);
  perform pg_temp.chk('Pelo menos 1 NFC-e autorizada em homologação.' = any(f), 'rejeitada não conta');
  update public.loja_fiscal_documento set status = 'cancelado' where id = d;
  f := public.app_fiscal_producao_faltas(a, true, false);
  perform pg_temp.chk(not ('Pelo menos 1 NFC-e autorizada em homologação.' = any(f)), 'cancelada (já foi autorizada) conta');

  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_documento_para_emissao(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_documento_para_emissao(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.app_fiscal_producao_faltas(bigint,boolean,boolean)', 'execute'), 'permissões');
end $$;

do $$
declare f int := (select count(*) from t187_res where not ok); t int := (select count(*) from t187_res);
begin
  raise notice 'RESULTADO 187: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
