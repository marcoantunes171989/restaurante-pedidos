// ════════════════════════════════════════════════════════════
//  PDB-I2B — Contrato estático de backup do Production Database
//  Orchestrator.
//
//  Somente constantes congeladas e helpers puros. Sem rede, sem DB,
//  sem processo, sem ambiente de processo, sem segredo, sem executor.
//  Reaproveita BACKUP_STATUSES / DB_ENVIRONMENTS / SHA*_RE do contrato
//  I1A — não redefine listas já existentes.
//
//  Política congelada (I2B0):
//    · estratégia ADAPTIVE; MANAGED_DAILY sozinho NUNCA satisfaz o
//      ponto de backup pré-migration exato;
//    · LOGICAL_SNAPSHOT é o artefato on-demand verificável em L2;
//    · PITR é ponto de recuperação complementar (L1) — nunca L2;
//    · BACKUP_VERIFIED exige L2 de snapshot lógico;
//    · restore é contrato desabilitado; AUTO_BACKUP_RESTORE_READY=false.
// ════════════════════════════════════════════════════════════

import {
  BACKUP_STATUSES,
  DB_ENVIRONMENTS,
  SHA1_RE,
  SHA256_RE,
  isBackupStatus,
  isDbEnvironment,
} from "./db-release-contract.js";
import { HEARTBEAT_INTERVAL_SECONDS } from "./session-admission-contract.js";

export { BACKUP_STATUSES, SHA1_RE, SHA256_RE, isBackupStatus, isDbEnvironment };

export const BACKUP_CONTRACT_VERSION = 1;
export const BACKUP_STRATEGY_CLASS = "ADAPTIVE";

// ── Modos ────────────────────────────────────────────────────
export const BACKUP_MODE = Object.freeze({
  MANAGED_DAILY: "MANAGED_DAILY",
  PITR_RECOVERY_POINT: "PITR_RECOVERY_POINT",
  LOGICAL_SNAPSHOT: "LOGICAL_SNAPSHOT",
  DUAL: "DUAL",
});

export const BACKUP_MODES = Object.freeze(Object.values(BACKUP_MODE));

/** Modos que existem como run persistido. DUAL é estratégia = 2 runs. */
export const BACKUP_RUN_MODES = Object.freeze([
  BACKUP_MODE.MANAGED_DAILY,
  BACKUP_MODE.PITR_RECOVERY_POINT,
  BACKUP_MODE.LOGICAL_SNAPSHOT,
]);

// ── Níveis de verificação ────────────────────────────────────
export const VERIFICATION_LEVEL = Object.freeze({ L1: "L1", L2: "L2", L3: "L3" });
export const VERIFICATION_LEVELS = Object.freeze(["L1", "L2", "L3"]);
export const VERIFICATION_LEVEL_DESCRIPTIONS = Object.freeze({
  L1: "Evidência do provider de que existe backup/ponto de recuperação.",
  L2: "Integridade do artefato: existe, size>0, SHA-256 confere, manifest completo, formato verificado.",
  L3: "Restore rehearsal em ambiente isolado + validação de integridade/aplicação.",
});

/** Nível mínimo para que um run de cada modo possa chegar a VERIFIED. */
export const REQUIRED_LEVEL_FOR_VERIFIED = Object.freeze({
  LOGICAL_SNAPSHOT: "L2",
  PITR_RECOVERY_POINT: "L1",
  MANAGED_DAILY: "L1",
});

/** Único (modo, nível) que satisfaz BACKUP_VERIFIED pré-migration. */
export const PRE_MIGRATION_BACKUP_MODE = BACKUP_MODE.LOGICAL_SNAPSHOT;
export const PRE_MIGRATION_BACKUP_LEVEL = VERIFICATION_LEVEL.L2;

export function verificationLevelRank(level) {
  const index = VERIFICATION_LEVELS.indexOf(level);
  return index === -1 ? 0 : index + 1;
}

// ── Estados (reuso de BACKUP_STATUSES) ───────────────────────
export const BACKUP_STATES = BACKUP_STATUSES;
export const BACKUP_TERMINAL_STATES = Object.freeze(["VERIFIED", "FAILED"]);
export const BACKUP_ACTIVE_STATES = Object.freeze(
  BACKUP_STATUSES.filter((status) => !BACKUP_TERMINAL_STATES.includes(status)),
);

