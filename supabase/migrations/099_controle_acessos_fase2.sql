-- ════════════════════════════════════════════════════════════
--  099 — Controle de Acessos (fase 2)
--  - Encerrar sessão remotamente (admin)
--  - Alertas: novo dispositivo / horário / localização
--  - Heartbeat devolve status (active|closed|missing) p/ force-logout
--  Idempotente.
-- ════════════════════════════════════════════════════════════

-- ── Heartbeat: retorno text (status) ────────────────────────
-- CREATE OR REPLACE não troca tipo de retorno → drop prévio.
drop function if exists public.app_sessao_heartbeat(uuid);

create function public.app_sessao_heartbeat(p_session_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_status text;
  v_n int;
begin
  if v_uid is null or p_session_token is null then
    return 'missing';
  end if;

  select s.status into v_status
  from public.tab_user_sessions s
  where s.session_token = p_session_token
    and s.user_id = v_uid
  order by s.login_at desc
  limit 1;

  if v_status is null then
    return 'missing';
  end if;

  if v_status = 'closed' then
    return 'closed';
  end if;

  update public.tab_user_sessions
     set last_activity_at = now()
   where session_token = p_session_token
     and user_id = v_uid
     and status = 'active';
  get diagnostics v_n = row_count;

  if v_n > 0 then
    return 'active';
  end if;
  return 'closed';
end;
$$;

revoke all on function public.app_sessao_heartbeat(uuid) from public;
grant execute on function public.app_sessao_heartbeat(uuid) to authenticated;

-- ── Encerrar sessão remotamente (admin do tenant / super) ───
create or replace function public.app_sessao_encerrar_remota(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.app_usuario_id();
  v_admin_nome text;
  v_row public.tab_user_sessions%rowtype;
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

  select coalesce(nullif(trim(u.nome), ''), u.email, 'Admin')
    into v_admin_nome
  from public.tab_usuarios u
  where u.id = v_admin
  limit 1;

  if v_row.status = 'closed' then
    return jsonb_build_object(
      'ok', true,
      'already_closed', true,
      'session_id', v_row.id
    );
  end if;

  update public.tab_user_sessions
     set status = 'closed',
         logout_at = now(),
         last_activity_at = now()
   where id = v_row.id;

  insert into public.tab_access_events (
    session_id, user_id, loja_id, event_type, description, metadata
  ) values (
    v_row.id,
    v_row.user_id,
    v_row.loja_id,
    'ADMIN_SESSION_TERMINATED',
    'Sessão encerrada remotamente por ' || coalesce(v_admin_nome, 'admin'),
    jsonb_build_object(
      'terminated_by', v_admin,
      'terminated_by_name', v_admin_nome,
      'target_user_id', v_row.user_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_closed', false,
    'session_id', v_row.id
  );
end;
$$;

revoke all on function public.app_sessao_encerrar_remota(uuid) from public;
grant execute on function public.app_sessao_encerrar_remota(uuid) to authenticated;

-- ── Iniciar sessão: alertas de segurança na criação ─────────
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
  v_prev public.tab_user_sessions%rowtype;
  v_hora int;
  v_fp_atual text;
  v_fp_prev text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select u.loja_id into v_loja from public.tab_usuarios u where u.id = v_uid;

  -- Reutiliza sessão ativa do mesmo token (F5 / restore) — sem novos alertas
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

  -- Última sessão anterior (qualquer status) para comparar dispositivo/local
  select s.* into v_prev
  from public.tab_user_sessions s
  where s.user_id = v_uid
  order by s.login_at desc
  limit 1;

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

  -- Horário incomum: 00:00–05:59 America/Sao_Paulo
  v_hora := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  if v_hora >= 0 and v_hora < 6 then
    insert into public.tab_access_events (
      session_id, user_id, loja_id, event_type, description, metadata
    ) values (
      v_id, v_uid, v_loja, 'UNUSUAL_HOUR',
      'Login em horário incomum (' || lpad(v_hora::text, 2, '0') || 'h, horário de Brasília)',
      jsonb_build_object(
        'hour_brt', v_hora,
        'timezone', 'America/Sao_Paulo',
        'rule', 'outside_06_to_23'
      )
    );
  end if;

  if v_prev.id is not null then
    v_fp_atual := lower(
      coalesce(p_os, '') || '|' ||
      coalesce(p_browser, '') || '|' ||
      coalesce(p_device_type, '')
    );
    v_fp_prev := lower(
      coalesce(v_prev.os, '') || '|' ||
      coalesce(v_prev.browser, '') || '|' ||
      coalesce(v_prev.device_type, '')
    );

    if v_fp_atual is distinct from v_fp_prev
       and (coalesce(p_os, '') <> '' or coalesce(p_browser, '') <> '' or coalesce(p_device_type, '') <> '') then
      insert into public.tab_access_events (
        session_id, user_id, loja_id, event_type, description, metadata
      ) values (
        v_id, v_uid, v_loja, 'DEVICE_CHANGED',
        'Login em dispositivo diferente do último acesso',
        jsonb_build_object(
          'previous', jsonb_build_object(
            'os', v_prev.os,
            'browser', v_prev.browser,
            'device_type', v_prev.device_type
          ),
          'current', jsonb_build_object(
            'os', p_os,
            'browser', p_browser,
            'device_type', p_device_type
          )
        )
      );
    end if;

    if (
         v_prev.city is not null
         or v_prev.state is not null
         or v_prev.country is not null
       )
       and (
         p_city is not null
         or p_state is not null
         or p_country is not null
       )
       and (
         coalesce(p_city, '') is distinct from coalesce(v_prev.city, '')
         or coalesce(p_state, '') is distinct from coalesce(v_prev.state, '')
         or coalesce(p_country, '') is distinct from coalesce(v_prev.country, '')
       ) then
      insert into public.tab_access_events (
        session_id, user_id, loja_id, event_type, description, metadata
      ) values (
        v_id, v_uid, v_loja, 'UNUSUAL_LOCATION',
        'Login em localização diferente do último acesso',
        jsonb_build_object(
          'previous', jsonb_build_object(
            'city', v_prev.city,
            'state', v_prev.state,
            'country', v_prev.country
          ),
          'current', jsonb_build_object(
            'city', p_city,
            'state', p_state,
            'country', p_country
          )
        )
      );
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
) from public;
grant execute on function public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
) to authenticated;
