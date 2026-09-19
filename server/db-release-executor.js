// ════════════════════════════════════════════════════════════
//  PDB-I2C2 — PIPELINE de execução de release DB (orquestração local).
//
//  Depois de um claim I2C1 válido, coordena — SOMENTE por portas injetadas —:
//    plano RUNNING → NOTICE → FENCING (login CLOSED + write fence com
//    cobertura) → DRAINING → QUIESCENT (provado) → BACKING_UP → backup L2
//    VERIFIED → READY_TO_MIGRATE → MIGRATING (uma migration por vez, retry=0)
//    → VERIFYING → SMOKE → NORMAL (login OPEN) → SUCCEEDED → lock liberado.
//
//  NÃO faz: transporte real de manutenção, backup, apply_migration, smoke,
//  restore, rede, DB live, cron, timer. Sem endpoint HTTP.
//
//  SEM FALLBACK LIVE: toda porta mutável é dependência explícita. Este módulo
//  não importa nenhum store/transport live (ver teste estático de fecho
//  transitivo). Porta ausente → falha fechada; porta DISABLED → nada é tocado.
//
//  Invariantes:
//   • ownership (lock + worker + geração + lease fresca) em TODO estágio;
//   • intenção de cada mutação é gravada ANTES de invocar; step RUNNING sem
//     resultado numa re-entrada = AMBÍGUO (nunca reinvoca);
//   • ambíguo/pós-commit → RECOVERY_REQUIRED, login CLOSED, fence ativo, lock
//     retido, sem retry, sem restore, sem takeover;
//   • login só reabre depois de NORMAL confirmado; o lock só é liberado depois
//     de execução+plano SUCCEEDED duráveis.
// ════════════════════════════════════════════════════════════

import {
  BACKUP_MODE,
  PRE_MIGRATION_BACKUP_MODE,
  containsSecretMaterial,
  isUuid,
  parseIsoMs,
  toIso,
  validateBackupBinding,
} from "./db-backup-contract.js";
import { buildIntegrityEvidence } from "./db-backup-verification.js";
import { evaluateBackupVerification } from "./db-backup.js";
import { readDbReleasePlan, isPlanTransitionPort } from "./db-release-plan-reader.js";
import { frozenPlanIdentity } from "./db-release-plan-hash.js";
import { isMaintenanceEventType, isDbHappyPathEdge } from "./db-release-contract.js";
import { isWriteFencePhase } from "./db-release-readiness.js";
import {
  buildEnvironmentLockKey,
  isTerminalExecutionStatus,
  validateWorkerId,
} from "./db-release-executor-contract.js";
import { classifyOwnership } from "./db-release-executor-lease.js";
import { isExecutionStore } from "./db-release-execution-store.js";
import {
  collectExecutionOwnershipEvidence,
  flagDbReleaseLeaseLoss,
  heartbeatDbReleaseExecution,
  releaseDbReleaseEnvironmentLock,
} from "./db-release-executor-claim.js";
import {
  computeOverallReadiness,
  deriveExecutionStageGates,
  evaluateStageReadiness,
} from "./db-release-stage-readiness.js";
import { evaluateWriteFenceCoverage } from "./db-release-write-fence-coverage.js";
import { isStepStore, evidenceIsPersistable } from "./db-release-step-store.js";
import {
  APPLY_RESULTS,
  DRAIN_POLL_HINT_MS,
  MIGRATION_ATTEMPTS_PER_STEP,
  PORT_DISABLED_CODES,
  PORT_METHODS,
  PORT_TRANSPORTS,
  SAFE_ABORT_FAILURE_CODES,
  STEP_ORDER,
  anyPortIsLive,
  classifyApplyOutcome,
  evaluateLivePipelineEligibility,
  isPipelineExecutionEdge,
  isPortShape,
  migrateStepOrder,
  resolveDrainTimeoutMs,
  resolveNoticeMinMs,
} from "./db-release-pipeline-contract.js";

export const EXECUTOR_PIPELINE_STAGES = Object.freeze([
  "PREFLIGHT",
  "NOTICE",
  "FENCE",
  "DRAIN",
  "QUIESCE",
  "BACKUP",
  "READY_TO_MIGRATE",
  "MIGRATE",
  "VERIFY",
  "SMOKE",
  "NORMALIZE",
]);

const REQUEST_KEYS = Object.freeze(["executionId", "leaseGeneration"]);
const PORT_NAMES = Object.freeze(Object.keys(PORT_METHODS));
const PROTECTIVE_PHASES_FAILABLE = Object.freeze(["FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING"]);

// ── Resultado ────────────────────────────────────────────────
function out(ctx, outcome, extra = {}) {
  const success = outcome === "SUCCEEDED" || outcome === "WAITING_DRAIN" || outcome === "WAITING_NOTICE";
  return {
    ok: extra.ok ?? success,
    outcome,
    executionId: ctx?.executionId ?? null,
    stage: ctx?.stage ?? null,
    autoRetryAllowed: false,
    autoRestoreAllowed: false,
    autoTakeoverAllowed: false,
    ...extra,
  };
}

function early(outcome, code, extra = {}) {
  return {
    ok: false,
    outcome,
    code,
    executionId: null,
    stage: null,
    autoRetryAllowed: false,
    autoRestoreAllowed: false,
    autoTakeoverAllowed: false,
    ...extra,
  };
}

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ── Dependências (sem fallback live) ─────────────────────────
function resolveDeps(deps) {
  const missing = [];
  if (!deps || typeof deps !== "object") return { failure: early("DEPENDENCY_MISSING", "PIPELINE_DEPENDENCIES_REQUIRED") };
  if (!isExecutionStore(deps.executionStore)) missing.push("executionStore");
  if (!isPlanTransitionPort(deps.planStore)) missing.push("planStore");
  if (!isStepStore(deps.stepStore)) missing.push("stepStore");
  if (typeof deps.collectEvidence !== "function") missing.push("collectEvidence");
  if (!deps.clock || typeof deps.clock.nowMs !== "function" || !Number.isFinite(deps.clock.nowMs())) missing.push("clock");
  if (!validateWorkerId(deps.worker?.id).ok) missing.push("worker");
  const ports = {};
  for (const name of PORT_NAMES) {
    const port = deps.ports?.[name];
    if (!isPortShape(name, port)) missing.push(`ports.${name}`);
    else if (!PORT_TRANSPORTS.includes(port.transport)) missing.push(`ports.${name}.transport`);
    else ports[name] = port;
  }
  if (missing.length > 0) return { failure: early("DEPENDENCY_MISSING", "PIPELINE_DEPENDENCY_MISSING", { missing }) };
  for (const name of PORT_NAMES) {
    if (ports[name].enabled !== true) {
      return {
        failure: early("PORT_DISABLED", ports[name].disabledCode || PORT_DISABLED_CODES[name], { port: name }),
      };
    }
  }
  return { ports };
}

async function guardLive(deps, ports) {
  if (!anyPortIsLive(ports)) return null;
  const coverageEvidence = await safe(() => ports.probes.readWriteFenceCoverage(), null);
  const eligibility = evaluateLivePipelineEligibility({
    ports,
    coverageEvidence,
    trustedDerivers: deps.trustedDerivers ?? {},
    nowMs: typeof deps.clock?.nowMs === "function" ? deps.clock.nowMs() : undefined,
  });
  return eligibility.eligible
    ? null
    : early("LIVE_PIPELINE_NOT_ELIGIBLE", "LIVE_PIPELINE_NOT_ELIGIBLE", { blockers: eligibility.blockers });
}

function buildContext(deps, ports, { executionId, leaseGeneration }) {
  const claimDeps = {
    executionStore: deps.executionStore,
    clock: deps.clock,
    worker: deps.worker,
    audit: deps.audit,
  };
  const ctx = {
    deps,
    ports,
    claimDeps,
    executionStore: deps.executionStore,
    planStore: deps.planStore,
    stepStore: deps.stepStore,
    clock: deps.clock,
    worker: deps.worker.id,
    audit: deps.audit,
    collectEvidence: deps.collectEvidence,
    policy: deps.policy ?? {},
    executionId,
    leaseGeneration,
    stage: "INIT",
    execution: null,
    plan: null,
    scheduled: false,
    projectRef: null,
    steps: new Map(),
    applyInvocations: 0,
    counters: { migrationsApplied: 0 },
  };
  ctx.heartbeat = async () => {
    const cp = await checkpoint(ctx);
    return { ok: !cp.halt };
  };
  return ctx;
}

const nowMs = (ctx) => ctx.clock.nowMs();
const iso = (ms) => toIso(ms);

// ── Auditoria (só tipos suportados; nunca duplica em re-entrada) ──
async function emit(ctx, eventType, metadata = {}) {
  if (!ctx.audit || typeof ctx.audit.append !== "function") return false;
  if (!isMaintenanceEventType(eventType)) return false;
  if (containsSecretMaterial(metadata)) return false;
  const execution = ctx.execution;
  return safe(async () => {
    await ctx.audit.append({
      eventType,
      planId: execution?.planId ?? ctx.plan?.id ?? null,
      executionId: ctx.executionId,
      correlationId: execution?.correlationId ?? null,
      metadata: { autoRetry: false, ...metadata },
    });
    return true;
  }, false);
}

// ── Steps ────────────────────────────────────────────────────
async function loadSteps(ctx) {
  const listed = await ctx.stepStore.listSteps(ctx.executionId);
  if (!listed?.ok) return false;
  ctx.steps = new Map(listed.steps.map((step) => [step.stepOrder, step]));
  return true;
}

const stepIs = (ctx, order, status) => ctx.steps.get(order)?.status === status;

async function beginStep(ctx, order, stepType, evidence) {
  if (!evidenceIsPersistable(evidence)) return { ok: false, code: "STEP_EVIDENCE_UNSAFE" };
  const begun = await ctx.stepStore.beginStep({
    executionId: ctx.executionId,
    stepOrder: order,
    stepType,
    startedAt: iso(nowMs(ctx)),
    evidence,
  });
  if (!begun?.ok) return { ok: false, code: begun?.code || "STEP_STORE_UNAVAILABLE" };
  ctx.steps.set(order, begun.step);
  return { ok: true, created: begun.created, step: begun.step };
}

async function finishStep(ctx, order, status, { evidence, errorCode = null, errorMessage = null } = {}) {
  const finished = await ctx.stepStore.finishStep({
    executionId: ctx.executionId,
    stepOrder: order,
    fromStatus: "RUNNING",
    status,
    completedAt: iso(nowMs(ctx)),
    evidence,
    errorCode,
    errorMessage,
  });
  if (!finished?.ok) return { ok: false, code: finished?.code || "STEP_STORE_UNAVAILABLE" };
  ctx.steps.set(order, finished.step);
  return { ok: true, step: finished.step };
}

