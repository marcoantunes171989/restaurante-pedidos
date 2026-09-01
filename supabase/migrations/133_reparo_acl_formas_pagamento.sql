-- ════════════════════════════════════════════════════════════
--  133 — Reparo de ACL: public.app_listar_formas_pagamento()
--
--  CAUSA RAIZ (HML-11B, auditoria READ-ONLY):
--
--    public.tab_formas_pagamento:
--      dados existentes em HML          = confirmado
--      RLS                              = ativo
--      policy tenant-aware              = existente
--
--    public.app_listar_formas_pagamento():
--      função existente                 = true
--      SECURITY DEFINER                 = true
--      owner                            = postgres
--      search_path                      = public
--      anon EXECUTE                     = false
--      authenticated EXECUTE            = false  <-- DRIFT/BLOCKER
--
--  IMPACTO:
--    usuários autenticados não conseguem executar a RPC usada
--    pelo frontend para listar formas de pagamento. O fallback
--    direto à tabela também permanece protegido, resultando em
--    lista vazia no frontend apesar de os dados existirem.
--
--  DECISÃO:
--    somente authenticated recebe EXECUTE nesta RPC.
--
--    PUBLIC       = fechado
--    anon         = fechado
--    authenticated= EXECUTE
--    service_role = fora de escopo; NÃO TOCADO
--
--  ESCOPO:
--    somente ACL de public.app_listar_formas_pagamento().
--
--    NÃO altera:
--      - corpo da função
--      - assinatura
--      - retorno
--      - SECURITY DEFINER
--      - search_path
--      - owner
--      - tabelas
--      - dados
--      - policies RLS
--      - migrations 131/132
--      - service_role
--
--  Forward-fix mínimo. Não editar migrations já aplicadas.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK
--  Aborta antes de alterar ACL se a RPC não estiver exatamente
--  no estado estrutural previamente auditado em HML.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid       oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner     text;
begin
  v_oid := to_regprocedure('public.app_listar_formas_pagamento()');

  if v_oid is null then
    raise exception
      'precheck 133: public.app_listar_formas_pagamento() não encontrada.';
  end if;

  select
    p.prosecdef,
    p.proconfig,
    pg_get_userbyid(p.proowner)
  into
    v_prosecdef,
    v_proconfig,
    v_owner
  from pg_proc p
  where p.oid = v_oid;

  if not coalesce(v_prosecdef, false) then
    raise exception
      'precheck 133: app_listar_formas_pagamento() deveria ser SECURITY DEFINER.';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception
      'precheck 133: owner inesperado: %.',
      coalesce(v_owner, 'NULL');
  end if;

  if v_proconfig is null
     or not ('search_path=public' = any(v_proconfig)) then
    raise exception
      'precheck 133: search_path deveria permanecer public.';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════
--  1) ACL FAIL-CLOSED
-- ════════════════════════════════════════════════════════════

revoke all
on function public.app_listar_formas_pagamento()
from public;

revoke all
on function public.app_listar_formas_pagamento()
from anon, authenticated;

grant execute
on function public.app_listar_formas_pagamento()
to authenticated;


-- ════════════════════════════════════════════════════════════
--  2) VALIDAÇÃO FINAL
--  Qualquer divergência aborta toda a transaction.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid            oid;
  v_prosecdef      boolean;
  v_proconfig      text[];
  v_owner          text;
  v_public_execute boolean;
begin
  v_oid := to_regprocedure('public.app_listar_formas_pagamento()');

  if v_oid is null then
    raise exception
      'validação 133: app_listar_formas_pagamento() não encontrada.';
  end if;

  select
    p.prosecdef,
    p.proconfig,
    pg_get_userbyid(p.proowner)
  into
    v_prosecdef,
    v_proconfig,
    v_owner
  from pg_proc p
  where p.oid = v_oid;

  if not coalesce(v_prosecdef, false) then
    raise exception
      'validação 133: função deveria continuar SECURITY DEFINER.';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception
      'validação 133: owner deveria continuar postgres.';
  end if;

  if v_proconfig is null
     or not ('search_path=public' = any(v_proconfig)) then
    raise exception
      'validação 133: search_path deveria continuar public.';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.app_listar_formas_pagamento()',
      'execute'
  ) then
    raise exception
      'validação 133: authenticated deveria possuir EXECUTE.';
  end if;

  if has_function_privilege(
      'anon',
      'public.app_listar_formas_pagamento()',
      'execute'
  ) then
    raise exception
      'validação 133: anon NÃO deveria possuir EXECUTE.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral
      aclexplode(
        coalesce(
          p.proacl,
          acldefault('f', p.proowner)
        )
      ) as acl
    where p.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_execute;

  if v_public_execute then
    raise exception
      'validação 133: PUBLIC NÃO deveria possuir EXECUTE.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
