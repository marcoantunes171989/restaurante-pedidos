// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Contrato estático do claim / lock exclusivo / lease do
//  executor do Production Database Orchestrator.
//
//  Somente constantes congeladas e helpers puros. Sem rede, sem DB, sem
//  segredo, sem timer. Reutiliza o vocabulário da migration 160
//  (EXECUTION_STATUSES, DB_ENVIRONMENTS, eventos) — nenhum status novo.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import {
  DB_ENVIRONMENTS,
  EXECUTION_STATUSES,
  isDbEnvironment,
  isExecutionStatus,
} from "./db-release-contract.js";
import {
  checkBackupIdentity,
  containsSecretMaterial,
  expectedProjectRefFor,
  isUuid,
} from "./db-backup-contract.js";

export { DB_ENVIRONMENTS, EXECUTION_STATUSES, isDbEnvironment, isExecutionStatus, isUuid };

export const EXECUTOR_CONTRACT_VERSION = 1;

// ── Intenção de execução ─────────────────────────────────────
/** Scheduled e immediate convergem no MESMO claim (I2C1 §33). */
export const CLAIM_INTENTS = Object.freeze(["IMMEDIATE", "SCHEDULED"]);

export function isClaimIntent(value) {
  return CLAIM_INTENTS.includes(value);
}

// ── Status de execução (vocabulário da migration 160) ────────
/** Status inicial de um claim: reservado, nada iniciou. */
export const EXECUTION_INITIAL_STATUS = "REQUESTED";

/**
 * Status que SOMENTE o executor pode gravar (I2C1 §29). Browser/API nunca.
 * REQUESTED (criado pelo claim) e CANCELED ficam fora: não avançam pipeline.
 */
export const EXECUTOR_OWNED_EXECUTION_STATUSES = Object.freeze([
  "PREPARING",
  "DRAINING",
  "BACKING_UP",
  "MIGRATING",
  "VERIFYING",
  "SUCCEEDED",
  "FAILED",
  "RECOVERY_REQUIRED",
]);

/** Claim ativo: lease pode ser renovada. */
export const ACTIVE_EXECUTION_STATUSES = Object.freeze([
  "REQUESTED",
  "PREPARING",
  "DRAINING",
  "BACKING_UP",
  "MIGRATING",
  "VERIFYING",
]);

export const TERMINAL_EXECUTION_STATUSES = Object.freeze(["SUCCEEDED", "FAILED", "CANCELED"]);

/**
 * Antes de qualquer estágio potencialmente mutante. DRAINING já fecha login
 * gate / write fence (mutação de estado de manutenção), então só REQUESTED e
 * PREPARING são "pré-mutação".
 */
export const PRE_MUTATION_EXECUTION_STATUSES = Object.freeze(["REQUESTED", "PREPARING"]);

export const POTENTIALLY_MUTATING_EXECUTION_STATUSES = Object.freeze([
  "DRAINING",
  "BACKING_UP",
  "MIGRATING",
  "VERIFYING",
  "RECOVERY_REQUIRED",
]);

/**
 * Só estes status liberam o lock de ambiente. FAILED/RECOVERY_REQUIRED
 * seguram o lock até reconciliação (o banco pode ter sido mutado).
 */
export const LOCK_RELEASABLE_EXECUTION_STATUSES = Object.freeze(["SUCCEEDED", "CANCELED"]);

export function isExecutorOwnedExecutionStatus(status) {
  return EXECUTOR_OWNED_EXECUTION_STATUSES.includes(status);
}

export function isActiveExecutionStatus(status) {
  return ACTIVE_EXECUTION_STATUSES.includes(status);
}

export function isTerminalExecutionStatus(status) {
  return TERMINAL_EXECUTION_STATUSES.includes(status);
}

export function isPotentiallyMutatingExecutionStatus(status) {
  return POTENTIALLY_MUTATING_EXECUTION_STATUSES.includes(status);
}

