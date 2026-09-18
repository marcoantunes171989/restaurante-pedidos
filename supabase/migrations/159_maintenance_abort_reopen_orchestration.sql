-- ════════════════════════════════════════════════════════════
--  159 — Maintenance / Abort + Reopen Orchestration (B17-I1).
--
--  Introduz as 2 RPCs públicas do recorte B17:
--
--    public.app_maintenance_orchestration_abort(...)
--      RELEASING -> ABORTING -> FAILED (atômico, 2 hops)
--    public.app_maintenance_orchestration_reopen(...)
--      FAILED|CANCELED -> NORMAL (implementação dedicada)
--
--  Ajuste monotônico do event CHECK: 17 -> 18 valores, adicionando
--  somente MAINTENANCE_REOPENED. Nenhum valor anterior removido.
--
--  NÃO CREATE OR REPLACE de transition_internal, binding_guard,
--  fail, success, write_assert nem demais RPCs existentes.
--  O core de 16 edges permanece intacto — reopen NÃO adiciona
--  FAILED->NORMAL nem CANCELED->NORMAL à whitelist.
--  ABORTING não é estado durável após o retorno da abort RPC.
--  version +1 permanece exclusividade do core nos hops de abort;
--  reopen incrementa version/epoch na própria UPDATE dedicada.
--  B17 NÃO altera app_release_runs (zero INSERT/UPDATE/DELETE).
--
--  ESCOPO NEGATIVO — NÃO cria API/UI. NÃO amplia fail para
--  RELEASING/ABORTING/SMOKE. NÃO altera o binding_guard
--  (FUTURE B17 REOPEN CLEAR já existe na 153). NÃO faz
--  apply-time business DML. NÃO edita as migrations 140-158.
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
    raise exception 'precheck 159: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 159: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  v_release_reloid := to_regclass('public.app_release_runs');
  if v_release_reloid is null then
    raise exception 'precheck 159: public.app_release_runs não existe (migration 138 ausente).';
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
      raise exception 'precheck 159: coluna % ausente em app_release_runs (migration 138 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 159: coluna app_release_runs.% deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

  for v_col, v_expected in
    select * from (values
      ('aborted_at',          'timestamp with time zone'),
      ('abort_reason',        'text'),
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
      raise exception 'precheck 159: coluna % ausente em app_maintenance_state (migration 140 ausente/drift).', v_col;
    end if;
    if v_col_type <> v_expected then
      raise exception 'precheck 159: coluna % deveria ser %, encontrado %.', v_col, v_expected, v_col_type;
    end if;
  end loop;

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 159: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores (drift): %', v_condef;
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'precheck 159: public.app_maintenance_orchestration_transition_internal(...) não existe (migration 153 ausente).';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_transition_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 159: transition_internal — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 159: transition_internal — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 159: transition_internal — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 159: transition_internal — return type deveria ser void.';
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
      raise exception 'precheck 159: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'precheck 159: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;
  if v_src ~ (quote_literal('FAILED') || '[[:space:]]*,[[:space:]]*' || quote_literal('NORMAL'))
     or v_src ~ (quote_literal('CANCELED') || '[[:space:]]*,[[:space:]]*' || quote_literal('NORMAL')) then
    raise exception 'precheck 159: transition_internal não deveria conter FAILED->NORMAL nem CANCELED->NORMAL.';
  end if;

  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if v_guard_oid is null then
    raise exception 'precheck 159: public.app_maintenance_orchestration_binding_guard() não existe (migration 153 ausente).';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_guard_oid;
  if position('FUTURE B17 REOPEN CLEAR' in v_src) = 0 then
    raise exception 'precheck 159: binding_guard deveria conter FUTURE B17 REOPEN CLEAR (migration 153).';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'precheck 159: trigger app_maintenance_orchestration_binding_guard_trg ausente (migration 153).';
  end if;

  v_barrier_oid := to_regprocedure('public.app_maintenance_cutover_barrier_internal(boolean)');
  if v_barrier_oid is null then
    raise exception 'precheck 159: public.app_maintenance_cutover_barrier_internal(boolean) não existe (migration 154/155 ausente).';
  end if;
  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_barrier_oid;
  if v_owner is distinct from 'postgres'
     or not coalesce(v_prosecdef, false)
     or v_proconfig is null
     or not ('search_path=public' = any (v_proconfig))
     or v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 159: cutover barrier com identidade divergente.';
  end if;
  if position('pg_advisory_xact_lock(154, 1)' in v_src) = 0 then
    raise exception 'precheck 159: cutover barrier deveria usar pg_advisory_xact_lock(154, 1).';
  end if;

  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'precheck 159: public.app_maintenance_orchestration_fail(...) não existe (migration 153 ausente).';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_fail';
  if v_count <> 1 then
    raise exception 'precheck 159: fail deveria ter exatamente 1 assinatura (count=%).', v_count;
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid = v_fail_oid;
  if v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)' then
    raise exception 'precheck 159: fail deveria permitir FENCING/DRAINING/QUIESCENT/RECOVERING (157/158).';
  end if;
  if v_src ~ 'p_expected_phase not in \([^)]*''RELEASING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''ABORTING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''SMOKE''[^)]*\)' then
    raise exception 'precheck 159: fail não deveria aceitar RELEASING/ABORTING/SMOKE.';
  end if;

  if to_regprocedure(
    'public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb)'
  ) is not null then
    raise exception 'precheck 159: public.app_maintenance_orchestration_abort(...) já existe.';
  end if;
  if to_regprocedure(
    'public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb)'
  ) is not null then
    raise exception 'precheck 159: public.app_maintenance_orchestration_reopen(...) já existe.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_maintenance_orchestration_abort',
        'app_maintenance_orchestration_reopen'
      )
  ) then
    raise exception 'precheck 159: colisão de nome — abort/reopen já existe com outra assinatura.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) EVENT_TYPE CONSTRAINT REPLACEMENT — superset com
