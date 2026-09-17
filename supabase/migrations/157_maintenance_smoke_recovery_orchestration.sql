-- ════════════════════════════════════════════════════════════
--  157 — Maintenance / Smoke + Recovery Orchestration (B16-A2).
--
--  Introduz as 3 RPCs públicas do recorte B16 e amplia a allowlist
--  da fail existente para aceitar RECOVERING como source adicional:
--
--    public.app_maintenance_orchestration_smoke(...)
--    public.app_maintenance_orchestration_success(...)
--    public.app_maintenance_orchestration_recover(...)
--    public.app_maintenance_orchestration_fail(...)  -- REPLACE
--
--  As 4 edges B16 já existem no core (migration 153)
--  app_maintenance_orchestration_transition_internal e NÃO são
--  alteradas aqui:
--    RELEASING  -> SMOKE      (SMOKE_STARTED)
--    SMOKE      -> NORMAL     (MAINTENANCE_COMPLETED)  -- único clear
--    SMOKE      -> RECOVERING (RECOVERY_STARTED)
--    RECOVERING -> FAILED     (MAINTENANCE_FAILED)
--
--  version = version + 1 permanece exclusividade do core.
--  Os UPDATEs laterais de timestamp (smoke_started_at /
--  completed_at / recovering_at) NÃO incrementam version nem epoch.
--  B16 NÃO incrementa epoch (somente fence).
--  B16 NÃO altera app_release_runs.
--  timeout_at permanece reservado (sem writer, sem scheduler).
--
--  ESCOPO NEGATIVO — NÃO cria edge/event_type/coluna/tabela.
--  NÃO altera transition_internal, binding_guard, start, cancel,
--  fence, drain, quiesce, probe, release_start, notice.
--  NÃO cria abort/reopen/rehearsal/readiness/notice_tick.
--  NÃO faz apply-time business DML. NÃO edita as migrations
--  140-156. NÃO aplica esta migration em HML/Production neste
--  microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_state_reloid oid;
  v_events_reloid oid;
  v_release_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_transition_oid oid;
  v_guard_oid oid;
  v_barrier_oid oid;
  v_fail_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_col_type text;
  v_col text;
  v_expected text;
  v_src text;
  v_from text;
  v_to text;
  v_edge_count integer := 0;
  v_count integer;
