// ════════════════════════════════════════════════════════════
//  PDB-I1C1 — Agregação server-authoritative de readiness DB.
//
//  Módulo puro: sem fetch, sem ambiente de processo, sem DB, sem segredo.
//  I/O fica em server/db-release-readiness-store.js.
//  O frontend nunca calcula "ready" — só consome este snapshot.
// ════════════════════════════════════════════════════════════

import { HEARTBEAT_INTERVAL_SECONDS, isActiveSessionCountZero } from "./session-admission-contract.js";
import {
  ALWAYS_REQUIRED_READINESS_GATES,
  CANONICAL_READINESS_GATES,
  CONDITIONAL_READINESS_GATES,
  READINESS_APPLICABILITY,
  REQUIRED_READINESS_GATES,
  SHA1_RE,
  isCanonicalReadinessGate,
  isLoginGateState,
  isMaintenancePhase,
  isReadinessGateStatus,
} from "./db-release-contract.js";
import { frozenPlanIdentity } from "./db-release-plan-hash.js";
import { isSafetyEvidenceBound } from "./db-migration-safety.js";
import { expectedProjectRefFor } from "./db-backup-contract.js";
import { evaluateBackupEvidenceForReadiness } from "./db-backup-verification.js";
import { deriveExecutionGates } from "./db-release-executor-lease.js";
import { evaluateWriteFenceCoverage } from "./db-release-write-fence-coverage.js";

export const READINESS_EVIDENCE_VERSION = 1;

/** TTL de evidência runtime: heartbeat canônico de sessão (45s), não um TTL inventado. */
export const RUNTIME_EVIDENCE_FRESHNESS_MS = HEARTBEAT_INTERVAL_SECONDS * 1000;

export const SNAPSHOT_FRESHNESS_MS = RUNTIME_EVIDENCE_FRESHNESS_MS;

export const GATE_FRESHNESS_KIND = Object.freeze({
  GIT_SHA_MATCH: "static_sha",
  HML_VALIDATED: "generation_bound",
  PROD_BASELINE_VERIFIED: "baseline_generation",
  MIGRATION_SET_FROZEN: "static_sha",
  MIGRATION_IDENTITY_VERIFIED: "static_sha",
  SCHEMA_SAFETY_PASS: "static_sha",
  NO_DML: "static_sha",
  NO_DESTRUCTIVE_DDL: "static_sha",
  BACKUP_VERIFIED: "execution_bound",
  LOGIN_GATE_CLOSED: "runtime",
  ACTIVE_SESSION_COUNT_ZERO: "runtime",
  IN_FLIGHT_OPERATION_COUNT_ZERO: "runtime",
  WRITE_FENCE_ACTIVE: "runtime",
  EXECUTOR_HEALTHY: "runtime",
  LOCK_ACQUIRED: "runtime",
  HUMAN_APPROVAL_VALID: "plan_generation",
  SCHEDULE_WINDOW_VALID: "execution_bound",
});

export const WRITE_FENCE_PHASES = Object.freeze([
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "BACKING_UP",
  "MIGRATING",
]);

export const BLOCKING_GATE_STATUSES = Object.freeze([
  "PENDING",
  "BLOCKED",
  "FAILED",
  "UNKNOWN",
  "STALE",
]);

const STATUS_SEVERITY = Object.freeze({
  VERIFIED: 0,
  PENDING: 1,
  UNKNOWN: 2,
  STALE: 3,
  BLOCKED: 4,
  FAILED: 5,
});

const SECRET_KEY_RE = /token|secret|password|authorization|apikey|api_key|service.?role|bearer|private.?key/i;
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const CANONICAL_BY_KEY = Object.freeze(
  Object.fromEntries(CANONICAL_READINESS_GATES.map((gate) => [gate.key, gate])),
);

function isoFromMs(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function parseTimeMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanMessage(value, max = 240) {
  if (value == null) return null;
  const text = String(value).trim().slice(0, max);
  if (!text) return null;
  if (SECRET_KEY_RE.test(text) || JWT_RE.test(text)) return null;
  return text;
}

function cleanReasonCode(value) {
  if (typeof value !== "string") return "EVIDENCE_UNKNOWN";
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 80);
  return code || "EVIDENCE_UNKNOWN";
}

export function isBlockingStatus(status) {
  return BLOCKING_GATE_STATUSES.includes(status);
}

export function isWriteFencePhase(phase) {
  return WRITE_FENCE_PHASES.includes(phase);
}

export function gateSatisfiesReadiness(gate) {
  if (!gate || gate.applicable === false) return true;
  if (gate.required === false) return true;
  return gate.status === "VERIFIED";
}

