-- ════════════════════════════════════════════════════════════
--  155 — Reconciliação Fence / Drain / Quiescence (B13-A4R2).
--
--  Modelo: CANONICAL_CREATE_OR_REPLACE_NO_DML
--  Converge STATE A (0/8 B13, HML truncado) e STATE B (8/8 canônico).
--  Não reaplica a 154, não reescreve history, não altera 140–154.
--  Sem CREATE/DROP TABLE, coluna, índice, constraint, policy ou event_type.
--  Sem DML de apply em state/events/operations/release_runs/tab_pedidos.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed — STATE A (0/8) ou STATE B (8/8 canônico)
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_assert_oid oid;
  v_begin_oid oid;
  v_checkout_oid oid;
  v_transition_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_pronargs smallint;
  v_pronargdefaults smallint;
  v_b13_names constant text[] := array[
    'app_maintenance_cutover_barrier_internal',
    'app_maintenance_drain_in_flight_count_internal',
    'app_maintenance_operation_expire_internal',
    'app_maintenance_orchestration_fence',
    'app_maintenance_orchestration_drain_start',
    'app_maintenance_orchestration_quiesce',
    'app_maintenance_orchestration_quiescence_probe',
    'app_maintenance_orchestration_release_start'
  ];
  v_all11_names constant text[] := array[
    'app_maintenance_cutover_barrier_internal',
    'app_maintenance_drain_in_flight_count_internal',
    'app_maintenance_operation_expire_internal',
    'app_assert_business_write_allowed',
    'app_maintenance_operation_begin_internal',
    'app_checkout_begin',
    'app_maintenance_orchestration_fence',
    'app_maintenance_orchestration_drain_start',
    'app_maintenance_orchestration_quiesce',
    'app_maintenance_orchestration_quiescence_probe',
    'app_maintenance_orchestration_release_start'
  ];
  v_overload_name text;
  v_b13_name_count integer;
  v_canonical_ok integer;
  v_oid oid;
begin
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'precheck 155: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_maintenance_operations') is null then
    raise exception 'precheck 155: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;
  if to_regclass('public.app_maintenance_events') is null then
    raise exception 'precheck 155: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_release_runs') is null then
    raise exception 'precheck 155: public.app_release_runs não existe (migration 138/153 ausente).';
  end if;
  if to_regclass('public.tab_pedidos') is null then
    raise exception 'precheck 155: public.tab_pedidos não existe.';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 155: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores (drift): %', v_condef;
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 155: replacement ausente — public.app_assert_business_write_allowed(uuid, text) (migration 142).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, p.pronargs, p.pronargdefaults, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_pronargs, v_pronargdefaults, v_owner
    from pg_proc p where p.oid = v_assert_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'void'::regtype
     or v_pronargs is distinct from 2
     or v_pronargdefaults is distinct from 2 then
    raise exception 'precheck 155: replacement com identidade divergente — app_assert_business_write_allowed.';
  end if;

  v_begin_oid := to_regprocedure('public.app_maintenance_operation_begin_internal(text)');
  if v_begin_oid is null then
    raise exception 'precheck 155: replacement ausente — public.app_maintenance_operation_begin_internal(text) (migration 150).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
    from pg_proc p where p.oid = v_begin_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'uuid'::regtype then
    raise exception 'precheck 155: replacement com identidade divergente — app_maintenance_operation_begin_internal.';
  end if;

  v_checkout_oid := to_regprocedure('public.app_checkout_begin(bigint, text[])');
  if v_checkout_oid is null then
    raise exception 'precheck 155: replacement ausente — public.app_checkout_begin(bigint, text[]) (migration 152).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
    from pg_proc p where p.oid = v_checkout_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'jsonb'::regtype then
    raise exception 'precheck 155: replacement com identidade divergente — app_checkout_begin.';
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'precheck 155: public.app_maintenance_orchestration_transition_internal ausente (migration 153).';
  end if;

  select p.proname into v_overload_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (v_all11_names)
  group by p.proname
  having count(*) > 1
  limit 1;
  if v_overload_name is not null then
    raise exception 'precheck 155: overload bloqueado — % tem mais de uma assinatura.', v_overload_name;
  end if;

  select count(distinct p.proname) into v_b13_name_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (v_b13_names);

  if v_b13_name_count between 1 and 7 then
    raise exception 'precheck 155: estado parcial bloqueado — %/8 funções B13 presentes.', v_b13_name_count;
  end if;

  if v_b13_name_count = 8 then
    v_canonical_ok := 0;

    v_oid := to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_cutover_barrier_internal.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_cutover_barrier_internal return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_drain_in_flight_count_internal()');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_drain_in_flight_count_internal.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'integer'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_drain_in_flight_count_internal return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_operation_expire_internal()');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_operation_expire_internal.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_operation_expire_internal return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_fence.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_fence return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_drain_start.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_drain_start return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_quiesce.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_quiesce return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_quiescence_probe.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_quiescence_probe return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    v_oid := to_regprocedure('public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb)');
    if v_oid is null then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_release_start.';
    end if;
    select p.prorettype into v_prorettype from pg_proc p where p.oid = v_oid;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 155: assinatura divergente — app_maintenance_orchestration_release_start return type.';
    end if;
    v_canonical_ok := v_canonical_ok + 1;

    if v_canonical_ok is distinct from 8 then
      raise exception 'precheck 155: assinatura divergente — canônicos=% (esperado 8).', v_canonical_ok;
    end if;
  elsif v_b13_name_count is distinct from 0 then
    raise exception 'precheck 155: contagem B13 inesperada (%).', v_b13_name_count;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) PRIVATE HELPERS (CREATE OR REPLACE)