begin
  v_state_reloid := to_regclass('public.app_maintenance_state');
  if v_state_reloid is null then
    raise exception 'precheck 157: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 157: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  v_release_reloid := to_regclass('public.app_release_runs');
  if v_release_reloid is null then
    raise exception 'precheck 157: public.app_release_runs não existe (migration 138 ausente).';
  end if;

  -- Colunas de app_release_runs realmente usadas por smoke (id, status,
  -- target_sha). Somente leitura via pg_attribute/format_type — fail-closed
  -- antes do CREATE FUNCTION. Tipos canônicos observados no schema atual
  -- (format_type): uuid / text / text. Não adivinhar; drift aborta.
  for v_col, v_expected in
    select * from (values
      ('id',         'uuid'),
      ('status',     'text'),
      ('target_sha', 'text')
    ) as cols(col, typ)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_col_type
    from pg_attribute a
    where a.attrelid = v_release_reloid and a.attname = v_col and not a.attisdropped;
    if v_col_type is null then
      raise exception 'precheck 157: coluna % ausente em app_release_runs (migration 138 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 157: coluna app_release_runs.% deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

  -- Colunas estruturais já existentes (migration 140). Somente leitura
  -- via pg_attribute/format_type — fail-closed, sem ALTER/ADD COLUMN.
  for v_col, v_expected in
    select * from (values
      ('smoke_started_at',    'timestamp with time zone'),
      ('completed_at',        'timestamp with time zone'),
      ('recovering_at',       'timestamp with time zone'),
      ('timeout_at',          'timestamp with time zone'),
      ('release_started_at',  'timestamp with time zone'),
      ('result_code',         'text'),
      ('release_id',          'uuid'),
      ('target_sha',          'text'),
      ('version',             'integer'),
      ('epoch',               'integer'),
      ('phase',               'text')
    ) as cols(col, typ)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_col_type
    from pg_attribute a
    where a.attrelid = v_state_reloid and a.attname = v_col and not a.attisdropped;
    if v_col_type is null then
      raise exception 'precheck 157: coluna % ausente em app_maintenance_state (migration 140 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 157: coluna % deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

  -- Contrato de event_type continua exatamente nos 17 valores herdados —
  -- 157 não amplia event_type.
  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 157: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores (drift): %', v_condef;
  end if;

  -- Core privado (migration 153) precisa existir com o contrato real.
  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_transition_internal(...) não existe (migration 153 ausente).';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_transition_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 157: transition_internal — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 157: transition_internal — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 157: transition_internal — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 157: transition_internal — return type deveria ser void.';
  end if;

  -- 16 edges estruturais intactas, inclusive as 4 edges B16 já
  -- existentes. 157 não cria edge nova.
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
      raise exception 'precheck 157: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'precheck 157: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;

  -- Binding guard (função + trigger) precisa existir.
  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if v_guard_oid is null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_binding_guard() não existe (migration 153 ausente).';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'precheck 157: trigger app_maintenance_orchestration_binding_guard_trg ausente (migration 153).';
  end if;

  -- Cutover barrier B13 (chave fixa 154, 1).
  v_barrier_oid := to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)');
  if v_barrier_oid is null then
    raise exception 'precheck 157: public.app_maintenance_cutover_barrier_internal(boolean) não existe (migration 154/155 ausente).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_barrier_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 157: cutover barrier com identidade divergente.';
  end if;
  if position('pg_advisory_xact_lock(154, 1)' in v_src) = 0 then
    raise exception 'precheck 157: cutover barrier deveria usar pg_advisory_xact_lock(154, 1).';
  end if;

  -- Fail existente: assinatura canônica B12, sem overload.
  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_fail(...) não existe (migration 153 ausente).';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_fail';
  if v_count <> 1 then
    raise exception 'precheck 157: fail deveria ter exatamente 1 assinatura (count=%).', v_count;
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_fail_oid;
  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 157: fail — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 157: fail — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 157: fail — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 157: fail — return type deveria ser void.';
  end if;
  if v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT''\)' then
    raise exception 'precheck 157: fail existente deveria permitir somente FENCING/DRAINING/QUIESCENT (migration 153).';
  end if;

  -- Colisão: as 3 RPCs B16 novas ainda não podem existir, em nenhuma assinatura.
  if to_regprocedure(
    'public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb)'
  ) is not null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_smoke(...) já existe.';
  end if;
  if to_regprocedure(
    'public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb)'
  ) is not null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_success(...) já existe.';
  end if;
  if to_regprocedure(
    'public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb)'
  ) is not null then
    raise exception 'precheck 157: public.app_maintenance_orchestration_recover(...) já existe.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_maintenance_orchestration_smoke',
        'app_maintenance_orchestration_success',
        'app_maintenance_orchestration_recover'
      )
  ) then
    raise exception 'precheck 157: colisão de nome — alguma RPC B16 já existe com outra assinatura.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) PUBLIC RPC — app_maintenance_orchestration_smoke
--     (RELEASING -> SMOKE)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_smoke(
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
  v_release_started_at timestamptz;
  v_release_status text;
  v_release_target_sha text;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  -- Lock order: state (scope='global') -> release bound. Nunca release primeiro.
  select phase, version, release_id, target_sha, release_started_at
    into v_phase, v_version, v_release_id, v_target_sha, v_release_started_at
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'RELEASING' then
    raise exception '%', 'Smoke só pode iniciar a partir de RELEASING.'
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

  if v_release_started_at is null then
    raise exception '%', 'Release do ciclo ainda não foi iniciada.'
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

  -- A release pode já estar terminalizada pelo executor. Somente
  -- CANCELED/BLOCKED são conflito. Não exige ACTIVE_RELEASE_STATUSES.
  if v_release_status in ('CANCELED', 'BLOCKED') then
    raise exception '%', 'Release bound está CANCELED ou BLOCKED.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_release_target_sha is distinct from v_target_sha then
    raise exception '%', 'target_sha informado não corresponde ao target_sha real da release.'
      using errcode = 'P0001', detail = 'TARGET_MISMATCH';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    'RELEASING',
    p_expected_version,
    'SMOKE',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'SMOKE_STARTED',
    'api',
    p_reason,
    p_metadata
  );

  update public.app_maintenance_state
  set smoke_started_at = clock_timestamp()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — SMOKE. Exclusive barrier (154,1), state FOR UPDATE, CAS RELEASING+version, binding completo, release_started_at NOT NULL, lock da release bound (sem UPDATE; CANCELED/BLOCKED = STATE_CONFLICT; sem ACTIVE_RELEASE_STATUSES), target_sha match, transition_internal RELEASING->SMOKE (SMOKE_STARTED source api), smoke_started_at sem segundo version+1. Binding preservado pelo core. Não altera app_release_runs.';