/** Estado inicial por modo. PITR/daily não fingem criação: nascem COMPLETED (evidência). */
export const BACKUP_INITIAL_STATE = Object.freeze({
  LOGICAL_SNAPSHOT: "REQUESTED",
  PITR_RECOVERY_POINT: "COMPLETED",
  MANAGED_DAILY: "COMPLETED",
});

const EVIDENCE_ONLY_EDGES = Object.freeze([
  ["COMPLETED", "VERIFYING"],
  ["VERIFYING", "VERIFIED"],
  ["COMPLETED", "FAILED"],
  ["VERIFYING", "FAILED"],
]);

export const BACKUP_TRANSITIONS = Object.freeze({
  LOGICAL_SNAPSHOT: Object.freeze([
    ["REQUESTED", "RUNNING"],
    ["RUNNING", "COMPLETED"],
    ["COMPLETED", "VERIFYING"],
    ["VERIFYING", "VERIFIED"],
    ["REQUESTED", "FAILED"],
    ["RUNNING", "FAILED"],
    ["COMPLETED", "FAILED"],
    ["VERIFYING", "FAILED"],
  ]),
  PITR_RECOVERY_POINT: EVIDENCE_ONLY_EDGES,
  MANAGED_DAILY: EVIDENCE_ONLY_EDGES,
});

export function isBackupRunMode(value) {
  return BACKUP_RUN_MODES.includes(value);
}

export function isBackupMode(value) {
  return BACKUP_MODES.includes(value);
}

export function isVerificationLevel(value) {
  return VERIFICATION_LEVELS.includes(value);
}

export function isTerminalBackupState(status) {
  return BACKUP_TERMINAL_STATES.includes(status);
}

/**
 * Transição fail-closed. Sem ressurreição: VERIFIED e FAILED são terminais.
 * Nunca há atalho para VERIFIED (só VERIFYING → VERIFIED).
 */
export function validateBackupTransition({ mode, from, to } = {}) {
  if (!isBackupRunMode(mode)) {
    return { ok: false, failureCode: "BACKUP_INPUT_INVALID", reason: "MODE_INVALID" };
  }
  if (!isBackupStatus(from) || !isBackupStatus(to)) {
    return { ok: false, failureCode: "BACKUP_INPUT_INVALID", reason: "STATUS_INVALID" };
  }
  const legal = BACKUP_TRANSITIONS[mode].some(([a, b]) => a === from && b === to);
  if (!legal) {
    return {
      ok: false,
      failureCode: "BACKUP_STATE_TRANSITION_ILLEGAL",
      reason: isTerminalBackupState(from) ? "TERMINAL_STATE" : "EDGE_NOT_ALLOWED",
    };
  }
  return { ok: true, failureCode: null, reason: null };
}

// ── Capabilities ─────────────────────────────────────────────
export const CAPABILITY_UNKNOWN = "UNKNOWN";

export const PROVIDER_CAPABILITIES = Object.freeze([
  "logicalSnapshotSupported",
  "pitrSupported",
  "pitrEnabled",
  "managedDailySupported",
  "physicalBackupSupported",
  "recoveryPointRangeKnown",
  "restorePitrSupported",
  "restoreLogicalSupported",
]);

export const BACKUP_TOOLS = Object.freeze(["supabaseCli", "pgDump", "psql"]);

// ── Freshness ────────────────────────────────────────────────
/**
 * Evidência de provider/capability é evidência RUNTIME: reutiliza o TTL
 * canônico (heartbeat) já usado pelo readiness — nenhuma janela inventada.
 * Vinculação forte (execução/correlação/quiescência) vem de binding, não de TTL.
 */
export const BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS = HEARTBEAT_INTERVAL_SECONDS * 1000;

// ── Identidade de ambiente ───────────────────────────────────
export const PROJECT_REF_RE = /^[a-z]{20}$/;

/** Refs conhecidos (CLAUDE.md). Identificadores, não credenciais. */
export const KNOWN_PROJECT_REFS = Object.freeze({
  HML: "zzixvyspwszewhxzusot",
  PROD: "rwnzggjxhxnfrhstbxkm",
});

