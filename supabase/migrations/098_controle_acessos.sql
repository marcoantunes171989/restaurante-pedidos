-- ════════════════════════════════════════════════════════════
--  098 — Controle de Acessos (sessões + eventos)
--  Consulta/auditoria de sessões ativas e histórico.
--  Idempotente. Isolamento multiempresa via loja_id + RLS/RPCs.
-- ════════════════════════════════════════════════════════════

-- ── Tabelas ─────────────────────────────────────────────────
create table if not exists public.tab_user_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           bigint not null references public.tab_usuarios(id) on delete cascade,
  loja_id           bigint,
  session_token     uuid not null unique,
  login_at          timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  logout_at         timestamptz,
  status            text not null default 'active'
                      check (status in ('active', 'closed')),
  ip_address        text,
  city              text,
  state             text,
  country           text,
  device_type       text,
  device_name       text,
  os                text,
  browser           text,
  browser_version   text,
  is_pwa            boolean not null default false,
  user_agent        text,
  login_method      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_user_sessions_user on public.tab_user_sessions (user_id);
create index if not exists idx_user_sessions_loja on public.tab_user_sessions (loja_id);
create index if not exists idx_user_sessions_status on public.tab_user_sessions (status);
create index if not exists idx_user_sessions_login on public.tab_user_sessions (login_at desc);
create index if not exists idx_user_sessions_activity on public.tab_user_sessions (last_activity_at desc);
create index if not exists idx_user_sessions_token on public.tab_user_sessions (session_token);

create table if not exists public.tab_access_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references public.tab_user_sessions(id) on delete set null,
  user_id      bigint,
  loja_id      bigint,
  event_type   text not null,
  route        text,
  description  text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_access_events_session on public.tab_access_events (session_id, created_at desc);
create index if not exists idx_access_events_loja on public.tab_access_events (loja_id, created_at desc);
create index if not exists idx_access_events_type on public.tab_access_events (event_type, created_at desc);
create index if not exists idx_access_events_user on public.tab_access_events (user_id, created_at desc);

-- ── updated_at trigger ──────────────────────────────────────
create or replace function public.tg_user_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_sessions_updated_at on public.tab_user_sessions;
create trigger trg_user_sessions_updated_at
  before update on public.tab_user_sessions
  for each row execute function public.tg_user_sessions_updated_at();

-- ── Pode ver controle de acessos? (admin do tenant ou super) ─
create or replace function public.app_pode_controle_acessos()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_ok  boolean;
begin
  if public.app_is_super() then
    return true;
  end if;
  if v_uid is null then
    return false;
  end if;
  select (u.ativo is true and 'admin' = any (coalesce(u.ids_acesso, '{}'::text[])))
    into v_ok
  from public.tab_usuarios u
  where u.id = v_uid
  limit 1;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.app_pode_controle_acessos() from public;
grant execute on function public.app_pode_controle_acessos() to authenticated, anon;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.tab_user_sessions enable row level security;
alter table public.tab_access_events enable row level security;

drop policy if exists "user_sessions_select" on public.tab_user_sessions;
create policy "user_sessions_select" on public.tab_user_sessions
  for select to authenticated
  using (
    public.app_is_super()
    or (
      public.app_pode_controle_acessos()
      and loja_id is not distinct from public.app_loja_id()
    )
    or user_id = public.app_usuario_id()
  );

drop policy if exists "user_sessions_insert_own" on public.tab_user_sessions;
create policy "user_sessions_insert_own" on public.tab_user_sessions
  for insert to authenticated
  with check (user_id = public.app_usuario_id());

drop policy if exists "user_sessions_update_own" on public.tab_user_sessions;
create policy "user_sessions_update_own" on public.tab_user_sessions
  for update to authenticated
  using (user_id = public.app_usuario_id())
  with check (user_id = public.app_usuario_id());

