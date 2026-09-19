// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Lease do executor + classificação de ownership + adapters
//  de readiness (LOCK_ACQUIRED / EXECUTOR_HEALTHY).
//
//  Puro: sem fetch, sem ambiente de processo, sem DB, sem timer.
//  Relógio sempre injetado (nowMs). Nunca é lido um relógio de cliente.
//
//  Regras invariantes:
//   • lease expirada NUNCA é revivida por heartbeat nem "roubada";
//   • expirar antes de estágio mutante → STALE (reconciliação exigida);
//   • expirar em/após estágio potencialmente mutante → AMBIGUOUS
//     (RECONCILIATION_REQUIRED, sem retry automático);
//   • sem takeover automático em nenhum caso.
// ════════════════════════════════════════════════════════════

import {
  EXECUTOR_HEARTBEAT_INTERVAL_SECONDS,
  EXECUTOR_LEASE_TTL_SECONDS,
  isPotentiallyMutatingExecutionStatus,
  isTerminalExecutionStatus,
} from "./db-release-executor-contract.js";
import { parseIsoMs, toIso } from "./db-backup-contract.js";

/** Freshness de evidência runtime = cadência de heartbeat (igual ao readiness). */
export const EXECUTION_EVIDENCE_FRESHNESS_MS = EXECUTOR_HEARTBEAT_INTERVAL_SECONDS * 1000;

export function leaseExpiresAtMs(heartbeatAt, ttlSeconds = EXECUTOR_LEASE_TTL_SECONDS) {
  const heartbeatMs = typeof heartbeatAt === "number" ? heartbeatAt : parseIsoMs(heartbeatAt);
  if (!Number.isFinite(heartbeatMs) || !(ttlSeconds > 0)) return null;
  return heartbeatMs + ttlSeconds * 1000;
}

/** Expirada quando expiresAt <= now (mesma convenção de isCanonicalSessionAlive). */
export function isLeaseExpired(heartbeatAt, nowMs, ttlSeconds = EXECUTOR_LEASE_TTL_SECONDS) {
  const expiresMs = leaseExpiresAtMs(heartbeatAt, ttlSeconds);
  if (expiresMs == null || !Number.isFinite(nowMs)) return true;
  return expiresMs <= nowMs;
}

/**
 * Lease conceitual: workerId, executionId, leaseGeneration, heartbeatAt,
 * leaseExpiresAt, status. Sem valores secretos.
 */
export function buildLease(execution, { nowMs, ttlSeconds = EXECUTOR_LEASE_TTL_SECONDS } = {}) {
  if (!execution || typeof execution !== "object") return null;
  const expiresMs = leaseExpiresAtMs(execution.heartbeatAt, ttlSeconds);
  let status = "ACTIVE";
  if (isTerminalExecutionStatus(execution.status)) status = "ENDED";
  else if (expiresMs == null || expiresMs <= nowMs) status = "EXPIRED";
  return {
    workerId: execution.workerId ?? null,
    executionId: execution.id ?? null,
    leaseGeneration: execution.leaseGeneration ?? null,
    heartbeatAt: execution.heartbeatAt ?? null,
    leaseExpiresAt: toIso(expiresMs),
    status,
  };
}

function outcome(kind, reasonCode, extra = {}) {
  return {
    outcome: kind,
    reasonCode,
    requiresReconciliation: extra.requiresReconciliation === true,
    autoTakeoverAllowed: false,
    autoRetryAllowed: false,
  };
}

/**
 * Classifica a posse de um execution/lock num instante T.
 *  expected (opcional): { workerId, leaseGeneration } do CHAMADOR. Sem ele o
 *  classificador age como observador (varredura/reconciliação).
 * Ordem: reconciliação pendente → terminal segurando lock → lease expirada →
 * consistência do lock → identidade do chamador.
 */
