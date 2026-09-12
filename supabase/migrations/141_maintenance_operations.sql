-- ════════════════════════════════════════════════════════════
--  141 — Operation Registry do Maintenance Write Fence.
--
--  Cria public.app_maintenance_operations: registro server-side
--  de operações críticas que precisam ser drenadas antes de
--  QUIESCENT (checkout, pedidos, onboarding, mutações fiscais,
--  emissão de NFC-e, mutações de usuário/admin).
--
--  NÃO é tabela de auditoria — não substitui app_maintenance_events.
--  NÃO cria eventos automaticamente neste gate.
--
--  MODELO DE AUTORIDADE (ver seção 14 do gate):
--  - somente backend/service_role opera este registry;
--  - PUBLIC_ORDER não significa que navegador/anon pode inserir —
--    begin/end públicos futuros continuam passando por autoridade
--    server-side, nunca por acesso direto de cliente à tabela;
--  - ausência/deleção de registro NÃO é mecanismo normal de
--    conclusão: terminalização ocorre via UPDATE de status
--    (COMPLETED/FAILED/EXPIRED);
--  - registros terminais são preservados (sem DELETE concedido);
--  - política de retenção fica fora deste gate.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production neste
--  microgate. NÃO cria API, frontend, RPC pública, policy, trigger
--  (heartbeat/updated_at/event/guard) nem TTL por operation_type.
--  NÃO altera app_maintenance_state, app_maintenance_events, a
--  migration 140 nem tabelas de negócio.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'precheck 141: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_maintenance_events') is null then
    raise exception 'precheck 141: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_maintenance_operations') is not null then
    raise exception 'precheck 141: public.app_maintenance_operations já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) APP_MAINTENANCE_OPERATIONS
-- ════════════════════════════════════════════════════════════
create table public.app_maintenance_operations (
  id uuid primary key,
  operation_type text not null,
  status text not null default 'IN_FLIGHT',
  maintenance_epoch integer not null,
  operation_key text null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  expired_at timestamptz null,
  failure_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_maintenance_operations_operation_type_check
    check (operation_type in (
      'CHECKOUT',
      'PUBLIC_ORDER',
      'INTERNAL_ORDER',
      'ONBOARDING',
      'FISCAL_RULE_MUTATION',
      'NFCE_EMISSION',
      'USER_ADMIN_MUTATION'
    )),
  constraint app_maintenance_operations_status_check
    check (status in (
      'IN_FLIGHT',
      'COMPLETED',
      'FAILED',
      'EXPIRED'
    )),
  constraint app_maintenance_operations_epoch_check
    check (maintenance_epoch >= 0),
  constraint app_maintenance_operations_operation_key_check
    check (
      operation_key is null
      or (length(operation_key) <= 200 and length(btrim(operation_key)) > 0)
    ),
  constraint app_maintenance_operations_failure_code_check
    check (
      failure_code is null
      or (length(failure_code) <= 200 and length(btrim(failure_code)) > 0)
    ),
  constraint app_maintenance_operations_expires_after_started_check
    check (expires_at > started_at),
  constraint app_maintenance_operations_heartbeat_after_started_check
    check (heartbeat_at >= started_at),
  constraint app_maintenance_operations_lifecycle_check
    check (
      (status = 'IN_FLIGHT'
        and completed_at is null and failed_at is null and expired_at is null)
      or (status = 'COMPLETED'
        and completed_at is not null and failed_at is null and expired_at is null)
      or (status = 'FAILED'
        and failed_at is not null and completed_at is null and expired_at is null)
      or (status = 'EXPIRED'
        and expired_at is not null and completed_at is null and failed_at is null)
    )
);

comment on table public.app_maintenance_operations is
  'Operation Registry do Maintenance Write Fence: operações críticas que precisam ser drenadas antes de QUIESCENT. Não é tabela de auditoria (ver app_maintenance_events). Somente backend/service_role opera este registry — PUBLIC_ORDER não significa que navegador/anon pode inserir; begin/end públicos futuros continuam passando por autoridade server-side. Ausência/deleção de registro não é mecanismo normal de conclusão: terminalização ocorre via UPDATE de status. Registros terminais são preservados; política de retenção fica fora deste gate.';

alter table public.app_maintenance_operations enable row level security;

revoke all on table public.app_maintenance_operations from public;
revoke all on table public.app_maintenance_operations from anon;
revoke all on table public.app_maintenance_operations from authenticated;
-- Revoga defaults do Supabase (ALL em service_role) antes do grant mínimo.
revoke all on table public.app_maintenance_operations from service_role;

grant select, insert, update on table public.app_maintenance_operations to service_role;

-- ════════════════════════════════════════════════════════════
--  2) ÍNDICES DE DRAIN
-- ════════════════════════════════════════════════════════════
-- A) Drain por expiração: só operações vivas importam para o ticker futuro.
create index app_maintenance_operations_in_flight_expires_idx
  on public.app_maintenance_operations (expires_at)
  where status = 'IN_FLIGHT';

-- B) Drain por ciclo de manutenção.
create index app_maintenance_operations_epoch_status_idx
  on public.app_maintenance_operations (maintenance_epoch, status);

-- C) Consulta por tipo de operação.
create index app_maintenance_operations_type_status_idx
  on public.app_maintenance_operations (operation_type, status);

