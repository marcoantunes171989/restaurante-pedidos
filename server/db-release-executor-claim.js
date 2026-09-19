// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Serviço de CLAIM do executor DB (server-only).
//
//  Responsabilidades: validar intenção → revalidar CLAIMABLE no instante T
//  → adquirir o lock exclusivo do ambiente → criar a única execução da
//  tentativa (status REQUESTED) → ligar worker → inicializar lease.
//  Também: heartbeat de dono, sinalização de perda de lease, liberação de
//  lock pelo dono e coleta de evidência de posse para o readiness.
//
//  NÃO faz: NOTICE/FENCING/DRAINING/QUIESCENT, login gate, write fence,
//  backup, migration, restore, cron, rede, DB live. Sem endpoint HTTP.
//  I/O somente por portas injetadas (planStore, executionStore,
//  collectEvidence, clock, audit).
//
//  Imediato e agendado convergem AQUI, antes do lock/claim.
//  Claim ≠ ready: uma execução claimed continua com `ready=false`.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import { readDbReleasePlan } from "./db-release-plan-reader.js";
import {
  SHA1_RE,
  SHA256_RE,
  canRequestPlanExecution,
  isMaintenanceEventType,
} from "./db-release-contract.js";
import { frozenPlanIdentity } from "./db-release-plan-hash.js";
import { checkBackupIdentity, expectedProjectRefFor, parseIsoMs, toIso } from "./db-backup-contract.js";
import {
  EXECUTION_INITIAL_STATUS,
  LOCK_RELEASABLE_EXECUTION_STATUSES,
  buildEnvironmentLockKey,
  findClientAuthorityFields,
  isActiveExecutionStatus,
  isClaimFailureCode,
  isClaimIntent,
  isDbEnvironment,
  isTerminalExecutionStatus,
  isUuid,
  validateWorkerId,
} from "./db-release-executor-contract.js";
import { buildLease, classifyOwnership, leaseExpiresAtMs } from "./db-release-executor-lease.js";
import { isExecutionStore } from "./db-release-execution-store.js";
import {
  computeOverallReadiness,
  deriveClaimableGates,
  deriveScheduleWindowGate,
  evaluateStageReadiness,
} from "./db-release-stage-readiness.js";

// ── Resultados ───────────────────────────────────────────────
function deny(code, extra = {}) {
  const { outcome = "DENIED", ...rest } = extra;
  return {
    ok: false,
    outcome,
    code: isClaimFailureCode(code) ? code : "CLAIM_REQUEST_INVALID",
    executionCreated: false,
    lockAcquired: false,
    migrationAuthorized: false,
    autoTakeoverAllowed: false,
    autoRetryAllowed: false,
    ...rest,
  };
}

function toPublicExecution(execution) {
  if (!execution) return null;
  return {
    executionId: execution.id,
    planId: execution.planId,
    planHash: execution.planHash,
    environment: execution.environment,
    projectRef: execution.projectRef,
    targetReleaseSha: execution.targetReleaseSha,
    baseSha: execution.baseSha,
    correlationId: execution.correlationId,
    workerId: execution.workerId,
    claimedAt: execution.claimedAt,
    leaseGeneration: execution.leaseGeneration,
    status: execution.status,
    heartbeatAt: execution.heartbeatAt,
    leaseExpiresAt: toIso(leaseExpiresAtMs(execution.heartbeatAt)),
  };
}

function toPublicLock(lock) {
  if (!lock) return null;
  return {
    lockKey: lock.lockKey,
    environment: lock.environment,
    projectRef: lock.projectRef,
    executionId: lock.executionId,
    workerId: lock.workerId,
    leaseGeneration: lock.leaseGeneration,
    acquiredAt: lock.acquiredAt,
  };
}

const OWNERSHIP_DENIAL_CODE = Object.freeze({
  HELD_BY_OTHER_WORKER: "WORKER_MISMATCH",
  LEASE_GENERATION_MISMATCH: "LEASE_GENERATION_MISMATCH",
  LEASE_EXPIRED_PRE_MUTATION: "LEASE_EXPIRED",
  LEASE_EXPIRED_AFTER_MUTATION: "LEASE_EXPIRED",
  EXECUTION_TERMINAL: "EXECUTION_TERMINAL",
  EXECUTION_NOT_FOUND: "EXECUTION_NOT_FOUND",
  LOCK_BINDING_MISMATCH: "LOCK_MISMATCH",
  LOCK_MISSING: "LOCK_MISMATCH",
});