-- ════════════════════════════════════════════════════════════
create or replace function public.app_maintenance_cutover_barrier_internal(
  p_exclusive boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_exclusive is true then
    perform pg_advisory_xact_lock(154, 1);
  elsif p_exclusive is false then
    perform pg_advisory_xact_lock_shared(154, 1);
  else
    raise exception '%', 'Barreira de cutover exigiu p_exclusive booleano.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;
end;
$$;

comment on function public.app_maintenance_cutover_barrier_internal(boolean) is
  'Barreira PRIVADA de cutover B13. Advisory xact na chave fixa (154, 1): exclusive quando p_exclusive=true, shared quando false. Sem unlock manual, sem chave caller-controlled. Uso interno — não é RPC pública.';

create or replace function public.app_maintenance_drain_in_flight_count_internal()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_epoch integer;
  v_count integer;
begin
  select s.epoch
    into v_epoch
  from public.app_maintenance_state as s
  where s.scope = 'global';

  if not found or v_epoch is null then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  select count(*)::integer
    into v_count
  from public.app_maintenance_operations o
  where o.status = 'IN_FLIGHT'
    and o.maintenance_epoch in (v_epoch - 1, v_epoch);

  return coalesce(v_count, 0);
end;
$$;

comment on function public.app_maintenance_drain_in_flight_count_internal() is
  'Contagem PRIVADA do drain: somente status IN_FLIGHT com maintenance_epoch IN (N-1, N). Não conta histórico terminal. Uso interno — não é RPC pública.';

create or replace function public.app_maintenance_operation_expire_internal()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_epoch integer;
  v_release_id uuid;
  v_id uuid;
  v_row_count integer;
  v_expired_at timestamptz;
begin
  select s.epoch, s.release_id
    into v_epoch, v_release_id
  from public.app_maintenance_state as s
  where s.scope = 'global';

  if not found or v_epoch is null then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  for v_id in
    select o.id
    from public.app_maintenance_operations o
    where o.status = 'IN_FLIGHT'
      and o.expires_at <= clock_timestamp()
      and o.maintenance_epoch in (v_epoch - 1, v_epoch)
    order by o.id asc
    for update
  loop
    v_expired_at := clock_timestamp();

    update public.app_maintenance_operations
    set status = 'EXPIRED',
        expired_at = v_expired_at
    where id = v_id
      and status = 'IN_FLIGHT'
      and expires_at <= clock_timestamp()
      and maintenance_epoch in (v_epoch - 1, v_epoch)
      and completed_at is null
      and failed_at is null
      and canceled_at is null
      and expired_at is null;

    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then
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
        v_epoch,
        v_release_id,
        'OPERATION_EXPIRED',
        'ticker',
        null,
        null,
        null,
        jsonb_build_object('operation_id', v_id),
        now()
      );
    end if;
  end loop;
