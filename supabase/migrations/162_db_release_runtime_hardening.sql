-- ════════════════════════════════════════════════════════════
--  162 — Database release runtime hardening (PDB-I2D1).
--
--  Control-plane / structural hardening. SEM DML de negócio no apply,
--  sem backfill, sem seed, sem cópia de dados. Não toca 160/161.
--
--  Fecha os gaps de persistência e de write fence apontados pelo
--  PDB-I2C1/I2C2:
--    1) app_db_release_executions passa a persistir project_ref,
--       lease_generation, lease_expires_at, lock_released_at,
--       mutation_started_at e evidência de reconciliação
--       (executor_id = worker id; heartbeat_at e correlation_id já
--       existiam e apenas passam a ser NOT NULL — tabela vazia).
--    2) unique (plan_id, correlation_id) e índice único PARCIAL por
--       (environment, project_ref) enquanto o lock não foi liberado.
--       FAILED e RECOVERY_REQUIRED continuam donos do lock.
--    3) RPCs server-only (service_role) para claim atômico
--       (plan CAS + execução + lock de ambiente), heartbeat com CAS de
--       geração, transição de execução, liberação de lock, marcação de
--       lease vencida (sem takeover) e reconciliação humana.
--    4) event_type: 42 -> 53 valores (superset monotônico).
--    5) Manutenção DB: bind + NOTICE, transições controladas
--       QUIESCENT->BACKING_UP->MIGRATING->SMOKE->NORMAL, writer
--       controlado de login_gate, abort/reopen e guards de trigger que
--       impedem reabrir login/binding com execução RECOVERY_REQUIRED.
--    5b) FENCING->DRAINING->QUIESCENT também têm RPC DB dedicada
--       (as RPCs APP exigem release_id).
--    6) Write fence: guard (app_assert_business_write_allowed) nas
--       RPCs de escrita descobertas no inventário, triggers de tabela
--       nas tabelas sem escritor registrado e probe read-only de
--       catálogo (app_db_release_write_coverage_probe).
--
--  As definições de função reescritas abaixo são CREATE OR REPLACE
--  da ÚLTIMA definição do repositório + exatamente uma chamada de
--  guard logo após o BEGIN principal. ACL, owner e comentários das
--  funções são preservados pelo CREATE OR REPLACE.
--
--  ESCOPO NEGATIVO — NÃO aplica esta migration em HML/PROD neste
--  gate. NÃO executa backup/restore. NÃO altera UI. NÃO cria API.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text, ''MAINTENANCE_REOPENED''::text, ''DB_PLAN_CREATED''::text, ''DB_PLAN_VALIDATED''::text, ''DB_PLAN_APPROVED''::text, ''DB_PLAN_SCHEDULED''::text, ''DB_PREFLIGHT_PASSED''::text, ''DB_PREFLIGHT_BLOCKED''::text, ''LOGIN_GATE_CLOSED''::text, ''LOGIN_GATE_OPENED''::text, ''SESSION_DRAIN_STARTED''::text, ''SESSION_DRAIN_COMPLETED''::text, ''BACKUP_REQUESTED''::text, ''BACKUP_STARTED''::text, ''BACKUP_COMPLETED''::text, ''BACKUP_VERIFYING''::text, ''BACKUP_VERIFIED''::text, ''BACKUP_FAILED''::text, ''DB_MIGRATION_STARTED''::text, ''DB_MIGRATION_APPLIED''::text, ''DB_MIGRATION_RECONCILED''::text, ''DB_SCHEMA_VALIDATION_PASSED''::text, ''DB_SCHEMA_VALIDATION_FAILED''::text, ''DB_RECOVERY_REQUIRED''::text, ''DB_RELEASE_SUCCEEDED''::text, ''DB_RELEASE_FAILED''::text])))';
  v_condef text;
  v_count bigint;
  v_table text;
  v_fn text;
  v_target jsonb;
  v_oid oid;
  v_src text;
  v_secdef boolean;
begin
  foreach v_table in array array[
    'app_db_release_plans',
    'app_db_release_executions',
    'app_db_release_execution_steps',
    'app_maintenance_state',
    'app_maintenance_events',
    'app_maintenance_operations',
    'app_active_sessions'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'precheck 162: public.% não existe (migrations 140/141/160/161 ausentes).', v_table;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.app_assert_business_write_allowed(uuid, text)',
    'public.app_maintenance_business_write_trigger()',
    'public.app_maintenance_cutover_barrier_internal(boolean)',
    'public.app_maintenance_drain_in_flight_count_internal()',
    'public.app_maintenance_operation_expire_internal()',
    'public.app_maintenance_operation_begin_internal(text)',
    'public.app_maintenance_orchestration_binding_guard()'
  ]
  loop
    if to_regprocedure(v_fn) is null then
      raise exception 'precheck 162: % não existe.', v_fn;
    end if;
  end loop;

  select pg_get_constraintdef(c.oid) into v_condef
  from pg_constraint c
  where c.conrelid = to_regclass('public.app_maintenance_events')
    and c.conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 162: app_maintenance_events_event_type_check divergente do contrato de 42 valores da migration 160 (drift): %', v_condef;
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = to_regclass('public.app_db_release_executions')
      and not a.attisdropped
      and a.attname in (
        'project_ref',
        'lease_generation',
        'lease_expires_at',
        'lock_released_at',
        'mutation_started_at',
        'reconciled_at',
        'reconciled_by',
        'reconciliation_evidence'
      )
  ) then
    raise exception 'precheck 162: colunas de runtime já existem em app_db_release_executions (drift).';
  end if;

  select count(*) into v_count from public.app_db_release_executions;
  if v_count <> 0 then
    raise exception 'precheck 162: app_db_release_executions deveria estar vazia (count=%). A migration 162 não faz backfill.', v_count;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_db_release_project_ref_for_internal',
        'app_db_release_event_internal',
        'app_db_release_execution_json_internal',
        'app_maintenance_db_emit_internal',
        'app_db_release_plan_guard',
        'app_db_release_execution_plan_invariant',
        'app_db_release_binding_release_safe_internal',
        'app_db_release_owner_lock_internal',
        'app_db_release_claim_execution',
        'app_db_release_heartbeat_execution',
        'app_db_release_transition_execution',
        'app_db_release_release_lock',
        'app_db_release_flag_stale_execution',
        'app_db_release_reconcile_execution',
        'app_db_release_release_reconciled_lock',
        'app_maintenance_db_orchestration_start',
        'app_maintenance_db_orchestration_transition',
        'app_maintenance_db_orchestration_login_gate',
        'app_maintenance_db_orchestration_abort_to_normal',
        'app_maintenance_login_gate_guard',
        'app_assert_business_write_allowed_registry_callee_internal',
        'app_maintenance_business_write_registry_trigger',
        'app_db_release_write_coverage_probe'
      )
  ) then
    raise exception 'precheck 162: já existe função da migration 162 (colisão/reaplicação).';
  end if;

  if exists (
    select 1 from pg_trigger t
    where not t.tgisinternal
      and (
        t.tgname in (
          'app_maintenance_login_gate_guard_trg',
          'app_db_release_plan_guard_trg',
          'app_db_release_execution_plan_invariant_trg'
        )
        or t.tgname like 'aaa_maintenance_guard_%'
           and t.tgname not in (
             'aaa_maintenance_guard_tab_promocoes',
             'aaa_maintenance_guard_tab_grupos_opcoes',
             'aaa_maintenance_guard_tab_opcoes'
           )
      )
  ) then
    raise exception 'precheck 162: já existe trigger da migration 162 (colisão/reaplicação).';
  end if;

  -- Pré-imagem: cada função reescrita precisa ser exatamente a última
  -- definição do repositório (fail-closed contra drift do ambiente).
  for v_target in
    select value from jsonb_array_elements(
      $guard_targets$[{"signature":"public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)","preimage_md5":"fab6da072c5df5b1ff45b0e90da8e12e"},{"signature":"public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric)","preimage_md5":"3799dd42b0a33901b12d653935e3715f"},{"signature":"public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)","preimage_md5":"926e7d061dc5438cb16c24865c8944e3"},{"signature":"public.app_pedido_atualizar_status(text, text, text)","preimage_md5":"2466432cfb7dd8db0bc7e2a09e3f9f34"},{"signature":"public.app_pedido_marcar_setor_pronto(text, text, text[])","preimage_md5":"37c3bc7fd9a3be48be48156180fc9166"},{"signature":"public.app_pedido_atualizar_itens(text, jsonb)","preimage_md5":"bd67d37ac64a5ea485dd9ddf40c22824"},{"signature":"public.app_pedido_atualizar_cliente(text, text, text)","preimage_md5":"12dd8ea22f9f590135ac61f49479b36b"},{"signature":"public.app_pedido_transferir_mesa(text, text)","preimage_md5":"eadf0aaefd73e8797f58253a23f05222"},{"signature":"public.app_pedido_solicitar_conta_mesa(text, bigint)","preimage_md5":"525781ed43b69b8be3b940156d406a9d"},{"signature":"public.app_pedido_marcar_pago(text, text, text)","preimage_md5":"a3eb6cff3fd662b149b4b5a31c85be66"},{"signature":"public.pub_solicitar_conta(bigint, text)","preimage_md5":"83b9eaae234be8e3c2b9016259e74624"},{"signature":"public.pub_solicitar_conta(bigint, text, boolean)","preimage_md5":"c67851e92bcdfeaa7f7d11dcf8717528"},{"signature":"public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean)","preimage_md5":"25339234304bcf890ec014bb191155d5"},{"signature":"public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text)","preimage_md5":"e0c989c3b1d1772fa2fdbaa565ee8543"},{"signature":"public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)","preimage_md5":"0e5d2f63883236d9b43e61f2bff02035"},{"signature":"public.app_admin_criar_usuario(text, text, jsonb)","preimage_md5":"1ad52ef34fe6e2138a5aedc160952c12"},{"signature":"public.app_admin_salvar_usuario(text, text, bigint, jsonb)","preimage_md5":"8d0ceaf92ebcaff8aecc7046d910db15"},{"signature":"public.app_criar_usuario(jsonb)","preimage_md5":"d10927dd076eece4047229a149647235"},{"signature":"public.app_definir_senha_hash(bigint, text)","preimage_md5":"9ca75991887b38111b0a98dbf611b13a"},{"signature":"public.app_salvar_usuario(bigint, jsonb)","preimage_md5":"128d5ce1b41c071205e28697f528357c"},{"signature":"public.app_baixar_estoque_produto(bigint, jsonb)","preimage_md5":"9c4626cddb51bdd7302847588b23b1d8"},{"signature":"public.app_criar_categoria(bigint, text, bigint, bigint, integer)","preimage_md5":"3e51107c23963b241ec9d22343ab3d81"},{"signature":"public.app_criar_loja(text, text, text, text, text, text, text)","preimage_md5":"c313f449e3f9743d387758e1837d956c"},{"signature":"public.app_reservar_numero_nfce(bigint)","preimage_md5":"7e097b22b3124890474cde327f40f1cc"}]$guard_targets$::jsonb
    )
  loop
    v_oid := to_regprocedure(v_target->>'signature');
    if v_oid is null then
      raise exception 'precheck 162: função % não existe.', v_target->>'signature';
    end if;
    select p.prosrc, p.prosecdef into v_src, v_secdef
    from pg_proc p where p.oid = v_oid;
    if not coalesce(v_secdef, false) then
      raise exception 'precheck 162: % deveria ser SECURITY DEFINER.', v_target->>'signature';
    end if;
    if position('app_assert_business_write_allowed' in v_src) <> 0 then
      raise exception 'precheck 162: % já contém guard do write fence (reaplicação?).', v_target->>'signature';
    end if;
    if md5(replace(v_src, E'\r', '')) is distinct from (v_target->>'preimage_md5') then
      raise exception 'precheck 162: drift na definição de % (esperado md5 %).', v_target->>'signature', v_target->>'preimage_md5';
    end if;
  end loop;

  -- Tabelas que receberão trigger de write fence precisam existir.
  for v_table in
    select value from jsonb_array_elements_text(
      $trigger_tables$["tab_cargos","tab_leads","tab_chamados","tab_pesquisa_satisfacao","tab_clientes","tab_dispositivos","tab_dispositivos_bloqueados","loja_fiscal_nfce","pagamento_transacoes","pagamento_alocacoes","pagamento_eventos","fiscal_regra","fiscal_regra_versao","loja_fiscal_regra","fiscal_template","fiscal_template_regra","fiscal_catalogo_ncm","fiscal_catalogo_cest","fiscal_catalogo_cfop","fiscal_catalogo_cst_icms","fiscal_catalogo_csosn","fiscal_catalogo_cst_pis","fiscal_catalogo_cst_cofins","loja_fiscal_emitente"]$trigger_tables$::jsonb
    )
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'precheck 162: public.% não existe (trigger de write fence).', v_table;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) EVENT_TYPE — 42 -> 53 (superset monotônico, nenhum removido)
--     Novos: DB_EXECUTION_CLAIMED, DB_LOCK_ACQUIRED, DB_LOCK_RELEASED,
--     DB_WRITE_FENCE_VERIFIED, DB_MIGRATION_FAILED,
--     DB_MIGRATION_AMBIGUOUS, DB_SMOKE_PASSED, DB_SMOKE_FAILED,
--     DB_EXECUTOR_HEARTBEAT_STALE, DB_EXECUTION_RECONCILED,
--     DB_MAINTENANCE_PHASE_CHANGED.
--     Não adicionados por já existir equivalente: aborto do executor
--     usa MAINTENANCE_ABORTED; requested/preflight usa
--     DB_PREFLIGHT_PASSED.
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
    'DB_RELEASE_FAILED',
    'DB_EXECUTION_CLAIMED',
    'DB_LOCK_ACQUIRED',
    'DB_LOCK_RELEASED',
    'DB_WRITE_FENCE_VERIFIED',
    'DB_MIGRATION_FAILED',
    'DB_MIGRATION_AMBIGUOUS',
    'DB_SMOKE_PASSED',
    'DB_SMOKE_FAILED',
    'DB_EXECUTOR_HEARTBEAT_STALE',
    'DB_EXECUTION_RECONCILED',
    'DB_MAINTENANCE_PHASE_CHANGED'
  ));

comment on constraint app_maintenance_events_event_type_check
  on public.app_maintenance_events is
  'Contrato de 53 event_types (42 da migration 160 + 11 eventos de runtime DB da migration 162). Alteração estritamente monotônica. Nenhum valor antigo removido. Linhas históricas intocadas.';

-- ════════════════════════════════════════════════════════════
--  2) APP_DB_RELEASE_EXECUTIONS — persistência de runtime
--     (tabela vazia — verificado no precheck; sem backfill)
--     executor_id continua sendo o worker id (não duplicado).
-- ════════════════════════════════════════════════════════════
alter table public.app_db_release_executions
  add column project_ref text null,
  add column lease_generation bigint null,
  add column lease_expires_at timestamptz null,
  add column lock_released_at timestamptz null,
  add column mutation_started_at timestamptz null,
  add column reconciled_at timestamptz null,
  add column reconciled_by uuid null,
  add column reconciliation_evidence jsonb null;

-- Ownership nunca pode ser "escondido" por default: sem DEFAULT nas
-- colunas de ownership; NOT NULL onde o claim sempre as preenche.
alter table public.app_db_release_executions
  alter column correlation_id set not null,
  alter column executor_id set not null,
  alter column heartbeat_at set not null,
  alter column project_ref set not null,
  alter column lease_generation set not null,
  alter column lease_expires_at set not null;

alter table public.app_db_release_executions
  add constraint app_db_release_executions_project_ref_env_check
    check (
      (environment = 'HML' and project_ref = 'zzixvyspwszewhxzusot')
      or (environment = 'PROD' and project_ref = 'rwnzggjxhxnfrhstbxkm')
    ),
  add constraint app_db_release_executions_lease_generation_check
    check (lease_generation >= 1),
  add constraint app_db_release_executions_lease_window_check
    check (lease_expires_at > heartbeat_at),
  add constraint app_db_release_executions_lock_release_check
    check (
      lock_released_at is null
      or status in ('SUCCEEDED', 'CANCELED')
    ),
  add constraint app_db_release_executions_mutation_check
    check (
      status not in ('MIGRATING', 'VERIFYING')
      or mutation_started_at is not null
    ),
  add constraint app_db_release_executions_reconciliation_check
    check (
      (reconciled_at is null and reconciled_by is null and reconciliation_evidence is null)
      or (
        reconciled_at is not null
        and reconciled_by is not null
        and reconciliation_evidence is not null
        and status in ('SUCCEEDED', 'CANCELED')
        and jsonb_typeof(reconciliation_evidence) = 'object'
        and reconciliation_evidence <> '{}'::jsonb
        and not (reconciliation_evidence ? 'authorization')
        and not (reconciliation_evidence ? 'Authorization')
        and not (reconciliation_evidence ? 'service_role')
        and not (reconciliation_evidence ? 'service_role_key')
        and not (reconciliation_evidence ? 'password')
        and not (reconciliation_evidence ? 'secret')
        and not (reconciliation_evidence ? 'token')
        and not (reconciliation_evidence ? 'api_key')
      )
    ),
  add constraint app_db_release_executions_plan_correlation_uidx
    unique (plan_id, correlation_id),
  add constraint app_db_release_executions_target_generation_uidx
    unique (environment, project_ref, lease_generation);

comment on column public.app_db_release_executions.project_ref is
  'Project ref do banco alvo. Amarrado ao environment por CHECK (HML=zzixvyspwszewhxzusot, PROD=rwnzggjxhxnfrhstbxkm) — nunca trocável.';
comment on column public.app_db_release_executions.lease_generation is
  'Fencing token monotônico por (environment, project_ref): claim = max(lease_generation)+1. Heartbeat/transição são CAS nesta geração; nunca incrementa por takeover (não há takeover automático).';
comment on column public.app_db_release_executions.lease_expires_at is
  'Vencimento da lease (relógio do servidor). Vencida NÃO transfere ownership: só gera evidência (DB_EXECUTOR_HEARTBEAT_STALE) e exige reconciliação.';
comment on column public.app_db_release_executions.lock_released_at is
  'NULL = execução ainda dona do lock do ambiente (índice único parcial). Só SUCCEEDED/CANCELED liberam. FAILED e RECOVERY_REQUIRED retêm o lock até reconciliação.';
comment on column public.app_db_release_executions.mutation_started_at is
  'Marca a entrada em MIGRATING (primeira possível mutação de schema). Não-nulo => reopen automático de login/binding é proibido.';

-- Lock de ambiente: no máximo UMA execução com lock retido por banco
-- alvo. plan_id nunca faz parte da chave. Status participantes:
-- REQUESTED, PREPARING, DRAINING, BACKING_UP, MIGRATING, VERIFYING,
-- RECOVERY_REQUIRED, FAILED (e SUCCEEDED/CANCELED até o release do lock).
create unique index app_db_release_executions_active_target_uidx
  on public.app_db_release_executions (environment, project_ref)
  where lock_released_at is null;

create index app_db_release_executions_lease_expiry_idx
  on public.app_db_release_executions (lease_expires_at)
  where lock_released_at is null;

-- Escritas de ownership só via RPC SECURITY DEFINER server-only.
revoke insert, update on table public.app_db_release_executions from service_role;