--     MAINTENANCE_REOPENED (17 -> 18 valores, monotônico)
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
    'MAINTENANCE_REOPENED'
  ));

comment on constraint app_maintenance_events_event_type_check
  on public.app_maintenance_events is
  'Contrato de 18 event_types (17 herdados das migrations 140/153 + MAINTENANCE_REOPENED da migration 159). Alteração estritamente monotônica — superset do conjunto anterior. Nenhum valor antigo removido.';

-- ════════════════════════════════════════════════════════════
--  2) PUBLIC RPC — app_maintenance_orchestration_abort
--     (RELEASING -> ABORTING -> FAILED, atômico)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_abort(
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

  if v_phase is distinct from 'RELEASING' then
    raise exception '%', 'Abort só pode ocorrer a partir de RELEASING.'
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

  perform public.app_maintenance_orchestration_transition_internal(
    'RELEASING',
    p_expected_version,
    'ABORTING',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'MAINTENANCE_ABORTED',
    'api',
    p_reason,
    p_metadata
  );

  perform public.app_maintenance_orchestration_transition_internal(
    'ABORTING',
    p_expected_version + 1,
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

  update public.app_maintenance_state
  set aborted_at = clock_timestamp(),
      abort_reason = p_reason
  where scope = 'global';
end;
$$;

comment on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — ABORT. Exclusive barrier (154,1), state FOR UPDATE, CAS RELEASING+version, binding completo, dois hops atômicos via transition_internal (RELEASING->ABORTING MAINTENANCE_ABORTED source api; ABORTING->FAILED com expected_version+1 MAINTENANCE_FAILED source api). ABORTING não é durável após o retorno. Binding e epoch preservados pelo core. version delta total +2. aborted_at/abort_reason sem segundo version+1 (padrão success/completed_at). Não escreve result_code. Não altera app_release_runs.';

revoke all on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) PUBLIC RPC — app_maintenance_orchestration_reopen
--     (FAILED|CANCELED -> NORMAL) — dedicada, fora do core
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_reopen(
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
declare
  v_phase text;
  v_version integer;
  v_epoch integer;
  v_release_id uuid;
  v_target_sha text;
begin
  if p_expected_phase not in ('FAILED', 'CANCELED') then
    raise exception '%', 'Reopen só é permitido a partir de FAILED ou CANCELED.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  select phase, version, epoch, release_id, target_sha
    into v_phase, v_version, v_epoch, v_release_id, v_target_sha
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

  if v_release_id is null or v_target_sha is null then
    raise exception '%', 'Active orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  update public.app_maintenance_state
  set phase = 'NORMAL',
      epoch = epoch + 1,
      version = version + 1,
      release_id = null,
      target_sha = null,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

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
    v_epoch + 1,
    null,
    'MAINTENANCE_REOPENED',
    'api',
    p_actor_user_id,
    p_actor_email,
    p_reason,
    p_metadata,
    now()
  );
end;
$$;

comment on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) is
  'RPC PÚBLICA (service_role) — REOPEN. Implementação dedicada fora de transition_internal. SELECT state FOR UPDATE, CAS phase in (FAILED,CANCELED)+version, binding completo obrigatório (STATE_CONFLICT se ausente/parcial). Mutation única: phase=NORMAL, epoch+1, version+1, release_id/target_sha NULL. Preserva result_code/aborted_at/abort_reason. Emite exatamente 1 MAINTENANCE_REOPENED (epoch novo, release_id NULL, source api). Não adiciona edges ao core. Não altera app_release_runs.';