end;
$$;

comment on function public.app_maintenance_operation_expire_internal() is
  'Expire PRIVADO: somente IN_FLIGHT stale (expires_at <= clock_timestamp) do cohort N-1/N, lock id ASC FOR UPDATE. 1 OPERATION_EXPIRED (source=ticker, metadata.operation_id) por row realmente atualizada. 0 rows = 0 eventos. Idempotente. Uso interno — não é RPC pública.';

-- ════════════════════════════════════════════════════════════
--  2) REPLACEMENTS (CREATE OR REPLACE)
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
       'CANCELED'
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
       'FAILED'
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
  'Autoridade DB do business write fence. Fail-closed. Novo begin (p_operation_id NULL) só em NORMAL|NOTICE|CANCELED — sem grandfather por transaction_timestamp. Operation grandfather somente para operação existente IN_FLIGHT (epoch N-1, tipo, TTL, started_at < fence). Sem bypass genérico. Uso interno — não é RPC pública.';

create or replace function public.app_maintenance_operation_begin_internal(
  p_operation_type text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_epoch integer;
  v_ttl_seconds integer;
begin
  if p_operation_type is null or p_operation_type not in (
    'CHECKOUT',
    'PUBLIC_ORDER',
    'INTERNAL_ORDER',
    'ONBOARDING',
    'FISCAL_RULE_MUTATION',
    'NFCE_EMISSION',
    'USER_ADMIN_MUTATION'
  ) then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  perform public.app_maintenance_cutover_barrier_internal(false);

  perform public.app_assert_business_write_allowed(null, p_operation_type);

  v_ttl_seconds := case p_operation_type
    when 'CHECKOUT' then 120
    when 'PUBLIC_ORDER' then 120
    when 'INTERNAL_ORDER' then 120
    when 'ONBOARDING' then 180
    when 'FISCAL_RULE_MUTATION' then 120
    when 'NFCE_EMISSION' then 120
    when 'USER_ADMIN_MUTATION' then 120
  end;

  if v_ttl_seconds is null then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  select s.epoch into v_epoch
  from public.app_maintenance_state as s
  where s.scope = 'global';

  v_id := gen_random_uuid();

  insert into public.app_maintenance_operations (
    id,
    operation_type,
    status,
    maintenance_epoch,
    started_at,
    heartbeat_at,
    expires_at,
    created_at,
    updated_at
  ) values (
    v_id,
    p_operation_type,
    'IN_FLIGHT',
    v_epoch,
    now(),
    now(),
    now() + make_interval(secs => v_ttl_seconds),
    now(),
    now()
  );

  return v_id;
end;
$$;

comment on function public.app_maintenance_operation_begin_internal(text) is
  'Core PRIVADO do Operation Registry — BEGIN. Ordem B13: shared barrier (154,1) → revalida fence → lê epoch → INSERT IN_FLIGHT. Sem grandfather de transação para begin novo. Sem capturar MAINTENANCE_FENCE_ACTIVE. Uso interno — não é RPC pública.';

create or replace function public.app_checkout_begin(
  p_loja_id bigint,
  p_pedido_ids text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_ids text[];
  v_n integer;
  v_joined text;
  v_key text;
  v_found integer;
  v_op_id uuid;
  v_operation_id uuid;
  v_expires_at timestamptz;
  v_row_count integer;
  v_rec public.tab_pedidos%rowtype;
begin
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

  if p_loja_id is null then
    raise exception 'forbidden';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from p_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  select array_agg(x order by x)
    into v_ids
  from (
    select distinct btrim(x) as x
    from unnest(coalesce(p_pedido_ids, '{}'::text[])) as x
    where x is not null and btrim(x) <> ''
  ) s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 then
    raise exception '%', 'Lista de pedidos vazia.'
      using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_REQUIRED';
  end if;

  v_joined := array_to_string(v_ids, ',');
  if v_n = 1 then
    v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':pedido:' || v_ids[1];
    if length(v_key) > 200 then
      v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
    end if;
  else
    v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
  end if;

  perform public.app_maintenance_cutover_barrier_internal(false);

  v_found := 0;
  for v_rec in
    select p.*
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
    for update
  loop
    v_found := v_found + 1;
    if v_rec.loja_id is distinct from p_loja_id then
      raise exception '%', 'Pedido não pertence à loja informada.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_LOJA_MISMATCH';
    end if;
    if v_rec.status_pagamento = 'pago' then
      raise exception '%', 'Pedido já pago.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDO_ALREADY_PAID';
    end if;
  end loop;

  if v_found <> v_n then
    raise exception '%', 'Pedido não encontrado.'
      using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_NOT_FOUND';
  end if;

  for v_op_id in
    select distinct c.operation_id
    from public.app_checkout_operation_pedidos c
    where c.loja_id = p_loja_id
      and c.pedido_id = any (v_ids)
    order by 1 asc
  loop
    perform 1
    from public.app_maintenance_operations o
    where o.id = v_op_id
    for update;

    update public.app_maintenance_operations
    set status = 'EXPIRED',
        expired_at = now()
    where id = v_op_id
      and operation_type = 'CHECKOUT'
      and status = 'IN_FLIGHT'
      and expires_at <= clock_timestamp()
      and completed_at is null
      and failed_at is null
      and canceled_at is null;
  end loop;

  if exists (
    select 1
    from public.app_checkout_operation_pedidos c
    join public.app_maintenance_operations o on o.id = c.operation_id
    where c.loja_id = p_loja_id
      and c.pedido_id = any (v_ids)
      and o.operation_type = 'CHECKOUT'
      and o.status = 'IN_FLIGHT'
      and o.expires_at > clock_timestamp()
  ) then
    raise exception '%', 'Já existe um checkout em andamento para um destes pedidos.'
      using errcode = 'P0001', detail = 'CHECKOUT_CLAIM_ACTIVE';
  end if;

  v_operation_id := public.app_maintenance_operation_begin_internal('CHECKOUT');

  update public.app_maintenance_operations
  set operation_key = v_key
  where id = v_operation_id
    and operation_type = 'CHECKOUT'
    and status = 'IN_FLIGHT'
  returning expires_at into v_expires_at;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_expires_at is null then
    raise exception '%', 'Falha ao vincular a chave da operação de checkout.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_KEY_BIND_FAILED';
  end if;

  insert into public.app_checkout_operation_pedidos (
    operation_id,
    loja_id,
    pedido_id,
    claimed_at
  )
  select v_operation_id, p_loja_id, x, now()
  from unnest(v_ids) as x;

  return jsonb_build_object(
    'operation_id', v_operation_id,
    'operation_key', v_key,
    'pedido_ids', to_jsonb(v_ids),
    'expires_at', v_expires_at
  );
end;
$$;

comment on function public.app_checkout_begin(bigint, text[]) is
  'Checkout + Operation Registry: caixa autenticado. Shared cutover barrier antes de tab_pedidos ASC, recusa já pagos, expira claims stale e cria claims CHECKOUT. Sem mutação comercial.';

-- ════════════════════════════════════════════════════════════
--  3) PUBLIC RPCS (CREATE OR REPLACE)
-- ════════════════════════════════════════════════════════════
create or replace function public.app_maintenance_orchestration_fence(
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
  v_release_id uuid;
  v_target_sha text;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, release_id, target_sha
    into v_phase, v_version, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'NOTICE' then
    raise exception '%', 'Fence só pode iniciar a partir de NOTICE.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_release_id is null or v_target_sha is null then
    raise exception '%', 'Active orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  update public.app_maintenance_state
  set epoch = epoch + 1,
      fence_effective_at = clock_timestamp()
  where scope = 'global';

  perform public.app_maintenance_orchestration_transition_internal(
    'NOTICE',
    p_expected_version,
    'FENCING',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'FENCE_STARTED',
    'api',
    p_reason,
    p_metadata
  );
end;
$$;

comment on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — FENCE. Exclusive barrier, state FOR UPDATE, NOTICE+version+binding, epoch+1 e fence_effective_at sem version+1, depois transition_internal NOTICE->FENCING (FENCE_STARTED no NEW_EPOCH). Rollback atômico.';

create or replace function public.app_maintenance_orchestration_drain_start(
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
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version
    into v_phase, v_version
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'FENCING' then
    raise exception '%', 'Drain só pode iniciar a partir de FENCING.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    'FENCING',
    p_expected_version,
    'DRAINING',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'DRAIN_STARTED',
    'api',
    p_reason,
    p_metadata
  );

  update public.app_maintenance_state
  set drain_started_at = clock_timestamp()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — DRAIN_START. Exclusive barrier, FENCING+version, transition_internal FENCING->DRAINING (DRAIN_STARTED), drain_started_at na mesma transação sem segundo version+1. Não exige drain=0.';

create or replace function public.app_maintenance_orchestration_quiesce(
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
  v_fence_effective_at timestamptz;
  v_count integer;
  v_quiet_at timestamptz;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, fence_effective_at
    into v_phase, v_version, v_epoch, v_release_id, v_fence_effective_at
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'DRAINING' then
    raise exception '%', 'Quiesce só é permitido a partir de DRAINING.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_epoch is null or v_epoch < 1 or v_fence_effective_at is null then
    raise exception '%', 'Fence efetivo ausente para quiesce.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  perform public.app_maintenance_operation_expire_internal();

  v_count := public.app_maintenance_drain_in_flight_count_internal();

  if v_count is distinct from 0 then
    raise exception '%', 'Ainda existem operações em voo no ciclo corrente.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

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
  )
  select
    gen_random_uuid(),
    v_epoch,
    v_release_id,
    'OPERATION_DRAINED',
    'api',
    p_actor_user_id,
    p_actor_email,
    p_reason,
    jsonb_build_object('operation_id', o.id),
    now()
  from public.app_maintenance_operations o
  where o.maintenance_epoch in (v_epoch - 1, v_epoch)
    and o.status in ('COMPLETED', 'FAILED', 'CANCELED')
    and coalesce(o.completed_at, o.failed_at, o.canceled_at) >= v_fence_effective_at
    and not exists (
      select 1
      from public.app_maintenance_events e
      where e.event_type = 'OPERATION_DRAINED'
        and e.maintenance_epoch = v_epoch
        and e.metadata->>'operation_id' = o.id::text
    );

  perform public.app_maintenance_orchestration_transition_internal(
    'DRAINING',
    p_expected_version,
    'QUIESCENT',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'QUIESCENCE_REACHED',
    'api',
    p_reason,
    p_metadata
  );

  v_quiet_at := clock_timestamp();

  update public.app_maintenance_state
  set quiet_since = v_quiet_at,
      quiescent_at = v_quiet_at
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — QUIESCE. Exclusive barrier, DRAINING+version, expire_internal, drain count;

create or replace function public.app_maintenance_orchestration_quiescence_probe(
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
  v_target_sha text;
  v_count integer;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, target_sha
    into v_phase, v_version, v_epoch, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'QUIESCENT' then
    raise exception '%', 'Probe de quiescência só é permitido em QUIESCENT.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_release_id is null or v_target_sha is null then
    raise exception '%', 'Active orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  v_count := public.app_maintenance_drain_in_flight_count_internal();
  if v_count is distinct from 0 then
    raise exception '%', 'Ainda existem operações em voo no ciclo corrente.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if exists (
    select 1
    from public.app_maintenance_events e
    where e.event_type = 'QUIESCENCE_PROBE_PASSED'
      and e.maintenance_epoch = v_epoch
  ) then
    return;
  end if;

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
    v_epoch,
    v_release_id,
    'QUIESCENCE_PROBE_PASSED',
    'probe',
    p_actor_user_id,
    p_actor_email,
    p_reason,
    p_metadata,
    now()
  );
end;
$$;

comment on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — QUIESCENCE_PROBE. Não é edge estrutural. Exclusive barrier, QUIESCENT+version+binding, drain count=0, insere QUIESCENCE_PROBE_PASSED (source=probe). Idempotente por epoch. Não altera phase/version/binding/epoch.';

create or replace function public.app_maintenance_orchestration_release_start(
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
  v_target_sha text;
  v_release_status text;
  v_release_target_sha text;
  v_count integer;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, epoch, release_id, target_sha
    into v_phase, v_version, v_epoch, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'QUIESCENT' then
    raise exception '%', 'Release só pode iniciar a partir de QUIESCENT.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  if v_release_id is null or v_target_sha is null then
    raise exception '%', 'Active orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  select r.status, r.target_sha
    into v_release_status, v_release_target_sha
  from public.app_release_runs r
  where r.id = v_release_id
  for update;

  if not found then
    raise exception '%', 'Release informada não existe.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_release_status not in (
    'REQUESTED',
    'SCHEDULED',
    'WAITING',
    'VALIDATING',
    'DISPATCHED',
    'RUNNING'
  ) then
    raise exception '%', 'Release não está em status ativo para orquestração.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_release_target_sha is distinct from v_target_sha then
    raise exception '%', 'target_sha informado não corresponde ao target_sha real da release.'
      using errcode = 'P0001', detail = 'TARGET_MISMATCH';
  end if;

  v_count := public.app_maintenance_drain_in_flight_count_internal();
  if v_count is distinct from 0 then
    raise exception '%', 'Ainda existem operações em voo no ciclo corrente.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.app_maintenance_events e
    where e.event_type = 'QUIESCENCE_PROBE_PASSED'
      and e.maintenance_epoch = v_epoch
  ) then
    raise exception '%', 'Probe de quiescência obrigatório antes de RELEASING.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    'QUIESCENT',
    p_expected_version,
    'RELEASING',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'RELEASE_STARTED',
    'api',
    p_reason,
    p_metadata
  );

  update public.app_maintenance_state
  set release_started_at = clock_timestamp()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — RELEASE_START. Exclusive barrier, QUIESCENT+version+binding, lock da release bound (sem UPDATE), status ativo, target_sha match, drain count=0, QUIESCENCE_PROBE_PASSED do epoch, transition_internal QUIESCENT->RELEASING (RELEASE_STARTED), release_started_at sem segundo version+1. B13_MUTATES_RELEASE_RUN = NÃO.';

