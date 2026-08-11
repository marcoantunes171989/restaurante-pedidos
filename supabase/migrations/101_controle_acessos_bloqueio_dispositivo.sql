-- ════════════════════════════════════════════════════════════
--  101 — Bloqueio de dispositivo + device_id nas sessões
--  - Persiste pp_device_id em tab_user_sessions
--  - Lista de dispositivos bloqueados (login/sessão negados)
--  - Bloquear encerra sessões ativas daquele aparelho
--  Idempotente.
-- ════════════════════════════════════════════════════════════

-- ── Coluna device_id nas sessões ────────────────────────────
alter table public.tab_user_sessions
  add column if not exists device_id text;

create index if not exists idx_user_sessions_device
  on public.tab_user_sessions (device_id)
  where device_id is not null;

-- ── Tabela de bloqueios ─────────────────────────────────────
create table if not exists public.tab_dispositivos_bloqueados (
  id              uuid primary key default gen_random_uuid(),
  device_id       text not null,
  loja_id         bigint,
  user_id         bigint references public.tab_usuarios(id) on delete set null,
  motivo          text,
  device_label    text,
  os              text,
  browser         text,
  ip_address      text,
  blocked_by      bigint references public.tab_usuarios(id) on delete set null,
  blocked_at      timestamptz not null default now(),
  unblocked_at    timestamptz,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index if not exists uq_disp_bloqueado_ativo
  on public.tab_dispositivos_bloqueados (device_id)
  where ativo is true;

create index if not exists idx_disp_bloqueado_loja
  on public.tab_dispositivos_bloqueados (loja_id, ativo);

alter table public.tab_dispositivos_bloqueados enable row level security;

drop policy if exists "disp_bloqueados_select" on public.tab_dispositivos_bloqueados;
create policy "disp_bloqueados_select" on public.tab_dispositivos_bloqueados
  for select to authenticated
  using (
    public.app_is_super()
    or (
      public.app_pode_controle_acessos()
      and (loja_id is not distinct from public.app_loja_id() or loja_id is null)
    )
  );

-- ── Consulta pública (login): dispositivo bloqueado? ────────
create or replace function public.app_dispositivo_esta_bloqueado(p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.tab_dispositivos_bloqueados%rowtype;
begin
  if p_device_id is null or trim(p_device_id) = '' then
    return jsonb_build_object('blocked', false);
  end if;

  select * into v_row
  from public.tab_dispositivos_bloqueados b
  where b.device_id = trim(p_device_id)
    and b.ativo is true
  order by b.blocked_at desc
  limit 1;

  if not found then
    return jsonb_build_object('blocked', false);
  end if;

  return jsonb_build_object(
    'blocked', true,
    'motivo', coalesce(nullif(trim(v_row.motivo), ''), 'Dispositivo bloqueado pelo administrador'),
    'mensagem', 'Este dispositivo está bloqueado. Procure o canal de suporte para auxiliar com o acesso.',
    'blocked_at', v_row.blocked_at
  );
end;
$$;

revoke all on function public.app_dispositivo_esta_bloqueado(text) from public;
grant execute on function public.app_dispositivo_esta_bloqueado(text) to authenticated, anon;

-- ── Bloquear dispositivo (admin) ────────────────────────────
create or replace function public.app_dispositivo_bloquear(
  p_device_id text,
  p_motivo text default null,
  p_session_id uuid default null,
  p_user_id bigint default null,
  p_loja_id bigint default null,
  p_device_label text default null,
  p_os text default null,
  p_browser text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.app_usuario_id();
  v_loja bigint;
  v_sess public.tab_user_sessions%rowtype;
  v_id uuid;
  v_encerradas int := 0;
  v_dev text := nullif(trim(coalesce(p_device_id, '')), '');
begin
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;
  if v_dev is null then
    raise exception 'invalid_device';
  end if;

  if p_session_id is not null then
    select * into v_sess from public.tab_user_sessions where id = p_session_id limit 1;
    if found then
      if v_dev is null then v_dev := v_sess.device_id; end if;
      p_user_id := coalesce(p_user_id, v_sess.user_id);
      p_loja_id := coalesce(p_loja_id, v_sess.loja_id);
      p_os := coalesce(p_os, v_sess.os);
      p_browser := coalesce(p_browser, v_sess.browser);
      p_ip := coalesce(p_ip, v_sess.ip_address);
      p_device_label := coalesce(
        p_device_label,
        trim(both ' •' from concat_ws(' • ', v_sess.os, v_sess.browser, v_sess.device_type))
      );
    end if;
  end if;

  if v_dev is null then
    raise exception 'invalid_device';
  end if;

  v_loja := coalesce(p_loja_id, public.app_loja_id());

  if not public.app_is_super()
     and v_loja is distinct from public.app_loja_id() then
    raise exception 'forbidden';
  end if;

  -- Já bloqueado → reforça
  update public.tab_dispositivos_bloqueados
     set motivo = coalesce(nullif(trim(p_motivo), ''), motivo),
         device_label = coalesce(p_device_label, device_label),
         os = coalesce(p_os, os),
         browser = coalesce(p_browser, browser),
         ip_address = coalesce(p_ip, ip_address),
         user_id = coalesce(p_user_id, user_id),
         loja_id = coalesce(v_loja, loja_id),
         blocked_by = v_admin,
         blocked_at = now(),
         unblocked_at = null,
         ativo = true
   where device_id = v_dev
     and ativo is true
  returning id into v_id;

  if v_id is null then
    insert into public.tab_dispositivos_bloqueados (
      device_id, loja_id, user_id, motivo, device_label,
      os, browser, ip_address, blocked_by, ativo
    ) values (
      v_dev, v_loja, p_user_id,
      coalesce(nullif(trim(p_motivo), ''), 'Bloqueado pelo administrador'),
      p_device_label, p_os, p_browser, p_ip, v_admin, true
    )
    returning id into v_id;
  end if;

  -- Derruba todas as sessões ativas deste aparelho (realtime → logout imediato)
  with closed as (
    update public.tab_user_sessions s
       set status = 'closed',
           logout_at = now(),
           last_activity_at = now()
     where s.device_id = v_dev
       and s.status = 'active'
    returning s.id, s.user_id, s.loja_id
  ),
  logged as (
    insert into public.tab_access_events (session_id, user_id, loja_id, event_type, description, metadata)
    select c.id, c.user_id, c.loja_id, 'DEVICE_BLOCKED',
           'Dispositivo bloqueado — sessão encerrada',
           jsonb_build_object('device_id', v_dev, 'blocked_by', v_admin)
    from closed c
    returning 1
  )
  select count(*)::int into v_encerradas from logged;

  insert into public.tab_access_events (session_id, user_id, loja_id, event_type, description, metadata)
  values (
    p_session_id, p_user_id, v_loja, 'DEVICE_BLOCKED',
    'Dispositivo bloqueado pelo administrador',
    jsonb_build_object('device_id', v_dev, 'block_id', v_id, 'blocked_by', v_admin)
  );

  return jsonb_build_object(
    'ok', true,
    'block_id', v_id,
    'device_id', v_dev,
    'sessions_closed', coalesce(v_encerradas, 0)
  );
end;
$$;

revoke all on function public.app_dispositivo_bloquear(
  text, text, uuid, bigint, bigint, text, text, text, text
) from public;
grant execute on function public.app_dispositivo_bloquear(
  text, text, uuid, bigint, bigint, text, text, text, text
) to authenticated;

-- ── Desbloquear dispositivo ─────────────────────────────────
create or replace function public.app_dispositivo_desbloquear(p_block_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.app_usuario_id();
  v_row public.tab_dispositivos_bloqueados%rowtype;
begin
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;

  select * into v_row
  from public.tab_dispositivos_bloqueados
  where id = p_block_id
  limit 1;

  if not found then
    raise exception 'not_found';
  end if;

  if not public.app_is_super()
     and v_row.loja_id is distinct from public.app_loja_id() then
    raise exception 'forbidden';
  end if;

  update public.tab_dispositivos_bloqueados
     set ativo = false,
         unblocked_at = now()
   where id = v_row.id;

  insert into public.tab_access_events (user_id, loja_id, event_type, description, metadata)
  values (
    v_row.user_id, v_row.loja_id, 'DEVICE_UNBLOCKED',
    'Dispositivo desbloqueado pelo administrador',
    jsonb_build_object('device_id', v_row.device_id, 'block_id', v_row.id, 'unblocked_by', v_admin)
  );

  return jsonb_build_object('ok', true, 'device_id', v_row.device_id);
end;
$$;

revoke all on function public.app_dispositivo_desbloquear(uuid) from public;
grant execute on function public.app_dispositivo_desbloquear(uuid) to authenticated;

-- ── Listar bloqueios ────────────────────────────────────────
create or replace function public.app_listar_dispositivos_bloqueados(
  p_loja_id bigint default null,
  p_somente_ativos boolean default true,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  device_id text,
  loja_id bigint,
  user_id bigint,
  motivo text,
  device_label text,
  os text,
  browser text,
  ip_address text,
  blocked_by bigint,
  blocked_at timestamptz,
  unblocked_at timestamptz,
  ativo boolean,
  usuario_nome text,
  bloqueado_por_nome text,
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
      b.*,
      u.nome as u_nome,
      a.nome as a_nome,
      l.nome as l_nome
    from public.tab_dispositivos_bloqueados b
    left join public.tab_usuarios u on u.id = b.user_id
    left join public.tab_usuarios a on a.id = b.blocked_by
    left join public.tab_lojas l on l.id = b.loja_id
    where (v_super or b.loja_id is not distinct from v_loja or b.loja_id is null)
      and (p_loja_id is null or b.loja_id = p_loja_id)
      and (coalesce(p_somente_ativos, true) = false or b.ativo is true)
  ),
  contado as (select count(*)::bigint as c from base)
  select
    b.id, b.device_id, b.loja_id, b.user_id, b.motivo, b.device_label,
    b.os, b.browser, b.ip_address, b.blocked_by, b.blocked_at, b.unblocked_at, b.ativo,
    b.u_nome, b.a_nome, b.l_nome,
    (select c from contado)
  from base b
  order by b.blocked_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.app_listar_dispositivos_bloqueados(bigint, boolean, int, int) from public;
grant execute on function public.app_listar_dispositivos_bloqueados(bigint, boolean, int, int) to authenticated;

-- ── app_sessao_iniciar: device_id + bloqueio ────────────────
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
  p_login_method text default 'password',
  p_device_id text default null
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
  v_prev public.tab_user_sessions%rowtype;
  v_hora int;
  v_fp_atual text;
  v_fp_prev text;
  v_dev text := nullif(trim(coalesce(p_device_id, '')), '');
  v_block jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_dev is not null then
    v_block := public.app_dispositivo_esta_bloqueado(v_dev);
    if coalesce((v_block->>'blocked')::boolean, false) then
      insert into public.tab_access_events (user_id, loja_id, event_type, description, metadata)
      select v_uid, u.loja_id, 'LOGIN_DENIED',
             'Login negado — dispositivo bloqueado',
             jsonb_build_object('device_id', v_dev, 'motivo', v_block->>'motivo')
      from public.tab_usuarios u where u.id = v_uid;
      raise exception 'device_blocked';
    end if;
  end if;

  select u.loja_id into v_loja from public.tab_usuarios u where u.id = v_uid;

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
           country = coalesce(p_country, country),
           device_id = coalesce(v_dev, device_id)
     where id = v_id;
    return v_id;
  end if;

  select s.* into v_prev
  from public.tab_user_sessions s
  where s.user_id = v_uid
  order by s.login_at desc
  limit 1;

  insert into public.tab_user_sessions (
    user_id, loja_id, session_token,
    ip_address, city, state, country,
    device_type, device_name, os, browser, browser_version,
    is_pwa, user_agent, login_method, device_id
  ) values (
    v_uid, v_loja, p_session_token,
    p_ip, p_city, p_state, p_country,
    p_device_type, p_device_name, p_os, p_browser, p_browser_version,
    coalesce(p_is_pwa, false), p_user_agent, coalesce(p_login_method, 'password'),
    v_dev
  )
  returning id into v_id;

  insert into public.tab_access_events (session_id, user_id, loja_id, event_type, description)
  values (v_id, v_uid, v_loja, 'LOGIN', 'Login realizado');

  v_hora := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  if v_hora >= 0 and v_hora < 6 then
    insert into public.tab_access_events (
      session_id, user_id, loja_id, event_type, description, metadata
    ) values (
      v_id, v_uid, v_loja, 'UNUSUAL_HOUR',
      'Login em horário incomum (' || lpad(v_hora::text, 2, '0') || 'h, horário de Brasília)',
      jsonb_build_object('hour_brt', v_hora, 'timezone', 'America/Sao_Paulo')
    );
  end if;

  if v_prev.id is not null then
    v_fp_atual := lower(coalesce(p_os,'') || '|' || coalesce(p_browser,'') || '|' || coalesce(p_device_type,''));
    v_fp_prev := lower(coalesce(v_prev.os,'') || '|' || coalesce(v_prev.browser,'') || '|' || coalesce(v_prev.device_type,''));
    if v_fp_atual is distinct from v_fp_prev
       and (coalesce(p_os,'') <> '' or coalesce(p_browser,'') <> '' or coalesce(p_device_type,'') <> '') then
      insert into public.tab_access_events (
        session_id, user_id, loja_id, event_type, description, metadata
      ) values (
        v_id, v_uid, v_loja, 'DEVICE_CHANGED',
        'Login em dispositivo diferente do último acesso',
        jsonb_build_object(
          'previous', jsonb_build_object('os', v_prev.os, 'browser', v_prev.browser, 'device_type', v_prev.device_type),
          'current', jsonb_build_object('os', p_os, 'browser', p_browser, 'device_type', p_device_type)
        )
      );
    end if;

    if (v_prev.city is not null or v_prev.state is not null or v_prev.country is not null)
       and (p_city is not null or p_state is not null or p_country is not null)
       and (
         coalesce(p_city,'') is distinct from coalesce(v_prev.city,'')
         or coalesce(p_state,'') is distinct from coalesce(v_prev.state,'')
         or coalesce(p_country,'') is distinct from coalesce(v_prev.country,'')
       ) then
      insert into public.tab_access_events (
        session_id, user_id, loja_id, event_type, description, metadata
      ) values (
        v_id, v_uid, v_loja, 'UNUSUAL_LOCATION',
        'Login em localização diferente do último acesso',
        jsonb_build_object(
          'previous', jsonb_build_object('city', v_prev.city, 'state', v_prev.state, 'country', v_prev.country),
          'current', jsonb_build_object('city', p_city, 'state', p_state, 'country', p_country)
        )
      );
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) from public;
-- Mantém grant na assinatura antiga (13 args) se ainda existir
do $$
begin
  revoke all on function public.app_sessao_iniciar(
    uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
  ) from public;
exception when undefined_function then null;
end $$;
grant execute on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) to authenticated;

-- ── listar sessões: incluir device_id ───────────────────────
drop function if exists public.app_listar_sessoes(
  text, text, text, bigint, timestamptz, timestamptz, text, int, int
);

create function public.app_listar_sessoes(
  p_modo text default 'online',
  p_busca text default null,
  p_status text default null,
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
  device_id text,
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
    and (p_loja_id is null or s.loja_id = p_loja_id)
    and (p_desde is null or s.login_at >= p_desde)
    and (p_ate is null or s.login_at <= p_ate)
    and (p_device_type is null or p_device_type = '' or s.device_type = p_device_type)
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
  contado as (select count(*)::bigint as c from filtrado)
  select
    f.id, f.user_id, f.loja_id, f.session_token,
    f.login_at, f.last_activity_at, f.logout_at, f.status,
    f.presence_calc,
    f.ip_address, f.city, f.state, f.country,
    f.device_type, f.device_name, f.os, f.browser, f.browser_version,
    f.is_pwa, f.user_agent, f.login_method, f.device_id,
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

-- Realtime na tabela de bloqueios
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tab_dispositivos_bloqueados'
  ) then
    alter publication supabase_realtime add table public.tab_dispositivos_bloqueados;
  end if;
exception
  when undefined_object then null;
end;
$$;
