-- 116 — Sessão do Super Admin acompanha a empresa em foco.
-- Cada troca encerra o período anterior e abre uma nova sessão, preservando
-- tempo conectado, permanência por tela e histórico por empresa.

create or replace function public.app_sessao_trocar_contexto(
  p_session_token uuid,
  p_new_session_token uuid,
  p_loja_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid bigint := public.app_usuario_id();
  v_old public.tab_user_sessions%rowtype;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.app_is_super() then
    raise exception 'super_admin_required';
  end if;
  if p_session_token is null or p_new_session_token is null then
    raise exception 'invalid_session_token';
  end if;
  if p_loja_id is not null and not exists (
    select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo is true
  ) then
    raise exception 'invalid_company';
  end if;

  select * into v_old
  from public.tab_user_sessions s
  where s.session_token = p_session_token
    and s.user_id = v_uid
    and s.status = 'active'
  order by s.login_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_missing');
  end if;
  if v_old.loja_id is not distinct from p_loja_id then
    return jsonb_build_object('ok', true, 'changed', false, 'session_id', v_old.id);
  end if;

  update public.tab_user_sessions
     set status = 'closed', logout_at = now(), last_activity_at = now()
   where id = v_old.id;

  insert into public.tab_access_events (
    session_id, user_id, loja_id, event_type, description, metadata
  ) values (
    v_old.id, v_uid, v_old.loja_id, 'CONTEXT_CHANGED',
    case when p_loja_id is null then 'Empresa em foco removida' else 'Empresa em foco alterada' end,
    jsonb_build_object('previous_loja_id', v_old.loja_id, 'new_loja_id', p_loja_id)
  );

  insert into public.tab_user_sessions (
    user_id, loja_id, session_token, login_at, last_activity_at,
    ip_address, city, state, country, device_type, device_name, device_id,
    os, browser, browser_version, is_pwa, user_agent, login_method
  ) values (
    v_uid, p_loja_id, p_new_session_token, now(), now(),
    v_old.ip_address, v_old.city, v_old.state, v_old.country,
    v_old.device_type, v_old.device_name, v_old.device_id,
    v_old.os, v_old.browser, v_old.browser_version, v_old.is_pwa,
    v_old.user_agent, 'company_context'
  ) returning id into v_new_id;

  insert into public.tab_access_events (
    session_id, user_id, loja_id, event_type, description, metadata
  ) values (
    v_new_id, v_uid, p_loja_id, 'LOGIN',
    case when p_loja_id is null then 'Sessão geral do Super Admin' else 'Entrada na empresa em foco' end,
    jsonb_build_object('context_switch', true, 'previous_loja_id', v_old.loja_id)
  );

  return jsonb_build_object('ok', true, 'changed', true, 'session_id', v_new_id);
end;
$$;

revoke all on function public.app_sessao_trocar_contexto(uuid, uuid, bigint) from public;
grant execute on function public.app_sessao_trocar_contexto(uuid, uuid, bigint) to authenticated;

comment on function public.app_sessao_trocar_contexto(uuid, uuid, bigint) is
  'Super Admin: encerra a sessão do contexto anterior e inicia outra na empresa em foco.';
