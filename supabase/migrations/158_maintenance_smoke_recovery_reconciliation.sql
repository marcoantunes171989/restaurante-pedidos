-- ════════════════════════════════════════════════════════════
--  158 — Reconciliação Maintenance / Smoke + Recovery (B16-A4R2).
--
--  Forward reconciliation append-only. Converge STATE A
--  (history 157 presente, 0/3 RPCs B16, fail antigo
--  FENCING/DRAINING/QUIESCENT) e STATE B (157 canônica aplicada:
--  3/3 RPCs + fail com RECOVERING) para o mesmo estado
--  funcional final derivado da 157.
--
--  Não reaplica a 157, não reescreve history, não altera 140–157.
--  Sem CREATE/DROP TABLE, coluna, índice, constraint, policy,
--  event_type ou edge. Sem DML de apply em state/events/
--  operations/release_runs.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed — history 157 + STATE A ou STATE B
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
  v_smoke_oid oid;
  v_success_oid oid;
  v_recover_oid oid;
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
  v_history157 integer;
  v_smoke_count integer;
  v_success_count integer;
  v_recover_count integer;
  v_fail_count integer;
  v_rpc_present integer;
  v_fail_old boolean;
  v_fail_new boolean;
  v_predecessor text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'precheck 158: supabase_migrations.schema_migrations não existe.';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'name'
  ) then
    raise exception 'precheck 158: coluna name ausente em supabase_migrations.schema_migrations.';
  end if;

  select count(*) into v_history157
  from supabase_migrations.schema_migrations
  where name = '157_maintenance_smoke_recovery_orchestration';
  if v_history157 is distinct from 1 then
    raise exception 'precheck 158: esperado exatamente 1 history name=157_maintenance_smoke_recovery_orchestration (count=%).', v_history157;
  end if;

  v_state_reloid := to_regclass('public.app_maintenance_state');
  if v_state_reloid is null then
    raise exception 'precheck 158: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 158: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  v_release_reloid := to_regclass('public.app_release_runs');
  if v_release_reloid is null then
    raise exception 'precheck 158: public.app_release_runs não existe (migration 138 ausente).';
  end if;

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
      raise exception 'precheck 158: coluna % ausente em app_release_runs (migration 138 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 158: coluna app_release_runs.% deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

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
      raise exception 'precheck 158: coluna % ausente em app_maintenance_state (migration 140 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 158: coluna % deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 158: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores (drift): %', v_condef;
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'precheck 158: public.app_maintenance_orchestration_transition_internal(...) não existe (migration 153 ausente).';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_transition_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 158: transition_internal — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 158: transition_internal — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 158: transition_internal — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 158: transition_internal — return type deveria ser void.';
  end if;

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
      raise exception 'precheck 158: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'precheck 158: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;

  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if v_guard_oid is null then
    raise exception 'precheck 158: public.app_maintenance_orchestration_binding_guard() não existe (migration 153 ausente).';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'precheck 158: trigger app_maintenance_orchestration_binding_guard_trg ausente (migration 153).';
  end if;

  v_barrier_oid := to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)');
  if v_barrier_oid is null then
    raise exception 'precheck 158: public.app_maintenance_cutover_barrier_internal(boolean) não existe (migration 154/155 ausente).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_barrier_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 158: cutover barrier com identidade divergente.';
  end if;
  if position('pg_advisory_xact_lock(154, 1)' in v_src) = 0 then
    raise exception 'precheck 158: cutover barrier deveria usar pg_advisory_xact_lock(154, 1).';
  end if;

  select count(*) into v_smoke_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_smoke';
  select count(*) into v_success_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_success';
  select count(*) into v_recover_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_recover';
  select count(*) into v_fail_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_fail';

  if v_smoke_count > 1 or v_success_count > 1 or v_recover_count > 1 or v_fail_count > 1 then
    raise exception 'precheck 158: overload inesperado (smoke=% success=% recover=% fail=%).',
      v_smoke_count, v_success_count, v_recover_count, v_fail_count;
  end if;

  if v_fail_count is distinct from 1 then
    raise exception 'precheck 158: fail deveria ter exatamente 1 assinatura (count=%).', v_fail_count;
  end if;

  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'precheck 158: fail com assinatura canônica ausente ou incompatível.';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_fail_oid;
  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 158: fail — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 158: fail — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 158: fail — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 158: fail — return type deveria ser void.';
  end if;
  if position('MAINTENANCE_FAILED' in v_src) = 0 then
    raise exception 'precheck 158: fail deveria emitir MAINTENANCE_FAILED.';
  end if;
  if position('''FAILED''' in v_src) = 0 then
    raise exception 'precheck 158: fail deveria ter destino FAILED.';
  end if;
  if position('app_maintenance_cutover_barrier_internal' in v_src) > 0 then
    raise exception 'precheck 158: fail não deveria adquirir cutover barrier.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs'
     or v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs'
     or v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
    raise exception 'precheck 158: fail não deveria alterar app_release_runs.';
  end if;
  if v_src ~ 'p_expected_phase not in \([^)]*''NORMAL''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''NOTICE''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''RELEASING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''SMOKE''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''ABORTING''[^)]*\)' then
    raise exception 'precheck 158: fail não deveria aceitar fases proibidas na allowlist.';
  end if;

  v_fail_old := (
    v_src ~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT''\)'
    and v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)'
  );
  v_fail_new := (
    v_src ~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)'
  );
  if v_fail_old and v_fail_new then
    raise exception 'precheck 158: fail com terceira semântica (marcadores A e B simultâneos).';
  end if;
  if not v_fail_old and not v_fail_new then
    raise exception 'precheck 158: fail com terceira semântica (allowlist não A nem B).';
  end if;

  v_rpc_present :=
    (case when v_smoke_count > 0 then 1 else 0 end)
    + (case when v_success_count > 0 then 1 else 0 end)
    + (case when v_recover_count > 0 then 1 else 0 end);

  if v_rpc_present between 1 and 2 then
    raise exception 'precheck 158: estado misto bloqueado — %/3 RPCs B16 presentes.', v_rpc_present;
  end if;

  if v_rpc_present = 0 then
    if not v_fail_old then
      raise exception 'precheck 158: STATE A exige fail antigo (FENCING/DRAINING/QUIESCENT, sem RECOVERING).';
    end if;
    v_predecessor := 'A';
  elsif v_rpc_present = 3 then
    if not v_fail_new then
      raise exception 'precheck 158: STATE B exige fail final com RECOVERING.';
    end if;

    v_smoke_oid := to_regprocedure(
      'public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb)'
    );
    v_success_oid := to_regprocedure(
      'public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb)'
    );
    v_recover_oid := to_regprocedure(
      'public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb)'
    );
    if v_smoke_oid is null or v_success_oid is null or v_recover_oid is null then
      raise exception 'precheck 158: assinatura incompatível — smoke/success/recover STATE B.';
    end if;

    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
      into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
    from pg_proc p where p.oid = v_smoke_oid;
    if v_owner is distinct from 'postgres'
       or not coalesce(v_prosecdef, false)
       or v_proconfig is null
       or not ('search_path=public' = any (v_proconfig))
       or v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 158: smoke STATE B com identidade divergente.';
    end if;
    if position('SMOKE_STARTED' in v_src) = 0
       or position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0
       or position('smoke_started_at' in v_src) = 0
       or v_src !~ '''RELEASING'''
       or v_src !~ '''SMOKE'''
       or position('CANCELED' in v_src) = 0
       or position('BLOCKED' in v_src) = 0
       or position('ACTIVE_RELEASE_STATUSES' in v_src) > 0
       or v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1'
       or v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1'
       or v_src ~* 'update[[:space:]]+public\.app_release_runs' then
      raise exception 'precheck 158: smoke STATE B com marcadores semânticos incompatíveis com 157.';
    end if;

    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
      into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
    from pg_proc p where p.oid = v_success_oid;
    if v_owner is distinct from 'postgres'
       or not coalesce(v_prosecdef, false)
       or v_proconfig is null
       or not ('search_path=public' = any (v_proconfig))
       or v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 158: success STATE B com identidade divergente.';
    end if;
    if position('MAINTENANCE_COMPLETED' in v_src) = 0
       or position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0
       or position('smoke_started_at' in v_src) = 0
       or position('completed_at' in v_src) = 0
       or v_src !~ '''SMOKE'''
       or v_src !~ '''NORMAL'''
       or v_src ~ 'release_id[[:space:]]*='
       or v_src ~ 'target_sha[[:space:]]*='
       or v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1'
       or v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1'
       or v_src ~* 'update[[:space:]]+public\.app_release_runs' then
      raise exception 'precheck 158: success STATE B com marcadores semânticos incompatíveis com 157.';
    end if;

    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
      into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
    from pg_proc p where p.oid = v_recover_oid;
    if v_owner is distinct from 'postgres'
       or not coalesce(v_prosecdef, false)
       or v_proconfig is null
       or not ('search_path=public' = any (v_proconfig))
       or v_prorettype is distinct from 'void'::regtype then
      raise exception 'precheck 158: recover STATE B com identidade divergente.';
    end if;
    if position('RECOVERY_STARTED' in v_src) = 0
       or position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0
       or position('smoke_started_at' in v_src) = 0
       or position('recovering_at' in v_src) = 0
       or v_src !~ '''SMOKE'''
       or v_src !~ '''RECOVERING'''
       or v_src ~* 'timeout_at[[:space:]]*='
       or v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1'
       or v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1'
       or v_src ~* 'update[[:space:]]+public\.app_release_runs' then
      raise exception 'precheck 158: recover STATE B com marcadores semânticos incompatíveis com 157.';
    end if;

    v_predecessor := 'B';
  else
    raise exception 'precheck 158: contagem B16 inesperada (%).', v_rpc_present;
  end if;

  if v_predecessor is null then
    raise exception 'precheck 158: predecessor lógico 157 não classificado como STATE A ou STATE B.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) PUBLIC RPC — app_maintenance_orchestration_smoke
