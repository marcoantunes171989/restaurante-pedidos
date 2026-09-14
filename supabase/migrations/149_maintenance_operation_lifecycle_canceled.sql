-- ════════════════════════════════════════════════════════════
--  149 — Completa o lifecycle terminal CANCELED no Operation
--  Registry (B11-B0).
--
--  Parte 1 (allowlist): amplia a CHECK constraint
--    app_maintenance_operations_status_check
--  de 4 para 5 valores permitidos, preservando o mesmo nome de
--  constraint:
--
--    IN_FLIGHT, COMPLETED, FAILED, EXPIRED, CANCELED
--
--  Parte 2 (coluna): adiciona
--    public.app_maintenance_operations.canceled_at timestamptz NULL
--  sem DEFAULT, sem backfill, sem qualquer DML.
--
--  Parte 3 (coerência): atualiza
--    app_maintenance_operations_lifecycle_check
--  para reconhecer CANCELED como estado terminal válido, exigindo
--  canceled_at IS NOT NULL e os demais três timestamps terminais
--  (completed_at/failed_at/expired_at) IS NULL — e, simetricamente,
--  exigindo canceled_at IS NULL em todos os demais estados. A
--  exclusividade entre os quatro timestamps terminais passa a ser
--  estrutural (imposta pela própria CHECK constraint), não apenas
--  por convenção de nomes.
--
--  ESCOPO NEGATIVO — NÃO implementa begin/finish/cancel. NÃO cria
--  função, RPC, trigger, índice. NÃO altera RLS, ACL, GRANT/REVOKE
--  nem owner. NÃO faz INSERT/UPDATE/DELETE/TRUNCATE. NÃO cria
--  migration150. NÃO altera app_maintenance_state nem
--  app_assert_business_write_allowed. NÃO integra
--  onboarding/checkout/pedidos/fiscal/user-admin/heartbeat. NÃO
--  modifica as migrations 141, 142 ou 148.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_condef text;
  v_lifecycle_condef text;
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

  if exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'canceled_at' and not attisdropped
  ) then
    raise exception 'precheck 149: coluna canceled_at já existe (drift inesperado).';
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

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check'
  ) then
    raise exception 'precheck 149: constraint app_maintenance_operations_lifecycle_check ausente.';
  end if;

  select pg_get_constraintdef(oid) into v_lifecycle_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';

  if v_lifecycle_condef is distinct from
    'CHECK ((((status = ''IN_FLIGHT''::text) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''COMPLETED''::text) AND (completed_at IS NOT NULL) AND (failed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''FAILED''::text) AND (failed_at IS NOT NULL) AND (completed_at IS NULL) AND (expired_at IS NULL)) OR ((status = ''EXPIRED''::text) AND (expired_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL))))'
  then
    raise exception 'precheck 149: definição atual de app_maintenance_operations_lifecycle_check inesperada (drift): %', v_lifecycle_condef;
  end if;

  select count(*) into v_bad_rows
  from public.app_maintenance_operations
  where status not in ('IN_FLIGHT', 'COMPLETED', 'FAILED', 'EXPIRED');
  if v_bad_rows <> 0 then
    raise exception 'precheck 149: existem % linha(s) com status fora dos 4 estados antigos.', v_bad_rows;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) ALTERAÇÃO — amplia a allowlist de status
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
--  2) ALTERAÇÃO — adiciona canceled_at (sem default, sem DML)
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_operations
  add column canceled_at timestamptz null;

-- ════════════════════════════════════════════════════════════
--  3) ALTERAÇÃO — lifecycle_check passa a reconhecer CANCELED
-- ════════════════════════════════════════════════════════════
alter table public.app_maintenance_operations
  drop constraint app_maintenance_operations_lifecycle_check;