export function classifyOwnership({ execution, lock, expected = null, nowMs } = {}) {
  if (!execution) {
    return lock
      ? outcome("RECONCILIATION_REQUIRED", "LOCK_WITHOUT_EXECUTION", { requiresReconciliation: true })
      : outcome("STALE", "EXECUTION_NOT_FOUND");
  }
  if (execution.status === "RECOVERY_REQUIRED" || execution.reconciliationRequired === true) {
    return outcome("RECONCILIATION_REQUIRED", "RECONCILIATION_REQUIRED", { requiresReconciliation: true });
  }
  if (isTerminalExecutionStatus(execution.status)) {
    return lock
      ? outcome("RECONCILIATION_REQUIRED", "LOCK_HELD_BY_TERMINAL_EXECUTION", { requiresReconciliation: true })
      : outcome("STALE", "EXECUTION_TERMINAL");
  }
  if (isLeaseExpired(execution.heartbeatAt, nowMs)) {
    return isPotentiallyMutatingExecutionStatus(execution.status)
      ? outcome("AMBIGUOUS", "LEASE_EXPIRED_AFTER_MUTATION", { requiresReconciliation: true })
      : outcome("STALE", "LEASE_EXPIRED_PRE_MUTATION", { requiresReconciliation: true });
  }
  if (!lock) {
    return outcome("RECONCILIATION_REQUIRED", "LOCK_MISSING", { requiresReconciliation: true });
  }
  if (
    lock.executionId !== execution.id
    || lock.workerId !== execution.workerId
    || lock.leaseGeneration !== execution.leaseGeneration
    || lock.environment !== execution.environment
    || lock.projectRef !== execution.projectRef
  ) {
    return outcome("RECONCILIATION_REQUIRED", "LOCK_BINDING_MISMATCH", { requiresReconciliation: true });
  }
  if (expected) {
    if (expected.workerId !== execution.workerId) return outcome("LOCKED", "HELD_BY_OTHER_WORKER");
    if (expected.leaseGeneration != null && expected.leaseGeneration !== execution.leaseGeneration) {
      return outcome("STALE", "LEASE_GENERATION_MISMATCH");
    }
  }
  return outcome("OWNED", "LEASE_VALID");
}

// ── Adapters de readiness ────────────────────────────────────
// Evidência (montada no servidor pelo claim service, read-only):
//   evidence.execution = {
//     ok, evaluatedAt,
//     expected: { executionId, workerId, leaseGeneration, planId, environment, projectRef },
//     execution: <record>|null,
//     lock: <lock>|null,
//   }
// Ausente → [] (o placeholder UNKNOWN de deriveUnimplementedGates permanece).

function gate(key, status, reasonCode, message, evidenceAtMs, expiresAtMs) {
  return {
    key,
    status,
    reasonCode,
    message,
    evidenceAt: toIso(evidenceAtMs),
    expiresAt: toIso(expiresAtMs),
  };
}

function runtimeGate(key, status, reasonCode, message, nowMs) {
  return gate(key, status, reasonCode, message, nowMs, nowMs + EXECUTION_EVIDENCE_FRESHNESS_MS);
}

function unavailable(key, evidence, nowMs) {
  if (!evidence || evidence.ok !== true) {
    return runtimeGate(
      key,
      "UNKNOWN",
      evidence?.errorCode || "EXECUTION_EVIDENCE_UNAVAILABLE",
      "Evidência de execução/lock indisponível.",
      nowMs,
    );
  }
  const expected = evidence.expected;
  if (!expected || !expected.executionId || !expected.workerId) {
    return runtimeGate(key, "UNKNOWN", "EXECUTION_EXPECTATION_MISSING", "Identidade esperada do worker ausente.", nowMs);
  }
  return null;
}

function statusForOutcome(classification) {
  switch (classification.outcome) {
    case "STALE":
      return "STALE";
    case "OWNED":
      return "VERIFIED";
    default:
      return "BLOCKED";
  }
}

function boundExecution(evidence) {
  const { expected, execution } = evidence;
  if (!execution) return false;
  return execution.id === expected.executionId
    && (expected.planId == null || execution.planId === expected.planId)
    && (expected.environment == null || execution.environment === expected.environment)
    && (expected.projectRef == null || execution.projectRef === expected.projectRef);
}

