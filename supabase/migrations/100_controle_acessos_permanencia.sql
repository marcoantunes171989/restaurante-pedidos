-- ════════════════════════════════════════════════════════════
--  100 — Controle de Acessos: permanência por tela + exclusão
--       + realtime para atualização automática da tela admin
--  Idempotente.
-- ════════════════════════════════════════════════════════════

-- ── Permanência por tela ────────────────────────────────────
create table if not exists public.tab_access_page_stays (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.tab_user_sessions(id) on delete cascade,
  user_id       bigint not null references public.tab_usuarios(id) on delete cascade,
  loja_id       bigint,
  route         text,
  screen_key    text not null,
  screen_label  text,
  device_type   text,
  os            text,
  browser       text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_ms   bigint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_page_stays_session on public.tab_access_page_stays (session_id, started_at desc);
create index if not exists idx_page_stays_loja on public.tab_access_page_stays (loja_id, started_at desc);
create index if not exists idx_page_stays_user on public.tab_access_page_stays (user_id, started_at desc);
create index if not exists idx_page_stays_screen on public.tab_access_page_stays (screen_key, started_at desc);
create index if not exists idx_page_stays_open on public.tab_access_page_stays (session_id) where ended_at is null;

alter table public.tab_access_page_stays enable row level security;

drop policy if exists "page_stays_select" on public.tab_access_page_stays;
create policy "page_stays_select" on public.tab_access_page_stays
  for select to authenticated
  using (
    public.app_is_super()
    or (
      public.app_pode_controle_acessos()
      and loja_id is not distinct from public.app_loja_id()
    )
    or user_id = public.app_usuario_id()
  );

drop policy if exists "page_stays_insert_own" on public.tab_access_page_stays;
create policy "page_stays_insert_own" on public.tab_access_page_stays
  for insert to authenticated
  with check (user_id = public.app_usuario_id());

drop policy if exists "page_stays_update_own" on public.tab_access_page_stays;
create policy "page_stays_update_own" on public.tab_access_page_stays
  for update to authenticated
  using (user_id = public.app_usuario_id())
  with check (user_id = public.app_usuario_id());

-- Fecha permanências abertas quando a sessão é encerrada
create or replace function public.tg_user_sessions_close_page_stays()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    update public.tab_access_page_stays ps
       set ended_at = coalesce(new.logout_at, now()),
           duration_ms = greatest(
             0,
             (extract(epoch from (coalesce(new.logout_at, now()) - ps.started_at)) * 1000)::bigint
           )
     where ps.session_id = new.id
       and ps.ended_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_sessions_close_page_stays on public.tab_user_sessions;
create trigger trg_user_sessions_close_page_stays
  after update of status on public.tab_user_sessions
  for each row execute function public.tg_user_sessions_close_page_stays();

-- ── RPC: iniciar permanência em tela ────────────────────────
create or replace function public.app_page_stay_iniciar(
  p_session_token uuid,
  p_route text default null,
  p_screen_key text default null,
  p_screen_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_sess public.tab_user_sessions%rowtype;
  v_id uuid;
  v_key text := nullif(trim(coalesce(p_screen_key, '')), '');
begin
  if v_uid is null or p_session_token is null or v_key is null then
    return null;
  end if;

  select * into v_sess
  from public.tab_user_sessions s
  where s.session_token = p_session_token
    and s.user_id = v_uid
    and s.status = 'active'
  order by s.login_at desc
  limit 1;

  if not found then
    return null;
  end if;

  -- Fecha qualquer permanência aberta da sessão
  update public.tab_access_page_stays ps
     set ended_at = now(),
         duration_ms = greatest(
           0,
           (extract(epoch from (now() - ps.started_at)) * 1000)::bigint
         )
   where ps.session_id = v_sess.id
     and ps.ended_at is null;

  insert into public.tab_access_page_stays (
    session_id, user_id, loja_id,
    route, screen_key, screen_label,
    device_type, os, browser
  ) values (
    v_sess.id, v_uid, v_sess.loja_id,
    p_route, v_key, coalesce(nullif(trim(p_screen_label), ''), v_key),
    v_sess.device_type, v_sess.os, v_sess.browser
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.app_page_stay_iniciar(uuid, text, text, text) from public;
grant execute on function public.app_page_stay_iniciar(uuid, text, text, text) to authenticated;

-- ── RPC: encerrar permanência ───────────────────────────────
create or replace function public.app_page_stay_encerrar(p_stay_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_n int;
begin
  if v_uid is null or p_stay_id is null then
    return false;
  end if;

  update public.tab_access_page_stays ps
     set ended_at = now(),
         duration_ms = greatest(
           0,
           (extract(epoch from (now() - ps.started_at)) * 1000)::bigint
         )
   where ps.id = p_stay_id
     and ps.user_id = v_uid
     and ps.ended_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.app_page_stay_encerrar(uuid) from public;
grant execute on function public.app_page_stay_encerrar(uuid) to authenticated;

-- ── RPC: listar permanências de uma sessão ──────────────────
create or replace function public.app_listar_page_stays_sessao(
  p_session_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  session_id uuid,
  screen_key text,
  screen_label text,
  route text,
  device_type text,
  os text,
  browser text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;
  if p_session_id is null then
    return;
  end if;

  return query
  select
    ps.id, ps.session_id, ps.screen_key, ps.screen_label, ps.route,
    ps.device_type, ps.os, ps.browser,
    ps.started_at, ps.ended_at,
    case
      when ps.ended_at is null then
        greatest(0, (extract(epoch from (now() - ps.started_at)) * 1000)::bigint)
      else ps.duration_ms
    end as duration_ms
  from public.tab_access_page_stays ps
  join public.tab_user_sessions s on s.id = ps.session_id
  where ps.session_id = p_session_id
    and (
      public.app_is_super()
      or s.loja_id is not distinct from public.app_loja_id()
    )
  order by ps.started_at desc
  limit v_lim;
end;
$$;

revoke all on function public.app_listar_page_stays_sessao(uuid, int) from public;
grant execute on function public.app_listar_page_stays_sessao(uuid, int) to authenticated;

-- ── RPC: agregados de permanência (tela / dispositivo / usuário)
create or replace function public.app_listar_permanencia(
  p_agrupar text default 'tela',       -- tela | dispositivo | usuario
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_loja_id bigint default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  chave text,
  rotulo text,
  tempo_ms bigint,
  visitas bigint,
  usuarios bigint,
  detalhe text,
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
  v_modo text := lower(coalesce(nullif(trim(p_agrupar), ''), 'tela'));
begin
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select
      ps.*,
      u.nome as u_nome,
      case
        when ps.ended_at is null then
          greatest(0, (extract(epoch from (now() - ps.started_at)) * 1000)::bigint)
        else ps.duration_ms
      end as dur_calc
    from public.tab_access_page_stays ps
    join public.tab_usuarios u on u.id = ps.user_id
    where (v_super or ps.loja_id is not distinct from v_loja)
      and (p_loja_id is null or ps.loja_id = p_loja_id)
      and (p_desde is null or ps.started_at >= p_desde)
      and (p_ate is null or ps.started_at <= p_ate)
  ),
  agrupado as (
    select
      case v_modo
        when 'dispositivo' then
          coalesce(b.device_type, '—') || '|' || coalesce(b.os, '—') || '|' || coalesce(b.browser, '—')
        when 'usuario' then b.user_id::text
        else b.screen_key
      end as g_chave,
      case v_modo
        when 'dispositivo' then
          trim(both ' •' from concat_ws(' • ', nullif(b.os, ''), nullif(b.browser, ''), nullif(b.device_type, '')))
        when 'usuario' then coalesce(nullif(b.u_nome, ''), 'Usuário #' || b.user_id::text)
        else coalesce(nullif(b.screen_label, ''), b.screen_key)
      end as g_rotulo,
      case v_modo
        when 'dispositivo' then coalesce(b.device_type, '')
        when 'usuario' then coalesce(b.os, '') || ' / ' || coalesce(b.browser, '')
        else coalesce(b.route, '')
      end as g_detalhe,
      b.dur_calc,
      b.user_id,
      b.id
    from base b
  ),
  somado as (
    select
      a.g_chave as chave,
      max(a.g_rotulo) as rotulo,
      sum(a.dur_calc)::bigint as tempo_ms,
      count(a.id)::bigint as visitas,
      count(distinct a.user_id)::bigint as usuarios,
      max(a.g_detalhe) as detalhe
    from agrupado a
    group by a.g_chave
  ),
  contado as (select count(*)::bigint as c from somado)
  select
    s.chave, s.rotulo, s.tempo_ms, s.visitas, s.usuarios, s.detalhe,
    (select c from contado)
  from somado s
  order by s.tempo_ms desc, s.visitas desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.app_listar_permanencia(
  text, timestamptz, timestamptz, bigint, int, int
) from public;
grant execute on function public.app_listar_permanencia(
  text, timestamptz, timestamptz, bigint, int, int
) to authenticated;

-- ── RPC: excluir sessão (admin) ─────────────────────────────
create or replace function public.app_sessao_excluir(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.app_usuario_id();
  v_row public.tab_user_sessions%rowtype;
  v_ev int;
  v_st int;
begin
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;
  if not public.app_pode_controle_acessos() then
    raise exception 'forbidden';
  end if;
  if p_session_id is null then
    raise exception 'invalid_session';
  end if;

  select * into v_row
  from public.tab_user_sessions
  where id = p_session_id
  limit 1;

  if not found then
    raise exception 'not_found';
  end if;

  if not public.app_is_super()
     and v_row.loja_id is distinct from public.app_loja_id() then
    raise exception 'forbidden';
  end if;

  delete from public.tab_access_events e
   where e.session_id = v_row.id;
  get diagnostics v_ev = row_count;

  delete from public.tab_access_page_stays ps
   where ps.session_id = v_row.id;
  get diagnostics v_st = row_count;

  delete from public.tab_user_sessions s
   where s.id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_row.id,
    'events_deleted', coalesce(v_ev, 0),
    'stays_deleted', coalesce(v_st, 0)
  );
end;
$$;

revoke all on function public.app_sessao_excluir(uuid) from public;
grant execute on function public.app_sessao_excluir(uuid) to authenticated;

-- ── RPC: excluir evento de acesso (admin) ───────────────────
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

  delete from public.tab_access_events e where e.id = p_event_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'deleted', coalesce(v_n, 0));
end;
$$;

revoke all on function public.app_evento_acesso_excluir(uuid) from public;
grant execute on function public.app_evento_acesso_excluir(uuid) to authenticated;

-- ── Realtime (atualização ao vivo da tela admin) ────────────
do $$
declare
  t text;
begin
  foreach t in array array['tab_user_sessions', 'tab_access_events', 'tab_access_page_stays']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when undefined_object then null; -- publication inexistente em ambientes sem realtime
end;
$$;
