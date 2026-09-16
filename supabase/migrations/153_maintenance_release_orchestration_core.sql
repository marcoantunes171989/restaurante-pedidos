-- ════════════════════════════════════════════════════════════
--  153 — Maintenance / Release Orchestration Core (B12-A1R1).
--
--  Amplia o contrato de event_type de app_maintenance_events (16 -> 17
--  valores, superset estrito) com ORCHESTRATION_STARTED e cria o core
--  privado + os 3 wrappers públicos do orquestrador de manutenção:
--
--  PRIVADAS (2):
--    public.app_maintenance_orchestration_transition_internal(...)
--    public.app_maintenance_orchestration_binding_guard()
--
--  PÚBLICAS (3):
--    public.app_maintenance_orchestration_start(...)
--    public.app_maintenance_orchestration_cancel(...)
--    public.app_maintenance_orchestration_fail(...)
--
--  START é NORMAL -> NORMAL (fora da matriz estrutural de 16 edges):
--  vincula release_id/target_sha ao singleton sem entrar em NOTICE,
--  FENCING ou RELEASING. Emite exatamente 1 evento ORCHESTRATION_STARTED
--  — nunca RELEASE_STARTED (reservado para QUIESCENT->RELEASING).
--
--  CANCEL (NORMAL/NOTICE -> CANCELED) e FAIL (FENCING/DRAINING/QUIESCENT
--  -> FAILED) delegam ao core privado, que valida CAS (expected_phase +
--  expected_version), valida a transição contra as 16 edges estruturais
--  exatas e grava, na mesma transação, exatamente 1 evento por UPDATE
--  real. VERSION_CONFLICT e STATE_CONFLICT não produzem UPDATE nem
--  evento.
--
--  O binding_guard (1 trigger BEFORE UPDATE) permite somente 3 padrões
--  de mudança de binding: bind inicial (NORMAL->NORMAL, unbound->full),
--  success clear (SMOKE->NORMAL, full->null) e reopen clear futuro do
--  B17 (FAILED/CANCELED->NORMAL com epoch maior, full->null). Qualquer
--  outra mudança de binding é rejeitada; ausência de mudança é sempre
--  permitida (comparação NULL-safe).
--
--  ESCOPO NEGATIVO — NÃO cria tabela/coluna/índice/policy nova. NÃO cria
--  start_internal/cancel_internal/fail_internal, advance/next/set_state
--  nem RPC de transição genérica. NÃO cria wrapper B13/B14/B16/B17. NÃO
--  edita as migrations 140-152. NÃO adiciona verificação de super_admin
--  em SQL (fica em /api/maintenance-orchestration). NÃO aplica esta
--  migration em HML/Production neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_state_reloid oid;
  v_releases_reloid oid;
  v_condef text;
  v_contype "char";
  v_old_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text])))';
begin
  v_state_reloid := to_regclass('public.app_maintenance_state');
  if v_state_reloid is null then
    raise exception 'precheck 153: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 153: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  v_releases_reloid := to_regclass('public.app_release_runs');
  if v_releases_reloid is null then
    raise exception 'precheck 153: public.app_release_runs não existe (migration 138 ausente).';
  end if;

  select c.contype, pg_get_constraintdef(c.oid)
    into v_contype, v_condef
  from pg_constraint c
  where c.conrelid = v_events_reloid
    and c.conname = 'app_maintenance_events_event_type_check';

  if v_condef is null then
    raise exception 'precheck 153: constraint app_maintenance_events_event_type_check não encontrada.';
  end if;
  if v_contype <> 'c' then
    raise exception 'precheck 153: app_maintenance_events_event_type_check deveria ser CHECK constraint (contype=%).', v_contype;
  end if;
  if position('ORCHESTRATION_STARTED' in v_condef) <> 0 then
    raise exception 'precheck 153: ORCHESTRATION_STARTED já é permitido — drift inesperado no contrato de event_type.';
  end if;
  if v_condef is distinct from v_old_event_type_condef then
    raise exception 'precheck 153: app_maintenance_events_event_type_check divergente do contrato canônico de 16 valores (drift): %', v_condef;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_maintenance_orchestration_transition_internal',
        'app_maintenance_orchestration_binding_guard',
        'app_maintenance_orchestration_start',
        'app_maintenance_orchestration_cancel',
        'app_maintenance_orchestration_fail'
      )
  ) then
    raise exception 'precheck 153: colisão — alguma das funções do orchestration core já existe.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = v_state_reloid
      and not tgisinternal
      and tgname = 'app_maintenance_orchestration_binding_guard_trg'
  ) then
    raise exception 'precheck 153: colisão — trigger app_maintenance_orchestration_binding_guard_trg já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) EVENT_TYPE CONSTRAINT REPLACEMENT — superset com