function ownershipDenial(classification, extra = {}) {
  return deny(OWNERSHIP_DENIAL_CODE[classification.reasonCode] || "LOCK_UNAVAILABLE", {
    outcome: classification.outcome,
    reasonCode: classification.reasonCode,
    requiresReconciliation: classification.requiresReconciliation,
    ...extra,
  });
}

// ── Contexto / dependências ──────────────────────────────────
function readClock(deps) {
  const clock = deps?.clock ?? { nowMs: () => Date.now() };
  if (typeof clock.nowMs !== "function") return null;
  const nowMs = clock.nowMs();
  return Number.isFinite(nowMs) ? nowMs : null;
}

function planStoreOk(store) {
  return Boolean(store)
    && typeof store.getPlanRow === "function"
    && typeof store.listPlanMigrationRows === "function";
}

function resolveContext(deps, { needsPlan = false, needsWorker = true } = {}) {
  if (!deps || !isExecutionStore(deps.executionStore)) {
    return { failure: deny("CLAIM_DEPENDENCY_MISSING", { reasonCode: "EXECUTION_STORE_REQUIRED" }) };
  }
  if (needsPlan && (!planStoreOk(deps.planStore) || typeof deps.collectEvidence !== "function")) {
    return { failure: deny("CLAIM_DEPENDENCY_MISSING", { reasonCode: "PLAN_STORE_OR_EVIDENCE_REQUIRED" }) };
  }
  const nowMs = readClock(deps);
  if (nowMs == null) {
    return { failure: deny("CLAIM_DEPENDENCY_MISSING", { reasonCode: "CLOCK_INVALID" }) };
  }
  let worker = null;
  if (needsWorker) {
    const checked = validateWorkerId(deps.worker?.id);
    if (!checked.ok) return { failure: deny("WORKER_ID_INVALID") };
    worker = checked.workerId;
  }
  return { ctx: { store: deps.executionStore, nowMs, worker, deps } };
}

async function emitAudit(deps, event) {
  if (!deps?.audit || typeof deps.audit.append !== "function") return { written: false };
  // Só tipos que já existem no contrato da migration 160 (I2C1 §34).
  if (!isMaintenanceEventType(event?.eventType)) return { written: false };
  try {
    await deps.audit.append(event);
    return { written: true };
  } catch {
    return { written: false };
  }
}

// ── Request de claim ─────────────────────────────────────────
function validateClaimRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { failure: deny("CLAIM_REQUEST_INVALID") };
  }
  const forbidden = findClientAuthorityFields(request);
  if (forbidden.length > 0) {
    return { failure: deny("CLIENT_AUTHORITY_FIELD_REJECTED", { fields: forbidden }) };
  }
  if (!isClaimIntent(request.intent)) return { failure: deny("CLAIM_INTENT_INVALID") };
  if (!isUuid(request.planId)) return { failure: deny("CLAIM_REQUEST_INVALID", { reasonCode: "PLAN_ID_INVALID" }) };
  if (!isUuid(request.correlationId)) return { failure: deny("CORRELATION_ID_INVALID") };
  const expected = request.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return { failure: deny("CLAIM_REQUEST_INVALID", { reasonCode: "EXPECTED_INTENT_REQUIRED" }) };
  }
  if (!isDbEnvironment(expected.environment)) return { failure: deny("ENVIRONMENT_INVALID") };
  if (
    !SHA256_RE.test(expected.planHash || "")
    || !SHA1_RE.test(expected.targetReleaseSha || "")
    || !SHA1_RE.test(expected.baseSha || "")
    || parseIsoMs(expected.approvedAt) == null
    || !Number.isInteger(expected.readinessGeneration)
    || expected.readinessGeneration < 0
    || (expected.migrations != null && !Array.isArray(expected.migrations))
  ) {
    return { failure: deny("CLAIM_REQUEST_INVALID", { reasonCode: "EXPECTED_INTENT_INVALID" }) };
  }
  if (request.projectRef != null && typeof request.projectRef !== "string") {
    return { failure: deny("PROJECT_REF_MISMATCH") };
  }
  return {
    claim: {
      intent: request.intent,
      planId: request.planId,
      correlationId: request.correlationId,
      projectRef: request.projectRef ?? null,
      expected: {
        environment: expected.environment,
        planHash: expected.planHash,
        targetReleaseSha: expected.targetReleaseSha,
        baseSha: expected.baseSha,
        approvedAt: expected.approvedAt,
        readinessGeneration: expected.readinessGeneration,
        migrations: expected.migrations ?? null,
      },
    },
  };
}

