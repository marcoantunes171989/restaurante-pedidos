-- ════════════════════════════════════════════════════════════
--  140 — Schema base do Maintenance Write Fence.
--
--  Control plane server-side do estado de manutenção (singleton
--  global) + timeline append-only de eventos + view pública
--  read-only com projeção mínima segura.
--
--  phase é um conjunto DISCRETO de estados. Comparação lexical
--  (phase > 'NORMAL', ORDER BY phase, etc.) é incorreta e NÃO
--  deve ser usada pela aplicação futura.
--
--  ESCOPO NEGATIVO — NÃO altera app_release_runs / app_release_events
--  nem tabelas de negócio. NÃO cria operation registry, business
--  guard, RPC, trigger de write, ticker, API, frontend, print lease
--  nem corrige a migration 064. NÃO edita as migrations 138/139.
--  NÃO aplica esta migration em HML/Production neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.app_release_runs') is null then
    raise exception 'precheck 140: public.app_release_runs não existe (migration 138 ausente).';
  end if;
  if to_regclass('public.app_maintenance_state') is not null then
    raise exception 'precheck 140: public.app_maintenance_state já existe.';
  end if;
  if to_regclass('public.app_maintenance_events') is not null then
    raise exception 'precheck 140: public.app_maintenance_events já existe.';
  end if;
  if to_regclass('public.vw_app_maintenance_public') is not null then
    raise exception 'precheck 140: public.vw_app_maintenance_public já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) APP_MAINTENANCE_STATE — singleton técnico
-- ════════════════════════════════════════════════════════════
create table public.app_maintenance_state (
  scope text primary key,
  phase text not null,
  epoch integer not null default 0,
  reason text null,
  release_id uuid null
    references public.app_release_runs (id)
    on delete set null,
  target_sha text null,
  notice_started_at timestamptz null,
  scheduled_for timestamptz null,
  fence_effective_at timestamptz null,
  drain_started_at timestamptz null,
  quiet_since timestamptz null,
  quiescent_at timestamptz null,
  release_started_at timestamptz null,
  smoke_started_at timestamptz null,
  recovering_at timestamptz null,
  completed_at timestamptz null,
  aborted_at timestamptz null,
  timeout_at timestamptz null,
  abort_reason text null,
  result_code text null,
  message_public text null,
  message_operator text null,
  created_by_user_id uuid null,
  created_by_email text null,
  updated_by_user_id uuid null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint app_maintenance_state_scope_check
    check (scope = 'global'),
  constraint app_maintenance_state_phase_check
    check (phase in (
      'NORMAL',
      'NOTICE',
      'FENCING',
      'DRAINING',
      'QUIESCENT',
      'RELEASING',
      'SMOKE',
      'RECOVERING',
      'ABORTING',
      'FAILED',
      'CANCELED'
    )),
  constraint app_maintenance_state_epoch_check
    check (epoch >= 0),
  constraint app_maintenance_state_version_check
    check (version >= 1),
  constraint app_maintenance_state_target_sha_check
    check (target_sha is null or target_sha ~ '^[0-9a-f]{40}$')
);

comment on table public.app_maintenance_state is
  'Control plane server-side do Maintenance Write Fence. Singleton técnico (scope=global). Sem acesso direto de cliente; service_role somente SELECT/UPDATE. O singleton nasce nesta migration — ausência futura é falha de integridade, não motivo para INSERT/upsert em runtime. phase é conjunto discreto de estados, não ordem lexical.';

-- Singleton inicial: exatamente 1 linha. Não depende de API futura.
insert into public.app_maintenance_state (scope, phase, epoch, version)
values ('global', 'NORMAL', 0, 1);

alter table public.app_maintenance_state enable row level security;

revoke all on table public.app_maintenance_state from public;
revoke all on table public.app_maintenance_state from anon;
revoke all on table public.app_maintenance_state from authenticated;
-- Revoga defaults do Supabase (ALL em service_role) antes do grant mínimo.
revoke all on table public.app_maintenance_state from service_role;

grant select, update on table public.app_maintenance_state to service_role;

-- ════════════════════════════════════════════════════════════
--  2) VIEW PÚBLICA — projeção read-only do singleton
-- ════════════════════════════════════════════════════════════
-- View comum: sem RLS/policies. Proteção = tabela bruta com RLS +
-- zero policies + grants mínimos na view. security_barrier impede
-- leaky predicates. NÃO usar security_invoker — a view deve correr
-- com direitos do owner para projetar o singleton sem GRANT na
-- tabela bruta.
create view public.vw_app_maintenance_public
  with (security_barrier = true) as
select
  phase,
  epoch,
  fence_effective_at,
  notice_started_at,
  scheduled_for,
  message_public,
  updated_at