/** begin + finish de um step instantâneo (idempotente: já SUCCEEDED → no-op). */
async function recordStepSucceeded(ctx, order, stepType, evidence) {
  if (stepIs(ctx, order, "SUCCEEDED")) return { ok: true, unchanged: true };
  const begun = await beginStep(ctx, order, stepType, evidence);
  if (!begun.ok) return begun;
  if (begun.step.status === "SUCCEEDED") return { ok: true, unchanged: true };
  return finishStep(ctx, order, "SUCCEEDED", { evidence });
}

// ── Execução / plano (CAS) ───────────────────────────────────
async function transitionExecution(ctx, to, patch = {}) {
  const read = await ctx.executionStore.getExecution(ctx.executionId);
  if (!read?.ok || !read.execution) return { ok: false, code: "STORE_UNAVAILABLE" };
  const execution = read.execution;
  if (execution.status === to) {
    ctx.execution = execution;
    return { ok: true, unchanged: true, execution };
  }
  if (!isPipelineExecutionEdge(execution.status, to)) {
    return { ok: false, code: "EXECUTION_EDGE_ILLEGAL", from: execution.status, to };
  }
  const moved = await ctx.executionStore.conditionalTransition({
    executionId: execution.id,
    fromStatus: execution.status,
    expectedHeartbeatAt: execution.heartbeatAt,
    patch: { status: to, ...patch },
  });
  if (!moved?.ok) return { ok: false, code: moved?.code || "TRANSITION_CONFLICT" };
  ctx.execution = moved.execution;
  return { ok: true, unchanged: false, execution: moved.execution };
}

async function transitionPlan(ctx, expectedFrom, to) {
  const planId = ctx.execution?.planId ?? ctx.plan?.id;
  const read = await ctx.planStore.getPlanRow(planId);
  if (!read?.ok) return { ok: false, code: "PLAN_STORE_UNAVAILABLE" };
  const row = read.row;
  if (row.status === to) return { ok: true, unchanged: true };
  if (!expectedFrom.includes(row.status)) return { ok: false, code: "PLAN_STATUS_CONFLICT", status: row.status };
  if (ctx.execution?.planHash && row.plan_hash !== ctx.execution.planHash) {
    return { ok: false, code: "PLAN_HASH_DRIFT" };
  }
  const moved = await ctx.planStore.transitionPlanRow({
    id: row.id,
    fromStatus: row.status,
    expectedUpdatedAt: row.updated_at,
    expectedPlanHash: row.plan_hash,
    patch: { status: to, updated_at: iso(nowMs(ctx)) },
  });
  if (!moved?.ok) return { ok: false, code: moved?.error || "PLAN_CONFLICT" };
  return { ok: true, unchanged: false };
}

// ── Ownership ────────────────────────────────────────────────
async function handleLeaseLoss(ctx, classification) {
  const flagged = await flagDbReleaseLeaseLoss({ executionId: ctx.executionId }, ctx.claimDeps);
  await transitionPlan(ctx, ["RUNNING"], "RECOVERY_REQUIRED");
  return out(ctx, "LEASE_LOST", {
    ok: false,
    code: classification.outcome === "AMBIGUOUS" ? "LEASE_LOST_AFTER_MUTATION" : "LEASE_LOST_PRE_MUTATION",
    reasonCode: classification.reasonCode,
    afterMutation: classification.outcome === "AMBIGUOUS",
    requiresReconciliation: true,
    flagged: flagged?.flagged === true || flagged?.alreadyFlagged === true,
  });
}

/**
 * Valida posse (lock + worker + geração + lease fresca) e, se `heartbeat`,
 * renova a lease pelo contrato I2C1. Nunca rouba, nunca ressuscita lease.
 */
async function checkpoint(ctx, { heartbeat = true } = {}) {
  const read = await ctx.executionStore.getExecution(ctx.executionId);
  if (!read?.ok) return { halt: out(ctx, "STORE_UNAVAILABLE", { ok: false, code: "STORE_UNAVAILABLE" }) };
  const execution = read.execution;
  if (!execution) return { halt: out(ctx, "EXECUTION_NOT_FOUND", { ok: false, code: "EXECUTION_NOT_FOUND" }) };
  ctx.execution = execution;
  ctx.projectRef = execution.projectRef;
  if (execution.status === "SUCCEEDED") return { finalize: true, execution };
  if (execution.status === "RECOVERY_REQUIRED") {
    return {
      halt: out(ctx, "RECOVERY_REQUIRED", {
        ok: false,
        code: execution.failureCode ?? "RECOVERY_REQUIRED",
        requiresReconciliation: true,
        resumeAllowed: false,
      }),
    };
  }
  if (isTerminalExecutionStatus(execution.status)) {
    return {
      halt: out(ctx, "ALREADY_TERMINAL", { ok: false, code: execution.failureCode ?? null, status: execution.status }),
    };
  }
  if (execution.workerId !== ctx.worker || execution.leaseGeneration !== ctx.leaseGeneration) {
    return { halt: out(ctx, "OWNERSHIP_MISMATCH", { ok: false, code: "WORKER_OR_GENERATION_MISMATCH" }) };
  }
  const key = buildEnvironmentLockKey({ environment: execution.environment, projectRef: execution.projectRef });
  if (!key.ok) return { halt: out(ctx, "OWNERSHIP_MISMATCH", { ok: false, code: key.code }) };
  const lockRead = await ctx.executionStore.readEnvironmentLock(key.lockKey);
  if (!lockRead?.ok) return { halt: out(ctx, "STORE_UNAVAILABLE", { ok: false, code: "STORE_UNAVAILABLE" }) };
  const classification = classifyOwnership({
    execution,
    lock: lockRead.lock,
    expected: { workerId: ctx.worker, leaseGeneration: ctx.leaseGeneration },
    nowMs: nowMs(ctx),
  });
  if (classification.outcome !== "OWNED") {
    if (classification.reasonCode.startsWith("LEASE_EXPIRED")) {
      return { halt: await handleLeaseLoss(ctx, classification) };
    }
    return {
      halt: out(ctx, classification.outcome === "LOCKED" ? "OWNERSHIP_MISMATCH" : "RECONCILIATION_REQUIRED", {
        ok: false,
        code: classification.reasonCode,
        requiresReconciliation: classification.requiresReconciliation,
      }),
    };
  }
  if (heartbeat) {
    const beat = await heartbeatDbReleaseExecution(
      { executionId: ctx.executionId, leaseGeneration: ctx.leaseGeneration },
      ctx.claimDeps,
    );
    if (!beat.ok) return { halt: out(ctx, "HEARTBEAT_CONFLICT", { ok: false, code: beat.code }) };
    const fresh = await ctx.executionStore.getExecution(ctx.executionId);
    if (fresh?.ok && fresh.execution) ctx.execution = fresh.execution;
  }
  return { execution: ctx.execution };
}

// ── Falhas protetoras ────────────────────────────────────────
async function releaseLock(ctx) {
  const released = await releaseDbReleaseEnvironmentLock(
    { executionId: ctx.executionId, leaseGeneration: ctx.leaseGeneration },
    ctx.claimDeps,
  );
  return released.ok === true;
}

/** Nenhuma mutação de manutenção ocorreu: cancela a execução e libera o lock. */
async function failBeforeMaintenance(ctx, code, extra = {}) {
  const canceled = await transitionExecution(ctx, "CANCELED", {
    completedAt: iso(nowMs(ctx)),
    failureCode: code,
    failureMessage: "Bloqueado antes de qualquer mutação de manutenção.",
  });
  let planFailed = false;
  if (canceled.ok) {
    const plan = await transitionPlan(ctx, ["RUNNING"], "FAILED");
    planFailed = plan.ok && !plan.unchanged;
  }
  const lockReleased = canceled.ok ? await releaseLock(ctx) : false;
  await emit(ctx, "DB_PREFLIGHT_BLOCKED", { code, ...(extra.blockers ? { blockers: extra.blockers.map((b) => b.key) } : {}) });
  return out(ctx, "BLOCKED_BEFORE_MAINTENANCE", {
    ok: false,
    code,
    lockReleased,
    planFailed,
    maintenanceMutated: false,
    ...extra,
  });
}

/**
 * Falha DETERMINÍSTICA sem mutação de schema: mantém login CLOSED e fence
 * ativo, execução/plano FAILED. Unwind só por abortDbReleaseExecution.
 */
async function failProtective(ctx, code, { reasonCode = null, markMaintenance = true, blockers = null } = {}) {
  // A fase é lida SEMPRE: decide se o unwind ainda é possível (nunca dentro de MIGRATING).
  const state = await safe(() => ctx.ports.maintenance.readState(), null);
  const phase = state?.ok ? state.phase : null;
  if (markMaintenance && state?.ok && PROTECTIVE_PHASES_FAILABLE.includes(state.phase)) {
    await safe(
      () => ctx.ports.maintenance.markFailed({ expectedVersion: state.version, reasonCode: code }),
      null,
    );
  }
  const failed = await transitionExecution(ctx, "FAILED", {
    completedAt: iso(nowMs(ctx)),
    failureCode: code,
    failureMessage: reasonCode ? `${code}:${reasonCode}`.slice(0, 200) : code,
  });
  await transitionPlan(ctx, ["RUNNING"], "FAILED");
  await emit(ctx, "DB_RELEASE_FAILED", { code, reasonCode });
  return out(ctx, "FAILED", {
    ok: false,
    code,
    reasonCode,
    executionFailed: failed.ok,
    loginGateReopened: false,
    lockReleased: false,
    unwindAvailable: SAFE_ABORT_FAILURE_CODES.includes(code) && phase !== null && phase !== "MIGRATING",
    ...(blockers ? { blockers } : {}),
  });
}

/** Ambíguo / pós-commit: RECOVERY_REQUIRED. Nada é reaberto, liberado ou repetido. */
async function haltRecovery(ctx, code, { reasonCode = null } = {}) {
  const moved = await transitionExecution(ctx, "RECOVERY_REQUIRED", {
    failureCode: code,
    failureMessage: reasonCode ? `${code}:${reasonCode}`.slice(0, 200) : code,
  });
  await transitionPlan(ctx, ["RUNNING"], "RECOVERY_REQUIRED");
  await emit(ctx, "DB_RECOVERY_REQUIRED", { code, reasonCode });
  return out(ctx, "RECOVERY_REQUIRED", {
    ok: false,
    code,
    reasonCode,
    requiresReconciliation: true,
    resumeAllowed: false,
    executionRecorded: moved.ok,
    loginGateReopened: false,
    lockReleased: false,
    migrationsApplied: ctx.counters.migrationsApplied,
  });
}