--     ORCHESTRATION_STARTED (16 -> 17 valores, monotônico)
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
    'ORCHESTRATION_STARTED'
  ));

comment on constraint app_maintenance_events_event_type_check
  on public.app_maintenance_events is
  'Contrato de 17 event_types (16 herdados da migration 140 + ORCHESTRATION_STARTED da migration 153). Alteração estritamente monotônica — superset do conjunto anterior. Nenhum valor antigo removido.';

-- ════════════════════════════════════════════════════════════
--  2) PRIVATE CORE — app_maintenance_orchestration_transition_internal
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_transition_internal(
  p_expected_phase text,
  p_expected_version integer,
  p_to_phase text,
  p_release_id uuid,
  p_target_sha text,
  p_clear_binding boolean,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_event_type text,
  p_source text,
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
  v_phase text;
  v_version integer;
  v_epoch integer;
  v_release_id uuid;
  v_target_sha text;
  v_new_release_id uuid;
  v_new_target_sha text;
begin
  -- 1/2) lock order: app_maintenance_state primeiro (scope='global').
  select phase, version, epoch, release_id, target_sha
    into v_phase, v_version, v_epoch, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  -- 3) ausência do singleton é falha estrutural fail-closed.
  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  -- 4) CAS de fase.
  if v_phase is distinct from p_expected_phase then
    raise exception '%', 'Fase atual não corresponde à fase esperada.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  -- 5/6) CAS de versão — VERSION_CONFLICT: 0 UPDATE, 0 evento (raise antes de qualquer mutação).
  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  -- 7) validação estrutural: exatamente as 16 edges exatas (sem wildcard, sem self-edge).
  if not exists (
    select 1
    from (values
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
    where edges.from_phase = p_expected_phase
      and edges.to_phase = p_to_phase
  ) then
    raise exception '%', 'Transição de fase inválida (fora das 16 edges estruturais exatas).'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  -- 8/9) quando release for aplicável: lock order state -> release; nunca alterar app_release_runs.
  if p_release_id is not null then
    perform 1
    from public.app_release_runs
    where id = p_release_id
    for update;

    if not found then
      raise exception '%', 'Release informada não existe.'
        using errcode = 'P0001', detail = 'NOT_FOUND';
    end if;
  end if;

  -- binding: sem mudança por padrão (mid-cycle change proibido); só muda se
  -- explicitamente solicitado (clear ou novo bind aplicável por um wrapper futuro).
  if p_clear_binding then
    v_new_release_id := null;
    v_new_target_sha := null;
  else
    v_new_release_id := coalesce(p_release_id, v_release_id);
    v_new_target_sha := coalesce(p_target_sha, v_target_sha);
  end if;

  -- 10) UPDATE real: version = version + 1.
  update public.app_maintenance_state
  set phase = p_to_phase,
      release_id = v_new_release_id,
      target_sha = v_new_target_sha,
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  -- 11) exatamente 1 INSERT de evento por UPDATE real, mesma transação.
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
    v_new_release_id,
    p_event_type,
    p_source,
    p_actor_user_id,
    p_actor_email,
    p_message,
    p_metadata,
    now()
  );
end;
$$;

comment on function public.app_maintenance_orchestration_transition_internal(
  text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb
) is
  'Core PRIVADO do Maintenance/Release Orchestration — transição estrutural genérica. Lock order state->release, CAS de phase+version fail-closed (STATE_CONFLICT/VERSION_CONFLICT sem UPDATE/evento), valida a transição contra as 16 edges estruturais exatas (INVALID_TRANSITION caso contrário), nunca altera app_release_runs, e grava exatamente 1 evento por UPDATE real na mesma transação. Uso interno pelos wrappers públicos (start via lógica própria; cancel/fail via este core) — não é RPC pública.';

revoke all on function public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb) from service_role;

