-- ════════════════════════════════════════════════════════════
--  160 — Production Database Orchestrator foundation (PDB-I1A).
--
--  Data model estrutural + extensão segura do contrato de
--  manutenção. DDL-only. Sem DML de negócio, sem seed, sem RPC
--  de backup/migration, sem executor, sem apply.
--
--  Estende phase com BACKING_UP e MIGRATING (RELEASING permanece
--  APP RELEASE). Estende binding com plan_kind/db_plan_id sem
--  quebrar release_id+target_sha. Adiciona login_gate OPEN/CLOSED
--  com DEFAULT OPEN (sem UPDATE do singleton). Cria o registry
--  estrutural de planos/execuções/backup/validação de schema.
--
--  A máquina DB congelada (NORMAL → … → QUIESCENT → BACKING_UP →
--  MIGRATING → SMOKE → NORMAL) NÃO é operacional neste gate —
--  edges novas NÃO entram em transition_internal. RPCs de I1C/I2C.
--
--  ESCOPO NEGATIVO — NÃO cria session registry. NÃO cria
--  readiness API. NÃO cria backup provider. NÃO cria restore.
--  NÃO cria scheduler. NÃO cria apply_migration. NÃO altera UI.
--  NÃO aplica esta migration em HML/Production neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_state_reloid oid;
  v_events_reloid oid;
  v_condef text;
  v_phase_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text, ''MAINTENANCE_REOPENED''::text])))';
  v_phase_condef_expected constant text :=
    'CHECK ((phase = ANY (ARRAY[''NORMAL''::text, ''NOTICE''::text, ''FENCING''::text, ''DRAINING''::text, ''QUIESCENT''::text, ''RELEASING''::text, ''SMOKE''::text, ''RECOVERING''::text, ''ABORTING''::text, ''FAILED''::text, ''CANCELED''::text])))';
  v_col_type text;
  v_src text;
  v_from text;
  v_to text;
  v_edge_count integer := 0;
begin
  v_state_reloid := to_regclass('public.app_maintenance_state');
  if v_state_reloid is null then
    raise exception 'precheck 160: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 160: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  if to_regclass('public.app_release_runs') is null then
    raise exception 'precheck 160: public.app_release_runs não existe (migration 138 ausente).';
  end if;

  if to_regclass('public.app_db_release_plans') is not null then
    raise exception 'precheck 160: public.app_db_release_plans já existe.';
  end if;
  if to_regclass('public.app_db_release_plan_migrations') is not null then
    raise exception 'precheck 160: public.app_db_release_plan_migrations já existe.';
  end if;
  if to_regclass('public.app_db_release_executions') is not null then
    raise exception 'precheck 160: public.app_db_release_executions já existe.';
  end if;
  if to_regclass('public.app_db_release_execution_steps') is not null then
    raise exception 'precheck 160: public.app_db_release_execution_steps já existe.';
  end if;
  if to_regclass('public.app_backup_runs') is not null then
    raise exception 'precheck 160: public.app_backup_runs já existe.';
  end if;
  if to_regclass('public.app_schema_validation_results') is not null then
    raise exception 'precheck 160: public.app_schema_validation_results já existe.';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'login_gate' and not a.attisdropped;
  if v_col_type is not null then
    raise exception 'precheck 160: coluna login_gate já existe em app_maintenance_state.';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'plan_kind' and not a.attisdropped;
  if v_col_type is not null then
    raise exception 'precheck 160: coluna plan_kind já existe em app_maintenance_state.';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'db_plan_id' and not a.attisdropped;
  if v_col_type is not null then
    raise exception 'precheck 160: coluna db_plan_id já existe em app_maintenance_state.';
  end if;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 160: app_maintenance_events_event_type_check divergente do contrato canônico de 18 valores (drift): %', v_condef;
  end if;

  select pg_get_constraintdef(oid) into v_phase_condef
  from pg_constraint
  where conrelid = v_state_reloid and conname = 'app_maintenance_state_phase_check';
  if v_phase_condef is distinct from v_phase_condef_expected then
    raise exception 'precheck 160: app_maintenance_state_phase_check divergente do contrato canônico de 11 valores (drift): %', v_phase_condef;
  end if;
  if position('BACKING_UP' in v_phase_condef) <> 0 or position('MIGRATING' in v_phase_condef) <> 0 then
    raise exception 'precheck 160: BACKING_UP/MIGRATING já são phases — drift inesperado.';
  end if;
  if position('RELEASING' in v_phase_condef) = 0 then
    raise exception 'precheck 160: RELEASING deveria existir no contrato de phase (migration 140).';
  end if;

  if to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  ) is null then
    raise exception 'precheck 160: transition_internal não existe (migration 153 ausente).';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  for v_from, v_to in
    select * from (values
      ('NORMAL',     'NOTICE'),
      ('NOTICE',     'FENCING'),
      ('FENCING',    'DRAINING'),
      ('DRAINING',   'QUIESCENT'),
      ('QUIESCENT',  'RELEASING'),
      ('RELEASING',  'SMOKE'),
      ('SMOKE',      'NORMAL'),
      ('SMOKE',      'RECOVERING'),
      ('RECOVERING', 'FAILED'),
      ('RELEASING',  'ABORTING'),
      ('ABORTING',   'FAILED'),
      ('FENCING',    'FAILED'),
      ('DRAINING',   'FAILED'),
      ('NORMAL',     'CANCELED'),
      ('NOTICE',     'CANCELED'),
      ('QUIESCENT',  'FAILED')
    ) as edges(from_phase, to_phase)
  loop
    if v_src !~ (quote_literal(v_from) || '[[:space:]]*,[[:space:]]*' || quote_literal(v_to)) then
      raise exception 'precheck 160: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'precheck 160: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;
  if v_src ~ (quote_literal('QUIESCENT') || '[[:space:]]*,[[:space:]]*' || quote_literal('BACKING_UP'))
     or v_src ~ (quote_literal('BACKING_UP') || '[[:space:]]*,[[:space:]]*' || quote_literal('MIGRATING')) then
    raise exception 'precheck 160: transition_internal já contém edges DB — drift inesperado.';
  end if;

  if to_regprocedure('public.app_maintenance_orchestration_binding_guard()') is null then
    raise exception 'precheck 160: binding_guard não existe (migration 153 ausente).';
  end if;
  if to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') is null then
    raise exception 'precheck 160: app_assert_business_write_allowed não existe (migration 142 ausente).';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) APP_DB_RELEASE_PLANS