// ── Evidência / readiness por estágio ────────────────────────
function bindingMatches(state, plan) {
  const binding = state?.binding;
  return Boolean(binding)
    && binding.dbPlanId === plan.id
    && binding.targetSha === plan.targetReleaseSha
    && binding.planKind === "DB_MIGRATION"
    && (binding.releaseId ?? null) === null;
}

function isIdleState(state) {
  const binding = state?.binding ?? {};
  return state?.ok === true
    && state.phase === "NORMAL"
    && state.loginGate === "OPEN"
    && !binding.dbPlanId
    && !binding.releaseId
    && !binding.targetSha;
}

async function collectRuntime(ctx, { includeBackup = false, backupBinding = null } = {}) {
  const at = nowMs(ctx);
  const plan = ctx.plan;
  const intent = ctx.scheduled ? "SCHEDULED" : "IMMEDIATE";
  const base = await safe(
    () => ctx.collectEvidence({ plan, intent, nowMs: at, projectRef: ctx.projectRef, stage: ctx.stage }),
    null,
  );
  const staticOk = base && base.ok !== false && typeof base === "object";
  const stateRaw = await safe(() => ctx.ports.maintenance.readState(), { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE" });
  const coverageEvidence = await safe(() => ctx.ports.probes.readWriteFenceCoverage(), { ok: false, errorCode: "WRITE_FENCE_COVERAGE_UNAVAILABLE" });
  const coverage = evaluateWriteFenceCoverage(coverageEvidence, { nowMs: at });
  const sessionZero = await safe(() => ctx.ports.probes.readSessionZeroProof(), { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE" });
  const inFlightRaw = await safe(() => ctx.ports.probes.readInFlight(), { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE" });
  // Zero "autoritativo" exige registry completo E cobertura de escrita completa.
  const inFlight = inFlightRaw?.ok === true
    ? { ...inFlightRaw, coverageComplete: inFlightRaw.coverageComplete === true && coverage.registryComplete === true }
    : inFlightRaw;
  const execution = await collectExecutionOwnershipEvidence({
    executionId: ctx.executionId,
    leaseGeneration: ctx.leaseGeneration,
    planId: plan.id,
    environment: plan.environment,
    projectRef: ctx.projectRef,
  }, ctx.claimDeps);
  let backup = { absent: true };
  if (includeBackup && backupBinding) {
    backup = await safe(
      () => ctx.ports.backup.readEvidence({ binding: backupBinding, nowMs: at }),
      { ok: false, errorCode: "BACKUP_STORE_UNAVAILABLE", evaluatedAt: iso(at) },
    );
  }
  const maintenance = stateRaw?.ok === true
    ? { ...stateRaw, evaluatedAt: stateRaw.evaluatedAt ?? iso(at), writeFenceCoverage: coverageEvidence }
    : { ok: false, errorCode: stateRaw?.errorCode || "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt: iso(at) };
  const evidence = {
    ...(staticOk ? base.evidence : {}),
    maintenance,
    sessionZero,
    inFlight,
    execution,
    backup,
    backupBinding: includeBackup ? backupBinding : null,
  };
  const gates = deriveExecutionStageGates({
    plan,
    execution: ctx.execution,
    evidence,
    gateOverrides: staticOk ? base.gateOverrides : [],
    nowMs: at,
  });
  return { gates, state: stateRaw, coverage, coverageEvidence, nowMs: at };
}

async function evaluateStage(ctx, stage, { includeBackup = false, backupBinding = null, phases = null } = {}) {
  const collected = await collectRuntime(ctx, { includeBackup, backupBinding });
  const evaluation = evaluateStageReadiness({ stage, gates: collected.gates, scheduled: ctx.scheduled });
  const blockers = [...evaluation.blockers];
  if (phases) {
    const state = collected.state;
    if (!state?.ok || !phases.includes(state.phase)) {
      blockers.push({ key: "MAINTENANCE_PHASE", status: "BLOCKED", reasonCode: `PHASE_${state?.phase ?? "UNKNOWN"}` });
    } else if (!bindingMatches(state, ctx.plan)) {
      blockers.push({ key: "MAINTENANCE_BINDING", status: "BLOCKED", reasonCode: "MAINTENANCE_BINDING_MISMATCH" });
    } else if (state.loginGate !== "CLOSED") {
      blockers.push({ key: "LOGIN_GATE", status: "BLOCKED", reasonCode: "LOGIN_GATE_NOT_CLOSED" });
    }
  }
  return {
    ...collected,
    evaluation,
    blockers,
    satisfied: evaluation.satisfied && blockers.length === evaluation.blockers.length,
    globalReady: computeOverallReadiness(collected.gates).ready === true,
  };
}

const gateStatus = (gates, key) => gates.find((gate) => gate.key === key)?.status ?? "UNKNOWN";

async function readFreshState(ctx) {
  const state = await safe(() => ctx.ports.maintenance.readState(), { ok: false });
  return state?.ok === true ? state : null;
}

// ── Plano: leitura + integridade ─────────────────────────────
function validateMigrationSet(plan) {
  const list = plan.migrations;
  if (!Array.isArray(list) || list.length === 0) return "MIGRATION_SET_EMPTY";
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item.order !== index + 1) return "MIGRATION_ORDER_NOT_CONTIGUOUS";
    if (item.classification !== "SAFE_AUTO") return "MIGRATION_NOT_SAFE_AUTO";
    if (migrateStepOrder(item.order) == null) return "MIGRATION_ORDER_OUT_OF_RANGE";
  }
  return null;
}

function planDriftReason(plan, execution) {
  const frozen = frozenPlanIdentity({
    environment: plan.environment,
    targetReleaseSha: plan.targetReleaseSha,
    baseSha: plan.baseSha,
    migrations: plan.migrations,
  });
  if (!frozen.ok || frozen.planHash !== plan.planHash) return "PLAN_HASH_NOT_REPRODUCIBLE";
  if (plan.planHash !== execution.planHash) return "PLAN_HASH_DRIFT";
  if (plan.targetReleaseSha !== execution.targetReleaseSha) return "TARGET_SHA_DRIFT";
  if (plan.baseSha !== execution.baseSha) return "BASE_SHA_DRIFT";
  if (plan.environment !== execution.environment) return "ENVIRONMENT_DRIFT";
  if (!plan.approvedAt || !plan.approvedBy) return "APPROVAL_MISSING";
  return validateMigrationSet(plan);
}

async function ensurePlan(ctx) {
  const loaded = await readDbReleasePlan(ctx.execution.planId, { store: ctx.planStore });
  if (!loaded.ok) return { halt: out(ctx, "PLAN_UNAVAILABLE", { ok: false, code: loaded.error }) };
  ctx.plan = loaded.plan;
  ctx.scheduled = Boolean(loaded.plan.scheduledAt);
  return {};
}

// ═════════════ ESTÁGIOS ═════════════════════════════════════
async function stagePreflight(ctx) {
  ctx.stage = "PREFLIGHT";
  if (stepIs(ctx, STEP_ORDER.PREFLIGHT, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;
  const planned = await ensurePlan(ctx);
  if (planned.halt) return planned.halt;
  const { plan, execution } = ctx;

  if (!["APPROVED", "SCHEDULED", "RUNNING"].includes(plan.status)) {
    return failBeforeMaintenance(ctx, "PLAN_STATUS_INVALID", { reasonCode: `PLAN_STATUS_${plan.status}` });
  }
  const drift = planDriftReason(plan, execution);
  if (drift) return failBeforeMaintenance(ctx, "PLAN_DRIFT", { reasonCode: drift });

  const stage = await evaluateStage(ctx, "READY_TO_QUIESCE");
  if (!stage.satisfied) {
    return failBeforeMaintenance(ctx, "READY_TO_QUIESCE_NOT_SATISFIED", { blockers: stage.blockers });
  }
  if (!isIdleState(stage.state)) {
    return failBeforeMaintenance(ctx, "MAINTENANCE_NOT_IDLE", { reasonCode: stage.state?.phase ?? "STATE_UNKNOWN" });
  }
  // Cobertura ANTES de causar indisponibilidade: não vale fechar o login para falhar depois.
  if (!stage.coverage.complete) {
    return failBeforeMaintenance(ctx, "WRITE_FENCE_COVERAGE_INCOMPLETE", { reasonCode: stage.coverage.reasonCode });
  }

  // Binding plano ↔ execução ANTES de qualquer transição: só esta execução pode estar ativa
  // para o plano (a persistência real ainda não impõe unicidade — lacuna reportada para I2D).
  const others = await ctx.executionStore.listExecutionsForPlan(plan.id);
  const rivals = others?.ok ? others.executions.filter((item) => item.status !== "CANCELED" && item.id !== ctx.executionId) : null;
  if (!rivals || rivals.length > 0) {
    return failBeforeMaintenance(ctx, "PLAN_EXECUTION_BINDING_CONFLICT", { reasonCode: rivals ? "RIVAL_EXECUTION" : "STORE_UNAVAILABLE" });
  }
  const prepared = await transitionExecution(ctx, "PREPARING", { startedAt: iso(nowMs(ctx)) });
  if (!prepared.ok) return out(ctx, "EXECUTION_TRANSITION_FAILED", { ok: false, code: prepared.code });
  const running = await transitionPlan(ctx, ["APPROVED", "SCHEDULED", "RUNNING"], "RUNNING");
  if (!running.ok) return failBeforeMaintenance(ctx, "PLAN_TRANSITION_CONFLICT", { reasonCode: running.code });
  const recorded = await recordStepSucceeded(ctx, STEP_ORDER.PREFLIGHT, "PREFLIGHT", {
    stage: "READY_TO_QUIESCE",
    satisfied: true,
    scheduled: ctx.scheduled,
    planHash: plan.planHash,
    readinessGeneration: plan.readinessGeneration,
    approvedAt: plan.approvedAt,
    migrationCount: plan.migrations.length,
    planTransition: running.unchanged ? "ALREADY_RUNNING" : "RUNNING",
  });
  if (!recorded.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: recorded.code });
  if (running.unchanged !== true) await emit(ctx, "DB_PREFLIGHT_PASSED", { stage: "READY_TO_QUIESCE" });
  return null;
}

async function stageNotice(ctx) {
  ctx.stage = "NOTICE";
  if (stepIs(ctx, STEP_ORDER.FENCE, "SUCCEEDED") || stepIs(ctx, STEP_ORDER.LOGIN_GATE_CLOSE, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;
  const planned = await ensurePlan(ctx);
  if (planned.halt) return planned.halt;

  // Primeira mutação de manutenção: a execução passa a ser "potencialmente mutante".
  const draining = await transitionExecution(ctx, "DRAINING");
  if (!draining.ok) return out(ctx, "EXECUTION_TRANSITION_FAILED", { ok: false, code: draining.code });

  let state = await readFreshState(ctx);
  if (!state) return out(ctx, "MAINTENANCE_UNAVAILABLE", { ok: false, code: "MAINTENANCE_STATE_UNAVAILABLE" });
  if (state.phase === "NORMAL" && !bindingMatches(state, ctx.plan)) {
    if (!isIdleState(state)) return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "NORMAL_BUT_BOUND_OR_GATE_CLOSED" });
    const started = await safe(() => ctx.ports.maintenance.startNotice({
      expectedVersion: state.version,
      binding: { dbPlanId: ctx.plan.id, targetSha: ctx.plan.targetReleaseSha, planKind: "DB_MIGRATION" },
      executionId: ctx.executionId,
      correlationId: ctx.execution.correlationId,
    }), { ok: false, code: "MAINTENANCE_TRANSPORT_ERROR" });
    if (!started?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: started?.code ?? "NOTICE_START_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.phase !== "NOTICE" || !bindingMatches(state, ctx.plan)) {
      return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "NOTICE_NOT_CONFIRMED" });
    }
  } else if (!bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: `PHASE_${state.phase}` });
  }

  if (state.phase === "NOTICE") {
    const minMs = resolveNoticeMinMs(ctx.policy);
    const startedMs = parseIsoMs(state.noticeStartedAt);
    if (minMs > 0) {
      const elapsed = startedMs == null ? 0 : nowMs(ctx) - startedMs;
      if (elapsed < minMs) {
        return out(ctx, "WAITING_NOTICE", { retryAfterMs: minMs - elapsed, noticeMinMs: minMs });
      }
    }
  }
  return null;
}

async function stageFence(ctx) {
  ctx.stage = "FENCE";
  if (stepIs(ctx, STEP_ORDER.FENCE, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  let state = await readFreshState(ctx);
  if (!state || !bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "FENCE_STAGE_BINDING" });
  }
  if (state.phase === "NOTICE") {
    if (!isDbHappyPathEdge("NOTICE", "FENCING")) return haltRecovery(ctx, "MAINTENANCE_EDGE_ILLEGAL");
    const fenced = await safe(() => ctx.ports.maintenance.fence({ expectedVersion: state.version }), { ok: false });
    if (!fenced?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: fenced?.code ?? "FENCE_FAILED" });
    state = await readFreshState(ctx);
    if (!state) return out(ctx, "MAINTENANCE_UNAVAILABLE", { ok: false, code: "MAINTENANCE_STATE_UNAVAILABLE" });
  }
  if (!isWriteFencePhase(state.phase)) {
    return failProtective(ctx, "WRITE_FENCE_NOT_VERIFIED", { reasonCode: `PHASE_${state.phase}` });
  }

  // 1) login gate: OPEN → CLOSED (e continua CLOSED até NORMAL confirmado).
  let closedNow = false;
  if (state.loginGate !== "CLOSED") {
    const closed = await safe(() => ctx.ports.maintenance.closeLoginGate({ expectedVersion: state.version }), { ok: false });
    if (!closed?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: closed?.code ?? "LOGIN_GATE_CLOSE_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.loginGate !== "CLOSED") {
      return failProtective(ctx, "LOGIN_GATE_CLOSE_FAILED", { reasonCode: "LOGIN_GATE_NOT_CONFIRMED_CLOSED" });
    }
    closedNow = true;
  }
  const gateStep = await recordStepSucceeded(ctx, STEP_ORDER.LOGIN_GATE_CLOSE, "LOGIN_GATE_CLOSE", {
    maintenanceEpoch: state.epoch,
    maintenanceVersion: state.version,
    phase: state.phase,
  });
  if (!gateStep.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: gateStep.code });
  if (closedNow) await emit(ctx, "LOGIN_GATE_CLOSED", { epoch: state.epoch, version: state.version });

  // 2) write fence: precisa de EVIDÊNCIA (gate VERIFIED), não de um booleano pedido.
  const evaluation = await collectRuntime(ctx);
  const fenceStatus = gateStatus(evaluation.gates, "WRITE_FENCE_ACTIVE");
  if (fenceStatus !== "VERIFIED") {
    const gate = evaluation.gates.find((item) => item.key === "WRITE_FENCE_ACTIVE");
    const covered = evaluation.coverage.complete;
    return failProtective(
      ctx,
      covered ? "WRITE_FENCE_NOT_VERIFIED" : "WRITE_FENCE_COVERAGE_INCOMPLETE",
      { reasonCode: gate?.reasonCode ?? evaluation.coverage.reasonCode },
    );
  }
  const fenceStep = await recordStepSucceeded(ctx, STEP_ORDER.FENCE, "FENCE", {
    fenceEffectiveAt: state.fenceEffectiveAt,
    maintenanceEpoch: state.epoch,
    maintenanceVersion: state.version,
    coverage: { source: evaluation.coverage.source, covered: evaluation.coverage.covered, required: evaluation.coverage.required },
  });
  if (!fenceStep.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: fenceStep.code });
  return null;
}

