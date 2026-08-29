-- ════════════════════════════════════════════════════════════
--  127 — Reparo de ACL drift: public.app_sessao_encerrar(uuid,text)
--
--  CAUSA RAIZ (auditoria Gate 8.42, preview Vercel do commit
--  688776e + auditoria READ-ONLY do catálogo em HML): a migration
--  098_controle_acessos.sql pretendia EXECUTE para authenticated em
--  public.app_sessao_encerrar(uuid,text) ('revoke all ... from
--  public; grant execute ... to authenticated;'), mas o catálogo real
--  em HML mostra:
--
--    security_definer      = true            (correto, não tocado)
--    function_settings      = {search_path=public} (correto, não tocado)
--    authenticated_execute  = false           (DRIFT — deveria ser true)
--    anon_execute           = false           (correto)
--    public_execute         = false           (correto)
--    acl_real               = {postgres=X/postgres}
--
--  Nenhuma migration deste repositório revoga o GRANT de 098 depois —
--  o drift ocorreu fora do controle de versão (mesma classe de drift
--  já reparada pela migration 125 para outras RPCs de sessão/
--  dispositivo, e pela migration 126 exclusivamente para
--  app_sessao_iniciar de 14 args; nenhuma das duas incluiu
--  app_sessao_encerrar em seu escopo).
--
--  IMPACTO CONFIRMADO EM RUNTIME (preview do commit 688776e): login
--  em HML OK, app_sessao_iniciar → 200, mesa 03 vinculada,
--  app_dispositivo_registrar → 200; ao voltar do navegador a
--  aplicação chega em /login e chama app_sessao_encerrar, que
--  responde 403 (PostgreSQL 42501 — 'permission denied for function
--  app_sessao_encerrar'). O forward-fix de frontend dos Gates
--  8.36/8.36.1 (logout awaitable, popstate awaitable) já garante que a
--  RPC É alcançada corretamente; o bloqueio remanescente é
--  exclusivamente este ACL drift em HML — fora do escopo de qualquer
--  alteração de frontend.
--
--  ESCOPO — forward-fix P0 mínimo, SOMENTE ACL de
--  public.app_sessao_encerrar(uuid,text). NÃO altera corpo/
--  assinatura/retorno/SECURITY DEFINER/search_path da função
--  (definida na migration 098, intocada aqui), NÃO toca
--  tab_user_sessions, tab_access_events, RLS, policies, triggers,
--  dados, frontend, nem qualquer outra RPC — incluindo
--  app_sessao_encerrar_remota (função distinta, fora de escopo) e
--  app_sessao_iniciar (13 args legado, deliberadamente fechado,
--  intocado; e 14 args, já reparado na migration 126).
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  ACL — public.app_sessao_encerrar(uuid, text). Reafirma
--  fail-closed (revoke de PUBLIC/anon/authenticated) antes de
--  reconceder somente a authenticated — mesmo padrão defensivo já
--  usado em 098/101/125/126.
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_sessao_encerrar(uuid, text) from public;
revoke all on function public.app_sessao_encerrar(uuid, text) from anon, authenticated;
grant execute on function public.app_sessao_encerrar(uuid, text) to authenticated;

comment on function public.app_sessao_encerrar(uuid, text) is
  'Encerra a sessão de acesso do usuário autenticado (security definer; corpo definido na '
  'migration 098, intocado aqui). ACL reafirmada pela migration 127 após drift em HML: authenticated '
  'EXECUTE, PUBLIC/anon fechados. Único call site atual: encerrarSessaoAcesso() em '
  'src/lib/accessControl/api.js, chamada por logout()/popstate em src/App.jsx.';

-- ════════════════════════════════════════════════════════════
--  Validação final — aborta a migration (RAISE EXCEPTION) se o
--  desenho de menor privilégio não convergir. Só LÊ o catálogo; não
--  altera função nem tabela.
--
--  PUBLIC: NÃO usa has_function_privilege('public', ...) de forma
--  ingênua (nome de papel ambíguo com o pseudo-role) — inspeciona o
--  ACL real da função via pg_proc.proacl + aclexplode, checando
--  grantee = 0 (representação padrão do Postgres para o pseudo-role
--  PUBLIC em um aclitem). Para authenticated/anon, has_function_privilege()
--  já é o mecanismo correto/estabelecido nas migrations anteriores.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid            oid;
  v_prosecdef      boolean;
  v_proconfig      text[];
  v_public_execute boolean;
begin
  -- A) função existe (assinatura exata uuid,text)
  v_oid := to_regprocedure('public.app_sessao_encerrar(uuid,text)');
  if v_oid is null then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) não encontrada — assinatura divergente ou função ausente.';
  end if;

  select p.prosecdef, p.proconfig
    into v_prosecdef, v_proconfig
  from pg_proc p
  where p.oid = v_oid;

  -- B) SECURITY DEFINER continua true (corpo não tocado por esta migration)
  if not coalesce(v_prosecdef, false) then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) deveria continuar SECURITY DEFINER.';
  end if;

  -- C) search_path continua public
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) deveria continuar com search_path=public.';
  end if;

  -- D) authenticated possui EXECUTE
  if not has_function_privilege(
    'authenticated',
    'public.app_sessao_encerrar(uuid,text)',
    'execute'
  ) then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) — authenticated deveria ter EXECUTE.';
  end if;

  -- E) anon NÃO possui EXECUTE
  if has_function_privilege(
    'anon',
    'public.app_sessao_encerrar(uuid,text)',
    'execute'
  ) then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) — anon NÃO deveria ter EXECUTE.';
  end if;

  -- F) PUBLIC (pseudo-role, grantee = 0) NÃO possui EXECUTE — via ACL real, não has_function_privilege('public', ...)
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;

  if v_public_execute then
    raise exception 'validação 127: app_sessao_encerrar(uuid,text) — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
