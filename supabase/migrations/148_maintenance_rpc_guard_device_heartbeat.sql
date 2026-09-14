-- ════════════════════════════════════════════════════════════
--  148 — Guard do Maintenance Write Fence no heartbeat de
--  dispositivo (onda B10-B).
--
--  Recria via CREATE OR REPLACE somente:
--    app_dispositivo_registrar(text, text, text, text, boolean,
--      text, bigint, uuid)
--  Corpo baseado na definição atual (pg_get_functiondef),
--  originalmente introduzida em 125_dispositivos_sessao_seguros.sql.
--  Única mudança: exatamente um
--    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  depois de toda autenticação/autorização/ownership/exclusividade
--  de mesa (advisory lock) e imediatamente antes do único
--    INSERT ... ON CONFLICT DO UPDATE
--  em tab_dispositivos.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production neste
--  microgate. NÃO edita a migration 125 nem qualquer outra migration
--  existente. NÃO cria table/trigger/policy/API/frontend/event/
--  operation/state write. NÃO concede EXECUTE de
--  app_assert_business_write_allowed. NÃO altera grants da RPC.
--  NÃO toca app_sessao_heartbeat, app_page_stay_iniciar,
--  app_page_stay_encerrar, app_dispositivo_renomear,
--  app_dispositivo_remover, app_dispositivo_bloquear,
--  app_dispositivo_desbloquear, landing analytics, release executor,
--  notificacoes-push nem a migration 064. Sem bypass. Sem
--  operation_id. Comportamento NORMAL preservado.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
create temporary table pg_temp._mig148_acl_snapshot (
  proname text primary key,
  proacl  text
) on commit drop;

do $$
declare
  v_fn constant text := 'app_dispositivo_registrar(text, text, text, text, boolean, text, bigint, uuid)';
  v_oid oid;
  v_def text;
  v_count integer;
  v_assert_oid oid;
  v_public_execute boolean;
  v_owner text;
  v_fora_de_escopo text[] := array[
    'app_sessao_heartbeat',
    'app_page_stay_iniciar',
    'app_page_stay_encerrar',
    'app_dispositivo_renomear',
    'app_dispositivo_remover',
    'app_dispositivo_bloquear',
    'app_dispositivo_desbloquear'
  ];
  v_nome text;
begin
  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 148: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  select pg_get_userbyid(p.proowner) into v_owner from pg_proc p where p.oid = v_assert_oid;
  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 148: app_assert_business_write_allowed — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = v_assert_oid) then
    raise exception 'precheck 148: app_assert_business_write_allowed — deveria ser SECURITY DEFINER.';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = v_assert_oid
      and p.proconfig is not null
      and 'search_path=public' = any (p.proconfig)
  ) then
    raise exception 'precheck 148: app_assert_business_write_allowed — proconfig deveria conter search_path=public.';
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
    raise exception 'precheck 148: app_assert_business_write_allowed — PUBLIC (grantee=0) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 148: app_assert_business_write_allowed — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 148: app_assert_business_write_allowed — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 148: app_assert_business_write_allowed — service_role NÃO deveria ter EXECUTE.';
  end if;

  -- Ambiguidade/overload não previsto: exatamente 1 função pelo nome.
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_dispositivo_registrar';
  if v_count <> 1 then
    raise exception 'precheck 148: esperado exatamente 1 overload de app_dispositivo_registrar (count=%).', v_count;
  end if;

  v_oid := to_regprocedure(format('public.%s', v_fn));
  if v_oid is null then
    raise exception 'precheck 148: public.% não existe.', v_fn;
  end if;

  if pg_get_userbyid((select p.proowner from pg_proc p where p.oid = v_oid)) is distinct from 'postgres' then
    raise exception 'precheck 148: % — owner deveria ser postgres.', v_fn;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
    raise exception 'precheck 148: % — deveria ser SECURITY DEFINER.', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = v_oid
      and p.proconfig is not null
      and 'search_path=public' = any (p.proconfig)
  ) then
    raise exception 'precheck 148: % — proconfig deveria conter search_path=public.', v_fn;
  end if;

  -- anon e service_role nunca devem ter EXECUTE nesta RPC (hoje e depois).
  if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
    raise exception 'precheck 148: % — anon NÃO deveria ter EXECUTE.', v_fn;
  end if;
  if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
    raise exception 'precheck 148: % — service_role NÃO deveria ter EXECUTE.', v_fn;
  end if;
  if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
    raise exception 'precheck 148: % — authenticated deveria ter EXECUTE.', v_fn;
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
    raise exception 'precheck 148: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
  end if;

  v_def := pg_get_functiondef(v_oid);
  if v_def ~* 'app_assert_business_write_allowed' then
    raise exception 'precheck 148: public.% já contém o guard (migration 148 já aplicada conceitualmente).', v_fn;
  end if;

  -- Snapshot do ACL bruto (proacl) — comparado byte-a-byte no postcheck.
  insert into pg_temp._mig148_acl_snapshot (proname, proacl)
  select v_fn, (select p.proacl::text from pg_proc p where p.oid = v_oid);

  -- RPCs/objetos fora de escopo (B10-B): confirma que existem e que
  -- (ainda) não recebem o guard desta migration.
  foreach v_nome in array v_fora_de_escopo loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_nome
    ) then
      raise exception 'precheck 148: public.% não encontrada (verificação fora de escopo).', v_nome;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_dispositivo_registrar — guard imediatamente antes do