export function worstStatus(statuses) {
  let worst = "VERIFIED";
  let worstScore = -1;
  for (const status of statuses) {
    if (!isReadinessGateStatus(status)) continue;
    const score = STATUS_SEVERITY[status] ?? -1;
    if (score > worstScore) {
      worst = status;
      worstScore = score;
    }
  }
  return worst;
}

export function normalizeGate(input = {}) {
  const key = isCanonicalReadinessGate(input.key) ? input.key : null;
  const meta = key ? CANONICAL_BY_KEY[key] : null;
  const status = isReadinessGateStatus(input.status) ? input.status : "UNKNOWN";
  const applicable = input.applicable !== false && meta?.applicability
    ? meta.applicability === READINESS_APPLICABILITY.ALWAYS || input.applicable === true
    : Boolean(input.applicable);
  const evidenceAt = isoFromMs(parseTimeMs(input.evidenceAt) ?? null);
  const expiresAt = isoFromMs(parseTimeMs(input.expiresAt ?? input.freshUntil) ?? null);
  return {
    key: key || (typeof input.key === "string" ? input.key.slice(0, 80) : "UNKNOWN_GATE"),
    status: key ? status : "UNKNOWN",
    required: meta ? meta.required : input.required !== false,
    applicable: meta ? applicable : false,
    reasonCode: cleanReasonCode(input.reasonCode),
    message: cleanMessage(input.message),
    evidenceAt,
    expiresAt,
    freshUntil: expiresAt,
    freshness: GATE_FRESHNESS_KIND[key] || null,
  };
}

export function evaluateSnapshotFreshness({ evaluatedAt, nowMs = Date.now(), stale = false } = {}) {
  if (stale === true) {
    return { stale: true, reasonCode: "SNAPSHOT_STALE" };
  }
  const evaluatedMs = parseTimeMs(evaluatedAt);
  if (!Number.isFinite(evaluatedMs)) {
    return { stale: true, reasonCode: "SNAPSHOT_EVALUATED_AT_MISSING" };
  }
  if (nowMs - evaluatedMs > SNAPSHOT_FRESHNESS_MS) {
    return { stale: true, reasonCode: "SNAPSHOT_STALE" };
  }
  return { stale: false, reasonCode: null };
}

export function applyGateFreshness(gate, nowMs = Date.now()) {
  const normalized = normalizeGate(gate);
  if (normalized.status !== "VERIFIED") return normalized;
  const kind = GATE_FRESHNESS_KIND[normalized.key];
  if (kind === "static_sha") {
    return { ...normalized, expiresAt: null, freshUntil: null };
  }
  const untilMs = parseTimeMs(normalized.expiresAt);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
    return {
      ...normalized,
      status: "STALE",
      reasonCode: "EVIDENCE_STALE",
      message: normalized.message || "Evidência vencida ou sem validade explícita.",
    };
  }
  return normalized;
}

function duplicateKeys(gates) {
  const seen = new Set();
  const dupes = new Set();
  for (const gate of gates) {
    if (!gate?.key) continue;
    if (seen.has(gate.key)) dupes.add(gate.key);
    else seen.add(gate.key);
  }
  return dupes;
}

export function assembleCanonicalGates(partialGates = [], { scheduled = false, nowMs = Date.now() } = {}) {
  const dupes = duplicateKeys(partialGates.filter((gate) => isCanonicalReadinessGate(gate?.key)));
  const byKey = new Map();
  for (const partial of partialGates) {
    if (!isCanonicalReadinessGate(partial?.key)) continue;
    if (byKey.has(partial.key)) continue;
    byKey.set(partial.key, partial);
  }

  return CANONICAL_READINESS_GATES.map((meta) => {
    const applicable = meta.applicability === READINESS_APPLICABILITY.ALWAYS
      || (meta.applicability === READINESS_APPLICABILITY.SCHEDULED && scheduled === true);
    const partial = byKey.get(meta.key);
    if (dupes.has(meta.key)) {
      return applyGateFreshness({
        key: meta.key,
        status: "FAILED",
        required: meta.required,
        applicable,
        reasonCode: "DUPLICATE_GATE_KEY",
        message: "Chave de gate duplicada na evidência.",
        evidenceAt: isoFromMs(nowMs),
        expiresAt: isoFromMs(nowMs + RUNTIME_EVIDENCE_FRESHNESS_MS),
      }, nowMs);
    }
    if (!applicable) {
      return normalizeGate({
        key: meta.key,
        status: partial?.status && partial.status !== "VERIFIED" ? partial.status : "PENDING",
        required: meta.required,
        applicable: false,
        reasonCode: partial?.reasonCode || "GATE_NOT_APPLICABLE",
        message: partial?.message || "Gate condicional não aplicável nesta avaliação.",
        evidenceAt: partial?.evidenceAt || isoFromMs(nowMs),
        expiresAt: null,
      });
    }
    if (!partial) {
      return applyGateFreshness({
        key: meta.key,
        status: "UNKNOWN",
        required: meta.required,
        applicable: true,
        reasonCode: "MISSING_GATE_EVIDENCE",
        message: "Gate canônico ausente na evidência.",
        evidenceAt: isoFromMs(nowMs),
        expiresAt: isoFromMs(nowMs + RUNTIME_EVIDENCE_FRESHNESS_MS),
      }, nowMs);
    }
    return applyGateFreshness({
      ...partial,
      key: meta.key,
      required: meta.required,
      applicable: true,
    }, nowMs);
  });
}