-- ════════════════════════════════════════════════════════════
--  4) OWNER / SECURITY / search_path
-- ════════════════════════════════════════════════════════════
alter function public.app_maintenance_cutover_barrier_internal(boolean) owner to postgres;
alter function public.app_maintenance_drain_in_flight_count_internal() owner to postgres;
alter function public.app_maintenance_operation_expire_internal() owner to postgres;
alter function public.app_assert_business_write_allowed(uuid, text) owner to postgres;
alter function public.app_maintenance_operation_begin_internal(text) owner to postgres;
alter function public.app_checkout_begin(bigint, text[]) owner to postgres;
alter function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) owner to postgres;
alter function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  5) ACLs
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_maintenance_cutover_barrier_internal(boolean) from public;
revoke all on function public.app_maintenance_cutover_barrier_internal(boolean) from anon;
revoke all on function public.app_maintenance_cutover_barrier_internal(boolean) from authenticated;
revoke all on function public.app_maintenance_cutover_barrier_internal(boolean) from service_role;

revoke all on function public.app_maintenance_drain_in_flight_count_internal() from public;
revoke all on function public.app_maintenance_drain_in_flight_count_internal() from anon;
revoke all on function public.app_maintenance_drain_in_flight_count_internal() from authenticated;
revoke all on function public.app_maintenance_drain_in_flight_count_internal() from service_role;

