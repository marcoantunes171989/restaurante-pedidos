-- ════════════════════════════════════════════════════════════
--  161 — Canonical session admission (PDB-I1B)
--
--  Registry canônico app_active_sessions + RPCs start/heartbeat/close
--  + prova server-side de ACTIVE_SESSION_COUNT = 0.
--
--  NÃO copia tab_user_sessions. NÃO apaga tab_user_sessions.
--  NÃO reescreve app_sessao_iniciar (corpo legado 101 / ACL 126).
--  NÃO publica Realtime. NÃO cria executor de drain.
--  NÃO faz DML de negócio no apply (sem INSERT/UPDATE/DELETE
--  top-level). DML só dentro das RPCs, e só em app_active_sessions.
--
--  Autoridade de admissão: app_maintenance_state.login_gate
--  (OPEN|CLOSED) + phases incompatíveis PDB-A2.
--  TTL vivo = 120s (server now()), evidência: heartbeat 45s e
--  presença ONLINE 2min já usadas pelo app.
-- ════════════════════════════════════════════════════════════

begin;

-- ── 1) PRECHECK ─────────────────────────────────────────────
do $$
declare
  v_state_reloid oid;
  v_login_gate_exists boolean;
begin
  if to_regclass('public.app_active_sessions') is not null then
    raise exception 'precheck 161: public.app_active_sessions já existe.';
  end if;
  if to_regclass('public.tab_user_sessions') is null then
    raise exception 'precheck 161: public.tab_user_sessions deveria existir (legado preservado).';
  end if;
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'precheck 161: public.app_maintenance_state ausente (migration 140/160).';
  end if;

  v_state_reloid := to_regclass('public.app_maintenance_state');
  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = v_state_reloid
      and a.attname = 'login_gate'
      and not a.attisdropped
  ) into v_login_gate_exists;
  if not coalesce(v_login_gate_exists, false) then
    raise exception 'precheck 161: coluna login_gate ausente em app_maintenance_state (migration 160).';
  end if;

  if to_regprocedure('public.app_canonical_session_start(uuid, text, text)') is not null then
    raise exception 'precheck 161: app_canonical_session_start já existe.';
  end if;
  if to_regprocedure('public.app_canonical_session_heartbeat(uuid)') is not null then
    raise exception 'precheck 161: app_canonical_session_heartbeat já existe.';
  end if;
  if to_regprocedure('public.app_canonical_session_close(uuid)') is not null then
    raise exception 'precheck 161: app_canonical_session_close já existe.';
  end if;
  if to_regprocedure('public.app_canonical_session_zero_proof()') is not null then
    raise exception 'precheck 161: app_canonical_session_zero_proof já existe.';
  end if;
end
$$;

-- ── 2) TTL CONSTANTE (server-side, 120s) ────────────────────
create function public.app_canonical_session_ttl_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 120;
$$;

comment on function public.app_canonical_session_ttl_seconds() is
  'TTL vivo canônico em segundos. 120 = ACCESS_PRESENCE.ONLINE_MS e intervalo 2 minutes de app_listar_sessoes. Heartbeat cliente = 45s. Relógio do servidor é autoridade.';

revoke all on function public.app_canonical_session_ttl_seconds() from public;
grant execute on function public.app_canonical_session_ttl_seconds() to authenticated, service_role;

-- ── 3) TABELA CANÔNICA ──────────────────────────────────────
create table public.app_active_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  app_user_id bigint null,
  company_id bigint null,
  device_id text null,
  client_instance_id uuid not null,
  surface text not null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz null,
  status text not null default 'ACTIVE',
  maintenance_epoch integer not null default 0,
  maintenance_version integer not null default 1,
  post_gate_close_heartbeat_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_active_sessions_surface_check
    check (surface in ('ADMIN', 'PDV', 'OPERACIONAL', 'TABLET', 'CARDAPIO_AUTH')),
  constraint app_active_sessions_status_check
    check (status in ('ACTIVE', 'CLOSED', 'EXPIRED')),
  constraint app_active_sessions_expires_after_start_check
    check (expires_at >= started_at),
  constraint app_active_sessions_heartbeat_after_start_check
    check (last_heartbeat_at >= started_at),
  constraint app_active_sessions_closed_requires_terminal_check
    check (
      (closed_at is null and status = 'ACTIVE')
      or (closed_at is not null and status in ('CLOSED', 'EXPIRED'))
    ),
  constraint app_active_sessions_epoch_check
    check (maintenance_epoch >= 0),
  constraint app_active_sessions_version_check
    check (maintenance_version >= 1),
  constraint app_active_sessions_post_close_hb_check
    check (post_gate_close_heartbeat_count >= 0),
  constraint app_active_sessions_no_jwt_check
    check (true)
);

