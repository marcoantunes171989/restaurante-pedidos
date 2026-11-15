-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 176 (cofre das credenciais fiscais)
--  Rodar em DEV/laboratório ou HML com 175 + 176 aplicadas. Tudo numa
--  transação com ROLLBACK: nada persiste (nem o segredo de teste no Vault).
--  Resultado: NOTICE 'PASS'/'FAIL'; com FAIL o script termina em erro.
-- ════════════════════════════════════════════════════════════
begin;

create temp table t176_res (ok boolean, msg text);
create temp table t176_ids (k text primary key, v text);
grant all on t176_res, t176_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t176_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F176 Loja A', 'F176A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id, permissoes_acoes)
  values ('F176 Admin A', 'f176.admin@teste.local', 'Gerente', true, array['admin'], a, '{}');
  insert into t176_ids values ('A', a::text);
end $$;

-- ── 1) Usuário logado (mesmo admin) NÃO toca no cofre ─────
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f176.admin@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t176_ids where k='A'); v_ok boolean;
begin
  begin perform public.app_fiscal_credencial_registrar(a, 'csc', 'homologacao', null, null, '1', null, null, 'CSC-X'); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'admin da loja não executa registrar (só servidor)');
  begin perform public.app_fiscal_credencial_segredo(a, 'csc', 'homologacao'); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'admin da loja não lê segredo');
  begin perform public.app_fiscal_credencial_revogar(gen_random_uuid()); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'admin da loja não revoga direto');
  begin perform count(*) from vault.decrypted_secrets; v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'usuário logado não lê o Vault');
end $$;

-- ── 2) Servidor (service_role) ────────────────────────────
reset role;
set local role service_role;
do $$
declare a bigint := (select v::bigint from t176_ids where k='A'); r jsonb; id1 uuid; id2 uuid;
begin
  r := public.app_fiscal_credencial_registrar(a, 'certificado_a1', null, 'F176 LTDA', '12345678000195', null, now() - interval '1 day', now() - interval '1 minute', '{"pfx":"VENCIDO"}');
  perform pg_temp.chk(r->>'code' = 'CERTIFICADO_VENCIDO', 'recusa certificado vencido');
  r := public.app_fiscal_credencial_registrar(a, 'certificado_a1', 'homologacao', 'F176 LTDA', '12345678000195', null, now(), now() + interval '1 year', 'pfx');
  perform pg_temp.chk(r->>'code' = 'AMBIENTE_NAO_SE_APLICA', 'certificado vale para os dois ambientes (sem ambiente)');
  r := public.app_fiscal_credencial_registrar(a, 'csc', null, null, null, '1', null, null, 'CSC-X');
  perform pg_temp.chk(r->>'code' = 'AMBIENTE_OBRIGATORIO', 'CSC exige ambiente');
  r := public.app_fiscal_credencial_registrar(a, 'certificado_a1', null, 'F176 LTDA', '12345678000195', null, now(), now() + interval '1 year', '{"pfx":"AAAA","senha":"s1"}');
  perform pg_temp.chk((r->>'ok')::boolean, 'registra certificado no cofre');
  id1 := (r->>'id')::uuid;
  r := public.app_fiscal_credencial_segredo(a, 'certificado_a1');
  perform pg_temp.chk((r->>'segredo') = '{"pfx":"AAAA","senha":"s1"}', 'servidor lê o segredo decifrado');
  r := public.app_fiscal_credencial_registrar(a, 'certificado_a1', null, 'F176 LTDA', '12345678000195', null, now(), now() + interval '2 years', '{"pfx":"BBBB","senha":"s2"}');
  id2 := (r->>'id')::uuid;
  perform pg_temp.chk((select status from public.loja_fiscal_credencial where id = id1) = 'substituido', 'troca de certificado mantém o anterior como histórico');
  r := public.app_fiscal_credencial_segredo(a, 'certificado_a1');
  perform pg_temp.chk(r->>'id' = id2::text and r->>'segredo' like '%BBBB%', 'segredo ativo é o do certificado novo');
  r := public.app_fiscal_credencial_registrar(a, 'csc', 'homologacao', null, null, '000001', null, null, 'CSC-HOMOLOG-TESTE');
  perform pg_temp.chk((r->>'ok')::boolean, 'registra CSC de homologação');
  r := public.app_fiscal_credencial_segredo(a, 'csc', 'producao');
  perform pg_temp.chk(r->>'code' = 'SEM_CREDENCIAL', 'CSC de produção não existe (ambientes separados)');
  r := public.app_fiscal_credencial_revogar(id2);
  perform pg_temp.chk((r->>'ok')::boolean, 'revoga certificado');
  r := public.app_fiscal_credencial_segredo(a, 'certificado_a1');
  perform pg_temp.chk(r->>'code' = 'SEM_CREDENCIAL', 'certificado revogado não é mais entregue');
end $$;

-- ── 3) Tela (175) continua sem expor segredo ──────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f176.admin@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t176_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_credenciais_resumo(a);
  perform pg_temp.chk(jsonb_array_length(r->'credenciais') = 1 and r::text not like '%CSC-HOMOLOG%' and r::text not like '%vault%', 'resumo da tela mostra só metadados (CSC ativo), sem segredo');
end $$;

reset role;
do $$
declare f int := (select count(*) from t176_res where not ok); t int := (select count(*) from t176_res);
begin
  raise notice 'RESULTADO 176: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;

rollback;