export function computeOverallReadiness(gates, { stale = false } = {}) {
  if (stale) {
    return { ready: false, overallStatus: "STALE" };
  }
  const applicable = gates.filter((gate) => gate.applicable !== false && gate.required !== false);
  const ready = applicable.length > 0
    && applicable.every((gate) => gate.status === "VERIFIED")
    && applicable.length === ALWAYS_REQUIRED_READINESS_GATES.length
      + (gates.some((gate) => gate.key === "SCHEDULE_WINDOW_VALID" && gate.applicable) ? 1 : 0);
  if (ready) return { ready: true, overallStatus: "READY" };
  return {
    ready: false,
    overallStatus: worstStatus(applicable.map((gate) => gate.status)),
  };
}

function unimplementedGate(key, reasonCode, message, status = "UNKNOWN") {
  return {
    key,
    status,
    reasonCode,
    message,
  };
}

function runtimeVerified(key, reasonCode, message, evidenceAtMs) {
  return {
    key,
    status: "VERIFIED",
    reasonCode,
    message,
    evidenceAt: isoFromMs(evidenceAtMs),
    expiresAt: isoFromMs(evidenceAtMs + RUNTIME_EVIDENCE_FRESHNESS_MS),
  };
}

function runtimeGate(key, status, reasonCode, message, evidenceAtMs) {
  return {
    key,
    status,
    reasonCode,
    message,
    evidenceAt: isoFromMs(evidenceAtMs),
    expiresAt: isoFromMs((evidenceAtMs || Date.now()) + RUNTIME_EVIDENCE_FRESHNESS_MS),
  };
}

export function deriveGitGates(git, { releaseSha, nowMs } = {}) {
  const evaluatedAt = parseTimeMs(git?.evaluatedAt) ?? nowMs;
  if (!git || git.ok !== true) {
    return [runtimeGate(
      "GIT_SHA_MATCH",
      "UNKNOWN",
      git?.errorCode || "GITHUB_UNAVAILABLE",
      "Evidência Git indisponível.",
      evaluatedAt,
    )];
  }
  const observedReleaseSha = SHA1_RE.test(git.releaseSha || "") ? git.releaseSha : null;
  const requested = SHA1_RE.test(releaseSha || "") ? releaseSha : null;
  if (git.drift === true || (requested && observedReleaseSha && requested !== observedReleaseSha)) {
    return [runtimeGate(
      "GIT_SHA_MATCH",
      "BLOCKED",
      "SHA_DRIFT",
      "SHA de release divergiu da evidência Git.",
      evaluatedAt,
    )];
  }
  if (!observedReleaseSha) {
    return [runtimeGate(
      "GIT_SHA_MATCH",
      "UNKNOWN",
      "RELEASE_SHA_MISSING",
      "SHA de release ausente na evidência Git.",
      evaluatedAt,
    )];
  }
  if (requested && requested === observedReleaseSha) {
    return [{
      key: "GIT_SHA_MATCH",
      status: "VERIFIED",
      reasonCode: "GIT_SHA_MATCHED",
      message: "SHA de release coincide com a evidência Git.",
      evidenceAt: isoFromMs(evaluatedAt),
      expiresAt: null,
    }];
  }
  return [runtimeGate(
    "GIT_SHA_MATCH",
    "PENDING",
    "RELEASE_SHA_NOT_FROZEN",
    "SHA observado, mas nenhum SHA congelado foi informado.",
    evaluatedAt,
  )];
}