--     (RELEASING -> SMOKE)
-- ════════════════════════════════════════════════════════════
create or replace function public.app_maintenance_orchestration_smoke(
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
create or replace function public.app_maintenance_orchestration_success(
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
create or replace function public.app_maintenance_orchestration_recover(
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
  v_transition_oid oid;
  v_from text;
  v_to text;
  v_edge_count integer := 0;
  v_public_names constant text[] := array[
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
    raise exception 'postcheck 158: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores: %', v_condef;
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'postcheck 158: transition_internal B12 não está intacto.';
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
      raise exception 'postcheck 158: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'postcheck 158: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'postcheck 158: trigger app_maintenance_orchestration_binding_guard_trg deveria continuar existindo (migration 153 intocada).';
  end if;

  foreach v_name in array v_public_names
  loop
    v_oid := to_regprocedure(format('public.%s(integer, uuid, text, text, jsonb)', v_name));
    if v_oid is null then
      raise exception 'postcheck 158: % não encontrada.', v_name;
    end if;

    select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name;
    if v_count <> 1 then
      raise exception 'postcheck 158: esperado exatamente 1 função %, zero overload (count=%).', v_name, v_count;
    end if;

    select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
      into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
    from pg_proc p where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 158: % — owner deveria ser postgres (owner atual: %).', v_name, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 158: % — deveria ser SECURITY DEFINER.', v_name;
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 158: % — proconfig deveria conter search_path=public.', v_name;
    end if;
    if v_prorettype is distinct from 'void'::regtype then
      raise exception 'postcheck 158: % — return type deveria ser void.', v_name;
    end if;

    if position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0 then
      raise exception 'postcheck 158: % deveria adquirir barrier exclusiva.', v_name;
    end if;
    if v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1' then
      raise exception 'postcheck 158: % não deveria incrementar epoch.', v_name;
    end if;
    if v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1' then
      raise exception 'postcheck 158: % não deveria incrementar version fora do core.', v_name;
    end if;
    if v_src ~* 'update[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 158: % não deveria alterar app_release_runs.', v_name;
    end if;
    if v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 158: % não deveria inserir em app_release_runs.', v_name;
    end if;
    if v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
      raise exception 'postcheck 158: % não deveria deletar de app_release_runs.', v_name;
    end if;
    if v_src ~* 'timeout_at[[:space:]]*=' then
      raise exception 'postcheck 158: % não deveria escrever timeout_at.', v_name;
    end if;

    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 158: anon/authenticated NÃO deveriam ter EXECUTE em %.', v_name;
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 158: service_role deveria ter EXECUTE em %.', v_name;
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
      raise exception 'postcheck 158: PUBLIC NÃO deveria ter EXECUTE em %.', v_name;
    end if;
  end loop;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure(
    'public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb)'
  );
  if position('SMOKE_STARTED' in v_src) = 0 then
    raise exception 'postcheck 158: smoke deveria emitir SMOKE_STARTED.';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure(
    'public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb)'
  );
  if position('MAINTENANCE_COMPLETED' in v_src) = 0 then
    raise exception 'postcheck 158: success deveria emitir MAINTENANCE_COMPLETED.';
  end if;

  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure(
    'public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb)'
  );
  if position('RECOVERY_STARTED' in v_src) = 0 then
    raise exception 'postcheck 158: recover deveria emitir RECOVERY_STARTED.';
  end if;

  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'postcheck 158: app_maintenance_orchestration_fail não encontrada.';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_fail';
  if v_count <> 1 then
    raise exception 'postcheck 158: fail deveria continuar com exatamente 1 assinatura (count=%).', v_count;
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_fail_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 158: fail — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 158: fail — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 158: fail — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 158: fail — return type deveria ser void.';
  end if;
  if v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)' then
    raise exception 'postcheck 158: fail deveria permitir FENCING/DRAINING/QUIESCENT/RECOVERING.';
  end if;
  if v_src ~ 'p_expected_phase not in \([^)]*''NORMAL''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''NOTICE''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''RELEASING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''SMOKE''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''ABORTING''[^)]*\)' then
    raise exception 'postcheck 158: fail não deveria incluir fases proibidas.';
  end if;
  if position('app_maintenance_cutover_barrier_internal' in v_src) > 0 then
    raise exception 'postcheck 158: fail B12 não deveria adquirir cutover barrier.';
  end if;
  if v_src ~* 'aborted_at[[:space:]]*=' or v_src ~* 'abort_reason[[:space:]]*=' then
    raise exception 'postcheck 158: fail não deveria escrever aborted_at/abort_reason.';
  end if;
  if v_src ~* 'timeout_at[[:space:]]*=' then
    raise exception 'postcheck 158: fail não deveria escrever timeout_at.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 158: fail não deveria alterar app_release_runs.';
  end if;
  if v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 158: fail não deveria inserir em app_release_runs.';
  end if;
  if v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 158: fail não deveria deletar de app_release_runs.';
  end if;

  if has_function_privilege('anon', v_fail_oid, 'execute')
     or has_function_privilege('authenticated', v_fail_oid, 'execute') then
    raise exception 'postcheck 158: anon/authenticated NÃO deveriam ter EXECUTE em fail.';
  end if;
  if not has_function_privilege('service_role', v_fail_oid, 'execute') then
    raise exception 'postcheck 158: service_role deveria ter EXECUTE em fail.';
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
    raise exception 'postcheck 158: PUBLIC NÃO deveria ter EXECUTE em fail.';
  end if;

  foreach v_oid in array array[
    to_regprocedure(
      'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
    ),
    to_regprocedure('public.app_maintenance_orchestration_binding_guard()'),
    to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)')
  ]
  loop
    if v_oid is null then
      raise exception 'postcheck 158: helper interno final não encontrado.';
    end if;
    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute')
       or has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 158: helper interno não deveria ter EXECUTE para anon/authenticated/service_role.';
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
      raise exception 'postcheck 158: helper interno — PUBLIC NÃO deveria ter EXECUTE.';
    end if;
  end loop;
end $$;

commit;