alter function public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) PRIVATE — app_maintenance_orchestration_binding_guard (trigger)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_binding_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Binding parcial proibido: release_id NULL <=> target_sha NULL.
  if (NEW.release_id is null) is distinct from (NEW.target_sha is null) then
    raise exception '%', 'Binding parcial de release_id/target_sha não é permitido.'
      using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
  end if;

  -- INITIAL BIND: NORMAL->NORMAL, unbound -> full (START).
  if OLD.phase = 'NORMAL' and NEW.phase = 'NORMAL'
     and OLD.release_id is null and OLD.target_sha is null
     and NEW.release_id is not null and NEW.target_sha is not null then
    return NEW;
  end if;

  -- SUCCESS CLEAR: SMOKE->NORMAL, full -> null.
  if OLD.phase = 'SMOKE' and NEW.phase = 'NORMAL'
     and OLD.release_id is not null and OLD.target_sha is not null
     and NEW.release_id is null and NEW.target_sha is null then
    return NEW;
  end if;

  -- FUTURE B17 REOPEN CLEAR: FAILED/CANCELED->NORMAL, epoch maior, full -> null.
  if OLD.phase in ('FAILED', 'CANCELED') and NEW.phase = 'NORMAL'
     and NEW.epoch > OLD.epoch
     and OLD.release_id is not null and OLD.target_sha is not null
     and NEW.release_id is null and NEW.target_sha is null then
    return NEW;
  end if;

  -- Demais casos: binding deve permanecer NULL-safe idêntico (sem troca mid-cycle).
  if NEW.release_id is not distinct from OLD.release_id
     and NEW.target_sha is not distinct from OLD.target_sha then
    return NEW;
  end if;

  raise exception '%', 'Alteração de binding release_id/target_sha fora dos padrões permitidos (initial bind, success clear ou reopen clear).'
    using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
end;
$$;

comment on function public.app_maintenance_orchestration_binding_guard() is
  'Trigger PRIVADO BEFORE UPDATE em app_maintenance_state. Proíbe binding parcial (release_id/target_sha) e restringe mudança de binding a 3 padrões: initial bind (NORMAL->NORMAL, unbound->full), success clear (SMOKE->NORMAL, full->null) e reopen clear futuro do B17 (FAILED/CANCELED->NORMAL com epoch maior, full->null). Qualquer outro caso exige binding NULL-safe idêntico (troca mid-cycle proibida).';

revoke all on function public.app_maintenance_orchestration_binding_guard() from public;
revoke all on function public.app_maintenance_orchestration_binding_guard() from anon;
revoke all on function public.app_maintenance_orchestration_binding_guard() from authenticated;
revoke all on function public.app_maintenance_orchestration_binding_guard() from service_role;

alter function public.app_maintenance_orchestration_binding_guard() owner to postgres;

create trigger app_maintenance_orchestration_binding_guard_trg
before update on public.app_maintenance_state
for each row
execute function public.app_maintenance_orchestration_binding_guard();

comment on trigger app_maintenance_orchestration_binding_guard_trg on public.app_maintenance_state is
  'Único trigger de binding do singleton — dispara app_maintenance_orchestration_binding_guard() antes de cada UPDATE.';

-- ════════════════════════════════════════════════════════════
--  4) PUBLIC RPC — app_maintenance_orchestration_start
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_start(
  p_release_id uuid,
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
  v_epoch integer;
  v_release_id uuid;
  v_target_sha text;
  v_release_status text;
  v_release_target_sha text;
begin
  -- Lock order: app_maintenance_state primeiro.
  select phase, epoch, release_id, target_sha
    into v_phase, v_epoch, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  -- START exige phase='NORMAL' E release_id/target_sha IS NULL (unbound) — as duas condições.
  if v_phase is distinct from 'NORMAL' then
    raise exception '%', 'Orquestração só pode iniciar a partir de NORMAL.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  if v_release_id is not null or v_target_sha is not null then
    raise exception '%', 'Já existe binding de release ativo no ciclo atual.'
      using errcode = 'P0001', detail = 'ACTIVE_RELEASE_CONFLICT';
  end if;

  -- Depois lock release (lock order: state -> release).
  select status, target_sha
    into v_release_status, v_release_target_sha
  from public.app_release_runs
  where id = p_release_id
  for update;

  if not found then
    raise exception '%', 'Release informada não existe.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  -- ACTIVE_RELEASE_STATUSES real (server/release-store.js), não inventado.
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

  if v_release_target_sha is distinct from p_target_sha then
    raise exception '%', 'target_sha informado não corresponde ao target_sha real da release.'
      using errcode = 'P0001', detail = 'TARGET_MISMATCH';
  end if;

  -- START_MUTATES_RELEASE_RUN = NÃO: app_release_runs nunca é alterada aqui.
  -- Na mesma UPDATE: release_id/target_sha reais, phase continua NORMAL, version += 1.
  update public.app_maintenance_state
  set phase = 'NORMAL',
      release_id = p_release_id,
      target_sha = p_target_sha,
      version = version + 1,
      reason = p_reason,
      updated_by_user_id = p_actor_user_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where scope = 'global';

  -- Exatamente 1 evento ORCHESTRATION_STARTED — nunca RELEASE_STARTED.
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
    p_release_id,
    'ORCHESTRATION_STARTED',
    'api',
    p_actor_user_id,
    p_actor_email,
    p_reason,
    p_metadata,
    now()
  );