export function deriveMaintenanceGates(maintenance, { nowMs } = {}) {
  const evaluatedAt = parseTimeMs(maintenance?.evaluatedAt) ?? nowMs;
  if (!maintenance || maintenance.ok !== true) {
    const code = maintenance?.errorCode || "MAINTENANCE_STATE_UNAVAILABLE";
    return [
      runtimeGate("LOGIN_GATE_CLOSED", "UNKNOWN", code, "Estado de manutenção indisponível.", evaluatedAt),
      runtimeGate("WRITE_FENCE_ACTIVE", "UNKNOWN", code, "Estado de manutenção indisponível.", evaluatedAt),
    ];
  }
  const loginGate = maintenance.loginGate;
  const loginGateGate = isLoginGateState(loginGate)
    ? loginGate === "CLOSED"
      ? runtimeVerified("LOGIN_GATE_CLOSED", "LOGIN_GATE_CLOSED", "Login gate fechado.", evaluatedAt, nowMs)
      : runtimeGate("LOGIN_GATE_CLOSED", "BLOCKED", "LOGIN_GATE_OPEN", "Login gate aberto.", evaluatedAt)
    : runtimeGate("LOGIN_GATE_CLOSED", "UNKNOWN", "LOGIN_GATE_MISSING", "Login gate ausente ou inválido.", evaluatedAt);

  const phase = maintenance.phase;
  let fenceGate;
  if (!isMaintenancePhase(phase)) {
    fenceGate = runtimeGate("WRITE_FENCE_ACTIVE", "UNKNOWN", "MAINTENANCE_PHASE_INVALID", "Phase de manutenção inválida.", evaluatedAt);
  } else if (!isWriteFencePhase(phase) || !maintenance.fenceEffectiveAt) {
    fenceGate = runtimeGate("WRITE_FENCE_ACTIVE", "BLOCKED", "WRITE_FENCE_INACTIVE", "Write fence não está ativo.", evaluatedAt);
  } else {
    // PDB-I2C2 — fence ativo por phase NÃO basta: todo caminho de escrita
    // requerido precisa estar coberto (evidência de cobertura completa).
    const coverage = evaluateWriteFenceCoverage(maintenance.writeFenceCoverage, { nowMs });
    if (coverage.complete) {
      fenceGate = runtimeVerified("WRITE_FENCE_ACTIVE", "WRITE_FENCE_ACTIVE", "Write fence ativo com cobertura completa de escrita.", evaluatedAt, nowMs);
    } else {
      fenceGate = runtimeGate(
        "WRITE_FENCE_ACTIVE",
        coverage.uncovered.length === 0 ? "UNKNOWN" : "BLOCKED",
        coverage.reasonCode,
        "Write fence ativo, mas a cobertura dos caminhos de escrita não está completa.",
        evaluatedAt,
      );
    }
  }
  return [loginGateGate, fenceGate];
}

export function deriveSessionZeroGate(session, { nowMs, maintenance = null, requireGeneration = false } = {}) {
  const evaluatedAt = parseTimeMs(session?.evaluatedAt) ?? nowMs;
  if (!session || session.ok !== true || session.unavailable === true) {
    return runtimeGate(
      "ACTIVE_SESSION_COUNT_ZERO",
      "UNKNOWN",
      session?.errorCode || "SESSION_ZERO_PROOF_UNAVAILABLE",
      "Prova canônica de session-zero indisponível.",
      evaluatedAt,
    );
  }
  const alive = Number(session.aliveSessionCount);
  const heartbeatAfterClose = Number(session.heartbeatAfterGateCloseCount);
  if (!Number.isFinite(alive) || !Number.isFinite(heartbeatAfterClose)) {
    return runtimeGate(
      "ACTIVE_SESSION_COUNT_ZERO",
      "UNKNOWN",
      "SESSION_ZERO_PROOF_INVALID",
      "Prova canônica de session-zero incompleta.",
      evaluatedAt,
    );
  }
  // PDB-I2C2 — a prova precisa pertencer à geração ATUAL da manutenção.
  const hasMaintenance = maintenance?.ok === true;
  const proofEpoch = session.maintenanceEpoch;
  const proofGeneration = session.maintenanceGeneration;
  const proofHasGeneration = Number.isInteger(proofEpoch) && Number.isInteger(proofGeneration);
  if (hasMaintenance && requireGeneration && !proofHasGeneration) {
    return runtimeGate(
      "ACTIVE_SESSION_COUNT_ZERO",
      "UNKNOWN",
      "SESSION_PROOF_GENERATION_MISSING",
      "Prova de session-zero sem epoch/generation da manutenção.",
      evaluatedAt,
    );
  }
  if (hasMaintenance && proofHasGeneration
    && (proofEpoch !== maintenance.epoch || proofGeneration !== maintenance.version)) {
    return runtimeGate(
      "ACTIVE_SESSION_COUNT_ZERO",
      "STALE",
      "SESSION_PROOF_GENERATION_MISMATCH",
      "Prova de session-zero pertence a outra geração da manutenção.",
      evaluatedAt,
    );
  }
  if (isActiveSessionCountZero({
    aliveSessionCount: alive,
    heartbeatAfterGateCloseCount: heartbeatAfterClose,
  })) {
    return runtimeVerified(
      "ACTIVE_SESSION_COUNT_ZERO",
      "ACTIVE_SESSION_COUNT_ZERO",
      "Prova canônica confirma zero sessões vivas.",
      evaluatedAt,
      nowMs,
    );
  }
  return runtimeGate(
    "ACTIVE_SESSION_COUNT_ZERO",
    "BLOCKED",
    alive > 0 ? "ALIVE_SESSIONS_PRESENT" : "HEARTBEAT_AFTER_GATE_CLOSE",
    "Prova canônica não confirma session-zero.",
    evaluatedAt,
  );
}