-- ════════════════════════════════════════════════════════════
create table public.app_db_release_plans (
  id uuid primary key,
  environment text not null,
  target_release_sha text not null,
  base_sha text not null,
  plan_hash text not null,
  status text not null,
  scheduled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  approved_at timestamptz null,
  approved_by uuid null,
  readiness_generation integer not null default 0,
  migration_count integer not null default 0,
  constraint app_db_release_plans_environment_check
    check (environment in ('HML', 'PROD')),
  constraint app_db_release_plans_status_check
    check (status in (
      'DRAFT',
      'VALIDATED',
      'APPROVED',
      'SCHEDULED',
      'RUNNING',
      'BLOCKED',
      'FAILED',
      'RECOVERY_REQUIRED',
      'SUCCEEDED',
      'CANCELED'
    )),
  constraint app_db_release_plans_target_release_sha_check
    check (target_release_sha ~ '^[0-9a-f]{40}$'),
  constraint app_db_release_plans_base_sha_check
    check (base_sha ~ '^[0-9a-f]{40}$'),
  constraint app_db_release_plans_plan_hash_check
    check (plan_hash ~ '^[0-9a-f]{64}$'),
  constraint app_db_release_plans_readiness_generation_check
    check (readiness_generation >= 0),
  constraint app_db_release_plans_migration_count_check
    check (migration_count >= 0)
);

comment on table public.app_db_release_plans is
  'Registry estrutural de planos de release de banco (PDB-I1A). Sem rows nesta migration. Sem executor. target_release_sha faz parte da identidade do plano. Control plane interno: RLS, zero policies, sem GRANT a anon/authenticated.';

create index app_db_release_plans_created_at_idx
  on public.app_db_release_plans (created_at desc);

create index app_db_release_plans_status_idx
  on public.app_db_release_plans (status);

create index app_db_release_plans_environment_status_idx
  on public.app_db_release_plans (environment, status);

alter table public.app_db_release_plans enable row level security;

revoke all on table public.app_db_release_plans from public;
revoke all on table public.app_db_release_plans from anon;
revoke all on table public.app_db_release_plans from authenticated;
revoke all on table public.app_db_release_plans from service_role;

grant select, insert, update on table public.app_db_release_plans to service_role;

-- ════════════════════════════════════════════════════════════
--  2) APP_DB_RELEASE_PLAN_MIGRATIONS
-- ════════════════════════════════════════════════════════════
create table public.app_db_release_plan_migrations (
  id uuid primary key,
  plan_id uuid not null
    references public.app_db_release_plans (id)
    on delete restrict,
  migration_order integer not null,
  filename text not null,
  git_blob text null,
  sha256 text not null,
  bytes integer not null,
  classification text not null,
  created_at timestamptz not null default now(),
  constraint app_db_release_plan_migrations_order_check
    check (migration_order > 0),
  constraint app_db_release_plan_migrations_filename_check
    check (char_length(filename) > 0 and filename ~ '\.sql$'),
  constraint app_db_release_plan_migrations_git_blob_check
    check (git_blob is null or git_blob ~ '^[0-9a-f]{40}$'),
  constraint app_db_release_plan_migrations_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_db_release_plan_migrations_bytes_check
    check (bytes >= 0),
  constraint app_db_release_plan_migrations_classification_check
    check (classification in ('SAFE_AUTO', 'REVIEW_REQUIRED', 'PROHIBITED')),
  constraint app_db_release_plan_migrations_plan_order_uidx
    unique (plan_id, migration_order),
  constraint app_db_release_plan_migrations_plan_filename_uidx
    unique (plan_id, filename),
  constraint app_db_release_plan_migrations_plan_sha256_uidx
    unique (plan_id, sha256)
);

comment on table public.app_db_release_plan_migrations is
  'Identidade normalizada das migrations de um plano DB. Identidade não depende só do filename (sha256 + git_blob + order). Sem rows nesta migration.';

create index app_db_release_plan_migrations_plan_id_idx
  on public.app_db_release_plan_migrations (plan_id);

alter table public.app_db_release_plan_migrations enable row level security;

revoke all on table public.app_db_release_plan_migrations from public;
revoke all on table public.app_db_release_plan_migrations from anon;
revoke all on table public.app_db_release_plan_migrations from authenticated;
revoke all on table public.app_db_release_plan_migrations from service_role;

grant select, insert on table public.app_db_release_plan_migrations to service_role;