async function stageDrain(ctx) {
  ctx.stage = "DRAIN";
  if (stepIs(ctx, STEP_ORDER.DRAIN, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  let state = await readFreshState(ctx);
  if (!state || !bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "DRAIN_STAGE_BINDING" });
  }
  const timeoutMs = resolveDrainTimeoutMs(ctx.policy);
  let drainStep = ctx.steps.get(STEP_ORDER.DRAIN);
  if (state.phase === "FENCING") {
    // login CLOSED + fence verificado (FENCE step) são pré-condições de DRAINING.
    if (state.loginGate !== "CLOSED") return failProtective(ctx, "LOGIN_GATE_CLOSE_FAILED", { reasonCode: "GATE_OPEN_AT_DRAIN" });
    const started = await safe(() => ctx.ports.maintenance.startDrain({ expectedVersion: state.version }), { ok: false });
    if (!started?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: started?.code ?? "DRAIN_START_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.phase !== "DRAINING") {
      return failProtective(ctx, "WRITE_FENCE_NOT_VERIFIED", { reasonCode: "DRAIN_NOT_ENTERED" });
    }
    await emit(ctx, "SESSION_DRAIN_STARTED", { timeoutMs, epoch: state.epoch, version: state.version });
  }
  if (!drainStep) {
    const begun = await beginStep(ctx, STEP_ORDER.DRAIN, "DRAIN", { timeoutMs });
    if (!begun.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: begun.code });
    drainStep = begun.step;
  }
  if (state.phase === "DRAINING" || state.phase === "QUIESCENT") {
    const stage = await evaluateStage(ctx, "READY_TO_BACKUP", { phases: ["DRAINING", "QUIESCENT"] });
    if (stage.satisfied) {
      const proof = stage.gates;
      const finished = await finishStep(ctx, STEP_ORDER.DRAIN, "SUCCEEDED", {
        evidence: {
          proofAt: iso(stage.nowMs),
          maintenanceEpoch: stage.state.epoch,
          maintenanceVersion: stage.state.version,
          sessionsZero: gateStatus(proof, "ACTIVE_SESSION_COUNT_ZERO") === "VERIFIED",
          inFlightZero: gateStatus(proof, "IN_FLIGHT_OPERATION_COUNT_ZERO") === "VERIFIED",
          writeFenceCoverage: stage.coverage.complete,
        },
      });
      if (!finished.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: finished.code });
      await emit(ctx, "SESSION_DRAIN_COMPLETED", { epoch: stage.state.epoch, version: stage.state.version });
      return null;
    }
    const startedMs = parseIsoMs(state.drainStartedAt) ?? parseIsoMs(drainStep.startedAt) ?? nowMs(ctx);
    const elapsed = nowMs(ctx) - startedMs;
    if (elapsed >= timeoutMs) {
      await finishStep(ctx, STEP_ORDER.DRAIN, "FAILED", {
        errorCode: "DRAIN_TIMEOUT",
        errorMessage: "Drain excedeu o timeout; nunca segue para backup.",
        evidence: { elapsedMs: elapsed, timeoutMs },
      });
      return failProtective(ctx, "DRAIN_TIMEOUT", { reasonCode: "DRAIN_TIMEOUT_EXCEEDED", blockers: stage.blockers });
    }
    return out(ctx, "WAITING_DRAIN", {
      retryAfterMs: DRAIN_POLL_HINT_MS,
      deadlineAt: iso(startedMs + timeoutMs),
      blockers: stage.blockers.map((item) => ({ key: item.key, status: item.status, reasonCode: item.reasonCode })),
    });
  }
  return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: `DRAIN_PHASE_${state.phase}` });
}

async function stageQuiesce(ctx) {
  ctx.stage = "QUIESCE";
  if (stepIs(ctx, STEP_ORDER.QUIESCE, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  let state = await readFreshState(ctx);
  if (!state || !bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "QUIESCE_STAGE_BINDING" });
  }
  if (state.phase === "DRAINING") {
    // Só entra em QUIESCENT com READY_TO_BACKUP satisfeito AGORA.
    const stage = await evaluateStage(ctx, "READY_TO_BACKUP", { phases: ["DRAINING"] });
    if (!stage.satisfied) return failProtective(ctx, "READY_TO_BACKUP_LOST", { blockers: stage.blockers });
    const quiesced = await safe(() => ctx.ports.maintenance.quiesce({ expectedVersion: state.version }), { ok: false });
    if (!quiesced?.ok) return failProtective(ctx, "QUIESCENCE_NOT_PROVEN", { reasonCode: quiesced?.code ?? "QUIESCE_REJECTED" });
    state = await readFreshState(ctx);
  }
  const anchorMs = parseIsoMs(state?.quiescentAt);
  const drainMs = parseIsoMs(state?.drainStartedAt);
  const proven = state
    && state.phase === "QUIESCENT"
    && bindingMatches(state, ctx.plan)
    && state.loginGate === "CLOSED"
    && isWriteFencePhase(state.phase)
    && anchorMs != null
    && (drainMs == null || anchorMs >= drainMs);
  if (!proven) return failProtective(ctx, "QUIESCENCE_NOT_PROVEN", { reasonCode: `PHASE_${state?.phase ?? "UNKNOWN"}` });
  const recorded = await recordStepSucceeded(ctx, STEP_ORDER.QUIESCE, "QUIESCE", {
    quiescenceAt: iso(anchorMs),
    maintenanceEpoch: state.epoch,
    maintenanceVersion: state.version,
    executionId: ctx.executionId,
    correlationId: ctx.execution.correlationId,
    planId: ctx.plan.id,
  });
  if (!recorded.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: recorded.code });
  await emit(ctx, "QUIESCENCE_REACHED", { quiescenceAt: iso(anchorMs), epoch: state.epoch, version: state.version });
  return null;
}