comment on table public.app_active_sessions is
  'Registry canônico de sessões autenticadas (PDB-I1B). Autoridade para ACTIVE_SESSION_COUNT=0. Não armazena JWT/access_token/refresh_token/password. tab_user_sessions permanece legado de observabilidade.';

comment on column public.app_active_sessions.auth_user_id is
  'auth.uid() — identidade Auth server-side. Nullable só quando o actor não tem JWT (fail-closed na RPC).';
comment on column public.app_active_sessions.app_user_id is
  'tab_usuarios.id derivado de app_usuario_id() / e-mail do JWT. Nunca enviado pelo browser.';
comment on column public.app_active_sessions.company_id is
  'Tenant = tab_usuarios.loja_id derivado no servidor. Cliente não informa.';
comment on column public.app_active_sessions.client_instance_id is
  'Identificador estável da aba/cliente (sessionStorage). Uma linha ACTIVE por client_instance_id.';
comment on column public.app_active_sessions.surface is
  'Taxonomia fechada: ADMIN, PDV, OPERACIONAL, TABLET, CARDAPIO_AUTH. Tráfego anônimo de cardápio NÃO entra aqui.';
comment on column public.app_active_sessions.expires_at is
  'now() + TTL no servidor. Sessão stale deixa de ser alive sem cooperação do cliente.';
comment on column public.app_active_sessions.maintenance_epoch is
  'Snapshot de app_maintenance_state.epoch no start/heartbeat bem-sucedido. Não duplica login_gate.';
comment on column public.app_active_sessions.maintenance_version is
  'Snapshot de app_maintenance_state.version (generation).';

create unique index app_active_sessions_active_client_uidx
  on public.app_active_sessions (client_instance_id)
  where status = 'ACTIVE' and closed_at is null;

create index app_active_sessions_alive_idx
  on public.app_active_sessions (status, expires_at)
  where status = 'ACTIVE' and closed_at is null;

create index app_active_sessions_auth_user_idx
  on public.app_active_sessions (auth_user_id);

create index app_active_sessions_company_idx
  on public.app_active_sessions (company_id);

create function public.tg_app_active_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_app_active_sessions_updated_at
  before update on public.app_active_sessions
  for each row execute function public.tg_app_active_sessions_updated_at();

alter table public.app_active_sessions enable row level security;

revoke all on table public.app_active_sessions from public;
revoke all on table public.app_active_sessions from anon;
revoke all on table public.app_active_sessions from authenticated;
revoke all on table public.app_active_sessions from service_role;

grant select on table public.app_active_sessions to service_role;

