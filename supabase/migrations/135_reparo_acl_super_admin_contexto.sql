-- ════════════════════════════════════════════════════════════
--  135 — Reparo ACL: app_sessao_trocar_contexto
--
--  Causa raiz:
--  A migration 116 concedeu EXECUTE para authenticated,
--  porém auditoria READ-ONLY em HML confirmou que o grant
--  não está presente no catálogo real.
--
--  ROOT_CAUSE: HML_ACL_DRIFT_POST_APPLY
--
--  Escopo:
--  SOMENTE ACL de:
--  public.app_sessao_trocar_contexto(uuid, uuid, bigint)
--
--  Não altera:
--  corpo, assinatura, SECURITY DEFINER, search_path,
--  tabelas, RLS, dados, frontend ou outras RPCs.
-- ════════════════════════════════════════════════════════════

begin;

-- ------------------------------------------------------------
-- PRECHECK ESTRUTURAL
-- ------------------------------------------------------------

do $$
declare
  v_oid       oid;
  v_prosecdef boolean;
  v_proconfig text[];
begin
  v_oid := to_regprocedure(
    'public.app_sessao_trocar_contexto(uuid, uuid, bigint)'
  );

  if v_oid is null then
    raise exception
      'precheck 135: app_sessao_trocar_contexto(uuid, uuid, bigint) não encontrada.';
  end if;

  select
    p.prosecdef,
    p.proconfig
  into
    v_prosecdef,
    v_proconfig
  from pg_proc p
  where p.oid = v_oid;

  if not coalesce(v_prosecdef, false) then
    raise exception
      'precheck 135: função deveria ser SECURITY DEFINER.';
  end if;

  if v_proconfig is null
     or not ('search_path=public' = any(v_proconfig)) then
    raise exception
      'precheck 135: search_path deveria ser public.';
  end if;
end $$;

-- ------------------------------------------------------------
-- ACL FAIL-CLOSED
-- ------------------------------------------------------------

revoke all
on function public.app_sessao_trocar_contexto(uuid, uuid, bigint)
from public;

revoke all
on function public.app_sessao_trocar_contexto(uuid, uuid, bigint)
from anon, authenticated;

grant execute
on function public.app_sessao_trocar_contexto(uuid, uuid, bigint)
to authenticated;

-- ------------------------------------------------------------
-- VALIDAÇÃO FINAL
-- Qualquer divergência aborta a transaction.
-- ------------------------------------------------------------

do $$
declare
  v_oid            oid;
  v_prosecdef      boolean;
  v_proconfig      text[];
  v_public_execute boolean;
begin
  v_oid := to_regprocedure(
    'public.app_sessao_trocar_contexto(uuid, uuid, bigint)'
  );

  if v_oid is null then
    raise exception
      'validacao 135: função não encontrada.';
  end if;

  select
    p.prosecdef,
    p.proconfig
  into
    v_prosecdef,
    v_proconfig
  from pg_proc p
  where p.oid = v_oid;

  if not coalesce(v_prosecdef, false) then
    raise exception
      'validacao 135: função deveria continuar SECURITY DEFINER.';
  end if;

  if v_proconfig is null
     or not ('search_path=public' = any(v_proconfig)) then
    raise exception
      'validacao 135: search_path deveria continuar public.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.app_sessao_trocar_contexto(uuid, uuid, bigint)',
    'execute'
  ) then
    raise exception
      'validacao 135: authenticated deveria possuir EXECUTE.';
  end if;

  if has_function_privilege(
    'anon',
    'public.app_sessao_trocar_contexto(uuid, uuid, bigint)',
    'execute'
  ) then
    raise exception
      'validacao 135: anon NÃO deveria possuir EXECUTE.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(
        p.proacl,
        acldefault('f', p.proowner)
      )
    ) acl
    where p.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_execute;

  if v_public_execute then
    raise exception
      'validacao 135: PUBLIC NÃO deveria possuir EXECUTE.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