function backupBindingFor(ctx) {
  const quiesce = ctx.steps.get(STEP_ORDER.QUIESCE);
  const quiescenceAt = quiesce?.evidence?.quiescenceAt ?? null;
  const binding = {
    planId: ctx.plan.id,
    executionId: ctx.executionId,
    correlationId: ctx.execution.correlationId,
    targetReleaseSha: ctx.plan.targetReleaseSha,
    environment: ctx.plan.environment,
    projectRef: ctx.projectRef,
    quiescenceAt,
  };
  return binding;
}

async function stageBackup(ctx) {
  ctx.stage = "BACKUP";
  if (stepIs(ctx, STEP_ORDER.BACKUP_VERIFY, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  const binding = backupBindingFor(ctx);
  const valid = validateBackupBinding(binding);
  if (!valid.ok) return failProtective(ctx, "BACKUP_CORRELATION_MISMATCH", { reasonCode: valid.reason });

  let state = await readFreshState(ctx);
  if (!state || !bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "BACKUP_STAGE_BINDING" });
  }
  if (state.phase === "QUIESCENT") {
    // Backup NUNCA antes de QUIESCENT provado; READY_TO_BACKUP reavaliado com a geração nova.
    const stage = await evaluateStage(ctx, "READY_TO_BACKUP", { phases: ["QUIESCENT"] });
    if (!stage.satisfied) return failProtective(ctx, "READY_TO_BACKUP_LOST", { blockers: stage.blockers });
    const moved = await transitionExecution(ctx, "BACKING_UP");
    if (!moved.ok) return out(ctx, "EXECUTION_TRANSITION_FAILED", { ok: false, code: moved.code });
    const started = await safe(() => ctx.ports.maintenance.startBackup({ expectedVersion: state.version }), { ok: false });
    if (!started?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: started?.code ?? "BACKUP_PHASE_FAILED" });
    state = await readFreshState(ctx);
  }
  if (!state || state.phase !== "BACKING_UP") {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: `BACKUP_PHASE_${state?.phase ?? "UNKNOWN"}` });
  }

  let backupStep = ctx.steps.get(STEP_ORDER.BACKUP);
  if (backupStep?.status === "RUNNING") {
    // Intenção gravada sem resultado: não sabemos se o backup foi criado. Nunca reinvoca.
    return haltRecovery(ctx, "BACKUP_OUTCOME_AMBIGUOUS", { reasonCode: "BACKUP_INTENT_WITHOUT_RESULT" });
  }
  if (backupStep?.status === "FAILED") {
    return failProtective(ctx, backupStep.errorCode || "BACKUP_CREATE_FAILED", { reasonCode: "BACKUP_STEP_ALREADY_FAILED" });
  }
  if (!backupStep) {
    const begun = await beginStep(ctx, STEP_ORDER.BACKUP, "BACKUP", {
      mode: PRE_MIGRATION_BACKUP_MODE,
      attempt: 1,
      binding,
    });
    if (!begun.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: begun.code });
    await emit(ctx, "BACKUP_REQUESTED", { mode: PRE_MIGRATION_BACKUP_MODE });
    const still = await checkpoint(ctx);
    if (still.halt) return still.halt;

    let created = null;
    let thrown = null;
    try {
      created = await ctx.ports.backup.createBackup({ binding, mode: PRE_MIGRATION_BACKUP_MODE, heartbeat: ctx.heartbeat });
    } catch (error) {
      thrown = error;
    }
    const outcome = thrown ? "AMBIGUOUS" : created?.outcome;
    if (outcome === "CREATED" && created?.mode === PRE_MIGRATION_BACKUP_MODE && created?.manifest
      && evidenceIsPersistable({ manifest: created.manifest })) {
      const done = await finishStep(ctx, STEP_ORDER.BACKUP, "SUCCEEDED", { evidence: { outcome: "CREATED", manifest: created.manifest } });
      if (!done.ok) return haltRecovery(ctx, "BACKUP_OUTCOME_AMBIGUOUS", { reasonCode: "BACKUP_RESULT_NOT_PERSISTED" });
      await emit(ctx, "BACKUP_COMPLETED", { mode: PRE_MIGRATION_BACKUP_MODE });
      backupStep = done.step;
    } else if (outcome === "CREATED" && created?.mode !== PRE_MIGRATION_BACKUP_MODE) {
      // PITR L1 / managed daily NUNCA satisfazem o backup pré-migration.
      await finishStep(ctx, STEP_ORDER.BACKUP, "FAILED", {
        errorCode: "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION",
        evidence: { outcome: "INSUFFICIENT_MODE", mode: created?.mode ?? null },
      });
      await emit(ctx, "BACKUP_FAILED", { code: "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION", mode: created?.mode ?? null });
      return failProtective(ctx, "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION", { reasonCode: String(created?.mode ?? "MODE_UNKNOWN") });
    } else if (outcome === "FAILED") {
      await finishStep(ctx, STEP_ORDER.BACKUP, "FAILED", {
        errorCode: "BACKUP_CREATE_FAILED",
        evidence: { outcome: "FAILED", reasonCode: created?.failureCode ?? null },
      });
      await emit(ctx, "BACKUP_FAILED", { code: "BACKUP_CREATE_FAILED" });
      return failProtective(ctx, "BACKUP_CREATE_FAILED", { reasonCode: created?.failureCode ?? null });
    } else {
      // AMBIGUOUS, exceção, ou retorno irreconhecível: STOP_AND_RECONCILE.
      await finishStep(ctx, STEP_ORDER.BACKUP, "FAILED", {
        errorCode: "BACKUP_OUTCOME_AMBIGUOUS",
        evidence: { outcome: "AMBIGUOUS" },
      });
      await emit(ctx, "BACKUP_FAILED", { code: "BACKUP_OUTCOME_AMBIGUOUS" });
      return haltRecovery(ctx, "BACKUP_OUTCOME_AMBIGUOUS", { reasonCode: thrown ? "BACKUP_THREW" : "BACKUP_RESULT_AMBIGUOUS" });
    }
  }

  // ── Verificação L2 contra o binding CONFIÁVEL (não o do manifest) ──
  const manifest = backupStep.evidence?.manifest;
  const verifying = await beginStep(ctx, STEP_ORDER.BACKUP_VERIFY, "BACKUP_VERIFY", { level: "L2", binding });
  if (!verifying.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: verifying.code });
  await emit(ctx, "BACKUP_VERIFYING", { level: "L2" });
  const observations = await safe(() => ctx.ports.backup.observeArtifacts({ binding, manifest }), null);
  const evaluated = observations
    ? evaluateBackupVerification({
      mode: BACKUP_MODE.LOGICAL_SNAPSHOT,
      binding,
      manifest,
      observations,
      nowMs: nowMs(ctx),
    })
    : { ok: false, failureCode: "BACKUP_VERIFY_FAILED", reason: "OBSERVATIONS_UNAVAILABLE" };
  const verified = evaluated.ok === true && evaluated.verification?.verified === true
    && evaluated.verification.level === "L2" && evaluated.verification.mode === PRE_MIGRATION_BACKUP_MODE;
  if (!verified) {
    const code = evaluated.verification?.failureCode ?? evaluated.failureCode ?? "BACKUP_VERIFY_FAILED";
    await finishStep(ctx, STEP_ORDER.BACKUP_VERIFY, "FAILED", { errorCode: code, evidence: { level: "L2", verified: false } });
    await emit(ctx, "BACKUP_FAILED", { code });
    return failProtective(ctx, SAFE_ABORT_FAILURE_CODES.includes(code) ? code : "BACKUP_VERIFY_FAILED", {
      reasonCode: evaluated.verification?.reason ?? evaluated.reason ?? code,
    });
  }
  const built = buildIntegrityEvidence({ verification: evaluated.verification, manifest, binding, nowMs: nowMs(ctx) });
  const recordedRun = built.ok
    ? await safe(() => ctx.ports.backup.recordVerification({ binding, verification: evaluated.verification, evidence: built.evidence }), { ok: false })
    : { ok: false };
  if (!recordedRun?.ok) {
    await finishStep(ctx, STEP_ORDER.BACKUP_VERIFY, "FAILED", { errorCode: "BACKUP_VERIFY_FAILED", evidence: { recorded: false } });
    return failProtective(ctx, "BACKUP_VERIFY_FAILED", { reasonCode: "VERIFICATION_NOT_RECORDED" });
  }
  const finished = await finishStep(ctx, STEP_ORDER.BACKUP_VERIFY, "SUCCEEDED", {
    evidence: { level: "L2", verified: true, manifestDigest: evaluated.verification.manifestDigest },
  });
  if (!finished.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: finished.code });
  await emit(ctx, "BACKUP_VERIFIED", { level: "L2", manifestDigest: evaluated.verification.manifestDigest });
  return null;
}

/** Revalidação no instante T: qualquer drift → NENHUM apply. */
async function revalidateAtTimeT(ctx) {
  const reloaded = await readDbReleasePlan(ctx.execution.planId, { store: ctx.planStore });
  if (!reloaded.ok) return { ok: false, reasonCode: "PLAN_UNAVAILABLE" };
  const plan = reloaded.plan;
  if (plan.status !== "RUNNING") return { ok: false, reasonCode: `PLAN_STATUS_${plan.status}` };
  const drift = planDriftReason(plan, ctx.execution);
  if (drift) return { ok: false, reasonCode: drift };
  const preflight = ctx.steps.get(STEP_ORDER.PREFLIGHT)?.evidence;
  if (!preflight || preflight.planHash !== plan.planHash
    || preflight.readinessGeneration !== plan.readinessGeneration
    || parseIsoMs(preflight.approvedAt) !== parseIsoMs(plan.approvedAt)
    || preflight.migrationCount !== plan.migrations.length) {
    return { ok: false, reasonCode: "APPROVAL_OR_PLAN_CHANGED_SINCE_PREFLIGHT" };
  }
  ctx.plan = plan;
  for (const item of plan.migrations) {
    const described = await safe(() => ctx.ports.migration.describeMigration({ order: item.order, filename: item.filename }), null);
    const same = described?.ok === true
      && described.filename === item.filename
      && (described.gitBlob ?? null) === (item.gitBlob ?? null)
      && described.sha256 === item.sha256
      && Number(described.bytes) === Number(item.bytes);
    if (!same) return { ok: false, reasonCode: `MIGRATION_IDENTITY_DRIFT_${item.order}` };
  }
  return { ok: true };
}