export function expectedProjectRefFor(environment) {
  return isDbEnvironment(environment) ? KNOWN_PROJECT_REFS[environment] : null;
}

/**
 * Identidade fail-closed: environment válido + projectRef bem formado +
 * projectRef == ref esperado (config injetada ou ref conhecido do ambiente).
 */
export function checkBackupIdentity({ environment, projectRef, expectedProjectRef } = {}) {
  if (!isDbEnvironment(environment)) {
    return { ok: false, failureCode: "BACKUP_PROJECT_MISMATCH", reason: "ENVIRONMENT_INVALID" };
  }
  if (typeof projectRef !== "string" || !PROJECT_REF_RE.test(projectRef)) {
    return { ok: false, failureCode: "BACKUP_PROJECT_MISMATCH", reason: "PROJECT_REF_INVALID" };
  }
  const expected = expectedProjectRef ?? expectedProjectRefFor(environment);
  if (typeof expected !== "string" || !PROJECT_REF_RE.test(expected)) {
    return { ok: false, failureCode: "BACKUP_PROJECT_MISMATCH", reason: "EXPECTED_PROJECT_REF_INVALID" };
  }
  if (projectRef !== expected) {
    return { ok: false, failureCode: "BACKUP_PROJECT_MISMATCH", reason: "PROJECT_REF_MISMATCH" };
  }
  const otherEnvs = DB_ENVIRONMENTS.filter((env) => env !== environment);
  if (otherEnvs.some((env) => KNOWN_PROJECT_REFS[env] === projectRef)) {
    return { ok: false, failureCode: "BACKUP_PROJECT_MISMATCH", reason: "PROJECT_REF_BELONGS_TO_OTHER_ENVIRONMENT" };
  }
  return { ok: true, failureCode: null, reason: null };
}

// ── Escopo de recuperação ────────────────────────────────────
export const RECOVERY_SCOPES = Object.freeze({
  DATABASE_RECOVERY: "DATABASE_RECOVERY",
  FULL_APPLICATION_ASSET_RECOVERY: "FULL_APPLICATION_ASSET_RECOVERY",
});

/** Backup lógico cobre SOMENTE o banco. Nunca chamar de "backup completo do sistema". */
export const BACKUP_RECOVERY_SCOPE = RECOVERY_SCOPES.DATABASE_RECOVERY;
export const STORAGE_OBJECTS_INCLUDED = false;

// ── Providers (coluna app_backup_runs.provider: ^[A-Z][A-Z0-9_]{1,63}$) ──
export const PROVIDER_BY_MODE = Object.freeze({
  LOGICAL_SNAPSHOT: "PDB_LOGICAL_SNAPSHOT",
  PITR_RECOVERY_POINT: "SUPABASE_PITR",
  MANAGED_DAILY: "SUPABASE_MANAGED_DAILY",
});

export const PROVIDER_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

export function modeForProvider(provider) {
  for (const [mode, name] of Object.entries(PROVIDER_BY_MODE)) {
    if (name === provider) return mode;
  }
  return null;
}

export const PROVIDER_SOURCE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

// ── Falhas tipadas ───────────────────────────────────────────
export const FAILURE_CODES = Object.freeze([
  "BACKUP_CAPABILITY_UNAVAILABLE",
  "BACKUP_CAPABILITY_UNKNOWN",
  "BACKUP_PROJECT_MISMATCH",
  "BACKUP_STRATEGY_UNAVAILABLE",
  "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION",
  "BACKUP_CREATE_FAILED",
  "BACKUP_EXECUTOR_NOT_ENABLED",
  "BACKUP_VERIFY_FAILED",
  "BACKUP_EVIDENCE_MISSING",
  "BACKUP_EVIDENCE_STALE",
  "BACKUP_BINDING_MISSING",
  "BACKUP_CORRELATION_MISMATCH",
  "BACKUP_QUIESCENCE_INVALID",
  "BACKUP_SNAPSHOT_BEFORE_QUIESCENCE",
  "BACKUP_ARTIFACT_MISSING",
  "BACKUP_HASH_MISMATCH",
  "BACKUP_FORMAT_INVALID",
  "BACKUP_MANIFEST_INVALID",
  "BACKUP_INPUT_INVALID",
  "BACKUP_RUN_AMBIGUOUS",
  "BACKUP_STATE_TRANSITION_ILLEGAL",
  "BACKUP_CONFLICT",
  "BACKUP_NOT_FOUND",
  "BACKUP_STORE_UNAVAILABLE",
  "BACKUP_SECRET_MATERIAL",
  "BACKUP_OUTCOME_AMBIGUOUS",
  "CREDENTIAL_AUTHORITY_MISMATCH",
  "PITR_DISABLED",
  "PITR_RANGE_UNKNOWN",
  "PITR_RECOVERY_POINT_STALE",
  "RESTORE_NOT_ENABLED",
  "RESTORE_REHEARSAL_REQUIRED",
]);

