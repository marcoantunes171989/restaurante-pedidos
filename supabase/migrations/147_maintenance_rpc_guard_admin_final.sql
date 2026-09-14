-- ════════════════════════════════════════════════════════════
--  147 — Guard do Maintenance Write Fence nas últimas 3 RPCs
--  administrativas (onda B9 final).
--
--  Recria via CREATE OR REPLACE somente:
--    app_atualizar_loja(bigint, jsonb)
--    app_evento_acesso_excluir(uuid)
--    app_salvar_funcionamento_loja(bigint, jsonb)
--  Corpos baseados nas definições atuais (pg_get_functiondef),
--  originalmente introduzidas em 124_catalogo_admin_seguro.sql
--  (app_atualizar_loja, app_salvar_funcionamento_loja) e em
--  100_controle_acessos_permanencia.sql (app_evento_acesso_excluir).
--  Única mudança: exatamente um
--    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  depois de toda autenticação/autorização/tenant/validações e
--  imediatamente antes da primeira e única mutação de negócio.
--
--  ANOMALIA ACL CONHECIDA — app_evento_acesso_excluir: a migration 100
--  já continha "grant execute ... to authenticated", mas o ACL live
--  hoje NÃO tem EXECUTE para authenticated (proacl = {postgres=X/postgres}).
--  Esta migration NÃO corrige essa anomalia — nenhum GRANT/REVOKE é
--  emitido; CREATE OR REPLACE preserva o ACL existente exatamente como
--  está, anomalia incluída.
--
--  EXCLUSÃO EXPLÍCITA — app_criar_categoria NÃO pertence a esta
--  migration (fluxo multi-request cadastrarEmpresa(), tratado
--  futuramente via ONBOARDING / operation registry). Não é redefinida,
--  não recebe guard, e as migrations 124/143 não são alteradas.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production neste
--  microgate. NÃO edita 100, 124 nem qualquer outra migration
--  existente. NÃO cria table/trigger/policy/API/frontend/event/
--  operation/state write. NÃO concede EXECUTE de
--  app_assert_business_write_allowed. NÃO altera grants das 3 RPCs.
--  Sem bypass. Sem operation_id. Comportamento NORMAL preservado.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
create temporary table pg_temp._mig147_acl_snapshot (
  proname text primary key,
  proacl  text
) on commit drop;

do $$
declare
  v_fns text[] := array[
    'app_atualizar_loja(bigint, jsonb)',
    'app_evento_acesso_excluir(uuid)',
    'app_salvar_funcionamento_loja(bigint, jsonb)'
  ];
  v_fn text;
  v_oid oid;
  v_def text;
  v_loja_count integer;
  v_evento_count integer;
  v_funcionamento_count integer;
  v_assert_oid oid;
  v_public_execute boolean;
  v_owner text;