async function stageMigrationBoundary(ctx) {
  ctx.stage = "READY_TO_MIGRATE";
  const stateNow = await readFreshState(ctx);
  if (!stateNow) return out(ctx, "MAINTENANCE_UNAVAILABLE", { ok: false, code: "MAINTENANCE_STATE_UNAVAILABLE" });
  // Fronteira só age em BACKING_UP; MIGRATING/SMOKE/NORMAL = já ultrapassada (re-entrada).
  if (stateNow.phase !== "BACKING_UP") return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  const binding = backupBindingFor(ctx);
  const stage = await evaluateStage(ctx, "READY_TO_MIGRATE", {
    includeBackup: true,
    backupBinding: binding,
    phases: ["BACKING_UP"],
  });
  if (!stage.satisfied || !stage.globalReady) {
    return failProtective(ctx, "READY_TO_MIGRATE_NOT_SATISFIED", { blockers: stage.blockers });
  }
  const revalidated = await revalidateAtTimeT(ctx);
  if (!revalidated.ok) return failProtective(ctx, "T_TIME_REVALIDATION_FAILED", { reasonCode: revalidated.reasonCode });
  const state = await readFreshState(ctx);
  if (!state || state.phase !== "BACKING_UP" || !bindingMatches(state, ctx.plan)) {
    return failProtective(ctx, "T_TIME_REVALIDATION_FAILED", { reasonCode: "MAINTENANCE_CHANGED_AT_T" });
  }
  const moved = await transitionExecution(ctx, "MIGRATING");
  if (!moved.ok) return out(ctx, "EXECUTION_TRANSITION_FAILED", { ok: false, code: moved.code });
  const started = await safe(() => ctx.ports.maintenance.startMigrating({ expectedVersion: state.version }), { ok: false });
  if (!started?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: started?.code ?? "MIGRATING_PHASE_FAILED" });
  return null;
}

async function stageMigrate(ctx) {
  ctx.stage = "MIGRATE";
  const migrations = ctx.plan.migrations;
  if (migrations.every((item) => stepIs(ctx, migrateStepOrder(item.order), "SUCCEEDED"))) {
    ctx.counters.migrationsApplied = migrations.length;
    return null;
  }
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  let committed = 0;
  for (const item of migrations) {
    const order = migrateStepOrder(item.order);
    const existing = ctx.steps.get(order);
    if (existing?.status === "SUCCEEDED") {
      committed += 1;
      continue;
    }
    if (existing?.status === "RUNNING") {
      // Intenção sem resultado: ninguém sabe se houve commit. Nunca reinvoca.
      return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "MIGRATION_INTENT_WITHOUT_RESULT" });
    }
    if (existing) return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "MIGRATION_STEP_STATE_INCONSISTENT" });

    // Uma por vez: revalida posse, manutenção protetora e identidade IMEDIATAMENTE antes.
    const guard = await checkpoint(ctx);
    if (guard.halt) return guard.halt;
    const state = await readFreshState(ctx);
    const coverage = evaluateWriteFenceCoverage(await safe(() => ctx.ports.probes.readWriteFenceCoverage(), null), { nowMs: nowMs(ctx) });
    if (!state || state.phase !== "MIGRATING" || !bindingMatches(state, ctx.plan)
      || state.loginGate !== "CLOSED" || !coverage.complete) {
      return committed === 0
        ? failProtective(ctx, "T_TIME_REVALIDATION_FAILED", { reasonCode: "PROTECTION_LOST_BEFORE_APPLY", markMaintenance: false })
        : haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "PROTECTION_LOST_MID_SET" });
    }
    const described = await safe(() => ctx.ports.migration.describeMigration({ order: item.order, filename: item.filename }), null);
    const identical = described?.ok === true
      && described.filename === item.filename
      && (described.gitBlob ?? null) === (item.gitBlob ?? null)
      && described.sha256 === item.sha256
      && Number(described.bytes) === Number(item.bytes);
    if (!identical) {
      return committed === 0
        ? failProtective(ctx, "T_TIME_REVALIDATION_FAILED", { reasonCode: `MIGRATION_IDENTITY_DRIFT_${item.order}`, markMaintenance: false })
        : haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: `MIGRATION_IDENTITY_DRIFT_${item.order}` });
    }

    // INTENÇÃO durável ANTES de invocar (retry=0: exatamente uma tentativa).
    const identity = {
      order: item.order,
      filename: item.filename,
      gitBlob: item.gitBlob ?? null,
      sha256: item.sha256,
      bytes: item.bytes,
      targetReleaseSha: ctx.plan.targetReleaseSha,
      planHash: ctx.plan.planHash,
      classification: item.classification,
    };
    const begun = await beginStep(ctx, order, "MIGRATE", { attempt: MIGRATION_ATTEMPTS_PER_STEP, identity });
    if (!begun.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: begun.code });
    if (!begun.created) return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "MIGRATION_STEP_ALREADY_BEGUN" });
    await emit(ctx, "DB_MIGRATION_STARTED", { order: item.order, filename: item.filename });

    if (ctx.applyInvocations >= migrations.length || ctx.applyInvocations > committed) {
      return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "APPLY_INVOCATION_GUARD" });
    }
    ctx.applyInvocations += 1;
    let returned = null;
    let thrown = null;
    try {
      returned = await ctx.ports.migration.applyOneMigration({
        executionId: ctx.executionId,
        planId: ctx.plan.id,
        correlationId: ctx.execution.correlationId,
        environment: ctx.plan.environment,
        projectRef: ctx.projectRef,
        targetReleaseSha: ctx.plan.targetReleaseSha,
        planHash: ctx.plan.planHash,
        migration: { order: item.order, filename: item.filename, gitBlob: item.gitBlob ?? null, sha256: item.sha256, bytes: item.bytes },
        idempotencyKey: `${ctx.executionId}:${item.order}`,
        heartbeat: ctx.heartbeat,
      });
    } catch (error) {
      thrown = error;
    }
    const classified = classifyApplyOutcome(returned, thrown);

    if (classified.result === APPLY_RESULTS.SUCCESS_COMMITTED) {
      const done = await finishStep(ctx, order, "SUCCEEDED", {
        evidence: { commitState: "COMMITTED", result: classified.result },
      });
      if (!done.ok) return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "STEP_RESULT_NOT_PERSISTED" });
      committed += 1;
      ctx.counters.migrationsApplied = committed;
      await emit(ctx, "DB_MIGRATION_APPLIED", { order: item.order, filename: item.filename });
      // A lease pode ter expirado DURANTE o apply: o resultado é fato, mas não avançamos.
      const after = await checkpoint(ctx, { heartbeat: false });
      if (after.halt) return { ...after.halt, migrationsApplied: committed };
      continue;
    }
    if (classified.result === APPLY_RESULTS.FAILED_NOT_COMMITTED) {
      await finishStep(ctx, order, "FAILED", {
        errorCode: "MIGRATION_FAILED_NOT_COMMITTED",
        evidence: { commitState: "NOT_COMMITTED", result: classified.result, reasonCode: classified.reasonCode },
      });
      if (committed === 0) {
        // Banco intacto (nada commitado) — ainda assim NÃO desfaz manutenção sozinho.
        return failProtective(ctx, "MIGRATION_FAILED_NOT_COMMITTED", { reasonCode: classified.reasonCode, markMaintenance: false });
      }
      return haltRecovery(ctx, "MIGRATION_FAILED_NOT_COMMITTED", { reasonCode: "PARTIAL_SET_COMMITTED" });
    }
    await finishStep(ctx, order, "FAILED", {
      errorCode: "MIGRATION_OUTCOME_AMBIGUOUS",
      evidence: { commitState: "UNKNOWN", result: classified.result, reasonCode: classified.reasonCode },
    });
    return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: classified.reasonCode });
  }
  ctx.counters.migrationsApplied = committed;
  return null;
}

async function stageVerify(ctx) {
  ctx.stage = "VERIFY";
  if (stepIs(ctx, STEP_ORDER.SCHEMA_VALIDATE, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  const moved = await transitionExecution(ctx, "VERIFYING");
  if (!moved.ok) return out(ctx, "EXECUTION_TRANSITION_FAILED", { ok: false, code: moved.code });
  const existing = ctx.steps.get(STEP_ORDER.SCHEMA_VALIDATE);
  if (existing?.status === "RUNNING" || existing?.status === "FAILED") {
    return haltRecovery(ctx, "POST_MIGRATION_VERIFICATION_FAILED", { reasonCode: "VERIFY_STEP_NOT_SUCCEEDED" });
  }
  const begun = await beginStep(ctx, STEP_ORDER.SCHEMA_VALIDATE, "SCHEMA_VALIDATE", { migrationCount: ctx.plan.migrations.length });
  if (!begun.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: begun.code });

  // Checagens do PRÓPRIO pipeline (não confia só no adapter).
  const reloaded = await readDbReleasePlan(ctx.execution.planId, { store: ctx.planStore });
  const identityOk = reloaded.ok && !planDriftReason(reloaded.plan, ctx.execution)
    && reloaded.plan.planHash === ctx.plan.planHash;
  const stepsComplete = ctx.plan.migrations.every((item) => {
    const step = ctx.steps.get(migrateStepOrder(item.order));
    return step?.status === "SUCCEEDED" && step.evidence?.commitState === "COMMITTED";
  });
  const noResidue = [...ctx.steps.values()].every((step) => step.stepOrder === STEP_ORDER.SCHEMA_VALIDATE || step.status !== "RUNNING");
  const verification = identityOk && stepsComplete && noResidue
    ? await safe(() => ctx.ports.verifier.verifyPostMigration({
      executionId: ctx.executionId,
      planId: ctx.plan.id,
      environment: ctx.plan.environment,
      projectRef: ctx.projectRef,
      migrations: ctx.plan.migrations,
      steps: [...ctx.steps.values()].map((step) => ({ stepOrder: step.stepOrder, stepType: step.stepType, status: step.status })),
    }), null)
    : null;
  const checks = verification?.checks;
  const adapterOk = verification?.ok === true && checks
    && checks.migrationHistory === true && checks.schemaEvidence === true && checks.noResidue === true;
  if (!(identityOk && stepsComplete && noResidue && adapterOk)) {
    await finishStep(ctx, STEP_ORDER.SCHEMA_VALIDATE, "FAILED", {
      errorCode: "POST_MIGRATION_VERIFICATION_FAILED",
      evidence: { identityOk, stepsComplete, noResidue, adapterOk: Boolean(adapterOk) },
    });
    await emit(ctx, "DB_SCHEMA_VALIDATION_FAILED", { identityOk, stepsComplete, noResidue });
    return haltRecovery(ctx, "POST_MIGRATION_VERIFICATION_FAILED", { reasonCode: "POST_COMMIT_VERIFICATION" });
  }
  const finished = await finishStep(ctx, STEP_ORDER.SCHEMA_VALIDATE, "SUCCEEDED", {
    evidence: { identityOk, stepsComplete, noResidue, adapterOk: true },
  });
  if (!finished.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: finished.code });
  await emit(ctx, "DB_SCHEMA_VALIDATION_PASSED", { migrationCount: ctx.plan.migrations.length });
  return null;
}