// ── Resultados canônicos ─────────────────────────────────────
/** Ownership (I2C1 §25). Ambiguidade bloqueia progresso. */
export const OWNERSHIP_OUTCOMES = Object.freeze([
  "OWNED",
  "LOCKED",
  "STALE",
  "AMBIGUOUS",
  "RECONCILIATION_REQUIRED",
]);

export const CLAIM_OUTCOMES = Object.freeze([
  ...OWNERSHIP_OUTCOMES,
  "DENIED",
  "ALREADY_CLAIMED",
]);

export const CLAIM_FAILURE_CODES = Object.freeze([
  "CLAIM_DEPENDENCY_MISSING",
  "CLAIM_REQUEST_INVALID",
  "CLIENT_AUTHORITY_FIELD_REJECTED",
  "CLAIM_INTENT_INVALID",
  "WORKER_ID_INVALID",
  "CORRELATION_ID_INVALID",
  "ENVIRONMENT_INVALID",
  "PROJECT_REF_MISMATCH",
  "PLAN_NOT_FOUND",
  "PLAN_STORE_UNAVAILABLE",
  "PLAN_STATUS_INVALID",
  "INTENT_STATUS_MISMATCH",
  "PLAN_DRIFT",
  "MIGRATION_IDENTITY_DRIFT",
  "APPROVAL_STALE",
  "SCHEDULE_INVALID",
  "SCHEDULE_NOT_DUE",
  "SCHEDULE_WINDOW_EXPIRED",
  "EVIDENCE_UNAVAILABLE",
  "CLAIMABLE_NOT_SATISFIED",
  "PLAN_EXECUTION_EXISTS",
  "LOCK_UNAVAILABLE",
  "EXECUTION_OWNED_BY_OTHER_WORKER",
  "EXECUTION_CREATE_FAILED",
  "ORPHAN_LOCK",
  "ORPHAN_EXECUTION",
  "CLAIM_OUTCOME_UNKNOWN",
  "STORE_UNAVAILABLE",
  "EXECUTION_NOT_FOUND",
  "EXECUTION_TERMINAL",
  "WORKER_MISMATCH",
  "LEASE_GENERATION_MISMATCH",
  "LEASE_EXPIRED",
  "LOCK_MISMATCH",
  "HEARTBEAT_CONFLICT",
  "HEARTBEAT_BINDING_MUTATION_REJECTED",
  "LOCK_RELEASE_NOT_ALLOWED",
]);

export function isClaimFailureCode(value) {
  return CLAIM_FAILURE_CODES.includes(value);
}

/**
 * Campos que o cliente/browser NUNCA pode fornecer como autoridade
 * (I2C1 §12, §29, §7): ownership, status, timestamps, gates, classificação.
 */
export const FORBIDDEN_CLIENT_AUTHORITY_FIELDS = Object.freeze([
  "status",
  "executionStatus",
  "executorStatus",
  "createdBy",
  "executorId",
  "workerId",
  "lockOwner",
  "leaseGeneration",
  "leaseExpiresAt",
  "heartbeatAt",
  "claimedAt",
  "nowMs",
  "now",
  "clientTime",
  "gates",
  "ready",
  "readiness",
  "classification",
  "schemaSafety",
  "safety",
  "evidence",
]);

export function findClientAuthorityFields(request, { extra = [] } = {}) {
  if (!request || typeof request !== "object") return [];
  const forbidden = new Set([...FORBIDDEN_CLIENT_AUTHORITY_FIELDS, ...extra]);
  const found = [];
  for (const key of Object.keys(request)) {
    if (forbidden.has(key)) found.push(key);
  }
  const expected = request.expected;
  if (expected && typeof expected === "object") {
    for (const key of Object.keys(expected)) {
      if (forbidden.has(key)) found.push(`expected.${key}`);
    }
  }
  return found;
}