export function isBackupFailureCode(value) {
  return FAILURE_CODES.includes(value);
}

export function failure(failureCode, reason = null, extra = {}) {
  return { ok: false, failureCode, reason, ...extra };
}

// ── Restore: hard-disabled ───────────────────────────────────
export const RESTORE_ENABLED = false;
export const AUTO_BACKUP_RESTORE_READY = false;
export const RESTORE_REQUIRES_LEVEL = VERIFICATION_LEVEL.L3;
export const L3_EXECUTABLE = false;

// ── Ambiguidade de criação ───────────────────────────────────
/** Resultado ambíguo de criação: NUNCA retry de mutação; reconcile read-only primeiro. */
export const AMBIGUOUS_CREATE_POLICY = Object.freeze({
  mutationRetryAllowed: false,
  requiredFirstAction: "READ_ONLY_RECONCILE",
  failureCode: "BACKUP_OUTCOME_AMBIGUOUS",
});

// ── Credenciais: somente descritores (nunca valores) ─────────
export const CREDENTIAL_AUTHORITIES = Object.freeze(["BACKUP_READ", "BACKUP_CREATE", "RESTORE"]);

/** Cada operação pertence a exatamente uma autoridade. */
export const OPERATION_AUTHORITY = Object.freeze({
  getCapabilities: "BACKUP_READ",
  prepareBackup: "BACKUP_READ",
  captureRecoveryPoint: "BACKUP_READ",
  getBackupStatus: "BACKUP_READ",
  verifyBackup: "BACKUP_READ",
  getRecoveryPoint: "BACKUP_READ",
  createLogicalSnapshot: "BACKUP_CREATE",
  restore: "RESTORE",
  getRestoreStatus: "RESTORE",
  cancelRestore: "RESTORE",
});

export function credentialRefName(authority, environment) {
  if (!CREDENTIAL_AUTHORITIES.includes(authority) || !isDbEnvironment(environment)) return null;
  return `PDB_${environment}_${authority}_CREDENTIAL`;
}

export const CREDENTIAL_REF_RE = /^PDB_(HML|PROD)_(BACKUP_READ|BACKUP_CREATE|RESTORE)_CREDENTIAL$/;

/**
 * Descritor de credencial: só o NOME de referência. O valor nunca é lido,
 * copiado nem serializado por este módulo. Browser jamais recebe.
 */
export function describeCredential(authority, environment) {
  const refName = credentialRefName(authority, environment);
  if (!refName) return null;
  return Object.freeze({
    authority,
    environment,
    projectRef: expectedProjectRefFor(environment),
    refName,
    serverOnly: true,
    browserAllowed: false,
    valueIncluded: false,
  });
}

export function assertCredentialAuthority(descriptor, operation, { environment } = {}) {
  const required = OPERATION_AUTHORITY[operation];
  if (!required) {
    return failure("BACKUP_INPUT_INVALID", "OPERATION_UNKNOWN");
  }
  if (!descriptor || descriptor.authority !== required) {
    return failure("CREDENTIAL_AUTHORITY_MISMATCH", "AUTHORITY_MISMATCH");
  }
  if (descriptor.browserAllowed !== false || descriptor.serverOnly !== true) {
    return failure("CREDENTIAL_AUTHORITY_MISMATCH", "BROWSER_EXPOSURE");
  }
  if (!isDbEnvironment(descriptor.environment)
    || (environment != null && descriptor.environment !== environment)) {
    return failure("CREDENTIAL_AUTHORITY_MISMATCH", "ENVIRONMENT_MISMATCH");
  }
  if (descriptor.refName !== credentialRefName(descriptor.authority, descriptor.environment)) {
    return failure("CREDENTIAL_AUTHORITY_MISMATCH", "REF_NAME_MISMATCH");
  }
  return { ok: true, failureCode: null, reason: null };
}