async function stageSmoke(ctx) {
  ctx.stage = "SMOKE";
  if (stepIs(ctx, STEP_ORDER.SMOKE, "SUCCEEDED")) return null;
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return null;

  const existing = ctx.steps.get(STEP_ORDER.SMOKE);
  if (existing?.status === "RUNNING" || existing?.status === "FAILED") {
    return haltRecovery(ctx, "SMOKE_FAILED_AFTER_COMMIT", { reasonCode: "SMOKE_STEP_NOT_SUCCEEDED" });
  }
  let state = await readFreshState(ctx);
  if (!state || !bindingMatches(state, ctx.plan)) {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "SMOKE_STAGE_BINDING" });
  }
  if (state.phase === "MIGRATING") {
    const started = await safe(() => ctx.ports.maintenance.startSmoke({ expectedVersion: state.version }), { ok: false });
    if (!started?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: started?.code ?? "SMOKE_PHASE_FAILED" });
    state = await readFreshState(ctx);
  }
  if (!state || state.phase !== "SMOKE") {
    return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: `SMOKE_PHASE_${state?.phase ?? "UNKNOWN"}` });
  }
  const begun = await beginStep(ctx, STEP_ORDER.SMOKE, "SMOKE", { epoch: state.epoch, version: state.version });
  if (!begun.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: begun.code });
  await emit(ctx, "SMOKE_STARTED", { epoch: state.epoch, version: state.version });

  let smoke = null;
  let thrown = false;
  try {
    smoke = await ctx.ports.smoke.run({
      executionId: ctx.executionId,
      planId: ctx.plan.id,
      environment: ctx.plan.environment,
      projectRef: ctx.projectRef,
      heartbeat: ctx.heartbeat,
    });
  } catch {
    thrown = true;
  }
  const passed = !thrown && smoke?.result === "PASS" && smoke.executionId === ctx.executionId;
  if (!passed) {
    await finishStep(ctx, STEP_ORDER.SMOKE, "FAILED", {
      errorCode: "SMOKE_FAILED_AFTER_COMMIT",
      evidence: { result: thrown ? "THREW" : smoke?.result ?? "UNRECOGNIZED" },
    });
    return haltRecovery(ctx, "SMOKE_FAILED_AFTER_COMMIT", { reasonCode: thrown ? "SMOKE_THREW" : "SMOKE_NOT_PASS" });
  }
  const finished = await finishStep(ctx, STEP_ORDER.SMOKE, "SUCCEEDED", { evidence: { result: "PASS" } });
  if (!finished.ok) return haltRecovery(ctx, "SMOKE_FAILED_AFTER_COMMIT", { reasonCode: "SMOKE_RESULT_NOT_PERSISTED" });
  return null;
}

/**
 * Normalização: (1) sem ambiguidade; (2) manutenção → NORMAL (remove o fence
 * por fase); (3) reabre o login; (4) execução SUCCEEDED; (5) plano SUCCEEDED;
 * (6) libera o lock. O lock só sai DEPOIS de tudo durável.
 */
async function stageNormalize(ctx) {
  ctx.stage = "NORMALIZE";
  const cp = await checkpoint(ctx);
  if (cp.halt) return cp.halt;
  if (cp.finalize) return finalizeAfterSuccess(ctx);

  const migrations = ctx.plan.migrations;
  const clean = migrations.every((item) => stepIs(ctx, migrateStepOrder(item.order), "SUCCEEDED"))
    && stepIs(ctx, STEP_ORDER.SCHEMA_VALIDATE, "SUCCEEDED")
    && stepIs(ctx, STEP_ORDER.SMOKE, "SUCCEEDED")
    && [...ctx.steps.values()].every((step) => step.status !== "RUNNING" && step.status !== "FAILED");
  if (!clean || ctx.execution.status !== "VERIFYING") {
    return haltRecovery(ctx, "MIGRATION_OUTCOME_AMBIGUOUS", { reasonCode: "UNRESOLVED_AMBIGUITY_AT_NORMALIZATION" });
  }

  let state = await readFreshState(ctx);
  if (!state) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "MAINTENANCE_STATE_UNAVAILABLE" });
  if (state.phase === "SMOKE") {
    if (!bindingMatches(state, ctx.plan)) return haltRecovery(ctx, "MAINTENANCE_BINDING_MISMATCH", { reasonCode: "NORMALIZE_BINDING" });
    const normal = await safe(() => ctx.ports.maintenance.completeNormal({ expectedVersion: state.version }), { ok: false });
    if (!normal?.ok) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: normal?.code ?? "NORMAL_TRANSITION_FAILED" });
    state = await readFreshState(ctx);
  }
  if (!state || state.phase !== "NORMAL" || isWriteFencePhase(state.phase)) {
    return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "NORMAL_NOT_CONFIRMED", phase: state?.phase ?? null });
  }
  let reopenedNow = false;
  if (state.loginGate !== "OPEN") {
    const opened = await safe(() => ctx.ports.maintenance.openLoginGate({ expectedVersion: state.version }), { ok: false });
    if (!opened?.ok) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: opened?.code ?? "LOGIN_GATE_OPEN_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.loginGate !== "OPEN") {
      return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "LOGIN_GATE_OPEN_NOT_CONFIRMED" });
    }
    reopenedNow = true;
  }
  const opened = await recordStepSucceeded(ctx, STEP_ORDER.LOGIN_GATE_OPEN, "LOGIN_GATE_OPEN", {
    maintenanceEpoch: state.epoch,
    maintenanceVersion: state.version,
    phase: state.phase,
    writeFenceRemoved: !isWriteFencePhase(state.phase),
  });
  if (!opened.ok) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: opened.code });
  if (reopenedNow) await emit(ctx, "LOGIN_GATE_OPENED", { epoch: state.epoch, version: state.version });

  const succeeded = await transitionExecution(ctx, "SUCCEEDED", { completedAt: iso(nowMs(ctx)) });
  if (!succeeded.ok) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: succeeded.code });
  if (succeeded.unchanged !== true) await emit(ctx, "DB_RELEASE_SUCCEEDED", { migrationCount: migrations.length });
  return finalizeAfterSuccess(ctx);
}

/** Idempotente: plano SUCCEEDED + lock liberado (só com execução SUCCEEDED durável). */
async function finalizeAfterSuccess(ctx) {
  ctx.stage = "FINALIZE";
  const planned = await transitionPlan(ctx, ["RUNNING"], "SUCCEEDED");
  if (!planned.ok) {
    return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: planned.code, executionSucceeded: true, lockReleased: false });
  }
  const key = buildEnvironmentLockKey({ environment: ctx.execution.environment, projectRef: ctx.execution.projectRef });
  const lockRead = key.ok ? await ctx.executionStore.readEnvironmentLock(key.lockKey) : null;
  let lockReleased = false;
  if (lockRead?.ok && lockRead.lock?.executionId === ctx.executionId) {
    lockReleased = await releaseLock(ctx);
    if (!lockReleased) {
      return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "LOCK_RELEASE_FAILED", executionSucceeded: true });
    }
  } else if (lockRead?.ok && !lockRead.lock) {
    lockReleased = true;
  }
  return out(ctx, "SUCCEEDED", {
    planSucceeded: true,
    lockReleased,
    loginGateReopened: true,
    migrationsApplied: ctx.plan?.migrations?.length ?? ctx.counters.migrationsApplied,
  });
}

const STAGES = Object.freeze([
  stagePreflight,
  stageNotice,
  stageFence,
  stageDrain,
  stageQuiesce,
  stageBackup,
  stageMigrationBoundary,
  stageMigrate,
  stageVerify,
  stageSmoke,
  stageNormalize,
]);

/**
 * Avança a execução o máximo que for SEGURO numa chamada e devolve o estado.
 * Re-entrada é retomada/reconciliada: nunca recomeça do zero, nunca reinvoca
 * mutação cujo resultado é desconhecido.
 *
 * request: { executionId, leaseGeneration } (identidade do worker vem de deps)
 * deps: { executionStore, planStore, stepStore, collectEvidence, clock, worker:{id},
 *         ports:{maintenance,probes,backup,migration,smoke,verifier},
 *         audit?, policy?, trustedDerivers? }
 */
export async function runDbReleaseExecution(request, deps) {
  const resolved = resolveDeps(deps);
  if (resolved.failure) return resolved.failure;
  const invalid = !request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).some((key) => !REQUEST_KEYS.includes(key))
    || !isUuid(request.executionId)
    || !Number.isInteger(request.leaseGeneration) || request.leaseGeneration < 1;
  if (invalid) return early("REQUEST_INVALID", "PIPELINE_REQUEST_INVALID");
  const live = await guardLive(deps, resolved.ports);
  if (live) return live;

  const ctx = buildContext(deps, resolved.ports, request);
  const first = await checkpoint(ctx, { heartbeat: false });
  if (first.halt) return first.halt;
  if (first.finalize) {
    const plan = await ensurePlan(ctx);
    if (plan.halt) return plan.halt;
    return finalizeAfterSuccess(ctx);
  }
  for (const stage of STAGES) {
    if (!(await loadSteps(ctx))) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: "STEP_STORE_UNAVAILABLE" });
    if (ctx.plan == null && stage !== stagePreflight) {
      const planned = await ensurePlan(ctx);
      if (planned.halt) return planned.halt;
    }
    const halted = await stage(ctx);
    if (halted) return halted;
  }
  return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "PIPELINE_FELL_THROUGH" });
}

// ── Abort controlado (somente PRÉ-mutação) ───────────────────
/**
 * Unwind seguro: só antes de MIGRATING, sem backup ambíguo e sem step MIGRATE
 * iniciado. Nunca cancela mutação em curso; nunca restaura. Idempotente.
 * Pedido durante/depois de MIGRATING é RECUSADO (nada é gravado).
 */
