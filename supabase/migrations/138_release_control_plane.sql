-- ════════════════════════════════════════════════════════════
--  138 — Registry do control plane de releases (app_release_runs).
--
--  Armazena SOMENTE metadados técnicos de cada promoção
--  Homologação → Production: modo, máquina de estados, SHAs,
--  identificação de runs e operador autenticado no servidor.
--  Acesso direto pelo frontend é proibido; o único caminho é
--  /api/releases via service_role.
--
--  ESCOPO NEGATIVO — NÃO altera outras tabelas/funções/policies
--  existentes. NÃO executa ALTER DEFAULT PRIVILEGES. NÃO cria
--  policies para anon/authenticated. NÃO edita a migration 137.
--  NÃO aplica esta migration em HML/Production neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.app_release_runs') is not null then
    raise exception 'precheck 138: public.app_release_runs já existe.';
  end if;
end $$;

create table public.app_release_runs (
  id uuid primary key,
  mode text not null,
  status text not null,
  base_sha text not null,
  target_sha text not null,
  scheduled_at timestamptz null,
  workflow_run_id text null,
  github_run_id bigint null,
  github_run_url text null,
  vercel_deployment_id text null,
  vercel_deployment_url text null,
  requested_by_user_id uuid null,
  requested_by_email text null,
  result_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz null,
  completed_at timestamptz null,
  canceled_at timestamptz null,
  constraint app_release_runs_mode_check
    check (mode in ('immediate', 'scheduled')),
  constraint app_release_runs_status_check
    check (status in (
      'REQUESTED',
      'SCHEDULED',
      'WAITING',
      'VALIDATING',
      'DISPATCHED',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'BLOCKED',
      'CANCELED'
    )),
  constraint app_release_runs_base_sha_check
    check (base_sha ~ '^[0-9a-f]{40}$'),
  constraint app_release_runs_target_sha_check
    check (target_sha ~ '^[0-9a-f]{40}$'),
  constraint app_release_runs_sha_diff_check
    check (base_sha <> target_sha)
);

comment on table public.app_release_runs is
  'Registry server-side do control plane de releases. Metadados técnicos apenas; sem acesso direto de cliente.';

create unique index app_release_runs_single_active_uidx
  on public.app_release_runs ((true))
  where status in (
    'REQUESTED',
    'SCHEDULED',
    'WAITING',
    'VALIDATING',
    'DISPATCHED',
    'RUNNING'
  );

create index app_release_runs_created_at_idx
  on public.app_release_runs (created_at desc);

create index app_release_runs_status_idx
  on public.app_release_runs (status);

create index app_release_runs_workflow_run_id_idx
  on public.app_release_runs (workflow_run_id)
  where workflow_run_id is not null;

create index app_release_runs_github_run_id_idx
  on public.app_release_runs (github_run_id)
  where github_run_id is not null;

alter table public.app_release_runs enable row level security;

revoke all on table public.app_release_runs from public;
revoke all on table public.app_release_runs from anon;
revoke all on table public.app_release_runs from authenticated;

grant select, insert, update, delete on table public.app_release_runs to service_role;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
  v_indexdef text;
begin
  v_reloid := to_regclass('public.app_release_runs');
  if v_reloid is null then
    raise exception 'postcheck 138: public.app_release_runs não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 138: RLS deveria estar habilitada em app_release_runs.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_release_runs';
  if v_policy_count <> 0 then
    raise exception 'postcheck 138: app_release_runs não deve ter policies para cliente.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_runs_mode_check'
  ) then
    raise exception 'postcheck 138: constraint de mode ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_runs_status_check'
  ) then
    raise exception 'postcheck 138: constraint de status ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_runs_base_sha_check'
  ) then
    raise exception 'postcheck 138: constraint de base_sha ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_runs_target_sha_check'
  ) then
    raise exception 'postcheck 138: constraint de target_sha ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_release_runs_sha_diff_check'
  ) then
    raise exception 'postcheck 138: constraint base_sha <> target_sha ausente.';
  end if;

  select pg_get_indexdef(i.indexrelid) into v_indexdef
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname = 'app_release_runs_single_active_uidx';
  if v_indexdef is null then
    raise exception 'postcheck 138: índice single-active ausente.';
  end if;
  if v_indexdef !~* 'unique' then
    raise exception 'postcheck 138: índice single-active deveria ser UNIQUE.';
  end if;
  if v_indexdef !~* 'REQUESTED' or v_indexdef !~* 'RUNNING' then
    raise exception 'postcheck 138: predicado single-active incompleto.';
  end if;

  if has_table_privilege('anon', 'public.app_release_runs', 'select')
     or has_table_privilege('anon', 'public.app_release_runs', 'insert')
     or has_table_privilege('anon', 'public.app_release_runs', 'update')
     or has_table_privilege('anon', 'public.app_release_runs', 'delete')
     or has_table_privilege('anon', 'public.app_release_runs', 'truncate')
     or has_table_privilege('anon', 'public.app_release_runs', 'references')
     or has_table_privilege('anon', 'public.app_release_runs', 'trigger') then
    raise exception 'postcheck 138: anon não deveria ter privilégios em app_release_runs.';
  end if;

  if has_table_privilege('authenticated', 'public.app_release_runs', 'select')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'insert')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'update')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'delete')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'truncate')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'references')
     or has_table_privilege('authenticated', 'public.app_release_runs', 'trigger') then
    raise exception 'postcheck 138: authenticated não deveria ter privilégios em app_release_runs.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 138: PUBLIC não deveria ter privilégios em app_release_runs.';
  end if;

  if not has_table_privilege('service_role', 'public.app_release_runs', 'select') then
    raise exception 'postcheck 138: service_role deveria ter SELECT em app_release_runs.';
  end if;
  if not has_table_privilege('service_role', 'public.app_release_runs', 'insert') then
    raise exception 'postcheck 138: service_role deveria ter INSERT em app_release_runs.';
  end if;
  if not has_table_privilege('service_role', 'public.app_release_runs', 'update') then
    raise exception 'postcheck 138: service_role deveria ter UPDATE em app_release_runs.';
  end if;
  if not has_table_privilege('service_role', 'public.app_release_runs', 'delete') then
    raise exception 'postcheck 138: service_role deveria ter DELETE em app_release_runs.';
  end if;
end $$;

commit;