function migrationIdentityEquals(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return item && other
      && item.order === other.order
      && item.filename === other.filename
      && (item.gitBlob ?? null) === (other.gitBlob ?? null)
      && item.sha256 === other.sha256
      && Number(item.bytes) === Number(other.bytes)
      && item.classification === other.classification;
  });
}

function detectPlanDrift(plan, expected) {
  if (expected.migrations && !migrationIdentityEquals(expected.migrations, plan.migrations)) {
    return { code: "MIGRATION_IDENTITY_DRIFT", reasonCode: "EXPECTED_MIGRATIONS_DIVERGED" };
  }
  const frozen = frozenPlanIdentity({
    environment: plan.environment,
    targetReleaseSha: plan.targetReleaseSha,
    baseSha: plan.baseSha,
    migrations: plan.migrations,
  });
  if (!frozen.ok || frozen.planHash !== plan.planHash) {
    return { code: "MIGRATION_IDENTITY_DRIFT", reasonCode: "PLAN_HASH_NOT_REPRODUCIBLE" };
  }
  if (plan.environment !== expected.environment) return { code: "PLAN_DRIFT", reasonCode: "ENVIRONMENT_DRIFT" };
  if (plan.planHash !== expected.planHash) return { code: "PLAN_DRIFT", reasonCode: "PLAN_HASH_DRIFT" };
  if (plan.targetReleaseSha !== expected.targetReleaseSha) return { code: "PLAN_DRIFT", reasonCode: "TARGET_SHA_DRIFT" };
  if (plan.baseSha !== expected.baseSha) return { code: "PLAN_DRIFT", reasonCode: "BASE_SHA_DRIFT" };
  if (
    !plan.approvedAt
    || !plan.approvedBy
    || parseIsoMs(plan.approvedAt) !== parseIsoMs(expected.approvedAt)
    || plan.readinessGeneration !== expected.readinessGeneration
  ) {
    return { code: "APPROVAL_STALE", reasonCode: "APPROVAL_BINDING_DRIFT" };
  }
  return null;
}

function checkIntentStatus(plan, intent) {
  if (intent === "IMMEDIATE") {
    if (canRequestPlanExecution(plan.status)) return null;
    return plan.status === "SCHEDULED"
      ? { code: "INTENT_STATUS_MISMATCH", reasonCode: "SCHEDULED_PLAN_NEEDS_SCHEDULED_INTENT" }
      : { code: "PLAN_STATUS_INVALID", reasonCode: `PLAN_STATUS_${plan.status}` };
  }
  if (plan.status === "SCHEDULED") return null;
  return plan.status === "APPROVED"
    ? { code: "INTENT_STATUS_MISMATCH", reasonCode: "APPROVED_PLAN_NOT_SCHEDULED" }
    : { code: "PLAN_STATUS_INVALID", reasonCode: `PLAN_STATUS_${plan.status}` };
}

const SCHEDULE_GATE_TO_CODE = Object.freeze({
  FAILED: "SCHEDULE_INVALID",
  PENDING: "SCHEDULE_NOT_DUE",
  STALE: "SCHEDULE_WINDOW_EXPIRED",
});

// ── Replay idempotente ───────────────────────────────────────
async function resolveExistingExecution({ existing, claim, ctx }) {
  const bound = existing.planId === claim.planId
    && existing.environment === claim.expected.environment
    && existing.planHash === claim.expected.planHash
    && existing.targetReleaseSha === claim.expected.targetReleaseSha
    && existing.baseSha === claim.expected.baseSha;
  if (!bound) return deny("PLAN_DRIFT", { reasonCode: "EXECUTION_BINDING_DRIFT" });

  const lockKey = buildEnvironmentLockKey({
    environment: existing.environment,
    projectRef: existing.projectRef,
  });
  if (!lockKey.ok) return deny(lockKey.code);
  const lockRead = await ctx.store.readEnvironmentLock(lockKey.lockKey);
  if (!lockRead.ok) return deny("STORE_UNAVAILABLE");

  const classification = classifyOwnership({
    execution: existing,
    lock: lockRead.lock,
    expected: { workerId: ctx.worker, leaseGeneration: existing.leaseGeneration },
    nowMs: ctx.nowMs,
  });
  if (classification.outcome === "OWNED") {
    return {
      ok: true,
      outcome: "OWNED",
      replay: true,
      executionCreated: false,
      lockAcquired: false,
      migrationAuthorized: false,
      execution: toPublicExecution(existing),
      lock: toPublicLock(lockRead.lock),
      lease: buildLease(existing, { nowMs: ctx.nowMs }),
      auditIntents: [],
    };
  }
  if (classification.outcome === "LOCKED") {
    return deny("EXECUTION_OWNED_BY_OTHER_WORKER", {
      outcome: "ALREADY_CLAIMED",
      reasonCode: classification.reasonCode,
      execution: toPublicExecution(existing),
    });
  }
  return ownershipDenial(classification, { execution: toPublicExecution(existing) });
}