revoke all on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  2) PUBLIC RPC — app_maintenance_orchestration_success
--     (SMOKE -> NORMAL) — único B16 que limpa binding, via core
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_success(
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
  v_smoke_started_at timestamptz;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, release_id, target_sha, smoke_started_at
    into v_phase, v_version, v_release_id, v_target_sha, v_smoke_started_at
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'SMOKE' then
    raise exception '%', 'Success só pode ocorrer a partir de SMOKE.'
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

  if v_smoke_started_at is null then
    raise exception '%', 'Smoke ainda não foi iniciado.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  -- Clear de binding é determinístico no core (SMOKE->NORMAL).
  -- Não limpar release_id/target_sha manualmente.
  perform public.app_maintenance_orchestration_transition_internal(
    'SMOKE',
    p_expected_version,
    'NORMAL',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'MAINTENANCE_COMPLETED',
    'api',
    p_reason,
    p_metadata
  );

  update public.app_maintenance_state
  set completed_at = clock_timestamp()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — SUCCESS. Exclusive barrier (154,1), state FOR UPDATE, CAS SMOKE+version, binding completo, smoke_started_at NOT NULL, transition_internal SMOKE->NORMAL (MAINTENANCE_COMPLETED source api; core limpa binding), completed_at sem segundo version+1. epoch inalterado. Não altera app_release_runs.';

revoke all on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) PUBLIC RPC — app_maintenance_orchestration_recover
--     (SMOKE -> RECOVERING)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_recover(
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
  v_smoke_started_at timestamptz;
begin
  perform public.app_maintenance_cutover_barrier_internal(true);

  select phase, version, release_id, target_sha, smoke_started_at
    into v_phase, v_version, v_release_id, v_target_sha, v_smoke_started_at
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  if v_phase is distinct from 'SMOKE' then
    raise exception '%', 'Recovery só pode iniciar a partir de SMOKE.'
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

  if v_smoke_started_at is null then
    raise exception '%', 'Smoke ainda não foi iniciado.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    'SMOKE',
    p_expected_version,
    'RECOVERING',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'RECOVERY_STARTED',
    'api',
    p_reason,
    p_metadata
  );

  update public.app_maintenance_state
  set recovering_at = clock_timestamp()
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — RECOVER. Exclusive barrier (154,1), state FOR UPDATE, CAS SMOKE+version, binding completo, smoke_started_at NOT NULL, transition_internal SMOKE->RECOVERING (RECOVERY_STARTED source api), recovering_at sem segundo version+1. Binding preservado. Não escreve timeout_at. Não altera app_release_runs.';

revoke all on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  4) PUBLIC RPC — app_maintenance_orchestration_fail (REPLACE)
--     allowlist: FENCING, DRAINING, QUIESCENT, RECOVERING
-- ════════════════════════════════════════════════════════════
create or replace function public.app_maintenance_orchestration_fail(
  p_expected_phase text,
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
begin
  -- Allowed source: FENCING, DRAINING, QUIESCENT, RECOVERING. Destino hardcoded: FAILED.
  if p_expected_phase not in ('FENCING', 'DRAINING', 'QUIESCENT', 'RECOVERING') then
    raise exception '%', 'Falha só é permitida a partir de FENCING, DRAINING, QUIESCENT ou RECOVERING.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    p_expected_phase,
    p_expected_version,
    'FAILED',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'MAINTENANCE_FAILED',
    'api',
    p_reason,
    p_metadata
  );
end;
$$;

comment on function public.app_maintenance_orchestration_fail(
  text, integer, uuid, text, text, jsonb
) is
  'RPC PÚBLICA (service_role) — FAIL. Destino hardcoded FAILED; source permitido FENCING/DRAINING/QUIESCENT/RECOVERING. Delega ao core privado (transition_internal). Evento MAINTENANCE_FAILED. Binding e epoch preservados pelo core. Não escreve aborted_at/abort_reason/timeout_at. Não adquire cutover barrier (modelo B12). Não altera app_release_runs. Não cria fail_internal.';

revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_state_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_name text;
  v_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_count integer;
  v_public_execute boolean;
  v_src text;
  v_fail_oid oid;
  v_new_names constant text[] := array[
    'app_maintenance_orchestration_smoke',
    'app_maintenance_orchestration_success',
    'app_maintenance_orchestration_recover'
  ];
begin
  v_events_reloid := to_regclass('public.app_maintenance_events');
  v_state_reloid := to_regclass('public.app_maintenance_state');

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'postcheck 157: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores: %', v_condef;
  end if;

  if to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  ) is null then
    raise exception 'postcheck 157: transition_internal B12 não está intacto.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'postcheck 157: trigger app_maintenance_orchestration_binding_guard_trg deveria continuar existindo (migration 153 intocada).';
  end if;

  foreach v_name in array v_new_names
  loop
    v_oid := to_regprocedure(format('public.%s(integer, uuid, text, text, jsonb)', v_name));
    if v_oid is null then
      raise exception 'postcheck 157: % não encontrada.', v_name;
    end if;

    select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name;
    if v_count <> 1 then
      raise exception 'postcheck 157: esperado exatamente 1 função %, zero overload (count=%).', v_name, v_count;
    end if;

    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
      into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
    from pg_proc p where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 157: % — owner deveria ser postgres (owner atual: %).', v_name, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 157: % — deveria ser SECURITY DEFINER.', v_name;
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 157: % — proconfig deveria conter search_path=public.', v_name;
    end if;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'postcheck 157: % — return type deveria ser void.', v_name;
    end if;

    if position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0 then
      raise exception 'postcheck 157: % deveria adquirir barrier exclusiva.', v_name;
    end if;
    if v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1' then
      raise exception 'postcheck 157: % não deveria incrementar epoch.', v_name;
    end if;
    if v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1' then
      raise exception 'postcheck 157: % não deveria incrementar version fora do core.', v_name;
    end if;
    if v_src ~* 'update[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 157: % não deveria alterar app_release_runs.', v_name;
    end if;
    if v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 157: % não deveria inserir em app_release_runs.', v_name;
    end if;
    if v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 157: % não deveria deletar de app_release_runs.', v_name;
    end if;
    if v_src ~* 'timeout_at[[:space:]]*=' then
      raise exception 'postcheck 157: % não deveria escrever timeout_at.', v_name;
    end if;

    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 157: anon/authenticated NÃO deveriam ter EXECUTE em %.', v_name;
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 157: service_role deveria ter EXECUTE em %.', v_name;
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
      raise exception 'postcheck 157: PUBLIC NÃO deveria ter EXECUTE em %.', v_name;
    end if;
  end loop;

  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'postcheck 157: app_maintenance_orchestration_fail não encontrada.';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_fail';
  if v_count <> 1 then
    raise exception 'postcheck 157: fail deveria continuar com exatamente 1 assinatura (count=%).', v_count;
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_fail_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 157: fail — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 157: fail — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 157: fail — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 157: fail — return type deveria ser void.';
  end if;
  if v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)' then
    raise exception 'postcheck 157: fail deveria permitir FENCING/DRAINING/QUIESCENT/RECOVERING.';
  end if;
  if position('app_maintenance_cutover_barrier_internal' in v_src) > 0 then
    raise exception 'postcheck 157: fail B12 não deveria adquirir cutover barrier.';
  end if;
  if v_src ~* 'aborted_at[[:space:]]*=' or v_src ~* 'abort_reason[[:space:]]*=' then
    raise exception 'postcheck 157: fail não deveria escrever aborted_at/abort_reason.';
  end if;
  if v_src ~* 'timeout_at[[:space:]]*=' then
    raise exception 'postcheck 157: fail não deveria escrever timeout_at.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 157: fail não deveria alterar app_release_runs.';
  end if;
  if v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 157: fail não deveria inserir em app_release_runs.';
  end if;
  if v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 157: fail não deveria deletar de app_release_runs.';
  end if;

  if has_function_privilege('anon', v_fail_oid, 'execute')
     or has_function_privilege('authenticated', v_fail_oid, 'execute') then
    raise exception 'postcheck 157: anon/authenticated NÃO deveriam ter EXECUTE em fail.';
  end if;
  if not has_function_privilege('service_role', v_fail_oid, 'execute') then
    raise exception 'postcheck 157: service_role deveria ter EXECUTE em fail.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_fail_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 157: PUBLIC NÃO deveria ter EXECUTE em fail.';
  end if;
end $$;

commit;