begin
  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 147: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  select pg_get_userbyid(p.proowner) into v_owner from pg_proc p where p.oid = v_assert_oid;
  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 147: app_assert_business_write_allowed — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = v_assert_oid) then
    raise exception 'precheck 147: app_assert_business_write_allowed — deveria ser SECURITY DEFINER.';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = v_assert_oid
      and p.proconfig is not null
      and 'search_path=public' = any (p.proconfig)
  ) then
    raise exception 'precheck 147: app_assert_business_write_allowed — proconfig deveria conter search_path=public.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_assert_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'precheck 147: app_assert_business_write_allowed — PUBLIC (grantee=0) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 147: app_assert_business_write_allowed — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 147: app_assert_business_write_allowed — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 147: app_assert_business_write_allowed — service_role NÃO deveria ter EXECUTE.';
  end if;

  -- Ambiguidade/overload não previsto: exatamente 1 função por nome.
  select count(*) into v_loja_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_atualizar_loja';
  if v_loja_count <> 1 then
    raise exception 'precheck 147: esperado exatamente 1 overload de app_atualizar_loja (count=%).', v_loja_count;
  end if;

  select count(*) into v_evento_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_evento_acesso_excluir';
  if v_evento_count <> 1 then
    raise exception 'precheck 147: esperado exatamente 1 overload de app_evento_acesso_excluir (count=%).', v_evento_count;
  end if;

  select count(*) into v_funcionamento_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_salvar_funcionamento_loja';
  if v_funcionamento_count <> 1 then
    raise exception 'precheck 147: esperado exatamente 1 overload de app_salvar_funcionamento_loja (count=%).', v_funcionamento_count;
  end if;

  -- app_criar_categoria NÃO pertence a esta migration: precheck confirma
  -- que ela existe e que (ainda) não é tocada por este arquivo.
  if to_regprocedure('public.app_criar_categoria(bigint, text, bigint, bigint, integer)') is null then
    raise exception 'precheck 147: public.app_criar_categoria(bigint, text, bigint, bigint, integer) não encontrada (verificação de exclusão do onboarding).';
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'precheck 147: public.% não existe.', v_fn;
    end if;

    if pg_get_userbyid((select p.proowner from pg_proc p where p.oid = v_oid)) is distinct from 'postgres' then
      raise exception 'precheck 147: % — owner deveria ser postgres.', v_fn;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
      raise exception 'precheck 147: % — deveria ser SECURITY DEFINER.', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_oid
        and p.proconfig is not null
        and 'search_path=public' = any (p.proconfig)
    ) then
      raise exception 'precheck 147: % — proconfig deveria conter search_path=public.', v_fn;
    end if;

    -- anon e service_role nunca devem ter EXECUTE nas 3 RPCs (hoje e depois).
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'precheck 147: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
      raise exception 'precheck 147: % — service_role NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'precheck 147: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    v_def := pg_get_functiondef(v_oid);
    if v_def ~* 'app_assert_business_write_allowed' then
      raise exception 'precheck 147: public.% já contém o guard (migration 147 já aplicada conceitualmente).', v_fn;
    end if;

    -- Snapshot do ACL bruto (proacl) — comparado byte-a-byte no postcheck.
    -- app_evento_acesso_excluir tem uma anomalia ACL live conhecida
    -- (authenticated sem EXECUTE apesar do "grant" na migration 100) —
    -- esta migration NÃO corrige isso; o snapshot só prova preservação.
    insert into pg_temp._mig147_acl_snapshot (proname, proacl)
    select v_fn, (select p.proacl::text from pg_proc p where p.oid = v_oid);
  end loop;

  -- app_atualizar_loja e app_salvar_funcionamento_loja: authenticated já
  -- deveria ter EXECUTE hoje (grant explícito na migration 124).
  if not has_function_privilege('authenticated', 'public.app_atualizar_loja(bigint, jsonb)', 'execute') then
    raise exception 'precheck 147: app_atualizar_loja(bigint, jsonb) — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_salvar_funcionamento_loja(bigint, jsonb)', 'execute') then
    raise exception 'precheck 147: app_salvar_funcionamento_loja(bigint, jsonb) — authenticated deveria ter EXECUTE.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_atualizar_loja — guard imediatamente antes do UPDATE