from public.app_maintenance_state
where scope = 'global';

comment on view public.vw_app_maintenance_public is
  'Projeção pública read-only do singleton de manutenção. Expõe somente phase, epoch, fence_effective_at, notice_started_at, scheduled_for, message_public, updated_at. Não expõe reason, release_id, target_sha, timeout_at, abort_reason, result_code, atores/e-mails nem message_operator.';

revoke all on table public.vw_app_maintenance_public from public;
revoke all on table public.vw_app_maintenance_public from anon;
revoke all on table public.vw_app_maintenance_public from authenticated;
revoke all on table public.vw_app_maintenance_public from service_role;

grant select on table public.vw_app_maintenance_public to anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
--  3) APP_MAINTENANCE_EVENTS — timeline append-only
-- ════════════════════════════════════════════════════════════
create table public.app_maintenance_events (
  id uuid primary key,
  maintenance_epoch integer not null,
  release_id uuid null
    references public.app_release_runs (id)
    on delete set null,
  event_type text not null,
  source text not null,
  actor_user_id uuid null,
  actor_email text null,
  message text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  constraint app_maintenance_events_event_type_check
    check (event_type in (
      'NOTICE_STARTED',
      'NOTICE_TICK',
      'FENCE_STARTED',
      'DRAIN_STARTED',
      'OPERATION_BEGUN',
      'OPERATION_DRAINED',
      'OPERATION_EXPIRED',
      'QUIESCENCE_REACHED',
      'QUIESCENCE_PROBE_PASSED',
      'RELEASE_STARTED',
      'SMOKE_STARTED',
      'RECOVERY_STARTED',
      'MAINTENANCE_COMPLETED',
      'MAINTENANCE_ABORTED',
      'MAINTENANCE_FAILED',
      'MAINTENANCE_CANCELED'
    )),
  constraint app_maintenance_events_source_check
    check (source in ('api', 'ticker', 'executor', 'probe'))
);

comment on table public.app_maintenance_events is
  'Timeline append-only de eventos do Maintenance Write Fence. Somente INSERT/SELECT via service_role; sem UPDATE/DELETE e sem acesso direto de cliente.';

create index app_maintenance_events_created_at_idx
  on public.app_maintenance_events (created_at desc);

create index app_maintenance_events_event_type_created_at_idx
  on public.app_maintenance_events (event_type, created_at desc);

-- Timeline por ciclo (epoch). Cada fence incrementa epoch; leituras
-- futuras (ticker/probe/API) filtram o ciclo corrente. Sem este
-- índice o crescimento acumulado entre ciclos forçaria seq scan.
create index app_maintenance_events_epoch_created_at_idx
  on public.app_maintenance_events (maintenance_epoch, created_at desc);

alter table public.app_maintenance_events enable row level security;

revoke all on table public.app_maintenance_events from public;
revoke all on table public.app_maintenance_events from anon;
revoke all on table public.app_maintenance_events from authenticated;
revoke all on table public.app_maintenance_events from service_role;

grant select, insert on table public.app_maintenance_events to service_role;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed — STATE
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
  v_fk_count integer;
  v_fk_del char;
  v_fk_relid oid;
  v_singleton_count integer;
  v_scope text;
  v_phase text;
  v_epoch integer;
  v_version integer;