export function deriveInFlightGate(inFlight, { nowMs } = {}) {
  const evaluatedAt = parseTimeMs(inFlight?.evaluatedAt) ?? nowMs;
  if (!inFlight || inFlight.ok !== true) {
    return runtimeGate(
      "IN_FLIGHT_OPERATION_COUNT_ZERO",
      "UNKNOWN",
      inFlight?.errorCode || "IN_FLIGHT_REGISTRY_UNAVAILABLE",
      "Registry de operações em voo indisponível.",
      evaluatedAt,
    );
  }
  const count = Number(inFlight.inFlightCount);
  if (Number.isFinite(count) && count > 0) {
    return runtimeGate(
      "IN_FLIGHT_OPERATION_COUNT_ZERO",
      "BLOCKED",
      "IN_FLIGHT_OPERATIONS_PRESENT",
      "Há operações em voo no registry de manutenção.",
      evaluatedAt,
    );
  }
  // PDB-I2C2 — zero só é AUTORITATIVO com contagem inteira e cobertura
  // completa do registry. "Nenhuma linha" de um registry parcial não prova nada.
  if (count === 0 && inFlight.coverageComplete === true) {
    return runtimeVerified(
      "IN_FLIGHT_OPERATION_COUNT_ZERO",
      "IN_FLIGHT_ZERO_AUTHORITATIVE",
      "Registry de operações com cobertura completa e zero operações em voo.",
      evaluatedAt,
      nowMs,
    );
  }
  return runtimeGate(
    "IN_FLIGHT_OPERATION_COUNT_ZERO",
    "UNKNOWN",
    "IN_FLIGHT_COVERAGE_INCOMPLETE",
    "Coverage de in-flight ainda não é autoritativa.",
    evaluatedAt,
  );
}

export function deriveUnimplementedGates({ omitKeys = [] } = {}) {
  const omit = new Set(omitKeys);
  return [
    unimplementedGate("HML_VALIDATED", "HML_VALIDATION_UNIMPLEMENTED", "Validação HML ainda não implementada."),
    unimplementedGate("PROD_BASELINE_VERIFIED", "PROD_BASELINE_UNIMPLEMENTED", "Baseline PROD ainda não implementada."),
    unimplementedGate("MIGRATION_SET_FROZEN", "MIGRATION_SET_UNIMPLEMENTED", "Congelamento do set de migrations ainda não implementado."),
    unimplementedGate("MIGRATION_IDENTITY_VERIFIED", "MIGRATION_IDENTITY_UNIMPLEMENTED", "Identidade de migrations ainda não implementada."),
    unimplementedGate("SCHEMA_SAFETY_PASS", "SCHEMA_SAFETY_UNIMPLEMENTED", "Validador de schema ainda não implementado."),
    unimplementedGate("NO_DML", "SCHEMA_SAFETY_UNIMPLEMENTED", "Prova NO_DML exige evidência explícita de schema safety."),
    unimplementedGate("NO_DESTRUCTIVE_DDL", "SCHEMA_SAFETY_UNIMPLEMENTED", "Prova NO_DESTRUCTIVE_DDL exige evidência explícita de schema safety."),
    unimplementedGate("HUMAN_APPROVAL_VALID", "HUMAN_APPROVAL_PENDING", "Aprovação humana plan/generation-specific ainda não existe.", "PENDING"),
    unimplementedGate("EXECUTOR_HEALTHY", "EXECUTOR_UNIMPLEMENTED", "Executor DB ainda não implementado."),
    unimplementedGate("LOCK_ACQUIRED", "LOCK_UNIMPLEMENTED", "Lock de execução DB ainda não implementado."),
    unimplementedGate("SCHEDULE_WINDOW_VALID", "SCHEDULE_WINDOW_UNIMPLEMENTED", "Janela de schedule ainda não implementada."),
  ].filter((gate) => !omit.has(gate.key));
}

function planStaticGate(key, status, reasonCode, message, evidenceAtMs) {
  return {
    key,
    status,
    reasonCode,
    message,
    evidenceAt: isoFromMs(evidenceAtMs),
    expiresAt: null,
  };
}

function planGenerationGate(key, status, reasonCode, message, evidenceAtMs) {
  return {
    key,
    status,
    reasonCode,
    message,
    evidenceAt: isoFromMs(evidenceAtMs),
    expiresAt: isoFromMs(evidenceAtMs + RUNTIME_EVIDENCE_FRESHNESS_MS),
  };
}