// ── Claim ambíguo (falha após lock/execução) ─────────────────
/**
 * A porta prometeu atomicidade; se ela falhou/lançou depois de possivelmente
 * gravar, NÃO assumimos nada: lemos o estado e compensamos. Nunca devolve
 * sucesso "cego". Modela o risco de lock órfão (I2C1 §41-42).
 */
async function reconcileAmbiguousClaim({ lock, execution, ctx }) {
  let lockRead;
  let execRead;
  try {
    [lockRead, execRead] = await Promise.all([
      ctx.store.readEnvironmentLock(lock.lockKey),
      ctx.store.getExecution(execution.id),
    ]);
  } catch {
    lockRead = { ok: false };
    execRead = { ok: false };
  }
  if (!lockRead?.ok || !execRead?.ok) {
    return deny("CLAIM_OUTCOME_UNKNOWN", {
      outcome: "RECONCILIATION_REQUIRED",
      requiresReconciliation: true,
      reasonCode: "CLAIM_OUTCOME_UNKNOWN",
      executionId: execution.id,
      lockKey: lock.lockKey,
    });
  }
  const lockOurs = lockRead.lock && lockRead.lock.executionId === execution.id;
  const stored = execRead.execution;

  if (lockOurs && stored) {
    return {
      ok: true,
      outcome: "OWNED",
      replay: false,
      recoveredFromAmbiguousClaim: true,
      executionCreated: true,
      lockAcquired: true,
      migrationAuthorized: false,
      execution: toPublicExecution(stored),
      lock: toPublicLock(lockRead.lock),
      lease: buildLease(stored, { nowMs: ctx.nowMs }),
      auditIntents: [],
    };
  }
  if (lockOurs && !stored) {
    const released = await ctx.store.releaseLock({
      lockKey: lock.lockKey,
      executionId: lock.executionId,
      workerId: lock.workerId,
      leaseGeneration: lock.leaseGeneration,
    });
    if (released.ok) {
      return deny("EXECUTION_CREATE_FAILED", { reasonCode: "ORPHAN_LOCK_COMPENSATED", lockReleased: true });
    }
    return deny("ORPHAN_LOCK", {
      outcome: "RECONCILIATION_REQUIRED",
      requiresReconciliation: true,
      reasonCode: "ORPHAN_LOCK",
      lockReleased: false,
      lockKey: lock.lockKey,
      executionId: execution.id,
    });
  }
  if (!lockOurs && stored) {
    const canceled = await ctx.store.conditionalTransition({
      executionId: stored.id,
      fromStatus: stored.status,
      expectedHeartbeatAt: stored.heartbeatAt,
      patch: {
        status: "CANCELED",
        completedAt: toIso(ctx.nowMs),
        failureCode: "EXECUTION_WITHOUT_LOCK",
        failureMessage: "Execução sem lock de ambiente foi cancelada na reconciliação do claim.",
      },
    });
    if (canceled.ok) {
      return deny("EXECUTION_CREATE_FAILED", { reasonCode: "ORPHAN_EXECUTION_COMPENSATED", executionCanceled: true });
    }
    return deny("ORPHAN_EXECUTION", {
      outcome: "RECONCILIATION_REQUIRED",
      requiresReconciliation: true,
      reasonCode: "ORPHAN_EXECUTION",
      executionCanceled: false,
      executionId: execution.id,
    });
  }
  return deny("EXECUTION_CREATE_FAILED", { reasonCode: "CLAIM_DID_NOT_LAND" });
}

// ── Claim ────────────────────────────────────────────────────
/**
 * request: { intent, planId, correlationId, expected: {...}, projectRef? }
 * deps: { planStore, executionStore, collectEvidence, clock?, worker:{id}, audit?, newExecutionId? }
 * A identidade do worker e o relógio vêm SEMPRE de `deps` (servidor).
 */