begin
  v_reloid := to_regclass('public.app_maintenance_state');
  if v_reloid is null then
    raise exception 'postcheck 140: public.app_maintenance_state não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 140: RLS deveria estar habilitada em app_maintenance_state.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_maintenance_state';
  if v_policy_count <> 0 then
    raise exception 'postcheck 140: app_maintenance_state não deve ter policies (policy_count=0).';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_state_scope_check'
  ) then
    raise exception 'postcheck 140: constraint de scope ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_state_phase_check'
  ) then
    raise exception 'postcheck 140: constraint de phase ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_state_target_sha_check'
  ) then
    raise exception 'postcheck 140: constraint de target_sha ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_state_epoch_check'
  ) then
    raise exception 'postcheck 140: constraint de epoch ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_state_version_check'
  ) then
    raise exception 'postcheck 140: constraint de version ausente.';
  end if;

  select count(*), min(confdeltype), min(confrelid)
    into v_fk_count, v_fk_del, v_fk_relid
  from pg_constraint
  where conrelid = v_reloid and contype = 'f';
  if v_fk_count <> 1 then
    raise exception 'postcheck 140: FK release_id ausente ou duplicada em app_maintenance_state.';
  end if;
  if v_fk_relid is distinct from to_regclass('public.app_release_runs') then
    raise exception 'postcheck 140: FK de app_maintenance_state deveria referenciar app_release_runs.';
  end if;
  if v_fk_del <> 'n' then
    raise exception 'postcheck 140: FK release_id deveria ser ON DELETE SET NULL.';
  end if;

  if has_table_privilege('anon', 'public.app_maintenance_state', 'select')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'insert')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'update')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'delete')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'truncate')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'references')
     or has_table_privilege('anon', 'public.app_maintenance_state', 'trigger') then
    raise exception 'postcheck 140: anon não deveria ter privilégios em app_maintenance_state.';
  end if;

  if has_table_privilege('authenticated', 'public.app_maintenance_state', 'select')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'insert')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'update')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'delete')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'truncate')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'references')
     or has_table_privilege('authenticated', 'public.app_maintenance_state', 'trigger') then
    raise exception 'postcheck 140: authenticated não deveria ter privilégios em app_maintenance_state.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 140: PUBLIC não deveria ter privilégios em app_maintenance_state.';
  end if;

  if not has_table_privilege('service_role', 'public.app_maintenance_state', 'select') then
    raise exception 'postcheck 140: service_role deveria ter SELECT em app_maintenance_state.';
  end if;
  if not has_table_privilege('service_role', 'public.app_maintenance_state', 'update') then
    raise exception 'postcheck 140: service_role deveria ter UPDATE em app_maintenance_state.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_state', 'insert') then
    raise exception 'postcheck 140: service_role NÃO deveria ter INSERT em app_maintenance_state (singleton da migration).';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_state', 'delete') then
    raise exception 'postcheck 140: service_role NÃO deveria ter DELETE em app_maintenance_state.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_state', 'truncate') then
    raise exception 'postcheck 140: service_role NÃO deveria ter TRUNCATE em app_maintenance_state.';
  end if;

  select count(*) into v_singleton_count from public.app_maintenance_state;
  if v_singleton_count <> 1 then
    raise exception 'postcheck 140: singleton de app_maintenance_state deveria ter exatamente 1 linha (count=%).', v_singleton_count;
  end if;

  select scope, phase, epoch, version
    into v_scope, v_phase, v_epoch, v_version
  from public.app_maintenance_state;
  if v_scope is distinct from 'global'
     or v_phase is distinct from 'NORMAL'
     or v_epoch is distinct from 0
     or v_version is distinct from 1 then
    raise exception 'postcheck 140: singleton inicial inválido (scope=%, phase=%, epoch=%, version=%).',
      v_scope, v_phase, v_epoch, v_version;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed — VIEW
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_relkind char;
  v_reloptions text[];
  v_cols text[];
  v_public_priv boolean;
begin
  v_reloid := to_regclass('public.vw_app_maintenance_public');
  if v_reloid is null then
    raise exception 'postcheck 140: public.vw_app_maintenance_public não encontrada.';
  end if;

  select c.relkind, c.reloptions into v_relkind, v_reloptions
  from pg_class c
  where c.oid = v_reloid;
  if v_relkind <> 'v' then
    raise exception 'postcheck 140: vw_app_maintenance_public deveria ser VIEW (relkind=v).';
  end if;
  if v_reloptions is null or not ('security_barrier=true' = any (v_reloptions)) then
    raise exception 'postcheck 140: vw_app_maintenance_public deveria ter security_barrier=true.';
  end if;

  select coalesce(array_agg(a.attname order by a.attnum), '{}')
    into v_cols
  from pg_attribute a
  where a.attrelid = v_reloid
    and a.attnum > 0
    and not a.attisdropped;
  if v_cols is distinct from array[
    'phase',
    'epoch',
    'fence_effective_at',
    'notice_started_at',
    'scheduled_for',
    'message_public',
    'updated_at'
  ]::text[] then
    raise exception 'postcheck 140: colunas da view pública divergem das 7 esperadas: %', v_cols;
  end if;

  if not has_table_privilege('anon', 'public.vw_app_maintenance_public', 'select') then
    raise exception 'postcheck 140: anon deveria ter SELECT em vw_app_maintenance_public.';
  end if;
  if not has_table_privilege('authenticated', 'public.vw_app_maintenance_public', 'select') then
    raise exception 'postcheck 140: authenticated deveria ter SELECT em vw_app_maintenance_public.';
  end if;
  if not has_table_privilege('service_role', 'public.vw_app_maintenance_public', 'select') then
    raise exception 'postcheck 140: service_role deveria ter SELECT em vw_app_maintenance_public.';
  end if;

  if has_table_privilege('anon', 'public.vw_app_maintenance_public', 'insert')
     or has_table_privilege('anon', 'public.vw_app_maintenance_public', 'update')
     or has_table_privilege('anon', 'public.vw_app_maintenance_public', 'delete') then
    raise exception 'postcheck 140: anon não deveria ter INSERT/UPDATE/DELETE na view pública.';
  end if;
  if has_table_privilege('authenticated', 'public.vw_app_maintenance_public', 'insert')
     or has_table_privilege('authenticated', 'public.vw_app_maintenance_public', 'update')
     or has_table_privilege('authenticated', 'public.vw_app_maintenance_public', 'delete') then
    raise exception 'postcheck 140: authenticated não deveria ter INSERT/UPDATE/DELETE na view pública.';
  end if;
  if has_table_privilege('service_role', 'public.vw_app_maintenance_public', 'insert')
     or has_table_privilege('service_role', 'public.vw_app_maintenance_public', 'update')
     or has_table_privilege('service_role', 'public.vw_app_maintenance_public', 'delete') then
    raise exception 'postcheck 140: service_role não deveria ter INSERT/UPDATE/DELETE na view pública.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 140: PUBLIC não deveria ter privilégios em vw_app_maintenance_public.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed — EVENTS
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
  v_fk_count integer;
  v_fk_del char;
  v_fk_relid oid;
  v_indexdef text;
  v_event_count integer;
