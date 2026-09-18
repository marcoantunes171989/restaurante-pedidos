-- =====================================================================
-- 159_maintenance_abort_reopen_orchestration.behavior.sql
--
-- TESTE COMPORTAMENTAL (ROLLBACK-ONLY) das 2 RPCs publicas B17
-- (migration159 — abort RELEASING->ABORTING->FAILED e reopen
-- FAILED|CANCELED->NORMAL):
--   public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb)
--   public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb)
-- e do caminho completo do ciclo que precede o abort
-- (start150/notice156/fence-drain-quiesce154-155/release_start154-155),
-- necessario para produzir um binding real de release e chegar a
-- RELEASING. Reopen CANCELED usa o fluxo existente valido
-- start->cancel (NORMAL bound -> CANCELED).
--
-- Dependencias live lidas (nao criadas por este teste):
--   app_maintenance_orchestration_start (core150/153)
--   app_maintenance_orchestration_notice (156)
--   app_maintenance_orchestration_fence/drain_start/quiesce/
--     quiescence_probe/release_start (154, canonica em 155)
--   app_maintenance_orchestration_cancel (153)
--   app_maintenance_orchestration_transition_internal / binding_guard
--     (153, core — 16 edges intactas; FUTURE B17 REOPEN CLEAR)
--   app_maintenance_cutover_barrier_internal(boolean) (154/155)
--   app_assert_business_write_allowed(uuid, text) (154/155)
--
-- Alvo: HML. NUNCA producao/main.
--   HML project_ref  (unico ambiente permitido para este behavioral):
--     zzixvyspwszewhxzusot — confirmar este ref antes de qualquer execucao.
--   PROD project_ref: rwnzggjxhxnfrhstbxkm — PROIBIDO para este behavioral;
--     este ref NUNCA deve ser usado para executar este teste.
--
-- SOMENTE PREPARACAO / CONGELAMENTO (gate B17-I1). NAO EXECUTAR.
-- Quando executado no futuro: EXATAMENTE UMA chamada mutable
-- execute_sql (uma unica sessao/transacao — o arquivo inteiro,
-- BEGIN..ROLLBACK, enviado como um unico batch), somente apos
-- aprovacao humana explicita, confirmacao do projeto/ref e
-- credenciais via mecanismo seguro (nunca embutidas aqui).
--
-- Contrato REAL (lido de 138/140/153/154/155/156/157/158/159):
--   abort: source somente RELEASING; dois hops atômicos via
--     transition_internal; ABORTING nao e duravel; version +2;
--     epoch inalterado; binding preservado; aborted_at/abort_reason;
--     eventos MAINTENANCE_ABORTED + MAINTENANCE_FAILED; zero DML
--     em app_release_runs.
--   reopen: source FAILED|CANCELED; dedicada (nao usa
--     transition_internal); phase NORMAL; epoch+1; version+1;
--     binding NULL; 1 evento MAINTENANCE_REOPENED com release_id
--     NULL e epoch novo; preserva aborted_at/abort_reason/result_code.
--   binding_guard nao e enfraquecido neste harness.
--
-- Topologia (B17-I1):
--   SAVEPOINT/ROLLBACK TO SAVEPOINT sao statements TOP-LEVEL do batch,
--   FORA de qualquer bloco DO/PLpgSQL. Um unico SAVEPOINT (sp_bind)
--   isola o CENARIO F (forge de FAILED unbound via UPDATE de phase
--   apenas — binding permanece NULL, trigger permanece ativo).
--   Evidencia de F atravessa o ROLLBACK TO SAVEPOINT via TEMP
--   SEQUENCE (bt17i1_f_pass_flag / bt17i1_f_fail_flag).
--   Nenhum RAISE EXCEPTION interno escapa do seu DO.
--
-- Seguranca:
--   Uma transacao (abre no inicio, descarta no fim). Nenhuma
--     confirmacao persistente (sem COMMIT em nenhum ponto do arquivo).
--     Sem DDL permanente. Sem mutacao de migration history.
--     Sem objeto permanente — TEMP TABLE/SEQUENCE descartados no
--     ROLLBACK final. A release sintetica e criada e descartada
--     dentro desta unica transacao (nunca comitada).
-- =====================================================================