drop policy if exists "access_events_select" on public.tab_access_events;
create policy "access_events_select" on public.tab_access_events
  for select to authenticated
  using (
    public.app_is_super()
    or (
      public.app_pode_controle_acessos()
      and (loja_id is not distinct from public.app_loja_id() or loja_id is null)
    )
    or user_id = public.app_usuario_id()
  );

drop policy if exists "access_events_insert_own" on public.tab_access_events;
create policy "access_events_insert_own" on public.tab_access_events
  for insert to authenticated
  with check (
    user_id = public.app_usuario_id()
    or public.app_is_super()
  );

-- ── RPC: iniciar sessão ─────────────────────────────────────
create or replace function public.app_sessao_iniciar(
  p_session_token uuid,
  p_ip text default null,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_device_type text default null,
  p_device_name text default null,
  p_os text default null,
  p_browser text default null,
  p_browser_version text default null,
  p_is_pwa boolean default false,
  p_user_agent text default null,
  p_login_method text default 'password'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_loja bigint;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select u.loja_id into v_loja from public.tab_usuarios u where u.id = v_uid;

  -- Reutiliza sessão ativa do mesmo token (F5 / restore)
  select s.id into v_id
  from public.tab_user_sessions s
  where s.session_token = p_session_token
    and s.user_id = v_uid
    and s.status = 'active'
  limit 1;

  if v_id is not null then
    update public.tab_user_sessions
       set last_activity_at = now(),
           ip_address = coalesce(p_ip, ip_address),
           city = coalesce(p_city, city),
           state = coalesce(p_state, state),
           country = coalesce(p_country, country)
     where id = v_id;
    return v_id;
  end if;

  insert into public.tab_user_sessions (
    user_id, loja_id, session_token,
    ip_address, city, state, country,
    device_type, device_name, os, browser, browser_version,
    is_pwa, user_agent, login_method
  ) values (
    v_uid, v_loja, p_session_token,
    p_ip, p_city, p_state, p_country,
    p_device_type, p_device_name, p_os, p_browser, p_browser_version,
    coalesce(p_is_pwa, false), p_user_agent, coalesce(p_login_method, 'password')
  )
  returning id into v_id;

  insert into public.tab_access_events (session_id, user_id, loja_id, event_type, description)
  values (v_id, v_uid, v_loja, 'LOGIN', 'Login realizado');

  return v_id;
end;
$$;

revoke all on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
) from public;
grant execute on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
) to authenticated;