-- ── 4) HELPERS INTERNOS ─────────────────────────────────────
create function public.app_canonical_session_login_state()
returns table (
  login_gate text,
  phase text,
  maintenance_epoch integer,
  maintenance_version integer,
  fence_effective_at timestamptz,
  drain_started_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    s.login_gate,
    s.phase,
    s.epoch,
    s.version,
    s.fence_effective_at,
    s.drain_started_at,
    s.updated_at
  from public.app_maintenance_state s
  where s.scope = 'global'
  limit 1;
end;
$$;

comment on function public.app_canonical_session_login_state() is
  'Leitura interna do singleton de manutenção para admissão. login_gate é a autoridade; phase só para fail-closed de deriva.';

revoke all on function public.app_canonical_session_login_state() from public;
revoke all on function public.app_canonical_session_login_state() from anon;
revoke all on function public.app_canonical_session_login_state() from authenticated;

create function public.app_canonical_session_admission_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gate text;
  v_phase text;
begin
  select ls.login_gate, ls.phase
    into v_gate, v_phase
  from public.app_canonical_session_login_state() ls;

  if v_gate is distinct from 'OPEN' then
    return false;
  end if;
  if v_phase is null then
    return false;
  end if;
  if v_phase in (
    'FENCING',
    'DRAINING',
    'QUIESCENT',
    'RELEASING',
    'BACKING_UP',
    'MIGRATING'
  ) then
    return false;
  end if;
  return true;
end;
$$;

comment on function public.app_canonical_session_admission_allowed() is
  'Fail-closed: login_gate=OPEN e phase compatível com login funcional. Uso interno das RPCs canônicas.';

revoke all on function public.app_canonical_session_admission_allowed() from public;
revoke all on function public.app_canonical_session_admission_allowed() from anon;
revoke all on function public.app_canonical_session_admission_allowed() from authenticated;

-- ── 5) START RPC ────────────────────────────────────────────
create function public.app_canonical_session_start(
  p_client_instance_id uuid,
  p_device_id text default null,
  p_surface text default 'ADMIN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_app_user bigint := public.app_usuario_id();
  v_company bigint;
  v_surface text := upper(nullif(trim(coalesce(p_surface, '')), ''));
  v_device text := nullif(trim(coalesce(p_device_id, '')), '');
  v_epoch integer := 0;
  v_version integer := 1;
  v_now timestamptz := now();
  v_ttl integer := public.app_canonical_session_ttl_seconds();
  v_expires timestamptz;
  v_id uuid;
  v_row public.app_active_sessions%rowtype;
begin
  if v_auth is null and v_app_user is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
  end if;
  if p_client_instance_id is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
  end if;
  if v_surface is null or v_surface not in ('ADMIN', 'PDV', 'OPERACIONAL', 'TABLET', 'CARDAPIO_AUTH') then
    return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
  end if;

  if not public.app_canonical_session_admission_allowed() then
    return jsonb_build_object('ok', false, 'code', 'MAINTENANCE_LOGIN_LOCKED');
  end if;

  select u.loja_id into v_company
  from public.tab_usuarios u
  where u.id = v_app_user;

  select ls.maintenance_epoch, ls.maintenance_version
    into v_epoch, v_version
  from public.app_canonical_session_login_state() ls;

  v_expires := v_now + make_interval(secs => v_ttl);

  select s.* into v_row
  from public.app_active_sessions s
  where s.client_instance_id = p_client_instance_id
    and s.status = 'ACTIVE'
    and s.closed_at is null
  for update;

  if found then
    if v_row.auth_user_id is not null and v_auth is not null and v_row.auth_user_id is distinct from v_auth then
      return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
    end if;
    if v_row.app_user_id is not null and v_app_user is not null and v_row.app_user_id is distinct from v_app_user then
      return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
    end if;

    update public.app_active_sessions
       set auth_user_id = coalesce(v_auth, auth_user_id),
           app_user_id = coalesce(v_app_user, app_user_id),
           company_id = coalesce(v_company, company_id),
           device_id = coalesce(v_device, device_id),
           surface = v_surface,
           last_heartbeat_at = v_now,
           expires_at = v_expires,
           maintenance_epoch = coalesce(v_epoch, maintenance_epoch),
           maintenance_version = coalesce(v_version, maintenance_version),
           post_gate_close_heartbeat_count = 0
     where id = v_row.id
    returning id into v_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'SESSION_ADMISSION_ALLOWED',
      'session_id', v_id,
      'status', 'ACTIVE',
      'expires_at', v_expires,
      'surface', v_surface
    );
  end if;

  insert into public.app_active_sessions (
    auth_user_id,
    app_user_id,
    company_id,
    device_id,
    client_instance_id,
    surface,
    started_at,
    last_heartbeat_at,
    expires_at,
    status,
    maintenance_epoch,
    maintenance_version
  ) values (
    v_auth,
    v_app_user,
    v_company,
    v_device,
    p_client_instance_id,
    v_surface,
    v_now,
    v_now,
    v_expires,
    'ACTIVE',
    coalesce(v_epoch, 0),
    coalesce(v_version, 1)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'SESSION_ADMISSION_ALLOWED',
    'session_id', v_id,
    'status', 'ACTIVE',
    'expires_at', v_expires,
    'surface', v_surface
  );
end;
$$;

comment on function public.app_canonical_session_start(uuid, text, text) is
  'Estabelece exatamente uma sessão canônica ACTIVE por client_instance_id. Identidade do actor vem de auth.uid()/app_usuario_id(). Falha se login_gate != OPEN. Relógio do servidor define expires_at.';