-- ════════════════════════════════════════════════════════════
--  3) HELPERS PRIVADOS (sem GRANT a nenhum role; só funções
--     SECURITY DEFINER do owner postgres as chamam)
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_project_ref_for_internal(p_environment text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_environment
    when 'HML' then 'zzixvyspwszewhxzusot'
    when 'PROD' then 'rwnzggjxhxnfrhstbxkm'
    else null
  end
$$;

comment on function public.app_db_release_project_ref_for_internal(text) is
  'Mapeamento fixo environment -> project_ref (HML=zzixvyspwszewhxzusot, PROD=rwnzggjxhxnfrhstbxkm). Nunca aceita ref vindo do caller como autoridade. Uso interno.';

create function public.app_db_release_event_internal(
  p_event_type text,
  p_source text,
  p_actor_user_id uuid,
  p_message text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_epoch integer;
begin
  select s.epoch into v_epoch
  from public.app_maintenance_state as s
  where s.scope = 'global';

  insert into public.app_maintenance_events (
    id,
    maintenance_epoch,
    release_id,
    event_type,
    source,
    actor_user_id,
    actor_email,
    message,
    metadata,
    created_at
  ) values (
    gen_random_uuid(),
    coalesce(v_epoch, 0),
    null,
    p_event_type,
    p_source,
    p_actor_user_id,
    null,
    left(p_message, 240),
    p_metadata,
    now()
  );
end;
$$;

comment on function public.app_db_release_event_internal(text, text, uuid, text, jsonb) is
  'Append de evento de auditoria do runtime DB (release_id NULL). Valida event_type pela CHECK de 53 valores. Uso interno.';

create function public.app_db_release_execution_json_internal(p_exec public.app_db_release_executions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_exec.id,
    'planId', p_exec.plan_id,
    'environment', p_exec.environment,
    'projectRef', p_exec.project_ref,
    'status', p_exec.status,
    'correlationId', p_exec.correlation_id,
    'workerId', p_exec.executor_id,
    'leaseGeneration', p_exec.lease_generation,
    'heartbeatAt', p_exec.heartbeat_at,
    'leaseExpiresAt', p_exec.lease_expires_at,
    'startedAt', p_exec.started_at,
    'completedAt', p_exec.completed_at,
    'claimedAt', p_exec.created_at,
    'lockReleasedAt', p_exec.lock_released_at,
    'mutationStartedAt', p_exec.mutation_started_at,
    'reconciledAt', p_exec.reconciled_at,
    'failureCode', p_exec.failure_code
  )
$$;

comment on function public.app_db_release_execution_json_internal(public.app_db_release_executions) is
  'Projeção JSON sem segredos de uma execução. Uso interno.';

-- ── ownership + lease (sem takeover) ─────────────────────────
create function public.app_db_release_owner_lock_internal(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_plan_id uuid,
  p_protective boolean,
  p_allow_reconciled boolean
)
returns public.app_db_release_executions
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
begin
  if p_execution_id is null or p_worker_id is null or p_lease_generation is null then
    raise exception '%', 'Requisição de ownership inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception '%', 'Execução não encontrada.'
      using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
  end if;

  if p_plan_id is not null and v_exec.plan_id is distinct from p_plan_id then
    raise exception '%', 'Execução não pertence ao plano vinculado.'
      using errcode = 'P0001', detail = 'PLAN_MISMATCH';
  end if;

  if coalesce(p_allow_reconciled, false) and v_exec.reconciled_at is not null then
    return v_exec;
  end if;

  if v_exec.executor_id is distinct from p_worker_id then
    raise exception '%', 'Worker não é o dono da execução.'
      using errcode = 'P0001', detail = 'WORKER_MISMATCH';
  end if;

  if v_exec.lease_generation is distinct from p_lease_generation then
    raise exception '%', 'Geração da lease divergente.'
      using errcode = 'P0001', detail = 'LEASE_GENERATION_MISMATCH';
  end if;

  if v_exec.lock_released_at is not null then
    raise exception '%', 'Execução já teve o lock liberado.'
      using errcode = 'P0001', detail = 'EXECUTION_TERMINAL';
  end if;

  if not coalesce(p_protective, false) then
    if v_exec.status not in ('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'MIGRATING', 'VERIFYING') then
      raise exception '%', 'Execução não está ativa.'
        using errcode = 'P0001', detail = 'EXECUTION_TERMINAL';
    end if;
    if v_exec.lease_expires_at <= clock_timestamp() then
      raise exception '%', 'Lease vencida; sem takeover automático.'
        using errcode = 'P0001', detail = 'LEASE_EXPIRED';
    end if;
  end if;

  return v_exec;
end;
$$;

comment on function public.app_db_release_owner_lock_internal(uuid, text, bigint, uuid, boolean, boolean) is
  'Trava a execução FOR UPDATE e prova ownership exato (worker + lease_generation + lock retido). Lease vencida nunca é reassumida por outro worker. p_protective=true dispensa status ativo/lease vencida (saídas protetoras). Uso interno.';

-- ── invariantes plano <-> execução (nível de banco) ──────────
create function public.app_db_release_plan_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if NEW.status = 'RUNNING' and OLD.status is distinct from 'RUNNING' then
    if not exists (
      select 1
      from public.app_db_release_executions as e
      where e.plan_id = NEW.id
        and e.lock_released_at is null
    ) then
      raise exception '%', 'Plano só pode virar RUNNING com execução dona do lock (claim atômico).'
        using errcode = 'P0001', detail = 'PLAN_RUNNING_WITHOUT_EXECUTION';
    end if;
  end if;

  if OLD.status = 'RUNNING'
     and NEW.status not in ('RUNNING', 'BLOCKED', 'FAILED', 'RECOVERY_REQUIRED', 'SUCCEEDED') then
    raise exception '%', 'Plano RUNNING não pode voltar a estado reivindicável/cancelável.'
      using errcode = 'P0001', detail = 'PLAN_RUNNING_CANNOT_REVERT';
  end if;

  if NEW.status = 'SUCCEEDED' and OLD.status is distinct from 'SUCCEEDED' then
    if not exists (
      select 1
      from public.app_db_release_executions as e
      where e.plan_id = NEW.id
        and e.status = 'SUCCEEDED'
    ) then
      raise exception '%', 'Plano só pode virar SUCCEEDED com execução SUCCEEDED.'
        using errcode = 'P0001', detail = 'PLAN_SUCCEEDED_WITHOUT_EXECUTION';
    end if;
  end if;

  return NEW;
end;
$$;

comment on function public.app_db_release_plan_guard() is
  'BEFORE UPDATE em app_db_release_plans: RUNNING exige execução dona do lock (não há PATCH direto para RUNNING sem claim); RUNNING não reverte; SUCCEEDED exige execução SUCCEEDED.';

create trigger app_db_release_plan_guard_trg
  before update on public.app_db_release_plans
  for each row
  execute function public.app_db_release_plan_guard();

create function public.app_db_release_execution_plan_invariant()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select p.status into v_status
  from public.app_db_release_plans as p
  where p.id = NEW.plan_id;

  if v_status is distinct from 'RUNNING' then
    raise exception '%', 'Execução só existe com o plano RUNNING (plan CAS no mesmo claim).'
      using errcode = 'P0001', detail = 'EXECUTION_WITHOUT_PLAN_CAS';
  end if;

  return null;
end;
$$;

comment on function public.app_db_release_execution_plan_invariant() is
  'Constraint trigger DEFERRED (AFTER INSERT): no commit, a execução recém-criada exige plano RUNNING. Nenhuma execução sem plan CAS; transação abortada não deixa plano RUNNING sem execução (plan_guard).';

create constraint trigger app_db_release_execution_plan_invariant_trg
  after insert on public.app_db_release_executions
  deferrable initially deferred
  for each row
  execute function public.app_db_release_execution_plan_invariant();

-- ── prova de binding/login seguro (usada por RPC e por trigger) ──
create function public.app_db_release_binding_release_safe_internal(
  p_plan_id uuid,
  p_mode text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_migration_count integer;
  v_steps_ok boolean;
  v_reopen_ok boolean;
begin
  if p_plan_id is null or p_mode is null or p_mode not in ('SUCCESS', 'REOPEN', 'OPEN') then
    return false;
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.plan_id = p_plan_id
  order by e.created_at desc, e.id desc
  limit 1;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.app_db_release_executions as e
    where e.plan_id = p_plan_id
      and e.status = 'RECOVERY_REQUIRED'
  ) then
    return false;
  end if;

  select p.migration_count into v_migration_count
  from public.app_db_release_plans as p
  where p.id = p_plan_id;

  v_steps_ok :=
    exists (
      select 1 from public.app_db_release_execution_steps as s
      where s.execution_id = v_exec.id
        and s.step_order = 900
        and s.step_type = 'SCHEMA_VALIDATE'
        and s.status = 'SUCCEEDED'
    )
    and exists (
      select 1 from public.app_db_release_execution_steps as s
      where s.execution_id = v_exec.id
        and s.step_order = 910
        and s.step_type = 'SMOKE'
        and s.status = 'SUCCEEDED'
    )
    and (
      select count(*) from public.app_db_release_execution_steps as s
      where s.execution_id = v_exec.id
        and s.step_type = 'MIGRATE'
        and s.status = 'SUCCEEDED'
    ) = coalesce(v_migration_count, -1)
    and not exists (
      select 1 from public.app_db_release_execution_steps as s
      where s.execution_id = v_exec.id
        and s.status in ('RUNNING', 'FAILED')
    );

  v_reopen_ok :=
    (
      v_exec.mutation_started_at is null
      and v_exec.status in ('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'FAILED', 'CANCELED')
    )
    or (
      v_exec.reconciled_at is not null
      and v_exec.status in ('CANCELED', 'SUCCEEDED')
    );

  if p_mode = 'SUCCESS' then
    return v_exec.status = 'VERIFYING'
      and v_exec.mutation_started_at is not null
      and v_steps_ok;
  elsif p_mode = 'REOPEN' then
    return v_reopen_ok;
  end if;

  -- OPEN: sucesso comprovado (VERIFYING/SUCCEEDED com passos completos)
  -- ou execução comprovadamente NÃO mutada / reconciliada por humano.
  return (
    v_exec.status in ('VERIFYING', 'SUCCEEDED')
    and v_exec.mutation_started_at is not null
    and v_steps_ok
  ) or v_reopen_ok;
end;
$$;

comment on function public.app_db_release_binding_release_safe_internal(uuid, text) is
  'Prova server-side de normalização segura. SUCCESS: VERIFYING + SCHEMA_VALIDATE/SMOKE/MIGRATE steps SUCCEEDED. REOPEN: execução não mutada (mutation_started_at NULL) ou reconciliada por humano. OPEN: SUCCESS ou REOPEN. Qualquer execução RECOVERY_REQUIRED do plano => false (fail-closed).';

-- ════════════════════════════════════════════════════════════
--  4) CLAIM ATÔMICO — plan CAS + execução + lock de ambiente
--     (uma transação; server-only)
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_claim_execution(
  p_plan_id uuid,
  p_environment text,
  p_project_ref text,
  p_worker_id text,
  p_correlation_id uuid,
  p_intent text,
  p_expected_plan_hash text,
  p_expected_plan_updated_at timestamptz,
  p_lease_ttl_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_plan public.app_db_release_plans%rowtype;
  v_existing public.app_db_release_executions%rowtype;
  v_holder public.app_db_release_executions%rowtype;
  v_new public.app_db_release_executions%rowtype;
  v_now timestamptz;
  v_generation bigint;
  v_from_status text;
  v_row_count integer;
begin
  if p_plan_id is null or p_environment is null or p_project_ref is null
     or p_worker_id is null or p_correlation_id is null or p_intent is null
     or p_expected_plan_hash is null or p_expected_plan_updated_at is null
     or p_lease_ttl_seconds is null then
    raise exception '%', 'Requisição de claim inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  if p_environment not in ('HML', 'PROD') then
    raise exception '%', 'Ambiente inválido.'
      using errcode = 'P0001', detail = 'ENVIRONMENT_INVALID';
  end if;

  if p_project_ref is distinct from public.app_db_release_project_ref_for_internal(p_environment) then
    raise exception '%', 'project_ref não corresponde ao ambiente.'
      using errcode = 'P0001', detail = 'PROJECT_REF_MISMATCH';
  end if;

  if p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
     or p_worker_id ~* '(secret|token|bearer|password|authorization|service_role)' then
    raise exception '%', 'Identidade de worker inválida.'
      using errcode = 'P0001', detail = 'WORKER_ID_INVALID';
  end if;

  if p_intent not in ('IMMEDIATE', 'SCHEDULED') then
    raise exception '%', 'Intenção de claim inválida.'
      using errcode = 'P0001', detail = 'CLAIM_INTENT_INVALID';
  end if;

  if p_lease_ttl_seconds < 30 or p_lease_ttl_seconds > 900
     or p_expected_plan_hash !~ '^[0-9a-f]{64}$' then
    raise exception '%', 'Requisição de claim inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  -- Serializa claims do MESMO banco alvo (chave = ambiente + projeto;
  -- plan id nunca entra na chave do lock).
  perform pg_advisory_xact_lock(
    hashtextextended('DB_RELEASE:' || p_environment || ':' || p_project_ref, 0)
  );

  select * into v_plan
  from public.app_db_release_plans as p
  where p.id = p_plan_id
  for update;

  if not found then
    raise exception '%', 'Plano não encontrado.'
      using errcode = 'P0001', detail = 'PLAN_NOT_FOUND';
  end if;

  if v_plan.environment is distinct from p_environment then
    raise exception '%', 'Ambiente do plano diverge do ambiente do claim.'
      using errcode = 'P0001', detail = 'ENVIRONMENT_INVALID';
  end if;

  -- Replay idempotente da MESMA tentativa (plan_id + correlation_id).
  select * into v_existing
  from public.app_db_release_executions as e
  where e.plan_id = p_plan_id
    and e.correlation_id = p_correlation_id;

  if found then
    if v_existing.executor_id = p_worker_id
       and v_existing.environment = p_environment
       and v_existing.project_ref = p_project_ref then
      return jsonb_build_object(
        'outcome', 'REPLAYED',
        'execution', public.app_db_release_execution_json_internal(v_existing),
        'planStatus', v_plan.status
      );
    end if;
    raise exception '%', 'Execução pertence a outro worker.'
      using errcode = 'P0001', detail = 'EXECUTION_OWNED_BY_OTHER_WORKER';
  end if;

  if exists (
    select 1 from public.app_db_release_executions as e where e.plan_id = p_plan_id
  ) then
    raise exception '%', 'Plano já possui execução (outra correlação).'
      using errcode = 'P0001', detail = 'PLAN_EXECUTION_EXISTS';
  end if;

  if p_intent = 'IMMEDIATE' then
    if v_plan.status is distinct from 'APPROVED' then
      raise exception '%', 'Status do plano não permite claim imediato.'
        using errcode = 'P0001',
              detail = case when v_plan.status = 'SCHEDULED' then 'INTENT_STATUS_MISMATCH' else 'PLAN_STATUS_INVALID' end;
    end if;
  else
    if v_plan.status is distinct from 'SCHEDULED' then
      raise exception '%', 'Status do plano não permite claim agendado.'
        using errcode = 'P0001',
              detail = case when v_plan.status = 'APPROVED' then 'INTENT_STATUS_MISMATCH' else 'PLAN_STATUS_INVALID' end;
    end if;
    if v_plan.scheduled_at is null then
      raise exception '%', 'Plano agendado sem scheduled_at.'
        using errcode = 'P0001', detail = 'SCHEDULE_INVALID';
    end if;
    if clock_timestamp() < v_plan.scheduled_at then
      raise exception '%', 'Janela agendada ainda não iniciou.'
        using errcode = 'P0001', detail = 'SCHEDULE_NOT_DUE';
    end if;
    if clock_timestamp() >= v_plan.scheduled_at + interval '15 minutes' then
      raise exception '%', 'Janela agendada expirou.'
        using errcode = 'P0001', detail = 'SCHEDULE_WINDOW_EXPIRED';
    end if;
  end if;

  if v_plan.plan_hash is distinct from p_expected_plan_hash
     or v_plan.updated_at is distinct from p_expected_plan_updated_at then
    raise exception '%', 'Plano mudou desde a leitura (drift).'
      using errcode = 'P0001', detail = 'PLAN_DRIFT';
  end if;

  v_from_status := v_plan.status;

  select * into v_holder
  from public.app_db_release_executions as e
  where e.environment = p_environment
    and e.project_ref = p_project_ref
    and e.lock_released_at is null
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', 'LOCKED',
      'holder', jsonb_build_object(
        'executionId', v_holder.id,
        'planId', v_holder.plan_id,
        'status', v_holder.status,
        'workerId', v_holder.executor_id,
        'leaseGeneration', v_holder.lease_generation
      )
    );
  end if;

  v_now := clock_timestamp();

  select coalesce(max(e.lease_generation), 0) + 1 into v_generation
  from public.app_db_release_executions as e
  where e.environment = p_environment
    and e.project_ref = p_project_ref;

  begin
    insert into public.app_db_release_executions (
      id,
      plan_id,
      environment,
      status,
      correlation_id,
      executor_id,
      heartbeat_at,
      project_ref,
      lease_generation,
      lease_expires_at
    ) values (
      gen_random_uuid(),
      p_plan_id,
      p_environment,
      'REQUESTED',
      p_correlation_id,
      p_worker_id,
      v_now,
      p_project_ref,
      v_generation,
      v_now + make_interval(secs => p_lease_ttl_seconds)
    )
    returning * into v_new;
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'LOCKED', 'holder', null);
  end;

  update public.app_db_release_plans
  set status = 'RUNNING',
      updated_at = v_now
  where id = p_plan_id
    and status = v_from_status
    and plan_hash = p_expected_plan_hash
    and updated_at = p_expected_plan_updated_at;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Plan CAS falhou; claim revertido.'
      using errcode = 'P0001', detail = 'PLAN_DRIFT';
  end if;

  perform public.app_db_release_event_internal(
    'DB_EXECUTION_CLAIMED',
    'executor',
    null,
    'Execução DB reivindicada.',
    jsonb_build_object(
      'executionId', v_new.id,
      'planId', p_plan_id,
      'environment', p_environment,
      'projectRef', p_project_ref,
      'workerId', p_worker_id,
      'correlationId', p_correlation_id,
      'leaseGeneration', v_generation,
      'intent', p_intent
    )
  );
  perform public.app_db_release_event_internal(
    'DB_LOCK_ACQUIRED',
    'executor',
    null,
    'Lock de ambiente adquirido.',
    jsonb_build_object(
      'executionId', v_new.id,
      'planId', p_plan_id,
      'environment', p_environment,
      'projectRef', p_project_ref,
      'leaseGeneration', v_generation
    )
  );

  return jsonb_build_object(
    'outcome', 'CLAIMED',
    'execution', public.app_db_release_execution_json_internal(v_new),
    'planStatus', 'RUNNING'
  );
end;
$$;

comment on function public.app_db_release_claim_execution(uuid, text, text, text, uuid, text, text, timestamptz, integer) is
  'RPC server-only (service_role). Claim atômico: advisory lock por ambiente+projeto, plan CAS (status/hash/updated_at) SCHEDULED|APPROVED->RUNNING, INSERT da execução (lease_generation = max+1) e lock de ambiente (índice único parcial) na MESMA transação. Replay do mesmo plano+correlação+worker devolve REPLAYED sem mutar; outro worker é rejeitado; lock ocupado devolve LOCKED. Não há takeover.';

-- ════════════════════════════════════════════════════════════
--  5) HEARTBEAT — CAS de worker + geração; servidor autoritativo
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_heartbeat_execution(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_lease_ttl_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_now timestamptz;
  v_row_count integer;
begin
  if p_lease_ttl_seconds is null or p_lease_ttl_seconds < 30 or p_lease_ttl_seconds > 900 then
    raise exception '%', 'TTL de lease inválido.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  v_exec := public.app_db_release_owner_lock_internal(
    p_execution_id, p_worker_id, p_lease_generation, null, true, false
  );

  if v_exec.status not in ('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'MIGRATING', 'VERIFYING') then
    raise exception '%', 'Execução terminal/em recuperação não pode ser revivida por heartbeat.'
      using errcode = 'P0001', detail = 'EXECUTION_TERMINAL';
  end if;

  v_now := clock_timestamp();

  if v_exec.lease_expires_at <= v_now then
    if not exists (
      select 1
      from public.app_maintenance_events as ev
      where ev.event_type = 'DB_EXECUTOR_HEARTBEAT_STALE'
        and ev.metadata ->> 'executionId' = v_exec.id::text
        and ev.metadata ->> 'leaseGeneration' = v_exec.lease_generation::text
    ) then
      perform public.app_db_release_event_internal(
        'DB_EXECUTOR_HEARTBEAT_STALE',
        'executor',
        null,
        'Heartbeat recebido com a lease vencida; sem takeover.',
        jsonb_build_object(
          'executionId', v_exec.id,
          'planId', v_exec.plan_id,
          'workerId', v_exec.executor_id,
          'leaseGeneration', v_exec.lease_generation,
          'leaseExpiredAt', v_exec.lease_expires_at,
          'observedAt', v_now,
          'status', v_exec.status
        )
      );
    end if;
    return jsonb_build_object(
      'outcome', 'LEASE_EXPIRED',
      'execution', public.app_db_release_execution_json_internal(v_exec)
    );
  end if;

  update public.app_db_release_executions
  set heartbeat_at = v_now,
      lease_expires_at = greatest(lease_expires_at, v_now + make_interval(secs => p_lease_ttl_seconds))
  where id = v_exec.id
    and executor_id = p_worker_id
    and lease_generation = p_lease_generation
    and lock_released_at is null
    and status in ('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'MIGRATING', 'VERIFYING');

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Heartbeat em conflito.'
      using errcode = 'P0001', detail = 'HEARTBEAT_CONFLICT';
  end if;

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', 'HEARTBEAT_OK',
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_heartbeat_execution(uuid, text, bigint, integer) is
  'RPC server-only. Heartbeat CAS: exige worker dono, lease_generation e execução ativa; relógio do servidor (clock_timestamp). Lease vencida NÃO revive: grava DB_EXECUTOR_HEARTBEAT_STALE (idempotente) e devolve LEASE_EXPIRED. Terminal/FAILED/RECOVERY_REQUIRED não revivem.';

-- ════════════════════════════════════════════════════════════
--  6) TRANSIÇÃO DE EXECUÇÃO — CAS por status + worker + geração
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_transition_execution(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_from_status text,
  p_to_status text,
  p_failure_code text,
  p_failure_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_now timestamptz;
  v_row_count integer;
  v_phase text;
  v_gate text;
  v_kind text;
begin
  if p_from_status is null or p_to_status is null then
    raise exception '%', 'Transição de execução inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  if not exists (
    select 1
    from (values
      ('REQUESTED', 'PREPARING'),
      ('PREPARING', 'DRAINING'),
      ('DRAINING', 'BACKING_UP'),
      ('BACKING_UP', 'MIGRATING'),
      ('MIGRATING', 'VERIFYING'),
      ('VERIFYING', 'SUCCEEDED'),
      ('REQUESTED', 'CANCELED'),
      ('PREPARING', 'CANCELED'),
      ('DRAINING', 'CANCELED'),
      ('BACKING_UP', 'CANCELED'),
      ('PREPARING', 'FAILED'),
      ('DRAINING', 'FAILED'),
      ('BACKING_UP', 'FAILED'),
      ('MIGRATING', 'FAILED'),
      ('FAILED', 'CANCELED'),
      ('REQUESTED', 'RECOVERY_REQUIRED'),
      ('PREPARING', 'RECOVERY_REQUIRED'),
      ('DRAINING', 'RECOVERY_REQUIRED'),
      ('BACKING_UP', 'RECOVERY_REQUIRED'),
      ('MIGRATING', 'RECOVERY_REQUIRED'),
      ('VERIFYING', 'RECOVERY_REQUIRED')
    ) as edges(from_status, to_status)
    where edges.from_status = p_from_status
      and edges.to_status = p_to_status
  ) then
    raise exception '%', 'Aresta de execução fora do contrato do pipeline.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  if p_to_status in ('FAILED', 'RECOVERY_REQUIRED') and p_failure_code is null then
    raise exception '%', 'failure_code obrigatório para FAILED/RECOVERY_REQUIRED.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;
  if (p_failure_code is not null and (char_length(p_failure_code) > 200
        or p_failure_code ~* '(secret|token|bearer|password|authorization|service_role)'))
     or (p_failure_message is not null and (char_length(p_failure_message) > 1000
        or p_failure_message ~* '(secret|token|bearer|password|authorization|service_role)')) then
    raise exception '%', 'failure_code/failure_message inválidos.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  v_exec := public.app_db_release_owner_lock_internal(
    p_execution_id, p_worker_id, p_lease_generation, null, true, false
  );

  if v_exec.status = p_to_status then
    return jsonb_build_object(
      'outcome', 'UNCHANGED',
      'execution', public.app_db_release_execution_json_internal(v_exec)
    );
  end if;

  if v_exec.status is distinct from p_from_status then
    raise exception '%', 'Status atual não corresponde ao esperado.'
      using errcode = 'P0001', detail = 'TRANSITION_CONFLICT';
  end if;

  v_now := clock_timestamp();

  -- Só RECOVERY_REQUIRED é permitido com a lease vencida (direção segura).
  if p_to_status <> 'RECOVERY_REQUIRED' and v_exec.lease_expires_at <= v_now then
    if not exists (
      select 1
      from public.app_maintenance_events as ev
      where ev.event_type = 'DB_EXECUTOR_HEARTBEAT_STALE'
        and ev.metadata ->> 'executionId' = v_exec.id::text
        and ev.metadata ->> 'leaseGeneration' = v_exec.lease_generation::text
    ) then
      perform public.app_db_release_event_internal(
        'DB_EXECUTOR_HEARTBEAT_STALE',
        'executor',
        null,
        'Transição solicitada com a lease vencida; sem takeover.',
        jsonb_build_object(
          'executionId', v_exec.id,
          'planId', v_exec.plan_id,
          'workerId', v_exec.executor_id,
          'leaseGeneration', v_exec.lease_generation,
          'leaseExpiredAt', v_exec.lease_expires_at,
          'observedAt', v_now,
          'status', v_exec.status
        )
      );
    end if;
    return jsonb_build_object(
      'outcome', 'LEASE_EXPIRED',
      'execution', public.app_db_release_execution_json_internal(v_exec)
    );
  end if;

  if p_from_status = 'FAILED' and p_to_status = 'CANCELED' and v_exec.mutation_started_at is not null then
    raise exception '%', 'Execução FAILED após início de mutação exige reconciliação humana.'
      using errcode = 'P0001', detail = 'LOCK_RELEASE_NOT_ALLOWED';
  end if;

  if p_to_status = 'SUCCEEDED' then
    select s.phase, s.login_gate, s.plan_kind
      into v_phase, v_gate, v_kind
    from public.app_maintenance_state as s
    where s.scope = 'global';

    if v_phase is distinct from 'NORMAL' or v_gate is distinct from 'OPEN' or v_kind is not null then
      raise exception '%', 'Sucesso exige manutenção NORMAL, sem binding, com login OPEN.'
        using errcode = 'P0001', detail = 'STATE_CONFLICT';
    end if;
    if not public.app_db_release_binding_release_safe_internal(v_exec.plan_id, 'OPEN')
       or not exists (
         select 1 from public.app_db_release_execution_steps as s
         where s.execution_id = v_exec.id
           and s.step_order = 920
           and s.step_type = 'LOGIN_GATE_OPEN'
           and s.status = 'SUCCEEDED'
       ) then
      raise exception '%', 'Sucesso não comprovado (steps/normalização).'
        using errcode = 'P0001', detail = 'STATE_CONFLICT';
    end if;
  end if;

  update public.app_db_release_executions as e
  set status = p_to_status,
      started_at = case when p_to_status = 'PREPARING' and e.started_at is null then v_now else e.started_at end,
      completed_at = case when p_to_status in ('SUCCEEDED', 'FAILED', 'CANCELED') then v_now else e.completed_at end,
      mutation_started_at = case when p_to_status = 'MIGRATING' and e.mutation_started_at is null then v_now else e.mutation_started_at end,
      failure_code = case when p_to_status in ('FAILED', 'RECOVERY_REQUIRED', 'CANCELED') then coalesce(p_failure_code, e.failure_code) else e.failure_code end,
      failure_message = case when p_to_status in ('FAILED', 'RECOVERY_REQUIRED', 'CANCELED') then coalesce(p_failure_message, e.failure_message) else e.failure_message end
  where e.id = v_exec.id
    and e.status = p_from_status
    and e.executor_id = p_worker_id
    and e.lease_generation = p_lease_generation
    and e.lock_released_at is null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Transição em conflito.'
      using errcode = 'P0001', detail = 'TRANSITION_CONFLICT';
  end if;

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', 'TRANSITIONED',
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_transition_execution(uuid, text, bigint, text, text, text, text) is
  'RPC server-only. Transição CAS (status + worker + lease_generation) nas 21 arestas do pipeline I2C2. MIGRATING grava mutation_started_at. SUCCEEDED exige manutenção NORMAL/login OPEN e steps SCHEMA_VALIDATE/SMOKE/MIGRATE/LOGIN_GATE_OPEN SUCCEEDED. RECOVERY_REQUIRED/FAILED retêm o lock. Lease vencida só permite RECOVERY_REQUIRED.';

