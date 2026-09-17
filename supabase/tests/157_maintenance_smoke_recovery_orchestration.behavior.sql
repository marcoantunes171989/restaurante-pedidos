-- =====================================================================
-- 157_maintenance_smoke_recovery_orchestration.behavior.sql
--
-- TESTE COMPORTAMENTAL (ROLLBACK-ONLY) das 4 RPCs publicas B16
-- (migration157/158 — RELEASING->SMOKE->{NORMAL|RECOVERING}->FAILED):
--   public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb)
--   public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb)
--   public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb)
--   public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)
-- e do caminho completo do ciclo que precede o B16
-- (start150/notice156/fence-drain-quiesce154-155/release_start154-155),
-- necessario para produzir um binding real de release e chegar a SMOKE.
--
-- Dependencias live lidas (nao criadas por este teste):
--   app_maintenance_orchestration_start (core150/153)
--   app_maintenance_orchestration_notice (156)
--   app_maintenance_orchestration_fence/drain_start/quiesce/
--     quiescence_probe/release_start (154, canonica em 155)
--   app_maintenance_orchestration_transition_internal / binding_guard
--     (153, core)
--   app_maintenance_cutover_barrier_internal(boolean) (154/155)
--   app_maintenance_drain_in_flight_count_internal() (154, via quiesce/
--     probe/release_start — nao chamado diretamente por este harness)
--
-- Alvo: HML (rwnzggjxhxnfrhstbxkm). Nunca producao/main.
--
-- SOMENTE PREPARACAO / CONGELAMENTO (gate B16-A5A). NAO EXECUTAR.
-- Quando executado no futuro: EXATAMENTE UMA chamada mutable
-- execute_sql (uma unica sessao/transacao — o arquivo inteiro,
-- BEGIN..ROLLBACK, enviado como um unico batch), somente apos
-- aprovacao humana explicita, confirmacao do projeto/ref e
-- credenciais via mecanismo seguro (nunca embutidas aqui).
--
-- Inspecao read-only (2026-09-17, supabase-pedido-prime-hml-ro):
--   app_maintenance_state: scope=global, phase=NORMAL, epoch=0,
--     version=3, release_id=NULL, target_sha=NULL, fence_effective_at=NULL.
--   app_release_runs: active_releases=0 (status fora de
--     SUCCEEDED/FAILED/CANCELED = 0) — precondicao do
--     app_release_runs_single_active_uidx (indice unico parcial,
--     no maximo 1 linha ativa em toda a tabela).
--   app_maintenance_operations: in_flight_ops=0 — drain count=0 e
--     satisfeito trivialmente (quiesce/probe/release_start).
--   migration157/158 live em supabase_migrations.schema_migrations.
--   app_maintenance_orchestration_{smoke,success,recover,fail} = 1/1/1/1
--     (STATE B da reconciliacao 158 — fail com RECOVERING).
--   Este artefato DEVE falhar imediatamente (BLOCKED_FIXTURE_NOT_SAFE)
--   se qualquer uma dessas condicoes nao se sustentar na execucao futura.
--
-- Contrato REAL (lido de 138/140/153/154/155/156/157/158, nao assumido):
--   app_release_runs: id uuid PK, mode text ('immediate'|'scheduled'),
--     status text (enum control-plane), base_sha/target_sha text
--     (regex ^[0-9a-f]{40}$, base<>target). Indice unico parcial
--     app_release_runs_single_active_uidx — no maximo 1 linha com
--     status em (REQUESTED,SCHEDULED,WAITING,VALIDATING,DISPATCHED,
--     RUNNING) em toda a tabela.
--   app_maintenance_orchestration_start(release_id, target_sha,
--     actor_user_id, actor_email, reason, metadata): exige NORMAL +
--     unbound, release ativa, target_sha bate; UPDATE direto (nao usa
--     transition_internal, pois NORMAL->NORMAL nao e edge estrutural),
--     version+1, evento ORCHESTRATION_STARTED. Nao mexe em epoch.
--   app_maintenance_orchestration_notice(expected_version, actor_user_id,
--     actor_email, reason, message_public, scheduled_for, metadata):
--     NORMAL->NOTICE via transition_internal, version+1, binding
--     preservado, epoch preservado.
--   fence: NOTICE->FENCING, epoch+1 (UPDATE proprio, sem version+1
--     duplicado) + transition_internal (version+1). Unico B16-adjacent
--     que toca epoch nesta cadeia.
--   drain_start: FENCING->DRAINING, version+1. Nao exige drain=0.
--   quiesce: DRAINING->QUIESCENT, exige drain_in_flight_count=0,
--     version+1, quiet_since/quiescent_at sem segundo version+1.
--   quiescence_probe: NAO e edge estrutural — nao toca phase/version/
--     binding/epoch; exige QUIESCENT + drain=0; insere
--     QUIESCENCE_PROBE_PASSED (idempotente por epoch).
--   release_start: QUIESCENT->RELEASING, exige release bound ativa
--     (lock sem UPDATE), target_sha match, drain=0 e
--     QUIESCENCE_PROBE_PASSED do epoch atual; version+1.
--   smoke (157): RELEASING->SMOKE, version+1, smoke_started_at,
--     binding preservado (core passa null/null a transition_internal,
--     que mantem v_release_id/v_target_sha correntes), evento
--     SMOKE_STARTED.
--   success (157): SMOKE->NORMAL, version+1, epoch preservado,
--     binding limpo deterministicamente pelo core (SUCCESS_CLEAR —
--     unica edge que zera release_id/target_sha), evento
--     MAINTENANCE_COMPLETED.release_id = NULL (v_new_release_id).
--   recover (157): SMOKE->RECOVERING, version+1, binding preservado
--     (nao e a edge SUCCESS_CLEAR), evento RECOVERY_STARTED.
--   fail (157/158 REPLACE): allowlist FENCING/DRAINING/QUIESCENT/
--     RECOVERING -> FAILED hardcoded; delega ao core; binding
--     preservado (idem, nao e SUCCESS_CLEAR); evento MAINTENANCE_FAILED.
--   Nenhuma das 4 RPCs B16 altera app_release_runs (nem smoke, que
--     apenas SELECT...FOR UPDATE da release bound).
--
-- Identidade/autorizacao: diferente do harness de checkout (151/152),
--   as RPCs do B12-B16 (start..fail) sao SECURITY DEFINER
--   service_role-only e recebem p_actor_user_id/p_actor_email como
--   PARAMETROS diretos — nao chamam app_caller_email()/auth.jwt().
--   Este harness NAO precisa de set_config de GUCs de sessao, SET ROLE
--   ou Auth API; passa identidade sintetica (actor_user_id NULL,
--   actor_email fixture) diretamente nos parametros, como o proprio
--   controller/executor faria via service_role.
--
-- Concorrencia: uma sessao/transacao. O indice unico parcial de
--   app_release_runs e o singleton app_maintenance_state (scope=
--   'global') sao ambos globais ao projeto — a insercao da release
--   sintetica e o ciclo completo assumem active_releases=0 e
--   phase=NORMAL no INICIO desta transacao (verificado pelo guard
--   fail-closed abaixo). Corrida real com outra sessao/orquestracao
--   legitima NAO e executada nem simulada.
--   TRUE_TWO_SESSION_RACE_EXECUTED = NAO
--
-- Topologia (B16-A5A-R1 — reparo do savepoint flow):
--   SAVEPOINT/ROLLBACK TO SAVEPOINT sao statements TOP-LEVEL do batch,
--   FORA de qualquer bloco DO/PLpgSQL (Postgres nao permite controle
--   de transacao dentro de PL/pgSQL). O harness e dividido em 3 blocos
--   DO sequenciais dentro da mesma transacao:
--     part1 — guard + fixture + ciclo pre-B16 ate CHECKPOINT_SMOKE,
--       grava o contexto necessario (release/target_sha/versao/epoch
--       de SMOKE, snapshot da release sintetica) em bt16a5a_ctx (TEMP
--       TABLE criada ANTES do SAVEPOINT, portanto sobrevive ao
--       ROLLBACK TO SAVEPOINT).
--     SAVEPOINT sp_smoke;
--     part2 — CENARIO A (SUCCESS): roda success, valida TODOS os
--       invariantes; SOMENTE depois de todos os asserts PASS, avanca
--       bt16a5a_success_flag (TEMP SEQUENCE criada ANTES do SAVEPOINT).
--       NAO insere checkpoint transacional em bt16a5a_results, pois
--       essa linha seria revertida pelo rollback do savepoint a seguir
--       e nao pode servir de evidencia final.
--     ROLLBACK TO SAVEPOINT sp_smoke;
--     part3 — prova volta a SMOKE e MAINTENANCE_COMPLETED=0; roda
--       CENARIO B (RECOVER->FAIL); grava os checkpoints restantes.
--   Evidencia do CENARIO A atravessa o ROLLBACK TO SAVEPOINT
--   exclusivamente via bt16a5a_success_flag (nextval antes do
--   rollback preserva is_called=true depois dele — sequences nao sao
--   revertidas por ROLLBACK TO SAVEPOINT, ao contrario de tabelas). O
--   SELECT final sintetiza a linha CHECKPOINT_SUCCESS a partir dessa
--   sequence; os demais 14 checkpoints vem de bt16a5a_results.
--
-- Seguranca:
--   Uma transacao (abre no inicio, descarta no fim). Nenhuma
--     confirmacao persistente (sem COMMIT em nenhum ponto do arquivo).
--     Sem DDL permanente. Sem mutacao de migration history. Sem Auth
--     API. Sem extensao nova (pgcrypto ja habilitada, usada apenas
--     para gen_random_bytes/gen_random_uuid, ja em uso pelo core).
--     Sem objeto permanente — bt16a5a_results, bt16a5a_ctx (TEMP
--     TABLE) e bt16a5a_success_flag (TEMP SEQUENCE) sao todos objetos
--     de sessao, descartados no ROLLBACK final. A release sintetica e
--     criada e descartada dentro desta unica transacao (nunca
--     comitada). SAVEPOINT/ROLLBACK TO SAVEPOINT (top-level) provam
--     reversibilidade do cenario A (SUCCESS) sem perder o restante do
--     harness. Expectativa nao atendida => RAISE EXCEPTION
--     (fail-closed).
--   Nao faz UPDATE direto em app_maintenance_state para forjar fases —
--     toda transicao de fase passa por uma RPC publica real.
--   Nao faz INSERT direto em app_maintenance_events — todo evento e
--     produzido pelas RPCs/core reais; o harness apenas LE a timeline
--     para validar o contrato (ex.: MAINTENANCE_COMPLETED.release_id).
--   Nao altera nenhuma linha historica de app_release_runs — cria
--     exatamente 1 linha sintetica nova, nunca commitada.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE bt16a5a_results (
  seq        integer PRIMARY KEY,
  checkpoint text    NOT NULL,
  status     text    NOT NULL,
  detail     text    NOT NULL
);