alter table public.app_maintenance_operations
  add constraint app_maintenance_operations_lifecycle_check
    check (
      (status = 'IN_FLIGHT'
        and completed_at is null and failed_at is null and expired_at is null
        and canceled_at is null)
      or (status = 'COMPLETED'
        and completed_at is not null and failed_at is null and expired_at is null
        and canceled_at is null)
      or (status = 'FAILED'
        and failed_at is not null and completed_at is null and expired_at is null
        and canceled_at is null)
      or (status = 'EXPIRED'
        and expired_at is not null and completed_at is null and failed_at is null
        and canceled_at is null)
      or (status = 'CANCELED'
        and canceled_at is not null and completed_at is null and failed_at is null
        and expired_at is null)
    );

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_condef text;
  v_status_check_count integer;
  v_lifecycle_condef text;
  v_lifecycle_check_count integer;
  v_optype_condef text;
  v_index_count integer;
  v_col_type text;
  v_col_nullable boolean;
  v_col_has_default boolean;
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'postcheck 149: public.app_maintenance_operations não encontrada.';
  end if;

  -- 3.a) coluna canceled_at: existe, timestamptz, nullable, sem default.
  select format_type(a.atttypid, a.atttypmod), not a.attnotnull, a.atthasdef
  into v_col_type, v_col_nullable, v_col_has_default
  from pg_attribute a
  where a.attrelid = v_reloid and a.attname = 'canceled_at' and not a.attisdropped;

  if v_col_type is null then
    raise exception 'postcheck 149: coluna canceled_at ausente após ALTER TABLE.';
  end if;
  if v_col_type <> 'timestamp with time zone' then
    raise exception 'postcheck 149: canceled_at deveria ser timestamptz, encontrado %.', v_col_type;
  end if;
  if not v_col_nullable then
    raise exception 'postcheck 149: canceled_at deveria ser nullable.';
  end if;
  if v_col_has_default then
    raise exception 'postcheck 149: canceled_at não deveria ter DEFAULT.';
  end if;

  -- 3.b) status_check: exatamente 1, nome preservado, 5 valores.
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

  -- 3.c) operation_type constraint intacta (nome + definição literal).
  select pg_get_constraintdef(oid) into v_optype_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_type_check';
  if v_optype_condef is distinct from
    'CHECK ((operation_type = ANY (ARRAY[''CHECKOUT''::text, ''PUBLIC_ORDER''::text, ''INTERNAL_ORDER''::text, ''ONBOARDING''::text, ''FISCAL_RULE_MUTATION''::text, ''NFCE_EMISSION''::text, ''USER_ADMIN_MUTATION''::text])))'
  then
    raise exception 'postcheck 149: app_maintenance_operations_operation_type_check foi alterada.';
  end if;

  -- 3.d) lifecycle_check: exatamente 1, nome preservado, CANCELED suportado.
  select count(*) into v_lifecycle_check_count
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';
  if v_lifecycle_check_count <> 1 then
    raise exception 'postcheck 149: esperado exatamente 1 constraint app_maintenance_operations_lifecycle_check, encontrado %.', v_lifecycle_check_count;
  end if;

  select pg_get_constraintdef(oid) into v_lifecycle_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';

  if v_lifecycle_condef is distinct from
    'CHECK ((((status = ''IN_FLIGHT''::text) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''COMPLETED''::text) AND (completed_at IS NOT NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''FAILED''::text) AND (failed_at IS NOT NULL) AND (completed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''EXPIRED''::text) AND (expired_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''CANCELED''::text) AND (canceled_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL))))'
  then
    raise exception 'postcheck 149: definição final de app_maintenance_operations_lifecycle_check inesperada: %', v_lifecycle_condef;
  end if;

  if v_lifecycle_condef not like '%canceled_at%' then
    raise exception 'postcheck 149: canceled_at não participa da lifecycle_check final.';
  end if;
  if v_lifecycle_condef not like '%''CANCELED''%' then
    raise exception 'postcheck 149: CANCELED não é reconhecido pela lifecycle_check final.';
  end if;

  -- 3.e) status_check e lifecycle_check permanecem constraints distintas.
  if (
    select oid from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check'
  ) = (
    select oid from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check'
  ) then
    raise exception 'postcheck 149: status_check e lifecycle_check não deveriam ser a mesma constraint.';
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

  -- Nenhuma constraint a mais/menos: exatamente as 9 constraints originais
  -- (ADD COLUMN não cria constraint própria; DROP+ADD preserva contagem).
  if (select count(*) from pg_constraint where conrelid = v_reloid) <> 9 then
    raise exception 'postcheck 149: número inesperado de constraints em app_maintenance_operations (esperado 9, encontrado %).',
      (select count(*) from pg_constraint where conrelid = v_reloid);
  end if;

  -- Índices intactos em quantidade e nome (ADD COLUMN não cria índice).
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