function planIdentityMatches(plan) {
  if (!plan || plan.ok !== true) return false;
  if (!Array.isArray(plan.migrations) || plan.migrations.length === 0) return false;
  const frozen = frozenPlanIdentity({
    environment: plan.environment,
    targetReleaseSha: plan.targetReleaseSha,
    baseSha: plan.baseSha,
    migrations: plan.migrations,
  });
  return frozen.ok === true && frozen.planHash === plan.planHash;
}

export function derivePlanGates(plan, { nowMs = Date.now() } = {}) {
  if (!plan || plan.absent === true) return [];
  const evaluatedAt = parseTimeMs(plan.evaluatedAt) ?? nowMs;
  if (plan.ok !== true) {
    const code = plan.errorCode || "PLAN_EVIDENCE_UNAVAILABLE";
    return [
      planStaticGate("MIGRATION_SET_FROZEN", "UNKNOWN", code, "Evidência de plano indisponível.", evaluatedAt),
      planStaticGate("MIGRATION_IDENTITY_VERIFIED", "UNKNOWN", code, "Evidência de plano indisponível.", evaluatedAt),
      planGenerationGate("HUMAN_APPROVAL_VALID", "UNKNOWN", code, "Evidência de plano indisponível.", evaluatedAt),
    ];
  }

  const frozenOk = plan.status !== "DRAFT" && planIdentityMatches(plan);
  const frozenStatus = plan.status === "DRAFT"
    ? "PENDING"
    : (frozenOk ? "VERIFIED" : "BLOCKED");
  const frozenReason = plan.status === "DRAFT"
    ? "MIGRATION_SET_NOT_FROZEN"
    : (frozenOk ? "MIGRATION_IDENTITY_FROZEN" : "PLAN_HASH_MISMATCH");
  const frozenMessage = plan.status === "DRAFT"
    ? "Plano ainda em DRAFT — identidade não congelada."
    : (frozenOk
      ? "Identidade de migrations congelada no plano."
      : "Identidade congelada ausente ou divergente do plan_hash.");

  const approvalBound = frozenOk
    // RUNNING: a aprovação já foi consumida pelo claim/executor (só o
    // executor grava RUNNING) e continua vinculada ao mesmo plan_hash.
    && (plan.status === "APPROVED" || plan.status === "SCHEDULED" || plan.status === "RUNNING")
    && Boolean(plan.approvedAt)
    && Boolean(plan.approvedBy);
  const approvalStatus = approvalBound ? "VERIFIED" : "PENDING";
  const approvalReason = approvalBound ? "HUMAN_APPROVAL_BOUND" : "HUMAN_APPROVAL_PENDING";
  const approvalMessage = approvalBound
    ? "Aprovação humana amarrada ao plan_hash congelado."
    : "Aprovação humana plan/generation-specific pendente.";

  const gates = [
    planStaticGate("MIGRATION_SET_FROZEN", frozenStatus, frozenReason, frozenMessage, evaluatedAt),
    planStaticGate("MIGRATION_IDENTITY_VERIFIED", frozenStatus, frozenReason, frozenMessage, evaluatedAt),
    planGenerationGate("HUMAN_APPROVAL_VALID", approvalStatus, approvalReason, approvalMessage, evaluatedAt),
  ];
  if (plan.status === "SCHEDULED") {
    gates.push(planGenerationGate(
      "SCHEDULE_WINDOW_VALID",
      "PENDING",
      "SCHEDULE_INTENT_RECORDED",
      "Timestamp de agenda persistido. Executor de janela ainda não existe.",
      evaluatedAt,
    ));
  }
  return gates;
}