--     em tab_lojas
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_loja(p_loja_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_lojas%rowtype;
  l public.tab_lojas%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  select * into v_atual from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then
      raise exception 'forbidden'; -- não-super jamais escolhe outra loja
    end if;
  end if;

  -- Campos de licença exigem super_admin no SERVIDOR (hoje só checado no
  -- cliente via isSuperAdmin em setValidadeLicenca/setLicencaEmpresa) —
  -- fail-closed: uma chamada direta de não-super com essas chaves é
  -- rejeitada, nunca silenciosamente ignorada.
  if (p_patch ? 'licenca_validade' or p_patch ? 'licenca_bloqueada' or p_patch ? 'licenca_motivo')
     and not coalesce(v_caller.super_admin, false) then
    raise exception 'forbidden_licenca';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  begin
    update public.tab_lojas set
      nome              = case when p_patch ? 'nome' then p_patch->>'nome' else nome end,
      prefixo           = case when p_patch ? 'prefixo' then upper(trim(p_patch->>'prefixo')) else prefixo end,
      documento         = case when p_patch ? 'documento' then p_patch->>'documento' else documento end,
      modo_uso          = case when p_patch ? 'modo_uso' then p_patch->>'modo_uso' else modo_uso end,
      logo_url          = case when p_patch ? 'logo_url' then p_patch->>'logo_url' else logo_url end,
      ativo             = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,
      config_externo    = case when p_patch ? 'config_externo' then coalesce(p_patch->'config_externo', '{}'::jsonb) else config_externo end,
      config_crm        = case when p_patch ? 'config_crm' then coalesce(p_patch->'config_crm', '{}'::jsonb) else config_crm end,
      licenca_validade  = case when p_patch ? 'licenca_validade' then nullif(p_patch->>'licenca_validade', '')::date else licenca_validade end,
      licenca_bloqueada = case when p_patch ? 'licenca_bloqueada' then (p_patch->>'licenca_bloqueada')::boolean else licenca_bloqueada end,
      licenca_motivo    = case when p_patch ? 'licenca_motivo' then p_patch->>'licenca_motivo' else licenca_motivo end
    where id = p_loja_id
    returning * into l;
  exception when unique_violation then
    raise exception 'loja_prefixo_duplicado';
  end;

  return jsonb_build_object(
    'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo, 'plano', l.plano,
    'email_responsavel', l.email_responsavel, 'documento', l.documento, 'modo_uso', l.modo_uso,
    'logo_url', l.logo_url, 'config_externo', coalesce(l.config_externo, '{}'::jsonb),
    'config_crm', coalesce(l.config_crm, '{}'::jsonb), 'licenca_validade', l.licenca_validade,
    'licenca_bloqueada', l.licenca_bloqueada, 'funcionamento', l.funcionamento
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  2) app_evento_acesso_excluir — guard imediatamente antes do
--     DELETE em tab_access_events
-- ════════════════════════════════════════════════════════════
create or replace function public.app_evento_acesso_excluir(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.app_usuario_id();
  v_loja_ev bigint;
  v_n int;
begin
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;
  if p_event_id is null then
    raise exception 'invalid_event';
  end if;

  select e.loja_id into v_loja_ev
  from public.tab_access_events e
  where e.id = p_event_id
  limit 1;

  if not found then
    raise exception 'not_found';
  end if;

  if not public.app_is_super()
     and v_loja_ev is distinct from public.app_loja_id()
     and v_loja_ev is not null then
    raise exception 'forbidden';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  delete from public.tab_access_events e where e.id = p_event_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'deleted', coalesce(v_n, 0));
end;
$$;

-- ════════════════════════════════════════════════════════════
--  3) app_salvar_funcionamento_loja — guard imediatamente antes
--     do UPDATE em tab_lojas
-- ════════════════════════════════════════════════════════════
create or replace function public.app_salvar_funcionamento_loja(p_loja_id bigint, p_funcionamento jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_lojas%rowtype;
  l public.tab_lojas%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  select * into v_atual from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  update public.tab_lojas set funcionamento = p_funcionamento
  where id = p_loja_id
  returning * into l;

  return jsonb_build_object('id', l.id, 'funcionamento', l.funcionamento);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_atualizar_loja(bigint, jsonb)',
    'app_evento_acesso_excluir(uuid)',
    'app_salvar_funcionamento_loja(bigint, jsonb)'
  ];
  v_fn text;
  v_oid oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner text;
  v_prosrc text;
  v_guard_count integer;
  v_public_execute boolean;
  v_rpc_count integer;
  v_guard_total integer := 0;
  v_assert_oid oid;
  v_assert_public_execute boolean;
  v_acl_antes text;
  v_acl_depois text;