-- Contexto que precisa sobreviver ao ROLLBACK TO SAVEPOINT sp_smoke —
-- por isso e criado e populado ANTES do savepoint (part1), e somente
-- lido (nunca escrito) em part2/part3.
CREATE TEMP TABLE bt16a5a_ctx (
  release_id       uuid NOT NULL,
  target_sha       text NOT NULL,
  base_sha         text NOT NULL,
  actor_email      text NOT NULL,
  reason           text NOT NULL,
  metadata         jsonb NOT NULL,
  smoke_version    integer NOT NULL,
  smoke_epoch      integer NOT NULL,
  release_snapshot public.app_release_runs NOT NULL
);

-- Unico canal de evidencia do CENARIO A (SUCCESS) que atravessa o
-- ROLLBACK TO SAVEPOINT sp_smoke: sequences nao sao revertidas por
-- ROLLBACK TO SAVEPOINT (apenas por ROLLBACK/COMMIT da transacao
-- externa). Criada ANTES do savepoint.
CREATE TEMP SEQUENCE bt16a5a_success_flag START 1;

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — guard + fixture + ciclo pre-B16 ate CHECKPOINT_SMOKE
-- ═══════════════════════════════════════════════════════════════════
DO $part1$
DECLARE
  v_tag           constant text := replace(gen_random_uuid()::text, '-', '');
  v_actor_email   constant text := 'b16a5a.' || v_tag || '@bt.local';
  v_reason        constant text := 'B16-A5A behavioral harness (rollback-only)';
  v_metadata      constant jsonb := jsonb_build_object('harness', 'B16-A5A', 'tag', v_tag);

  v_release_id    uuid;
  v_base_sha      text;
  v_target_sha    text;
  v_rel_before    public.app_release_runs%rowtype;

  v_phase         text;
  v_epoch         integer;
  v_version       integer;
  v_rel_id_state  uuid;
  v_sha_state     text;

  v_version0      integer;
  v_version_pre   integer;

  v_smoke_started_at    timestamptz;
  v_release_started_at  timestamptz;

  v_evt_count      integer;

  v_count integer;
  v_smoke_oid oid;
  v_success_oid oid;
  v_recover_oid oid;
  v_fail_oid oid;
  v_fail_src text;