export async function claimDbReleaseExecution(request, deps = {}) {
  const context = resolveContext(deps, { needsPlan: true });
  if (context.failure) return context.failure;
  const { ctx } = context;

  const validated = validateClaimRequest(request);
  if (validated.failure) return validated.failure;
  const { claim } = validated;

  // 1) Replay idempotente da MESMA tentativa (plano + correlação + ambiente).
  const found = await ctx.store.findExecutionByCorrelation({
    planId: claim.planId,
    correlationId: claim.correlationId,
    environment: claim.expected.environment,
  });
  if (!found.ok) return deny("STORE_UNAVAILABLE");
  if (found.execution) return resolveExistingExecution({ existing: found.execution, claim, ctx });

  // 2) Plano lido do store no instante T (nunca do request).
  const loaded = await readDbReleasePlan(claim.planId, { store: deps.planStore });
  if (!loaded.ok) {
    return deny(loaded.error === "PLAN_NOT_FOUND" ? "PLAN_NOT_FOUND" : "PLAN_STORE_UNAVAILABLE");
  }
  const plan = loaded.plan;

  const statusProblem = checkIntentStatus(plan, claim.intent);
  if (statusProblem) return deny(statusProblem.code, { reasonCode: statusProblem.reasonCode });

  const drift = detectPlanDrift(plan, claim.expected);
  if (drift) return deny(drift.code, { reasonCode: drift.reasonCode });

  // 3) Identidade do ambiente/projeto (derivada no servidor).
  const projectRef = claim.projectRef ?? expectedProjectRefFor(plan.environment);
  const identity = checkBackupIdentity({ environment: plan.environment, projectRef });
  if (!identity.ok) return deny("PROJECT_REF_MISMATCH", { reasonCode: identity.reason });
  const lockKey = buildEnvironmentLockKey({ environment: plan.environment, projectRef });
  if (!lockKey.ok) return deny(lockKey.code);

  // 4) Janela de agenda (agendado) — antes de qualquer evidência.
  if (claim.intent === "SCHEDULED") {
    const window = deriveScheduleWindowGate(plan, { nowMs: ctx.nowMs });
    if (window.status !== "VERIFIED") {
      return deny(SCHEDULE_GATE_TO_CODE[window.status] || "SCHEDULE_INVALID", { reasonCode: window.reasonCode });
    }
  }

  // 5) Política de nova tentativa: só se todas as anteriores foram CANCELED.
  const prior = await ctx.store.listExecutionsForPlan(plan.id);
  if (!prior.ok) return deny("STORE_UNAVAILABLE");
  const blocking = prior.executions.filter((item) => item.status !== "CANCELED");
  if (blocking.length > 0) {
    return deny("PLAN_EXECUTION_EXISTS", { executionIds: blocking.map((item) => item.id) });
  }

  // 6) Revalidação T-time de TODA a evidência CLAIMABLE (servidor).
  let collected;
  try {
    collected = await deps.collectEvidence({ plan, intent: claim.intent, nowMs: ctx.nowMs, projectRef });
  } catch {
    collected = null;
  }
  if (!collected || collected.ok === false || typeof collected !== "object") {
    return deny("EVIDENCE_UNAVAILABLE");
  }
  const gates = deriveClaimableGates({
    plan,
    evidence: collected.evidence,
    gateOverrides: collected.gateOverrides,
    intent: claim.intent,
    nowMs: ctx.nowMs,
  });
  const stage = evaluateStageReadiness({
    stage: "CLAIMABLE",
    gates,
    scheduled: claim.intent === "SCHEDULED",
  });
  if (!stage.satisfied) {
    return deny("CLAIMABLE_NOT_SATISFIED", { stage: stage.stage, blockers: stage.blockers });
  }

  // 7) Claim atômico: lock + execução juntos ou nada.
  const executionId = deps.newExecutionId?.() ?? crypto.randomUUID();
  const claimedAt = toIso(ctx.nowMs);
  const execution = {
    id: executionId,
    planId: plan.id,
    environment: plan.environment,
    projectRef,
    status: EXECUTION_INITIAL_STATUS,
    correlationId: claim.correlationId,
    workerId: ctx.worker,
    claimedAt,
    startedAt: null,
    completedAt: null,
    heartbeatAt: claimedAt,
    leaseGeneration: 1,
    planHash: plan.planHash,
    targetReleaseSha: plan.targetReleaseSha,
    baseSha: plan.baseSha,
    failureCode: null,
    failureMessage: null,
  };
  const lock = {
    lockKey: lockKey.lockKey,
    environment: plan.environment,
    projectRef,
    executionId,
    planId: plan.id,
    workerId: ctx.worker,
    leaseGeneration: 1,
    acquiredAt: claimedAt,
  };

  let result;
  try {
    result = await ctx.store.claimEnvironment({ lock, execution });
  } catch {
    return reconcileAmbiguousClaim({ lock, execution, ctx });
  }

  if (result.ok) {
    return {
      ok: true,
      outcome: "OWNED",
      replay: false,
      executionCreated: true,
      lockAcquired: true,
      // CLAIMABLE ≠ ready: nada aqui autoriza MIGRATING.
      migrationAuthorized: false,
      stage: { name: "CLAIMABLE", satisfied: true, requiredGates: stage.requiredGates },
      globalReady: computeOverallReadiness(gates).ready,
      execution: toPublicExecution(result.execution),
      lock: toPublicLock(result.lock),
      lease: buildLease(result.execution, { nowMs: ctx.nowMs }),
      auditIntents: [],
    };
  }
  if (result.code === "CORRELATION_EXISTS" && result.execution) {
    return resolveExistingExecution({ existing: result.execution, claim, ctx });
  }
  if (result.code === "LOCK_HELD") {
    const holder = result.holder;
    if (holder && holder.planId === claim.planId && holder.correlationId === claim.correlationId) {
      return resolveExistingExecution({ existing: holder, claim, ctx });
    }
    const classification = classifyOwnership({ execution: holder, lock: result.lock, nowMs: ctx.nowMs });
    if (classification.outcome === "OWNED") {
      return deny("LOCK_UNAVAILABLE", {
        outcome: "LOCKED",
        reasonCode: "ENVIRONMENT_LOCKED_BY_ANOTHER_EXECUTION",
        lockKey: lockKey.lockKey,
      });
    }
    return ownershipDenial(classification, { lockKey: lockKey.lockKey });
  }
  if (result.code === "STORE_UNAVAILABLE") return deny("STORE_UNAVAILABLE");
  return reconcileAmbiguousClaim({ lock, execution, ctx });
}