begin
  select count(*) into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('app_atualizar_loja', 'app_evento_acesso_excluir', 'app_salvar_funcionamento_loja');
  if v_rpc_count <> 3 then
    raise exception 'postcheck 147: esperado exatamente 3 RPCs administrativas (count=%).', v_rpc_count;
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'postcheck 147: public.% não encontrada.', v_fn;
    end if;

    select
      p.prosecdef,
      p.proconfig,
      pg_get_userbyid(p.proowner),
      p.prosrc
    into
      v_prosecdef,
      v_proconfig,
      v_owner,
      v_prosrc
    from pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 147: % — owner deveria ser postgres (owner atual: %).', v_fn, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 147: % — prosecdef deveria ser true (SECURITY DEFINER).', v_fn;
    end if;
    if v_proconfig is null
       or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 147: % — proconfig deveria conter search_path=public.', v_fn;
    end if;

    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 147: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 147: % — service_role NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'postcheck 147: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    -- ACL byte-a-byte idêntico ao snapshot do precheck — nenhum
    -- GRANT/REVOKE foi emitido, e CREATE OR REPLACE preserva o ACL
    -- (inclusive a anomalia conhecida de app_evento_acesso_excluir).
    select proacl into v_acl_antes from pg_temp._mig147_acl_snapshot where proname = v_fn;
    select p.proacl::text into v_acl_depois from pg_proc p where p.oid = v_oid;
    if v_acl_antes is distinct from v_acl_depois then
      raise exception 'postcheck 147: % — ACL mudou (antes=%, depois=%).', v_fn, v_acl_antes, v_acl_depois;
    end if;

    select count(*)
      into v_guard_count
    from regexp_matches(v_prosrc, 'app_assert_business_write_allowed', 'gi');
    if v_guard_count is distinct from 1 then
      raise exception 'postcheck 147: % — guard deveria aparecer exatamente 1 vez (count=%).', v_fn, v_guard_count;
    end if;
    if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
      raise exception 'postcheck 147: % — guard deveria ser app_assert_business_write_allowed(null, null).', v_fn;
    end if;
    if v_prosrc ~* 'operation_id' then
      raise exception 'postcheck 147: % — não deveria referenciar operation_id.', v_fn;
    end if;

    v_guard_total := v_guard_total + v_guard_count;
  end loop;

  if v_guard_total <> 3 then
    raise exception 'postcheck 147: esperado exatamente 3 guards no total (count=%).', v_guard_total;
  end if;

  -- authenticated deveria continuar exatamente como estava: presente
  -- nas duas de loja, e SEM correção da anomalia na de eventos.
  if not has_function_privilege('authenticated', 'public.app_atualizar_loja(bigint, jsonb)', 'execute') then
    raise exception 'postcheck 147: app_atualizar_loja(bigint, jsonb) — authenticated deveria continuar com EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_salvar_funcionamento_loja(bigint, jsonb)', 'execute') then
    raise exception 'postcheck 147: app_salvar_funcionamento_loja(bigint, jsonb) — authenticated deveria continuar com EXECUTE.';
  end if;

  -- Retornos das 3 continuam com os mesmos tipos anteriores (jsonb).
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_atualizar_loja(bigint, jsonb)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 147: app_atualizar_loja — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_evento_acesso_excluir(uuid)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 147: app_evento_acesso_excluir — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_salvar_funcionamento_loja(bigint, jsonb)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 147: app_salvar_funcionamento_loja — return type deveria ser jsonb.';
  end if;

  -- app_atualizar_loja: o UPDATE em tab_lojas continua existindo, dentro
  -- do bloco begin/exception que trata unique_violation.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_atualizar_loja(bigint, jsonb)');
  if v_prosrc !~* 'update\s+public\.tab_lojas' then
    raise exception 'postcheck 147: app_atualizar_loja perdeu o UPDATE em tab_lojas.';
  end if;
  if v_prosrc !~* 'loja_prefixo_duplicado' then
    raise exception 'postcheck 147: app_atualizar_loja perdeu o tratamento de unique_violation (loja_prefixo_duplicado).';
  end if;

  -- app_evento_acesso_excluir: o DELETE físico continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_evento_acesso_excluir(uuid)');
  if v_prosrc !~* 'delete\s+from\s+public\.tab_access_events' then
    raise exception 'postcheck 147: app_evento_acesso_excluir perdeu o DELETE físico em tab_access_events.';
  end if;

  -- app_salvar_funcionamento_loja: o UPDATE em tab_lojas continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_salvar_funcionamento_loja(bigint, jsonb)');
  if v_prosrc !~* 'update\s+public\.tab_lojas' then
    raise exception 'postcheck 147: app_salvar_funcionamento_loja perdeu o UPDATE em tab_lojas.';
  end if;

  -- app_criar_categoria (onboarding) NÃO é tocada por esta migration.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_criar_categoria'
      and p.prosrc ilike '%app_assert_business_write_allowed%'
  ) then
    raise exception 'postcheck 147: app_criar_categoria NÃO deveria conter o guard de manutenção (fora de escopo, tratado no onboarding).';
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 147: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_assert_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_assert_public_execute;
  if v_assert_public_execute then
    raise exception 'postcheck 147: assert — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 147: assert — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 147: assert — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 147: assert — service_role NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;