export function deriveSchemaSafetyGates(safety, { nowMs = Date.now(), plan = null } = {}) {
  if (!safety || safety.absent === true) return [];
  const evaluatedAt = parseTimeMs(safety.evaluatedAt) ?? nowMs;
  if (safety.ok !== true) {
    const code = safety.errorCode || "SCHEMA_SAFETY_EVIDENCE_UNAVAILABLE";
    return [
      planStaticGate("SCHEMA_SAFETY_PASS", "UNKNOWN", code, "Evidência de schema safety indisponível.", evaluatedAt),
      planStaticGate("NO_DML", "UNKNOWN", code, "Evidência de schema safety indisponível.", evaluatedAt),
      planStaticGate("NO_DESTRUCTIVE_DDL", "UNKNOWN", code, "Evidência de schema safety indisponível.", evaluatedAt),
    ];
  }
  const bound = isSafetyEvidenceBound(safety, {
    planHash: plan?.planHash || safety.planHash || null,
    identities: plan?.migrations || null,
  });
  if (!bound.bound) {
    const stale = bound.reasonCode === "SCHEMA_SAFETY_EVIDENCE_MISSING" ? "UNKNOWN" : "STALE";
    return [
      planStaticGate("SCHEMA_SAFETY_PASS", stale, bound.reasonCode, "Evidência de schema safety ausente ou stale.", evaluatedAt),
      planStaticGate("NO_DML", stale, bound.reasonCode, "Evidência de schema safety ausente ou stale.", evaluatedAt),
      planStaticGate("NO_DESTRUCTIVE_DDL", stale, bound.reasonCode, "Evidência de schema safety ausente ou stale.", evaluatedAt),
    ];
  }

  const dmlOk = Number(safety.dmlCount || 0) === 0;
  const destructiveOk = Number(safety.destructiveDdlCount || 0) === 0;
  const dmlGate = planStaticGate(
    "NO_DML",
    dmlOk ? "VERIFIED" : "FAILED",
    dmlOk ? "NO_DML" : "DML_PRESENT",
    dmlOk ? "Analisador não encontrou DML top-level/executado." : "DML top-level ou executado na migration.",
    evaluatedAt,
  );
  const destructiveGate = planStaticGate(
    "NO_DESTRUCTIVE_DDL",
    destructiveOk ? "VERIFIED" : "FAILED",
    destructiveOk ? "NO_DESTRUCTIVE_DDL" : "DESTRUCTIVE_DDL_PRESENT",
    destructiveOk ? "Analisador não encontrou DDL destrutivo." : "DDL destrutivo presente.",
    evaluatedAt,
  );

  if (safety.hasProhibited === true || safety.overallClassification === "PROHIBITED") {
    return [
      planStaticGate(
        "SCHEMA_SAFETY_PASS",
        "FAILED",
        "SCHEMA_SAFETY_PROHIBITED",
        "Analisador classificou a migration set como PROHIBITED.",
        evaluatedAt,
      ),
      dmlGate,
      destructiveGate,
    ];
  }
  if (safety.requiresReview === true || safety.overallClassification === "REVIEW_REQUIRED" || safety.allSafe !== true) {
    return [
      planStaticGate(
        "SCHEMA_SAFETY_PASS",
        "PENDING",
        "SCHEMA_REVIEW_REQUIRED",
        "REVIEW_REQUIRED não verifica SCHEMA_SAFETY_PASS para execução automática.",
        evaluatedAt,
      ),
      dmlGate,
      destructiveGate,
    ];
  }
  return [
    planStaticGate(
      "SCHEMA_SAFETY_PASS",
      "VERIFIED",
      "SCHEMA_SAFETY_PASS",
      "Set classificado SAFE_AUTO com identidade e validator version válidos.",
      evaluatedAt,
    ),
    dmlGate,
    destructiveGate,
  ];
}

/**
 * PDB-I2B — BACKUP_VERIFIED a partir de evidência explícita e READ-ONLY.
 * Só snapshot lógico VERIFIED em L2, vinculado a plano/execução/correlação/
 * quiescência, satisfaz. PITR L1 e managed daily nunca. Sem adapter → UNKNOWN.
 */
export function deriveBackupGates(backup, {
  nowMs = Date.now(),
  plan = null,
  binding = null,
  maintenance = null,
} = {}) {
  const evaluatedAt = parseTimeMs(backup?.evaluatedAt) ?? nowMs;
  const planOk = plan?.ok === true && plan.id && plan.environment;
  const expected = planOk && binding
    ? {
      planId: plan.id,
      environment: plan.environment,
      targetReleaseSha: plan.targetReleaseSha,
      projectRef: binding.projectRef ?? expectedProjectRefFor(plan.environment),
      executionId: binding.executionId ?? null,
      correlationId: binding.correlationId ?? null,
      quiescenceAt: binding.quiescenceAt ?? null,
    }
    : null;
  let outcome = evaluateBackupEvidenceForReadiness(backup, expected);
  if (outcome.status === "VERIFIED" && maintenance?.ok === true) {
    const observedQuiescence = parseTimeMs(maintenance.quiescentAt);
    const expectedQuiescence = parseTimeMs(expected?.quiescenceAt);
    if (observedQuiescence != null && expectedQuiescence != null && observedQuiescence !== expectedQuiescence) {
      outcome = {
        status: "STALE",
        reasonCode: "BACKUP_EVIDENCE_STALE",
        message: "Quiescência atual difere da quiescência do backup — evidência vencida.",
      };
    }
  }
  return [planGenerationGate("BACKUP_VERIFIED", outcome.status, outcome.reasonCode, outcome.message, evaluatedAt)];
}

