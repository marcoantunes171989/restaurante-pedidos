-- ════════════════════════════════════════════════════════════
--  139 — Timeline auditável e imutável de eventos do control
--  plane de releases (app_release_events).
--
--  Registra, em modo append-only, cada transição de estado real de
--  app_release_runs (criação, validação, dispatch, execução, conclusão,
--  bloqueio, cancelamento e requeue). Auditoria forense apenas —
--  nenhuma ação mutável é adicionada à UI neste microgate.
--
--  ESCOPO NEGATIVO — NÃO altera app_release_runs nem edita a migration
--  138. NÃO cria UPDATE/DELETE de eventos (somente SELECT/INSERT via
--  service_role). NÃO cria policies para anon/authenticated. NÃO expõe
--  CRUD de eventos ao frontend. NÃO aplica esta migration em Production
--  neste microgate — HML-only.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.app_release_runs') is null then
    raise exception 'precheck 139: public.app_release_runs não existe (migration 138 ausente).';
  end if;
  if to_regclass('public.app_release_events') is not null then
    raise exception 'precheck 139: public.app_release_events já existe.';
  end if;
end $$;

create table public.app_release_events (
  id uuid primary key,
  release_id uuid not null references public.app_release_runs (id),
  event_type text not null,
  status_from text null,
  status_to text null,
  actor_user_id uuid null,
  actor_email text null,
  source text not null,
  message text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  constraint app_release_events_event_type_check
    check (event_type in (
      'RELEASE_REQUESTED',
      'RELEASE_SCHEDULED',
      'RELEASE_VALIDATION_STARTED',
      'RELEASE_DISPATCHED',
      'RELEASE_RUNNING',
      'RELEASE_SUCCEEDED',
      'RELEASE_FAILED',
      'RELEASE_BLOCKED',
      'RELEASE_CANCELED',
      'RELEASE_REQUEUED'
    )),
  constraint app_release_events_source_check
    check (source in ('api', 'executor', 'github_reconcile')),
  constraint app_release_events_status_from_check
    check (status_from is null or status_from in (
      'REQUESTED', 'SCHEDULED', 'WAITING', 'VALIDATING', 'DISPATCHED',
      'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELED'
    )),
  constraint app_release_events_status_to_check
    check (status_to is null or status_to in (
      'REQUESTED', 'SCHEDULED', 'WAITING', 'VALIDATING', 'DISPATCHED',
      'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELED'
    ))
);

comment on table public.app_release_events is
  'Timeline append-only de eventos do control plane de releases (auditoria forense). Somente INSERT/SELECT via service_role; sem acesso direto de cliente.';

create index app_release_events_release_id_created_at_idx
  on public.app_release_events (release_id, created_at);

alter table public.app_release_events enable row level security;

revoke all on table public.app_release_events from public;
revoke all on table public.app_release_events from anon;
revoke all on table public.app_release_events from authenticated;

-- Somente SELECT + INSERT para service_role: a tabela é um registro
-- forense append-only. Nenhum papel recebe UPDATE/DELETE — a
-- imutabilidade é reforçada tanto no código (release-store.js não expõe
-- update/delete de eventos) quanto no grant do banco.
grant select, insert on table public.app_release_events to service_role;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
  v_fk_count integer;
  v_indexdef text;
begin
  v_reloid := to_regclass('public.app_release_events');
  if v_reloid is null then
    raise exception 'postcheck 139: public.app_release_events não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 139: RLS deveria estar habilitada em app_release_events.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_release_events';
  if v_policy_count <> 0 then
    raise exception 'postcheck 139: app_release_events não deve ter policies para cliente.';
  end if;

  select count(*) into v_fk_count
  from pg_constraint
  where conrelid = v_reloid and contype = 'f';
  if v_fk_count <> 1 then
    raise exception 'postcheck 139: FK para app_release_runs ausente ou duplicada.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_events_event_type_check'
  ) then
    raise exception 'postcheck 139: constraint de event_type ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_events_source_check'
  ) then
    raise exception 'postcheck 139: constraint de source ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_events_status_from_check'
  ) then
    raise exception 'postcheck 139: constraint de status_from ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_events_status_to_check'
  ) then
    raise exception 'postcheck 139: constraint de status_to ausente.';
  end if;

  select pg_get_indexdef(i.indexrelid) into v_indexdef
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname = 'app_release_events_release_id_created_at_idx';
  if v_indexdef is null then
    raise exception 'postcheck 139: índice release_id/created_at ausente.';
  end if;

  if has_table_privilege('anon', 'public.app_release_events', 'select')
     or has_table_privilege('anon', 'public.app_release_events', 'insert')
     or has_table_privilege('anon', 'public.app_release_events', 'update')
     or has_table_privilege('anon', 'public.app_release_events', 'delete')
     or has_table_privilege('anon', 'public.app_release_events', 'truncate')
     or has_table_privilege('anon', 'public.app_release_events', 'references')
     or has_table_privilege('anon', 'public.app_release_events', 'trigger') then
    raise exception 'postcheck 139: anon não deveria ter privilégios em app_release_events.';
  end if;

  if has_table_privilege('authenticated', 'public.app_release_events', 'select')
     or has_table_privilege('authenticated', 'public.app_release_events', 'insert')
     or has_table_privilege('authenticated', 'public.app_release_events', 'update')
     or has_table_privilege('authenticated', 'public.app_release_events', 'delete')
     or has_table_privilege('authenticated', 'public.app_release_events', 'truncate')
     or has_table_privilege('authenticated', 'public.app_release_events', 'references')
     or has_table_privilege('authenticated', 'public.app_release_events', 'trigger') then
    raise exception 'postcheck 139: authenticated não deveria ter privilégios em app_release_events.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 139: PUBLIC não deveria ter privilégios em app_release_events.';
  end if;

  if not has_table_privilege('service_role', 'public.app_release_events', 'select') then
    raise exception 'postcheck 139: service_role deveria ter SELECT em app_release_events.';
  end if;
  if not has_table_privilege('service_role', 'public.app_release_events', 'insert') then
    raise exception 'postcheck 139: service_role deveria ter INSERT em app_release_events.';
  end if;
  if has_table_privilege('service_role', 'public.app_release_events', 'update') then
    raise exception 'postcheck 139: service_role NÃO deveria ter UPDATE em app_release_events (append-only).';
  end if;
  if has_table_privilege('service_role', 'public.app_release_events', 'delete') then
    raise exception 'postcheck 139: service_role NÃO deveria ter DELETE em app_release_events (append-only).';
  end if;
end $$;

commit;