BEGIN;

CREATE TEMP TABLE bt17i1_results (
  seq        integer PRIMARY KEY,
  checkpoint text    NOT NULL,
  status     text    NOT NULL,
  detail     text    NOT NULL
);

CREATE TEMP TABLE bt17i1_ctx (
  release_id       uuid NOT NULL,
  target_sha       text NOT NULL,
  base_sha         text NOT NULL,
  actor_email      text NOT NULL,
  reason           text NOT NULL,
  abort_reason     text NOT NULL,
  metadata         jsonb NOT NULL,
  release_snapshot public.app_release_runs NOT NULL
);

CREATE TEMP TABLE bt17i1_control (
  failed       boolean NOT NULL,
  failed_stage text,
  sqlstate     text,
  message      text
);
INSERT INTO bt17i1_control (failed, failed_stage, sqlstate, message)
VALUES (false, NULL, NULL, NULL);

CREATE TEMP SEQUENCE bt17i1_f_pass_flag START 1;
CREATE TEMP SEQUENCE bt17i1_f_fail_flag START 1;

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — guard + fixture + ciclo ate RELEASING + cenarios A-E/G/C/D
-- ═══════════════════════════════════════════════════════════════════
DO $part1$
DECLARE
  v_tag           constant text := replace(gen_random_uuid()::text, '-', '');
  v_actor_email   constant text := 'b17i1.' || v_tag || '@bt.local';
  v_reason        constant text := 'B17-I1 behavioral harness (rollback-only)';
  v_abort_reason  constant text := 'B17-I1 abort reason';
  v_metadata      constant jsonb := jsonb_build_object('harness', 'B17-I1', 'tag', v_tag);

  v_release_id    uuid;
  v_base_sha      text;
  v_target_sha    text;
  v_rel_before    public.app_release_runs%rowtype;
  v_rel_after     public.app_release_runs%rowtype;

  v_phase         text;
  v_epoch         integer;
  v_version       integer;
  v_rel_id_state  uuid;
  v_sha_state     text;
  v_aborted_at    timestamptz;
  v_abort_reason_state text;
  v_result_code   text;

  v_version0      integer;
  v_version_pre   integer;
  v_epoch_pre     integer;
  v_version_releasing integer;
  v_epoch_fence   integer;

  v_evt_count     integer;
  v_evt_release_id uuid;
  v_evt_epoch     integer;

  v_count integer;
  v_abort_oid oid;
  v_reopen_oid oid;
  v_detail text;
