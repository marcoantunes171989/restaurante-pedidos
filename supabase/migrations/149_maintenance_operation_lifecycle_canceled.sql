-- ════════════════════════════════════════════════════════════
--  149 — Adiciona status terminal CANCELED ao Operation Registry
--  (B11-B0).
--
--  Amplia SOMENTE a allowlist de status de
--  public.app_maintenance_operations, trocando a CHECK constraint
--    app_maintenance_operations_status_check
--  de 4 para 5 valores permitidos, preservando o mesmo nome de
--  constraint:
--
--    IN_FLIGHT, COMPLETED, FAILED, EXPIRED, CANCELED
--
--  ESCOPO NEGATIVO — NÃO implementa begin/finish/cancel. NÃO cria
--  função, RPC, trigger, índice, coluna. NÃO altera
--  app_maintenance_operations_lifecycle_check (constraint de
--  coerência status↔timestamps definida na migration 141) nem
--  qualquer outra constraint, índice, default, RLS, ACL ou grant
--  de app_maintenance_operations. NÃO altera
--  app_maintenance_state nem app_assert_business_write_allowed.
--  NÃO integra onboarding/checkout/pedidos/fiscal/user-admin/
--  heartbeat. NÃO faz INSERT/UPDATE/DELETE. NÃO modifica as
--  migrations 141, 142 ou 148.
--
--  NOTA: como app_maintenance_operations_lifecycle_check permanece
--  inalterada e não existe coluna canceled_at, um status='CANCELED'
--  passa a ser aceito pela allowlist desta migration mas ainda é
--  rejeitado pela lifecycle_check em qualquer INSERT/UPDATE real —
--  isso é intencional: este gate amplia apenas o contrato, sem
--  habilitar uso efetivo do status (fica para o core B11-B).
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_condef text;
  v_bad_rows integer;
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'precheck 149: public.app_maintenance_operations não existe.';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'status' and not attisdropped
  ) then
    raise exception 'precheck 149: coluna status ausente em app_maintenance_operations.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check'
  ) then
    raise exception 'precheck 149: constraint app_maintenance_operations_status_check ausente.';
  end if;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check';

  if v_condef is distinct from
    'CHECK ((status = ANY (ARRAY[''IN_FLIGHT''::text, ''COMPLETED''::text, ''FAILED''::text, ''EXPIRED''::text])))'
  then
    raise exception 'precheck 149: definição atual de app_maintenance_operations_status_check inesperada (drift): %', v_condef;
  end if;

  select count(*) into v_bad_rows
  from public.app_maintenance_operations
  where status not in ('IN_FLIGHT', 'COMPLETED', 'FAILED', 'EXPIRED');
  if v_bad_rows <> 0 then
    raise exception 'precheck 149: existem % linha(s) com status fora dos 4 estados antigos.', v_bad_rows;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) ALTERAÇÃO — amplia SOMENTE a allowlist de status
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_operations
  drop constraint app_maintenance_operations_status_check;