-- D) Impede duas operações ativas com a mesma chave, sem impedir novo
--    ciclo após terminalização (status sai de IN_FLIGHT).
create unique index app_maintenance_operations_operation_key_in_flight_uidx
  on public.app_maintenance_operations (operation_key)
  where status = 'IN_FLIGHT' and operation_key is not null;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_rls boolean;
  v_policy_count integer;
  v_public_priv boolean;
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'postcheck 141: public.app_maintenance_operations não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_reloid;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 141: RLS deveria estar habilitada em app_maintenance_operations.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_maintenance_operations';
  if v_policy_count <> 0 then
    raise exception 'postcheck 141: app_maintenance_operations não deve ter policies (policy_count=0).';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_type_check'
  ) then
    raise exception 'postcheck 141: constraint de operation_type ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check'
  ) then
    raise exception 'postcheck 141: constraint de status ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_epoch_check'
  ) then
    raise exception 'postcheck 141: constraint de maintenance_epoch ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_key_check'
  ) then
    raise exception 'postcheck 141: constraint de operation_key ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_failure_code_check'
  ) then
    raise exception 'postcheck 141: constraint de failure_code ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_expires_after_started_check'
  ) then
    raise exception 'postcheck 141: constraint de expires_at>started_at ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_heartbeat_after_started_check'
  ) then
    raise exception 'postcheck 141: constraint de heartbeat_at>=started_at ausente.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check'
  ) then
    raise exception 'postcheck 141: constraint de coerência de lifecycle ausente.';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'maintenance_epoch' and atthasdef = false
  ) then
    raise exception 'postcheck 141: maintenance_epoch não deveria ter default.';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = v_reloid and contype = 'f'
  ) then
    raise exception 'postcheck 141: app_maintenance_operations não deveria ter FK (epoch não é chave de app_maintenance_state).';
  end if;

  if has_table_privilege('anon', 'public.app_maintenance_operations', 'select')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'insert')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'update')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'delete')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'truncate')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'references')
     or has_table_privilege('anon', 'public.app_maintenance_operations', 'trigger') then
    raise exception 'postcheck 141: anon não deveria ter privilégios em app_maintenance_operations.';
  end if;

  if has_table_privilege('authenticated', 'public.app_maintenance_operations', 'select')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'insert')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'update')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'delete')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'truncate')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'references')
     or has_table_privilege('authenticated', 'public.app_maintenance_operations', 'trigger') then
    raise exception 'postcheck 141: authenticated não deveria ter privilégios em app_maintenance_operations.';
  end if;

  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;
  if v_public_priv then
    raise exception 'postcheck 141: PUBLIC não deveria ter privilégios em app_maintenance_operations.';
  end if;

  if not has_table_privilege('service_role', 'public.app_maintenance_operations', 'select') then
    raise exception 'postcheck 141: service_role deveria ter SELECT em app_maintenance_operations.';
  end if;
  if not has_table_privilege('service_role', 'public.app_maintenance_operations', 'insert') then
    raise exception 'postcheck 141: service_role deveria ter INSERT em app_maintenance_operations.';
  end if;
  if not has_table_privilege('service_role', 'public.app_maintenance_operations', 'update') then
    raise exception 'postcheck 141: service_role deveria ter UPDATE em app_maintenance_operations.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_operations', 'delete') then
    raise exception 'postcheck 141: service_role NÃO deveria ter DELETE em app_maintenance_operations.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_operations', 'truncate') then
    raise exception 'postcheck 141: service_role NÃO deveria ter TRUNCATE em app_maintenance_operations.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_operations', 'references') then
    raise exception 'postcheck 141: service_role NÃO deveria ter REFERENCES em app_maintenance_operations.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_operations', 'trigger') then
    raise exception 'postcheck 141: service_role NÃO deveria ter TRIGGER em app_maintenance_operations.';
  end if;

  if not exists (
    select 1 from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = v_reloid and ic.relname = 'app_maintenance_operations_in_flight_expires_idx'
  ) then
    raise exception 'postcheck 141: índice app_maintenance_operations_in_flight_expires_idx ausente.';
  end if;
  if not exists (
    select 1 from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = v_reloid and ic.relname = 'app_maintenance_operations_epoch_status_idx'
  ) then
    raise exception 'postcheck 141: índice app_maintenance_operations_epoch_status_idx ausente.';
  end if;
  if not exists (
    select 1 from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = v_reloid and ic.relname = 'app_maintenance_operations_type_status_idx'
  ) then
    raise exception 'postcheck 141: índice app_maintenance_operations_type_status_idx ausente.';
  end if;
  if not exists (
    select 1 from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = v_reloid
      and ic.relname = 'app_maintenance_operations_operation_key_in_flight_uidx'
      and i.indisunique
  ) then
    raise exception 'postcheck 141: índice único parcial de operation_key ausente ou não-único.';
  end if;

  if exists (
    select 1 from public.app_maintenance_state where scope <> 'global' or version is null
  ) and false then
    -- Placeholder de guarda: nunca verdadeiro; mantém leitura zero-mutação explícita.
    raise exception 'postcheck 141: guarda inatingível.';
  end if;
end $$;

commit;