-- ── RPC: heartbeat ──────────────────────────────────────────
create or replace function public.app_sessao_heartbeat(p_session_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_n int;
begin
  if v_uid is null or p_session_token is null then
    return false;
  end if;
  update public.tab_user_sessions
     set last_activity_at = now()
   where session_token = p_session_token
     and user_id = v_uid
     and status = 'active';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.app_sessao_heartbeat(uuid) from public;
grant execute on function public.app_sessao_heartbeat(uuid) to authenticated;

-- ── RPC: encerrar sessão ────────────────────────────────────
create or replace function public.app_sessao_encerrar(
  p_session_token uuid,
  p_event_type text default 'LOGOUT'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_row public.tab_user_sessions%rowtype;
begin
  if v_uid is null or p_session_token is null then
    return false;
  end if;

  select * into v_row
  from public.tab_user_sessions
  where session_token = p_session_token
    and user_id = v_uid
    and status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  update public.tab_user_sessions
     set status = 'closed',
         logout_at = now(),
         last_activity_at = now()
   where id = v_row.id;

  insert into public.tab_access_events (session_id, user_id, loja_id, event_type, description)
  values (
    v_row.id, v_uid, v_row.loja_id,
    coalesce(nullif(p_event_type, ''), 'LOGOUT'),
    case coalesce(nullif(p_event_type, ''), 'LOGOUT')
      when 'SESSION_EXPIRED' then 'Sessão expirada'
      when 'SESSION_TIMEOUT' then 'Sessão encerrada por inatividade'
      else 'Logout realizado'
    end
  );

  return true;
end;
$$;

revoke all on function public.app_sessao_encerrar(uuid, text) from public;
grant execute on function public.app_sessao_encerrar(uuid, text) to authenticated;

-- ── RPC: listar sessões (admin) ─────────────────────────────
create or replace function public.app_listar_sessoes(
  p_modo text default 'online',          -- online | historico
  p_busca text default null,
  p_status text default null,            -- online|inativo|offline|closed|active (filtro UI)
  p_loja_id bigint default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_device_type text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id bigint,
  loja_id bigint,
  session_token uuid,
  login_at timestamptz,
  last_activity_at timestamptz,
  logout_at timestamptz,
  status text,
  presence text,
  ip_address text,
  city text,
  state text,
  country text,
  device_type text,
  device_name text,
  os text,
  browser text,
  browser_version text,
  is_pwa boolean,
  user_agent text,
  login_method text,
  usuario_nome text,
  usuario_email text,
  usuario_perfil text,
  loja_nome text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_loja bigint := public.app_loja_id();
  v_super boolean := public.app_is_super();
begin
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select
      s.*,
      case
        when s.status = 'closed' then 'offline'
        when s.last_activity_at >= now() - interval '2 minutes' then 'online'
        when s.last_activity_at >= now() - interval '10 minutes' then 'inativo'
        else 'offline'
      end as presence_calc,
      u.nome as u_nome,
      u.email as u_email,
      u.perfil as u_perfil,
      l.nome as l_nome
    from public.tab_user_sessions s
    join public.tab_usuarios u on u.id = s.user_id
    left join public.tab_lojas l on l.id = s.loja_id
    where (
      v_super
      or s.loja_id is not distinct from v_loja
    )
    and (
      p_loja_id is null
      or s.loja_id = p_loja_id
    )
    and (
      p_desde is null or s.login_at >= p_desde
    )
    and (
      p_ate is null or s.login_at <= p_ate
    )
    and (
      p_device_type is null or p_device_type = '' or s.device_type = p_device_type
    )
    and (
      p_busca is null or p_busca = ''
      or u.nome ilike '%' || p_busca || '%'
      or u.email ilike '%' || p_busca || '%'
    )
    and (
      case coalesce(p_modo, 'online')
        when 'online' then s.status = 'active'
          and s.last_activity_at >= now() - interval '10 minutes'
        when 'historico' then true
        else true
      end
    )
  ),
  filtrado as (
    select b.*
    from base b
    where (
      p_status is null or p_status = '' or p_status = 'todos'
      or (p_status = 'closed' and b.status = 'closed')
      or (p_status = 'active' and b.status = 'active')
      or (p_status in ('online', 'inativo', 'offline') and b.presence_calc = p_status)
    )
  ),
  contado as (
    select count(*)::bigint as c from filtrado
  )
  select
    f.id, f.user_id, f.loja_id, f.session_token,
    f.login_at, f.last_activity_at, f.logout_at, f.status,
    f.presence_calc,
    f.ip_address, f.city, f.state, f.country,
    f.device_type, f.device_name, f.os, f.browser, f.browser_version,
    f.is_pwa, f.user_agent, f.login_method,
    f.u_nome, f.u_email, f.u_perfil, f.l_nome,
    (select c from contado)
  from filtrado f
  order by
    case when coalesce(p_modo, 'online') = 'online' then f.last_activity_at end desc nulls last,
    f.login_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.app_listar_sessoes(
  text, text, text, bigint, timestamptz, timestamptz, text, int, int
) from public;
grant execute on function public.app_listar_sessoes(
  text, text, text, bigint, timestamptz, timestamptz, text, int, int
) to authenticated;

-- ── RPC: métricas ───────────────────────────────────────────
create or replace function public.app_sessoes_metricas(
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_loja_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_loja bigint := public.app_loja_id();
  v_super boolean := public.app_is_super();
  v_online int;
  v_hoje int;
  v_media_seg numeric;
  v_devices int;
  v_negados int;
  v_ini timestamptz := coalesce(p_desde, date_trunc('day', now()));
  v_fim timestamptz := coalesce(p_ate, now());
begin
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;

  select count(*)::int into v_online
  from public.tab_user_sessions s
  where s.status = 'active'
    and s.last_activity_at >= now() - interval '2 minutes'
    and (v_super or s.loja_id is not distinct from v_loja)
    and (p_loja_id is null or s.loja_id = p_loja_id);

  select count(*)::int into v_hoje
  from public.tab_user_sessions s
  where s.login_at >= date_trunc('day', now())
    and (v_super or s.loja_id is not distinct from v_loja)
    and (p_loja_id is null or s.loja_id = p_loja_id);

  select coalesce(avg(
    extract(epoch from (coalesce(s.logout_at, s.last_activity_at) - s.login_at))
  ), 0) into v_media_seg
  from public.tab_user_sessions s
  where s.login_at >= v_ini and s.login_at <= v_fim
    and (v_super or s.loja_id is not distinct from v_loja)
    and (p_loja_id is null or s.loja_id = p_loja_id);

  select count(distinct coalesce(s.device_type, '') || '|' || coalesce(s.os, '') || '|' || coalesce(s.browser, ''))::int
    into v_devices
  from public.tab_user_sessions s
  where s.login_at >= v_ini and s.login_at <= v_fim
    and (v_super or s.loja_id is not distinct from v_loja)
    and (p_loja_id is null or s.loja_id = p_loja_id);

  select count(*)::int into v_negados
  from public.tab_access_events e
  where e.event_type = 'LOGIN_DENIED'
    and e.created_at >= v_ini and e.created_at <= v_fim
    and (v_super or e.loja_id is not distinct from v_loja or e.loja_id is null)
    and (p_loja_id is null or e.loja_id = p_loja_id or e.loja_id is null);

  return jsonb_build_object(
    'online', v_online,
    'sessoes_hoje', v_hoje,
    'tempo_medio_seg', round(v_media_seg)::bigint,
    'dispositivos', v_devices,
    'acessos_negados', v_negados
  );
end;
$$;

revoke all on function public.app_sessoes_metricas(timestamptz, timestamptz, bigint) from public;
grant execute on function public.app_sessoes_metricas(timestamptz, timestamptz, bigint) to authenticated;

-- ── RPC: eventos de uma sessão / segurança ──────────────────
create or replace function public.app_listar_eventos_acesso(
  p_session_id uuid default null,
  p_tipos text[] default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  session_id uuid,
  user_id bigint,
  loja_id bigint,
  event_type text,
  route text,
  description text,
  metadata jsonb,
  created_at timestamptz,
  usuario_nome text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_loja bigint := public.app_loja_id();
  v_super boolean := public.app_is_super();
begin
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select e.*, u.nome as u_nome
    from public.tab_access_events e
    left join public.tab_usuarios u on u.id = e.user_id
    where (v_super or e.loja_id is not distinct from v_loja or e.loja_id is null)
      and (p_session_id is null or e.session_id = p_session_id)
      and (p_tipos is null or e.event_type = any (p_tipos))
      and (p_desde is null or e.created_at >= p_desde)
      and (p_ate is null or e.created_at <= p_ate)
  ),
  contado as (select count(*)::bigint as c from base)
  select
    b.id, b.session_id, b.user_id, b.loja_id, b.event_type, b.route,
    b.description, b.metadata, b.created_at, b.u_nome,
    (select c from contado)
  from base b
  order by b.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.app_listar_eventos_acesso(
  uuid, text[], timestamptz, timestamptz, int, int
) from public;
grant execute on function public.app_listar_eventos_acesso(
  uuid, text[], timestamptz, timestamptz, int, int
) to authenticated;