export function deriveGatesFromEvidence(evidence = {}, context = {}) {
  const nowMs = Number.isFinite(context.nowMs) ? context.nowMs : Date.now();
  const scheduled = context.scheduled === true;
  const planGates = derivePlanGates(evidence.plan, { nowMs });
  const safetyGates = deriveSchemaSafetyGates(evidence.schemaSafety, { nowMs, plan: evidence.plan });
  const backupGates = deriveBackupGates(evidence.backup, {
    nowMs,
    plan: evidence.plan,
    binding: evidence.backupBinding,
    maintenance: evidence.maintenance,
  });
  // PDB-I2C1: LOCK_ACQUIRED / EXECUTOR_HEALTHY só saem de evidência de posse
  // real (lock + lease). Sem evidence.execution o placeholder UNKNOWN permanece.
  const executionGates = deriveExecutionGates(evidence.execution, { nowMs });
  const partial = [
    ...deriveGitGates(evidence.git, { releaseSha: context.releaseSha, nowMs }),
    ...deriveMaintenanceGates(evidence.maintenance, { nowMs }),
    deriveSessionZeroGate(evidence.sessionZero, {
      nowMs,
      maintenance: evidence.maintenance,
      requireGeneration: context.requireSessionGeneration === true,
    }),
    deriveInFlightGate(evidence.inFlight, { nowMs }),
    ...planGates,
    ...safetyGates,
    ...backupGates,
    ...executionGates,
    ...deriveUnimplementedGates({
      omitKeys: [...planGates, ...safetyGates, ...backupGates, ...executionGates].map((gate) => gate.key),
    }),
  ];
  if (Array.isArray(evidence.overrides)) {
    partial.push(...evidence.overrides);
  }
  return assembleCanonicalGates(partial, { scheduled, nowMs });
}

function pickSha(value) {
  return SHA1_RE.test(value || "") ? value : null;
}

export function sanitizeValue(value, key = "") {
  if (SECRET_KEY_RE.test(key)) return undefined;
  if (typeof value === "string" && JWT_RE.test(value)) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const sanitized = sanitizeValue(childValue, childKey);
      if (sanitized !== undefined) out[childKey] = sanitized;
    }
    return out;
  }
  return value;
}

export function sanitizeReadinessSnapshot(snapshot) {
  return sanitizeValue(snapshot) || failClosedSnapshot({ nowMs: Date.now() });
}

export function failClosedSnapshot({
  nowMs = Date.now(),
  releaseSha = null,
  baseSha = null,
  planId = null,
  scheduled = false,
  reasonCode = "READINESS_EVALUATION_FAILED",
  message = "Avaliação de readiness falhou fechada.",
} = {}) {
  const evaluatedAt = isoFromMs(nowMs);
  const gates = assembleCanonicalGates(
    REQUIRED_READINESS_GATES.map((key) => ({
      key,
      status: "UNKNOWN",
      reasonCode,
      message,
      evidenceAt: evaluatedAt,
      expiresAt: isoFromMs(nowMs + RUNTIME_EVIDENCE_FRESHNESS_MS),
    })),
    { scheduled, nowMs },
  );
  return sanitizeReadinessSnapshot({
    ready: false,
    overallStatus: "UNKNOWN",
    evaluatedAt,
    evidenceVersion: READINESS_EVIDENCE_VERSION,
    generation: null,
    releaseSha: pickSha(releaseSha),
    baseSha: pickSha(baseSha),
    planId: planId || null,
    scheduled: scheduled === true,
    stale: false,
    gates,
  });
}

export function buildReadinessSnapshot({
  evidence = {},
  releaseSha = null,
  baseSha = null,
  planId = null,
  scheduled = false,
  generation = null,
  nowMs = Date.now(),
  stale = false,
} = {}) {
  const evaluatedAt = isoFromMs(nowMs);
  const freshness = evaluateSnapshotFreshness({ evaluatedAt, nowMs, stale });
  const gates = deriveGatesFromEvidence(evidence, { releaseSha, scheduled, nowMs });
  const overall = computeOverallReadiness(gates, { stale: freshness.stale });
  const git = evidence.git || {};
  return sanitizeReadinessSnapshot({
    ready: overall.ready,
    overallStatus: overall.overallStatus,
    evaluatedAt,
    evidenceVersion: READINESS_EVIDENCE_VERSION,
    generation: Number.isInteger(generation)
      ? generation
      : (Number.isInteger(evidence.maintenance?.version) ? evidence.maintenance.version : null),
    releaseSha: pickSha(releaseSha) || pickSha(git.releaseSha),
    baseSha: pickSha(baseSha) || pickSha(git.baseSha),
    planId: planId || null,
    scheduled: scheduled === true,
    stale: freshness.stale,
    gates,
  });
}

export {
  ALWAYS_REQUIRED_READINESS_GATES,
  CANONICAL_READINESS_GATES,
  CONDITIONAL_READINESS_GATES,
  REQUIRED_READINESS_GATES,
};
