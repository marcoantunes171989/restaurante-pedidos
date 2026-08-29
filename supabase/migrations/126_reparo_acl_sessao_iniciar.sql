-- ════════════════════════════════════════════════════════════
--  126 — Reparo de ACL drift: public.app_sessao_iniciar (14 args)
--
--  CAUSA RAIZ (auditoria Gate 8.18, HML): AMBAS as assinaturas de
--  app_sessao_iniciar (13 args legada e 14 args atual, com
--  p_device_id) estão com authenticated_execute = false em HML,
--  embora a migration 101_controle_acessos_bloqueio_dispositivo.sql
--  tenha concedido EXECUTE a authenticated na assinatura de 14 args
--  (e deliberadamente fechado a de 13 args, sem re-conceder). Nenhuma
--  migration deste repositório revoga esse GRANT depois — o drift
--  ocorreu fora do controle de versão (mesma classe de drift já
--  reparada pela migration 125 para outras RPCs de sessão/dispositivo,
--  que não incluiu app_sessao_iniciar em seu escopo).
--
--  IMPACTO: o frontend (src/lib/accessControl/api.js,
--  iniciarSessaoAcesso) chama exclusivamente a assinatura de 14 args
--  (sempre envia p_device_id). Com EXECUTE ausente, a RPC falha
--  (403), o erro é tratado como não-fatal no cliente (log +
--  retorno null) e NENHUMA linha é criada/atualizada em
--  tab_user_sessions. Sem essa linha, app_dispositivo_registrar
--  (migration 125) nunca encontra sessão ativa correspondente ao
--  device_id do tablet e falha com 'device_session_mismatch' — a
--  125 está correta e permanece fail-closed; a causa raiz é
--  inteiramente este ACL drift, upstream.
--
--  ESCOPO — forward-fix P0 mínimo, SOMENTE ACL da assinatura de 14
--  argumentos (a única com call site atual, confirmado por auditoria
--  de código completa). NÃO altera corpo/assinatura/SECURITY
--  DEFINER/search_path da função, NÃO toca tab_user_sessions,
--  tab_dispositivos, RLS, policies, app_dispositivo_registrar,
--  frontend, nem qualquer outra RPC. NÃO modifica a migration 125.
--
--  ASSINATURA LEGADA (13 args, sem p_device_id): NÃO é tocada nesta
--  migration — nem GRANT nem REVOKE. Já está fechada no HML e a
--  auditoria confirmou ausência de qualquer call site atual; alterar
--  sua ACL aqui ampliaria o blast radius além do necessário para
--  este forward-fix.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  ACL — assinatura de 14 args (uuid,text,text,text,text,text,text,
--  text,text,text,boolean,text,text,text). Reafirma fail-closed
--  (revoke de PUBLIC/anon/authenticated) antes de reconceder somente
--  a authenticated — mesmo padrão defensivo já usado em 101/125.
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) from public;
revoke all on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) from anon, authenticated;
grant execute on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) to authenticated;

comment on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) is
  'Inicia/reativa a sessão de acesso do usuário autenticado (security definer; corpo definido na '
  'migration 101, intocado aqui). ACL reafirmada pela migration 126 após drift em HML: authenticated '
  'EXECUTE, PUBLIC/anon fechados. Único call site atual: iniciarSessaoAcesso() em '
  'src/lib/accessControl/api.js — sempre envia p_device_id (só resolve para esta assinatura).';

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
  -- A) função existe (assinatura exata de 14 args)
  v_oid := to_regprocedure(
    'public.app_sessao_iniciar(uuid,text,text,text,text,text,text,text,text,text,boolean,text,text,text)'
  );
  if v_oid is null then
    raise exception 'validação 126: app_sessao_iniciar (14 args) não encontrada — assinatura divergente ou função ausente.';
  end if;

  select p.prosecdef, p.proconfig
    into v_prosecdef, v_proconfig
  from pg_proc p
  where p.oid = v_oid;

  -- B) SECURITY DEFINER continua true (corpo não tocado por esta migration)
  if not coalesce(v_prosecdef, false) then
    raise exception 'validação 126: app_sessao_iniciar (14 args) deveria continuar SECURITY DEFINER.';
  end if;

  -- C) search_path continua public
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'validação 126: app_sessao_iniciar (14 args) deveria continuar com search_path=public.';
  end if;

  -- D) authenticated possui EXECUTE
  if not has_function_privilege(
    'authenticated',
    'public.app_sessao_iniciar(uuid,text,text,text,text,text,text,text,text,text,boolean,text,text,text)',
    'execute'
  ) then
    raise exception 'validação 126: app_sessao_iniciar (14 args) — authenticated deveria ter EXECUTE.';
  end if;

  -- E) anon NÃO possui EXECUTE
  if has_function_privilege(
    'anon',
    'public.app_sessao_iniciar(uuid,text,text,text,text,text,text,text,text,text,boolean,text,text,text)',
    'execute'
  ) then
    raise exception 'validação 126: app_sessao_iniciar (14 args) — anon NÃO deveria ter EXECUTE.';
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
    raise exception 'validação 126: app_sessao_iniciar (14 args) — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