-- ════════════════════════════════════════════════════════════
--  7) LOCK RELEASE — dono exato + estado terminal seguro
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_release_lock(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_plan_status text;
begin
  if p_execution_id is null or p_worker_id is null or p_lease_generation is null then
    raise exception '%', 'Requisição de release de lock inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception '%', 'Execução não encontrada.'
      using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
  end if;

  if v_exec.executor_id is distinct from p_worker_id then
    raise exception '%', 'Worker não é o dono da execução.'
      using errcode = 'P0001', detail = 'WORKER_MISMATCH';
  end if;

  if v_exec.lease_generation is distinct from p_lease_generation then
    raise exception '%', 'Geração da lease divergente.'
      using errcode = 'P0001', detail = 'LEASE_GENERATION_MISMATCH';
  end if;

  if v_exec.lock_released_at is not null then
    return jsonb_build_object(
      'outcome', 'ALREADY_RELEASED',
      'execution', public.app_db_release_execution_json_internal(v_exec)
    );
  end if;

  if v_exec.status not in ('SUCCEEDED', 'CANCELED') then
    raise exception '%', 'Só SUCCEEDED/CANCELED liberam o lock; FAILED/RECOVERY_REQUIRED retêm até reconciliação.'
      using errcode = 'P0001', detail = 'LOCK_RELEASE_NOT_ALLOWED';
  end if;

  select p.status into v_plan_status
  from public.app_db_release_plans as p
  where p.id = v_exec.plan_id;

  if v_plan_status is null or v_plan_status = 'RUNNING'
     or (v_exec.status = 'SUCCEEDED' and v_plan_status is distinct from 'SUCCEEDED')
     or (v_exec.status = 'CANCELED' and v_exec.mutation_started_at is not null and v_exec.reconciled_at is null)
     or exists (
       select 1 from public.app_maintenance_state as s
       where s.scope = 'global' and s.db_plan_id = v_exec.plan_id
     ) then
    raise exception '%', 'Estado do plano/manutenção não permite liberar o lock.'
      using errcode = 'P0001', detail = 'LOCK_RELEASE_NOT_ALLOWED';
  end if;

  update public.app_db_release_executions
  set lock_released_at = clock_timestamp()
  where id = v_exec.id
    and lock_released_at is null;

  perform public.app_db_release_event_internal(
    'DB_LOCK_RELEASED',
    'executor',
    null,
    'Lock de ambiente liberado pelo dono.',
    jsonb_build_object(
      'executionId', v_exec.id,
      'planId', v_exec.plan_id,
      'environment', v_exec.environment,
      'projectRef', v_exec.project_ref,
      'leaseGeneration', v_exec.lease_generation,
      'status', v_exec.status
    )
  );

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', 'RELEASED',
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_release_lock(uuid, text, bigint) is
  'RPC server-only. Libera o lock só para o dono exato (worker + lease_generation), com execução SUCCEEDED/CANCELED, plano fora de RUNNING (SUCCEEDED exige plano SUCCEEDED), binding de manutenção limpo e (se CANCELED após mutação) reconciliada. RECOVERY_REQUIRED/FAILED nunca liberam.';

-- ════════════════════════════════════════════════════════════
--  8) LEASE VENCIDA — evidência para reconciliação, SEM takeover
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_flag_stale_execution(
  p_execution_id uuid,
  p_expected_lease_generation bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_now timestamptz;
  v_to text;
  v_code text;
begin
  if p_execution_id is null or p_expected_lease_generation is null then
    raise exception '%', 'Requisição inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception '%', 'Execução não encontrada.'
      using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
  end if;

  if v_exec.lease_generation is distinct from p_expected_lease_generation then
    raise exception '%', 'Geração da lease divergente.'
      using errcode = 'P0001', detail = 'LEASE_GENERATION_MISMATCH';
  end if;

  if v_exec.lock_released_at is not null
     or v_exec.status not in ('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'MIGRATING', 'VERIFYING') then
    return jsonb_build_object('outcome', 'NOT_APPLICABLE');
  end if;

  v_now := clock_timestamp();
  if v_exec.lease_expires_at > v_now then
    return jsonb_build_object('outcome', 'LEASE_ALIVE');
  end if;

  if v_exec.status in ('REQUESTED', 'PREPARING') then
    v_to := 'FAILED';
    v_code := 'LEASE_LOST_PRE_MUTATION';
  else
    v_to := 'RECOVERY_REQUIRED';
    v_code := 'LEASE_LOST_AFTER_MUTATION';
  end if;

  -- Ownership (executor_id, lease_generation) e lock são PRESERVADOS.
  update public.app_db_release_executions
  set status = v_to,
      failure_code = v_code,
      failure_message = 'Lease vencida; ownership preservado, sem takeover automático.',
      completed_at = case when v_to = 'FAILED' then v_now else completed_at end
  where id = v_exec.id
    and lock_released_at is null;

  if not exists (
    select 1
    from public.app_maintenance_events as ev
    where ev.event_type = 'DB_EXECUTOR_HEARTBEAT_STALE'
      and ev.metadata ->> 'executionId' = v_exec.id::text
      and ev.metadata ->> 'leaseGeneration' = v_exec.lease_generation::text
  ) then
    perform public.app_db_release_event_internal(
      'DB_EXECUTOR_HEARTBEAT_STALE',
      'executor',
      null,
      'Lease vencida detectada; ownership preservado.',
      jsonb_build_object(
        'executionId', v_exec.id,
        'planId', v_exec.plan_id,
        'workerId', v_exec.executor_id,
        'leaseGeneration', v_exec.lease_generation,
        'leaseExpiredAt', v_exec.lease_expires_at,
        'observedAt', v_now,
        'status', v_exec.status
      )
    );
  end if;

  if v_to = 'RECOVERY_REQUIRED' then
    perform public.app_db_release_event_internal(
      'DB_RECOVERY_REQUIRED',
      'executor',
      null,
      'Lease vencida após início potencial de mutação.',
      jsonb_build_object(
        'executionId', v_exec.id,
        'planId', v_exec.plan_id,
        'code', v_code,
        'previousStatus', v_exec.status
      )
    );
  end if;

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', case when v_to = 'FAILED' then 'FLAGGED_FAILED' else 'FLAGGED_RECOVERY_REQUIRED' end,
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_flag_stale_execution(uuid, bigint) is
  'RPC server-only. Se a lease venceu: REQUESTED/PREPARING -> FAILED (LEASE_LOST_PRE_MUTATION); demais ativos -> RECOVERY_REQUIRED (LEASE_LOST_AFTER_MUTATION). NUNCA troca executor_id/lease_generation e NUNCA libera o lock (sem takeover automático). Evidência: DB_EXECUTOR_HEARTBEAT_STALE (+ DB_RECOVERY_REQUIRED).';

-- ════════════════════════════════════════════════════════════
--  9) RECONCILIAÇÃO HUMANA (FAILED|RECOVERY_REQUIRED -> terminal)
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_reconcile_execution(
  p_execution_id uuid,
  p_actor_user_id uuid,
  p_resolution text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_now timestamptz;
  v_to text;
begin
  if p_execution_id is null or p_actor_user_id is null or p_resolution is null or p_evidence is null then
    raise exception '%', 'Reconciliação exige ator humano, resolução e evidência.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  if p_resolution not in ('APPLIED_VERIFIED', 'NOT_APPLIED_VERIFIED', 'RESTORED_VERIFIED')
     or jsonb_typeof(p_evidence) <> 'object'
     or p_evidence = '{}'::jsonb then
    raise exception '%', 'Resolução/evidência de reconciliação inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception '%', 'Execução não encontrada.'
      using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
  end if;

  if v_exec.lock_released_at is not null
     or v_exec.status not in ('FAILED', 'RECOVERY_REQUIRED')
     or (p_resolution = 'APPLIED_VERIFIED' and v_exec.mutation_started_at is null)
     or (p_resolution = 'NOT_APPLIED_VERIFIED' and v_exec.mutation_started_at is not null) then
    raise exception '%', 'Reconciliação não permitida neste estado/resolução.'
      using errcode = 'P0001', detail = 'LOCK_RELEASE_NOT_ALLOWED';
  end if;

  v_now := clock_timestamp();
  v_to := case when p_resolution = 'APPLIED_VERIFIED' then 'SUCCEEDED' else 'CANCELED' end;

  update public.app_db_release_executions
  set status = v_to,
      completed_at = coalesce(completed_at, v_now),
      reconciled_at = v_now,
      reconciled_by = p_actor_user_id,
      reconciliation_evidence = p_evidence || jsonb_build_object('resolution', p_resolution)
  where id = v_exec.id
    and status in ('FAILED', 'RECOVERY_REQUIRED')
    and lock_released_at is null;

  perform public.app_db_release_event_internal(
    'DB_EXECUTION_RECONCILED',
    'api',
    p_actor_user_id,
    'Execução DB reconciliada por ator humano.',
    jsonb_build_object(
      'executionId', v_exec.id,
      'planId', v_exec.plan_id,
      'previousStatus', v_exec.status,
      'resolution', p_resolution,
      'resultStatus', v_to
    )
  );

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', 'RECONCILED',
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_reconcile_execution(uuid, uuid, text, jsonb) is
  'RPC server-only. Único caminho para sair de FAILED/RECOVERY_REQUIRED: ator humano (uuid) + resolução (APPLIED_VERIFIED -> SUCCEEDED; NOT_APPLIED_VERIFIED/RESTORED_VERIFIED -> CANCELED) + evidência jsonb sem segredos (CHECK). Não libera o lock por si só (release_reconciled_lock) e não reabre login/binding.';

create function public.app_db_release_release_reconciled_lock(
  p_execution_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exec public.app_db_release_executions%rowtype;
  v_plan_status text;
begin
  if p_execution_id is null or p_actor_user_id is null then
    raise exception '%', 'Requisição inválida.'
      using errcode = 'P0001', detail = 'CLAIM_REQUEST_INVALID';
  end if;

  select * into v_exec
  from public.app_db_release_executions as e
  where e.id = p_execution_id
  for update;

  if not found then
    raise exception '%', 'Execução não encontrada.'
      using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
  end if;

  if v_exec.lock_released_at is not null then
    return jsonb_build_object(
      'outcome', 'ALREADY_RELEASED',
      'execution', public.app_db_release_execution_json_internal(v_exec)
    );
  end if;

  select p.status into v_plan_status
  from public.app_db_release_plans as p
  where p.id = v_exec.plan_id;

  if v_exec.reconciled_at is null
     or v_exec.status not in ('SUCCEEDED', 'CANCELED')
     or v_plan_status is null
     or v_plan_status = 'RUNNING'
     or exists (
       select 1 from public.app_maintenance_state as s
       where s.scope = 'global' and s.db_plan_id = v_exec.plan_id
     ) then
    raise exception '%', 'Lock só é liberado após reconciliação e normalização do binding.'
      using errcode = 'P0001', detail = 'LOCK_RELEASE_NOT_ALLOWED';
  end if;

  update public.app_db_release_executions
  set lock_released_at = clock_timestamp()
  where id = v_exec.id
    and lock_released_at is null;

  perform public.app_db_release_event_internal(
    'DB_LOCK_RELEASED',
    'api',
    p_actor_user_id,
    'Lock de ambiente liberado após reconciliação humana.',
    jsonb_build_object(
      'executionId', v_exec.id,
      'planId', v_exec.plan_id,
      'environment', v_exec.environment,
      'projectRef', v_exec.project_ref,
      'leaseGeneration', v_exec.lease_generation,
      'status', v_exec.status,
      'reconciled', true
    )
  );

  select * into v_exec from public.app_db_release_executions as e where e.id = p_execution_id;

  return jsonb_build_object(
    'outcome', 'RELEASED',
    'execution', public.app_db_release_execution_json_internal(v_exec)
  );
end;
$$;

comment on function public.app_db_release_release_reconciled_lock(uuid, uuid) is
  'RPC server-only. Libera o lock de uma execução JÁ reconciliada por humano (reconciled_at) em SUCCEEDED/CANCELED, com plano fora de RUNNING e binding de manutenção limpo.';

-- ════════════════════════════════════════════════════════════
--  10) MANUTENÇÃO DB — binding guard estendido (reopen guard)
--      CREATE OR REPLACE da função da migration 160 + provas DB:
--      SMOKE->NORMAL de binding DB exige SUCCESS comprovado;
--      FAILED|CANCELED->NORMAL de binding DB exige REOPEN seguro
--      (nunca com execução RECOVERY_REQUIRED / mutada).
--      Comportamento APP_RELEASE preservado byte-a-byte.
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
    if OLD.release_id is not null and OLD.target_sha is not null and OLD.db_plan_id is null then
      return NEW;
    end if;
    if OLD.db_plan_id is not null and OLD.target_sha is not null and OLD.release_id is null then
      if not public.app_db_release_binding_release_safe_internal(OLD.db_plan_id, 'SUCCESS') then
        raise exception '%', 'Sucesso do release DB não comprovado; binding não pode ser limpo.'
          using errcode = 'P0001', detail = 'DB_BINDING_RELEASE_UNSAFE';
      end if;
      return NEW;
    end if;
  end if;

  -- FUTURE B17 REOPEN CLEAR: FAILED/CANCELED->NORMAL, epoch maior, full -> null.
  if OLD.phase in ('FAILED', 'CANCELED') and NEW.phase = 'NORMAL'
     and NEW.epoch > OLD.epoch
     and NEW.release_id is null and NEW.target_sha is null
     and NEW.db_plan_id is null and NEW.plan_kind is null then
    if OLD.release_id is not null and OLD.target_sha is not null and OLD.db_plan_id is null then
      return NEW;
    end if;
    if OLD.db_plan_id is not null and OLD.target_sha is not null and OLD.release_id is null then
      if not public.app_db_release_binding_release_safe_internal(OLD.db_plan_id, 'REOPEN') then
        raise exception '%', 'Reopen bloqueado: execução DB em RECOVERY_REQUIRED, mutada ou não reconciliada.'
          using errcode = 'P0001', detail = 'DB_BINDING_RELEASE_UNSAFE';
      end if;
      return NEW;
    end if;
  end if;

  -- Binding DB nunca chega a NORMAL por outro caminho (mantendo binding ou por edge não prevista).
  if OLD.plan_kind = 'DB_MIGRATION'
     and OLD.phase is distinct from 'NORMAL'
     and NEW.phase = 'NORMAL' then
    raise exception '%', 'Binding DB só volta a NORMAL por success clear ou reopen seguro.'
      using errcode = 'P0001', detail = 'DB_BINDING_RELEASE_UNSAFE';
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
  'Trigger PRIVADO BEFORE UPDATE em app_maintenance_state (migration 162 estende a 160). APP_RELEASE inalterado. Binding DB: SMOKE->NORMAL exige app_db_release_binding_release_safe_internal(SUCCESS); FAILED/CANCELED->NORMAL exige REOPEN seguro (DB_BINDING_RELEASE_UNSAFE se execução RECOVERY_REQUIRED/mutada/não reconciliada); nenhum outro caminho leva binding DB a NORMAL.';

-- ════════════════════════════════════════════════════════════
--  11) LOGIN GATE — guard de trigger (escrita controlada)
--      service_role não tem UPDATE direto no singleton; este trigger
--      impede também que funções futuras violem o contrato.
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_login_gate_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Binding DB em fases protegidas ou saindo delas: gate permanece CLOSED.
  if NEW.plan_kind = 'DB_MIGRATION'
     and NEW.phase in ('DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE', 'RECOVERING', 'FAILED')
     and NEW.login_gate is distinct from 'CLOSED' then
    raise exception '%', 'Login gate deve estar CLOSED em fases protegidas do release DB.'
      using errcode = 'P0001', detail = 'LOGIN_GATE_MUST_BE_CLOSED';
  end if;

  if OLD.plan_kind = 'DB_MIGRATION'
     and OLD.phase is distinct from 'NORMAL'
     and NEW.phase = 'NORMAL'
     and NEW.login_gate is distinct from 'CLOSED' then
    raise exception '%', 'Retorno a NORMAL do release DB não reabre o login na mesma escrita.'
      using errcode = 'P0001', detail = 'LOGIN_GATE_MUST_BE_CLOSED';
  end if;

  if NEW.login_gate is distinct from OLD.login_gate then
    if NEW.login_gate = 'CLOSED' then
      if not (
        NEW.plan_kind = 'DB_MIGRATION'
        and NEW.phase in ('FENCING', 'DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE', 'RECOVERING', 'FAILED')
      ) then
        raise exception '%', 'Fechar o login gate só é permitido em release DB, de FENCING em diante.'
          using errcode = 'P0001', detail = 'LOGIN_GATE_CLOSE_NOT_ALLOWED';
      end if;
    else
      if NEW.phase is distinct from 'NORMAL'
         or NEW.plan_kind is not null
         or NEW.db_plan_id is not null
         or NEW.release_id is not null then
        raise exception '%', 'Reabrir o login gate só é permitido em NORMAL sem binding.'
          using errcode = 'P0001', detail = 'LOGIN_GATE_OPEN_NOT_ALLOWED';
      end if;
      if exists (
        select 1
        from public.app_db_release_executions as e
        where e.lock_released_at is null
          and (
            e.status = 'RECOVERY_REQUIRED'
            or (e.mutation_started_at is not null and e.status not in ('VERIFYING', 'SUCCEEDED'))
          )
      ) then
        raise exception '%', 'Login não pode reabrir com execução DB em RECOVERY_REQUIRED/ambígua.'
          using errcode = 'P0001', detail = 'LOGIN_GATE_OPEN_UNSAFE';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

comment on function public.app_maintenance_login_gate_guard() is
  'Trigger PRIVADO BEFORE UPDATE em app_maintenance_state. login_gate: CLOSED só em release DB de FENCING em diante; DRAINING..FAILED de binding DB exigem CLOSED; retorno a NORMAL não reabre; OPEN só em NORMAL sem binding e sem execução RECOVERY_REQUIRED/mutada ambígua com lock retido. APP_RELEASE nunca altera o gate.';

create trigger app_maintenance_login_gate_guard_trg
  before update on public.app_maintenance_state
  for each row
  execute function public.app_maintenance_login_gate_guard();

-- ════════════════════════════════════════════════════════════
--  12) EMISSOR PRIVADO de eventos de manutenção DB
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_db_emit_internal(
  p_epoch integer,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_message text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.app_maintenance_events (
    id,
    maintenance_epoch,
    release_id,
    event_type,
    source,
    actor_user_id,
    actor_email,
    message,
    metadata,
    created_at
  ) values (
    gen_random_uuid(),
    p_epoch,
    null,
    p_event_type,
    'executor',
    p_actor_user_id,
    p_actor_email,
    left(p_message, 240),
    case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end,
    now()
  );
end;
$$;

comment on function public.app_maintenance_db_emit_internal(integer, text, uuid, text, text, jsonb) is
  'Emissor privado (release_id NULL, source executor) para as RPCs de manutenção DB. Uso interno.';

-- ════════════════════════════════════════════════════════════
--  13) RPC — app_maintenance_db_orchestration_start
--      (bind DB + NORMAL->NOTICE, atômico; execução DRAINING)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_db_orchestration_start(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_expected_version integer,
  p_plan_id uuid,
  p_target_sha text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_version integer;
  v_epoch integer;
  v_release_id uuid;
  v_db_plan_id uuid;
  v_plan_kind text;
  v_target_sha text;
  v_login_gate text;
  v_exec public.app_db_release_executions%rowtype;
  v_plan_status text;
  v_plan_env text;
  v_plan_target text;
  v_meta jsonb;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, db_plan_id, plan_kind, target_sha, login_gate
    into v_phase, v_version, v_epoch, v_release_id, v_db_plan_id, v_plan_kind, v_target_sha, v_login_gate
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'NORMAL' then
    raise exception '%', 'Orquestração DB só pode iniciar a partir de NORMAL.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_release_id is not null or v_db_plan_id is not null
     or v_plan_kind is not null or v_target_sha is not null then
    raise exception '%', 'Já existe binding ativo no ciclo atual.'
      using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
  end if;

  if v_login_gate is distinct from 'OPEN' then
    raise exception '%', 'Estado ocioso exige login gate OPEN.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  v_exec := public.app_db_release_owner_lock_internal(
    p_execution_id, p_worker_id, p_lease_generation, p_plan_id, false, false
  );

  if v_exec.status is distinct from 'DRAINING' then
    raise exception '%', 'Execução precisa estar DRAINING para iniciar a manutenção.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  select p.status, p.environment, p.target_release_sha
    into v_plan_status, v_plan_env, v_plan_target
  from public.app_db_release_plans as p
  where p.id = p_plan_id;

  if not found then
    raise exception '%', 'Plano informado não existe.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_plan_status is distinct from 'RUNNING'
     or v_plan_env is distinct from v_exec.environment then
    raise exception '%', 'Plano não está RUNNING no ambiente da execução.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_plan_target is distinct from p_target_sha then
    raise exception '%', 'target_sha informado não corresponde ao target_sha do plano.'
      using errcode = 'P0001', detail = 'TARGET_MISMATCH';
  end if;

  v_meta := jsonb_build_object(
    'planId', p_plan_id,
    'executionId', v_exec.id,
    'planKind', 'DB_MIGRATION'
  ) || case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end;

  update public.app_maintenance_state
  set db_plan_id = p_plan_id,
      plan_kind = 'DB_MIGRATION',
      target_sha = p_target_sha,
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  perform public.app_maintenance_db_emit_internal(
    v_epoch, 'ORCHESTRATION_STARTED', p_actor_user_id, p_actor_email, p_reason, v_meta
  );

  update public.app_maintenance_state
  set phase = 'NOTICE',
      notice_started_at = clock_timestamp(),
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  perform public.app_maintenance_db_emit_internal(
    v_epoch, 'NOTICE_STARTED', p_actor_user_id, p_actor_email, p_reason, v_meta
  );
end;
$$;

comment on function public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb) is
  'RPC server-only. Bind DB (db_plan_id + plan_kind=DB_MIGRATION + target_sha) e NORMAL->NOTICE na mesma transação. Exige barrier exclusiva, singleton NORMAL/unbound/login OPEN, versão esperada, execução dona (worker + lease_generation) em DRAINING, plano RUNNING com o mesmo target_sha/ambiente. APP_RELEASE intocado.';

-- ════════════════════════════════════════════════════════════
--  14) RPC — app_maintenance_db_orchestration_transition
--      Edges DB: NOTICE->FENCING->DRAINING->QUIESCENT->BACKING_UP->
--      MIGRATING->SMOKE->NORMAL + saídas protetoras ->FAILED.
--      (14 edges; ->FAILED fecha o login gate)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_db_orchestration_transition(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_expected_phase text,
  p_expected_version integer,
  p_to_phase text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_version integer;
  v_epoch integer;
  v_release_id uuid;
  v_db_plan_id uuid;
  v_plan_kind text;
  v_target_sha text;
  v_login_gate text;
  v_exec public.app_db_release_executions%rowtype;
  v_required_exec_status text;
  v_new_epoch integer;
  v_now timestamptz;
  v_count integer;
  v_meta jsonb;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, db_plan_id, plan_kind, target_sha, login_gate
    into v_phase, v_version, v_epoch, v_release_id, v_db_plan_id, v_plan_kind, v_target_sha, v_login_gate
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from p_expected_phase then
    raise exception '%', 'Fase atual não corresponde à fase esperada.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_plan_kind is distinct from 'DB_MIGRATION'
     or v_db_plan_id is null
     or v_target_sha is null
     or v_release_id is not null then
    raise exception '%', 'Active DB orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if not exists (
    select 1
    from (values
      ('NOTICE', 'FENCING'),
      ('FENCING', 'DRAINING'),
      ('DRAINING', 'QUIESCENT'),
      ('QUIESCENT', 'BACKING_UP'),
      ('BACKING_UP', 'MIGRATING'),
      ('MIGRATING', 'SMOKE'),
      ('SMOKE', 'NORMAL'),
      ('NOTICE', 'FAILED'),
      ('FENCING', 'FAILED'),
      ('DRAINING', 'FAILED'),
      ('QUIESCENT', 'FAILED'),
      ('BACKING_UP', 'FAILED'),
      ('MIGRATING', 'FAILED'),
      ('SMOKE', 'FAILED')
    ) as edges(from_phase, to_phase)
    where edges.from_phase = p_expected_phase
      and edges.to_phase = p_to_phase
  ) then
    raise exception '%', 'Transição de fase DB inválida (fora das 14 edges DB exatas).'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  v_exec := public.app_db_release_owner_lock_internal(
    p_execution_id, p_worker_id, p_lease_generation, v_db_plan_id, (p_to_phase = 'FAILED'), false
  );

  v_required_exec_status := case p_to_phase
    when 'FENCING' then 'DRAINING'
    when 'DRAINING' then 'DRAINING'
    when 'QUIESCENT' then 'DRAINING'
    when 'BACKING_UP' then 'BACKING_UP'
    when 'MIGRATING' then 'MIGRATING'
    when 'SMOKE' then 'VERIFYING'
    when 'NORMAL' then 'VERIFYING'
    else null
  end;

  if v_required_exec_status is not null and v_exec.status is distinct from v_required_exec_status then
    raise exception '%', 'Status da execução incompatível com a transição de manutenção.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if p_to_phase in ('DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE')
     and v_login_gate is distinct from 'CLOSED' then
    raise exception '%', 'Login gate precisa estar CLOSED antes desta fase.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if p_to_phase in ('QUIESCENT', 'BACKING_UP') then
    perform public.app_maintenance_operation_expire_internal();
    v_count := public.app_maintenance_drain_in_flight_count_internal();
    if v_count is distinct from 0 then
      raise exception '%', 'Ainda existem operações em voo no ciclo corrente.'
        using errcode = 'P0001', detail = 'STATE_CONFLICT';
    end if;
  end if;

  v_now := clock_timestamp();
  v_new_epoch := case when p_to_phase = 'FENCING' then v_epoch + 1 else v_epoch end;
  v_meta := jsonb_build_object(
    'planId', v_db_plan_id,
    'executionId', v_exec.id,
    'from', p_expected_phase,
    'to', p_to_phase
  ) || case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end;

  update public.app_maintenance_state
  set phase = p_to_phase,
      epoch = case when p_to_phase = 'FENCING' then epoch + 1 else epoch end,
      fence_effective_at = case when p_to_phase = 'FENCING' then v_now else fence_effective_at end,
      drain_started_at = case when p_to_phase = 'DRAINING' then v_now else drain_started_at end,
      quiet_since = case when p_to_phase = 'QUIESCENT' then v_now else quiet_since end,
      quiescent_at = case when p_to_phase = 'QUIESCENT' then v_now else quiescent_at end,
      smoke_started_at = case when p_to_phase = 'SMOKE' then v_now else smoke_started_at end,
      completed_at = case when p_to_phase = 'NORMAL' then v_now else completed_at end,
      aborted_at = case when p_to_phase = 'FAILED' then v_now else aborted_at end,
      abort_reason = case when p_to_phase = 'FAILED' then p_reason else abort_reason end,
      login_gate = case when p_to_phase = 'FAILED' then 'CLOSED' else login_gate end,
      db_plan_id = case when p_to_phase = 'NORMAL' then null else db_plan_id end,
      plan_kind = case when p_to_phase = 'NORMAL' then null else plan_kind end,
      target_sha = case when p_to_phase = 'NORMAL' then null else target_sha end,
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  if p_to_phase = 'FAILED' and v_login_gate is distinct from 'CLOSED' then
    perform public.app_maintenance_db_emit_internal(
      v_new_epoch, 'LOGIN_GATE_CLOSED', p_actor_user_id, p_actor_email, p_reason, v_meta
    );
  end if;

  if p_to_phase = 'BACKING_UP'
     and not exists (
       select 1
       from public.app_maintenance_events as e
       where e.event_type = 'QUIESCENCE_PROBE_PASSED'
         and e.maintenance_epoch = v_new_epoch
         and e.metadata ->> 'planId' = v_db_plan_id::text
     ) then
    perform public.app_maintenance_db_emit_internal(
      v_new_epoch, 'QUIESCENCE_PROBE_PASSED', p_actor_user_id, p_actor_email, p_reason, v_meta
    );
  end if;

  perform public.app_maintenance_db_emit_internal(
    v_new_epoch,
    case p_to_phase
      when 'FENCING' then 'FENCE_STARTED'
      when 'DRAINING' then 'DRAIN_STARTED'
      when 'QUIESCENT' then 'QUIESCENCE_REACHED'
      when 'SMOKE' then 'SMOKE_STARTED'
      when 'NORMAL' then 'MAINTENANCE_COMPLETED'
      when 'FAILED' then 'MAINTENANCE_FAILED'
      else 'DB_MAINTENANCE_PHASE_CHANGED'
    end,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    v_meta
  );
end;
$$;

comment on function public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb) is
  'RPC server-only. Transições DB controladas (14 edges): barrier exclusiva, state FOR UPDATE, CAS de fase+versão, binding DB obrigatório, ownership exato da execução (worker + lease_generation) com status compatível, QUIESCENT/BACKING_UP só com drain=0, DRAINING+ exige login gate CLOSED, ->FAILED fecha o gate e preserva binding, SMOKE->NORMAL limpa binding (binding guard exige SUCCESS comprovado) mas NÃO reabre o login. Edges APP (16) intocadas.';

-- ════════════════════════════════════════════════════════════
--  15) RPC — app_maintenance_db_orchestration_login_gate
--      (único writer controlado de OPEN <-> CLOSED)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_db_orchestration_login_gate(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_expected_version integer,
  p_gate text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_version integer;
  v_release_id uuid;
  v_db_plan_id uuid;
  v_plan_kind text;
  v_target_sha text;
  v_login_gate text;
  v_exec public.app_db_release_executions%rowtype;
  v_exec_plan_id uuid;
begin
  if p_gate is null or p_gate not in ('OPEN', 'CLOSED') then
    raise exception '%', 'Estado de login gate inválido.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, release_id, db_plan_id, plan_kind, target_sha, login_gate
    into v_phase, v_version, v_release_id, v_db_plan_id, v_plan_kind, v_target_sha, v_login_gate
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if p_gate = 'CLOSED' then
    if v_plan_kind is distinct from 'DB_MIGRATION' or v_db_plan_id is null or v_release_id is not null
       or v_phase not in ('FENCING', 'DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE', 'FAILED') then
      raise exception '%', 'Fechar o login gate exige release DB vinculado em FENCING ou fase posterior.'
        using errcode = 'P0001', detail = 'STATE_CONFLICT';
    end if;

    v_exec := public.app_db_release_owner_lock_internal(
      p_execution_id, p_worker_id, p_lease_generation, v_db_plan_id, (v_phase = 'FAILED'), false
    );

    if v_login_gate = 'CLOSED' then
      return;
    end if;
  else
    if v_phase is distinct from 'NORMAL' or v_plan_kind is not null
       or v_db_plan_id is not null or v_release_id is not null or v_target_sha is not null then
      raise exception '%', 'Reabrir o login gate exige NORMAL sem binding.'
        using errcode = 'P0001', detail = 'STATE_CONFLICT';
    end if;

    select e.plan_id into v_exec_plan_id
    from public.app_db_release_executions as e
    where e.id = p_execution_id;

    if not found then
      raise exception '%', 'Execução não encontrada.'
        using errcode = 'P0001', detail = 'EXECUTION_NOT_FOUND';
    end if;

    v_exec := public.app_db_release_owner_lock_internal(
      p_execution_id, p_worker_id, p_lease_generation, v_exec_plan_id, true, true
    );

    if not public.app_db_release_binding_release_safe_internal(v_exec.plan_id, 'OPEN') then
      raise exception '%', 'Normalização não comprovada; login permanece CLOSED.'
        using errcode = 'P0001', detail = 'DB_BINDING_RELEASE_UNSAFE';
    end if;

    if v_login_gate = 'OPEN' then
      return;
    end if;
  end if;

  update public.app_maintenance_state
  set login_gate = p_gate,
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb) is
  'RPC server-only. Único writer controlado do login_gate. CLOSED: release DB vinculado, FENCING+ (worker dono). OPEN: somente NORMAL sem binding + prova app_db_release_binding_release_safe_internal(OPEN) (sucesso comprovado ou execução não mutada/reconciliada) — nunca com RECOVERY_REQUIRED. Idempotente sem bump de versão quando já no estado alvo. O trigger app_maintenance_login_gate_guard_trg repete as regras.';

-- ════════════════════════════════════════════════════════════
--  16) RPC — app_maintenance_db_orchestration_abort_to_normal
--      (abort/reopen seguro: só com execução comprovadamente NÃO
--       mutada ou reconciliada; nunca com RECOVERY_REQUIRED)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_db_orchestration_abort_to_normal(
  p_execution_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_version integer;
  v_epoch integer;
  v_release_id uuid;
  v_db_plan_id uuid;
  v_plan_kind text;
  v_target_sha text;
  v_login_gate text;
  v_exec public.app_db_release_executions%rowtype;
  v_meta jsonb;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, db_plan_id, plan_kind, target_sha, login_gate
    into v_phase, v_version, v_epoch, v_release_id, v_db_plan_id, v_plan_kind, v_target_sha, v_login_gate
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_plan_kind is distinct from 'DB_MIGRATION' or v_db_plan_id is null
     or v_target_sha is null or v_release_id is not null then
    raise exception '%', 'Active DB orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_phase not in ('NOTICE', 'FENCING', 'DRAINING', 'QUIESCENT', 'BACKING_UP', 'FAILED', 'CANCELED') then
    raise exception '%', 'Abort/reopen não permitido a partir desta fase (mutação possível).'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  v_exec := public.app_db_release_owner_lock_internal(
    p_execution_id, p_worker_id, p_lease_generation, v_db_plan_id, true, true
  );

  if not public.app_db_release_binding_release_safe_internal(v_db_plan_id, 'REOPEN') then
    raise exception '%', 'Reopen bloqueado: execução DB em RECOVERY_REQUIRED, mutada ou não reconciliada.'
      using errcode = 'P0001', detail = 'DB_BINDING_RELEASE_UNSAFE';
  end if;

  v_meta := jsonb_build_object(
    'planId', v_db_plan_id,
    'executionId', v_exec.id,
    'from', v_phase,
    'to', 'NORMAL'
  ) || case when jsonb_typeof(p_metadata) = 'object' then p_metadata else '{}'::jsonb end;

  if v_phase not in ('FAILED', 'CANCELED') then
    update public.app_maintenance_state
    set phase = 'FAILED',
        login_gate = 'CLOSED',
        aborted_at = clock_timestamp(),
        abort_reason = p_reason,
        version = version + 1,
        reason = p_reason,
        updated_by_user_id = p_actor_user_id,
        updated_by_email = p_actor_email,
        updated_at = now()
    where scope = 'global';

    if v_login_gate is distinct from 'CLOSED' then
      perform public.app_maintenance_db_emit_internal(
        v_epoch, 'LOGIN_GATE_CLOSED', p_actor_user_id, p_actor_email, p_reason, v_meta
      );
    end if;
    perform public.app_maintenance_db_emit_internal(
      v_epoch, 'MAINTENANCE_FAILED', p_actor_user_id, p_actor_email, p_reason, v_meta
    );
  end if;

  -- Reopen: epoch + 1, binding limpo, login gate PERMANECE CLOSED
  -- (reabertura só pelo writer controlado, em NORMAL, com prova).
  update public.app_maintenance_state
  set phase = 'NORMAL',
      epoch = epoch + 1,
      version = version + 1,
      db_plan_id = null,
      plan_kind = null,
      target_sha = null,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  perform public.app_maintenance_db_emit_internal(
    v_epoch + 1, 'MAINTENANCE_REOPENED', p_actor_user_id, p_actor_email, p_reason, v_meta
  );
end;
$$;

comment on function public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb) is
  'RPC server-only. Abort/reopen DB: fases NOTICE..BACKING_UP/FAILED/CANCELED, com execução dona (ou reconciliada) e prova REOPEN (mutation_started_at NULL ou reconciliada; nunca RECOVERY_REQUIRED). FAILED (fecha o login) -> NORMAL com epoch+1 e binding limpo; o login permanece CLOSED até o writer controlado abrir com prova. MIGRATING/SMOKE nunca voltam por aqui.';