/** Execução imediata: MESMO claim, intenção IMMEDIATE (sem endpoint aqui). */
export function requestImmediateDbReleaseExecution(request, deps) {
  return claimDbReleaseExecution({ ...request, intent: "IMMEDIATE" }, deps);
}

// ── Heartbeat do dono ────────────────────────────────────────
const HEARTBEAT_FORBIDDEN_FIELDS = Object.freeze([
  "planId",
  "planHash",
  "targetReleaseSha",
  "baseSha",
  "environment",
  "projectRef",
  "correlationId",
  "expected",
]);

/**
 * Só o dono atual, na geração atual, de um claim ATIVO, com lease válida.
 * Efeito único: heartbeatAt (relógio do servidor). Nunca muda plano/SHA/
 * ambiente, nunca ressuscita terminal, nunca reassume execução ambígua.
 */
export async function heartbeatDbReleaseExecution(request, deps = {}) {
  const context = resolveContext(deps);
  if (context.failure) return context.failure;
  const { ctx } = context;

  if (!request || typeof request !== "object" || !isUuid(request.executionId)) {
    return deny("CLAIM_REQUEST_INVALID", { reasonCode: "EXECUTION_ID_INVALID" });
  }
  const rejected = [
    ...findClientAuthorityFields(request).filter((key) => key !== "leaseGeneration"),
    ...HEARTBEAT_FORBIDDEN_FIELDS.filter((key) => key in request),
  ];
  if (rejected.length > 0) {
    return deny("HEARTBEAT_BINDING_MUTATION_REJECTED", { fields: rejected });
  }
  if (!Number.isInteger(request.leaseGeneration) || request.leaseGeneration < 1) {
    return deny("LEASE_GENERATION_MISMATCH", { reasonCode: "LEASE_GENERATION_INVALID" });
  }

  const read = await ctx.store.getExecution(request.executionId);
  if (!read.ok) return deny("STORE_UNAVAILABLE");
  const execution = read.execution;
  if (!execution) return deny("EXECUTION_NOT_FOUND");

  const lockKey = buildEnvironmentLockKey({
    environment: execution.environment,
    projectRef: execution.projectRef,
  });
  if (!lockKey.ok) return deny(lockKey.code);
  const lockRead = await ctx.store.readEnvironmentLock(lockKey.lockKey);
  if (!lockRead.ok) return deny("STORE_UNAVAILABLE");

  if (isTerminalExecutionStatus(execution.status)) {
    return deny("EXECUTION_TERMINAL", { outcome: "RECONCILIATION_REQUIRED", requiresReconciliation: Boolean(lockRead.lock) });
  }
  const classification = classifyOwnership({
    execution,
    lock: lockRead.lock,
    expected: { workerId: ctx.worker, leaseGeneration: request.leaseGeneration },
    nowMs: ctx.nowMs,
  });
  if (classification.outcome !== "OWNED" || !isActiveExecutionStatus(execution.status)) {
    return ownershipDenial(classification);
  }

  const previousMs = parseIsoMs(execution.heartbeatAt);
  const nextMs = previousMs != null && previousMs >= ctx.nowMs ? previousMs + 1 : ctx.nowMs;
  const updated = await ctx.store.heartbeatLease({
    executionId: execution.id,
    workerId: ctx.worker,
    leaseGeneration: request.leaseGeneration,
    expectedHeartbeatAt: execution.heartbeatAt,
    heartbeatAt: toIso(nextMs),
  });
  if (!updated.ok) {
    return deny(updated.code === "STORE_UNAVAILABLE" ? "STORE_UNAVAILABLE" : "HEARTBEAT_CONFLICT");
  }
  return {
    ok: true,
    outcome: "OWNED",
    executionCreated: false,
    lockAcquired: false,
    migrationAuthorized: false,
    execution: toPublicExecution(updated.execution),
    lease: buildLease(updated.execution, { nowMs: ctx.nowMs }),
  };
}

