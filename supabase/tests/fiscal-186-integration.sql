-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 186 (trava da produção). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t186_res (ok boolean, msg text);
create temp table t186_ids (k text primary key, v text);
grant all on t186_res, t186_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t186_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

-- tenta mudar o ambiente; devolve o erro (ou 'ok')
create function pg_temp.tenta(p_loja bigint, p_amb text) returns text language plpgsql as $$
begin
  update public.loja_fiscal_emitente set nfce_ambiente = p_amb where loja_id = p_loja;
  return 'ok';
exception when others then return sqlerrm;
end $$;

do $$
declare a bigint; r text; j jsonb;
begin
  insert into public.tab_lojas (nome, prefixo, documento) values ('F186 A', 'F186A', '11222333000181') returning id into a;
  insert into public.loja_fiscal_emitente (loja_id, razao_social, uf, crt, nfce_habilitada, nfe_habilitada, nfce_ambiente)
    values (a, 'F186 Ltda', 'SP', '1', true, false, 'homologacao');
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F186 Admin', 'f186.admin@teste.local', 'Gerente', true, array['admin'], a);
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F186 Caixa', 'f186.caixa@teste.local', 'Operador', true, array['cashier'], a);

  r := pg_temp.tenta(a, 'producao');
  perform pg_temp.chk(r like 'PRODUCAO_NAO_LIBERADA%' and r like '%Certificado A1%' and r like '%NFC-e autorizada em homologação%'
    and r like '%Série da NFC-e em produção%' and r like '%CSC de produção%', 'sem nada: bloqueia e lista tudo que falta');
  perform pg_temp.chk((select nfce_ambiente from public.loja_fiscal_emitente where loja_id = a) = 'homologacao', 'continua em homologação');

  insert into public.loja_fiscal_credencial (loja_id, tipo, status, validade_fim, vault_secret_id) values (a, 'certificado_a1', 'ativo', now() + interval '300 days', gen_random_uuid());
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 65, 1, 'producao', 1);
  insert into public.loja_fiscal_credencial (loja_id, tipo, ambiente, status, id_csc, vault_secret_id) values (a, 'csc', 'producao', 'ativo', '1', gen_random_uuid());
  r := pg_temp.tenta(a, 'producao');
  perform pg_temp.chk(r like 'PRODUCAO_NAO_LIBERADA%' and r not like '%Certificado%' and r like '%NFC-e autorizada em homologação%', 'sem nota autorizada em homologação: bloqueia');

  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 1, 'homologacao', gen_random_uuid(), 'rejeitado', 10);
  perform pg_temp.chk(pg_temp.tenta(a, 'producao') like 'PRODUCAO_NAO_LIBERADA%', 'nota rejeitada não conta');
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 2, 'homologacao', gen_random_uuid(), 'autorizado', 10);
  r := pg_temp.tenta(a, 'producao');
  perform pg_temp.chk(r = 'ok' and (select nfce_ambiente from public.loja_fiscal_emitente where loja_id = a) = 'producao', 'tudo pronto: entra em produção');

  r := pg_temp.tenta(a, 'producao');
  update public.loja_fiscal_emitente set razao_social = 'F186 Ltda ME' where loja_id = a;
  perform pg_temp.chk(r = 'ok', 'já em produção: salvar o cadastro continua funcionando');

  begin
    update public.loja_fiscal_emitente set nfe_habilitada = true where loja_id = a;
    r := 'ok';
  exception when others then r := sqlerrm; end;
  perform pg_temp.chk(r like 'PRODUCAO_NAO_LIBERADA%' and r like '%NF-e autorizada em homologação%' and r not like '%NFC-e autorizada%', 'em produção, habilitar a NF-e exige homologar a NF-e');

  perform pg_temp.chk(pg_temp.tenta(a, 'homologacao') = 'ok', 'voltar para homologação é livre');
  update public.loja_fiscal_credencial set validade_fim = now() - interval '1 day' where loja_id = a and tipo = 'certificado_a1';
  perform pg_temp.chk(pg_temp.tenta(a, 'producao') like '%Certificado A1%', 'certificado vencido bloqueia a volta para produção');
  update public.loja_fiscal_credencial set validade_fim = now() + interval '300 days' where loja_id = a and tipo = 'certificado_a1';

  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_producao_faltas(bigint,boolean,boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.app_fiscal_producao_liberada(bigint)', 'execute')
    and not has_function_privilege('anon', 'public.app_fiscal_producao_liberada(bigint)', 'execute'), 'permissões');
  insert into t186_ids values ('A', a::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f186.admin@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t186_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_producao_liberada(a);
  perform pg_temp.chk((r->>'ok')::boolean and (r->>'liberada')::boolean and jsonb_array_length(r->'faltas') = 0, 'admin vê: liberada');
end $$;
select set_config('request.jwt.claims', '{"email":"f186.caixa@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t186_ids where k='A');
begin
  perform pg_temp.chk(public.app_fiscal_producao_liberada(a)->>'code' = 'FORBIDDEN', 'caixa não consulta a liberação');
end $$;
reset role;

do $$
declare f int := (select count(*) from t186_res where not ok); t int := (select count(*) from t186_res);
begin
  raise notice 'RESULTADO 186: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;