-- ════════════════════════════════════════════════════════════
--  17) WRITE FENCE — guard para CALLEES de operações registradas
--
--  Funções chamadas DENTRO de operações do registry (CHECKOUT /
--  ONBOARDING) — cupom_consumir(8), app_pedido_marcar_pago,
--  app_criar_categoria, app_criar_loja — não podem receber o guard
--  simples: um checkout/onboarding grandfathered (iniciado antes do
--  fence) quebraria no meio do DRAINING. Mas essas funções também são
--  chamáveis direto pelo cliente. Este guard:
--    1) toma a barreira compartilhada de cutover (154,1);
--    2) exige app_assert_business_write_allowed(NULL, NULL);
--    3) se o fence estiver ativo, admite SOMENTE em FENCING/DRAINING
--       quando existe operação IN_FLIGHT válida (CHECKOUT|ONBOARDING,
--       epoch N-1, started_at < fence_effective_at, TTL vivo).
--  Em QUIESCENT/BACKING_UP/MIGRATING/SMOKE... nenhuma passa: o
--  quiesce exige in-flight = 0 e o begin novo é barrado.
-- ════════════════════════════════════════════════════════════
create function public.app_assert_business_write_allowed_registry_callee_internal()
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
  v_detail text;
begin
  perform public.app_maintenance_cutover_barrier_internal(false);

  begin
    perform public.app_assert_business_write_allowed(null, null);
    return;
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if v_detail is distinct from 'MAINTENANCE_FENCE_ACTIVE' then
        raise;
      end if;
  end;

  select s.phase, s.epoch, s.fence_effective_at
    into v_phase, v_epoch, v_fence_effective_at
  from public.app_maintenance_state as s
  where s.scope = 'global';

  if found
     and v_phase in ('FENCING', 'DRAINING')
     and v_epoch is not null
     and v_epoch >= 1
     and v_fence_effective_at is not null
     and exists (
       select 1
       from public.app_maintenance_operations as o
       where o.status = 'IN_FLIGHT'
         and o.operation_type in ('CHECKOUT', 'ONBOARDING')
         and o.expires_at > clock_timestamp()
         and o.maintenance_epoch = v_epoch - 1
         and o.started_at < v_fence_effective_at
     ) then
    return;
  end if;

  raise exception '%', 'Manutenção em andamento. Novas operações estão temporariamente pausadas.'
    using errcode = 'P0001', detail = 'MAINTENANCE_FENCE_ACTIVE';
end;
$$;

comment on function public.app_assert_business_write_allowed_registry_callee_internal() is
  'Guard de write fence para callees/tabelas tocadas por operações registradas (CHECKOUT/ONBOARDING). Barreira compartilhada + assert; com fence ativo só admite FENCING/DRAINING com operação IN_FLIGHT grandfathered. Nunca admite após QUIESCENT. Uso interno — não é RPC pública.';

create function public.app_maintenance_business_write_registry_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_assert_business_write_allowed_registry_callee_internal();
  return null;
end;
$$;

comment on function public.app_maintenance_business_write_registry_trigger() is
  'Trigger function statement-level para tabelas que operações registradas também escrevem (ex.: loja_fiscal_emitente). Usa o guard de callee: grandfather só em FENCING/DRAINING com operação IN_FLIGHT.';