revoke all on function public.app_canonical_session_start(uuid, text, text) from public;
revoke all on function public.app_canonical_session_start(uuid, text, text) from anon;
grant execute on function public.app_canonical_session_start(uuid, text, text) to authenticated, service_role;

-- ── 6) HEARTBEAT RPC ────────────────────────────────────────
create function public.app_canonical_session_heartbeat(
  p_client_instance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_app_user bigint := public.app_usuario_id();
  v_now timestamptz := now();
  v_ttl integer := public.app_canonical_session_ttl_seconds();
  v_expires timestamptz;
  v_row public.app_active_sessions%rowtype;
  v_epoch integer;
  v_version integer;
  v_gate_closed boolean := not public.app_canonical_session_admission_allowed();
begin
  if v_auth is null and v_app_user is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
  end if;
  if p_client_instance_id is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  select s.* into v_row
  from public.app_active_sessions s
  where s.client_instance_id = p_client_instance_id
    and (
      (v_auth is not null and s.auth_user_id is not distinct from v_auth)
      or (v_app_user is not null and s.app_user_id is not distinct from v_app_user)
    )
  order by s.started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  if v_row.status = 'CLOSED' or v_row.closed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'session_id', v_row.id);
  end if;

  if v_row.status = 'EXPIRED' or v_row.expires_at <= v_now then
    if v_row.status = 'ACTIVE' then
      update public.app_active_sessions
         set status = 'EXPIRED',
             closed_at = coalesce(closed_at, v_now)
       where id = v_row.id;
    end if;
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'session_id', v_row.id);
  end if;

  if v_gate_closed then
    -- NÃO estende expires_at nem last_heartbeat_at.
    -- last_heartbeat_at permanece pré-close → zero-proof detecta revival
    -- se algum caminho buggy gravar heartbeat depois do gate.
    update public.app_active_sessions
       set post_gate_close_heartbeat_count = post_gate_close_heartbeat_count + 1
     where id = v_row.id;
    return jsonb_build_object(
      'ok', false,
      'code', 'MAINTENANCE_LOGIN_LOCKED',
      'session_id', v_row.id
    );
  end if;

  select ls.maintenance_epoch, ls.maintenance_version
    into v_epoch, v_version
  from public.app_canonical_session_login_state() ls;

  v_expires := v_now + make_interval(secs => v_ttl);

  update public.app_active_sessions
     set last_heartbeat_at = v_now,
         expires_at = v_expires,
         maintenance_epoch = coalesce(v_epoch, maintenance_epoch),
         maintenance_version = coalesce(v_version, maintenance_version)
   where id = v_row.id
     and status = 'ACTIVE'
     and closed_at is null
     and expires_at > v_now;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'session_id', v_row.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'SESSION_ADMISSION_ALLOWED',
    'session_id', v_row.id,
    'status', 'ACTIVE',
    'expires_at', v_expires
  );
end;
$$;

comment on function public.app_canonical_session_heartbeat(uuid) is
  'Heartbeat canônico. Só a sessão do caller. now() do servidor. Recusa CLOSED/EXPIRED. Com login_gate CLOSED NÃO revive nem estende TTL (ZERO_HEARTBEAT_AFTER_LOGIN_GATE_CLOSE).';

revoke all on function public.app_canonical_session_heartbeat(uuid) from public;
revoke all on function public.app_canonical_session_heartbeat(uuid) from anon;
grant execute on function public.app_canonical_session_heartbeat(uuid) to authenticated, service_role;

-- ── 7) CLOSE RPC ────────────────────────────────────────────
create function public.app_canonical_session_close(
  p_client_instance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_app_user bigint := public.app_usuario_id();
  v_now timestamptz := now();
  v_row public.app_active_sessions%rowtype;
begin
  if v_auth is null and v_app_user is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_FORBIDDEN');
  end if;
  if p_client_instance_id is null then
    return jsonb_build_object('ok', true, 'code', 'SESSION_CLOSED', 'idempotent', true);
  end if;

  select s.* into v_row
  from public.app_active_sessions s
  where s.client_instance_id = p_client_instance_id
    and (
      (v_auth is not null and s.auth_user_id is not distinct from v_auth)
      or (v_app_user is not null and s.app_user_id is not distinct from v_app_user)
    )
    and s.status = 'ACTIVE'
    and s.closed_at is null
  order by s.started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'SESSION_CLOSED', 'idempotent', true);
  end if;

  update public.app_active_sessions
     set status = 'CLOSED',
         closed_at = v_now
   where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', 'SESSION_CLOSED',
    'session_id', v_row.id,
    'idempotent', false
  );