BEGIN
  RAISE NOTICE '=== 157_maintenance_smoke_recovery_orchestration.behavior inicio (part1) tag=% ===', v_tag;

  -- ═══════════════════════════════════════════════════════════════
  -- GUARD fail-closed — RPCs B16 canonicas (STATE B) + baseline
  -- ═══════════════════════════════════════════════════════════════
  v_smoke_oid := to_regprocedure(
    'public.app_maintenance_orchestration_smoke(integer, uuid, text, text, jsonb)'
  );
  v_success_oid := to_regprocedure(
    'public.app_maintenance_orchestration_success(integer, uuid, text, text, jsonb)'
  );
  v_recover_oid := to_regprocedure(
    'public.app_maintenance_orchestration_recover(integer, uuid, text, text, jsonb)'
  );
  v_fail_oid := to_regprocedure(
    'public.app_maintenance_orchestration_fail(text, integer, uuid, text, text, jsonb)'
  );
  IF v_smoke_oid IS NULL OR v_success_oid IS NULL OR v_recover_oid IS NULL OR v_fail_oid IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: alguma RPC B16 (smoke/success/recover/fail) ausente ou com assinatura incompativel (migration 157/158 nao live)';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'app_maintenance_orchestration_smoke',
      'app_maintenance_orchestration_success',
      'app_maintenance_orchestration_recover',
      'app_maintenance_orchestration_fail'
    );
  IF v_count IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: esperado exatamente 4 RPCs B16 (1 por nome), encontrado % (overload inesperado)', v_count;
  END IF;

  SELECT prosrc INTO v_fail_src FROM pg_proc WHERE oid = v_fail_oid;
  IF v_fail_src !~ 'p_expected_phase not in \(''FENCING'', ''DRAINING'', ''QUIESCENT'', ''RECOVERING''\)' THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: fail nao esta na semantica STATE B (allowlist deveria incluir RECOVERING) — migration 158 nao reconciliada';
  END IF;

  IF to_regprocedure('public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_fence(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_drain_start(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_quiesce(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_quiescence_probe(integer, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.app_maintenance_orchestration_release_start(integer, uuid, text, text, jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: dependencia live do ciclo pre-B16 (start/notice/fence/drain_start/quiesce/probe/release_start) ausente';
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
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: active_releases inicial != 0 (=%) — violaria app_release_runs_single_active_uidx', v_count;
  END IF;

  IF to_regclass('public.app_maintenance_operations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.app_maintenance_operations WHERE status = ''IN_FLIGHT''' INTO v_count;
    IF v_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: in_flight_ops inicial != 0 (=%) — quiesce/probe/release_start exigem drain=0', v_count;
    END IF;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    1, 'CHECKPOINT_FIXTURE_GUARD', 'PASS',
    format('4 RPCs B16 (STATE B), baseline NORMAL/epoch0/unbound (version0=%s), active_releases=0', v_version0)
  );
  RAISE NOTICE 'CHECKPOINT_FIXTURE_GUARD=PASS version0=%', v_version0;

  -- ═══════════════════════════════════════════════════════════════
  -- FIXTURE — release sintetica, criada e descartada nesta transacao
  -- ═══════════════════════════════════════════════════════════════
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

  SELECT count(*) INTO v_count
  FROM public.app_release_runs
  WHERE status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED');
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_FIXTURE_RELEASE_FAIL: active_releases deveria ser 1 apos insert sintetico (=%)', v_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    2, 'CHECKPOINT_FIXTURE_RELEASE', 'PASS',
    format('release_id=%s status=RUNNING base_sha=%s target_sha=%s', v_release_id, v_base_sha, v_target_sha)
  );
  RAISE NOTICE 'CHECKPOINT_FIXTURE_RELEASE=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_START — NORMAL (unbound) -> NORMAL (bound)
  -- ═══════════════════════════════════════════════════════════════
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
    RAISE EXCEPTION 'CHECKPOINT_START_FAIL: phase=% version=%(esperado %) epoch=% bound=%/%(esperado %/%)',
      v_phase, v_version, v_version_pre + 1, v_epoch, v_rel_id_state, v_sha_state, v_release_id, v_target_sha;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    3, 'CHECKPOINT_START', 'PASS',
    format('phase=NORMAL(bound) version %s->%s', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_START=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_NOTICE — NORMAL -> NOTICE
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_notice(
    v_version_pre, NULL, v_actor_email, v_reason,
    'B16-A5A harness notice (rollback-only)', NULL, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'NOTICE' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 0
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_NOTICE_FAIL: phase=% version=%(esperado %) epoch=%', v_phase, v_version, v_version_pre + 1, v_epoch;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    4, 'CHECKPOINT_NOTICE', 'PASS',
    format('phase=NOTICE version %s->%s', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_NOTICE=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_FENCING — NOTICE -> FENCING (unico ponto que toca epoch)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_fence(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'FENCING' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 1
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_FENCING_FAIL: phase=% version=%(esperado %) epoch=%(esperado 1)', v_phase, v_version, v_version_pre + 1, v_epoch;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    5, 'CHECKPOINT_FENCING', 'PASS',
    format('phase=FENCING version %s->%s epoch 0->1', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_FENCING=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_DRAINING — FENCING -> DRAINING
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_drain_start(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'DRAINING' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_DRAINING_FAIL: phase=% version=%(esperado %) epoch=%', v_phase, v_version, v_version_pre + 1, v_epoch;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    6, 'CHECKPOINT_DRAINING', 'PASS',
    format('phase=DRAINING version %s->%s', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_DRAINING=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_QUIESCENT — DRAINING -> QUIESCENT (drain=0 trivial)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_quiesce(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'QUIESCENT' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_QUIESCENT_FAIL: phase=% version=%(esperado %) epoch=%', v_phase, v_version, v_version_pre + 1, v_epoch;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    7, 'CHECKPOINT_QUIESCENT', 'PASS',
    format('phase=QUIESCENT version %s->%s', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_QUIESCENT=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_QUIESCENCE_PROBE — nao e edge estrutural (version fixo)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_quiescence_probe(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version INTO v_phase, v_epoch, v_version
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'QUIESCENT' OR v_version IS DISTINCT FROM v_version_pre
     OR v_epoch IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_QUIESCENCE_PROBE_FAIL: probe nao deveria alterar phase/version/epoch (phase=% version=% epoch=%)', v_phase, v_version, v_epoch;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'QUIESCENCE_PROBE_PASSED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_QUIESCENCE_PROBE_FAIL: esperado exatamente 1 QUIESCENCE_PROBE_PASSED no epoch % (=%)', v_epoch, v_evt_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    8, 'CHECKPOINT_QUIESCENCE_PROBE', 'PASS',
    format('QUIESCENCE_PROBE_PASSED emitido, version inalterada (%s)', v_version)
  );
  RAISE NOTICE 'CHECKPOINT_QUIESCENCE_PROBE=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_RELEASING — QUIESCENT -> RELEASING
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_release_start(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_started_at
    INTO v_phase, v_epoch, v_version, v_release_started_at
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'RELEASING' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 1 OR v_release_started_at IS NULL THEN
    RAISE EXCEPTION 'CHECKPOINT_RELEASING_FAIL: phase=% version=%(esperado %) release_started_at=%', v_phase, v_version, v_version_pre + 1, v_release_started_at;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    9, 'CHECKPOINT_RELEASING', 'PASS',
    format('phase=RELEASING version %s->%s release_started_at=%s', v_version_pre, v_version, v_release_started_at)
  );
  RAISE NOTICE 'CHECKPOINT_RELEASING=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_SMOKE — RELEASING -> SMOKE (B16 comeca aqui)
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_smoke(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha, smoke_started_at
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_smoke_started_at
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'SMOKE' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM 1 OR v_smoke_started_at IS NULL
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_SMOKE_FAIL: phase=% version=%(esperado %) smoke_started_at=% bound=%/%',
      v_phase, v_version, v_version_pre + 1, v_smoke_started_at, v_rel_id_state, v_sha_state;
  END IF;

  -- D3: assert explicito de SMOKE_STARTED (nao apenas phase/version).
  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'SMOKE_STARTED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_SMOKE_FAIL: esperado exatamente 1 SMOKE_STARTED no epoch % (=%)', v_epoch, v_evt_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    10, 'CHECKPOINT_SMOKE', 'PASS',
    format('phase=SMOKE version %s->%s epoch=1 binding preservado, SMOKE_STARTED emitido', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_SMOKE=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- Persiste em bt16a5a_ctx tudo que part2/part3 precisam, ANTES do
  -- SAVEPOINT top-level que vem a seguir (fora deste bloco DO).
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO bt16a5a_ctx (
    release_id, target_sha, base_sha, actor_email, reason, metadata,
    smoke_version, smoke_epoch, release_snapshot
  ) VALUES (
    v_release_id, v_target_sha, v_base_sha, v_actor_email, v_reason, v_metadata,
    v_version, v_epoch, v_rel_before
  );

  RAISE NOTICE '=== part1 PASS_IN_TX (ate CHECKPOINT_SMOKE, contexto persistido em bt16a5a_ctx) ===';
END;
$part1$;

-- SAVEPOINT top-level — ponto de retorno para o cenario A (SUCCESS).
-- NAO pode estar dentro de um bloco DO/PLpgSQL (D1).
SAVEPOINT sp_smoke;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — CENARIO A: SMOKE -> SUCCESS -> NORMAL
-- ═══════════════════════════════════════════════════════════════════
DO $part2$
DECLARE
  v_release_id        uuid;
  v_target_sha        text;
  v_actor_email       text;
  v_reason            text;
  v_metadata          jsonb;
  v_smoke_version     integer;
  v_smoke_epoch       integer;
  v_release_snapshot  public.app_release_runs;

  v_phase             text;
  v_epoch             integer;
  v_version           integer;
  v_rel_id_state      uuid;
  v_sha_state         text;
  v_completed_at      timestamptz;

  v_evt_count         integer;
  v_evt_release_id    text;

  v_rel_after         public.app_release_runs%rowtype;
BEGIN
  SELECT release_id, target_sha, actor_email, reason, metadata,
         smoke_version, smoke_epoch, release_snapshot
    INTO v_release_id, v_target_sha, v_actor_email, v_reason, v_metadata,
         v_smoke_version, v_smoke_epoch, v_release_snapshot
  FROM bt16a5a_ctx;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: bt16a5a_ctx vazio ao entrar no cenario A (SUCCESS)';
  END IF;

  PERFORM public.app_maintenance_orchestration_success(
    v_smoke_version, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha, completed_at
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_completed_at
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_version IS DISTINCT FROM v_smoke_version + 1
     OR v_epoch IS DISTINCT FROM v_smoke_epoch OR v_completed_at IS NULL
     OR v_rel_id_state IS NOT NULL OR v_sha_state IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKPOINT_SUCCESS_FAIL: phase=% version=%(esperado %) epoch=%(esperado %) binding=%/% (esperado NULL/NULL) completed_at=%',
      v_phase, v_version, v_smoke_version + 1, v_epoch, v_smoke_epoch, v_rel_id_state, v_sha_state, v_completed_at;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_COMPLETED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_SUCCESS_FAIL: esperado exatamente 1 MAINTENANCE_COMPLETED no epoch % (=%)', v_epoch, v_evt_count;
  END IF;

  SELECT release_id::text INTO v_evt_release_id
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_COMPLETED' AND maintenance_epoch = v_epoch
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_evt_release_id IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKPOINT_SUCCESS_FAIL: evento MAINTENANCE_COMPLETED.release_id deveria ser NULL (SUCCESS_CLEAR), obtido %', v_evt_release_id;
  END IF;

  SELECT * INTO v_rel_after FROM public.app_release_runs WHERE id = v_release_id;
  IF v_release_snapshot IS DISTINCT FROM v_rel_after THEN
    RAISE EXCEPTION 'CHECKPOINT_SUCCESS_FAIL: app_release_runs.% foi alterada durante o cenario A (SUCCESS)', v_release_id;
  END IF;

  -- D2: SOMENTE depois de TODOS os asserts acima terem passado, avanca
  -- a evidencia que precisa sobreviver ao ROLLBACK TO SAVEPOINT a
  -- seguir. Nenhuma linha e inserida em bt16a5a_results aqui — seria
  -- revertida pelo rollback do savepoint e nao pode ser evidencia
  -- final do cenario SUCCESS.
  PERFORM nextval('pg_temp.bt16a5a_success_flag');

  RAISE NOTICE 'CHECKPOINT_SUCCESS=PASS (part2; evidencia via TEMP sequence, nao persistida em bt16a5a_results)';
END;
$part2$;

-- ROLLBACK TO SAVEPOINT top-level — descarta o CENARIO A (SUCCESS) e
-- volta exatamente para o estado pos-SMOKE. NAO pode estar dentro de
-- um bloco DO/PLpgSQL (D1).
ROLLBACK TO SAVEPOINT sp_smoke;

-- ═══════════════════════════════════════════════════════════════════
-- PART 3 — prova volta a SMOKE, CENARIO B: SMOKE -> RECOVERING -> FAILED
-- ═══════════════════════════════════════════════════════════════════
DO $part3$
DECLARE
  v_release_id        uuid;
  v_target_sha        text;
  v_actor_email       text;
  v_reason            text;
  v_metadata          jsonb;
  v_smoke_version     integer;
  v_smoke_epoch       integer;
  v_release_snapshot  public.app_release_runs;

  v_phase             text;
  v_epoch             integer;
  v_version           integer;
  v_version_pre       integer;
  v_rel_id_state      uuid;
  v_sha_state         text;
  v_smoke_started_at  timestamptz;
  v_recovering_at     timestamptz;

  v_count             integer;
  v_evt_count         integer;

  v_rel_after         public.app_release_runs%rowtype;
  v_success_flag_called boolean;
BEGIN
  SELECT release_id, target_sha, actor_email, reason, metadata,
         smoke_version, smoke_epoch, release_snapshot
    INTO v_release_id, v_target_sha, v_actor_email, v_reason, v_metadata,
         v_smoke_version, v_smoke_epoch, v_release_snapshot
  FROM bt16a5a_ctx;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: bt16a5a_ctx vazio apos ROLLBACK TO SAVEPOINT';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE — prova retorno a SMOKE e que
  -- o MAINTENANCE_COMPLETED do cenario A foi revertido (D3).
  -- ═══════════════════════════════════════════════════════════════
  SELECT phase, epoch, version, release_id, target_sha, smoke_started_at
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_smoke_started_at
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'SMOKE' OR v_version IS DISTINCT FROM v_smoke_version
     OR v_epoch IS DISTINCT FROM v_smoke_epoch OR v_smoke_started_at IS NULL
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE_FAIL: esperado SMOKE/version=%/bound, obtido phase=% version=% bound=%/%',
      v_smoke_version, v_phase, v_version, v_rel_id_state, v_sha_state;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.app_release_runs
  WHERE status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED');
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE_FAIL: active_releases deveria voltar a 1 apos ROLLBACK TO SAVEPOINT (=%)', v_count;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_COMPLETED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE_FAIL: MAINTENANCE_COMPLETED deveria ser 0 apos ROLLBACK TO SAVEPOINT (=%)', v_evt_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    12, 'CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE', 'PASS',
    format('ROLLBACK TO SAVEPOINT restaurou phase=SMOKE version=%s binding=%s/%s, MAINTENANCE_COMPLETED=0', v_version, v_rel_id_state, v_sha_state)
  );
  RAISE NOTICE 'CHECKPOINT_AFTER_ROLLBACK_TO_SMOKE=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CENARIO B: SMOKE -> RECOVERING -> FAILED
  -- ═══════════════════════════════════════════════════════════════
  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_recover(
    v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha, recovering_at
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state, v_recovering_at
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'RECOVERING' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM v_smoke_epoch OR v_recovering_at IS NULL
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_RECOVER_FAIL: phase=% version=%(esperado %) binding=%/% (esperado preservado %/%) recovering_at=%',
      v_phase, v_version, v_version_pre + 1, v_rel_id_state, v_sha_state, v_release_id, v_target_sha, v_recovering_at;
  END IF;

  -- D3: assert explicito de RECOVERY_STARTED (nao apenas phase/version).
  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'RECOVERY_STARTED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_RECOVER_FAIL: esperado exatamente 1 RECOVERY_STARTED no epoch % (=%)', v_epoch, v_evt_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    13, 'CHECKPOINT_RECOVER', 'PASS',
    format('phase=RECOVERING version %s->%s binding preservado, RECOVERY_STARTED emitido', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_RECOVER=PASS';

  v_version_pre := v_version;
  PERFORM public.app_maintenance_orchestration_fail(
    'RECOVERING', v_version_pre, NULL, v_actor_email, v_reason, v_metadata
  );

  SELECT phase, epoch, version, release_id, target_sha
    INTO v_phase, v_epoch, v_version, v_rel_id_state, v_sha_state
  FROM public.app_maintenance_state WHERE scope = 'global';

  IF v_phase IS DISTINCT FROM 'FAILED' OR v_version IS DISTINCT FROM v_version_pre + 1
     OR v_epoch IS DISTINCT FROM v_smoke_epoch
     OR v_rel_id_state IS DISTINCT FROM v_release_id OR v_sha_state IS DISTINCT FROM v_target_sha THEN
    RAISE EXCEPTION 'CHECKPOINT_FAIL_FAIL: phase=% version=%(esperado %) binding=%/% (esperado preservado %/%)',
      v_phase, v_version, v_version_pre + 1, v_rel_id_state, v_sha_state, v_release_id, v_target_sha;
  END IF;

  SELECT count(*) INTO v_evt_count
  FROM public.app_maintenance_events
  WHERE event_type = 'MAINTENANCE_FAILED' AND maintenance_epoch = v_epoch;
  IF v_evt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECKPOINT_FAIL_FAIL: esperado exatamente 1 MAINTENANCE_FAILED no epoch % (=%)', v_epoch, v_evt_count;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    14, 'CHECKPOINT_FAIL', 'PASS',
    format('phase=FAILED version %s->%s binding preservado, MAINTENANCE_FAILED emitido', v_version_pre, v_version)
  );
  RAISE NOTICE 'CHECKPOINT_FAIL=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- CHECKPOINT_RELEASE_RUNS_UNCHANGED — nenhuma RPC B16/pre-B16
  -- alterou a linha sintetica em todo o ciclo (part1 + part2 + part3),
  -- comparada contra o snapshot de composto gravado em bt16a5a_ctx
  -- antes do SAVEPOINT.
  -- ═══════════════════════════════════════════════════════════════
  SELECT * INTO v_rel_after FROM public.app_release_runs WHERE id = v_release_id;
  IF v_release_snapshot IS DISTINCT FROM v_rel_after THEN
    RAISE EXCEPTION 'CHECKPOINT_RELEASE_RUNS_UNCHANGED_FAIL: app_release_runs.% foi alterada por alguma RPC do ciclo', v_release_id;
  END IF;

  INSERT INTO bt16a5a_results VALUES (
    15, 'CHECKPOINT_RELEASE_RUNS_UNCHANGED', 'PASS',
    'linha sintetica de app_release_runs identica do insert ate o fim do ciclo (nenhuma RPC mutou)'
  );
  RAISE NOTICE 'CHECKPOINT_RELEASE_RUNS_UNCHANGED=PASS';

  -- ═══════════════════════════════════════════════════════════════
  -- RESUMO — fail-closed se qualquer checkpoint nao for PASS.
  --
  -- bt16a5a_results contem 14 checkpoints transacionais (1-10 de
  -- part1 + 12-15 de part3). O 15o checkpoint logico
  -- (CHECKPOINT_SUCCESS, do cenario A) NAO e exigido como row em
  -- bt16a5a_results — essa row seria removida pelo ROLLBACK TO
  -- SAVEPOINT por desenho (D2). A evidencia dele e
  -- bt16a5a_success_flag ter avancado (is_called=true) ANTES do
  -- rollback do savepoint.
  -- ═══════════════════════════════════════════════════════════════
  IF (SELECT count(*) FROM bt16a5a_results WHERE status IS DISTINCT FROM 'PASS') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'RESUMO_FAIL: existe checkpoint com status != PASS'
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT count(*) FROM bt16a5a_results) IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'RESUMO_FAIL: esperado exatamente 14 checkpoints persistidos em bt16a5a_results (o 15o, CHECKPOINT_SUCCESS, e comprovado pela TEMP sequence bt16a5a_success_flag e nao pode ser uma row transacional pos-savepoint), obtido %',
      (SELECT count(*) FROM bt16a5a_results)
      USING ERRCODE = 'TE000';
  END IF;

  SELECT is_called INTO v_success_flag_called FROM bt16a5a_success_flag;
  IF v_success_flag_called IS NOT TRUE THEN
    RAISE EXCEPTION 'RESUMO_FAIL: bt16a5a_success_flag nao foi avancada (is_called=%) — cenario A (SUCCESS) nao comprovado antes do ROLLBACK TO SAVEPOINT', v_success_flag_called
      USING ERRCODE = 'TE000';
  END IF;

  RAISE NOTICE 'CHECKPOINTS_PASS_IN_TX=15 (14 em bt16a5a_results + CHECKPOINT_SUCCESS via TEMP sequence)';
  RAISE NOTICE 'CHECKPOINTS_FAIL_IN_TX=0';
  RAISE NOTICE '=== 157_maintenance_smoke_recovery_orchestration.behavior PASS_IN_TX (rollback-only) ===';
END;
$part3$;

-- SELECT final — os 14 checkpoints persistidos em bt16a5a_results, mais
-- CHECKPOINT_SUCCESS sintetizado a partir de bt16a5a_success_flag (o
-- unico canal de evidencia do cenario A que sobrevive ao ROLLBACK TO
-- SAVEPOINT sp_smoke). RAISE NOTICE nao e usado como evidencia.
SELECT seq, checkpoint, status, detail
  FROM (
    SELECT seq, checkpoint, status, detail
      FROM bt16a5a_results
    UNION ALL
    SELECT
      11,
      'CHECKPOINT_SUCCESS',
      CASE WHEN is_called THEN 'PASS' ELSE 'FAIL' END,
      format(
        'evidencia via TEMP sequence bt16a5a_success_flag (is_called=%s, last_value=%s) — row transacional pos-savepoint omitida por desenho (D2)',
        is_called, last_value
      )
      FROM bt16a5a_success_flag
  ) final_checkpoints
 ORDER BY seq;

ROLLBACK;

-- =====================================================================
-- QUERIES READ-ONLY DE RECONCILIACAO (gate futuro, APOS a unica
-- execucao mutable aprovada — nunca antes).
--
-- Esperado apos o descarte da transacao de teste:
--   TEST_RELEASE_RESIDUE = 0
--   MAINTENANCE_STATE_PRESERVED = SIM (NORMAL/0/3/unbound, ou o
--     estado real vigente no momento — o teste nao deve deixar nada)
--   migration157/158 continuam live exatamente uma vez cada
--   RPCs B16 continuam 1/1/1/1
-- =====================================================================
--
-- SELECT phase, epoch, version, release_id, target_sha, fence_effective_at
--   FROM public.app_maintenance_state
--  WHERE scope = 'global';
-- -- esperado: NORMAL, 0, versao inalterada, NULL, NULL, NULL
--
-- SELECT count(*) AS test_release_residue
--   FROM public.app_release_runs
--  WHERE requested_by_email LIKE 'b16a5a.%@bt.local';
--
-- SELECT count(*) AS active_releases
--   FROM public.app_release_runs
--  WHERE status NOT IN ('SUCCEEDED','FAILED','CANCELED');
--
-- SELECT name FROM supabase_migrations.schema_migrations
--  WHERE name LIKE '157[_.]%' OR name LIKE '158[_.]%'
--  ORDER BY name;
--
-- SELECT p.proname, count(*)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN (
--      'app_maintenance_orchestration_smoke',
--      'app_maintenance_orchestration_success',
--      'app_maintenance_orchestration_recover',
--      'app_maintenance_orchestration_fail'
--    )
--  GROUP BY 1;