BEGIN
  BEGIN
  RAISE NOTICE '=== 159_maintenance_abort_reopen_orchestration.behavior inicio (part1) tag=% ===', v_tag;

  v_abort_oid := to_regprocedure(
    'public.app_maintenance_orchestration_abort(integer, uuid, text, text, jsonb)'
  );
  v_reopen_oid := to_regprocedure(
    'public.app_maintenance_orchestration_reopen(text, integer, uuid, text, text, jsonb)'
  );
  IF v_abort_oid IS NULL OR v_reopen_oid IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: abort/reopen ausente ou com assinatura incompativel (migration 159 nao live)';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'app_maintenance_orchestration_abort',
      'app_maintenance_orchestration_reopen'
    );
  IF v_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: esperado exatamente 2 RPCs B17 (1 por nome), encontrado %', v_count;
  END IF;

  IF to_regprocedure('public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_cancel(text, integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') IS NULL
  THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: dependencia live do ciclo pre-B17 ausente';
  END IF;

  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version0, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state
  WHERE scope = 'global';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: app_maintenance_state global ausente';
  END IF;

  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_epoch IS DISTINCT FROM 0
     OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: estado inicial != NORMAL/epoch 0/unbound (phase=%, epoch=%, release_id=%, target_sha=%)',
      v_phase, v_epoch, v_rel_id_state, v_sha_state;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.app_release_runs
  WHERE status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED');
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: active_releases inicial != 0 (=%)', v_count;
  END IF;

  IF to_regclass('public.app_maintenance_operations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.app_maintenance_operations WHERE status = ''IN_FLIGHT''' INTO v_count;
    IF v_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: in_flight_ops inicial != 0 (=%)', v_count;
    END IF;
  END IF;

  INSERT INTO bt17i1_results VALUES (
    1, 'CHECKPOINT_FIXTURE_GUARD', 'PASS',
    format('2 RPCs B17, baseline NORMAL/epoch0/unbound (version0=%s), active_releases=0', v_version0)
  );

  v_release_id := gen_random_uuid();
  v_base_sha := encode(gen_random_bytes(20), 'hex');
  v_target_sha := encode(gen_random_bytes(20), 'hex');
  IF v_base_sha = v_target_sha THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: colisao improvavel de SHA sintetico';
  END IF;

  INSERT INTO public.app_release_runs (
    id, mode, status, base_sha, target_sha, requested_by_email
  ) VALUES (
    v_release_id, 'immediate', 'RUNNING', v_base_sha, v_target_sha,
    v_actor_email
  );

  SELECT * INTO v_rel_before FROM public.app_release_runs WHERE id = v_release_id;

  INSERT INTO bt17i1_ctx (
    release_id, target_sha, base_sha, actor_email, reason, abort_reason, metadata, release_snapshot
  ) VALUES (
    v_release_id, v_target_sha, v_base_sha, v_actor_email, v_reason, v_abort_reason, v_metadata, v_rel_before
  );

  INSERT INTO bt17i1_results VALUES (
    2, 'CHECKPOINT_FIXTURE_RELEASE', 'PASS',
    format('release_id=%s status=RUNNING', v_release_id)
  );

  v_version_pre := v_version0;
  PERFORM public.app_maintenance_orchestration_start(
    v_release_id, v_target_sha, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 0
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_START_FAIL: phase=% version=% epoch=% bound=%/%',
      v_phase, v_version, v_epoch, v_rel_id_state, v_sha_state;
  END IF;
  INSERT INTO bt17i1_results VALUES (3, 'CHECKPOINT_START', 'PASS', format('version %s->%s', v_version_pre, v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_notice(
    v_version_pre, NULL, v_actor_email, v_reason,
    'B17-I1 harness notice (rollback-only)', NULL, v_metadata
  );
  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NOTICE' OR v_version IS DISTINCT FROM v_version_pre + 1 OR v_epoch IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'CHECKPOINT_NOTICE_FAIL: phase=% version=% epoch=%', v_phase, v_version, v_epoch;
  END IF;
  INSERT INTO bt17i1_results VALUES (4, 'CHECKPOINT_NOTICE', 'PASS', format('phase=NOTICE version %s->%s', v_version_pre, v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_fence(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FENCING' OR v_version IS DISTINCT FROM v_version_pre + 1 OR v_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_FENCING_FAIL: phase=% version=% epoch=%', v_phase, v_version, v_epoch;
  END IF;
  v_epoch_fence := v_epoch;
  INSERT INTO bt17i1_results VALUES (5, 'CHECKPOINT_FENCING', 'PASS', format('epoch 0->%s', v_epoch));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_drain_start(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, version INTO v_phase, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'DRAINING' OR v_version IS DISTINCT FROM v_version_pre + 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_DRAINING_FAIL: phase=% version=%', v_phase, v_version;
  END IF;
  INSERT INTO bt17i1_results VALUES (6, 'CHECKPOINT_DRAINING', 'PASS', format('phase=DRAINING version %s->%s', v_version_pre, v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_quiesce(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, version INTO v_phase, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'QUIESCENT' OR v_version IS DISTINCT FROM v_version_pre + 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_QUIESCENT_FAIL: phase=% version=%', v_phase, v_version;
  END IF;
  INSERT INTO bt17i1_results VALUES (7, 'CHECKPOINT_QUIESCENT', 'PASS', format('phase=QUIESCENT version %s->%s', v_version_pre, v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_quiescence_probe(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, version INTO v_phase, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'QUIESCENT' OR v_version IS DISTINCT FROM v_version_pre THEN
    RAISE EXCEPTION 'CHECKPOINT_QUIESCENCE_PROBE_FAIL: probe nao deveria alterar phase/version';
  END IF;
  INSERT INTO bt17i1_results VALUES (8, 'CHECKPOINT_QUIESCENCE_PROBE', 'PASS', format('version inalterada (%s)', v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_release_start(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'RELEASING' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM v_epoch_fence
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_RELEASING_FAIL: phase=% version=% epoch=%', v_phase, v_version, v_epoch;
  END IF;
  v_version_releasing := v_version;
  INSERT INTO bt17i1_results VALUES (9, 'CHECKPOINT_RELEASING', 'PASS', format('phase=RELEASING version=%s', v_version));

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO E — VERSION CONFLICT (abort com expected_version obsoleto)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.app_maintenance_orchestration_abort(
      v_version_releasing - 1, NULL, v_actor_email, v_abort_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: abort com expected_version obsoleto deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'VERSION_CONFLICT' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'RELEASING' OR v_version IS DISTINCT FROM v_version_releasing
     OR v_epoch IS DISTINCT FROM v_epoch_fence THEN
    RAISE EXCEPTION 'CENARIO E abort stale mutou estado: phase=% version=% epoch=%', v_phase, v_version, v_epoch;
  END IF;
  INSERT INTO bt17i1_results VALUES (
    10, 'CHECKPOINT_E_ABORT_STALE', 'PASS',
    'VERSION_CONFLICT abort; zero mutation'
  );

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO A — ABORT HAPPY PATH
  -- ═══════════════════════════════════════════════════════════════
  PERFORM public.app_maintenance_orchestration_abort(
    v_version_releasing, NULL, v_actor_email, v_abort_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha, aborted_at, abort_reason, result_code
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_aborted_at, v_abort_reason_state, v_result_code
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'FAILED' THEN
    RAISE EXCEPTION 'CENARIO A FAIL: phase deveria ser FAILED (nao ABORTING duravel), encontrado %', v_phase;
  END IF;
  IF v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CENARIO A FAIL: binding nao preservado';
  END IF;
  IF v_epoch IS DISTINCT FROM v_epoch_fence THEN
    RAISE EXCEPTION 'CENARIO A FAIL: epoch deveria permanecer % (encontrado %)', v_epoch_fence, v_epoch;
  END IF;
  IF v_version IS DISTINCT FROM v_version_releasing + 2 THEN
    RAISE EXCEPTION 'CENARIO A FAIL: version delta deveria ser +2 (% -> %)', v_version_releasing, v_version;
  END IF;
  IF v_aborted_at IS NULL THEN
    RAISE EXCEPTION 'CENARIO A FAIL: aborted_at deveria ser NOT NULL';
  END IF;
  IF v_abort_reason_state IS DISTINCT FROM v_abort_reason THEN
    RAISE EXCEPTION 'CENARIO A FAIL: abort_reason=% esperado %', v_abort_reason_state, v_abort_reason;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_ABORTED' AND actor_email = v_actor_email;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CENARIO A FAIL: esperado 1 MAINTENANCE_ABORTED (=%s)', v_evt_count;
  END IF;
  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_FAILED' AND actor_email = v_actor_email;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CENARIO A FAIL: esperado 1 MAINTENANCE_FAILED (=%s)', v_evt_count;
  END IF;

  SELECT * INTO v_rel_after FROM public.app_release_runs WHERE id = v_release_id;
  IF v_rel_after IS DISTINCT FROM v_rel_before THEN
    RAISE EXCEPTION 'CENARIO A FAIL: app_release_runs mutada';
  END IF;

  INSERT INTO bt17i1_results VALUES (
    11, 'CHECKPOINT_A_ABORT_HAPPY', 'PASS',
    format('FAILED binding preservado epoch=%s version %s->%s aborted_at set', v_epoch, v_version_releasing, v_version)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO D — abort fora de RELEASING (agora FAILED)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  v_epoch_pre := v_epoch;
  BEGIN
    PERFORM public.app_maintenance_orchestration_abort(
      v_version_pre, NULL, v_actor_email, v_abort_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: abort fora de RELEASING deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'STATE_CONFLICT' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FAILED' OR v_version IS DISTINCT FROM v_version_pre OR v_epoch IS DISTINCT FROM v_epoch_pre THEN
    RAISE EXCEPTION 'CENARIO D abort-from-FAILED mutou estado';
  END IF;
  INSERT INTO bt17i1_results VALUES (12, 'CHECKPOINT_D_ABORT_FROM_FAILED', 'PASS', 'STATE_CONFLICT; zero mutation');

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO E — VERSION CONFLICT (reopen com version obsoleta)
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.app_maintenance_orchestration_reopen(
      'FAILED', v_version_pre - 1, NULL, v_actor_email, v_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: reopen com expected_version obsoleto deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'VERSION_CONFLICT' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FAILED' OR v_version IS DISTINCT FROM v_version_pre OR v_epoch IS DISTINCT FROM v_epoch_pre THEN
    RAISE EXCEPTION 'CENARIO E reopen stale mutou estado';
  END IF;
  INSERT INTO bt17i1_results VALUES (13, 'CHECKPOINT_E_REOPEN_STALE', 'PASS', 'VERSION_CONFLICT reopen; zero mutation');

  BEGIN
    PERFORM public.app_maintenance_orchestration_reopen(
      'SMOKE', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: reopen fora FAILED/CANCELED deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'INVALID_TRANSITION' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, version INTO v_phase, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FAILED' OR v_version IS DISTINCT FROM v_version_pre THEN
    RAISE EXCEPTION 'CENARIO D reopen-invalid-phase mutou estado';
  END IF;
  INSERT INTO bt17i1_results VALUES (14, 'CHECKPOINT_D_REOPEN_INVALID_PHASE', 'PASS', 'INVALID_TRANSITION; zero mutation');

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO G — write assert bloqueado em FAILED
  -- ═══════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
    RAISE EXCEPTION 'FALSE_PASS: write_assert em FAILED deveria bloquear begin';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'MAINTENANCE_FENCE_ACTIVE' THEN
      RAISE;
    END IF;
  END;
  INSERT INTO bt17i1_results VALUES (15, 'CHECKPOINT_G_WRITE_ASSERT_FAILED_BLOCKED', 'PASS', 'MAINTENANCE_FENCE_ACTIVE em FAILED');

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO B — REOPEN FAILED
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  v_epoch_pre := v_epoch;
  PERFORM public.app_maintenance_orchestration_reopen(
    'FAILED', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id, target_sha, aborted_at, abort_reason
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_aborted_at, v_abort_reason_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' THEN
    RAISE EXCEPTION 'CENARIO B FAIL: phase deveria ser NORMAL, encontrado %', v_phase;
  END IF;
  IF v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO B FAIL: binding deveria ser NULL';
  END IF;
  IF v_epoch IS DISTINCT FROM v_epoch_pre + 1 THEN
    RAISE EXCEPTION 'CENARIO B FAIL: epoch deveria ser +1 (% -> %)', v_epoch_pre, v_epoch;
  END IF;
  IF v_version IS DISTINCT FROM v_version_pre + 1 THEN
    RAISE EXCEPTION 'CENARIO B FAIL: version deveria ser +1 (% -> %)', v_version_pre, v_version;
  END IF;
  IF v_aborted_at IS NULL OR v_abort_reason_state IS DISTINCT FROM v_abort_reason THEN
    RAISE EXCEPTION 'CENARIO B FAIL: aborted_at/abort_reason deveriam ser preservados';
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_REOPENED' AND actor_email = v_actor_email;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CENARIO B FAIL: MAINTENANCE_REOPENED count=% (esperado 1)', v_evt_count;
  END IF;
  SELECT release_id, maintenance_epoch INTO v_evt_release_id, v_evt_epoch
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_REOPENED' AND actor_email = v_actor_email
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_evt_release_id IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO B FAIL: evento reopen release_id deveria ser NULL';
  END IF;
  IF v_evt_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'CENARIO B FAIL: evento reopen epoch=% esperado % (novo)', v_evt_epoch, v_epoch;
  END IF;

  SELECT * INTO v_rel_after FROM public.app_release_runs WHERE id = v_release_id;
  IF v_rel_after IS DISTINCT FROM v_rel_before THEN
    RAISE EXCEPTION 'CENARIO B FAIL: app_release_runs mutada';
  END IF;

  INSERT INTO bt17i1_results VALUES (
    16, 'CHECKPOINT_B_REOPEN_FAILED', 'PASS',
    format('NORMAL unbound epoch %s->%s version %s->%s', v_epoch_pre, v_epoch, v_version_pre, v_version)
  );

  PERFORM public.app_assert_business_write_allowed(NULL, NULL);
  INSERT INTO bt17i1_results VALUES (
    17, 'CHECKPOINT_G_WRITE_ASSERT_NORMAL_ALLOWED', 'PASS',
    format('write begin permitido em NORMAL pos-reopen epoch=%s (delta +1, sem grandfather de epoch antiga)', v_epoch)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO C — REOPEN CANCELED (fluxo existente valido)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_start(
    v_release_id, v_target_sha, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id INTO v_phase, v_epoch, v_version, v_rel_id_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_rel_id_state IS DISTINCT FROM v_release_id
     OR v_version IS DISTINCT FROM v_version_pre + 1 THEN
    RAISE EXCEPTION 'CENARIO C START FAIL: phase=% version=% bound=%', v_phase, v_version, v_rel_id_state;
  END IF;
  INSERT INTO bt17i1_results VALUES (18, 'CHECKPOINT_C_START_BOUND', 'PASS', format('NORMAL bound version=%s', v_version));

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_cancel(
    'NORMAL', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'CANCELED' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CENARIO C CANCEL FAIL: phase=% version=% bound=%/%', v_phase, v_version, v_rel_id_state, v_sha_state;
  END IF;
  INSERT INTO bt17i1_results VALUES (19, 'CHECKPOINT_C_CANCELED', 'PASS', format('CANCELED bound version=%s', v_version));

  v_version_pre := v_version;
  v_epoch_pre := v_epoch;
  PERFORM public.app_maintenance_orchestration_reopen(
    'CANCELED', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );
  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO C REOPEN FAIL: phase=% bound=%/%', v_phase, v_rel_id_state, v_sha_state;
  END IF;
  IF v_epoch IS DISTINCT FROM v_epoch_pre + 1 OR v_version IS DISTINCT FROM v_version_pre + 1 THEN
    RAISE EXCEPTION 'CENARIO C REOPEN FAIL: epoch %->% version %->%', v_epoch_pre, v_epoch, v_version_pre, v_version;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_REOPENED'
    AND actor_email = v_actor_email
    AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CENARIO C FAIL: MAINTENANCE_REOPENED no epoch novo count=%', v_evt_count;
  END IF;
  SELECT release_id INTO v_evt_release_id
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_REOPENED'
    AND actor_email = v_actor_email
    AND maintenance_epoch = v_epoch;
  IF v_evt_release_id IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO C FAIL: evento reopen release_id deveria ser NULL';
  END IF;

  SELECT * INTO v_rel_after FROM public.app_release_runs WHERE id = v_release_id;
  IF v_rel_after IS DISTINCT FROM v_rel_before THEN
    RAISE EXCEPTION 'CENARIO C FAIL: app_release_runs mutada';
  END IF;

  INSERT INTO bt17i1_results VALUES (
    20, 'CHECKPOINT_C_REOPEN_CANCELED', 'PASS',
    format('NORMAL unbound epoch %s->%s version %s->%s', v_epoch_pre, v_epoch, v_version_pre, v_version)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO D — abort/reopen a partir de NORMAL (pos-C)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  v_epoch_pre := v_epoch;
  BEGIN
    PERFORM public.app_maintenance_orchestration_abort(
      v_version_pre, NULL, v_actor_email, v_abort_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: abort a partir de NORMAL deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'STATE_CONFLICT' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, version INTO v_phase, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_version IS DISTINCT FROM v_version_pre THEN
    RAISE EXCEPTION 'CENARIO D abort-from-NORMAL mutou estado';
  END IF;
  INSERT INTO bt17i1_results VALUES (21, 'CHECKPOINT_D_ABORT_FROM_NORMAL', 'PASS', 'STATE_CONFLICT; zero mutation');

  BEGIN
    PERFORM public.app_maintenance_orchestration_reopen(
      'FAILED', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: reopen a partir de NORMAL deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'STATE_CONFLICT' THEN
      RAISE;
    END IF;
  END;
  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_version IS DISTINCT FROM v_version_pre
     OR v_epoch IS DISTINCT FROM v_epoch_pre
     OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO D reopen-from-NORMAL mutou estado';
  END IF;
  INSERT INTO bt17i1_results VALUES (22, 'CHECKPOINT_D_REOPEN_FROM_NORMAL', 'PASS', 'STATE_CONFLICT; zero mutation');

  RAISE NOTICE '=== part1 PASS_IN_TX (A-E/G/C/D) ===';
  EXCEPTION WHEN OTHERS THEN
    UPDATE bt17i1_control
       SET failed = true,
           failed_stage = 'part1',
           sqlstate = SQLSTATE,
           message = SQLERRM;
    RAISE NOTICE 'part1 FAIL capturado (fail-closed): sqlstate=% message=%', SQLSTATE, SQLERRM;
  END;
END;
$part1$;

SAVEPOINT sp_bind;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — CENARIO F: BINDING CONFLICT (FAILED unbound; guard intacto)
-- ═══════════════════════════════════════════════════════════════════
DO $part2$
DECLARE
  v_release_id    uuid;
  v_actor_email   text;
  v_reason        text;
  v_metadata      jsonb;
  v_version       integer;
  v_phase         text;
  v_rel_id_state  uuid;
  v_sha_state     text;
  v_detail        text;
  v_control_failed boolean;
BEGIN
  SELECT failed INTO v_control_failed FROM bt17i1_control;
  IF v_control_failed THEN
    PERFORM nextval('pg_temp.bt17i1_f_fail_flag');
    RAISE NOTICE 'part2 SKIPPED: falha previa em part1';
    RETURN;
  END IF;

  BEGIN
  SELECT release_id, actor_email, reason, metadata
    INTO v_release_id, v_actor_email, v_reason, v_metadata
  FROM bt17i1_ctx;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: bt17i1_ctx vazio no CENARIO F';
  END IF;

  -- Parcial nao pode ser fabricado sem enfraquecer o guard.
  BEGIN
    UPDATE public.app_maintenance_state
       SET release_id = v_release_id,
           target_sha = NULL
     WHERE scope = 'global';
    RAISE EXCEPTION 'FALSE_PASS: binding_guard deveria rejeitar binding parcial';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'ACTIVE_RELEASE_CONFLICT' THEN
      RAISE;
    END IF;
  END;

  -- Forge FAIL-CLOSED de FAILED unbound: somente phase, binding permanece NULL.
  -- Trigger permanece ativo; guard permite binding identico NULL/NULL.
  UPDATE public.app_maintenance_state
     SET phase = 'FAILED'
   WHERE scope = 'global';

  SELECT phase, version, release_id, target_sha
    INTO v_phase, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FAILED' OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO F FAIL: forge unbound FAILED nao estabeleceu phase=FAILED/binding NULL';
  END IF;

  BEGIN
    PERFORM public.app_maintenance_orchestration_reopen(
      'FAILED', v_version, NULL, v_actor_email, v_reason, v_metadata
    );
    RAISE EXCEPTION 'FALSE_PASS: reopen com binding ausente deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'STATE_CONFLICT' THEN
      RAISE;
    END IF;
  END;

  SELECT phase, version, release_id, target_sha
    INTO v_phase, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';
  IF v_phase IS DISTINCT FROM 'FAILED' OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CENARIO F FAIL: reopen ausente mutou estado';
  END IF;

  PERFORM nextval('pg_temp.bt17i1_f_pass_flag');
  RAISE NOTICE '=== part2 CENARIO F PASS_IN_TX ===';
  EXCEPTION WHEN OTHERS THEN
    PERFORM nextval('pg_temp.bt17i1_f_fail_flag');
    RAISE NOTICE 'part2 FAIL capturado (fail-closed): sqlstate=% message=%', SQLSTATE, SQLERRM;
  END;
END;
$part2$;

ROLLBACK TO SAVEPOINT sp_bind;

-- CENARIO H — ROLLBACK SAFETY: SELECT de evidencias + ROLLBACK final
-- explicito. Baseline persistente e recuperavel pelo ROLLBACK externo.
-- COMMIT = 0.
WITH ctrl AS (
  SELECT failed, failed_stage, sqlstate, message FROM bt17i1_control
),
fpass AS (
  SELECT is_called AS f_pass FROM bt17i1_f_pass_flag
),
ffail AS (
  SELECT is_called AS f_fail FROM bt17i1_f_fail_flag
),
chk AS (
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object('seq', seq, 'checkpoint', checkpoint, 'status', status, 'detail', detail)
        ORDER BY seq
      ),
      '[]'::jsonb
    ) AS checkpoints,
    count(*) AS checkpoint_count,
    count(*) FILTER (WHERE status IS DISTINCT FROM 'PASS') AS non_pass_count
  FROM bt17i1_results
),
verdict AS (
  SELECT (
    NOT ctrl.failed
    AND fpass.f_pass
    AND NOT ffail.f_fail
    AND chk.checkpoint_count = 22
    AND chk.non_pass_count = 0
  ) AS is_pass
  FROM ctrl, fpass, ffail, chk
)
SELECT
  CASE WHEN verdict.is_pass THEN 'PASS' ELSE 'FAIL' END AS overall_status,
  CASE
    WHEN ctrl.failed THEN ctrl.failed_stage
    WHEN ffail.f_fail THEN 'part2'
    WHEN NOT fpass.f_pass THEN 'part2'
    WHEN NOT verdict.is_pass THEN 'summary'
    ELSE NULL
  END AS failed_stage,
  CASE
    WHEN ctrl.failed THEN coalesce(ctrl.message, 'part1 runtime failure')
    WHEN ffail.f_fail THEN 'part2 CENARIO F assertion/runtime failure'
    WHEN NOT fpass.f_pass THEN 'CENARIO F pass flag not set'
    WHEN NOT verdict.is_pass THEN 'summary invariant violated (checkpoint count/status mismatch)'
    ELSE NULL
  END AS failure_message,
  ctrl.sqlstate AS failed_sqlstate,
  fpass.f_pass AS scenario_f_pass_flag,
  ffail.f_fail AS scenario_f_fail_flag,
  chk.checkpoint_count,
  chk.checkpoints,
  true AS rollback_only,
  'CENARIO H' AS rollback_safety
FROM ctrl, fpass, ffail, chk, verdict;

ROLLBACK;