// ── Detecção de material secreto (fail-closed) ───────────────
const SECRET_KEY_RE = /token|secret|passw(or)?d|authorization|apikey|api_key|service.?role|bearer|private.?key|connection.?string|conn.?str|database.?url|db.?url|\bdsn\b|\bpat\b/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/;
const CONN_URL_WITH_CREDS_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;
const PROVIDER_TOKEN_RE = /\b(sbp_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/;
const AUTH_HEADER_RE = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const INLINE_PASSWORD_RE = /(?:^|[\s?&;,])(?:password|pwd|passwd)\s*=\s*\S+/i;

export function stringLooksSecret(value) {
  if (typeof value !== "string") return false;
  return JWT_RE.test(value)
    || CONN_URL_WITH_CREDS_RE.test(value)
    || PROVIDER_TOKEN_RE.test(value)
    || AUTH_HEADER_RE.test(value)
    || INLINE_PASSWORD_RE.test(value);
}

/** Varre chaves e strings, em profundidade. Retorna caminhos suspeitos (nunca valores). */
export function findSecretMaterial(value, path = "$", found = [], depth = 0) {
  if (depth > 12) {
    found.push(`${path}:DEPTH`);
    return found;
  }
  if (typeof value === "string") {
    if (stringLooksSecret(value)) found.push(path);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretMaterial(item, `${path}[${index}]`, found, depth + 1));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) found.push(`${path}.${key}`);
      findSecretMaterial(child, `${path}.${key}`, found, depth + 1);
    }
  }
  return found;
}

export function containsSecretMaterial(value) {
  return findSecretMaterial(value).length > 0;
}

// ── Helpers de tempo/UUID ────────────────────────────────────
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseIsoMs(value) {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function toIso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Binding canônico exigido para reuso de evidência de backup. */
export const BACKUP_BINDING_FIELDS = Object.freeze([
  "planId",
  "executionId",
  "correlationId",
  "targetReleaseSha",
  "environment",
  "projectRef",
  "quiescenceAt",
]);

export function validateBackupBinding(binding) {
  if (!binding || typeof binding !== "object") {
    return failure("BACKUP_BINDING_MISSING", "BINDING_ABSENT");
  }
  if (!isUuid(binding.planId)) return failure("BACKUP_BINDING_MISSING", "PLAN_ID_INVALID");
  if (!isUuid(binding.executionId)) return failure("BACKUP_BINDING_MISSING", "EXECUTION_ID_INVALID");
  if (!isUuid(binding.correlationId)) return failure("BACKUP_BINDING_MISSING", "CORRELATION_ID_INVALID");
  if (!SHA1_RE.test(binding.targetReleaseSha || "")) {
    return failure("BACKUP_BINDING_MISSING", "TARGET_RELEASE_SHA_INVALID");
  }
  const identity = checkBackupIdentity({
    environment: binding.environment,
    projectRef: binding.projectRef,
  });
  if (!identity.ok) return failure(identity.failureCode, identity.reason);
  if (parseIsoMs(binding.quiescenceAt) == null) {
    return failure("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_INVALID");
  }
  return { ok: true, failureCode: null, reason: null };
}

/** Compara dois bindings; devolve os campos divergentes (timestamps por instante). */
export function diffBackupBinding(actual, expected) {
  const diff = [];
  for (const field of BACKUP_BINDING_FIELDS) {
    if (field === "quiescenceAt") {
      if (parseIsoMs(actual?.[field]) !== parseIsoMs(expected?.[field])) diff.push(field);
    } else if ((actual?.[field] ?? null) !== (expected?.[field] ?? null)) {
      diff.push(field);
    }
  }
  return diff;
}