// ── Lease / heartbeat ────────────────────────────────────────
/**
 * Não existe heartbeat de executor DB preexistente. Precedentes reutilizados:
 *  - heartbeat canônico de plataforma: 45s (ACCESS_HEARTBEAT_MS, sessão);
 *  - TTL "vivo" canônico: 120s (ACCESS_PRESENCE.ONLINE_MS), igual ao timeout
 *    de recuperação do executor de releases (STALE_VALIDATING_MS = 2 min).
 * Ratio 120/45 ≈ 2.67 ≥ MIN_TTL_RATIO(2): tolera 1 heartbeat perdido + jitter
 * e ainda detecta worker morto em ≤ 2 min. Literais explícitos (não import)
 * para que mudar a sessão não altere silenciosamente a lease do executor;
 * um teste ancora os valores nos precedentes.
 */
export const EXECUTOR_HEARTBEAT_INTERVAL_SECONDS = 45;
export const EXECUTOR_LEASE_TTL_SECONDS = 120;
export const EXECUTOR_LEASE_RATIO = EXECUTOR_LEASE_TTL_SECONDS / EXECUTOR_HEARTBEAT_INTERVAL_SECONDS;
export const EXECUTOR_LEASE_RATIONALE =
  "heartbeat=45s (cadência canônica de plataforma); lease=120s (TTL 'vivo' canônico = timeout de recuperação do executor de releases); ratio 2.67 tolera 1 heartbeat perdido + jitter e detecta worker morto em <= 2 min. Nenhum takeover automático após expirar.";

export const LEASE_STATUSES = Object.freeze(["ACTIVE", "EXPIRED", "ENDED"]);

/**
 * Janela de claim de um plano SCHEDULED: [scheduledAt, scheduledAt + janela).
 * Passada a janela o plano não é mais claimable (fail-closed): uma migration
 * atrasada por indisponibilidade do scheduler não pode disparar sozinha em
 * horário fora do combinado — exige novo agendamento humano. 15 min cobre a
 * granularidade de um scheduler por minuto + retries curtos, e é explícita.
 */
export const SCHEDULE_CLAIM_WINDOW_MS = 15 * 60_000;

// ── Lock de ambiente ─────────────────────────────────────────
export const LOCK_NAMESPACE = "DB_RELEASE";

/**
 * Chave determinística e ligada a ambiente + projeto. O lock protege o
 * BANCO alvo, não um plano: `plan id` nunca entra na chave.
 */
export function buildEnvironmentLockKey({ environment, projectRef } = {}) {
  if (!isDbEnvironment(environment)) {
    return { ok: false, code: "ENVIRONMENT_INVALID" };
  }
  const ref = projectRef ?? expectedProjectRefFor(environment);
  const identity = checkBackupIdentity({ environment, projectRef: ref });
  if (!identity.ok) return { ok: false, code: "PROJECT_REF_MISMATCH", reason: identity.reason };
  return { ok: true, lockKey: `${LOCK_NAMESPACE}:${environment}:${ref}`, projectRef: ref };
}

// ── Identidade de worker ─────────────────────────────────────
const WORKER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/** Espelha app_db_release_executions_executor_id_check (migration 160). */
const WORKER_ID_SECRET_RE = /(secret|token|bearer|password|authorization|service_role)/i;

export function validateWorkerId(value) {
  if (typeof value !== "string" || !WORKER_ID_RE.test(value)) return { ok: false };
  if (WORKER_ID_SECRET_RE.test(value) || containsSecretMaterial(value)) return { ok: false };
  return { ok: true, workerId: value };
}

// ── Correlação determinística de tentativa agendada ──────────
/**
 * UUID v5-like derivado de (plano, hash, agenda, geração, tentativa): a
 * mesma tentativa agendada sempre produz a MESMA correlação (idempotência do
 * scheduler); nova tentativa exige `attempt` novo.
 */
export function deriveScheduledAttemptCorrelationId({
  planId,
  planHash,
  scheduledAt,
  readinessGeneration,
  attempt = 1,
} = {}) {
  const material = [
    "pdb-i2c1-scheduled-attempt",
    planId,
    planHash,
    scheduledAt,
    readinessGeneration,
    attempt,
  ].join("|");
  const hex = crypto.createHash("sha256").update(material, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Correlação nova de uma tentativa imediata (gerada no servidor). */
export function newAttemptCorrelationId() {
  return crypto.randomUUID();
}