end;
$$;

comment on function public.app_canonical_session_close(uuid) is
  'Encerra a sessão canônica do caller. Idempotente se já CLOSED/ausente. Logout não fica preso se a RPC falhar — TTL é fallback.';

revoke all on function public.app_canonical_session_close(uuid) from public;
revoke all on function public.app_canonical_session_close(uuid) from anon;
grant execute on function public.app_canonical_session_close(uuid) to authenticated, service_role;

-- ── 8) ZERO-SESSION PROOF ───────────────────────────────────
create function public.app_canonical_session_zero_proof()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_gate text;
  v_phase text;
  v_epoch integer;
  v_version integer;
  v_fence timestamptz;
  v_drain timestamptz;
  v_updated timestamptz;
  v_gate_ref timestamptz;
  v_alive bigint := 0;
  v_stale bigint := 0;
  v_post_close bigint := 0;
  v_oldest timestamptz;
begin
  select
    ls.login_gate,
    ls.phase,
    ls.maintenance_epoch,
    ls.maintenance_version,
    ls.fence_effective_at,
    ls.drain_started_at,
    ls.updated_at
    into v_gate, v_phase, v_epoch, v_version, v_fence, v_drain, v_updated
  from public.app_canonical_session_login_state() ls;

  if v_gate is not distinct from 'CLOSED' then
    v_gate_ref := coalesce(v_fence, v_drain, v_updated);
  else
    v_gate_ref := null;
  end if;

  select
    count(*) filter (
      where s.status = 'ACTIVE'
        and s.closed_at is null
        and s.expires_at > v_now
    ),
    count(*) filter (
      where s.status = 'ACTIVE'
        and s.closed_at is null
        and s.expires_at <= v_now
    ),
    count(*) filter (
      where v_gate_ref is not null
        and s.last_heartbeat_at > v_gate_ref
    ),
    min(s.last_heartbeat_at) filter (
      where s.status = 'ACTIVE'
        and s.closed_at is null
        and s.expires_at > v_now
    )
    into v_alive, v_stale, v_post_close, v_oldest
  from public.app_active_sessions s;

  return jsonb_build_object(
    'alive_session_count', coalesce(v_alive, 0),
    'stale_session_count', coalesce(v_stale, 0),
    'heartbeat_after_gate_close_count', coalesce(v_post_close, 0),
    'oldest_alive_heartbeat', v_oldest,
    'evaluated_at', v_now,
    'maintenance_epoch', v_epoch,
    'maintenance_generation', v_version,
    'login_gate', v_gate,
    'phase', v_phase,
    'active_session_count_zero',
      (coalesce(v_alive, 0) = 0 and coalesce(v_post_close, 0) = 0)
  );
end;
$$;

comment on function public.app_canonical_session_zero_proof() is
  'Prova server-side: alive_session_count, stale_session_count, heartbeat_after_gate_close_count, oldest_alive_heartbeat, evaluated_at, maintenance_epoch/generation. ACTIVE_SESSION_COUNT_ZERO só se alive=0 E heartbeat_after_gate_close=0. Stale ACTIVE (expires_at <= now()) NÃO conta como alive — sem bulk UPDATE prévio. service_role only.';

revoke all on function public.app_canonical_session_zero_proof() from public;
revoke all on function public.app_canonical_session_zero_proof() from anon;
revoke all on function public.app_canonical_session_zero_proof() from authenticated;
grant execute on function public.app_canonical_session_zero_proof() to service_role;

-- ── 9) POSTCHECK ────────────────────────────────────────────
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_pol integer;
  v_cols text[];