end;
$$;

comment on function public.app_maintenance_orchestration_start(
  uuid, text, uuid, text, text, jsonb
) is
  'RPC PÚBLICA (service_role) — START do ciclo de orquestração. NORMAL->NORMAL (fora da matriz estrutural de 16 edges): exige unbound (release_id/target_sha NULL), valida a release (existência, ACTIVE_RELEASE_STATUSES real, target_sha real) e vincula na mesma UPDATE (version+1), sem alterar app_release_runs. Emite exatamente 1 evento ORCHESTRATION_STARTED — nunca RELEASE_STARTED (reservado para QUIESCENT->RELEASING). Não usa transition_internal (edge NORMAL->NORMAL não é estrutural).';

revoke all on function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  5) PUBLIC RPC — app_maintenance_orchestration_cancel
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_cancel(
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
  -- Allowed source somente: NORMAL, NOTICE. Destino hardcoded: CANCELED.
  if p_expected_phase not in ('NORMAL', 'NOTICE') then
    raise exception '%', 'Cancelamento só é permitido a partir de NORMAL ou NOTICE.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    p_expected_phase,
    p_expected_version,
    'CANCELED',
    null,
    null,
    false,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'MAINTENANCE_CANCELED',
    'api',
    p_reason,
    p_metadata
  );
end;
$$;

comment on function public.app_maintenance_orchestration_cancel(
  text, integer, uuid, text, text, jsonb
) is
  'RPC PÚBLICA (service_role) — CANCEL. Destino hardcoded CANCELED; source permitido somente NORMAL/NOTICE. Delega ao core privado (transition_internal), que valida CAS e as 16 edges estruturais. Evento MAINTENANCE_CANCELED. Não cria cancel_internal.';

revoke all on function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  6) PUBLIC RPC — app_maintenance_orchestration_fail
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_fail(
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
  -- Allowed source somente: FENCING, DRAINING, QUIESCENT. Destino hardcoded: FAILED.
  if p_expected_phase not in ('FENCING', 'DRAINING', 'QUIESCENT') then
    raise exception '%', 'Falha só é permitida a partir de FENCING, DRAINING ou QUIESCENT.'
      using errcode = 'P0001', detail = 'INVALID_TRANSITION';
  end if;

  perform public.app_maintenance_orchestration_transition_internal(
    p_expected_phase,
    p_expected_version,
    'FAILED',
    null,
    null,
    false,
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
  'RPC PÚBLICA (service_role) — FAIL. Destino hardcoded FAILED; source permitido somente FENCING/DRAINING/QUIESCENT (QUIESCENT->FAILED obrigatório entre as 16 edges). Delega ao core privado (transition_internal). Evento MAINTENANCE_FAILED. Não cria fail_internal.';

revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) to service_role;

alter function public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  7) STATE TABLE ACL — service_role perde UPDATE direto
-- ════════════════════════════════════════════════════════════
-- Toda mutação real do singleton passa a ocorrer exclusivamente dentro
-- das funções SECURITY DEFINER (owner postgres) deste orquestrador.
-- SELECT para service_role é preservado (leitura direta continua livre).
revoke update on table public.app_maintenance_state from service_role;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_events_reloid oid;
  v_state_reloid oid;
  v_new_condef text;
  v_new_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_private_count integer;
  v_public_count integer;
  v_trigger_count integer;
  v_start_oid oid;
  v_cancel_oid oid;
  v_fail_oid oid;
  v_transition_oid oid;
  v_guard_oid oid;
  v_public_execute boolean;