export async function abortDbReleaseExecution(request, deps) {
  const resolved = resolveDeps(deps);
  if (resolved.failure) return resolved.failure;
  const invalid = !request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).some((key) => !REQUEST_KEYS.includes(key))
    || !isUuid(request.executionId)
    || !Number.isInteger(request.leaseGeneration) || request.leaseGeneration < 1;
  if (invalid) return early("REQUEST_INVALID", "PIPELINE_REQUEST_INVALID");
  const ctx = buildContext(deps, resolved.ports, request);
  ctx.stage = "ABORT";

  const read = await ctx.executionStore.getExecution(ctx.executionId);
  if (!read?.ok || !read.execution) return out(ctx, "EXECUTION_NOT_FOUND", { ok: false, code: "EXECUTION_NOT_FOUND" });
  const execution = read.execution;
  ctx.execution = execution;
  ctx.projectRef = execution.projectRef;
  if (!(await loadSteps(ctx))) return out(ctx, "STEP_STORE_UNAVAILABLE", { ok: false, code: "STEP_STORE_UNAVAILABLE" });

  const reject = (code) => out(ctx, "CANCEL_REJECTED", {
    ok: false,
    code,
    recorded: false,
    mutated: false,
    requiresReconciliation: ["CANCEL_NOT_ALLOWED_AFTER_MIGRATING_STARTED", "BACKUP_OUTCOME_AMBIGUOUS_RECONCILE_FIRST", "RECONCILIATION_REQUIRED_FIRST"].includes(code),
  });
  if (execution.workerId !== ctx.worker || execution.leaseGeneration !== ctx.leaseGeneration) {
    return out(ctx, "OWNERSHIP_MISMATCH", { ok: false, code: "WORKER_OR_GENERATION_MISMATCH" });
  }
  const migrateStarted = [...ctx.steps.values()].some((step) => step.stepType === "MIGRATE");
  if (migrateStarted || ["MIGRATING", "VERIFYING", "SUCCEEDED"].includes(execution.status)) {
    return reject("CANCEL_NOT_ALLOWED_AFTER_MIGRATING_STARTED");
  }
  const backupStep = ctx.steps.get(STEP_ORDER.BACKUP);
  if (backupStep && (backupStep.status === "RUNNING" || backupStep.evidence?.outcome === "AMBIGUOUS")) {
    return reject("BACKUP_OUTCOME_AMBIGUOUS_RECONCILE_FIRST");
  }
  if (execution.status === "RECOVERY_REQUIRED") return reject("RECONCILIATION_REQUIRED_FIRST");
  const activeStatuses = ["REQUESTED", "PREPARING", "DRAINING", "BACKING_UP"];
  if (execution.status === "CANCELED") {
    return out(ctx, "CANCELED", { ok: true, alreadyCanceled: true, lockReleased: false });
  }
  if (execution.status === "FAILED") {
    if (!SAFE_ABORT_FAILURE_CODES.includes(execution.failureCode)) return reject("FAILURE_NOT_SAFE_TO_UNWIND");
  } else if (activeStatuses.includes(execution.status)) {
    const cp = await checkpoint(ctx);
    if (cp.halt) return cp.halt;
  } else {
    return reject("STATUS_NOT_ABORTABLE");
  }
  const key = buildEnvironmentLockKey({ environment: execution.environment, projectRef: execution.projectRef });
  const lockRead = key.ok ? await ctx.executionStore.readEnvironmentLock(key.lockKey) : null;
  if (!lockRead?.ok || lockRead.lock?.executionId !== execution.id || lockRead.lock.workerId !== ctx.worker
    || lockRead.lock.leaseGeneration !== ctx.leaseGeneration) {
    return out(ctx, "RECONCILIATION_REQUIRED", { ok: false, code: "LOCK_NOT_HELD_BY_EXECUTION", requiresReconciliation: true });
  }

  const planned = await ensurePlan(ctx);
  if (planned.halt) return planned.halt;
  let state = await readFreshState(ctx);
  if (!state) return out(ctx, "MAINTENANCE_UNAVAILABLE", { ok: false, code: "MAINTENANCE_STATE_UNAVAILABLE" });
  if (state.phase === "MIGRATING") return reject("CANCEL_NOT_ALLOWED_AFTER_MIGRATING_STARTED");
  if (state.phase !== "NORMAL") {
    if (!bindingMatches(state, ctx.plan)) return reject("MAINTENANCE_BINDING_MISMATCH");
    const back = await safe(() => ctx.ports.maintenance.abortToNormal({ expectedVersion: state.version }), { ok: false });
    if (!back?.ok) return out(ctx, "MAINTENANCE_CONFLICT", { ok: false, code: back?.code ?? "ABORT_TO_NORMAL_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.phase !== "NORMAL") return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "NORMAL_NOT_CONFIRMED" });
  }
  if (state.loginGate !== "OPEN") {
    const opened = await safe(() => ctx.ports.maintenance.openLoginGate({ expectedVersion: state.version }), { ok: false });
    if (!opened?.ok) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: opened?.code ?? "LOGIN_GATE_OPEN_FAILED" });
    state = await readFreshState(ctx);
    if (!state || state.loginGate !== "OPEN") return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: "LOGIN_GATE_OPEN_NOT_CONFIRMED" });
    await emit(ctx, "LOGIN_GATE_OPENED", { reason: "ABORTED_BEFORE_MUTATION" });
  }
  const canceled = await transitionExecution(ctx, "CANCELED", {
    completedAt: iso(nowMs(ctx)),
    failureCode: "ABORTED_BEFORE_MUTATION",
    failureMessage: "Abortado antes de qualquer mutação de schema.",
  });
  if (!canceled.ok) return out(ctx, "NORMALIZATION_PENDING", { ok: false, code: canceled.code });
  // Plano que nunca virou RUNNING continua APPROVED/SCHEDULED (reivindicável de novo).
  await transitionPlan(ctx, ["RUNNING"], "FAILED");
  if (canceled.unchanged !== true) await emit(ctx, "MAINTENANCE_ABORTED", { reason: "ABORTED_BEFORE_MUTATION" });
  const lockReleased = await releaseLock(ctx);
  return out(ctx, "CANCELED", {
    ok: true,
    lockReleased,
    loginGateReopened: true,
    maintenanceReturnedToNormal: true,
    migrationMutationOccurred: false,
  });
}

// ── Reconciliação SOMENTE leitura ────────────────────────────
const COMMIT_STATES = Object.freeze(["COMMITTED", "NOT_COMMITTED", "UNKNOWN"]);

/**
 * Relatório read-only de uma execução ambígua. NÃO muda plano, execução,
 * step, manutenção nem lock; NÃO retoma; NÃO reinvoca apply.
 */
export async function reconcileDbReleaseExecution(request, deps) {
  if (!deps || !isExecutionStore(deps.executionStore) || !isStepStore(deps.stepStore)
    || !isPortShape("migration", deps.ports?.migration) || deps.ports.migration.enabled !== true) {
    return early("DEPENDENCY_MISSING", "RECONCILE_DEPENDENCY_MISSING");
  }
  if (!request || !isUuid(request.executionId)) return early("REQUEST_INVALID", "PIPELINE_REQUEST_INVALID");
  const read = await deps.executionStore.getExecution(request.executionId);
  if (!read?.ok || !read.execution) return early("EXECUTION_NOT_FOUND", "EXECUTION_NOT_FOUND");
  const listed = await deps.stepStore.listSteps(request.executionId);
  if (!listed?.ok) return early("STORE_UNAVAILABLE", "STORE_UNAVAILABLE");
  const perStep = [];
  for (const step of listed.steps.filter((item) => item.stepType === "MIGRATE")) {
    const identity = step.evidence?.identity ?? {};
    let commit;
    if (step.status === "SUCCEEDED") commit = "COMMITTED";
    else if (step.evidence?.commitState === "NOT_COMMITTED") commit = "NOT_COMMITTED";
    else {
      const observed = await safe(() => deps.ports.migration.readCommitState({
        order: identity.order,
        filename: identity.filename,
        sha256: identity.sha256,
      }), null);
      commit = COMMIT_STATES.includes(observed?.commitState) ? observed.commitState : "UNKNOWN";
    }
    perStep.push({ stepOrder: step.stepOrder, order: identity.order ?? null, stepStatus: step.status, commitState: commit });
  }
  const states = new Set(perStep.map((item) => item.commitState));
  let outcome = "UNKNOWN";
  if (perStep.length === 0 || (states.size === 1 && states.has("NOT_COMMITTED"))) outcome = "NONE_COMMITTED";
  else if (states.size === 1 && states.has("COMMITTED")) outcome = "ALL_COMMITTED";
  else if (!states.has("UNKNOWN")) outcome = "PARTIAL";
  return {
    ok: true,
    outcome,
    readOnly: true,
    mutated: false,
    resumeAllowed: false,
    autoRetryAllowed: false,
    autoRestoreAllowed: false,
    executionStatus: read.execution.status,
    perStep,
  };
}

// ── Avaliação de estágio SOMENTE leitura ─────────────────────
const EVALUABLE_STAGES = Object.freeze(["READY_TO_QUIESCE", "READY_TO_BACKUP", "READY_TO_MIGRATE"]);

/**
 * Reavalia um perfil de readiness para uma execução existente sem gravar
 * nada (sem heartbeat, sem transição, sem auditoria). `globalReady` é o
 * readiness GLOBAL server-authoritative (17/16 gates) — só pode ser true
 * quando todo gate aplicável está VERIFIED e fresco.
 */
export async function evaluateDbReleaseExecutionStage(request, deps, { stage } = {}) {
  const resolved = resolveDeps(deps);
  if (resolved.failure) return resolved.failure;
  if (!EVALUABLE_STAGES.includes(stage)) return early("REQUEST_INVALID", "STAGE_NOT_EVALUABLE");
  const invalid = !request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).some((key) => !REQUEST_KEYS.includes(key))
    || !isUuid(request.executionId)
    || !Number.isInteger(request.leaseGeneration) || request.leaseGeneration < 1;
  if (invalid) return early("REQUEST_INVALID", "PIPELINE_REQUEST_INVALID");
  const ctx = buildContext(deps, resolved.ports, request);
  ctx.stage = stage;
  const read = await ctx.executionStore.getExecution(ctx.executionId);
  if (!read?.ok || !read.execution) return early("EXECUTION_NOT_FOUND", "EXECUTION_NOT_FOUND");
  ctx.execution = read.execution;
  ctx.projectRef = read.execution.projectRef;
  const planned = await ensurePlan(ctx);
  if (planned.halt) return planned.halt;
  if (!(await loadSteps(ctx))) return early("STORE_UNAVAILABLE", "STORE_UNAVAILABLE");
  const includeBackup = stage === "READY_TO_MIGRATE";
  const evaluated = await evaluateStage(ctx, stage, {
    includeBackup,
    backupBinding: includeBackup ? backupBindingFor(ctx) : null,
  });
  return {
    ok: true,
    readOnly: true,
    stage,
    satisfied: evaluated.satisfied,
    globalReady: evaluated.globalReady,
    requiredGates: evaluated.evaluation.requiredGates,
    blockers: evaluated.blockers,
    gates: evaluated.gates,
  };
}