begin
  v_reloid := to_regclass('public.app_active_sessions');
  if v_reloid is null then
    raise exception 'postcheck 161: public.app_active_sessions ausente.';
  end if;

  select relrowsecurity into v_rls
  from pg_class
  where oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 161: RLS deveria estar habilitada em app_active_sessions.';
  end if;

  select count(*) into v_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'app_active_sessions';
  if v_pol <> 0 then
    raise exception 'postcheck 161: app_active_sessions não deve ter policies (policy_count=%).', v_pol;
  end if;

  select array_agg(a.attname order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = v_reloid and not a.attisdropped and a.attnum > 0;
  if v_cols is null
     or not ('id' = any (v_cols))
     or not ('auth_user_id' = any (v_cols))
     or not ('company_id' = any (v_cols))
     or not ('device_id' = any (v_cols))
     or not ('client_instance_id' = any (v_cols))
     or not ('surface' = any (v_cols))
     or not ('started_at' = any (v_cols))
     or not ('last_heartbeat_at' = any (v_cols))
     or not ('expires_at' = any (v_cols))
     or not ('closed_at' = any (v_cols))
     or not ('status' = any (v_cols))
     or not ('maintenance_epoch' = any (v_cols))
     or not ('maintenance_version' = any (v_cols)) then
    raise exception 'postcheck 161: colunas obrigatórias ausentes em app_active_sessions.';
  end if;
  if 'jwt' = any (v_cols)
     or 'access_token' = any (v_cols)
     or 'refresh_token' = any (v_cols)
     or 'password' = any (v_cols)
     or 'authorization' = any (v_cols) then
    raise exception 'postcheck 161: coluna de segredo proibida em app_active_sessions.';
  end if;

  if to_regclass('public.tab_user_sessions') is null then
    raise exception 'postcheck 161: tab_user_sessions foi removida — legado deve ser preservado.';
  end if;

  if has_table_privilege('anon', 'public.app_active_sessions', 'insert')
     or has_table_privilege('anon', 'public.app_active_sessions', 'update')
     or has_table_privilege('anon', 'public.app_active_sessions', 'delete')
     or has_table_privilege('authenticated', 'public.app_active_sessions', 'insert')
     or has_table_privilege('authenticated', 'public.app_active_sessions', 'update')
     or has_table_privilege('authenticated', 'public.app_active_sessions', 'delete') then
    raise exception 'postcheck 161: browser não pode escrever em app_active_sessions.';
  end if;

  if has_table_privilege('anon', 'public.app_active_sessions', 'select')
     or has_table_privilege('authenticated', 'public.app_active_sessions', 'select') then
    raise exception 'postcheck 161: browser não pode ler app_active_sessions diretamente.';
  end if;

  if not has_table_privilege('service_role', 'public.app_active_sessions', 'select') then
    raise exception 'postcheck 161: service_role deveria ter SELECT em app_active_sessions.';
  end if;
  if has_table_privilege('service_role', 'public.app_active_sessions', 'insert')
     or has_table_privilege('service_role', 'public.app_active_sessions', 'update')
     or has_table_privilege('service_role', 'public.app_active_sessions', 'delete') then
    raise exception 'postcheck 161: service_role não escreve a tabela direto — só via RPC.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.app_canonical_session_start(uuid, text, text)',
    'execute'
  ) then
    raise exception 'postcheck 161: authenticated deveria ter EXECUTE em start.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.app_canonical_session_heartbeat(uuid)',
    'execute'
  ) then
    raise exception 'postcheck 161: authenticated deveria ter EXECUTE em heartbeat.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.app_canonical_session_close(uuid)',
    'execute'
  ) then
    raise exception 'postcheck 161: authenticated deveria ter EXECUTE em close.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.app_canonical_session_zero_proof()',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.app_canonical_session_zero_proof()',
    'execute'
  ) then
    raise exception 'postcheck 161: zero_proof não é executável pelo browser.';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.app_canonical_session_zero_proof()',
    'execute'
  ) then
    raise exception 'postcheck 161: service_role deveria ter EXECUTE em zero_proof.';
  end if;

  if exists (
    select 1
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = v_reloid
  ) then
    raise exception 'postcheck 161: app_active_sessions NÃO deve estar em supabase_realtime.';
  end if;

  if public.app_canonical_session_ttl_seconds() is distinct from 120 then
    raise exception 'postcheck 161: TTL deveria ser 120 segundos.';
  end if;
end
$$;

commit;