-- ════════════════════════════════════════════════════════════
--  3) APP_DB_RELEASE_EXECUTIONS
-- ════════════════════════════════════════════════════════════
create table public.app_db_release_executions (
  id uuid primary key,
  plan_id uuid not null
    references public.app_db_release_plans (id)
    on delete restrict,
  environment text not null,
  status text not null,
  correlation_id uuid null,
  executor_id text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  heartbeat_at timestamptz null,
  failure_code text null,
  failure_message text null,
  created_at timestamptz not null default now(),
  constraint app_db_release_executions_environment_check
    check (environment in ('HML', 'PROD')),
  constraint app_db_release_executions_status_check
    check (status in (
      'REQUESTED',
      'PREPARING',
      'DRAINING',
      'BACKING_UP',
      'MIGRATING',
      'VERIFYING',
      'RECOVERY_REQUIRED',
      'FAILED',
      'SUCCEEDED',
      'CANCELED'
    )),
  constraint app_db_release_executions_executor_id_check
    check (
      executor_id is null
      or (
        char_length(executor_id) between 1 and 200
        and executor_id !~* '(secret|token|bearer|password|authorization|service_role)'
      )
    )
);

comment on table public.app_db_release_executions is
  'Estrutura de execução de um plano DB. Sem executor neste gate. executor_id é identidade não-secreta. Sem rows nesta migration.';

create index app_db_release_executions_plan_id_created_at_idx
  on public.app_db_release_executions (plan_id, created_at desc);

create index app_db_release_executions_status_idx
  on public.app_db_release_executions (status);

alter table public.app_db_release_executions enable row level security;

revoke all on table public.app_db_release_executions from public;
revoke all on table public.app_db_release_executions from anon;
revoke all on table public.app_db_release_executions from authenticated;
revoke all on table public.app_db_release_executions from service_role;

grant select, insert, update on table public.app_db_release_executions to service_role;

-- ════════════════════════════════════════════════════════════
--  4) APP_DB_RELEASE_EXECUTION_STEPS
-- ════════════════════════════════════════════════════════════
create table public.app_db_release_execution_steps (
  id uuid primary key,
  execution_id uuid not null
    references public.app_db_release_executions (id)
    on delete restrict,
  step_order integer not null,
  step_type text not null,
  status text not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  evidence jsonb null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint app_db_release_execution_steps_order_check
    check (step_order > 0),
  constraint app_db_release_execution_steps_type_check
    check (step_type in (
      'PREFLIGHT',
      'LOGIN_GATE_CLOSE',
      'FENCE',
      'DRAIN',
      'QUIESCE',
      'BACKUP',
      'BACKUP_VERIFY',
      'MIGRATE',
      'SCHEMA_VALIDATE',
      'SMOKE',
      'LOGIN_GATE_OPEN',
      'RECOVERY'
    )),
  constraint app_db_release_execution_steps_status_check
    check (status in (
      'PENDING',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'SKIPPED',
      'CANCELED'
    )),
  constraint app_db_release_execution_steps_evidence_secrets_check
    check (
      evidence is null
      or (
        jsonb_typeof(evidence) = 'object'
        and not (evidence ? 'authorization')
        and not (evidence ? 'Authorization')
        and not (evidence ? 'service_role')
        and not (evidence ? 'service_role_key')
        and not (evidence ? 'password')
        and not (evidence ? 'secret')
        and not (evidence ? 'token')
        and not (evidence ? 'api_key')
      )
    ),
  constraint app_db_release_execution_steps_execution_order_uidx
    unique (execution_id, step_order)
);

comment on table public.app_db_release_execution_steps is
  'Passos estruturais de uma execução DB. evidence é jsonb sem segredos (Authorization/service_role/token proibidos). Sem rows nesta migration.';

create index app_db_release_execution_steps_execution_id_idx
  on public.app_db_release_execution_steps (execution_id);

alter table public.app_db_release_execution_steps enable row level security;

revoke all on table public.app_db_release_execution_steps from public;
revoke all on table public.app_db_release_execution_steps from anon;
revoke all on table public.app_db_release_execution_steps from authenticated;
revoke all on table public.app_db_release_execution_steps from service_role;

grant select, insert, update on table public.app_db_release_execution_steps to service_role;

-- ════════════════════════════════════════════════════════════
--  5) APP_BACKUP_RUNS
-- ════════════════════════════════════════════════════════════
create table public.app_backup_runs (
  id uuid primary key,
  plan_id uuid not null
    references public.app_db_release_plans (id)
    on delete restrict,
  execution_id uuid null
    references public.app_db_release_executions (id)
    on delete restrict,
  environment text not null,
  provider text not null,
  provider_backup_id text null,
  status text not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  verified_at timestamptz null,
  provider_metadata jsonb null,
  integrity_evidence jsonb null,
  requested_by uuid null,
  correlation_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_backup_runs_environment_check
    check (environment in ('HML', 'PROD')),
  constraint app_backup_runs_status_check
    check (status in (
      'REQUESTED',
      'RUNNING',
      'COMPLETED',
      'VERIFYING',
      'VERIFIED',
      'FAILED'
    )),
  constraint app_backup_runs_provider_check
    check (provider ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint app_backup_runs_provider_metadata_secrets_check
    check (
      provider_metadata is null
      or (
        jsonb_typeof(provider_metadata) = 'object'
        and not (provider_metadata ? 'authorization')
        and not (provider_metadata ? 'Authorization')
        and not (provider_metadata ? 'service_role')
        and not (provider_metadata ? 'password')
        and not (provider_metadata ? 'secret')
        and not (provider_metadata ? 'token')
        and not (provider_metadata ? 'api_key')
      )
    ),
  constraint app_backup_runs_integrity_evidence_secrets_check
    check (
      integrity_evidence is null
      or (
        jsonb_typeof(integrity_evidence) = 'object'
        and not (integrity_evidence ? 'authorization')
        and not (integrity_evidence ? 'Authorization')
        and not (integrity_evidence ? 'service_role')
        and not (integrity_evidence ? 'password')
        and not (integrity_evidence ? 'secret')
        and not (integrity_evidence ? 'token')
        and not (integrity_evidence ? 'api_key')
      )
    )
);

comment on table public.app_backup_runs is
  'Estrutura de backup run. Nenhum provider real, nenhuma chamada externa, nenhuma função createBackup neste gate. Sem rows nesta migration.';

create index app_backup_runs_plan_id_created_at_idx
  on public.app_backup_runs (plan_id, created_at desc);

create index app_backup_runs_execution_id_idx
  on public.app_backup_runs (execution_id);

create index app_backup_runs_status_idx
  on public.app_backup_runs (status);

alter table public.app_backup_runs enable row level security;

revoke all on table public.app_backup_runs from public;
revoke all on table public.app_backup_runs from anon;
revoke all on table public.app_backup_runs from authenticated;
revoke all on table public.app_backup_runs from service_role;

grant select, insert, update on table public.app_backup_runs to service_role;

-- ════════════════════════════════════════════════════════════
--  6) APP_SCHEMA_VALIDATION_RESULTS
-- ════════════════════════════════════════════════════════════
create table public.app_schema_validation_results (
  id uuid primary key,
  plan_id uuid not null
    references public.app_db_release_plans (id)
    on delete restrict,
  plan_migration_id uuid null
    references public.app_db_release_plan_migrations (id)
    on delete restrict,
  filename text not null,
  sha256 text not null,
  git_blob text null,
  classification text not null,
  validator_version text not null,
  result text not null,
  findings jsonb not null default '[]'::jsonb,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint app_schema_validation_results_filename_check
    check (char_length(filename) > 0 and filename ~ '\.sql$'),
  constraint app_schema_validation_results_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_schema_validation_results_git_blob_check
    check (git_blob is null or git_blob ~ '^[0-9a-f]{40}$'),
  constraint app_schema_validation_results_classification_check
    check (classification in ('SAFE_AUTO', 'REVIEW_REQUIRED', 'PROHIBITED')),
  constraint app_schema_validation_results_result_check
    check (result in ('PASS', 'FAIL')),
  constraint app_schema_validation_results_validator_version_check
    check (char_length(validator_version) > 0),
  constraint app_schema_validation_results_findings_check
    check (jsonb_typeof(findings) = 'array')
);

