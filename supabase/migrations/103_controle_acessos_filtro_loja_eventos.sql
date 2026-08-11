-- ════════════════════════════════════════════════════════════
-- 103 · Controle de Acessos — filtrar eventos por empresa
-- Adiciona p_loja_id em app_listar_eventos_acesso para alertas
-- e aba Segurança acompanharem a "Empresa em foco".
-- Idempotente.
-- ════════════════════════════════════════════════════════════

drop function if exists public.app_listar_eventos_acesso(
  uuid, text[], timestamptz, timestamptz, int, int
);

create or replace function public.app_listar_eventos_acesso(
  p_session_id uuid default null,
  p_tipos text[] default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_limit int default 50,
  p_offset int default 0,
  p_loja_id bigint default null
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
      -- Detalhe por sessão: não força loja. Listagens (alertas/segurança): respeitam foco.
      and (
        p_session_id is not null
        or p_loja_id is null
        or e.loja_id = p_loja_id
      )
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
  uuid, text[], timestamptz, timestamptz, int, int, bigint
) from public;
grant execute on function public.app_listar_eventos_acesso(
  uuid, text[], timestamptz, timestamptz, int, int, bigint
) to authenticated;

comment on function public.app_listar_eventos_acesso(
  uuid, text[], timestamptz, timestamptz, int, int, bigint
) is
  'Lista eventos de acesso; p_loja_id filtra pela empresa em foco (exceto detalhe por sessão).';
