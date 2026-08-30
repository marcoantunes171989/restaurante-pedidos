-- ════════════════════════════════════════════════════════════
--  130 — Reparo de ACL drift: public.app_is_super() / public.app_loja_id()
--
--  CAUSA RAIZ (auditoria Gate 8.84B, READ-ONLY do catálogo em HML): as
--  migrations 096_rls_helpers_por_email.sql e
--  097_consistencia_leitura_rls.sql concederam EXECUTE a anon,
--  authenticated e service_role em ambas as funções
--  ('grant execute on function ... to anon, authenticated,
--  service_role;'), mas o catálogo real em HML mostra:
--
--    security_definer      = true            (correto, não tocado)
--    function_settings      = {search_path=public} (correto, não tocado)
--    anon_execute           = false           (correto — sem consumidor legítimo)
--    authenticated_execute  = false           (DRIFT — deveria ser true)
--    service_role_execute   = false           (necessidade UNKNOWN — fora de escopo)
--    public_execute         = false           (correto)
--    acl_real               = {postgres=X/postgres}
--
--  Nenhuma migration deste repositório (047-129) executa REVOKE de
--  app_is_super()/app_loja_id() para nenhum role — o drift ocorreu fora
--  do controle de versão (mesma classe de drift já reparada pelas
--  migrations 125/126/127 (RPCs de sessão/dispositivo) e 128
--  (pub_fidelidade_regra); nenhuma delas inclui estes dois helpers em
--  seu escopo). Não se afirma como fato que um operador executou
--  REVOKE manual — a origem exata do drift permanece desconhecida e
--  fora do controle de versão.
--
--  IMPACTO CONFIRMADO EM RUNTIME (HML, migration 129 já aplicada): as
--  policies tenant-aware de public.tab_impressoes_cozinha
--  ("tab_impressoes_cozinha_select_tenant" e demais, TO authenticated)
--  chamam public.app_is_super()/public.app_loja_id() diretamente na
--  avaliação da RLS como o próprio role authenticated — SELECT em
--  tab_impressoes_cozinha responde HTTP 403 / PostgreSQL 42501
--  ("permission denied for function app_loja_id"), mesmo com
--  authenticated possuindo SELECT/INSERT/UPDATE na tabela.
--
--  DECISÃO DE ACL (Gate 8.84B): somente authenticated recebe EXECUTE.
--  anon: sem consumidor legítimo comprovado (nenhuma policy TO anon,
--  nenhuma RPC pub_* pública, nenhuma RPC SECURITY INVOKER pública
--  dependem destes helpers) — permanece fechado. service_role:
--  necessidade não comprovada por nenhum consumidor real no código
--  versionado (toda RPC que usa os helpers é SECURITY DEFINER,
--  executando como o owner — não precisa de EXECUTE direto do
--  caller) — NÃO TOCADO nesta migration, em nenhum sentido (nem
--  GRANT, nem REVOKE), preservando o que já estiver em cada ambiente.
--  PUBLIC: fechado, consistente com o padrão das migrations 121-129.
--
--  ESCOPO — forward-fix P0 mínimo, SOMENTE ACL de
--  public.app_is_super() e public.app_loja_id(). NÃO altera corpo/
--  assinatura/retorno/SECURITY DEFINER/search_path/owner de nenhuma
--  das duas funções (definidas na migration 097, intocada aqui), NÃO
--  toca public.app_caller_email(), public.app_sessao_iniciar(),
--  public.app_sessao_encerrar(), public.pub_fidelidade_regra(bigint)
--  nem qualquer outra RPC pub_* (pub_buscar_cliente,
--  pub_pedidos_cliente, pub_saldo_fidelidade, pub_upsert_cliente,
--  pub_criar_pedido, pub_criar_pedido_v2), NÃO altera nenhuma tabela
--  (incluindo tab_impressoes_cozinha, tab_impressoras), NÃO altera
--  nenhuma policy RLS, NÃO edita as migrations 047/096/097/125/126/
--  127/128/129, NÃO cria a Migration 131 (pedido público seguro,
--  deslocada da antiga numeração 130). Migration 119 permanece
--  pausada (docs/paused-migrations/).
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK — as duas funções existem com a assinatura exata
--  (sem parâmetros), antes de qualquer GRANT/REVOKE. Só LÊ o
--  catálogo; não altera nada.
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.app_is_super()') is null then
    raise exception 'precheck 130: public.app_is_super() não encontrada — assinatura divergente ou função ausente.';
  end if;

  if to_regprocedure('public.app_loja_id()') is null then
    raise exception 'precheck 130: public.app_loja_id() não encontrada — assinatura divergente ou função ausente.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) ACL — public.app_is_super(). Reafirma fail-closed (revoke de
--  PUBLIC/anon/authenticated) antes de reconceder somente a
--  authenticated — mesmo padrão defensivo já usado em
--  098/101/125/126/127/128. service_role e postgres/owner: não
--  mencionados em nenhum GRANT/REVOKE desta migration.
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_is_super() from public;
revoke all on function public.app_is_super() from anon, authenticated;
grant execute on function public.app_is_super() to authenticated;