comment on table public.app_schema_validation_results is
  'Resultados estruturais de validação de schema. Sem parser neste gate. classification={SAFE_AUTO,REVIEW_REQUIRED,PROHIBITED}; result={PASS,FAIL}. Sem rows nesta migration.';

create index app_schema_validation_results_plan_id_idx
  on public.app_schema_validation_results (plan_id);

create index app_schema_validation_results_plan_migration_id_idx
  on public.app_schema_validation_results (plan_migration_id);

alter table public.app_schema_validation_results enable row level security;

revoke all on table public.app_schema_validation_results from public;
revoke all on table public.app_schema_validation_results from anon;
revoke all on table public.app_schema_validation_results from authenticated;
revoke all on table public.app_schema_validation_results from service_role;

grant select, insert on table public.app_schema_validation_results to service_role;

-- ════════════════════════════════════════════════════════════
--  7) MAINTENANCE STATE — login_gate + plan_kind + db_plan_id
--     (DDL; DEFAULT preenche o singleton sem UPDATE manual)
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_state
  add column login_gate text not null default 'OPEN',
  add column plan_kind text null,
  add column db_plan_id uuid null
    references public.app_db_release_plans (id)
    on delete set null;

alter table public.app_maintenance_state
  add constraint app_maintenance_state_login_gate_check
    check (login_gate in ('OPEN', 'CLOSED'));

alter table public.app_maintenance_state
  add constraint app_maintenance_state_plan_kind_check
    check (plan_kind is null or plan_kind in ('APP_RELEASE', 'DB_MIGRATION'));

alter table public.app_maintenance_state
  add constraint app_maintenance_state_binding_kind_check
    check (
      (
        plan_kind is null
        and release_id is null
        and db_plan_id is null
        and target_sha is null
      )
      or (
        release_id is not null
        and target_sha is not null
        and db_plan_id is null
        and (plan_kind is null or plan_kind = 'APP_RELEASE')
      )
      or (
        db_plan_id is not null
        and target_sha is not null
        and release_id is null
        and plan_kind = 'DB_MIGRATION'
      )
    );

comment on column public.app_maintenance_state.login_gate is
  'Login gate server-authoritative. OPEN no baseline (DEFAULT). CLOSED será usado futuramente em FENCING…FAILED. Sem source of truth no React.';

comment on column public.app_maintenance_state.plan_kind is
  'Tipo de plano bound: NULL (unbound legado), APP_RELEASE (release_id+target_sha) ou DB_MIGRATION (db_plan_id+target_sha). APP e DB não coexistam.';

comment on column public.app_maintenance_state.db_plan_id is
  'Binding opcional a um plano DB. Mutuamente exclusivo com release_id. ON DELETE SET NULL.';

comment on constraint app_maintenance_state_binding_kind_check
  on public.app_maintenance_state is
  'Três estados válidos: unbound legado (tudo NULL); APP_RELEASE (release_id+target_sha, db_plan_id NULL, plan_kind NULL ou APP_RELEASE); DB_MIGRATION (db_plan_id+target_sha, release_id NULL, plan_kind=DB_MIGRATION). APP e DB não coexistam.';

-- ════════════════════════════════════════════════════════════
--  8) PHASE CONSTRAINT — 11 -> 13 (BACKING_UP, MIGRATING)
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_state
  drop constraint app_maintenance_state_phase_check;

alter table public.app_maintenance_state
  add constraint app_maintenance_state_phase_check
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
    'CANCELED',
    'BACKING_UP',
    'MIGRATING'
  ));

comment on constraint app_maintenance_state_phase_check
  on public.app_maintenance_state is
  'Contrato de 13 phases (11 herdadas da migration 140 + BACKING_UP + MIGRATING). RELEASING continua significando APP RELEASE e não é reutilizado como MIGRATING. Edges DB (QUIESCENT→BACKING_UP→MIGRATING→SMOKE) estão congeladas no contrato server-side e NÃO são operacionais neste gate.';