--     INSERT ... ON CONFLICT DO UPDATE em tab_dispositivos
-- ════════════════════════════════════════════════════════════
create or replace function public.app_dispositivo_registrar(
  p_device_id     text,
  p_nome          text default null,
  p_versao        text default null,
  p_plataforma    text default null,
  p_standalone    boolean default false,
  p_mesa          text default null,
  p_loja_id       bigint default null,
  p_session_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_loja      bigint;
  v_dev       text := nullif(trim(coalesce(p_device_id, '')), '');
  v_mesa      text := nullif(trim(coalesce(p_mesa, '')), '');
  v_existente public.tab_dispositivos%rowtype;
  r           public.tab_dispositivos%rowtype;
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

  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  if v_dev is null then
    raise exception 'device_invalido';
  end if;

  -- Ownership: prova server-side de que o caller possui, AGORA, uma
  -- sessão ativa para este MESMO device_id. Sem isso, qualquer usuário
  -- autenticado da loja poderia escrever na linha de outro aparelho só
  -- por conhecer/adivinhar o device_id (device_id não é segredo — a
  -- própria app_dispositivos_listar o expõe a todos da loja).
  if p_session_token is null then
    raise exception 'device_session_mismatch';
  end if;

  if not exists (
    select 1
    from public.tab_user_sessions s
    where s.session_token = p_session_token
      and s.user_id = v_caller.id
      and s.device_id = v_dev
      and s.status = 'active'
  ) then
    raise exception 'device_session_mismatch';
  end if;

  if v_mesa is not null and v_mesa !~ '^[0-9]+$' then
    raise exception 'mesa_invalida';
  end if;

  select * into v_existente
  from public.tab_dispositivos
  where device_id = v_dev;

  if found and v_existente.loja_id is not null and v_existente.loja_id is distinct from v_loja then
    raise exception 'device_loja_conflito';
  end if;

  -- Exclusividade de mesa: trava transacional determinística por
  -- (loja_id, mesa) — serializa qualquer chamada concorrente para a MESMA
  -- combinação antes de checar conflito, fechando a janela TOCTOU entre
  -- "ler mesa livre" e "gravar". Liberado automaticamente ao fim desta
  -- transação (pg_advisory_xact_lock).
  if v_mesa is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('pedido-prime:tablet-mesa:' || v_loja::text || ':' || v_mesa, 0)
    );

    if exists (
      select 1
      from public.tab_dispositivos d
      where d.loja_id = v_loja
        and d.mesa = v_mesa
        and d.device_id <> v_dev
        and d.ultima_atividade >= now() - interval '5 minutes'
    ) then
      raise exception 'mesa_em_uso_outro_dispositivo';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  insert into public.tab_dispositivos (
    device_id, nome, versao, user_email, loja_id, plataforma, standalone,
    ultima_atividade, mesa
  ) values (
    v_dev, nullif(trim(coalesce(p_nome, '')), ''), p_versao, v_caller.email, v_loja,
    p_plataforma, coalesce(p_standalone, false), now(), v_mesa
  )
  on conflict (device_id) do update set
    nome             = coalesce(nullif(trim(coalesce(excluded.nome, '')), ''), public.tab_dispositivos.nome),
    versao           = excluded.versao,
    user_email       = excluded.user_email,
    loja_id          = excluded.loja_id,
    plataforma       = excluded.plataforma,
    standalone       = excluded.standalone,
    ultima_atividade = excluded.ultima_atividade,
    mesa             = excluded.mesa
  returning * into r;

  return jsonb_build_object(
    'device_id', r.device_id, 'nome', r.nome, 'versao', r.versao,
    'user_email', r.user_email, 'loja_id', r.loja_id, 'plataforma', r.plataforma,
    'standalone', r.standalone, 'ultima_atividade', r.ultima_atividade,
    'criado_em', r.criado_em, 'mesa', r.mesa
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fn constant text := 'app_dispositivo_registrar(text, text, text, text, boolean, text, bigint, uuid)';
  v_oid oid;
  v_prosecdef boolean;
  v_provolatile "char";
  v_proconfig text[];
  v_owner text;
  v_prosrc text;
  v_pronargs smallint;
  v_pronargdefaults smallint;
  v_guard_count integer;
  v_public_execute boolean;
  v_rpc_count integer;
  v_assert_oid oid;
  v_assert_public_execute boolean;
  v_acl_antes text;
  v_acl_depois text;
  v_fora_de_escopo text[] := array[
    'app_sessao_heartbeat',
    'app_page_stay_iniciar',
    'app_page_stay_encerrar',
    'app_dispositivo_renomear',
    'app_dispositivo_remover',
    'app_dispositivo_bloquear',
    'app_dispositivo_desbloquear'
  ];
  v_nome text;
begin
  select count(*) into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_dispositivo_registrar';
  if v_rpc_count <> 1 then
    raise exception 'postcheck 148: esperado exatamente 1 RPC app_dispositivo_registrar (count=%).', v_rpc_count;
  end if;

  v_oid := to_regprocedure(format('public.%s', v_fn));
  if v_oid is null then
    raise exception 'postcheck 148: public.% não encontrada.', v_fn;
  end if;

  select
    p.prosecdef,
    p.provolatile,
    p.proconfig,
    pg_get_userbyid(p.proowner),
    p.prosrc,
    p.pronargs,
    p.pronargdefaults
  into
    v_prosecdef,
    v_provolatile,
    v_proconfig,
    v_owner,
    v_prosrc,
    v_pronargs,
    v_pronargdefaults
  from pg_proc p
  where p.oid = v_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 148: % — owner deveria ser postgres (owner atual: %).', v_fn, coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 148: % — prosecdef deveria ser true (SECURITY DEFINER).', v_fn;
  end if;
  if v_provolatile is distinct from 'v' then
    raise exception 'postcheck 148: % — provolatile=% (esperado v / VOLATILE).', v_fn, v_provolatile;
  end if;
  if v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 148: % — proconfig deveria conter search_path=public.', v_fn;
  end if;
  if v_pronargs is distinct from 8 then
    raise exception 'postcheck 148: % — pronargs=% (esperado 8).', v_fn, v_pronargs;
  end if;
  if v_pronargdefaults is distinct from 7 then
    raise exception 'postcheck 148: % — pronargdefaults=% (esperado 7).', v_fn, v_pronargdefaults;
  end if;

  if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
    raise exception 'postcheck 148: % — anon NÃO deveria ter EXECUTE.', v_fn;
  end if;
  if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
    raise exception 'postcheck 148: % — service_role NÃO deveria ter EXECUTE.', v_fn;
  end if;
  if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
    raise exception 'postcheck 148: % — authenticated deveria continuar com EXECUTE.', v_fn;
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
    raise exception 'postcheck 148: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
  end if;

  -- ACL byte-a-byte idêntico ao snapshot do precheck — nenhum
  -- GRANT/REVOKE foi emitido; CREATE OR REPLACE preserva o ACL.
  select proacl into v_acl_antes from pg_temp._mig148_acl_snapshot where proname = v_fn;
  select p.proacl::text into v_acl_depois from pg_proc p where p.oid = v_oid;
  if v_acl_antes is distinct from v_acl_depois then
    raise exception 'postcheck 148: % — ACL mudou (antes=%, depois=%).', v_fn, v_acl_antes, v_acl_depois;
  end if;

  -- Return type continua jsonb.
  if (select p.prorettype from pg_proc p where p.oid = v_oid) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 148: % — return type deveria ser jsonb.', v_fn;
  end if;

  -- Guard presente exatamente 1 vez, com (null, null), sem operation_id.
  select count(*)
    into v_guard_count
  from regexp_matches(v_prosrc, 'app_assert_business_write_allowed', 'gi');
  if v_guard_count is distinct from 1 then
    raise exception 'postcheck 148: % — guard deveria aparecer exatamente 1 vez (count=%).', v_fn, v_guard_count;
  end if;
  if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
    raise exception 'postcheck 148: % — guard deveria ser app_assert_business_write_allowed(null, null).', v_fn;
  end if;
  if v_prosrc ~* 'operation_id' then
    raise exception 'postcheck 148: % — não deveria referenciar operation_id.', v_fn;
  end if;

  -- Ownership/session-token, exclusividade de mesa e o INSERT/UPSERT
  -- continuam existindo, exatamente como antes.
  if v_prosrc !~* 'device_session_mismatch' or v_prosrc !~* 'tab_user_sessions' then
    raise exception 'postcheck 148: % perdeu a verificação de ownership (tab_user_sessions/device_session_mismatch).', v_fn;
  end if;
  if v_prosrc !~* 'pg_advisory_xact_lock' or v_prosrc !~* 'mesa_em_uso_outro_dispositivo' then
    raise exception 'postcheck 148: % perdeu o advisory lock/checagem de exclusividade de mesa.', v_fn;
  end if;
  if v_prosrc !~* 'insert\s+into\s+public\.tab_dispositivos' then
    raise exception 'postcheck 148: % perdeu o INSERT em tab_dispositivos.', v_fn;
  end if;
  if v_prosrc !~* 'on\s+conflict\s*\(device_id\)\s*do\s+update' then
    raise exception 'postcheck 148: % perdeu o ON CONFLICT DO UPDATE em tab_dispositivos.', v_fn;
  end if;

  -- Guard aparece depois de toda a validação/ownership/advisory-lock e
  -- imediatamente antes do único INSERT de negócio (sem outro DML antes).
  -- Posições calculadas via regexp (prefixo não-guloso até o fim de cada
  -- trecho) para nunca embutir o texto literal exato da chamada do guard
  -- neste arquivo (o que inflaria contagens de guard em análise estática).
  declare
    v_fim_guard integer := char_length((regexp_match(
      v_prosrc,
      '^.*?perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;',
      'i'
    ))[1]);
    v_fim_insert integer := char_length((regexp_match(
      v_prosrc, '^.*?insert\s+into\s+public\.tab_dispositivos', 'i'
    ))[1]);
    v_fim_lock integer := char_length((regexp_match(
      v_prosrc, '^.*?pg_advisory_xact_lock', 'i'
    ))[1]);
  begin
    if v_fim_guard is null or v_fim_insert is null then
      raise exception 'postcheck 148: % — não foi possível localizar guard/INSERT no corpo compilado.', v_fn;
    end if;
    if v_fim_guard >= v_fim_insert then
      raise exception 'postcheck 148: % — guard deveria vir antes do INSERT.', v_fn;
    end if;
    if v_fim_lock is not null and v_fim_guard <= v_fim_lock then
      raise exception 'postcheck 148: % — guard deveria vir depois do advisory lock de mesa.', v_fn;
    end if;

    -- Trecho até o fim do guard inclui o próprio guard (que não contém
    -- "insert into public."), então a ausência do padrão aqui prova que
    -- nenhum INSERT de negócio ocorre antes dele.
    if substr(v_prosrc, 1, v_fim_guard) ~* 'insert\s+into\s+public\.' then
      raise exception 'postcheck 148: % — há um INSERT de negócio antes do guard.', v_fn;
    end if;
  end;

  -- RPCs/objetos fora de escopo: não redefinidos por esta migration
  -- (sem o guard, comprovando que o CREATE OR REPLACE não os tocou).
  foreach v_nome in array v_fora_de_escopo loop
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_nome
        and p.prosrc ilike '%app_assert_business_write_allowed%'
    ) then
      raise exception 'postcheck 148: public.% NÃO deveria conter o guard de manutenção (fora de escopo B10-B).', v_nome;
    end if;
  end loop;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 148: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
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
    raise exception 'postcheck 148: assert — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 148: assert — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 148: assert — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 148: assert — service_role NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;