begin
  v_events_reloid := to_regclass('public.app_maintenance_events');
  v_state_reloid := to_regclass('public.app_maintenance_state');

  select pg_get_constraintdef(oid) into v_new_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';

  if v_new_condef is distinct from v_new_event_type_condef then
    raise exception 'postcheck 153: novo contrato de event_type divergente do superset de 17 valores esperado: %', v_new_condef;
  end if;
  if position('ORCHESTRATION_STARTED' in v_new_condef) = 0 then
    raise exception 'postcheck 153: ORCHESTRATION_STARTED deveria ser permitido pelo novo CHECK.';
  end if;

  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb)'
  );
  v_guard_oid := to_regprocedure('public.app_maintenance_orchestration_binding_guard()');
  v_start_oid := to_regprocedure('public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb)');
  v_cancel_oid := to_regprocedure('public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb)');
  v_fail_oid := to_regprocedure('public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)');

  if v_transition_oid is null then
    raise exception 'postcheck 153: transition_internal não encontrada.';
  end if;
  if v_guard_oid is null then
    raise exception 'postcheck 153: binding_guard não encontrada.';
  end if;
  if v_start_oid is null then
    raise exception 'postcheck 153: start não encontrada.';
  end if;
  if v_cancel_oid is null then
    raise exception 'postcheck 153: cancel não encontrada.';
  end if;
  if v_fail_oid is null then
    raise exception 'postcheck 153: fail não encontrada.';
  end if;

  select count(*) into v_private_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_maintenance_orchestration_transition_internal',
      'app_maintenance_orchestration_binding_guard'
    );
  if v_private_count <> 2 then
    raise exception 'postcheck 153: esperado exatamente 2 funções privadas (count=%).', v_private_count;
  end if;

  select count(*) into v_public_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_maintenance_orchestration_start',
      'app_maintenance_orchestration_cancel',
      'app_maintenance_orchestration_fail'
    );
  if v_public_count <> 3 then
    raise exception 'postcheck 153: esperado exatamente 3 RPCs públicas (count=%).', v_public_count;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where tgrelid = v_state_reloid
    and not tgisinternal
    and tgname = 'app_maintenance_orchestration_binding_guard_trg';
  if v_trigger_count <> 1 then
    raise exception 'postcheck 153: esperado exatamente 1 trigger de binding_guard (count=%).', v_trigger_count;
  end if;

  -- ACL: private core (transition_internal + binding_guard) sem EXECUTE para ninguém.
  if has_function_privilege('anon', v_transition_oid, 'execute')
     or has_function_privilege('authenticated', v_transition_oid, 'execute')
     or has_function_privilege('service_role', v_transition_oid, 'execute') then
    raise exception 'postcheck 153: transition_internal — anon/authenticated/service_role NÃO deveriam ter EXECUTE.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_transition_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 153: transition_internal — PUBLIC NÃO deveria ter EXECUTE.';
  end if;

  if has_function_privilege('anon', v_guard_oid, 'execute')
     or has_function_privilege('authenticated', v_guard_oid, 'execute')
     or has_function_privilege('service_role', v_guard_oid, 'execute') then
    raise exception 'postcheck 153: binding_guard — anon/authenticated/service_role NÃO deveriam ter EXECUTE.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_guard_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 153: binding_guard — PUBLIC NÃO deveria ter EXECUTE.';
  end if;

  -- ACL: wrappers públicos — somente service_role com EXECUTE.
  for v_transition_oid in
    select unnest(array[v_start_oid, v_cancel_oid, v_fail_oid])
  loop
    if not has_function_privilege('service_role', v_transition_oid, 'execute') then
      raise exception 'postcheck 153: wrapper público — service_role deveria ter EXECUTE (oid=%).', v_transition_oid;
    end if;
    if has_function_privilege('anon', v_transition_oid, 'execute')
       or has_function_privilege('authenticated', v_transition_oid, 'execute') then
      raise exception 'postcheck 153: wrapper público — anon/authenticated NÃO deveriam ter EXECUTE (oid=%).', v_transition_oid;
    end if;
    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_transition_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'postcheck 153: wrapper público — PUBLIC NÃO deveria ter EXECUTE (oid=%).', v_transition_oid;
    end if;
  end loop;

  -- ACL: state table.
  if not has_table_privilege('service_role', 'public.app_maintenance_state', 'select') then
    raise exception 'postcheck 153: service_role deveria manter SELECT em app_maintenance_state.';
  end if;
  if has_table_privilege('service_role', 'public.app_maintenance_state', 'update') then
    raise exception 'postcheck 153: service_role NÃO deveria mais ter UPDATE direto em app_maintenance_state.';
  end if;
end $$;

commit;