begin
  v_reloid := to_regclass('public.app_maintenance_events');
  if v_reloid is null then
    raise exception 'postcheck 140: public.app_maintenance_events não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 140: RLS deveria estar habilitada em app_maintenance_events.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_maintenance_events';
  if v_policy_count <> 0 then
    raise exception 'postcheck 140: app_maintenance_events não deve ter policies (policy_count=0).';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_events_event_type_check'
  ) then
    raise exception 'postcheck 140: constraint de event_type ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_events_source_check'
  ) then
    raise exception 'postcheck 140: constraint de source ausente.';
  end if;

  select count(*), min(confdeltype), min(confrelid)
    into v_fk_count, v_fk_del, v_fk_relid
  from pg_constraint
  where conrelid = v_reloid and contype = 'f';
  if v_fk_count <> 1 then
    raise exception 'postcheck 140: FK release_id ausente ou duplicada em app_maintenance_events.';
  end if;
  if v_fk_relid is distinct from to_regclass('public.app_release_runs') then
    raise exception 'postcheck 140: FK de app_maintenance_events deveria referenciar app_release_runs.';
  end if;
  if v_fk_del <> 'n' then
    raise exception 'postcheck 140: FK release_id de events deveria ser ON DELETE SET NULL.';
  end if;

  select pg_get_indexdef(i.indexrelid) into v_indexdef
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname = 'app_maintenance_events_created_at_idx';
  if v_indexdef is null then
    raise exception 'postcheck 140: índice app_maintenance_events_created_at_idx ausente.';
  end if;

  select pg_get_indexdef(i.indexrelid) into v_indexdef
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname = 'app_maintenance_events_event_type_created_at_idx';
  if v_indexdef is null then
    raise exception 'postcheck 140: índice app_maintenance_events_event_type_created_at_idx ausente.';
  end if;

  select pg_get_indexdef(i.indexrelid) into v_indexdef
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname = 'app_maintenance_events_epoch_created_at_idx';
  if v_indexdef is null then
    raise exception 'postcheck 140: índice app_maintenance_events_epoch_created_at_idx ausente.';
  end if;

  if has_table_privilege('anon', 'public.app_maintenance_events', 'select')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'insert')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'update')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'delete')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'truncate')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'references')
     or has_table_privilege('anon', 'public.app_maintenance_events', 'trigger') then
    raise exception 'postcheck 140: anon não deveria ter privilégios em app_maintenance_events.';
  end if;

  if has_table_privilege('authenticated', 'public.app_maintenance_events', 'select')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'insert')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'update')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'delete')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'truncate')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'references')
     or has_table_privilege('authenticated', 'public.app_maintenance_events', 'trigger') then
    raise exception 'postcheck 140: authenticated não deveria ter privilégios em app_maintenance_events.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 140: PUBLIC não deveria ter privilégios em app_maintenance_events.';
  end if;

  if not has_table_privilege('service_role', 'public.app_maintenance_events', 'select') then
    raise exception 'postcheck 140: service_role deveria ter SELECT em app_maintenance_events.';
  end if;
  if not has_table_privilege('service_role', 'public.app_maintenance_events', 'insert') then
    raise exception 'postcheck 140: service_role deveria ter INSERT em app_maintenance_events.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_events', 'update') then
    raise exception 'postcheck 140: service_role NÃO deveria ter UPDATE em app_maintenance_events (append-only).';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_events', 'delete') then
    raise exception 'postcheck 140: service_role NÃO deveria ter DELETE em app_maintenance_events (append-only).';
  end if;

  select count(*) into v_event_count from public.app_maintenance_events;
  if v_event_count <> 0 then
    raise exception 'postcheck 140: app_maintenance_events deveria iniciar vazia (count=%).', v_event_count;
  end if;
end $$;

commit;