-- ════════════════════════════════════════════════════════════
--  9) EVENT TYPE — 18 -> 42 (superset monotônico DB events)
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_events
  drop constraint app_maintenance_events_event_type_check;

alter table public.app_maintenance_events
  add constraint app_maintenance_events_event_type_check
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
    'MAINTENANCE_CANCELED',
    'ORCHESTRATION_STARTED',
    'MAINTENANCE_REOPENED',
    'DB_PLAN_CREATED',
    'DB_PLAN_VALIDATED',
    'DB_PLAN_APPROVED',
    'DB_PLAN_SCHEDULED',
    'DB_PREFLIGHT_PASSED',
    'DB_PREFLIGHT_BLOCKED',
    'LOGIN_GATE_CLOSED',
    'LOGIN_GATE_OPENED',
    'SESSION_DRAIN_STARTED',
    'SESSION_DRAIN_COMPLETED',
    'BACKUP_REQUESTED',
    'BACKUP_STARTED',
    'BACKUP_COMPLETED',
    'BACKUP_VERIFYING',
    'BACKUP_VERIFIED',
    'BACKUP_FAILED',
    'DB_MIGRATION_STARTED',
    'DB_MIGRATION_APPLIED',
    'DB_MIGRATION_RECONCILED',
    'DB_SCHEMA_VALIDATION_PASSED',
    'DB_SCHEMA_VALIDATION_FAILED',
    'DB_RECOVERY_REQUIRED',
    'DB_RELEASE_SUCCEEDED',
    'DB_RELEASE_FAILED'
  ));

comment on constraint app_maintenance_events_event_type_check
  on public.app_maintenance_events is
  'Contrato de 42 event_types (18 herdados das migrations 140/153/159 + 24 eventos DB da migration 160). Alteração estritamente monotônica. Nenhum valor antigo removido. Sem INSERT de evento neste gate.';

-- ════════════════════════════════════════════════════════════
--  10) BINDING GUARD — reconhece DB bind sem quebrar APP
-- ════════════════════════════════════════════════════════════
create or replace function public.app_maintenance_orchestration_binding_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Binding APP parcial proibido fora do caminho DB:
  -- release_id NULL <=> target_sha NULL, salvo DB_MIGRATION (release_id NULL + target_sha NOT NULL).
  if NEW.plan_kind is distinct from 'DB_MIGRATION' then
    if (NEW.release_id is null) is distinct from (NEW.target_sha is null) then
      raise exception '%', 'Binding parcial de release_id/target_sha não é permitido.'
        using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
    end if;
  end if;

  -- APP e DB não coexistam.
  if NEW.release_id is not null and NEW.db_plan_id is not null then
    raise exception '%', 'Binding APP e DB não podem coexistir.'
      using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
  end if;

  -- INITIAL BIND APP: NORMAL->NORMAL, unbound -> full APP (plan_kind NULL ou APP_RELEASE).
  if OLD.phase = 'NORMAL' and NEW.phase = 'NORMAL'
     and OLD.release_id is null and OLD.target_sha is null
     and OLD.db_plan_id is null and OLD.plan_kind is null
     and NEW.release_id is not null and NEW.target_sha is not null
     and NEW.db_plan_id is null
     and (NEW.plan_kind is null or NEW.plan_kind = 'APP_RELEASE') then
    return NEW;
  end if;

  -- INITIAL BIND DB: NORMAL->NORMAL, unbound -> full DB.
  if OLD.phase = 'NORMAL' and NEW.phase = 'NORMAL'
     and OLD.release_id is null and OLD.target_sha is null
     and OLD.db_plan_id is null and OLD.plan_kind is null
     and NEW.release_id is null
     and NEW.db_plan_id is not null and NEW.target_sha is not null
     and NEW.plan_kind = 'DB_MIGRATION' then
    return NEW;
  end if;

  -- SUCCESS CLEAR: SMOKE->NORMAL, full APP ou DB -> unbound.
  if OLD.phase = 'SMOKE' and NEW.phase = 'NORMAL'
     and NEW.release_id is null and NEW.target_sha is null
     and NEW.db_plan_id is null and NEW.plan_kind is null then
    if (OLD.release_id is not null and OLD.target_sha is not null and OLD.db_plan_id is null)
       or (OLD.db_plan_id is not null and OLD.target_sha is not null and OLD.release_id is null) then
      return NEW;
    end if;
  end if;

  -- FUTURE B17 REOPEN CLEAR: FAILED/CANCELED->NORMAL, epoch maior, full -> null.
  if OLD.phase in ('FAILED', 'CANCELED') and NEW.phase = 'NORMAL'
     and NEW.epoch > OLD.epoch
     and NEW.release_id is null and NEW.target_sha is null
     and NEW.db_plan_id is null and NEW.plan_kind is null then
    if (OLD.release_id is not null and OLD.target_sha is not null and OLD.db_plan_id is null)
       or (OLD.db_plan_id is not null and OLD.target_sha is not null and OLD.release_id is null) then
      return NEW;
    end if;
  end if;

  -- Demais casos: binding deve permanecer NULL-safe idêntico (sem troca mid-cycle).
  if NEW.release_id is not distinct from OLD.release_id
     and NEW.target_sha is not distinct from OLD.target_sha
     and NEW.db_plan_id is not distinct from OLD.db_plan_id
     and NEW.plan_kind is not distinct from OLD.plan_kind then
    return NEW;
  end if;

  raise exception '%', 'Alteração de binding release_id/target_sha/db_plan_id/plan_kind fora dos padrões permitidos (initial bind, success clear ou reopen clear).'
    using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