alter table public.app_maintenance_operations
  add constraint app_maintenance_operations_status_check
    check (status in (
      'IN_FLIGHT',
      'COMPLETED',
      'FAILED',
      'EXPIRED',
      'CANCELED'
    ));

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_condef text;
  v_status_check_count integer;
  v_lifecycle_condef text;
  v_optype_condef text;
  v_index_count integer;
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'postcheck 149: public.app_maintenance_operations não encontrada.';
  end if;

  select count(*) into v_status_check_count
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check';
  if v_status_check_count <> 1 then
    raise exception 'postcheck 149: esperado exatamente 1 constraint app_maintenance_operations_status_check, encontrado %.', v_status_check_count;
  end if;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check';

  if v_condef is distinct from
    'CHECK ((status = ANY (ARRAY[''IN_FLIGHT''::text, ''COMPLETED''::text, ''FAILED''::text, ''EXPIRED''::text, ''CANCELED''::text])))'
  then
    raise exception 'postcheck 149: definição final de app_maintenance_operations_status_check inesperada: %', v_condef;
  end if;

  if v_condef not like '%''IN_FLIGHT''%' then
    raise exception 'postcheck 149: IN_FLIGHT ausente na allowlist final.';
  end if;
  if v_condef not like '%''COMPLETED''%' then
    raise exception 'postcheck 149: COMPLETED ausente na allowlist final.';
  end if;
  if v_condef not like '%''FAILED''%' then
    raise exception 'postcheck 149: FAILED ausente na allowlist final.';
  end if;
  if v_condef not like '%''EXPIRED''%' then
    raise exception 'postcheck 149: EXPIRED ausente na allowlist final.';
  end if;
  if v_condef not like '%''CANCELED''%' then
    raise exception 'postcheck 149: CANCELED ausente na allowlist final.';
  end if;

  -- operation_type constraint intacta (nome + definição literal).
  select pg_get_constraintdef(oid) into v_optype_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_type_check';
  if v_optype_condef is distinct from
    'CHECK ((operation_type = ANY (ARRAY[''CHECKOUT''::text, ''PUBLIC_ORDER''::text, ''INTERNAL_ORDER''::text, ''ONBOARDING''::text, ''FISCAL_RULE_MUTATION''::text, ''NFCE_EMISSION''::text, ''USER_ADMIN_MUTATION''::text])))'
  then
    raise exception 'postcheck 149: app_maintenance_operations_operation_type_check foi alterada.';
  end if;

  -- lifecycle_check (coerência status↔timestamps) intacta.
  select pg_get_constraintdef(oid) into v_lifecycle_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';
  if v_lifecycle_condef is distinct from
    'CHECK ((((status = ''IN_FLIGHT''::text) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''COMPLETED''::text) AND (completed_at IS NOT NULL) AND (failed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''FAILED''::text) AND (failed_at IS NOT NULL) AND (completed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''EXPIRED''::text) AND (expired_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL))))'
  then
    raise exception 'postcheck 149: app_maintenance_operations_lifecycle_check foi alterada.';
  end if;

  -- Demais constraints intactas (presença, sem checar redefinição literal).
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_epoch_check') then
    raise exception 'postcheck 149: app_maintenance_operations_epoch_check ausente.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_key_check') then
    raise exception 'postcheck 149: app_maintenance_operations_operation_key_check ausente.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_failure_code_check') then
    raise exception 'postcheck 149: app_maintenance_operations_failure_code_check ausente.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_expires_after_started_check') then
    raise exception 'postcheck 149: app_maintenance_operations_expires_after_started_check ausente.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_heartbeat_after_started_check') then
    raise exception 'postcheck 149: app_maintenance_operations_heartbeat_after_started_check ausente.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_reloid and conname = 'app_maintenance_operations_pkey') then
    raise exception 'postcheck 149: app_maintenance_operations_pkey ausente.';
  end if;

  -- Nenhuma constraint a mais/menos: exatamente as 9 constraints originais.
  if (select count(*) from pg_constraint where conrelid = v_reloid) <> 9 then
    raise exception 'postcheck 149: número inesperado de constraints em app_maintenance_operations (esperado 9, encontrado %).',
      (select count(*) from pg_constraint where conrelid = v_reloid);
  end if;

  -- Índices intactos em quantidade e nome.
  select count(*) into v_index_count
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname in (
      'app_maintenance_operations_pkey',
      'app_maintenance_operations_in_flight_expires_idx',
      'app_maintenance_operations_epoch_status_idx',
      'app_maintenance_operations_type_status_idx',
      'app_maintenance_operations_operation_key_in_flight_uidx'
    );
  if v_index_count <> 5 then
    raise exception 'postcheck 149: índices de app_maintenance_operations não estão intactos (esperado 5, encontrado %).', v_index_count;
  end if;

  -- Nenhuma função ou trigger criada por esta migration.
  if to_regprocedure('public.app_maintenance_operation_begin()') is not null
    or to_regprocedure('public.app_maintenance_operation_finish()') is not null
    or to_regprocedure('public.app_maintenance_operation_cancel()') is not null
  then
    raise exception 'postcheck 149: função de begin/finish/cancel não deveria existir neste gate.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = v_reloid and not tgisinternal
  ) then
    raise exception 'postcheck 149: nenhuma trigger deveria existir em app_maintenance_operations.';
  end if;
end $$;

commit;