comment on function public.app_is_super() is
  'True se claim JWT super_admin ou tab_usuarios.super_admin do e-mail do JWT '
  '(security definer; corpo definido na migration 097, intocado aqui). ACL reafirmada pela '
  'migration 130 após drift em HML: authenticated EXECUTE, PUBLIC/anon fechados; service_role '
  'fora de escopo (não tocado). Consumidor direto confirmado em runtime: policies tenant-aware '
  'de tab_impressoes_cozinha (migration 129, TO authenticated).';

-- ════════════════════════════════════════════════════════════
--  2) ACL — public.app_loja_id(). Mesmo padrão do passo (1).
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_loja_id() from public;
revoke all on function public.app_loja_id() from anon, authenticated;
grant execute on function public.app_loja_id() to authenticated;

comment on function public.app_loja_id() is
  'loja_id do claim JWT ou, se ausente, de tab_usuarios pelo e-mail do JWT '
  '(security definer; corpo definido na migration 097, intocado aqui). ACL reafirmada pela '
  'migration 130 após drift em HML: authenticated EXECUTE, PUBLIC/anon fechados; service_role '
  'fora de escopo (não tocado). Consumidor direto confirmado em runtime: policies tenant-aware '
  'de tab_impressoes_cozinha (migration 129, TO authenticated).';

-- ════════════════════════════════════════════════════════════
--  Validação final — aborta a migration (RAISE EXCEPTION) se o
--  desenho de menor privilégio não convergir para as duas funções.
--  Só LÊ o catálogo; não altera função nem tabela.
--
--  PUBLIC: NÃO usa has_function_privilege('public', ...) de forma
--  ingênua (nome de papel ambíguo com o pseudo-role) — inspeciona o
--  ACL real da função via pg_proc.proacl + aclexplode, checando
--  grantee = 0 (representação padrão do Postgres para o pseudo-role
--  PUBLIC em um aclitem). Para anon/authenticated, has_function_privilege()
--  já é o mecanismo correto/estabelecido nas migrations anteriores.
--
--  service_role: deliberadamente NÃO validado quanto ao valor do ACL
--  (fora de escopo desta migration — deve permanecer exatamente como
--  já estiver em cada ambiente).
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_funcs          text[] := array['public.app_is_super()', 'public.app_loja_id()'];
  v_nome           text;
  v_oid            oid;
  v_prosecdef      boolean;
  v_proconfig      text[];
  v_owner          text;
  v_public_execute boolean;
begin
  foreach v_nome in array v_funcs loop
    -- A) função existe (assinatura exata, sem parâmetros)
    v_oid := to_regprocedure(v_nome);
    if v_oid is null then
      raise exception 'validação 130: % não encontrada — assinatura divergente ou função ausente.', v_nome;
    end if;

    select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner)
      into v_prosecdef, v_proconfig, v_owner
    from pg_proc p
    where p.oid = v_oid;

    -- B) SECURITY DEFINER continua true (corpo não tocado por esta migration)
    if not coalesce(v_prosecdef, false) then
      raise exception 'validação 130: % deveria continuar SECURITY DEFINER.', v_nome;
    end if;

    -- C) owner continua postgres (owner não tocado por esta migration)
    if v_owner is distinct from 'postgres' then
      raise exception 'validação 130: % — owner deveria continuar postgres (owner atual: %).', v_nome, coalesce(v_owner, 'NULL');
    end if;

    -- D) search_path continua public
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'validação 130: % deveria continuar com search_path=public.', v_nome;
    end if;

    -- E) authenticated possui EXECUTE
    if not has_function_privilege('authenticated', v_nome, 'execute') then
      raise exception 'validação 130: % — authenticated deveria ter EXECUTE.', v_nome;
    end if;

    -- F) anon NÃO possui EXECUTE
    if has_function_privilege('anon', v_nome, 'execute') then
      raise exception 'validação 130: % — anon NÃO deveria ter EXECUTE.', v_nome;
    end if;

    -- G) PUBLIC (pseudo-role, grantee = 0) NÃO possui EXECUTE — via ACL real, não has_function_privilege('public', ...)
    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_public_execute then
      raise exception 'validação 130: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_nome;
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