revoke all on function public.app_maintenance_operation_expire_internal() from public;
revoke all on function public.app_maintenance_operation_expire_internal() from anon;
revoke all on function public.app_maintenance_operation_expire_internal() from authenticated;
revoke all on function public.app_maintenance_operation_expire_internal() from service_role;

revoke all on function public.app_assert_business_write_allowed(uuid, text) from public;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from anon;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from authenticated;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from service_role;

revoke all on function public.app_maintenance_operation_begin_internal(text) from public;
revoke all on function public.app_maintenance_operation_begin_internal(text) from anon;
revoke all on function public.app_maintenance_operation_begin_internal(text) from authenticated;
revoke all on function public.app_maintenance_operation_begin_internal(text) from service_role;

revoke all on function public.app_checkout_begin(bigint, text[]) from public;
revoke all on function public.app_checkout_begin(bigint, text[]) from anon;
revoke all on function public.app_checkout_begin(bigint, text[]) from service_role;
grant execute on function public.app_checkout_begin(bigint, text[]) to authenticated;

revoke all on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) from service_role;
grant execute on function public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb) to service_role;

revoke all on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) from service_role;
grant execute on function public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb) to service_role;

revoke all on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) from service_role;
grant execute on function public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb) to service_role;

revoke all on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) from service_role;
grant execute on function public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb) to service_role;