end;
$$;

comment on function public.app_maintenance_orchestration_binding_guard() is
  'Trigger PRIVADO BEFORE UPDATE em app_maintenance_state. Proíbe binding APP+DB coexistente e binding parcial. Padrões permitidos: initial APP bind (NORMAL->NORMAL, unbound->release_id+target_sha), initial DB bind (NORMAL->NORMAL, unbound->db_plan_id+target_sha+DB_MIGRATION), success clear (SMOKE->NORMAL, full->null) e FUTURE B17 REOPEN CLEAR (FAILED/CANCELED->NORMAL com epoch maior, full->null). Qualquer outro caso exige binding NULL-safe idêntico.';

revoke all on function public.app_maintenance_orchestration_binding_guard() from public;
revoke all on function public.app_maintenance_orchestration_binding_guard() from anon;
revoke all on function public.app_maintenance_orchestration_binding_guard() from authenticated;
revoke all on function public.app_maintenance_orchestration_binding_guard() from service_role;

alter function public.app_maintenance_orchestration_binding_guard() owner to postgres;

-- ════════════════════════════════════════════════════════════
--  11) WRITE ASSERT — reconhece BACKING_UP / MIGRATING como fence
-- ════════════════════════════════════════════════════════════
create or replace function public.app_assert_business_write_allowed(
  p_operation_id uuid default null,
  p_expected_operation_type text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_epoch integer;
  v_fence_effective_at timestamptz;
  v_op_id uuid;
  v_op_type text;
  v_op_status text;
  v_op_epoch integer;
  v_op_started_at timestamptz;
  v_op_expires_at timestamptz;
  v_err_msg constant text := 'Manutenção em andamento. Novas operações estão temporariamente pausadas.';
  v_err_detail constant text := 'MAINTENANCE_FENCE_ACTIVE';
begin
  begin
    select
      s.phase,
      s.epoch,
      s.fence_effective_at,
      o.id,
      o.operation_type,
      o.status,
      o.maintenance_epoch,
      o.started_at,
      o.expires_at
    into strict
      v_phase,
      v_epoch,
      v_fence_effective_at,
      v_op_id,
      v_op_type,
      v_op_status,
      v_op_epoch,
      v_op_started_at,
      v_op_expires_at
    from public.app_maintenance_state as s
    left join public.app_maintenance_operations as o
      on o.id = p_operation_id
    where s.scope = 'global';
  exception
    when no_data_found or too_many_rows then
      raise exception '%', v_err_msg
        using errcode = 'P0001', detail = v_err_detail;
  end;

  if v_phase is null
     or v_epoch is null
     or v_epoch < 0
     or v_phase not in (
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
       'CANCELED',
       'BACKING_UP',
       'MIGRATING'
     ) then
    raise exception '%', v_err_msg
      using errcode = 'P0001', detail = v_err_detail;
  end if;

  if v_phase in (
    'NORMAL',
    'NOTICE',
    'CANCELED'
  ) then
    return;
  end if;

  if v_phase not in (
       'FENCING',
       'DRAINING',
       'QUIESCENT',
       'RELEASING',
       'SMOKE',
       'RECOVERING',
       'ABORTING',
       'FAILED',
       'BACKING_UP',
       'MIGRATING'
     )
     or v_epoch < 1
     or v_fence_effective_at is null then
    raise exception '%', v_err_msg
      using errcode = 'P0001', detail = v_err_detail;
  end if;

  if p_operation_id is not null
     and p_expected_operation_type is not null
     and v_op_id is not null
     and v_op_status = 'IN_FLIGHT'
     and v_op_expires_at > clock_timestamp()
     and v_op_type = p_expected_operation_type
     and v_op_epoch = v_epoch - 1
     and v_op_started_at < v_fence_effective_at then
    return;
  end if;

  raise exception '%', v_err_msg
    using errcode = 'P0001', detail = v_err_detail;
end;
$$;

comment on function public.app_assert_business_write_allowed(uuid, text) is
  'Autoridade DB do business write fence. Fail-closed. Novo begin só em NORMAL|NOTICE|CANCELED. BACKING_UP e MIGRATING são phases conhecidas e fenced (iguais a RELEASING/SMOKE). Sem bypass genérico. Uso interno — não é RPC pública.';

revoke all on function public.app_assert_business_write_allowed(uuid, text) from public;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from anon;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from authenticated;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from service_role;

alter function public.app_assert_business_write_allowed(uuid, text) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_state_reloid oid;
  v_events_reloid oid;
  v_table text;
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
  v_condef text;
  v_phase_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text, ''MAINTENANCE_REOPENED''::text, ''DB_PLAN_CREATED''::text, ''DB_PLAN_VALIDATED''::text, ''DB_PLAN_APPROVED''::text, ''DB_PLAN_SCHEDULED''::text, ''DB_PREFLIGHT_PASSED''::text, ''DB_PREFLIGHT_BLOCKED''::text, ''LOGIN_GATE_CLOSED''::text, ''LOGIN_GATE_OPENED''::text, ''SESSION_DRAIN_STARTED''::text, ''SESSION_DRAIN_COMPLETED''::text, ''BACKUP_REQUESTED''::text, ''BACKUP_STARTED''::text, ''BACKUP_COMPLETED''::text, ''BACKUP_VERIFYING''::text, ''BACKUP_VERIFIED''::text, ''BACKUP_FAILED''::text, ''DB_MIGRATION_STARTED''::text, ''DB_MIGRATION_APPLIED''::text, ''DB_MIGRATION_RECONCILED''::text, ''DB_SCHEMA_VALIDATION_PASSED''::text, ''DB_SCHEMA_VALIDATION_FAILED''::text, ''DB_RECOVERY_REQUIRED''::text, ''DB_RELEASE_SUCCEEDED''::text, ''DB_RELEASE_FAILED''::text])))';
  v_phase_condef_expected constant text :=
    'CHECK ((phase = ANY (ARRAY[''NORMAL''::text, ''NOTICE''::text, ''FENCING''::text, ''DRAINING''::text, ''QUIESCENT''::text, ''RELEASING''::text, ''SMOKE''::text, ''RECOVERING''::text, ''ABORTING''::text, ''FAILED''::text, ''CANCELED''::text, ''BACKING_UP''::text, ''MIGRATING''::text])))';
  v_login_default text;
  v_login_notnull boolean;
  v_singleton_count integer;
  v_phase text;
  v_login_gate text;
  v_plan_kind text;
  v_release_id uuid;
  v_db_plan_id uuid;
  v_target_sha text;
  v_row_count integer;
  v_src text;
  v_from text;
  v_to text;
  v_edge_count integer := 0;
  v_guard_oid oid;
  v_assert_oid oid;
  v_transition_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_public_execute boolean;