// ── Perda de lease → reconciliação obrigatória ───────────────
/**
 * Observador (varredura). Se a lease de um claim ativo expirou, marca a
 * execução RECOVERY_REQUIRED (status canônico) via CAS e emite UM evento
 * DB_RECOVERY_REQUIRED. Não retoma, não repete, não libera lock, não faz
 * takeover — ambíguo bloqueia o ambiente até reconciliação explícita.
 * failureCode distingue pré-mutação de pós-mutação.
 */
export async function flagDbReleaseLeaseLoss(request, deps = {}) {
  const context = resolveContext(deps, { needsWorker: false });
  if (context.failure) return context.failure;
  const { ctx } = context;
  if (!request || !isUuid(request.executionId)) {
    return deny("CLAIM_REQUEST_INVALID", { reasonCode: "EXECUTION_ID_INVALID" });
  }
  const read = await ctx.store.getExecution(request.executionId);
  if (!read.ok) return deny("STORE_UNAVAILABLE");
  const execution = read.execution;
  if (!execution) return deny("EXECUTION_NOT_FOUND");

  if (execution.status === "RECOVERY_REQUIRED") {
    return {
      ok: true,
      flagged: false,
      alreadyFlagged: true,
      outcome: "RECONCILIATION_REQUIRED",
      requiresReconciliation: true,
      autoTakeoverAllowed: false,
      autoRetryAllowed: false,
      auditWritten: false,
    };
  }
  if (!isActiveExecutionStatus(execution.status)) {
    return { ok: true, flagged: false, outcome: "STALE", reasonCode: "EXECUTION_TERMINAL", auditWritten: false };
  }
  const lockKey = buildEnvironmentLockKey({ environment: execution.environment, projectRef: execution.projectRef });
  if (!lockKey.ok) return deny(lockKey.code);
  const lockRead = await ctx.store.readEnvironmentLock(lockKey.lockKey);
  if (!lockRead.ok) return deny("STORE_UNAVAILABLE");

  const classification = classifyOwnership({ execution, lock: lockRead.lock, nowMs: ctx.nowMs });
  if (classification.outcome === "OWNED") {
    return { ok: true, flagged: false, outcome: "OWNED", reasonCode: classification.reasonCode, auditWritten: false };
  }
  const afterMutation = classification.outcome === "AMBIGUOUS";
  const transitioned = await ctx.store.conditionalTransition({
    executionId: execution.id,
    fromStatus: execution.status,
    expectedHeartbeatAt: execution.heartbeatAt,
    patch: {
      status: "RECOVERY_REQUIRED",
      failureCode: afterMutation ? "LEASE_LOST_AFTER_MUTATION" : "LEASE_LOST_PRE_MUTATION",
      failureMessage: "Lease do executor perdida; reconciliação obrigatória, sem retry automático.",
    },
  });
  if (!transitioned.ok) {
    return deny(transitioned.code === "STORE_UNAVAILABLE" ? "STORE_UNAVAILABLE" : "HEARTBEAT_CONFLICT");
  }
  const audit = await emitAudit(deps, {
    eventType: "DB_RECOVERY_REQUIRED",
    planId: execution.planId,
    executionId: execution.id,
    correlationId: execution.correlationId,
    metadata: {
      reasonCode: classification.reasonCode,
      afterMutation,
      autoRetry: false,
    },
  });
  return {
    ok: true,
    flagged: true,
    outcome: afterMutation ? "AMBIGUOUS" : "RECONCILIATION_REQUIRED",
    reasonCode: classification.reasonCode,
    requiresReconciliation: true,
    autoTakeoverAllowed: false,
    autoRetryAllowed: false,
    auditWritten: audit.written,
    execution: toPublicExecution(transitioned.execution),
  };
}