revoke all on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_state_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text, ''MAINTENANCE_REOPENED''::text])))';
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
  v_guard_oid oid;
  v_transition_oid oid;
  v_from text;
  v_to text;
  v_edge_count integer := 0;
  v_abort_oid oid;
  v_reopen_oid oid;
begin
  v_events_reloid := to_regclass('public.app_maintenance_events');
  v_state_reloid := to_regclass('public.app_maintenance_state');

  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'postcheck 159: app_maintenance_events_event_type_check divergente do contrato canônico de 18 valores: %', v_condef;
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'postcheck 159: transition_internal B12 não está intacto.';
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
      raise exception 'postcheck 159: edge % -> % ausente em transition_internal.', v_from, v_to;
    end if;
    v_edge_count := v_edge_count + 1;
  end loop;
  if v_edge_count is distinct from 16 then
    raise exception 'postcheck 159: esperado validar 16 edges estruturais, validou %.', v_edge_count;
  end if;
  if v_src ~ (quote_literal('FAILED') || '[[:space:]]*,[[:space:]]*' || quote_literal('NORMAL'))
     or v_src ~ (quote_literal('CANCELED') || '[[:space:]]*,[[:space:]]*' || quote_literal('NORMAL')) then
    raise exception 'postcheck 159: transition_internal não deveria conter FAILED->NORMAL nem CANCELED->NORMAL.';
  end if;

  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  if v_guard_oid is null then
    raise exception 'postcheck 159: binding_guard não encontrado.';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_guard_oid;
  if position('FUTURE B17 REOPEN CLEAR' in v_src) = 0 then
    raise exception 'postcheck 159: binding_guard deveria continuar contendo FUTURE B17 REOPEN CLEAR.';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = v_state_reloid
  ) then
    raise exception 'postcheck 159: trigger app_maintenance_orchestration_binding_guard_trg deveria continuar existindo (migration 153 intocada).';
  end if;

  v_abort_oid := to_regprocedure(
    'public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb)'
  );
  v_reopen_oid := to_regprocedure(
    'public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb)'
  );
  if v_abort_oid is null then
    raise exception 'postcheck 159: app_maintenance_orchestration_abort não encontrada.';
  end if;
  if v_reopen_oid is null then
    raise exception 'postcheck 159: app_maintenance_orchestration_reopen não encontrada.';
  end if;

  foreach v_name in array array[
    'app_maintenance_orchestration_abort',
    'app_maintenance_orchestration_reopen'
  ]
  loop
    select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name;
    if v_count <> 1 then
      raise exception 'postcheck 159: esperado exatamente 1 função %, zero overload (count=%).', v_name, v_count;
    end if;
  end loop;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_abort_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 159: abort — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 159: abort — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 159: abort — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 159: abort — return type deveria ser void.';
  end if;
  if position('app_maintenance_cutover_barrier_internal(true)' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria adquirir barrier exclusiva.';
  end if;
  if position('''RELEASING''' in v_src) = 0 or position('''ABORTING''' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria transitar RELEASING -> ABORTING.';
  end if;
  if position('p_expected_version + 1' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria usar expected_version+1 no segundo hop.';
  end if;
  if position('MAINTENANCE_ABORTED' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria emitir MAINTENANCE_ABORTED.';
  end if;
  if position('MAINTENANCE_FAILED' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria emitir MAINTENANCE_FAILED.';
  end if;
  if position('aborted_at' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria gravar aborted_at.';
  end if;
  if position('abort_reason' in v_src) = 0 then
    raise exception 'postcheck 159: abort deveria gravar abort_reason.';
  end if;
  if v_src ~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1' then
    raise exception 'postcheck 159: abort não deveria incrementar epoch.';
  end if;
  if v_src ~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1' then
    raise exception 'postcheck 159: abort não deveria incrementar version fora do core.';
  end if;
  if v_src ~* 'result_code[[:space:]]*=' then
    raise exception 'postcheck 159: abort não deveria escrever result_code.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs'
     or v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs'
     or v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 159: abort não deveria alterar app_release_runs.';
  end if;

  if has_function_privilege('anon', v_abort_oid, 'execute')
     or has_function_privilege('authenticated', v_abort_oid, 'execute') then
    raise exception 'postcheck 159: anon/authenticated NÃO deveriam ter EXECUTE em abort.';
  end if;
  if not has_function_privilege('service_role', v_abort_oid, 'execute') then
    raise exception 'postcheck 159: service_role deveria ter EXECUTE em abort.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_abort_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 159: PUBLIC NÃO deveria ter EXECUTE em abort.';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner), p.prosrc
    into v_prosecdef, v_proconfig, v_prorettype, v_owner, v_src
  from pg_proc p where p.oid = v_reopen_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 159: reopen — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 159: reopen — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 159: reopen — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 159: reopen — return type deveria ser void.';
  end if;
  if position('app_maintenance_orchestration_transition_internal' in v_src) > 0 then
    raise exception 'postcheck 159: reopen deveria ser implementação dedicada (sem transition_internal).';
  end if;
  if v_src !~ '''FAILED''' or v_src !~ '''CANCELED''' then
    raise exception 'postcheck 159: reopen deveria aceitar FAILED/CANCELED.';
  end if;
  if position('''NORMAL''' in v_src) = 0 then
    raise exception 'postcheck 159: reopen deveria ter destino NORMAL.';
  end if;
  if v_src !~ 'epoch[[:space:]]*=[[:space:]]*epoch[[:space:]]*\+[[:space:]]*1' then
    raise exception 'postcheck 159: reopen deveria incrementar epoch +1.';
  end if;
  if v_src !~ 'version[[:space:]]*=[[:space:]]*version[[:space:]]*\+[[:space:]]*1' then
    raise exception 'postcheck 159: reopen deveria incrementar version +1.';
  end if;
  if position('MAINTENANCE_REOPENED' in v_src) = 0 then
    raise exception 'postcheck 159: reopen deveria emitir MAINTENANCE_REOPENED.';
  end if;
  if v_src ~* 'result_code[[:space:]]*=' then
    raise exception 'postcheck 159: reopen não deveria escrever result_code.';
  end if;
  if v_src ~* 'update[[:space:]]+public\.app_release_runs'
     or v_src ~* 'insert[[:space:]]+into[[:space:]]+public\.app_release_runs'
     or v_src ~* 'delete[[:space:]]+from[[:space:]]+public\.app_release_runs' then
    raise exception 'postcheck 159: reopen não deveria alterar app_release_runs.';
  end if;

  if has_function_privilege('anon', v_reopen_oid, 'execute')
     or has_function_privilege('authenticated', v_reopen_oid, 'execute') then
    raise exception 'postcheck 159: anon/authenticated NÃO deveriam ter EXECUTE em reopen.';
  end if;
  if not has_function_privilege('service_role', v_reopen_oid, 'execute') then
    raise exception 'postcheck 159: service_role deveria ter EXECUTE em reopen.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_reopen_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 159: PUBLIC NÃO deveria ter EXECUTE em reopen.';
  end if;

  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  if v_fail_oid is null then
    raise exception 'postcheck 159: app_maintenance_orchestration_fail não encontrada.';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_fail_oid;
  if v_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)' then
    raise exception 'postcheck 159: fail deveria continuar permitindo FENCING/DRAINING/QUIESCENT/RECOVERING.';
  end if;
  if v_src ~ 'p_expected_phase not in \([^)]*''RELEASING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''ABORTING''[^)]*\)'
     or v_src ~ 'p_expected_phase not in \([^)]*''SMOKE''[^)]*\)' then
    raise exception 'postcheck 159: fail não deveria ser ampliado para RELEASING/ABORTING/SMOKE.';
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
      raise exception 'postcheck 159: helper interno final não encontrado.';
    end if;
    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute')
       or has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 159: helper interno não deveria ter EXECUTE para anon/authenticated/service_role.';
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
      raise exception 'postcheck 159: helper interno — PUBLIC NÃO deveria ter EXECUTE.';
    end if;
  end loop;
end $$;

commit;