begin
  v_state_reloid := to_regclass('public.app_maintenance_state');
  v_events_reloid := to_regclass('public.app_maintenance_events');

  foreach v_table in array array[
    'app_db_release_plans',
    'app_db_release_plan_migrations',
    'app_db_release_executions',
    'app_db_release_execution_steps',
    'app_backup_runs',
    'app_schema_validation_results'
  ]
  loop
    v_reloid := to_regclass('public.' || v_table);
    if v_reloid is null then
      raise exception 'postcheck 160: public.% não encontrada.', v_table;
    end if;

    select c.relrowsecurity into v_rls from pg_class c where c.oid = v_reloid;
    if not coalesce(v_rls, false) then
      raise exception 'postcheck 160: RLS deveria estar habilitada em %.', v_table;
    end if;

    select count(*) into v_policy_count
    from pg_policies
    where schemaname = 'public' and tablename = v_table;
    if v_policy_count <> 0 then
      raise exception 'postcheck 160: % não deve ter policies (policy_count=0).', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'select')
       or has_table_privilege('anon', 'public.' || v_table, 'insert')
       or has_table_privilege('anon', 'public.' || v_table, 'update')
       or has_table_privilege('anon', 'public.' || v_table, 'delete')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_table, 'update')
       or has_table_privilege('authenticated', 'public.' || v_table, 'delete') then
      raise exception 'postcheck 160: anon/authenticated não deveriam ter privilégios em %.', v_table;
    end if;

    select exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
      where c.oid = v_reloid
        and acl.grantee = 0
    ) into v_public_priv;
    if v_public_priv then
      raise exception 'postcheck 160: PUBLIC não deveria ter privilégios em %.', v_table;
    end if;

    execute format('select count(*) from public.%I', v_table) into v_row_count;
    if v_row_count <> 0 then
      raise exception 'postcheck 160: % deveria iniciar vazia (count=%).', v_table, v_row_count;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.app_db_release_plans', 'select')
     or not has_table_privilege('service_role', 'public.app_db_release_plans', 'insert')
     or not has_table_privilege('service_role', 'public.app_db_release_plans', 'update') then
    raise exception 'postcheck 160: service_role deveria ter SELECT/INSERT/UPDATE em app_db_release_plans.';
  end if;
  if has_table_privilege('service_role', 'public.app_db_release_plans', 'delete') then
    raise exception 'postcheck 160: service_role NÃO deveria ter DELETE em app_db_release_plans.';
  end if;

  if not has_table_privilege('service_role', 'public.app_db_release_plan_migrations', 'select')
     or not has_table_privilege('service_role', 'public.app_db_release_plan_migrations', 'insert') then
    raise exception 'postcheck 160: service_role deveria ter SELECT/INSERT em app_db_release_plan_migrations.';
  end if;
  if has_table_privilege('service_role', 'public.app_db_release_plan_migrations', 'update')
     or has_table_privilege('service_role', 'public.app_db_release_plan_migrations', 'delete') then
    raise exception 'postcheck 160: plan_migrations deveria ser append-only para service_role.';
  end if;

  if has_table_privilege('service_role', 'public.app_schema_validation_results', 'update')
     or has_table_privilege('service_role', 'public.app_schema_validation_results', 'delete') then
    raise exception 'postcheck 160: schema_validation_results deveria ser append-only para service_role.';
  end if;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'postcheck 160: event_type divergente do superset de 42 valores: %', v_condef;
  end if;

  select pg_get_constraintdef(oid) into v_phase_condef
  from pg_constraint
  where conrelid = v_state_reloid and conname = 'app_maintenance_state_phase_check';
  if v_phase_condef is distinct from v_phase_condef_expected then
    raise exception 'postcheck 160: phase divergente do contrato de 13 valores: %', v_phase_condef;
  end if;
  if position('RELEASING' in v_phase_condef) = 0 then
    raise exception 'postcheck 160: RELEASING deveria ser preservado.';
  end if;
  if position('BACKING_UP' in v_phase_condef) = 0 or position('MIGRATING' in v_phase_condef) = 0 then
    raise exception 'postcheck 160: BACKING_UP e MIGRATING deveriam ser phases.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_state_reloid and conname = 'app_maintenance_state_login_gate_check'
  ) then
    raise exception 'postcheck 160: constraint login_gate ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_state_reloid and conname = 'app_maintenance_state_plan_kind_check'
  ) then
    raise exception 'postcheck 160: constraint plan_kind ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_state_reloid and conname = 'app_maintenance_state_binding_kind_check'
  ) then
    raise exception 'postcheck 160: constraint binding_kind ausente.';
  end if;

  select a.atthasdef, pg_get_expr(d.adbin, d.adrelid)
    into v_login_notnull, v_login_default
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = v_state_reloid and a.attname = 'login_gate' and not a.attisdropped;
  if v_login_default is distinct from '''OPEN''::text' and v_login_default is distinct from 'OPEN' then
    if position('OPEN' in coalesce(v_login_default, '')) = 0 then
      raise exception 'postcheck 160: login_gate deveria ter DEFAULT OPEN (encontrado %).', v_login_default;
    end if;
  end if;

  select count(*) into v_singleton_count from public.app_maintenance_state;
  if v_singleton_count <> 1 then
    raise exception 'postcheck 160: singleton deveria continuar com exatamente 1 linha (count=%).', v_singleton_count;
  end if;

  select phase, login_gate, plan_kind, release_id, db_plan_id, target_sha
    into v_phase, v_login_gate, v_plan_kind, v_release_id, v_db_plan_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global';
  if v_phase is distinct from 'NORMAL'
     or v_login_gate is distinct from 'OPEN'
     or v_plan_kind is not null
     or v_release_id is not null
     or v_db_plan_id is not null
     or v_target_sha is not null then
    raise exception 'postcheck 160: singleton legado inválido após DDL (phase=%, login_gate=%, plan_kind=%, release_id=%, db_plan_id=%).',
      v_phase, v_login_gate, v_plan_kind, v_release_id, v_db_plan_id;
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'postcheck 160: transition_internal B12 não está intacto.';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_transition_oid;
  for v_from, v_to in
    select * from (values
      ('NORMAL',     'NOTICE'),
      ('NOTICE',     'FENCING'),
      ('FENCING',    'DRAINING'),
      ('DRAINING',   'QUIESCENT'),
      ('QUIESCENT',  'RELEASING'),
      ('RELEASING',  'SMOKE'),
      ('SMOKE',      'NORMAL'),
      ('SMOKE',      'RECOVERING'),
      ('RECOVERING', 'FAILED'),
      ('RELEASING',  'ABORTING'),
      ('ABORTING',   'FAILED'),
      ('FENCING',    'FAILED'),
      ('DRAINING',   'FAILED'),
      ('NORMAL',     'CANCELED'),
      ('NOTICE',     'CANCELED'),
      ('QUIESCENT',  'FAILED')
    ) as edges(from_phase, to_phase)
  loop
    if v_src !~ (quote_literal(v_from) || '[[:space:]]*,[[:space:]]*' || quote_literal(v_to)) then
      raise exception 'postcheck 160: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'postcheck 160: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;
  if v_src ~ (quote_literal('QUIESCENT') || '[[:space:]]*,[[:space:]]*' || quote_literal('BACKING_UP'))
     or v_src ~ (quote_literal('BACKING_UP') || '[[:space:]]*,[[:space:]]*' || quote_literal('MIGRATING'))
     or v_src ~ (quote_literal('MIGRATING') || '[[:space:]]*,[[:space:]]*' || quote_literal('SMOKE')) then
    raise exception 'postcheck 160: transition_internal NÃO deveria operacionalizar edges DB neste gate.';
  end if;

  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if v_guard_oid is null then
    raise exception 'postcheck 160: binding_guard não encontrado.';
  end if;
  select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_owner, v_src
  from pg_proc p where p.oid = v_guard_oid;
  if v_owner is distinct from 'postgres' or not coalesce(v_prosecdef, false)
     or v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 160: binding_guard com identidade divergente.';
  end if;
  if position('FUTURE B17 REOPEN CLEAR' in v_src) = 0 then
    raise exception 'postcheck 160: binding_guard deveria continuar contendo FUTURE B17 REOPEN CLEAR.';
  end if;
  if position('DB_MIGRATION' in v_src) = 0 or position('APP_RELEASE' in v_src) = 0 then
    raise exception 'postcheck 160: binding_guard deveria reconhecer APP_RELEASE e DB_MIGRATION.';
  end if;
  if has_function_privilege('anon', v_guard_oid, 'execute')
     or has_function_privilege('authenticated', v_guard_oid, 'execute')
     or has_function_privilege('service_role', v_guard_oid, 'execute') then
    raise exception 'postcheck 160: binding_guard NÃO deveria ter EXECUTE para clientes/service_role.';
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 160: app_assert_business_write_allowed não encontrada.';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_assert_oid;
  if position('''BACKING_UP''' in v_src) = 0 or position('''MIGRATING''' in v_src) = 0 then
    raise exception 'postcheck 160: write_assert deveria reconhecer BACKING_UP e MIGRATING.';
  end if;
  if position('''RELEASING''' in v_src) = 0 then
    raise exception 'postcheck 160: write_assert deveria preservar RELEASING.';
  end if;
  if has_function_privilege('anon', v_assert_oid, 'execute')
     or has_function_privilege('authenticated', v_assert_oid, 'execute')
     or has_function_privilege('service_role', v_assert_oid, 'execute') then
    raise exception 'postcheck 160: write_assert NÃO deveria ter EXECUTE para clientes/service_role.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'postcheck 160: trigger de binding_guard deveria continuar existindo.';
  end if;

  if has_table_privilege('service_role', 'public.app_maintenance_state', 'insert')
     or has_table_privilege('service_role', 'public.app_maintenance_state', 'delete')
     or has_table_privilege('service_role', 'public.app_maintenance_state', 'update') then
    raise exception 'postcheck 160: service_role NÃO deveria ter INSERT/UPDATE/DELETE direto em app_maintenance_state.';
  end if;

  if to_regclass('public.app_user_sessions') is not null
     or to_regclass('public.app_canonical_sessions') is not null then
    raise exception 'postcheck 160: session registry canônico não deveria ser criado neste gate.';
  end if;
end $$;

commit;