-- ════════════════════════════════════════════════════════════
--  18) WRITE FENCE — guard nas RPCs de escrita descobertas
--      (CREATE OR REPLACE da última definição do repositório +
--       UMA chamada de guard logo após o BEGIN principal).
--      ACL/owner/comentários preservados pelo CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════
-- pub_criar_pedido_v2/12 (PUBLIC_ORDER) — origem: 134_pub_criar_pedido_v2.sql
create or replace function public.pub_criar_pedido_v2(
  p_loja_id            bigint,
  p_canal              text,
  p_itens              jsonb,
  p_mesa_numero        integer default null,
  p_mesa_id            bigint  default null,
  p_comanda            text    default null,
  p_cliente            text    default null,
  p_telefone           text    default null,
  p_tipo_entrega       text    default null,
  p_forma_pagamento_id text    default null,
  p_troco_para         numeric default null,
  p_observacao_pedido  text    default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_loja          public.tab_lojas%rowtype;
  v_cfg           jsonb;
  v_func          jsonb;
  v_tz            text;
  v_agora         timestamptz := clock_timestamp();
  v_agora_loja    timestamp;
  v_canal         text;
  v_comanda       text;
  v_mesa_txt      text;
  v_mesa_num      integer;
  v_cliente       text;
  v_telefone      text;
  v_tipo          text;
  v_itens_out     jsonb := '[]'::jsonb;
  v_total         numeric := 0;
  v_forma_id      text;
  v_forma_label   text;
  v_momento       text;
  v_troco         numeric;
  v_exige_pag     boolean;
  v_id            text;
  v_try           integer;
  v_i             integer;
  v_item          jsonb;
  v_pid           bigint;
  v_qty           numeric;
  v_prod          public.tab_produtos%rowtype;
  v_base          numeric;
  v_unit          numeric;
  v_promo_unit    numeric;
  v_opts          jsonb;
  v_opt_delta     numeric;
  v_extras        jsonb;
  v_extra_delta   numeric;
  v_removed       jsonb;
  v_selected_ing  jsonb;
  v_obs_item      text;
  v_combo_id      bigint;
  v_sel_opts      jsonb;
  v_order_obs     text;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  -- ── Loja ──────────────────────────────────────────────────
  if p_loja_id is null then
    raise exception 'PPV2: Estabelecimento indisponível no momento.';
  end if;

  select * into v_loja from public.tab_lojas where id = p_loja_id;
  if not found or v_loja.ativo is not true or coalesce(v_loja.licenca_bloqueada, false) then
    raise exception 'PPV2: Estabelecimento indisponível no momento.';
  end if;

  v_canal := nullif(trim(coalesce(p_canal, '')), '');
  if v_canal is null or v_canal not in ('interno', 'externo') then
    raise exception 'PPV2: Pedido indisponível no momento.';
  end if;

  if v_canal = 'interno' and coalesce(v_loja.modo_uso, '') not in ('interno', 'ambos') then
    raise exception 'PPV2: Atendimento interno está desativado para esta empresa.';
  end if;
  if v_canal = 'externo' and coalesce(v_loja.modo_uso, '') not in ('externo', 'ambos') then
    raise exception 'PPV2: Cardápio externo desativado pelo Modo de Uso da empresa.';
  end if;

  v_cfg  := coalesce(v_loja.config_externo, '{}'::jsonb);
  v_func := coalesce(v_loja.funcionamento, '{}'::jsonb);

  if v_canal = 'externo' and coalesce((v_cfg->>'aceitaPedidoExterno')::boolean, true) is not true then
    raise exception 'PPV2: Esta empresa não está aceitando pedidos pelo cardápio no momento.';
  end if;

  -- ── Timezone da loja (autoridade; nunca o do browser) ─────
  v_tz := nullif(trim(coalesce(v_func->>'timezone', '')), '');
  if v_tz is null then
    v_tz := 'America/Sao_Paulo';
  end if;
  begin
    v_agora_loja := v_agora at time zone v_tz;
  exception when others then
    v_tz := 'America/Sao_Paulo';
    v_agora_loja := v_agora at time zone v_tz;
  end;

  -- ── Horário (funcionamento 110; legado só se a grade do canal
  --    externo estiver vazia). Não chama pub_loja_aberta. ────
  declare
    v_unificado boolean := coalesce((v_func->>'unificado')::boolean, false);
    v_bloquear  boolean := coalesce((v_func->>'bloquearForaHorario')::boolean, true);
    v_grade     jsonb;
    v_dias      text[] := array['dom','seg','ter','qua','qui','sex','sab'];
    v_rotulo    text[] := array['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    v_dow       integer;
    v_dia       text;
    v_ontem     text;
    v_min       integer;
    v_aberto    boolean := false;
    v_tem       boolean := false;
    v_d         text;
    v_arr       jsonb;
    v_iv        jsonb;
    v_k         integer;
    v_abre      integer;
    v_fecha     integer;
    v_faixa     text;
    v_partes    text[];
    v_leg       jsonb;
    v_salto     integer;
    v_idx       integer;
    v_prox_txt  text := null;
    v_prox_min  integer;
    v_cand      integer;
  begin
    if v_unificado then
      v_grade := coalesce(v_func->'interno', '{}'::jsonb);
    elsif v_canal = 'externo' then
      v_grade := coalesce(v_func->'externo', '{}'::jsonb);
    else
      v_grade := coalesce(v_func->'interno', '{}'::jsonb);
    end if;

    -- Grade vazia no canal externo: fallback do legado HH:MM–HH:MM.
    v_tem := false;
    foreach v_d in array v_dias loop
      v_arr := v_grade -> v_d;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
        v_tem := true;
        exit;
      end if;
    end loop;

    if (not v_tem) and v_canal = 'externo' and not v_unificado then
      v_leg := v_cfg -> 'horarios';
      if jsonb_typeof(v_leg) = 'object' then
        v_grade := '{}'::jsonb;
        foreach v_d in array v_dias loop
          v_faixa := trim(coalesce(v_leg->>v_d, ''));
          if v_faixa ~ '[0-9]' then
            v_partes := regexp_split_to_array(v_faixa, '[–-]');
            if array_length(v_partes, 1) >= 2
               and trim(v_partes[1]) ~ '^\d{1,2}:\d{2}'
               and trim(v_partes[2]) ~ '^\d{1,2}:\d{2}' then
              v_grade := v_grade || jsonb_build_object(
                v_d, jsonb_build_array(jsonb_build_object(
                  'abre', trim(v_partes[1]),
                  'fecha', trim(split_part(trim(v_partes[2]), ' ', 1))
                ))
              );
            end if;
          end if;
        end loop;
      end if;
    end if;

    v_tem := false;
    foreach v_d in array v_dias loop
      v_arr := v_grade -> v_d;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
        v_tem := true;
        exit;
      end if;
    end loop;

    v_dow := extract(dow from v_agora_loja)::integer;
    v_dia := v_dias[v_dow + 1];
    v_ontem := v_dias[((v_dow + 6) % 7) + 1];
    v_min := extract(hour from v_agora_loja)::integer * 60
          + extract(minute from v_agora_loja)::integer;

    v_arr := coalesce(v_grade -> v_dia, '[]'::jsonb);
    if jsonb_typeof(v_arr) = 'array' then
      for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
        v_iv := v_arr -> v_k;
        begin
          v_abre  := (split_part(v_iv->>'abre',  ':', 1))::int * 60
                   + (split_part(coalesce(v_iv->>'abre',  '0:0'), ':', 2))::int;
          v_fecha := (split_part(v_iv->>'fecha', ':', 1))::int * 60
                   + (split_part(coalesce(v_iv->>'fecha', '0:0'), ':', 2))::int;
        exception when others then
          continue;
        end;
        if v_fecha > v_abre then
          if v_min >= v_abre and v_min < v_fecha then v_aberto := true; exit; end if;
        elsif v_fecha < v_abre then
          if v_min >= v_abre or v_min < v_fecha then v_aberto := true; exit; end if;
        end if;
      end loop;
    end if;

    if not v_aberto then
      v_arr := coalesce(v_grade -> v_ontem, '[]'::jsonb);
      if jsonb_typeof(v_arr) = 'array' then
        for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
          v_iv := v_arr -> v_k;
          begin
            v_abre  := (split_part(v_iv->>'abre',  ':', 1))::int * 60
                     + (split_part(coalesce(v_iv->>'abre',  '0:0'), ':', 2))::int;
            v_fecha := (split_part(v_iv->>'fecha', ':', 1))::int * 60
                     + (split_part(coalesce(v_iv->>'fecha', '0:0'), ':', 2))::int;
          exception when others then
            continue;
          end;
          if v_fecha < v_abre and v_min < v_fecha then
            v_aberto := true;
            exit;
          end if;
        end loop;
      end if;
    end if;

    if v_aberto then
      null;
    elsif not v_tem then
      null; -- sem grade: disponível (SEM_HORARIO)
    elsif v_bloquear then
      for v_salto in 0 .. 7 loop
        v_idx := (v_dow + v_salto) % 7;
        v_d := v_dias[v_idx + 1];
        v_arr := coalesce(v_grade -> v_d, '[]'::jsonb);
        v_prox_min := null;
        if jsonb_typeof(v_arr) = 'array' then
          for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
            v_iv := v_arr -> v_k;
            begin
              v_cand := (split_part(v_iv->>'abre', ':', 1))::int * 60
                      + (split_part(coalesce(v_iv->>'abre', '0:0'), ':', 2))::int;
            exception when others then
              continue;
            end;
            if v_salto > 0 or v_cand > v_min then
              if v_prox_min is null or v_cand < v_prox_min then
                v_prox_min := v_cand;
              end if;
            end if;
          end loop;
        end if;
        if v_prox_min is not null then
          v_prox_txt := case
            when v_salto = 0 then 'hoje'
            else v_rotulo[v_idx + 1]
          end
          || ' às '
          || lpad((v_prox_min / 60)::text, 2, '0')
          || ':'
          || lpad((v_prox_min % 60)::text, 2, '0');
          exit;
        end if;
      end loop;
      raise exception 'PPV2: Fechado para novos pedidos no momento.%',
        case when v_prox_txt is not null
             then ' Próxima abertura: ' || v_prox_txt || '.'
             else ''
        end;
    end if;
  end;

  -- ── Canal interno: mesa + comanda ─────────────────────────
  if v_canal = 'interno' then
    if p_mesa_id is null and (p_mesa_numero is null or p_mesa_numero <= 0) then
      raise exception 'PPV2: Informe o número da mesa.';
    end if;

    if p_mesa_id is not null then
      select m.numero into v_mesa_num
        from public.tab_mesas m
       where m.id = p_mesa_id
         and m.loja_id = p_loja_id
         and m.ativo is true
         and coalesce(m.permite_qr, true) is true;
      if v_mesa_num is null then
        raise exception 'PPV2: Mesa não encontrada ou inativa. Verifique o QR Code.';
      end if;
    else
      select m.numero into v_mesa_num
        from public.tab_mesas m
       where m.numero = p_mesa_numero
         and m.loja_id = p_loja_id
         and m.ativo is true
         and coalesce(m.permite_qr, true) is true;
      if v_mesa_num is null then
        raise exception 'PPV2: Mesa não encontrada ou inativa. Verifique o QR Code.';
      end if;
    end if;

    v_mesa_txt := 'Mesa ' || lpad(v_mesa_num::text, 2, '0');

    v_comanda := upper(trim(coalesce(p_comanda, '')));
    if v_comanda = '' or v_comanda !~ '^[A-Z]{1,5}-\d{4,8}$' then
      raise exception 'PPV2: Escaneie o QR Code da mesa (comanda) para pedir.';
    end if;
    if split_part(v_comanda, '-', 1) is distinct from upper(trim(coalesce(v_loja.prefixo, ''))) then
      raise exception 'PPV2: Comanda de outra empresa (%).', split_part(v_comanda, '-', 1);
    end if;

    v_cliente := coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Cliente');
    v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
    if length(v_telefone) < 10 then
      v_telefone := null;
    end if;
    v_tipo := null;
  else
    -- ── Canal externo ───────────────────────────────────────
    v_tipo := nullif(trim(coalesce(p_tipo_entrega, '')), '');
    if v_tipo is null
       or v_tipo not in ('local', 'retirada', 'entrega')
       or (v_tipo = 'local'    and coalesce((v_cfg->>'consumoLocal')::boolean, true) is not true)
       or (v_tipo = 'retirada' and coalesce((v_cfg->>'retirada')::boolean, true) is not true)
       or (v_tipo = 'entrega'  and coalesce((v_cfg->>'entrega')::boolean, false) is not true)
    then
      if coalesce((v_cfg->>'consumoLocal')::boolean, true) is not true
         and coalesce((v_cfg->>'retirada')::boolean, true) is not true
         and coalesce((v_cfg->>'entrega')::boolean, false) is not true then
        raise exception 'PPV2: Nenhuma forma de pedido (consumo, retirada ou entrega) está disponível no momento.';
      end if;
      raise exception 'PPV2: Escolha como deseja receber o pedido.';
    end if;

    v_mesa_txt := case v_tipo
      when 'local'    then 'Externo · Consumo no local'
      when 'retirada' then 'Externo · Retirada'
      when 'entrega'  then 'Externo · Entrega'
      else 'Externo'
    end;

    v_cliente := nullif(trim(coalesce(p_cliente, '')), '');
    if v_cliente is null then
      raise exception 'PPV2: Informe o seu nome.';
    end if;
    v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
    if length(v_telefone) < 10 then
      raise exception 'PPV2: Informe um telefone válido (com DDD).';
    end if;

    v_comanda := upper(trim(coalesce(p_comanda, '')));
    if v_comanda = '' or v_comanda !~ '^[A-Z]{1,5}-\d{4,8}$' then
      raise exception 'PPV2: Escaneie o QR Code da mesa (comanda) para pedir.';
    end if;
  end if;

  -- ── Observação do pedido ──────────────────────────────────
  v_order_obs := nullif(trim(coalesce(p_observacao_pedido, '')), '');
  if v_order_obs is not null then
    v_order_obs := left(v_order_obs, 500);
  end if;

  -- ── Itens ─────────────────────────────────────────────────
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'PPV2: Item inválido.';
  end if;

  for v_i in 0 .. jsonb_array_length(p_itens) - 1 loop
    v_item := p_itens -> v_i;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'PPV2: Item inválido.';
    end if;

    begin
      if jsonb_typeof(v_item->'productId') = 'number' then
        v_pid := (v_item->>'productId')::bigint;
      elsif jsonb_typeof(v_item->'productId') = 'string' and (v_item->>'productId') ~ '^\d+$' then
        v_pid := (v_item->>'productId')::bigint;
      else
        v_pid := null;
      end if;
    exception when others then
      v_pid := null;
    end;
    if v_pid is null then
      raise exception 'PPV2: Item inválido.';
    end if;

    begin
      v_qty := (v_item->>'quantity')::numeric;
    exception when others then
      v_qty := null;
    end;
    if v_qty is null or v_qty < 1 or v_qty <> trunc(v_qty) then
      raise exception 'PPV2: Item inválido.';
    end if;

    select * into v_prod
      from public.tab_produtos
     where id = v_pid and loja_id = p_loja_id;
    if not found then
      raise exception 'PPV2: Item inválido.';
    end if;
    if v_prod.ativo is not true or coalesce(v_prod.disponivel, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;
    if v_canal = 'interno' and coalesce(v_prod.visivel_qr, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;
    if v_canal = 'externo' and coalesce(v_prod.visivel_externo, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;

    v_base := coalesce(v_prod.preco, 0);

    -- Promoção normal (não combo): menor preço vigente no TZ da loja.
    v_promo_unit := v_base;
    declare
      v_pr          record;
      v_ids         jsonb;
      v_tem_alvo    boolean;
      v_alvo_prod   boolean;
      v_alvo_cat    boolean;
      v_cand        numeric;
      v_data        date := v_agora_loja::date;
      v_dow_p       integer := extract(dow from v_agora_loja)::integer;
      v_hm          text := to_char(v_agora_loja, 'HH24:MI');
      v_hi          text;
      v_hf          text;
    begin
      for v_pr in
        select *
          from public.tab_promocoes pr
         where pr.loja_id = p_loja_id
           and pr.ativo is true
           and coalesce(pr.tipo, '') is distinct from 'combo'
      loop
        if v_pr.data_inicio is not null and v_data < v_pr.data_inicio then continue; end if;
        if v_pr.data_fim    is not null and v_data > v_pr.data_fim    then continue; end if;
        if jsonb_typeof(v_pr.dias_semana) = 'array'
           and jsonb_array_length(v_pr.dias_semana) > 0
           and not (v_pr.dias_semana @> to_jsonb(v_dow_p)) then
          continue;
        end if;
        v_hi := to_char(v_pr.hora_inicio, 'HH24:MI');
        v_hf := to_char(v_pr.hora_fim,    'HH24:MI');
        if v_hi is not null and v_hm < v_hi then continue; end if;
        if v_hf is not null and v_hm > v_hf then continue; end if;

        if jsonb_typeof(v_pr.produto_ids) = 'array' and jsonb_array_length(v_pr.produto_ids) > 0 then
          v_ids := v_pr.produto_ids;
        elsif v_pr.produto_id is not null then
          v_ids := jsonb_build_array(v_pr.produto_id);
        else
          v_ids := '[]'::jsonb;
        end if;
        v_tem_alvo := jsonb_array_length(v_ids) > 0 or v_pr.categoria_id is not null;
        v_alvo_prod := v_ids @> to_jsonb(v_pid) or v_ids @> to_jsonb(v_pid::text);
        v_alvo_cat := false;
        if v_pr.categoria_id is not null then
          if v_prod.categoria_id is not null then
            v_alvo_cat := v_prod.categoria_id = v_pr.categoria_id;
          else
            v_alvo_cat := exists (
              select 1 from public.tab_categorias c
               where c.id = v_pr.categoria_id
                 and c.loja_id = p_loja_id
                 and c.nome is not distinct from v_prod.categoria
            );
          end if;
        end if;
        if v_tem_alvo and not (v_alvo_prod or v_alvo_cat) then
          continue;
        end if;

        v_cand := null;
        if v_pr.desconto_percent is not null and v_pr.desconto_percent > 0 then
          v_cand := v_base * (1 - v_pr.desconto_percent / 100);
        elsif v_pr.desconto_valor is not null and v_pr.desconto_valor > 0 then
          v_cand := greatest(0, v_base - v_pr.desconto_valor);
        else
          continue;
        end if;
        v_cand := round(v_cand, 2);
        if v_cand < v_base and v_cand < v_promo_unit then
          v_promo_unit := v_cand;
        end if;
      end loop;
    end;

    v_unit := v_promo_unit;

    -- Opções (optionIds). Preço = tab_opcoes.preco_delta.
    v_opts := coalesce(v_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(v_opts) is distinct from 'array' then
      raise exception 'PPV2: Opção inválida.';
    end if;

    v_sel_opts := '[]'::jsonb;
    v_opt_delta := 0;
    declare
      v_j     integer;
      v_oid   bigint;
      v_op    record;
      v_g     record;
      v_cnt   integer;
      v_seen  jsonb := '{}'::jsonb;
    begin
      for v_j in 0 .. jsonb_array_length(v_opts) - 1 loop
        begin
          if jsonb_typeof(v_opts->v_j) = 'number' then
            v_oid := (v_opts->>v_j)::bigint;
          elsif jsonb_typeof(v_opts->v_j) = 'string' and (v_opts->>v_j) ~ '^\d+$' then
            v_oid := (v_opts->>v_j)::bigint;
          else
            v_oid := null;
          end if;
        exception when others then
          v_oid := null;
        end;
        if v_oid is null then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if coalesce(v_seen->>v_oid::text, '') = '1' then
          continue;
        end if;
        v_seen := v_seen || jsonb_build_object(v_oid::text, 1);

        select o.id, o.nome, o.preco_delta, o.grupo_id, o.ativo as o_ativo, o.loja_id as o_loja,
               g.id as g_id, g.nome as g_nome, g.ativo as g_ativo, g.produto_id,
               g.loja_id as g_loja, g.min_select, g.max_select, g.obrigatorio
          into v_op
          from public.tab_opcoes o
          join public.tab_grupos_opcoes g on g.id = o.grupo_id
         where o.id = v_oid;

        if not found
           or v_op.o_ativo is not true
           or v_op.g_ativo is not true
           or v_op.o_loja is distinct from p_loja_id
           or v_op.g_loja is distinct from p_loja_id
           or v_op.produto_id is distinct from v_pid then
          raise exception 'PPV2: Opção inválida.';
        end if;

        v_opt_delta := v_opt_delta + coalesce(v_op.preco_delta, 0);
        v_sel_opts := v_sel_opts || jsonb_build_array(jsonb_build_object(
          'grupo', v_op.g_nome,
          'nome', v_op.nome,
          'preco', coalesce(v_op.preco_delta, 0),
          'optionId', v_op.id,
          'grupoId', v_op.g_id
        ));
      end loop;

      for v_g in
        select *
          from public.tab_grupos_opcoes g
         where g.produto_id = v_pid
           and g.loja_id = p_loja_id
           and g.ativo is not false
      loop
        select count(*)::integer into v_cnt
          from jsonb_array_elements(v_sel_opts) e
         where (e->>'grupoId')::bigint = v_g.id;
        if v_cnt > coalesce(v_g.max_select, 1) then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if v_g.obrigatorio
           and v_cnt < greatest(coalesce(v_g.min_select, 0), 1) then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if not v_g.obrigatorio
           and coalesce(v_g.min_select, 0) > 0
           and v_cnt > 0
           and v_cnt < v_g.min_select then
          raise exception 'PPV2: Opção inválida.';
        end if;
      end loop;
    end;

    v_unit := v_unit + v_opt_delta;

    -- Extras por NOME em tab_produtos.adicionais.
    v_extras := coalesce(v_item->'extraIngredients', '[]'::jsonb);
    if jsonb_typeof(v_extras) is distinct from 'array' then
      raise exception 'PPV2: Item inválido.';
    end if;
    v_extra_delta := 0;
    declare
      v_j        integer;
      v_nome_ex  text;
      v_preco_ex numeric;
      v_acc      jsonb := '[]'::jsonb;
    begin
      for v_j in 0 .. jsonb_array_length(v_extras) - 1 loop
        if jsonb_typeof(v_extras->v_j) is distinct from 'string' then
          raise exception 'PPV2: Item inválido.';
        end if;
        v_nome_ex := trim(v_extras->>v_j);
        if v_nome_ex = '' then
          continue;
        end if;
        if exists (
          select 1 from jsonb_array_elements_text(v_acc) t where t = v_nome_ex
        ) then
          continue;
        end if;
        v_preco_ex := null;
        select (a->>'preco')::numeric into v_preco_ex
          from jsonb_array_elements(coalesce(v_prod.adicionais, '[]'::jsonb)) a
         where a->>'nome' = v_nome_ex
         limit 1;
        if not found then
          raise exception 'PPV2: Item inválido.';
        end if;
        v_extra_delta := v_extra_delta + coalesce(v_preco_ex, 0);
        v_acc := v_acc || to_jsonb(v_nome_ex);
      end loop;
      v_extras := v_acc;
    end;
    v_unit := round(v_unit + v_extra_delta, 2);

    -- Ingredientes removidos: só nomes do cadastro, sem preço.
    v_removed := coalesce(v_item->'removedIngredients', '[]'::jsonb);
    if jsonb_typeof(v_removed) is distinct from 'array' then
      v_removed := '[]'::jsonb;
    end if;
    declare
      v_j       integer;
      v_nm      text;
      v_acc_r   jsonb := '[]'::jsonb;
      v_ings    text[] := coalesce(v_prod.ingredientes, '{}'::text[]);
      v_acc_s   jsonb := '[]'::jsonb;
      v_ing     text;
    begin
      for v_j in 0 .. jsonb_array_length(v_removed) - 1 loop
        if jsonb_typeof(v_removed->v_j) is distinct from 'string' then
          continue;
        end if;
        v_nm := trim(v_removed->>v_j);
        if v_nm = '' then continue; end if;
        if coalesce(array_length(v_ings, 1), 0) > 0 then
          if not (v_nm = any (v_ings)) then continue; end if;
        end if;
        if not exists (select 1 from jsonb_array_elements_text(v_acc_r) t where t = v_nm) then
          v_acc_r := v_acc_r || to_jsonb(v_nm);
        end if;
      end loop;
      v_removed := v_acc_r;
      if coalesce(array_length(v_ings, 1), 0) > 0 then
        foreach v_ing in array v_ings loop
          if not exists (
            select 1 from jsonb_array_elements_text(v_removed) t where t = v_ing
          ) then
            v_acc_s := v_acc_s || to_jsonb(v_ing);
          end if;
        end loop;
        v_selected_ing := v_acc_s;
      else
        v_selected_ing := '[]'::jsonb;
      end if;
    end;

    v_obs_item := trim(coalesce(v_item->>'observation', ''));

    v_combo_id := null;
    if v_item ? 'comboPromoId' and jsonb_typeof(v_item->'comboPromoId') <> 'null' then
      begin
        if jsonb_typeof(v_item->'comboPromoId') = 'number' then
          v_combo_id := (v_item->>'comboPromoId')::bigint;
        elsif jsonb_typeof(v_item->'comboPromoId') = 'string'
           and (v_item->>'comboPromoId') ~ '^\d+$' then
          v_combo_id := (v_item->>'comboPromoId')::bigint;
        end if;
      exception when others then
        v_combo_id := null;
      end;
    end if;

    v_itens_out := v_itens_out || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'productId', v_pid,
        'name', v_prod.nome,
        'quantity', v_qty::integer,
        'price', v_unit,
        'selectedOptions', v_sel_opts,
        'extraIngredients', v_extras,
        'removedIngredients', v_removed,
        'observation', v_obs_item,
        'selectedIngredients', v_selected_ing,
        'comboPromoId', v_combo_id
      ))
    );
  end loop;

  -- Observação do pedido no primeiro item (sem coluna nova).
  if v_order_obs is not null then
    v_itens_out := jsonb_set(
      v_itens_out,
      '{0,orderObservation}',
      to_jsonb(v_order_obs),
      true
    );
  end if;

  -- ── Combos: agrupa por comboPromoId, exige receita completa,
  --    distribui o preço fechado; último item fecha o centavo. ─
  declare
    v_cids     bigint[];
    v_cid      bigint;
    v_pr       public.tab_promocoes%rowtype;
    v_recipe   jsonb;
    v_payload  jsonb;
    v_rid      bigint;
    v_k        integer;
    v_key      text;
    v_n        integer;
    v_n2       integer;
    v_soma     numeric;
    v_alvo     numeric;
    v_fator    numeric;
    v_acum     numeric;
    v_last     integer;
    v_obj      jsonb;
    v_q        numeric;
    v_p        numeric;
    v_new      numeric;
    v_data     date := v_agora_loja::date;
    v_dow_p    integer := extract(dow from v_agora_loja)::integer;
    v_hm       text := to_char(v_agora_loja, 'HH24:MI');
    v_hi       text;
    v_hf       text;
    v_ids      jsonb;
  begin
    select coalesce(array_agg(distinct (e->>'comboPromoId')::bigint)
                    filter (where e->>'comboPromoId' is not null), '{}'::bigint[])
      into v_cids
      from jsonb_array_elements(v_itens_out) e;

    foreach v_cid in array v_cids loop
      select * into v_pr
        from public.tab_promocoes
       where id = v_cid and loja_id = p_loja_id;
      if not found
         or coalesce(v_pr.tipo, '') <> 'combo'
         or v_pr.ativo is not true
         or coalesce(v_pr.desconto_valor, 0) <= 0 then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_pr.data_inicio is not null and v_data < v_pr.data_inicio then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_pr.data_fim is not null and v_data > v_pr.data_fim then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if jsonb_typeof(v_pr.dias_semana) = 'array'
         and jsonb_array_length(v_pr.dias_semana) > 0
         and not (v_pr.dias_semana @> to_jsonb(v_dow_p)) then
        raise exception 'PPV2: Combo inválido.';
      end if;
      v_hi := to_char(v_pr.hora_inicio, 'HH24:MI');
      v_hf := to_char(v_pr.hora_fim,    'HH24:MI');
      if v_hi is not null and v_hm < v_hi then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_hf is not null and v_hm > v_hf then
        raise exception 'PPV2: Combo inválido.';
      end if;

      if jsonb_typeof(v_pr.produto_ids) = 'array' and jsonb_array_length(v_pr.produto_ids) > 0 then
        v_ids := v_pr.produto_ids;
      elsif v_pr.produto_id is not null then
        v_ids := jsonb_build_array(v_pr.produto_id);
      else
        raise exception 'PPV2: Combo inválido.';
      end if;

      v_recipe := '{}'::jsonb;
      for v_k in 0 .. jsonb_array_length(v_ids) - 1 loop
        begin
          if jsonb_typeof(v_ids->v_k) = 'number' then
            v_rid := (v_ids->>v_k)::bigint;
          elsif jsonb_typeof(v_ids->v_k) = 'string' and (v_ids->>v_k) ~ '^\d+$' then
            v_rid := (v_ids->>v_k)::bigint;
          else
            v_rid := null;
          end if;
        exception when others then
          v_rid := null;
        end;
        if v_rid is null then
          raise exception 'PPV2: Combo inválido.';
        end if;
        v_recipe := jsonb_set(
          v_recipe,
          array[v_rid::text],
          to_jsonb(coalesce((v_recipe->>v_rid::text)::integer, 0) + 1)
        );
      end loop;

      v_payload := '{}'::jsonb;
      v_soma := 0;
      v_last := null;
      for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
        v_obj := v_itens_out -> v_k;
        if (v_obj->>'comboPromoId')::bigint is not distinct from v_cid then
          v_rid := (v_obj->>'productId')::bigint;
          v_q := coalesce((v_obj->>'quantity')::numeric, 1);
          v_payload := jsonb_set(
            v_payload,
            array[v_rid::text],
            to_jsonb(coalesce((v_payload->>v_rid::text)::numeric, 0) + v_q)
          );
          v_soma := v_soma + coalesce((v_obj->>'price')::numeric, 0) * v_q;
          v_last := v_k;
        end if;
      end loop;

      if v_soma is null or v_soma <= 0 or v_last is null then
        raise exception 'PPV2: Combo inválido.';
      end if;

      -- Conjunto do payload deve ser exatamente a receita, múltiplo inteiro.
      v_n := null;
      for v_key in select jsonb_object_keys(v_payload) loop
        if v_recipe->>v_key is null then
          raise exception 'PPV2: Combo inválido.';
        end if;
      end loop;
      for v_key in select jsonb_object_keys(v_recipe) loop
        if coalesce((v_payload->>v_key)::numeric, 0) <= 0 then
          raise exception 'PPV2: Combo inválido.';
        end if;
        if (v_payload->>v_key)::numeric % (v_recipe->>v_key)::numeric <> 0 then
          raise exception 'PPV2: Combo inválido.';
        end if;
        v_n2 := ((v_payload->>v_key)::numeric / (v_recipe->>v_key)::numeric)::integer;
        if v_n is null then
          v_n := v_n2;
        elsif v_n is distinct from v_n2 then
          raise exception 'PPV2: Combo inválido.';
        end if;
      end loop;
      if v_n is null or v_n < 1 then
        raise exception 'PPV2: Combo inválido.';
      end if;

      v_alvo := round(v_n * v_pr.desconto_valor, 2);
      v_fator := v_alvo / v_soma;
      v_acum := 0;
      for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
        v_obj := v_itens_out -> v_k;
        if (v_obj->>'comboPromoId')::bigint is distinct from v_cid then
          continue;
        end if;
        v_q := coalesce((v_obj->>'quantity')::numeric, 1);
        v_p := coalesce((v_obj->>'price')::numeric, 0);
        if v_k = v_last then
          v_new := round((v_alvo - v_acum) / v_q, 2);
          if v_new < 0 then v_new := 0; end if;
        else
          v_new := round(v_p * v_fator, 2);
          v_acum := v_acum + v_new * v_q;
        end if;
        v_itens_out := jsonb_set(v_itens_out, array[v_k::text, 'price'], to_jsonb(v_new));
      end loop;
    end loop;
  end;

  -- Remove comboPromoId do JSON persistido (não é shape do admin/cozinha).
  declare
    v_k   integer;
    v_obj jsonb;
    v_acc jsonb := '[]'::jsonb;
  begin
    for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
      v_obj := (v_itens_out -> v_k) - 'comboPromoId';
      v_acc := v_acc || jsonb_build_array(v_obj);
    end loop;
    v_itens_out := v_acc;
  end;

  -- Total server-side: SUM(price * quantity).
  select coalesce(sum((e->>'price')::numeric * (e->>'quantity')::numeric), 0)
    into v_total
    from jsonb_array_elements(v_itens_out) e;
  v_total := round(v_total, 2);

  -- Pedido mínimo (externo).
  if v_canal = 'externo' then
    declare
      v_min     numeric := 0;
      v_raw     text;
      v_s       text;
      v_moeda   text;
      v_falta   text;
    begin
      if jsonb_typeof(v_cfg->'pedidoMinimo') = 'number' then
        v_min := coalesce((v_cfg->>'pedidoMinimo')::numeric, 0);
      else
        v_raw := coalesce(v_cfg->>'pedidoMinimo', '');
        v_s := regexp_replace(v_raw, '[^0-9,.]', '', 'g');
        if v_s <> '' then
          if position(',' in v_s) > 0 then
            v_s := replace(replace(v_s, '.', ''), ',', '.');
          end if;
          begin
            v_min := v_s::numeric;
          exception when others then
            v_min := 0;
          end;
        end if;
      end if;
      if v_min > 0 and v_total < v_min then
        v_moeda := 'R$ ' || replace(trim(to_char(round(v_min, 2), '999999990.00')), '.', ',');
        v_falta := 'R$ ' || replace(trim(to_char(round(v_min - v_total, 2), '999999990.00')), '.', ',');
        raise exception 'PPV2: Pedido mínimo de %. Faltam %.', v_moeda, v_falta;
      end if;
    end;
  end if;

  -- ── Pagamento ─────────────────────────────────────────────
  v_exige_pag := (v_canal = 'externo' and v_tipo is distinct from 'local')
    and (
      coalesce((v_cfg->>'pagPix')::boolean, true)
      or coalesce((v_cfg->>'pagCartao')::boolean, true)
      or coalesce((v_cfg->>'pagDinheiro')::boolean, true)
    );

  v_forma_id := nullif(trim(coalesce(p_forma_pagamento_id, '')), '');
  v_forma_label := null;
  v_momento := null;
  v_troco := null;

  if v_exige_pag then
    if not (
      coalesce((v_cfg->>'pagPix')::boolean, true)
      or coalesce((v_cfg->>'pagCartao')::boolean, true)
      or coalesce((v_cfg->>'pagDinheiro')::boolean, true)
    ) then
      raise exception 'PPV2: Nenhuma forma de pagamento está disponível no momento.';
    end if;
    if v_forma_id is null then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id not in ('pix', 'cartao', 'dinheiro') then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'pix'      and coalesce((v_cfg->>'pagPix')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'cartao'   and coalesce((v_cfg->>'pagCartao')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'dinheiro' and coalesce((v_cfg->>'pagDinheiro')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;

    v_forma_label := case v_forma_id
      when 'pix'      then 'PIX'
      when 'cartao'   then 'Cartão'
      when 'dinheiro' then 'Dinheiro'
    end;
    v_momento := case
      when v_canal = 'interno' then 'No caixa'
      when v_tipo = 'entrega'  then 'Na entrega'
      when v_tipo = 'retirada' then 'Na retirada'
      when v_tipo = 'local'    then 'Após o consumo, no fechamento da conta'
      when coalesce((v_cfg->>'pagOnline')::boolean, false) then 'Online'
      else 'No atendimento'
    end;

    if v_forma_id = 'dinheiro' and p_troco_para is not null then
      if p_troco_para <= 0 then
        raise exception 'PPV2: Informe o valor que vai usar para pagar.';
      end if;
      if p_troco_para < v_total then
        raise exception 'PPV2: O valor deve ser de pelo menos % (total do pedido).',
          ('R$ ' || replace(trim(to_char(round(v_total, 2), '999999990.00')), '.', ','));
      end if;
      v_troco := p_troco_para;
    end if;
  end if;

  -- ── INSERT atômico (status server-side; id PED- legado) ───
  for v_try in 1 .. 5 loop
    v_id := 'PED-'
      || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
      || lpad((floor(random() * 90) + 10)::text, 2, '0');
    begin
      insert into public.tab_pedidos (
        id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento,
        itens, loja_id, pagamento_forma, pagamento_momento, pagamento_troco_para
      ) values (
        v_id, v_mesa_txt, v_comanda, v_cliente, v_telefone,
        'recebido', 'aberto',
        v_itens_out, p_loja_id,
        v_forma_label, v_momento,
        case when v_troco > 0 then v_troco else null end
      );
      return v_id;
    exception when unique_violation then
      if v_try = 5 then
        raise exception 'PPV2: Erro ao enviar o pedido. Tente novamente.';
      end if;
    end;
  end loop;

  raise exception 'PPV2: Erro ao enviar o pedido. Tente novamente.';
end;
$fn$;

-- pub_criar_pedido/11 (PUBLIC_ORDER_LEGACY_071) — origem: 071_pedido_troco.sql
create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb,
  p_pag_forma text default null, p_pag_momento text default null,
  p_mesa_numero integer default null, p_mesa_id bigint default null,
  p_troco_para numeric default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  perform public.pub_validar_pedido_mesa(p_loja_id, p_mesa_numero, p_mesa_id);

  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos
    (id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id,
     pagamento_forma, pagamento_momento, pagamento_troco_para)
  values
    (v_id, p_mesa, p_comanda, nullif(p_cliente, ''), nullif(p_telefone, ''),
     'recebido', 'aberto', coalesce(p_itens, '[]'::jsonb), p_loja_id,
     nullif(p_pag_forma, ''), nullif(p_pag_momento, ''),
     case when p_troco_para > 0 then p_troco_para else null end);

  return v_id;
end; $$;

-- app_criar_pedido/9 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_criar_pedido(
  p_mesa                 text,
  p_comanda               text,
  p_itens                 jsonb,
  p_cliente               text    default null,
  p_cliente_telefone      text    default null,
  p_pagamento_forma       text    default null,
  p_pagamento_momento     text    default null,
  p_pagamento_troco_para  numeric default null,
  p_loja_id               bigint  default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_loja     bigint;
  v_mesa     text;
  v_comanda  text;
  v_id       text;
  v_row      public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  -- Identidade: precisa existir em tab_usuarios e estar ativo. Nenhum
  -- pedido é criado por caller anônimo ou desconhecido — anon NEM
  -- recebe EXECUTE nesta função (ver GRANT abaixo), mas a checagem
  -- fica aqui também (defesa em profundidade / fail-closed real).
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  -- Autorização funcional server-side (evidência: handleSendOrder usa
  -- canAccess(currentUser,"tablet"); criarPedidoCaixa e
  -- separarItensPedidos usam canAccess(currentUser,"cashier")).
  -- super_admin sempre autorizado (mesmo padrão de tenant abaixo).
  if not coalesce(v_caller.super_admin, false) then
    if not (
      'tablet' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
      or 'cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Tenant: NUNCA confia em p_loja_id do browser para não-super.
  -- Super precisa informar p_loja_id explicitamente, validado contra
  -- tab_lojas (mesmo padrão de app_criar_mesa, migration 122).
  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- ignora p_loja_id do cliente
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  v_comanda := upper(nullif(trim(coalesce(p_comanda, '')), ''));
  if v_comanda is null then
    raise exception 'comanda_obrigatoria';
  end if;

  -- Itens: mesmo contrato mínimo já exigido no client (cart/lista não
  -- pode ser vazio) — array JSON não vazio.
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios';
  end if;

  -- id gerado no servidor — mesmo formato de pub_criar_pedido (050+).
  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos (
    id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento,
    itens, loja_id, pagamento_forma, pagamento_momento, pagamento_troco_para
  ) values (
    v_id, v_mesa, v_comanda,
    coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Visitante'),
    nullif(trim(coalesce(p_cliente_telefone, '')), ''),
    'recebido',   -- status inicial: sempre server-side, browser não escolhe
    'aberto',     -- status_pagamento inicial: idem
    p_itens,
    v_loja,
    nullif(trim(coalesce(p_pagamento_forma, '')), ''),
    nullif(trim(coalesce(p_pagamento_momento, '')), ''),
    case when p_pagamento_troco_para > 0 then p_pagamento_troco_para else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_atualizar_status/3 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_atualizar_status(
  p_pedido_id            text,
  p_status                text,
  p_motivo_cancelamento   text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_pedido   public.tab_pedidos%rowtype;
  v_status   text;
  v_motivo   text;
  v_ids      text[];
  v_cap_ok   boolean;
  v_row      public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  -- Pedido localizado por id; tenant vem SEMPRE da linha existente
  -- (nunca de parâmetro do browser — esta RPC nem recebe p_loja_id).
  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is null or v_status not in ('recebido', 'preparando', 'finalizado', 'entregue', 'cancelado') then
    raise exception 'status_invalido';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo_cancelamento, '')), '');
  if v_status = 'cancelado' and v_motivo is null then
    raise exception 'motivo_cancelamento_obrigatorio';
  end if;

  -- State machine — fail-closed em transição fora do conjunto real.
  if not (
    (v_pedido.status = 'recebido'   and v_status in ('preparando', 'finalizado', 'cancelado'))
    or (v_pedido.status = 'preparando' and v_status in ('finalizado', 'cancelado'))
    or (v_pedido.status = 'finalizado' and v_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'transicao_status_invalida';
  end if;

  -- Autorização funcional server-side — matriz por transição.
  if not coalesce(v_caller.super_admin, false) then
    v_ids := coalesce(v_caller.ids_acesso, '{}'::text[]);
    if v_status = 'entregue' then
      v_cap_ok := 'kitchen' = any(v_ids) or 'cashier' = any(v_ids);
    elsif v_status = 'cancelado' then
      if v_pedido.status = 'finalizado' then
        v_cap_ok := 'kitchen' = any(v_ids);
      else
        v_cap_ok := 'kitchen' = any(v_ids) or 'tablet' = any(v_ids);
      end if;
    else
      v_cap_ok := 'kitchen' = any(v_ids);
    end if;

    if not v_cap_ok then
      raise exception 'forbidden';
    end if;
  end if;

  update public.tab_pedidos set
    status              = v_status,
    preparo_em          = case when v_status = 'preparando' then now() else preparo_em end,
    pronto_em           = case when v_status = 'finalizado' then now() else pronto_em end,
    motivo_cancelamento = case when v_status = 'cancelado' then v_motivo else motivo_cancelamento end
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_marcar_setor_pronto/3 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_marcar_setor_pronto(
  p_pedido_id           text,
  p_setor                text,
  p_setores_presentes    text[] default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email             text := public.app_caller_email();
  v_caller            public.tab_usuarios%rowtype;
  v_pedido            public.tab_pedidos%rowtype;
  v_setor             text;
  v_novo_setor_status jsonb;
  v_lista             text[];
  v_todos_prontos     boolean;
  v_novo_status       text;
  v_row               public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('kitchen' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_setor := nullif(trim(coalesce(p_setor, '')), '');
  if v_setor is null then
    raise exception 'setor_obrigatorio';
  end if;

  -- Merge server-side: { ...setor_status_atual, [setor]: 'ready' }.
  v_novo_setor_status := coalesce(v_pedido.setor_status, '{}'::jsonb) || jsonb_build_object(v_setor, 'ready');

  v_lista := case
    when p_setores_presentes is not null and array_length(p_setores_presentes, 1) > 0
    then p_setores_presentes
    else array[v_setor]
  end;

  select coalesce(bool_and(coalesce(v_novo_setor_status ->> s, '') = 'ready'), false)
    into v_todos_prontos
  from unnest(v_lista) as s;

  v_novo_status := case
    when v_todos_prontos then 'finalizado'
    when v_pedido.status = 'recebido' then 'preparando'
    else v_pedido.status
  end;

  -- State machine (subconjunto alcançável por este fluxo — nunca
  -- cancela nem entrega).
  if v_novo_status <> v_pedido.status then
    if not (
      (v_pedido.status = 'recebido'   and v_novo_status in ('preparando', 'finalizado'))
      or (v_pedido.status = 'preparando' and v_novo_status = 'finalizado')
    ) then
      raise exception 'transicao_status_invalida';
    end if;
  end if;

  update public.tab_pedidos set
    setor_status = v_novo_setor_status,
    status       = v_novo_status,
    pronto_em    = case when v_todos_prontos then now() else pronto_em end
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_atualizar_itens/2 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_atualizar_itens(
  p_pedido_id text,
  p_itens     jsonb
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens_invalidos';
  end if;

  update public.tab_pedidos set itens = p_itens
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_atualizar_cliente/3 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_atualizar_cliente(
  p_pedido_id        text,
  p_cliente           text,
  p_cliente_telefone  text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  update public.tab_pedidos set
    cliente          = coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Cliente'),
    cliente_telefone = nullif(trim(coalesce(p_cliente_telefone, '')), '')
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_transferir_mesa/2 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_transferir_mesa(
  p_pedido_id text,
  p_mesa       text
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_mesa   text;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  update public.tab_pedidos set mesa = v_mesa
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- app_pedido_solicitar_conta_mesa/2 (INTERNAL_ORDER) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_solicitar_conta_mesa(
  p_mesa      text,
  p_loja_id   bigint default null
)
returns setof public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email         text := public.app_caller_email();
  v_caller        public.tab_usuarios%rowtype;
  v_loja          bigint;
  v_mesa          text;
  v_pedido        public.tab_pedidos%rowtype;
  v_ids           text[] := '{}';
  v_total         integer := 0;
  v_nao_entregues integer := 0;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if not (
      'tablet' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
      or 'cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Tenant: NUNCA confia em p_loja_id do browser para não-super (mesmo
  -- padrão de app_criar_pedido — aqui não há uma linha de pedido já
  -- existente pra derivar o tenant, pois a busca é por mesa).
  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- ignora p_loja_id do cliente
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  -- Trava TODOS os pedidos elegíveis da mesa (mesmo filtro real de
  -- currentTableOrders: status_pagamento <> pago, status <> cancelado)
  -- na loja do caller — ninguém mais grava nessas linhas até o fim
  -- desta transação.
  for v_pedido in
    select * from public.tab_pedidos
    where mesa = v_mesa and loja_id = v_loja
      and status_pagamento <> 'pago' and status <> 'cancelado'
    order by id
    for update
  loop
    v_total := v_total + 1;
    v_ids := v_ids || v_pedido.id;
    if v_pedido.status <> 'entregue' then
      v_nao_entregues := v_nao_entregues + 1;
    end if;
  end loop;

  if v_total = 0 then
    raise exception 'nenhum_pedido_na_mesa';
  end if;

  -- Mesma invariável do frontend: TODOS os pedidos da mesa precisam
  -- estar entregues antes de qualquer um virar 'solicitado' — validado
  -- ANTES de qualquer UPDATE (zero atualização parcial).
  if v_nao_entregues > 0 then
    raise exception 'pedido_nao_entregue';
  end if;

  return query
    update public.tab_pedidos set status_pagamento = 'solicitado'
    where id = any(v_ids)
    returning *;
end;
$$;

-- app_pedido_marcar_pago/3 (INTERNAL_ORDER_CHECKOUT_CALLEE) — origem: 132_criar_pedido_autenticado_seguro.sql
create or replace function public.app_pedido_marcar_pago(
  p_pedido_id        text,
  p_pagamento_forma   text default null,
  p_status             text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_status text;
  v_forma  text;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  -- p_status restrito: só null (não altera) ou 'entregue' — nunca o
  -- enum inteiro de status, nunca status_pagamento.
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status <> 'entregue' then
    raise exception 'status_invalido';
  end if;
  if v_status = 'entregue' and v_pedido.status = 'cancelado' then
    raise exception 'transicao_status_invalida';
  end if;

  v_forma := nullif(trim(coalesce(p_pagamento_forma, '')), '');

  update public.tab_pedidos set
    status_pagamento = 'pago',
    pagamento_forma  = coalesce(v_forma, pagamento_forma),
    status           = coalesce(v_status, status)
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

-- pub_solicitar_conta/2 (PUBLIC_ORDER_BILL) — origem: 050_cardapio_publico.sql
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  update public.tab_pedidos set status_pagamento = 'solicitado'
   where loja_id = p_loja_id and comanda = p_comanda and status_pagamento = 'aberto';
end; $$;

-- pub_solicitar_conta/3 (PUBLIC_ORDER_BILL) — origem: 073_fidelidade_resgate.sql
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text, p_usar_pontos boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  update public.tab_pedidos
     set status_pagamento = 'solicitado',
         pagamento_forma = case when p_usar_pontos then 'Pontos (solicitado)' else pagamento_forma end
   where loja_id = p_loja_id and comanda = p_comanda and status_pagamento = 'aberto';
end; $$;

-- app_registrar_pagamento_v2/11 (PAYMENT) — origem: 118_pagamentos_v2.sql
create or replace function public.app_registrar_pagamento_v2(
  p_idempotency_key   uuid,
  p_alocacoes         jsonb,                 -- [{ "pedido_id": text, "valor": number }]
  p_valor_bruto       numeric,
  p_loja_id           bigint  default null,
  p_tipo              text    default 'manual',
  p_provider          text    default 'manual',
  p_forma_pagamento_id bigint default null,
  p_caixa_id          bigint  default null,
  p_valor_taxa        numeric default 0,
  p_metadata          jsonb   default '{}'::jsonb,
  p_registrar_caixa   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja        bigint;
  v_uid         bigint  := public.app_usuario_id();
  v_existente   public.pagamento_transacoes%rowtype;
  v_pag_id      uuid;
  v_status      text;
  v_liquido     numeric(14,2);
  v_soma        numeric(14,2) := 0;
  v_forma_label text;
  v_forma_loja  bigint;
  v_forma_ativo boolean;
  v_caixa_loja  bigint;
  v_caixa_status text;
  v_ids         text[] := '{}';
  v_seen        text[] := '{}';
  v_pid         text;
  v_vj          jsonb;
  v_val         numeric(14,2);
  a             jsonb;
  v_ped         record;
  v_total       numeric(14,2);
  v_pago        numeric(14,2);
  v_saldo       numeric(14,2);
  v_aloc        numeric(14,2);
  v_novo_saldo  numeric(14,2);
  v_encontrados int := 0;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  -- (1)(2) Loja resolvida NO SERVIDOR e autorizada.
  v_loja := coalesce(p_loja_id, public.app_loja_id());
  if v_loja is null then
    raise exception 'PAYMENT_V2_NO_TENANT: loja não resolvida (sessão sem loja).';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = v_loja) then
    raise exception 'PAYMENT_V2_LOJA_INEXISTENTE: loja % não existe.', v_loja;
  end if;
  if not public.app_pode_receber_pagamento(v_loja) then
    raise exception 'PAYMENT_V2_FORBIDDEN: usuário sem permissão para receber pagamento nesta loja.';
  end if;
  if p_idempotency_key is null then
    raise exception 'PAYMENT_V2_INVALID: idempotency_key obrigatória.';
  end if;

  -- (10) IDEMPOTÊNCIA CONCORRENTE: advisory lock por (loja, key) serializa duas
  --      chamadas simultâneas com a mesma chave — a 2ª espera e cai no SELECT.
  perform pg_advisory_xact_lock(hashtextextended(v_loja::text || ':' || p_idempotency_key::text, 0));

  -- (3)(4)(5-idem) Já existe? devolve SEM duplicar.
  select * into v_existente from public.pagamento_transacoes
    where loja_id = v_loja and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true,
      'id', v_existente.id, 'status', v_existente.status, 'loja_id', v_existente.loja_id,
      'valor_bruto', v_existente.valor_bruto, 'valor_liquido', v_existente.valor_liquido);
  end if;

  -- Valores.
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_bruto deve ser > 0.';
  end if;
  if coalesce(p_valor_taxa,0) < 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_taxa não pode ser negativo.';
  end if;
  v_liquido := round(p_valor_bruto - coalesce(p_valor_taxa,0), 2);
  if v_liquido < 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_liquido negativo (taxa > bruto).';
  end if;

  -- (16) Validação estrita do JSON ANTES de qualquer cast implícito.
  if p_alocacoes is null or jsonb_typeof(p_alocacoes) <> 'array' or jsonb_array_length(p_alocacoes) = 0 then
    raise exception 'PAYMENT_V2_INVALID: alocações ausentes ou não são um array.';
  end if;
  for a in select value from jsonb_array_elements(p_alocacoes) loop
    if jsonb_typeof(a) <> 'object' then
      raise exception 'PAYMENT_V2_INVALID: alocação não é objeto.';
    end if;
    v_pid := a->>'pedido_id';
    v_vj  := a->'valor';
    if v_pid is null or btrim(v_pid) = '' then
      raise exception 'PAYMENT_V2_INVALID: alocação sem pedido_id.';
    end if;
    if v_vj is null or jsonb_typeof(v_vj) <> 'number' then
      raise exception 'PAYMENT_V2_INVALID: valor de alocação inválido (não numérico).';
    end if;
    v_val := round((v_vj#>>'{}')::numeric, 2);
    if v_val <= 0 then
      raise exception 'PAYMENT_V2_INVALID: valor de alocação deve ser > 0.';
    end if;
    -- (9) sem pedido_id duplicado.
    if v_pid = any(v_seen) then
      raise exception 'PAYMENT_V2_INVALID: pedido_id duplicado nas alocações (%).', v_pid;
    end if;
    v_seen := array_append(v_seen, v_pid);
    v_ids  := array_append(v_ids, v_pid);
    v_soma := v_soma + v_val;
  end loop;

  -- (10-valor) Soma das alocações fecha com o valor pago.
  if round(v_soma,2) <> round(p_valor_bruto,2) then
    raise exception 'PAYMENT_V2_SOMA_INVALIDA: soma das alocações (%) != valor_bruto (%).', v_soma, p_valor_bruto;
  end if;

  -- (3-caixa) Caixa: valida ANTES de inserir (existe, mesma loja, aberto).
  if p_caixa_id is not null then
    select loja_id, status into v_caixa_loja, v_caixa_status
      from public.tab_caixas where id = p_caixa_id for update;
    if not found then
      raise exception 'PAYMENT_V2_CAIXA_INVALIDO: caixa % não existe.', p_caixa_id;
    end if;
    if v_caixa_loja is distinct from v_loja then
      raise exception 'PAYMENT_V2_CAIXA_CROSS_TENANT: caixa % não pertence à loja %.', p_caixa_id, v_loja;
    end if;
    if lower(coalesce(v_caixa_status,'')) <> 'aberto' then
      raise exception 'PAYMENT_V2_CAIXA_FECHADO: caixa % não está aberto.', p_caixa_id;
    end if;
  end if;

  -- (4-forma) Forma de pagamento: existe, ativa e (se tenant-specific) da loja.
  if p_forma_pagamento_id is not null then
    select loja_id, ativo, nome into v_forma_loja, v_forma_ativo, v_forma_label
      from public.tab_formas_pagamento where id = p_forma_pagamento_id;
    if not found then
      raise exception 'PAYMENT_V2_FORMA_INVALIDA: forma de pagamento % não existe.', p_forma_pagamento_id;
    end if;
    if v_forma_loja is not null and v_forma_loja is distinct from v_loja then
      raise exception 'PAYMENT_V2_FORMA_CROSS_TENANT: forma % não pertence à loja %.', p_forma_pagamento_id, v_loja;
    end if;
    if coalesce(v_forma_ativo, false) = false then
      raise exception 'PAYMENT_V2_FORMA_INATIVA: forma de pagamento % está inativa.', p_forma_pagamento_id;
    end if;
  end if;

  -- Status inicial: manual confirma na hora (PAID); demais nascem PENDING.
  v_status := case when lower(coalesce(p_provider,'manual')) = 'manual' then 'PAID' else 'PENDING' end;

  -- (12-insert) Transação. (15) timestamps coerentes com o estado.
  insert into public.pagamento_transacoes (
    loja_id, caixa_id, usuario_id, tipo, forma_pagamento_id,
    valor_bruto, valor_taxa, valor_liquido, status, provider,
    idempotency_key, metadata, processado_em, confirmado_em
  ) values (
    v_loja, p_caixa_id, v_uid, coalesce(p_tipo,'manual'), p_forma_pagamento_id,
    round(p_valor_bruto,2), round(coalesce(p_valor_taxa,0),2), v_liquido, v_status, coalesce(p_provider,'manual'),
    p_idempotency_key, coalesce(p_metadata,'{}'::jsonb),
    case when v_status in ('PROCESSING','AUTHORIZED','PAID') then now() else null end,
    case when v_status = 'PAID' then now() else null end
  )
  returning id into v_pag_id;

  -- (9-lock) Bloqueia os pedidos em ORDEM DETERMINÍSTICA (reduz deadlock).
  -- (6/8) Para cada pedido: valida tenant + não-cancelado; calcula saldo
  -- server-side (total canônico − já pago V2 em transações PAID) e rejeita
  -- pedido já quitado / alocação que exceda o saldo.
  for v_ped in
    select p.id, p.loja_id, p.status, p.itens
      from public.tab_pedidos p
      where p.id = any(v_ids)
      order by p.id
      for update
  loop
    v_encontrados := v_encontrados + 1;
    if v_ped.loja_id is distinct from v_loja then
      raise exception 'PAYMENT_V2_CROSS_TENANT: pedido % não pertence à loja %.', v_ped.id, v_loja;
    end if;
    if lower(coalesce(v_ped.status,'')) in ('cancelado','cancelled') then
      raise exception 'PAYMENT_V2_PEDIDO_CANCELADO: pedido % está cancelado.', v_ped.id;
    end if;

    v_total := public.app_pedido_valor_total(v_ped.itens);
    select coalesce(sum(al.valor),0) into v_pago
      from public.pagamento_alocacoes al
      join public.pagamento_transacoes t on t.id = al.pagamento_id
      where al.pedido_id = v_ped.id and al.loja_id = v_loja and t.status = 'PAID';
    v_saldo := round(v_total - v_pago, 2);

    -- valor desta alocação para ESTE pedido.
    select round((el->>'valor')::numeric, 2) into v_aloc
      from jsonb_array_elements(p_alocacoes) el
      where el->>'pedido_id' = v_ped.id limit 1;

    if v_total > 0 and v_pago >= v_total then
      raise exception 'PAYMENT_V2_PEDIDO_JA_PAGO: pedido % já está quitado.', v_ped.id;
    end if;
    if v_aloc > v_saldo then
      raise exception 'PAYMENT_V2_EXCEDE_SALDO: alocação (%) excede o saldo aberto (%) do pedido %.', v_aloc, v_saldo, v_ped.id;
    end if;

    -- (13-insert) Alocação.
    insert into public.pagamento_alocacoes (loja_id, pagamento_id, pedido_id, valor)
      values (v_loja, v_pag_id, v_ped.id, v_aloc);

    -- (7) PAGAMENTO PARCIAL: só marca 'pago' quando o saldo zera. Enquanto
    -- restar saldo, o pedido permanece operacionalmente não quitado (mantém
    -- o status_pagamento atual; NÃO cria status 'parcial' — o CHECK legado só
    -- admite aberto|solicitado|pago). A fonte da verdade do parcial é
    -- pagamento_alocacoes + pagamento_transacoes.
    if v_status = 'PAID' then
      v_novo_saldo := round(v_saldo - v_aloc, 2);
      if v_novo_saldo <= 0 then
        update public.tab_pedidos
          set status_pagamento = 'pago',
              pagamento_forma = coalesce(v_forma_label, pagamento_forma),
              atualizado_em = now()
          where id = v_ped.id and loja_id = v_loja;
      end if;
    end if;
  end loop;

  -- (8-existência) Todo pedido informado precisa existir (senão sua alocação
  -- nunca seria validada/inserida, apesar de contar na soma).
  if v_encontrados <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'PAYMENT_V2_PEDIDO_INEXISTENTE: um ou mais pedidos informados não existem.';
  end if;

  -- (11) Trilha append-only cronológica: CREATED (null→PENDING) e, quando
  -- confirmado agora, PAID (PENDING→PAID).
  insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
    values (v_loja, v_pag_id, 'CREATED', null, 'PENDING', v_uid, coalesce(p_provider,'manual'),
            jsonb_build_object('valor_bruto', p_valor_bruto, 'alocacoes', p_alocacoes));
  if v_status = 'PAID' then
    insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
      values (v_loja, v_pag_id, 'PAID', 'PENDING', 'PAID', v_uid, coalesce(p_provider,'manual'), '{}'::jsonb);
  end if;

  -- (16-caixa) Movimento de caixa (já validado acima; só quando confirmado).
  if p_registrar_caixa and p_caixa_id is not null and v_status = 'PAID' then
    insert into public.tab_caixa_mov (caixa_id, loja_id, tipo, valor, forma_pagamento_id, descricao, usuario_id)
      values (p_caixa_id, v_loja, 'venda', round(p_valor_bruto,2), p_forma_pagamento_id,
              'Pagamento V2 ' || v_pag_id::text, v_uid);
  end if;

  return jsonb_build_object('ok', true, 'idempotente', false,
    'id', v_pag_id, 'status', v_status, 'loja_id', v_loja,
    'valor_bruto', round(p_valor_bruto,2), 'valor_liquido', v_liquido,
    'qtd_alocacoes', jsonb_array_length(p_alocacoes));

exception
  -- (10-safety) Rede de segurança da idempotência: se, apesar do advisory
  -- lock, duas transações inserirem a mesma (loja, key), a UNIQUE dispara e
  -- aqui devolvemos a transação existente (sem erro técnico ao usuário).
  when unique_violation then
    select * into v_existente from public.pagamento_transacoes
      where loja_id = v_loja and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'idempotente', true,
        'id', v_existente.id, 'status', v_existente.status, 'loja_id', v_existente.loja_id,
        'valor_bruto', v_existente.valor_bruto, 'valor_liquido', v_existente.valor_liquido);
    end if;
    raise;
end;
$$;

-- cupom_consumir/7 (COUPON) — origem: 075_cupons.sql
create or replace function public.cupom_consumir(
  p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric,
  p_mesa text default null, p_comandas text[] default null, p_cliente_telefone text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
     and (inicio_em is null or now() >= inicio_em)
     and (fim_em is null or now() <= fim_em)
     and (quantidade_total is null or quantidade_usada < quantidade_total)
  returning * into c;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;

  insert into public.tab_cupom_usos
    (cupom_id, loja_id, codigo, mesa, comandas, valor_conta, valor_desconto, cliente_telefone)
  values
    (c.id, coalesce(p_loja_id, c.loja_id), c.codigo, p_mesa, p_comandas,
     coalesce(p_valor_conta, 0), coalesce(p_valor_desconto, 0),
     nullif(regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g'), ''));

  return json_build_object('ok', true, 'codigo', c.codigo,
    'restantes', case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end);
end; $$;

-- cupom_consumir/8 (COUPON_CHECKOUT_CALLEE) — origem: 076_cupons_canal_horario.sql
create or replace function public.cupom_consumir(
  p_cupom_id bigint,
  p_loja_id bigint,
  p_valor_conta numeric,
  p_valor_desconto numeric,
  p_mesa text default null,
  p_comandas text[] default null,
  p_cliente_telefone text default null,
  p_canal text default 'interno'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
  v_canal text := lower(trim(coalesce(nullif(p_canal, ''), 'interno')));
  v_hora time;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
  if v_canal not in ('interno', 'externo') then
    v_canal := 'interno';
  end if;

  select * into c from public.tab_cupons where id = p_cupom_id;
  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'motivo', 'Cupom inválido — desativado.');
  end if;
  if coalesce(c.canal, 'ambos') = 'interno' and v_canal = 'externo' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para consumo interno (mesa).');
  end if;
  if coalesce(c.canal, 'ambos') = 'externo' and v_canal = 'interno' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para pedidos externos (delivery).');
  end if;
  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — ainda não vigora.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — cupom expirado.');
  end if;

  v_hora := (timezone('America/Sao_Paulo', now()))::time;
  if c.hora_inicio is not null and c.hora_fim is not null then
    if c.hora_inicio <= c.hora_fim then
      if v_hora < c.hora_inicio or v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    else
      if v_hora < c.hora_inicio and v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    end if;
  elsif c.hora_inicio is not null and v_hora < c.hora_inicio then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  elsif c.hora_fim is not null and v_hora > c.hora_fim then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  end if;

  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
     and (quantidade_total is null or quantidade_usada < quantidade_total)
  returning * into c;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;

  insert into public.tab_cupom_usos
    (cupom_id, loja_id, codigo, mesa, comandas, valor_conta, valor_desconto, cliente_telefone)
  values
    (c.id, coalesce(p_loja_id, c.loja_id), c.codigo, p_mesa, p_comandas,
     coalesce(p_valor_conta, 0), coalesce(p_valor_desconto, 0),
     nullif(regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g'), ''));

  return json_build_object('ok', true, 'codigo', c.codigo,
    'restantes', case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end);
end; $$;

-- app_admin_criar_usuario/3 (USER_ADMIN_MUTATION) — origem: 112_hash_senhas.sql
create or replace function public.app_admin_criar_usuario(
  p_admin_email text, p_admin_senha text, p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.tab_usuarios%rowtype;
  r public.tab_usuarios%rowtype;
  v_email text;
  v_senha text;
  v_loja bigint;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  admin := public.app_admin_autenticado(p_admin_email, p_admin_senha);
  if admin is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Admin não autorizado.');
  end if;

  v_email := lower(trim(coalesce(p_dados->>'email', '')));
  v_senha := coalesce(p_dados->>'senha', '');
  v_loja := nullif(p_dados->>'loja_id', '')::bigint;
  if coalesce(admin.super_admin, false) = false then
    v_loja := admin.loja_id;
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'E-mail inválido.');
  end if;
  if length(v_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;
  if v_loja is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Informe a empresa do usuário.');
  end if;

  insert into public.tab_usuarios (
    nome, email, senha_hash, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email),
    v_email,
    crypt(v_senha, gen_salt('bf', 10)),
    coalesce(nullif(trim(p_dados->>'perfil'), ''), 'Operador'),
    coalesce((p_dados->>'ativo')::boolean, true),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'ids_acesso', '[]'::jsonb)) as t(x)),
      '{}'::text[]
    ),
    v_loja,
    nullif(p_dados->>'cargo_id', '')::bigint,
    coalesce(p_dados->'permissoes_acoes', '{}'::jsonb)
  )
  returning * into r;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;

-- app_admin_salvar_usuario/4 (USER_ADMIN_MUTATION) — origem: 112_hash_senhas.sql
create or replace function public.app_admin_salvar_usuario(
  p_admin_email text, p_admin_senha text, p_usuario_id bigint, p_campos jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.tab_usuarios%rowtype;
  r public.tab_usuarios%rowtype;
  v_nova_senha text;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  admin := public.app_admin_autenticado(p_admin_email, p_admin_senha);
  if admin is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Admin não autorizado.');
  end if;
  if p_usuario_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'ID inválido.');
  end if;

  select * into r from public.tab_usuarios where id = p_usuario_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Usuário não encontrado.');
  end if;

  if coalesce(admin.super_admin, false) = false
     and (r.loja_id is null or r.loja_id is distinct from admin.loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível editar usuários da sua empresa.');
  end if;

  v_nova_senha := nullif(p_campos->>'senha', '');
  if v_nova_senha is not null and length(v_nova_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;

  update public.tab_usuarios u set
    nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
    email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
    senha_hash = case when v_nova_senha is not null then crypt(v_nova_senha, gen_salt('bf', 10)) else u.senha_hash end,
    perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
    ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
    ids_acesso = case
      when p_campos ? 'ids_acesso' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
        '{}'::text[]
      ) else u.ids_acesso end,
    cargo_id = case
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is null then null
      else u.cargo_id end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes end
  where u.id = p_usuario_id
  returning * into r;

  -- Confirma a gravação do hash SEM devolvê-lo.
  if v_nova_senha is not null
     and (r.senha_hash is null or r.senha_hash <> crypt(v_nova_senha, r.senha_hash)) then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;

-- app_criar_usuario/1 (USER_ADMIN_MUTATION) — origem: 112_hash_senhas.sql
create or replace function public.app_criar_usuario(p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_op_loja bigint;
  v_op_super boolean;
  v_loja bigint;
  v_senha text;
  v_email_novo text;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'error', 'Faça login novamente.');
  end if;

  select u.loja_id, coalesce(u.super_admin, false) into v_op_loja, v_op_super
  from public.tab_usuarios u
  where lower(u.email) = v_email and coalesce(u.ativo, true) = true
  limit 1;

  if not found or (not v_op_super and not exists (
    select 1 from public.tab_usuarios u2
    where lower(u2.email) = v_email and 'admin' = any(coalesce(u2.ids_acesso, '{}'::text[]))
  )) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Sem permissão administrativa.');
  end if;

  v_email_novo := lower(trim(coalesce(p_dados->>'email', '')));
  v_senha := coalesce(p_dados->>'senha', '');
  v_loja := nullif(p_dados->>'loja_id', '')::bigint;
  if not v_op_super then
    v_loja := v_op_loja;
  end if;

  if v_email_novo = '' or position('@' in v_email_novo) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'E-mail inválido.');
  end if;
  if length(v_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;
  if v_loja is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Informe a empresa do usuário.');
  end if;
  if not v_op_super and v_loja is distinct from v_op_loja then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível cadastrar usuários da sua empresa.');
  end if;

  insert into public.tab_usuarios (
    nome, email, senha_hash, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email_novo),
    v_email_novo,
    crypt(v_senha, gen_salt('bf', 10)),
    coalesce(nullif(trim(p_dados->>'perfil'), ''), 'Operador'),
    coalesce((p_dados->>'ativo')::boolean, true),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'ids_acesso', '[]'::jsonb)) as t(x)),
      '{}'::text[]
    ),
    v_loja,
    nullif(p_dados->>'cargo_id', '')::bigint,
    coalesce(p_dados->'permissoes_acoes', '{}'::jsonb)
  )
  returning * into r;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;

-- app_definir_senha_hash/2 (USER_ADMIN_MUTATION) — origem: 112_hash_senhas.sql
create or replace function public.app_definir_senha_hash(p_id bigint, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if p_id is null or p_senha is null or length(p_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;
  update public.tab_usuarios
     set senha_hash = crypt(p_senha, gen_salt('bf', 10))
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- app_salvar_usuario/2 (USER_ADMIN_MUTATION) — origem: 112_hash_senhas.sql
create or replace function public.app_salvar_usuario(p_id bigint, p_campos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_loja bigint;
  v_op_loja bigint;
  v_op_super boolean;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if p_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'ID inválido.');
  end if;
  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'error', 'Faça login novamente.');
  end if;

  select u.loja_id, coalesce(u.super_admin, false) into v_op_loja, v_op_super
  from public.tab_usuarios u
  where lower(u.email) = v_email and coalesce(u.ativo, true) = true
  limit 1;

  if not found or (not v_op_super and not exists (
    select 1 from public.tab_usuarios u2
    where lower(u2.email) = v_email and 'admin' = any(coalesce(u2.ids_acesso, '{}'::text[]))
  )) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Sem permissão administrativa.');
  end if;

  select * into r from public.tab_usuarios where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Usuário não encontrado.');
  end if;

  v_loja := r.loja_id;
  if not v_op_super and (v_loja is null or v_loja is distinct from v_op_loja) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível editar usuários da sua empresa.');
  end if;

  update public.tab_usuarios u set
    nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
    email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
    senha_hash = case when p_campos ? 'senha' and nullif(p_campos->>'senha', '') is not null
                      then crypt(p_campos->>'senha', gen_salt('bf', 10)) else u.senha_hash end,
    perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
    ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
    ids_acesso = case
      when p_campos ? 'ids_acesso' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
        '{}'::text[]
      ) else u.ids_acesso end,
    cargo_id = case
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is null then null
      else u.cargo_id end,
    loja_id = case
      when p_campos ? 'loja_id' and nullif(p_campos->>'loja_id', '') is not null then (p_campos->>'loja_id')::bigint
      else u.loja_id end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes end
  where u.id = p_id
  returning * into r;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;

-- app_baixar_estoque_produto/2 (STOCK) — origem: 124_catalogo_admin_seguro.sql
create or replace function public.app_baixar_estoque_produto(p_loja_id bigint, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_loja      bigint;
  v_item      jsonb;
  v_nome      text;
  v_qtd       numeric;
  v_produto   public.tab_produtos%rowtype;
  v_antes     integer;
  v_depois    integer;
  v_minimo    integer;
  v_movimentos jsonb := '[]'::jsonb;
  v_alertas    jsonb := '[]'::jsonb;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  -- OPERACIONAL: baixa de estoque acontece na confirmação de pagamento
  -- (fluxo normal de caixa/PDV), não é ação de cadastro — não exige
  -- v_admin, só sessão válida e loja resolvida (mesmo critério de
  -- app_listar_mesas/app_listar_categorias).
  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('movimentos', '[]'::jsonb, 'alertas', '[]'::jsonb);
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome := v_item->>'nome';
    v_qtd  := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_nome is null or v_qtd <= 0 then
      continue;
    end if;

    select * into v_produto
    from public.tab_produtos
    where loja_id = v_loja and nome = v_nome
    limit 1;

    if not found then
      continue; -- produto não encontrado na loja: ignora silenciosamente (mesmo comportamento atual)
    end if;

    v_antes  := coalesce(v_produto.estoque, 0);
    v_depois := greatest(0, v_antes - v_qtd::integer);
    v_minimo := coalesce(v_produto.estoque_minimo, 0);

    update public.tab_produtos set estoque = v_depois where id = v_produto.id;

    v_movimentos := v_movimentos || jsonb_build_object(
      'loja_id', v_loja, 'produto_id', v_produto.id, 'produto_nome', v_nome,
      'quantidade', v_qtd, 'estoque_antes', v_antes, 'estoque_depois', v_depois
    );

    if v_depois <= 0 then
      v_alertas := v_alertas || jsonb_build_object('nome', v_nome, 'estoque', v_depois, 'minimo', v_minimo, 'zerado', true);
    elsif v_minimo > 0 and v_depois <= v_minimo then
      v_alertas := v_alertas || jsonb_build_object('nome', v_nome, 'estoque', v_depois, 'minimo', v_minimo, 'zerado', false);
    end if;
  end loop;

  -- Registro em tab_estoque_mov é auditoria best-effort (mesma tolerância
  -- do try/catch já existente no frontend) — nunca derruba a baixa de
  -- estoque em si, que já foi commitada acima nesta mesma transação.
  begin
    if jsonb_array_length(v_movimentos) > 0 then
      insert into public.tab_estoque_mov (loja_id, produto_id, produto_nome, quantidade, estoque_antes, estoque_depois)
      select
        (m->>'loja_id')::bigint, (m->>'produto_id')::bigint, m->>'produto_nome',
        (m->>'quantidade')::numeric, (m->>'estoque_antes')::integer, (m->>'estoque_depois')::integer
      from jsonb_array_elements(v_movimentos) as m;
    end if;
  exception when others then
    null; -- tolerante: tab_estoque_mov é histórico, não pode quebrar a baixa de estoque
  end;

  return jsonb_build_object('movimentos', v_movimentos, 'alertas', v_alertas);
end;
$$;

-- app_criar_categoria/5 (CATALOG_ONBOARDING_CALLEE) — origem: 124_catalogo_admin_seguro.sql
create or replace function public.app_criar_categoria(
  p_loja_id       bigint,
  p_nome          text,
  p_setor_id      bigint default null,
  p_impressora_id bigint default null,
  p_ordem         integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_loja   bigint;
  v_nome   text;
  c public.tab_categorias%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'categoria_nome_invalido';
  end if;

  -- p_ordem é OPCIONAL (default null → coluna usa seu próprio default, 0,
  -- migration 010 — comportamento idêntico ao que já existia antes deste
  -- parâmetro para todo call site que não o informa, ex.: inserirCategoria()
  -- do formulário "Nova categoria"). Só cadastrarEmpresa() passa um valor
  -- explícito (1..5, para preservar a ordem sequencial do seed padrão).
  -- Validação server-side: não aceita negativo (ordem é posição de exibição).
  if p_ordem is not null and p_ordem < 0 then
    raise exception 'categoria_ordem_invalida';
  end if;

  -- Hardening 124.4: setor_id/impressora_id são FKs tenant-specific
  -- (tab_setores_cozinha/tab_impressoras têm loja_id) — sem esta checagem,
  -- uma loja poderia vincular categoria a setor/impressora de OUTRA loja.
  if p_setor_id is not null and not exists (
    select 1 from public.tab_setores_cozinha s where s.id = p_setor_id and s.loja_id = v_loja
  ) then
    raise exception 'setor_invalido';
  end if;

  if p_impressora_id is not null and not exists (
    select 1 from public.tab_impressoras i where i.id = p_impressora_id and i.loja_id = v_loja
  ) then
    raise exception 'impressora_invalida';
  end if;

  begin
    insert into public.tab_categorias (nome, loja_id, setor_id, impressora_id, ordem)
    values (v_nome, v_loja, p_setor_id, p_impressora_id, coalesce(p_ordem, 0))
    returning * into c;
  exception when unique_violation then
    raise exception 'categoria_nome_duplicado';
  end;

  return jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
    'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
  );
end;
$$;

-- app_criar_loja/7 (TENANT_ONBOARDING_CALLEE) — origem: 124_catalogo_admin_seguro.sql
create or replace function public.app_criar_loja(
  p_nome              text,
  p_prefixo           text,
  p_plano             text default 'free',
  p_email_responsavel text default null,
  p_documento         text default null,
  p_modo_uso          text default 'interno',
  p_logo_url          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_nome   text;
  v_prefixo text;
  l public.tab_lojas%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  v_prefixo := upper(trim(coalesce(p_prefixo, '')));
  if v_nome = '' then
    raise exception 'loja_nome_invalido';
  end if;
  if v_prefixo = '' then
    raise exception 'loja_prefixo_invalido';
  end if;

  begin
    insert into public.tab_lojas (nome, prefixo, plano, email_responsavel, documento, modo_uso, logo_url)
    values (v_nome, v_prefixo, coalesce(nullif(p_plano, ''), 'free'), p_email_responsavel, p_documento, coalesce(nullif(p_modo_uso, ''), 'interno'), p_logo_url)
    returning * into l;
  exception when unique_violation then
    raise exception 'loja_prefixo_duplicado';
  end;

  return jsonb_build_object(
    'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo, 'plano', l.plano,
    'email_responsavel', l.email_responsavel, 'documento', l.documento, 'modo_uso', l.modo_uso, 'logo_url', l.logo_url
  );
end;
$$;

-- app_reservar_numero_nfce/1 (NFCE_EMISSION) — origem: 117_nfce_emissao_simulada.sql
create or replace function public.app_reservar_numero_nfce(p_loja_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.loja_fiscal_emitente%rowtype;
  v_num integer;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_row from public.loja_fiscal_emitente
    where loja_id = p_loja_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SEM_EMITENTE');
  end if;

  v_num := coalesce(v_row.nfce_prox_numero, 1);
  update public.loja_fiscal_emitente
    set nfce_prox_numero = v_num + 1, atualizado_em = now()
    where loja_id = p_loja_id;

  return jsonb_build_object(
    'ok', true, 'numero', v_num,
    'serie', coalesce(v_row.nfce_serie, 1),
    'ambiente', coalesce(v_row.nfce_ambiente, 'simulacao')
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  19) WRITE FENCE — triggers de tabela (statement-level BEFORE
--      INSERT/UPDATE/DELETE) nas tabelas SEM escritor registrado.
--      TRUNCATE não é coberto por trigger (privilégio já revogado
--      de anon/authenticated na migration 131; o probe reporta).
-- ════════════════════════════════════════════════════════════
create trigger aaa_maintenance_guard_tab_cargos
  before insert or update or delete on public.tab_cargos
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_leads
  before insert or update or delete on public.tab_leads
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_chamados
  before insert or update or delete on public.tab_chamados
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_pesquisa_satisfacao
  before insert or update or delete on public.tab_pesquisa_satisfacao
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_clientes
  before insert or update or delete on public.tab_clientes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_dispositivos
  before insert or update or delete on public.tab_dispositivos
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_dispositivos_bloqueados
  before insert or update or delete on public.tab_dispositivos_bloqueados
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_loja_fiscal_nfce
  before insert or update or delete on public.loja_fiscal_nfce
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_pagamento_transacoes
  before insert or update or delete on public.pagamento_transacoes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_pagamento_alocacoes
  before insert or update or delete on public.pagamento_alocacoes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_pagamento_eventos
  before insert or update or delete on public.pagamento_eventos
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_regra
  before insert or update or delete on public.fiscal_regra
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_regra_versao
  before insert or update or delete on public.fiscal_regra_versao
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_loja_fiscal_regra
  before insert or update or delete on public.loja_fiscal_regra
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_template
  before insert or update or delete on public.fiscal_template
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_template_regra
  before insert or update or delete on public.fiscal_template_regra
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_ncm
  before insert or update or delete on public.fiscal_catalogo_ncm
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_cest
  before insert or update or delete on public.fiscal_catalogo_cest
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_cfop
  before insert or update or delete on public.fiscal_catalogo_cfop
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_cst_icms
  before insert or update or delete on public.fiscal_catalogo_cst_icms
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_csosn
  before insert or update or delete on public.fiscal_catalogo_csosn
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_cst_pis
  before insert or update or delete on public.fiscal_catalogo_cst_pis
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_fiscal_catalogo_cst_cofins
  before insert or update or delete on public.fiscal_catalogo_cst_cofins
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_loja_fiscal_emitente
  before insert or update or delete on public.loja_fiscal_emitente
  for each statement
  execute function public.app_maintenance_business_write_registry_trigger();

-- ════════════════════════════════════════════════════════════
--  20) PROBE READ-ONLY DE COBERTURA DO WRITE FENCE (catálogo)
--      STABLE (o Postgres proíbe DML em função não-volátil).
--      Não devolve segredos. O manifesto é versionado e tem hash
--      determinístico; drift de assinatura/corpo/guard/ACL, função
--      escritora não classificada e privilégio direto de escrita
--      tornam a cobertura INCOMPLETA (fail-closed).
-- ════════════════════════════════════════════════════════════
create function public.app_db_release_write_coverage_probe()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manifest constant jsonb := $manifest${"version":"WFC-2","entries":[{"id":"CORE:app_assert_business_write_allowed/2","kind":"CORE","name":"app_assert_business_write_allowed","signature":"uuid, text","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"f284b560cd4185e127f169b22c193a2b","origin":"160"},{"id":"CORE:app_assert_business_write_allowed_registry_callee_internal/0","kind":"CORE","name":"app_assert_business_write_allowed_registry_callee_internal","signature":"","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"72bed2abe59d6b31ac78763a96d9625f","origin":"162"},{"id":"CORE:app_maintenance_business_write_registry_trigger/0","kind":"CORE","name":"app_maintenance_business_write_registry_trigger","signature":"","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"7c30391e7791bf9f3a407e0d891b9eac","origin":"162"},{"id":"CORE:app_maintenance_business_write_trigger/0","kind":"CORE","name":"app_maintenance_business_write_trigger","signature":"","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"3a043468bb7a368f2136bcbf9fe112dd","origin":"144"},{"id":"CORE:app_maintenance_cutover_barrier_internal/1","kind":"CORE","name":"app_maintenance_cutover_barrier_internal","signature":"boolean","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"047ebd6b8c5f7c2d611078c79259bef7","origin":"155"},{"id":"CORE:app_maintenance_operation_begin_internal/1","kind":"CORE","name":"app_maintenance_operation_begin_internal","signature":"text","guard":"NONE","family":"GUARD_CORE","classification":"GUARD_CORE","guardStatement":null,"md5":"355a3ea0a38096fa6ae9f00291c189a6","origin":"155"},{"id":"RPC:app_admin_criar_usuario/3","kind":"RPC","name":"app_admin_criar_usuario","signature":"text, text, jsonb","guard":"PLAIN","family":"USER_ADMIN_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"a270bf43df9ea5660a98de8abba9e3f2","origin":"162"},{"id":"RPC:app_admin_salvar_usuario/4","kind":"RPC","name":"app_admin_salvar_usuario","signature":"text, text, bigint, jsonb","guard":"PLAIN","family":"USER_ADMIN_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"83c1e0bb81a8a9df219c839dc67f02d6","origin":"162"},{"id":"RPC:app_atualizar_categoria/2","kind":"RPC","name":"app_atualizar_categoria","signature":"bigint, jsonb","guard":"PRE_EXISTING","family":"MIG143_ADMIN_ALLOWLIST","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"4564c1f783c8de3dce412d429d67fd42","origin":"143"},{"id":"RPC:app_atualizar_cupom/13","kind":"RPC","name":"app_atualizar_cupom","signature":"bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time","guard":"PRE_EXISTING","family":"MIG145_CUPONS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"2c923c07d35459ae8a41fbd1011026b0","origin":"145"},{"id":"RPC:app_atualizar_loja/2","kind":"RPC","name":"app_atualizar_loja","signature":"bigint, jsonb","guard":"PRE_EXISTING","family":"MIG147_ADMIN_FINAL","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"cc9b746b0330781b4e1be41d423f05c1","origin":"147"},{"id":"RPC:app_atualizar_mesa/9","kind":"RPC","name":"app_atualizar_mesa","signature":"bigint, integer, text, integer, text, text, boolean, boolean, boolean","guard":"PRE_EXISTING","family":"MIG143_ADMIN_ALLOWLIST","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"bc349c3460a1c9991b1c9d2c7108f265","origin":"143"},{"id":"RPC:app_atualizar_produto/2","kind":"RPC","name":"app_atualizar_produto","signature":"bigint, jsonb","guard":"PRE_EXISTING","family":"MIG146_PRODUTOS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"6935eab87ace6af2f0631cb67c9556d2","origin":"146"},{"id":"RPC:app_atualizar_produtos_fiscal_lote/3","kind":"RPC","name":"app_atualizar_produtos_fiscal_lote","signature":"bigint, bigint[], jsonb","guard":"PRE_EXISTING","family":"FISCAL_RULE_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"3c038ef5f93900dbe888c0fe77402c7e","origin":"146"},{"id":"RPC:app_baixar_estoque_produto/2","kind":"RPC","name":"app_baixar_estoque_produto","signature":"bigint, jsonb","guard":"PLAIN","family":"STOCK","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"8b653ed6b281a8b9f4bf50581ff16433","origin":"162"},{"id":"RPC:app_checkout_begin/2","kind":"RPC","name":"app_checkout_begin","signature":"bigint, text[]","guard":"REGISTRY_OPERATION","family":"OP_CHECKOUT","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"v_operation_id := public.app_maintenance_operation_begin_internal('checkout');","md5":"c396e77fe3fb05b882be9cda91811401","origin":"155"},{"id":"RPC:app_checkout_commit/2","kind":"RPC","name":"app_checkout_commit","signature":"uuid, jsonb","guard":"REGISTRY_OPERATION","family":"OP_CHECKOUT","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(p_operation_id, 'checkout');","md5":"8353a2c135f9d2076bf8a8f5731a7439","origin":"152"},{"id":"RPC:app_criar_categoria/5","kind":"RPC","name":"app_criar_categoria","signature":"bigint, text, bigint, bigint, integer","guard":"CALLEE","family":"CATALOG_ONBOARDING_CALLEE","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed_registry_callee_internal();","md5":"c88b836d176caaa3c8186e8bd1497a84","origin":"162"},{"id":"RPC:app_criar_cupom/13","kind":"RPC","name":"app_criar_cupom","signature":"bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time","guard":"PRE_EXISTING","family":"MIG145_CUPONS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"fd6fff60a3816cff99cb9a72fa779c70","origin":"145"},{"id":"RPC:app_criar_loja/7","kind":"RPC","name":"app_criar_loja","signature":"text, text, text, text, text, text, text","guard":"CALLEE","family":"TENANT_ONBOARDING_CALLEE","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed_registry_callee_internal();","md5":"1aed5b7ef40319099b76a53bcfdc917e","origin":"162"},{"id":"RPC:app_criar_mesa/8","kind":"RPC","name":"app_criar_mesa","signature":"bigint, integer, text, integer, text, text, boolean, boolean","guard":"PRE_EXISTING","family":"MIG143_ADMIN_ALLOWLIST","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"99f83d3cd5935b90e9fb7b1bbe21c3bd","origin":"143"},{"id":"RPC:app_criar_pedido/9","kind":"RPC","name":"app_criar_pedido","signature":"text, text, jsonb, text, text, text, text, numeric, bigint","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"f812a399bf0d5e34501776fb1c3f7076","origin":"162"},{"id":"RPC:app_criar_produto/2","kind":"RPC","name":"app_criar_produto","signature":"bigint, jsonb","guard":"PRE_EXISTING","family":"MIG146_PRODUTOS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"103f40ade55e27a25ce0d2b5c549101f","origin":"146"},{"id":"RPC:app_criar_usuario/1","kind":"RPC","name":"app_criar_usuario","signature":"jsonb","guard":"PLAIN","family":"USER_ADMIN_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"7c4ec4a4e8968fe773fb9a0ae2d34cdd","origin":"162"},{"id":"RPC:app_definir_senha_hash/2","kind":"RPC","name":"app_definir_senha_hash","signature":"bigint, text","guard":"PLAIN","family":"USER_ADMIN_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"4b1072a507391470b9761ad131cbfbe5","origin":"162"},{"id":"RPC:app_dispositivo_registrar/8","kind":"RPC","name":"app_dispositivo_registrar","signature":"text, text, text, text, boolean, text, bigint, uuid","guard":"PRE_EXISTING","family":"MIG148_DEVICE_HEARTBEAT","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"ce42c19bb024796cc6af1ab7cbe4113d","origin":"148"},{"id":"RPC:app_evento_acesso_excluir/1","kind":"RPC","name":"app_evento_acesso_excluir","signature":"uuid","guard":"PRE_EXISTING","family":"MIG147_ADMIN_FINAL","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"5e9b50382301318fbc46021aa1686ce4","origin":"147"},{"id":"RPC:app_excluir_categoria/1","kind":"RPC","name":"app_excluir_categoria","signature":"bigint","guard":"PRE_EXISTING","family":"MIG143_ADMIN_ALLOWLIST","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"df52aada3d36ced72bbe5931485978ba","origin":"143"},{"id":"RPC:app_excluir_cupom/1","kind":"RPC","name":"app_excluir_cupom","signature":"bigint","guard":"PRE_EXISTING","family":"MIG145_CUPONS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"c5031f2f45466f0bf4f538f661fcd496","origin":"145"},{"id":"RPC:app_excluir_produto/1","kind":"RPC","name":"app_excluir_produto","signature":"bigint","guard":"PRE_EXISTING","family":"MIG146_PRODUTOS","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"b049cedd29a91b3ce4f057cc7e2dddb9","origin":"146"},{"id":"RPC:app_onboarding_criar_categoria/6","kind":"RPC","name":"app_onboarding_criar_categoria","signature":"uuid, bigint, text, bigint, bigint, integer","guard":"REGISTRY_OPERATION","family":"OP_ONBOARDING","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');","md5":"beb02949662d79032df0b1c7549e64b0","origin":"151"},{"id":"RPC:app_onboarding_criar_loja/7","kind":"RPC","name":"app_onboarding_criar_loja","signature":"text, text, text, text, text, text, text","guard":"REGISTRY_OPERATION","family":"OP_ONBOARDING","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"v_operation_id := public.app_maintenance_operation_begin_internal('onboarding');","md5":"4f87f47a7bb03c01bd53c751505f5688","origin":"151"},{"id":"RPC:app_onboarding_salvar_emitente/3","kind":"RPC","name":"app_onboarding_salvar_emitente","signature":"uuid, bigint, jsonb","guard":"REGISTRY_OPERATION","family":"OP_ONBOARDING","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');","md5":"93c2c2e7956d1fa9599aab280d1b2cec","origin":"151"},{"id":"RPC:app_onboarding_seed_formas_pagamento/2","kind":"RPC","name":"app_onboarding_seed_formas_pagamento","signature":"uuid, bigint","guard":"REGISTRY_OPERATION","family":"OP_ONBOARDING","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');","md5":"9dc5c8b7c21112be1a188f187e2fc2e5","origin":"151"},{"id":"RPC:app_pedido_atualizar_cliente/3","kind":"RPC","name":"app_pedido_atualizar_cliente","signature":"text, text, text","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"90ec8ecb342fb931f53981c495b4e2f8","origin":"162"},{"id":"RPC:app_pedido_atualizar_itens/2","kind":"RPC","name":"app_pedido_atualizar_itens","signature":"text, jsonb","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"ff7f3bcfdcf38b73c3cc6efa4e817e72","origin":"162"},{"id":"RPC:app_pedido_atualizar_status/3","kind":"RPC","name":"app_pedido_atualizar_status","signature":"text, text, text","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"29bdf9ebe845cb0c4e1596383a87549d","origin":"162"},{"id":"RPC:app_pedido_marcar_pago/3","kind":"RPC","name":"app_pedido_marcar_pago","signature":"text, text, text","guard":"CALLEE","family":"INTERNAL_ORDER_CHECKOUT_CALLEE","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed_registry_callee_internal();","md5":"c112efa643dfe11a364fe5660987879e","origin":"162"},{"id":"RPC:app_pedido_marcar_setor_pronto/3","kind":"RPC","name":"app_pedido_marcar_setor_pronto","signature":"text, text, text[]","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"ab9e85367c00dcc17dd3ee4ac25f6b98","origin":"162"},{"id":"RPC:app_pedido_solicitar_conta_mesa/2","kind":"RPC","name":"app_pedido_solicitar_conta_mesa","signature":"text, bigint","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"ec268594b4fa62642e1c0a9914b4e140","origin":"162"},{"id":"RPC:app_pedido_transferir_mesa/2","kind":"RPC","name":"app_pedido_transferir_mesa","signature":"text, text","guard":"PLAIN","family":"INTERNAL_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"86ff3ab2f216ce1e4991b6d6260ac0c7","origin":"162"},{"id":"RPC:app_registrar_pagamento_v2/11","kind":"RPC","name":"app_registrar_pagamento_v2","signature":"uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean","guard":"PLAIN","family":"PAYMENT","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"d4d9efe230d0277b4b47b6abc0b6ffe8","origin":"162"},{"id":"RPC:app_reservar_numero_nfce/1","kind":"RPC","name":"app_reservar_numero_nfce","signature":"bigint","guard":"PLAIN","family":"NFCE_EMISSION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"35a665ee68bfaa2f2ec65d36cb97790e","origin":"162"},{"id":"RPC:app_salvar_funcionamento_loja/2","kind":"RPC","name":"app_salvar_funcionamento_loja","signature":"bigint, jsonb","guard":"PRE_EXISTING","family":"MIG147_ADMIN_FINAL","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"f6713d798f38109ee94413b4500c0208","origin":"147"},{"id":"RPC:app_salvar_usuario/2","kind":"RPC","name":"app_salvar_usuario","signature":"bigint, jsonb","guard":"PLAIN","family":"USER_ADMIN_MUTATION","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"078701cc6c89d30c7a4b6a945dc5d43f","origin":"162"},{"id":"RPC:cupom_consumir/7","kind":"RPC","name":"cupom_consumir","signature":"bigint, bigint, numeric, numeric, text, text[], text","guard":"PLAIN","family":"COUPON","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"364ccbbfb7a212e3f8886e8cb5412807","origin":"162"},{"id":"RPC:cupom_consumir/8","kind":"RPC","name":"cupom_consumir","signature":"bigint, bigint, numeric, numeric, text, text[], text, text","guard":"CALLEE","family":"COUPON_CHECKOUT_CALLEE","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed_registry_callee_internal();","md5":"fde8c29834c98ae942b6a527e64cccec","origin":"162"},{"id":"RPC:pub_criar_pedido/11","kind":"RPC","name":"pub_criar_pedido","signature":"bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric","guard":"PLAIN","family":"PUBLIC_ORDER_LEGACY_071","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"10380c3068fe6794469840bf01fd1008","origin":"162"},{"id":"RPC:pub_criar_pedido_v2/12","kind":"RPC","name":"pub_criar_pedido_v2","signature":"bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text","guard":"PLAIN","family":"PUBLIC_ORDER","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"b1dc6bfd940c2355286fc0950c318c45","origin":"162"},{"id":"RPC:pub_solicitar_conta/2","kind":"RPC","name":"pub_solicitar_conta","signature":"bigint, text","guard":"PLAIN","family":"PUBLIC_ORDER_BILL","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"9902d71e9d7cb17eeb74d2f5fb2d1def","origin":"162"},{"id":"RPC:pub_solicitar_conta/3","kind":"RPC","name":"pub_solicitar_conta","signature":"bigint, text, boolean","guard":"PLAIN","family":"PUBLIC_ORDER_BILL","classification":"FENCE_GUARD_REQUIRED","guardStatement":"perform public.app_assert_business_write_allowed(null, null);","md5":"222adbfa71b6b375e444c88183f75e0a","origin":"162"},{"id":"TABLE:fiscal_catalogo_cest","kind":"TABLE","table":"fiscal_catalogo_cest","trigger":"aaa_maintenance_guard_fiscal_catalogo_cest","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_cfop","kind":"TABLE","table":"fiscal_catalogo_cfop","trigger":"aaa_maintenance_guard_fiscal_catalogo_cfop","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_csosn","kind":"TABLE","table":"fiscal_catalogo_csosn","trigger":"aaa_maintenance_guard_fiscal_catalogo_csosn","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_cst_cofins","kind":"TABLE","table":"fiscal_catalogo_cst_cofins","trigger":"aaa_maintenance_guard_fiscal_catalogo_cst_cofins","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_cst_icms","kind":"TABLE","table":"fiscal_catalogo_cst_icms","trigger":"aaa_maintenance_guard_fiscal_catalogo_cst_icms","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_cst_pis","kind":"TABLE","table":"fiscal_catalogo_cst_pis","trigger":"aaa_maintenance_guard_fiscal_catalogo_cst_pis","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_catalogo_ncm","kind":"TABLE","table":"fiscal_catalogo_ncm","trigger":"aaa_maintenance_guard_fiscal_catalogo_ncm","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_regra","kind":"TABLE","table":"fiscal_regra","trigger":"aaa_maintenance_guard_fiscal_regra","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_regra_versao","kind":"TABLE","table":"fiscal_regra_versao","trigger":"aaa_maintenance_guard_fiscal_regra_versao","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_template","kind":"TABLE","table":"fiscal_template","trigger":"aaa_maintenance_guard_fiscal_template","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:fiscal_template_regra","kind":"TABLE","table":"fiscal_template_regra","trigger":"aaa_maintenance_guard_fiscal_template_regra","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:loja_fiscal_emitente","kind":"TABLE","table":"loja_fiscal_emitente","trigger":"aaa_maintenance_guard_loja_fiscal_emitente","triggerFunction":"app_maintenance_business_write_registry_trigger","family":"TABLE_TRIGGER_162_REGISTRY_AWARE","classification":"FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED","origin":"162"},{"id":"TABLE:loja_fiscal_nfce","kind":"TABLE","table":"loja_fiscal_nfce","trigger":"aaa_maintenance_guard_loja_fiscal_nfce","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:loja_fiscal_regra","kind":"TABLE","table":"loja_fiscal_regra","trigger":"aaa_maintenance_guard_loja_fiscal_regra","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:pagamento_alocacoes","kind":"TABLE","table":"pagamento_alocacoes","trigger":"aaa_maintenance_guard_pagamento_alocacoes","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:pagamento_eventos","kind":"TABLE","table":"pagamento_eventos","trigger":"aaa_maintenance_guard_pagamento_eventos","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:pagamento_transacoes","kind":"TABLE","table":"pagamento_transacoes","trigger":"aaa_maintenance_guard_pagamento_transacoes","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_cargos","kind":"TABLE","table":"tab_cargos","trigger":"aaa_maintenance_guard_tab_cargos","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_chamados","kind":"TABLE","table":"tab_chamados","trigger":"aaa_maintenance_guard_tab_chamados","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_clientes","kind":"TABLE","table":"tab_clientes","trigger":"aaa_maintenance_guard_tab_clientes","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_dispositivos","kind":"TABLE","table":"tab_dispositivos","trigger":"aaa_maintenance_guard_tab_dispositivos","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_dispositivos_bloqueados","kind":"TABLE","table":"tab_dispositivos_bloqueados","trigger":"aaa_maintenance_guard_tab_dispositivos_bloqueados","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_grupos_opcoes","kind":"TABLE","table":"tab_grupos_opcoes","trigger":"aaa_maintenance_guard_tab_grupos_opcoes","triggerFunction":"app_maintenance_business_write_trigger","family":"MIG144_TABLE_TRIGGERS","classification":"FENCE_GUARD_REQUIRED","origin":"144"},{"id":"TABLE:tab_leads","kind":"TABLE","table":"tab_leads","trigger":"aaa_maintenance_guard_tab_leads","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_opcoes","kind":"TABLE","table":"tab_opcoes","trigger":"aaa_maintenance_guard_tab_opcoes","triggerFunction":"app_maintenance_business_write_trigger","family":"MIG144_TABLE_TRIGGERS","classification":"FENCE_GUARD_REQUIRED","origin":"144"},{"id":"TABLE:tab_pesquisa_satisfacao","kind":"TABLE","table":"tab_pesquisa_satisfacao","trigger":"aaa_maintenance_guard_tab_pesquisa_satisfacao","triggerFunction":"app_maintenance_business_write_trigger","family":"TABLE_TRIGGER_162","classification":"FENCE_GUARD_REQUIRED","origin":"162"},{"id":"TABLE:tab_promocoes","kind":"TABLE","table":"tab_promocoes","trigger":"aaa_maintenance_guard_tab_promocoes","triggerFunction":"app_maintenance_business_write_trigger","family":"MIG144_TABLE_TRIGGERS","classification":"FENCE_GUARD_REQUIRED","origin":"144"}],"registry":[{"type":"CHECKOUT","members":["RPC:app_checkout_begin/2","RPC:app_checkout_commit/2","CORE:app_maintenance_operation_begin_internal/1"]},{"type":"ONBOARDING","members":["RPC:app_onboarding_criar_loja/7","RPC:app_onboarding_criar_categoria/6","RPC:app_onboarding_seed_formas_pagamento/2","RPC:app_onboarding_salvar_emitente/3","CORE:app_maintenance_operation_begin_internal/1"]}],"excludedTables":["tab_user_sessions","tab_access_events","tab_access_page_stays"],"excludedWriters":[{"name":"seed_demo_empresa","reason":"SEED_DEMO_SECURITY_INVOKER_SEM_PRIVILEGIO_DIRETO"},{"name":"seed_demo_produto","reason":"SEED_DEMO_SECURITY_INVOKER_SEM_PRIVILEGIO_DIRETO"}]}$manifest$::jsonb;
  v_entry jsonb;
  v_reg jsonb;
  v_id text;
  v_kind text;
  v_name text;
  v_member text;
  v_oid oid;
  v_src text;
  v_norm text;
  v_prefix text;
  v_secdef boolean;
  v_config text[];
  v_owner text;
  v_guard_stmt text;
  v_overloads integer;
  v_expected_overloads integer;
  v_reason text;
  v_missing jsonb := '[]'::jsonb;
  v_unverified jsonb := '[]'::jsonb;
  v_bypass jsonb := '[]'::jsonb;
  v_reg_required jsonb := '[]'::jsonb;
  v_reg_verified jsonb := '[]'::jsonb;
  v_reg_ok boolean;
  v_verified_ids text[] := array[]::text[];
  v_manifest_oids oid[] := array[]::oid[];
  v_required_count integer := 0;
  v_verified_count integer := 0;
  v_tables text[];
  v_written text[];
  v_guarded_tables text[];
  v_dml_re text;
  v_dml_first_re constant text := '\m(?:insert\s+into|delete\s+from)\s+(?!(?:public\.)?(?:app_maintenance_|app_checkout_operation_))[a-z0-9_.]+|\mupdate\s+(?!(?:public\.)?(?:app_maintenance_|app_checkout_operation_))[a-z0-9_.]+\s+set\M';
  v_p record;
  v_t record;
  v_trig record;
  v_role text;
  v_guarded boolean;
  v_can_write boolean;
  v_can_truncate boolean;
  v_exposed boolean;
  v_role_oid oid;
  v_hash text;
  v_persistence jsonb;
  v_inventory_complete boolean := true;
  v_new_events text[] := array[
    'DB_EXECUTION_CLAIMED', 'DB_LOCK_ACQUIRED', 'DB_LOCK_RELEASED', 'DB_WRITE_FENCE_VERIFIED',
    'DB_MIGRATION_FAILED', 'DB_MIGRATION_AMBIGUOUS', 'DB_SMOKE_PASSED', 'DB_SMOKE_FAILED',
    'DB_EXECUTOR_HEARTBEAT_STALE', 'DB_EXECUTION_RECONCILED', 'DB_MAINTENANCE_PHASE_CHANGED'
  ];
begin
  -- ── manifesto: hash determinístico (ordem C, independente de collation) ──
  select encode(
           sha256(convert_to(
             (v_manifest ->> 'version') || E'\n' || coalesce(string_agg(x.line, E'\n' order by x.id collate "C"), ''),
             'UTF8'
           )),
           'hex'
         )
    into v_hash
  from (
    select
      e ->> 'id' as id,
      concat_ws(
        '|',
        e ->> 'id',
        e ->> 'kind',
        coalesce(e ->> 'name', e ->> 'table'),
        coalesce(e ->> 'signature', ''),
        coalesce(e ->> 'trigger', ''),
        coalesce(e ->> 'md5', '')
      ) as line
    from jsonb_array_elements(v_manifest -> 'entries') as e
  ) as x;

  -- ── entradas requeridas ──
  for v_entry in select value from jsonb_array_elements(v_manifest -> 'entries')
  loop
    v_required_count := v_required_count + 1;
    v_id := v_entry ->> 'id';
    v_kind := v_entry ->> 'kind';
    v_reason := null;

    if v_kind in ('RPC', 'CORE') then
      v_name := v_entry ->> 'name';
      v_oid := to_regprocedure('public.' || v_name || '(' || (v_entry ->> 'signature') || ')');
      if v_oid is null then
        v_missing := v_missing || jsonb_build_array(v_id);
        continue;
      end if;
      v_manifest_oids := v_manifest_oids || v_oid;

      select p.prosrc, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner)
        into v_src, v_secdef, v_config, v_owner
      from pg_proc as p
      where p.oid = v_oid;

      select count(*) into v_overloads
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name;

      select count(*) into v_expected_overloads
      from jsonb_array_elements(v_manifest -> 'entries') as x
      where x ->> 'name' = v_name and x ->> 'kind' in ('RPC', 'CORE');

      v_norm := regexp_replace(
        regexp_replace(
          regexp_replace(lower(replace(v_src, E'\r', '')), '/\*.*?\*/', ' ', 'g'),
          '--[^\n]*', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      );

      if not coalesce(v_secdef, false) then
        v_reason := 'NOT_SECURITY_DEFINER';
      elsif v_owner is distinct from 'postgres' then
        v_reason := 'OWNER_DRIFT';
      elsif v_config is null or not exists (select 1 from unnest(v_config) as c where c like 'search_path=%') then
        v_reason := 'SEARCH_PATH_MISSING';
      elsif v_overloads is distinct from v_expected_overloads then
        v_reason := 'OVERLOAD_DRIFT';
      elsif md5(replace(v_src, E'\r', '')) is distinct from (v_entry ->> 'md5') then
        v_reason := 'BODY_DRIFT';
      elsif v_kind = 'RPC' then
        v_guard_stmt := lower(v_entry ->> 'guardStatement');
        if v_guard_stmt is null or v_guard_stmt = '' or position(v_guard_stmt in v_norm) = 0 then
          v_reason := 'GUARD_ABSENT';
        else
          v_prefix := split_part(v_norm, v_guard_stmt, 1);
          if v_prefix ~ v_dml_first_re then
            v_reason := 'GUARD_AFTER_MUTATION';
          end if;
        end if;
      end if;

    elsif v_kind = 'TABLE' then
      v_name := v_entry ->> 'table';
      v_oid := to_regclass('public.' || v_name);
      if v_oid is null then
        v_missing := v_missing || jsonb_build_array(v_id);
        continue;
      end if;
      select t.tgenabled, t.tgtype, t.tgfoid
        into v_trig
      from pg_trigger as t
      where t.tgrelid = v_oid
        and t.tgname = (v_entry ->> 'trigger')
        and not t.tgisinternal;
      if not found then
        v_reason := 'TRIGGER_ABSENT';
      elsif v_trig.tgenabled not in ('O', 'A')
         or (v_trig.tgtype & 1) <> 0
         or (v_trig.tgtype & 2) <> 2
         or (v_trig.tgtype & 4) <> 4
         or (v_trig.tgtype & 8) <> 8
         or (v_trig.tgtype & 16) <> 16 then
        v_reason := 'TRIGGER_NOT_BEFORE_STATEMENT_IUD';
      elsif v_trig.tgfoid is distinct from (to_regprocedure('public.' || (v_entry ->> 'triggerFunction') || '()'))::oid then
        v_reason := 'TRIGGER_FUNCTION_DRIFT';
      end if;
    else
      v_reason := 'KIND_UNKNOWN';
    end if;

    if v_reason is null then
      v_verified_count := v_verified_count + 1;
      v_verified_ids := v_verified_ids || v_id;
    else
      v_unverified := v_unverified || jsonb_build_array(v_id || ':' || v_reason);
    end if;
  end loop;

  -- ── cobertura do Operation Registry ──
  select p.prosrc into v_src
  from pg_proc as p
  where p.oid = to_regprocedure('public.app_maintenance_operation_begin_internal(text)');

  for v_reg in select value from jsonb_array_elements(v_manifest -> 'registry')
  loop
    v_reg_required := v_reg_required || jsonb_build_array(v_reg ->> 'type');
    v_reg_ok := v_src is not null
      and position(('''' || (v_reg ->> 'type') || '''') in v_src) > 0;
    for v_member in select value from jsonb_array_elements_text(v_reg -> 'members')
    loop
      if not (v_member = any (v_verified_ids)) then
        v_reg_ok := false;
      end if;
    end loop;
    if v_reg_ok then
      v_reg_verified := v_reg_verified || jsonb_build_array(v_reg ->> 'type');
    end if;
  end loop;

  -- ── inventário derivado do CATÁLOGO: tabelas de negócio ──
  select array_agg(c.relname::text order by c.relname::text)
    into v_tables
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname !~ '^(app_db_release_|app_backup_runs|app_schema_validation_results|app_maintenance_|app_release_|app_active_sessions|app_checkout_operation_)'
    and c.relname not in (
      select value from jsonb_array_elements_text(v_manifest -> 'excludedTables')
    );

  if v_tables is null or coalesce(array_length(v_tables, 1), 0) = 0 then
    v_inventory_complete := false;
    v_unverified := v_unverified || jsonb_build_array('INVENTORY:NO_BUSINESS_TABLES_FOUND');
  else
    v_dml_re := '\m(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:public\.)?"?('
      || array_to_string(v_tables, '|') || ')"?\M';

    -- tabelas com trigger de write fence habilitado (statement-level, BEFORE I/U/D)
    select coalesce(array_agg(distinct c.relname::text), array[]::text[])
      into v_guarded_tables
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and t.tgenabled in ('O', 'A')
      and (t.tgtype & 1) = 0
      and (t.tgtype & 2) = 2
      and (t.tgtype & 4) = 4
      and (t.tgtype & 8) = 8
      and (t.tgtype & 16) = 16
      and t.tgfoid in (
        (to_regprocedure('public.app_maintenance_business_write_trigger()'))::oid,
        (to_regprocedure('public.app_maintenance_business_write_registry_trigger()'))::oid
      );

    -- funções executáveis por anon/authenticated que escrevem em tabela de negócio
    for v_p in
      select p.oid as oid, p.proname::text as proname,
             pg_get_function_identity_arguments(p.oid) as args, p.prosrc as prosrc
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.prorettype <> 'pg_catalog.trigger'::regtype
        and (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        )
    loop
      v_norm := lower(regexp_replace(replace(v_p.prosrc, E'\r', ''), '--[^\n]*', '', 'g'));
      if (v_norm ~ v_dml_re)
         or (v_norm ~ '\mexecute\M' and v_norm ~ '\m(insert|update|delete)\M') then
        select array_agg(distinct x[1]) into v_written
        from regexp_matches(v_norm, v_dml_re, 'g') as t(x);

        if not (v_p.oid = any (v_manifest_oids))
           and not (v_written is not null and v_written <@ v_guarded_tables)
           and not exists (
             select 1
             from jsonb_array_elements(v_manifest -> 'excludedWriters') as x
             where x ->> 'name' = v_p.proname
           ) then
          v_inventory_complete := false;
          v_unverified := v_unverified || jsonb_build_array(
            'UNCLASSIFIED_WRITER:' || v_p.proname || '(' || v_p.args || ')'
          );
        end if;
      end if;
    end loop;

    -- ── exposição de escrita DIRETA em tabela por anon/authenticated ──
    for v_t in
      select c.oid as oid, c.relname::text as relname, c.relrowsecurity as rls
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname::text = any (v_tables)
      order by c.relname::text
    loop
      v_guarded := exists (
        select 1
        from pg_trigger as t
        where t.tgrelid = v_t.oid
          and not t.tgisinternal
          and t.tgenabled in ('O', 'A')
          and (t.tgtype & 1) = 0
          and (t.tgtype & 2) = 2
          and (t.tgtype & 4) = 4
          and (t.tgtype & 8) = 8
          and (t.tgtype & 16) = 16
          and t.tgfoid in (
            (to_regprocedure('public.app_maintenance_business_write_trigger()'))::oid,
            (to_regprocedure('public.app_maintenance_business_write_registry_trigger()'))::oid
          )
      );

      foreach v_role in array array['anon', 'authenticated']
      loop
        v_can_truncate := has_table_privilege(v_role, v_t.oid, 'TRUNCATE');
        v_can_write := has_table_privilege(v_role, v_t.oid, 'INSERT')
          or has_table_privilege(v_role, v_t.oid, 'UPDATE')
          or has_table_privilege(v_role, v_t.oid, 'DELETE')
          or has_any_column_privilege(v_role, v_t.oid, 'INSERT')
          or has_any_column_privilege(v_role, v_t.oid, 'UPDATE');

        if v_can_truncate then
          v_bypass := v_bypass || jsonb_build_array(
            jsonb_build_object('table', v_t.relname, 'role', v_role, 'mode', 'TRUNCATE_PRIVILEGE')
          );
        elsif v_can_write and not v_guarded then
          select r.oid into v_role_oid from pg_roles as r where r.rolname = v_role;
          v_exposed := (not v_t.rls)
            or exists (
              select 1
              from pg_policy as pol
              where pol.polrelid = v_t.oid
                and pol.polcmd in ('*', 'a', 'w', 'd')
                and (pol.polroles = '{0}'::oid[] or v_role_oid = any (pol.polroles))
            );
          if v_exposed then
            v_bypass := v_bypass || jsonb_build_array(
              jsonb_build_object(
                'table', v_t.relname,
                'role', v_role,
                'mode', case when v_t.rls then 'RLS_POLICY_ALLOWS_WRITE' else 'NO_RLS' end
              )
            );
          end if;
        end if;
      end loop;
    end loop;
  end if;

  -- ── evidência de persistência (mapeia PERSISTENCE_GAPS do I2C2; true = gap aberto) ──
  v_persistence := jsonb_build_object(
    'LEASE_GENERATION_NOT_PERSISTED',
      coalesce(not exists (
        select 1 from pg_attribute as a
        where a.attrelid = to_regclass('public.app_db_release_executions')
          and a.attname = 'lease_generation' and not a.attisdropped and a.attnotnull
      ), true),
    'ACTIVE_EXECUTION_UNIQUENESS_NOT_ENFORCED',
      coalesce(not exists (
        select 1
        from pg_index as i
        join pg_class as ic on ic.oid = i.indexrelid
        where i.indrelid = to_regclass('public.app_db_release_executions')
          and ic.relname = 'app_db_release_executions_active_target_uidx'
          and i.indisunique and i.indisvalid and i.indpred is not null
      ), true),
    'PLAN_CORRELATION_UNIQUENESS_NOT_ENFORCED',
      coalesce(not exists (
        select 1 from pg_constraint as c
        where c.conrelid = to_regclass('public.app_db_release_executions')
          and c.conname = 'app_db_release_executions_plan_correlation_uidx'
          and c.contype = 'u'
      ), true),
    'AUDIT_TAXONOMY_INCOMPLETE',
      coalesce(not (
        select bool_and(position(('''' || ev || '''') in d.def) > 0)
        from unnest(v_new_events) as ev,
             (select pg_get_constraintdef(c.oid) as def
              from pg_constraint as c
              where c.conrelid = to_regclass('public.app_maintenance_events')
                and c.conname = 'app_maintenance_events_event_type_check') as d
      ), true),
    'MAINTENANCE_DB_EDGE_RPCS_MISSING',
      (
        to_regprocedure('public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb)') is null
        or to_regprocedure('public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb)') is null
      ),
    'LOGIN_GATE_WRITER_MISSING',
      (
        to_regprocedure('public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb)') is null
        or not exists (
          select 1 from pg_trigger as t
          where t.tgrelid = to_regclass('public.app_maintenance_state')
            and t.tgname = 'app_maintenance_login_gate_guard_trg'
            and not t.tgisinternal and t.tgenabled in ('O', 'A')
        )
      ),
    'DB_BINDING_RPC_MISSING',
      (to_regprocedure('public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb)') is null),
    'REOPEN_GUARD_FOR_DB_BINDING_MISSING',
      coalesce(not (
        exists (
          select 1 from pg_proc as p
          where p.oid = to_regprocedure('public.app_maintenance_orchestration_binding_guard()')
            and position('DB_BINDING_RELEASE_UNSAFE' in p.prosrc) > 0
        )
        and exists (
          select 1 from pg_trigger as t
          where t.tgrelid = to_regclass('public.app_maintenance_state')
            and t.tgname = 'app_maintenance_orchestration_binding_guard_trg'
            and not t.tgisinternal and t.tgenabled in ('O', 'A')
        )
      ), true)
  );

  return jsonb_build_object(
    'manifestVersion', v_manifest ->> 'version',
    'manifestHash', v_hash,
    'inventoryComplete', v_inventory_complete,
    'requiredPathCount', v_required_count,
    'verifiedPathCount', v_verified_count,
    'missingPaths', v_missing,
    'unverifiedPaths', v_unverified,
    'directWriteBypasses', v_bypass,
    'registryCoverage', jsonb_build_object(
      'required', v_reg_required,
      'verified', v_reg_verified,
      'complete', (jsonb_array_length(v_reg_required) > 0 and v_reg_required = v_reg_verified)
    ),
    'persistence', v_persistence,
    'evaluatedAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

comment on function public.app_db_release_write_coverage_probe() is
  'RPC server-only, READ-ONLY (STABLE). Prova de cobertura do write fence derivada do catálogo (pg_proc/pg_trigger/pg_class/pg_policy/privilégios): assinatura, SECURITY DEFINER, owner, search_path, fingerprint md5 do corpo, sentinela do guard ANTES da primeira mutação, triggers de tabela, cobertura do registry, funções escritoras NÃO classificadas e privilégio de escrita direta de anon/authenticated. manifestVersion + manifestHash deterministicos; qualquer drift => incompleto. Sem segredos.';

-- ════════════════════════════════════════════════════════════
--  21) ACL / OWNER / SEARCH_PATH das funções novas
--      Internas: nenhum role. RPCs: somente service_role.
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_db_release_project_ref_for_internal(text) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_event_internal(text, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_execution_json_internal(public.app_db_release_executions) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_owner_lock_internal(uuid, text, bigint, uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_plan_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_execution_plan_invariant() from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_binding_release_safe_internal(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_login_gate_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_db_emit_internal(integer, text, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_assert_business_write_allowed_registry_callee_internal() from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_business_write_registry_trigger() from public, anon, authenticated, service_role;

revoke all on function public.app_db_release_claim_execution(uuid, text, text, text, uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_heartbeat_execution(uuid, text, bigint, integer) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_transition_execution(uuid, text, bigint, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_release_lock(uuid, text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_flag_stale_execution(uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_reconcile_execution(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_release_reconciled_lock(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.app_db_release_write_coverage_probe() from public, anon, authenticated, service_role;

grant execute on function public.app_db_release_claim_execution(uuid, text, text, text, uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.app_db_release_heartbeat_execution(uuid, text, bigint, integer) to service_role;
grant execute on function public.app_db_release_transition_execution(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function public.app_db_release_release_lock(uuid, text, bigint) to service_role;
grant execute on function public.app_db_release_flag_stale_execution(uuid, bigint) to service_role;
grant execute on function public.app_db_release_reconcile_execution(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.app_db_release_release_reconciled_lock(uuid, uuid) to service_role;
grant execute on function public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb) to service_role;
grant execute on function public.app_db_release_write_coverage_probe() to service_role;

alter function public.app_db_release_project_ref_for_internal(text) owner to postgres;
alter function public.app_db_release_event_internal(text, text, uuid, text, jsonb) owner to postgres;
alter function public.app_db_release_execution_json_internal(public.app_db_release_executions) owner to postgres;
alter function public.app_db_release_owner_lock_internal(uuid, text, bigint, uuid, boolean, boolean) owner to postgres;
alter function public.app_db_release_plan_guard() owner to postgres;
alter function public.app_db_release_execution_plan_invariant() owner to postgres;
alter function public.app_db_release_binding_release_safe_internal(uuid, text) owner to postgres;
alter function public.app_maintenance_login_gate_guard() owner to postgres;
alter function public.app_maintenance_db_emit_internal(integer, text, uuid, text, text, jsonb) owner to postgres;
alter function public.app_assert_business_write_allowed_registry_callee_internal() owner to postgres;
alter function public.app_maintenance_business_write_registry_trigger() owner to postgres;
alter function public.app_db_release_claim_execution(uuid, text, text, text, uuid, text, text, timestamptz, integer) owner to postgres;
alter function public.app_db_release_heartbeat_execution(uuid, text, bigint, integer) owner to postgres;
alter function public.app_db_release_transition_execution(uuid, text, bigint, text, text, text, text) owner to postgres;
alter function public.app_db_release_release_lock(uuid, text, bigint) owner to postgres;
alter function public.app_db_release_flag_stale_execution(uuid, bigint) owner to postgres;
alter function public.app_db_release_reconcile_execution(uuid, uuid, text, jsonb) owner to postgres;
alter function public.app_db_release_release_reconciled_lock(uuid, uuid) owner to postgres;
alter function public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb) owner to postgres;
alter function public.app_db_release_write_coverage_probe() owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_exec_reloid oid := to_regclass('public.app_db_release_executions');
  v_events_reloid oid := to_regclass('public.app_maintenance_events');
  v_state_reloid oid := to_regclass('public.app_maintenance_state');
  v_col record;
  v_name text;
  v_sig text;
  v_oid oid;
  v_condef text;
  v_count integer;
  v_secdef boolean;
  v_owner text;
  v_config text[];
  v_probe jsonb;
  v_id text;
  v_phase text;
  v_login text;
  v_kind text;
  v_release uuid;
  v_plan uuid;
  v_target text;
  v_rpc_sigs constant text[] := array[
    'public.app_db_release_claim_execution(uuid, text, text, text, uuid, text, text, timestamptz, integer)',
    'public.app_db_release_heartbeat_execution(uuid, text, bigint, integer)',
    'public.app_db_release_transition_execution(uuid, text, bigint, text, text, text, text)',
    'public.app_db_release_release_lock(uuid, text, bigint)',
    'public.app_db_release_flag_stale_execution(uuid, bigint)',
    'public.app_db_release_reconcile_execution(uuid, uuid, text, jsonb)',
    'public.app_db_release_release_reconciled_lock(uuid, uuid)',
    'public.app_maintenance_db_orchestration_start(uuid, text, bigint, integer, uuid, text, uuid, text, text, jsonb)',
    'public.app_maintenance_db_orchestration_transition(uuid, text, bigint, text, integer, text, uuid, text, text, jsonb)',
    'public.app_maintenance_db_orchestration_login_gate(uuid, text, bigint, integer, text, uuid, text, text, jsonb)',
    'public.app_maintenance_db_orchestration_abort_to_normal(uuid, text, bigint, integer, uuid, text, text, jsonb)',
    'public.app_db_release_write_coverage_probe()'
  ];
  v_internal_sigs constant text[] := array[
    'public.app_db_release_event_internal(text, text, uuid, text, jsonb)',
    'public.app_db_release_owner_lock_internal(uuid, text, bigint, uuid, boolean, boolean)',
    'public.app_db_release_plan_guard()',
    'public.app_db_release_execution_plan_invariant()',
    'public.app_db_release_binding_release_safe_internal(uuid, text)',
    'public.app_maintenance_login_gate_guard()',
    'public.app_maintenance_db_emit_internal(integer, text, uuid, text, text, jsonb)',
    'public.app_assert_business_write_allowed_registry_callee_internal()',
    'public.app_maintenance_business_write_registry_trigger()'
  ];
  v_new_events constant text[] := array[
    'DB_EXECUTION_CLAIMED', 'DB_LOCK_ACQUIRED', 'DB_LOCK_RELEASED', 'DB_WRITE_FENCE_VERIFIED',
    'DB_MIGRATION_FAILED', 'DB_MIGRATION_AMBIGUOUS', 'DB_SMOKE_PASSED', 'DB_SMOKE_FAILED',
    'DB_EXECUTOR_HEARTBEAT_STALE', 'DB_EXECUTION_RECONCILED', 'DB_MAINTENANCE_PHASE_CHANGED'
  ];
begin
  -- colunas de runtime
  for v_col in
    select * from (values
      ('project_ref', 'text', true),
      ('lease_generation', 'bigint', true),
      ('lease_expires_at', 'timestamp with time zone', true),
      ('lock_released_at', 'timestamp with time zone', false),
      ('mutation_started_at', 'timestamp with time zone', false),
      ('reconciled_at', 'timestamp with time zone', false),
      ('reconciled_by', 'uuid', false),
      ('reconciliation_evidence', 'jsonb', false),
      ('correlation_id', 'uuid', true),
      ('executor_id', 'text', true),
      ('heartbeat_at', 'timestamp with time zone', true)
    ) as cols(name, type_name, not_null)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_name
    from pg_attribute as a
    where a.attrelid = v_exec_reloid and a.attname = v_col.name and not a.attisdropped;
    if v_name is distinct from v_col.type_name then
      raise exception 'postcheck 162: coluna % com tipo % (esperado %).', v_col.name, v_name, v_col.type_name;
    end if;
    if v_col.not_null and not exists (
      select 1 from pg_attribute as a
      where a.attrelid = v_exec_reloid and a.attname = v_col.name and a.attnotnull
    ) then
      raise exception 'postcheck 162: coluna % deveria ser NOT NULL.', v_col.name;
    end if;
    if exists (
      select 1
      from pg_attrdef as d
      join pg_attribute as a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = v_exec_reloid and a.attname = v_col.name
        and v_col.name in ('project_ref', 'lease_generation', 'lease_expires_at', 'correlation_id', 'executor_id', 'heartbeat_at')
    ) then
      raise exception 'postcheck 162: coluna de ownership % não deve ter DEFAULT.', v_col.name;
    end if;
  end loop;

  -- constraints e índices
  foreach v_name in array array[
    'app_db_release_executions_project_ref_env_check',
    'app_db_release_executions_lease_generation_check',
    'app_db_release_executions_lease_window_check',
    'app_db_release_executions_lock_release_check',
    'app_db_release_executions_mutation_check',
    'app_db_release_executions_reconciliation_check',
    'app_db_release_executions_plan_correlation_uidx',
    'app_db_release_executions_target_generation_uidx'
  ]
  loop
    if not exists (
      select 1 from pg_constraint as c where c.conrelid = v_exec_reloid and c.conname = v_name
    ) then
      raise exception 'postcheck 162: constraint % ausente.', v_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_index as i
    join pg_class as ic on ic.oid = i.indexrelid
    where i.indrelid = v_exec_reloid
      and ic.relname = 'app_db_release_executions_active_target_uidx'
      and i.indisunique and i.indisvalid and i.indpred is not null
      and i.indnatts = 2
  ) then
    raise exception 'postcheck 162: índice único parcial de lock ativo por (environment, project_ref) ausente.';
  end if;

  -- event_type: 53 valores, todos os novos presentes
  select pg_get_constraintdef(c.oid) into v_condef
  from pg_constraint as c
  where c.conrelid = v_events_reloid and c.conname = 'app_maintenance_events_event_type_check';
  if v_condef is null
     or (length(v_condef) - length(replace(v_condef, '::text', ''))) / length('::text') <> 53 then
    raise exception 'postcheck 162: event_type deveria ter 53 valores: %', v_condef;
  end if;
  foreach v_name in array v_new_events
  loop
    if position('''' || v_name || '''' in v_condef) = 0 then
      raise exception 'postcheck 162: event_type % ausente.', v_name;
    end if;
  end loop;
  foreach v_name in array array['NOTICE_STARTED', 'MAINTENANCE_REOPENED', 'DB_RELEASE_FAILED', 'LOGIN_GATE_OPENED', 'DB_PLAN_CREATED']
  loop
    if position('''' || v_name || '''' in v_condef) = 0 then
      raise exception 'postcheck 162: event_type histórico % foi perdido.', v_name;
    end if;
  end loop;

  -- funções: existência, SECURITY DEFINER, owner, search_path, ACL
  foreach v_sig in array v_rpc_sigs || v_internal_sigs
  loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception 'postcheck 162: função % ausente.', v_sig;
    end if;
    select p.prosecdef, pg_get_userbyid(p.proowner), p.proconfig
      into v_secdef, v_owner, v_config
    from pg_proc as p where p.oid = v_oid;
    if not coalesce(v_secdef, false) or v_owner is distinct from 'postgres'
       or v_config is null or not ('search_path=public' = any (v_config)) then
      raise exception 'postcheck 162: % com identidade divergente (secdef/owner/search_path).', v_sig;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'postcheck 162: % NÃO deveria ter EXECUTE para anon/authenticated.', v_sig;
    end if;
    if exists (
      select 1
      from pg_proc as p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'postcheck 162: % NÃO deveria ter EXECUTE para PUBLIC.', v_sig;
    end if;
    if v_sig = any (v_rpc_sigs) then
      if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
        raise exception 'postcheck 162: % deveria ter EXECUTE para service_role.', v_sig;
      end if;
    elsif has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'postcheck 162: % (interna) NÃO deveria ter EXECUTE para service_role.', v_sig;
    end if;
  end loop;

  -- triggers
  if not exists (
    select 1 from pg_trigger as t
    where t.tgrelid = to_regclass('public.app_db_release_plans')
      and t.tgname = 'app_db_release_plan_guard_trg' and not t.tgisinternal and t.tgenabled in ('O', 'A')
  ) then
    raise exception 'postcheck 162: trigger de plano ausente.';
  end if;
  if not exists (
    select 1 from pg_trigger as t
    where t.tgrelid = v_exec_reloid
      and t.tgname = 'app_db_release_execution_plan_invariant_trg'
      and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred
  ) then
    raise exception 'postcheck 162: constraint trigger DEFERRED de execução ausente.';
  end if;
  foreach v_name in array array[
    'app_maintenance_login_gate_guard_trg',
    'app_maintenance_orchestration_binding_guard_trg'
  ]
  loop
    if not exists (
      select 1 from pg_trigger as t
      where t.tgrelid = v_state_reloid and t.tgname = v_name
        and not t.tgisinternal and t.tgenabled in ('O', 'A')
    ) then
      raise exception 'postcheck 162: trigger % ausente no singleton de manutenção.', v_name;
    end if;
  end loop;
  select p.prosrc into v_condef
  from pg_proc as p
  where p.oid = to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if position('DB_BINDING_RELEASE_UNSAFE' in v_condef) = 0
     or position('FUTURE B17 REOPEN CLEAR' in v_condef) = 0
     or position('APP_RELEASE' in v_condef) = 0 then
    raise exception 'postcheck 162: binding_guard sem reopen guard DB (ou perdeu o caminho APP).';
  end if;

  -- privilégios de tabela: ownership de execução só via RPC
  if has_table_privilege('service_role', 'public.app_db_release_executions', 'insert')
     or has_table_privilege('service_role', 'public.app_db_release_executions', 'update')
     or has_table_privilege('service_role', 'public.app_db_release_executions', 'delete')
     or not has_table_privilege('service_role', 'public.app_db_release_executions', 'select')
     or has_table_privilege('anon', 'public.app_db_release_executions', 'select')
     or has_table_privilege('authenticated', 'public.app_db_release_executions', 'select') then
    raise exception 'postcheck 162: ACL de app_db_release_executions divergente (service_role somente SELECT).';
  end if;

  -- singleton legado intocado (NORMAL, login OPEN, sem binding) e execuções vazias
  select s.phase, s.login_gate, s.plan_kind, s.release_id, s.db_plan_id, s.target_sha
    into v_phase, v_login, v_kind, v_release, v_plan, v_target
  from public.app_maintenance_state as s
  where s.scope = 'global';
  if v_phase is distinct from 'NORMAL' or v_login is distinct from 'OPEN'
     or v_kind is not null or v_release is not null or v_plan is not null or v_target is not null then
    raise exception 'postcheck 162: singleton de manutenção alterado pela migration.';
  end if;
  select count(*) into v_count from public.app_db_release_executions;
  if v_count <> 0 then
    raise exception 'postcheck 162: app_db_release_executions deveria continuar vazia (count=%).', v_count;
  end if;

  -- probe do próprio banco: tudo que a 162 instalou precisa estar verificado
  v_probe := public.app_db_release_write_coverage_probe();
  if v_probe ->> 'manifestVersion' is null or v_probe ->> 'manifestHash' is null then
    raise exception 'postcheck 162: probe sem manifestVersion/manifestHash.';
  end if;
  for v_id in
    select value from jsonb_array_elements_text(
      $origin_ids$["CORE:app_assert_business_write_allowed_registry_callee_internal/0","CORE:app_maintenance_business_write_registry_trigger/0","RPC:app_admin_criar_usuario/3","RPC:app_admin_salvar_usuario/4","RPC:app_baixar_estoque_produto/2","RPC:app_criar_categoria/5","RPC:app_criar_loja/7","RPC:app_criar_pedido/9","RPC:app_criar_usuario/1","RPC:app_definir_senha_hash/2","RPC:app_pedido_atualizar_cliente/3","RPC:app_pedido_atualizar_itens/2","RPC:app_pedido_atualizar_status/3","RPC:app_pedido_marcar_pago/3","RPC:app_pedido_marcar_setor_pronto/3","RPC:app_pedido_solicitar_conta_mesa/2","RPC:app_pedido_transferir_mesa/2","RPC:app_registrar_pagamento_v2/11","RPC:app_reservar_numero_nfce/1","RPC:app_salvar_usuario/2","RPC:cupom_consumir/7","RPC:cupom_consumir/8","RPC:pub_criar_pedido/11","RPC:pub_criar_pedido_v2/12","RPC:pub_solicitar_conta/2","RPC:pub_solicitar_conta/3","TABLE:fiscal_catalogo_cest","TABLE:fiscal_catalogo_cfop","TABLE:fiscal_catalogo_csosn","TABLE:fiscal_catalogo_cst_cofins","TABLE:fiscal_catalogo_cst_icms","TABLE:fiscal_catalogo_cst_pis","TABLE:fiscal_catalogo_ncm","TABLE:fiscal_regra","TABLE:fiscal_regra_versao","TABLE:fiscal_template","TABLE:fiscal_template_regra","TABLE:loja_fiscal_emitente","TABLE:loja_fiscal_nfce","TABLE:loja_fiscal_regra","TABLE:pagamento_alocacoes","TABLE:pagamento_eventos","TABLE:pagamento_transacoes","TABLE:tab_cargos","TABLE:tab_chamados","TABLE:tab_clientes","TABLE:tab_dispositivos","TABLE:tab_dispositivos_bloqueados","TABLE:tab_leads","TABLE:tab_pesquisa_satisfacao"]$origin_ids$::jsonb
    )
  loop
    if (v_probe -> 'missingPaths') @> jsonb_build_array(v_id) then
      raise exception 'postcheck 162: path % ausente segundo o probe.', v_id;
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_probe -> 'unverifiedPaths') as u
      where u like (v_id || ':%')
    ) then
      raise exception 'postcheck 162: path % não verificado segundo o probe.', v_id;
    end if;
  end loop;
end $$;

commit;
