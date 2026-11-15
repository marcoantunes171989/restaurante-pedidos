-- ════════════════════════════════════════════════════════════
--  173 — Painel de Controle de Atualização (super admin).
--
--  Depende da 172 (public.tab_sistema_status).
--
--  Permite ao SUPER ADMIN, pela tela /admin/controle-atualizacao:
--   - ver quem está online agora (não super admin, sessão ativa com
--     atividade nos últimos 2 minutos — mesma regra de "online" do
--     Controle de Acessos);
--   - LIGAR o bloqueio ("Sistema em atualização"). Se houver algum
--     usuário online, o bloqueio NÃO é feito: a função devolve
--     {ok:false, motivo:'usuarios_online'} e nada muda;
--   - DESLIGAR o bloqueio.
--
--  Segurança:
--   - as 3 funções são SECURITY DEFINER e recusam (42501) quem não é
--     super admin (public.app_is_super());
--   - execute só para authenticated (anon e public revogados);
--   - a tabela continua sem policy de escrita: o app só grava por aqui.
--
--  Idempotente (create or replace). Não altera dados na instalação.
--  Rollback:
--    drop function if exists public.app_sistema_manutencao_desligar();
--    drop function if exists public.app_sistema_manutencao_ligar(text, integer);
--    drop function if exists public.app_sistema_usuarios_online();
-- ════════════════════════════════════════════════════════════

do $pre173$
begin
  if to_regclass('public.tab_sistema_status') is null then
    raise exception 'migration 173: rode antes a 172 (tab_sistema_status ausente)';
  end if;
end;
$pre173$;

create or replace function public.app_sistema_usuarios_online()
returns table (
  user_id bigint,
  usuario_nome text,
  usuario_email text,
  loja_nome text,
  device_type text,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.app_is_super() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select distinct on (s.user_id)
    s.user_id::bigint,
    u.nome::text,
    u.email::text,
    l.nome::text,
    s.device_type::text,
    s.last_activity_at
  from public.tab_user_sessions s
  join public.tab_usuarios u on u.id = s.user_id
  left join public.tab_lojas l on l.id = s.loja_id
  where s.status = 'active'
    and s.last_activity_at >= now() - interval '2 minutes'
    and coalesce(u.super_admin, false) = false
  order by s.user_id, s.last_activity_at desc;
end;
$$;

create or replace function public.app_sistema_manutencao_ligar(
  p_mensagem text default null,
  p_minutos integer default 15
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_online integer;
  v_msg text := nullif(btrim(coalesce(p_mensagem, '')), '');
  v_min integer := greatest(1, least(coalesce(p_minutos, 15), 240));
  v_fim timestamptz := now() + make_interval(mins => greatest(1, least(coalesce(p_minutos, 15), 240)));
  v_quem text;
begin
  if not public.app_is_super() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_msg is not null and char_length(v_msg) > 500 then
    raise exception 'mensagem_muito_longa' using errcode = '22001';
  end if;

  select count(distinct s.user_id)::integer
    into v_online
  from public.tab_user_sessions s
  join public.tab_usuarios u on u.id = s.user_id
  where s.status = 'active'
    and s.last_activity_at >= now() - interval '2 minutes'
    and coalesce(u.super_admin, false) = false;

  if v_online > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'usuarios_online', 'online', v_online);
  end if;

  v_quem := coalesce(nullif(public.app_caller_email(), ''), 'super_admin');

  update public.tab_sistema_status
     set em_manutencao = true,
         mensagem = v_msg,
         previsao_fim = v_fim,
         atualizado_em = now(),
         atualizado_por = v_quem
   where id = 1;

  if not found then
    raise exception 'tab_sistema_status sem a linha id=1' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'online', 0, 'minutos', v_min, 'previsao_fim', v_fim);
end;
$$;

create or replace function public.app_sistema_manutencao_desligar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quem text;
begin
  if not public.app_is_super() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_quem := coalesce(nullif(public.app_caller_email(), ''), 'super_admin');

  update public.tab_sistema_status
     set em_manutencao = false,
         previsao_fim = null,
         atualizado_em = now(),
         atualizado_por = v_quem
   where id = 1;

  if not found then
    raise exception 'tab_sistema_status sem a linha id=1' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.app_sistema_usuarios_online() from public, anon;
revoke all on function public.app_sistema_manutencao_ligar(text, integer) from public, anon;
revoke all on function public.app_sistema_manutencao_desligar() from public, anon;
grant execute on function public.app_sistema_usuarios_online() to authenticated;
grant execute on function public.app_sistema_manutencao_ligar(text, integer) to authenticated;
grant execute on function public.app_sistema_manutencao_desligar() to authenticated;