export function deriveLockAcquiredGate(evidence, { nowMs } = {}) {
  const key = "LOCK_ACQUIRED";
  const missing = unavailable(key, evidence, nowMs);
  if (missing) return missing;
  const { expected, execution, lock } = evidence;

  if (!lock) {
    return runtimeGate(key, "PENDING", "LOCK_NOT_ACQUIRED", "Lock exclusivo do ambiente ainda não adquirido.", nowMs);
  }
  if (lock.executionId !== expected.executionId || lock.workerId !== expected.workerId) {
    return runtimeGate(key, "BLOCKED", "LOCK_OWNER_MISMATCH", "Lock do ambiente pertence a outra execução/worker.", nowMs);
  }
  if (
    (expected.environment != null && lock.environment !== expected.environment)
    || (expected.projectRef != null && lock.projectRef !== expected.projectRef)
    || (expected.planId != null && lock.planId !== expected.planId)
    || (expected.leaseGeneration != null && lock.leaseGeneration !== expected.leaseGeneration)
  ) {
    return runtimeGate(key, "BLOCKED", "LOCK_BINDING_MISMATCH", "Lock não corresponde a ambiente/projeto/plano/geração esperados.", nowMs);
  }
  if (!execution) {
    return runtimeGate(key, "BLOCKED", "LOCK_WITHOUT_EXECUTION", "Lock sem execução correspondente (órfão).", nowMs);
  }
  if (!boundExecution(evidence)) {
    return runtimeGate(key, "BLOCKED", "EXECUTION_BINDING_MISMATCH", "Execução não corresponde ao binding esperado.", nowMs);
  }
  const classification = classifyOwnership({ execution, lock, expected, nowMs });
  const status = statusForOutcome(classification);
  if (status !== "VERIFIED") {
    return runtimeGate(key, status, classification.reasonCode, "Lock não está sob posse válida desta execução.", nowMs);
  }
  const leaseEnd = leaseExpiresAtMs(execution.heartbeatAt);
  return gate(
    key,
    "VERIFIED",
    "LOCK_ACQUIRED",
    "Execução atual detém o lock do ambiente com lease válida.",
    nowMs,
    Math.min(leaseEnd, nowMs + EXECUTION_EVIDENCE_FRESHNESS_MS),
  );
}

export function deriveExecutorHealthyGate(evidence, { nowMs } = {}) {
  const key = "EXECUTOR_HEALTHY";
  const missing = unavailable(key, evidence, nowMs);
  if (missing) return missing;
  const { expected, execution, lock } = evidence;

  if (!execution) {
    return runtimeGate(key, "PENDING", "EXECUTOR_NOT_STARTED", "Sem execução: executor não iniciou.", nowMs);
  }
  if (execution.id !== expected.executionId || execution.workerId !== expected.workerId) {
    return runtimeGate(key, "BLOCKED", "EXECUTOR_OWNERSHIP_MISMATCH", "Execução pertence a outro worker.", nowMs);
  }
  if (expected.leaseGeneration != null && execution.leaseGeneration !== expected.leaseGeneration) {
    return runtimeGate(key, "BLOCKED", "LEASE_GENERATION_MISMATCH", "Geração de lease diverge da esperada.", nowMs);
  }
  const classification = classifyOwnership({ execution, lock, expected, nowMs });
  const status = statusForOutcome(classification);
  if (status !== "VERIFIED") {
    return runtimeGate(key, status, classification.reasonCode, "Heartbeat/ownership do executor não está íntegro.", nowMs);
  }
  const leaseEnd = leaseExpiresAtMs(execution.heartbeatAt);
  return gate(
    key,
    "VERIFIED",
    "EXECUTOR_HEALTHY",
    "Worker dono da execução com heartbeat fresco e geração correta.",
    nowMs,
    Math.min(leaseEnd, nowMs + EXECUTION_EVIDENCE_FRESHNESS_MS),
  );
}

export function deriveExecutionGates(evidence, { nowMs } = {}) {
  if (evidence === undefined || evidence === null) return [];
  return [
    deriveLockAcquiredGate(evidence, { nowMs }),
    deriveExecutorHealthyGate(evidence, { nowMs }),
  ];
}