revoke all on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) from service_role;
grant execute on function public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb) to service_role;

-- ════════════════════════════════════════════════════════════
--  6) POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_pronargs smallint;
  v_pronargdefaults smallint;
  v_public_execute boolean;
  v_private_count integer;
  v_public_count integer;
  v_replaced_count integer;
  v_overload_name text;
  v_src text;
  v_idx_expire integer;
  v_idx_count integer;
  v_idx_drained integer;
  v_idx_transition integer;
  v_all11_names constant text[] := array[
    'app_maintenance_cutover_barrier_internal',
    'app_maintenance_drain_in_flight_count_internal',
    'app_maintenance_operation_expire_internal',
    'app_assert_business_write_allowed',
    'app_maintenance_operation_begin_internal',
    'app_checkout_begin',
    'app_maintenance_orchestration_fence',
    'app_maintenance_orchestration_drain_start',
    'app_maintenance_orchestration_quiesce',
    'app_maintenance_orchestration_quiescence_probe',
    'app_maintenance_orchestration_release_start'
  ];
begin
  v_events_reloid := to_regclass('public.app_maintenance_events');
  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'postcheck 155: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores: %', v_condef;
  end if;

  if to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  ) is null then
    raise exception 'postcheck 155: transition_internal B12 não está intacto.';
  end if;

  select p.proname into v_overload_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (v_all11_names)
  group by p.proname
  having count(*) > 1
  limit 1;
  if v_overload_name is not null then
    raise exception 'postcheck 155: overload — % tem mais de uma assinatura.', v_overload_name;
  end if;

  select count(*) into v_private_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_maintenance_cutover_barrier_internal',
      'app_maintenance_drain_in_flight_count_internal',
      'app_maintenance_operation_expire_internal'
    );
  if v_private_count <> 3 then
    raise exception 'postcheck 155: esperado exatamente 3 helpers privados finais (count=%).', v_private_count;
  end if;

  select count(*) into v_public_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_maintenance_orchestration_fence',
      'app_maintenance_orchestration_drain_start',
      'app_maintenance_orchestration_quiesce',
      'app_maintenance_orchestration_quiescence_probe',
      'app_maintenance_orchestration_release_start'
    );
  if v_public_count <> 5 then
    raise exception 'postcheck 155: esperado exatamente 5 RPCs públicas finais (count=%).', v_public_count;
  end if;

  select count(*) into v_replaced_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_assert_business_write_allowed',
      'app_maintenance_operation_begin_internal',
      'app_checkout_begin'
    );
  if v_replaced_count <> 3 then
    raise exception 'postcheck 155: esperado exatamente 3 replacements finais (count=%).', v_replaced_count;
  end if;

  foreach v_oid in array array[
    to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)'),
    to_regprocedure('public.app_maintenance_drain_in_flight_count_internal()'),
    to_regprocedure('public.app_maintenance_operation_expire_internal()')
  ]
  loop
    if v_oid is null then
      raise exception 'postcheck 155: helper privado final não encontrado.';
    end if;
    select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner)
      into v_prosecdef, v_proconfig, v_owner
      from pg_proc p where p.oid = v_oid;
    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 155: privada — owner deveria ser postgres.';
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 155: privada — deveria ser SECURITY DEFINER.';
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 155: privada — proconfig deveria conter search_path=public.';
    end if;
    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute')
       or has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 155: privada NÃO deveria ter EXECUTE para anon/authenticated/service_role.';
    end if;
    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'postcheck 155: privada — PUBLIC (grantee=0) NÃO deveria ter EXECUTE.';
    end if;
  end loop;

  foreach v_oid in array array[
    to_regprocedure('public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb)'),
    to_regprocedure('public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb)'),
    to_regprocedure('public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb)'),
    to_regprocedure('public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb)'),
    to_regprocedure('public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb)')
  ]
  loop
    if v_oid is null then
      raise exception 'postcheck 155: RPC pública final não encontrada.';
    end if;
    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
      into v_prosecdef, v_proconfig, v_prorettype, v_owner
      from pg_proc p where p.oid = v_oid;
    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 155: pública — owner deveria ser postgres.';
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 155: pública — deveria ser SECURITY DEFINER.';
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 155: pública — proconfig deveria conter search_path=public.';
    end if;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'postcheck 155: pública — return type deveria ser void.';
    end if;
    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 155: pública NÃO deveria ter EXECUTE para anon/authenticated.';
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 155: pública deveria ter EXECUTE para service_role.';
    end if;
  end loop;

  v_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_oid is null then
    raise exception 'postcheck 155: app_assert_business_write_allowed(uuid, text) não encontrada.';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, p.pronargs, p.pronargdefaults, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_pronargs, v_pronargdefaults, v_owner
    from pg_proc p where p.oid = v_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_prorettype is distinct from 'void'::regtype
     or v_pronargs is distinct from 2
     or v_pronargdefaults is distinct from 2
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 155: app_assert_business_write_allowed — contrato quebrado.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute')
     or has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'postcheck 155: app_assert_business_write_allowed NÃO deveria ter EXECUTE para clientes/service_role.';
  end if;

  v_oid := to_regprocedure('public.app_maintenance_operation_begin_internal(text)');
  if v_oid is null then
    raise exception 'postcheck 155: app_maintenance_operation_begin_internal(text) não encontrada.';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
    from pg_proc p where p.oid = v_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_prorettype is distinct from 'uuid'::regtype
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 155: app_maintenance_operation_begin_internal — contrato quebrado.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute')
     or has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'postcheck 155: begin_internal NÃO deveria ter EXECUTE para clientes/service_role.';
  end if;

  v_oid := to_regprocedure('public.app_checkout_begin(bigint, text[])');
  if v_oid is null then
    raise exception 'postcheck 155: app_checkout_begin(bigint, text[]) não encontrada.';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
    from pg_proc p where p.oid = v_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_prorettype is distinct from 'jsonb'::regtype
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 155: app_checkout_begin — contrato quebrado.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'postcheck 155: app_checkout_begin NÃO deveria ter EXECUTE para anon/service_role.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'postcheck 155: app_checkout_begin deveria preservar EXECUTE para authenticated.';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb)');
  if v_src is null then
    raise exception 'postcheck 155: prosrc de quiesce ausente.';
  end if;
  v_idx_expire := strpos(v_src, 'app_maintenance_operation_expire_internal');
  v_idx_count := strpos(v_src, 'app_maintenance_drain_in_flight_count_internal');
  v_idx_drained := strpos(v_src, 'OPERATION_DRAINED');
  v_idx_transition := strpos(v_src, 'app_maintenance_orchestration_transition_internal');
  if v_idx_expire < 1
     or v_idx_count <= v_idx_expire
     or v_idx_drained <= v_idx_count
     or v_idx_transition <= v_idx_drained then
    raise exception 'postcheck 155: quiesce violou EXPIRE < COUNT < DRAINED < TRANSITION.';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb)');
  if v_src is null then
    raise exception 'postcheck 155: prosrc de release_start ausente.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 155: release_start não pode UPDATE app_release_runs.';
  end if;
end $$;

commit;