// ── Liberação do lock pelo dono ──────────────────────────────
export async function releaseDbReleaseEnvironmentLock(request, deps = {}) {
  const context = resolveContext(deps);
  if (context.failure) return context.failure;
  const { ctx } = context;
  if (!request || !isUuid(request.executionId) || !Number.isInteger(request.leaseGeneration)) {
    return deny("CLAIM_REQUEST_INVALID", { reasonCode: "RELEASE_REQUEST_INVALID" });
  }
  const read = await ctx.store.getExecution(request.executionId);
  if (!read.ok) return deny("STORE_UNAVAILABLE");
  const execution = read.execution;
  if (!execution) return deny("EXECUTION_NOT_FOUND");
  if (execution.workerId !== ctx.worker) return deny("WORKER_MISMATCH", { outcome: "LOCKED" });
  if (execution.leaseGeneration !== request.leaseGeneration) return deny("LEASE_GENERATION_MISMATCH", { outcome: "STALE" });
  if (!LOCK_RELEASABLE_EXECUTION_STATUSES.includes(execution.status)) {
    return deny("LOCK_RELEASE_NOT_ALLOWED", { reasonCode: `EXECUTION_${execution.status}` });
  }
  const lockKey = buildEnvironmentLockKey({ environment: execution.environment, projectRef: execution.projectRef });
  if (!lockKey.ok) return deny(lockKey.code);
  const released = await ctx.store.releaseLock({
    lockKey: lockKey.lockKey,
    executionId: execution.id,
    workerId: ctx.worker,
    leaseGeneration: request.leaseGeneration,
  });
  if (!released.ok) {
    return deny(released.code === "STORE_UNAVAILABLE" ? "STORE_UNAVAILABLE" : "LOCK_MISMATCH", { reasonCode: released.code });
  }
  return { ok: true, outcome: "OWNED", lockReleased: true, migrationAuthorized: false };
}

// ── Evidência de posse para o readiness (read-only) ──────────
/**
 * Monta `evidence.execution` para deriveGatesFromEvidence. O `expected` é a
 * identidade do PRÓPRIO worker (deps.worker), nunca do cliente.
 */
export async function collectExecutionOwnershipEvidence(request, deps = {}) {
  const context = resolveContext(deps);
  if (context.failure) return { ok: false, errorCode: context.failure.code };
  const { ctx } = context;
  if (!request || !isUuid(request.executionId)) return { ok: false, errorCode: "EXECUTION_ID_INVALID" };
  const expected = {
    executionId: request.executionId,
    workerId: ctx.worker,
    leaseGeneration: request.leaseGeneration ?? null,
    planId: request.planId ?? null,
    environment: request.environment ?? null,
    projectRef: request.projectRef ?? null,
  };
  const key = buildEnvironmentLockKey({
    environment: expected.environment,
    projectRef: expected.projectRef ?? undefined,
  });
  if (!key.ok) return { ok: false, errorCode: key.code };
  const [read, lockRead] = await Promise.all([
    ctx.store.getExecution(request.executionId),
    ctx.store.readEnvironmentLock(key.lockKey),
  ]);
  if (!read.ok || !lockRead.ok) return { ok: false, errorCode: "STORE_UNAVAILABLE" };
  return {
    ok: true,
    evaluatedAt: toIso(ctx.nowMs),
    expected: { ...expected, projectRef: key.projectRef },
    execution: read.execution,
    lock: lockRead.lock,
  };
}
