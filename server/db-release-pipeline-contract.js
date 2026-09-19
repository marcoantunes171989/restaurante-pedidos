// ════════════════════════════════════════════════════════════
//  PDB-I2C2 — Contrato estático do PIPELINE de execução de release DB.
//
//  Só constantes congeladas, portas (nomes de método), adapters DESABILITADOS
//  por padrão e helpers puros. Sem rede, sem DB, sem ambiente, sem timer.
//  Nenhum status novo: reutiliza EXECUTION_STATUSES / MAINTENANCE_PHASES /
//  EXECUTION_STEP_TYPES da migration 160.
// ════════════════════════════════════════════════════════════

import { SELECTED_ALIVE_TTL_SECONDS } from "./session-admission-contract.js";
import { isLiveAuthoritativeCoverage } from "./db-release-write-fence-coverage.js";

export const PIPELINE_CONTRACT_VERSION = 1;

// ── Transportes ──────────────────────────────────────────────
/** DISABLED = padrão do repositório; SYNTHETIC = fakes de teste; LIVE = I2D+. */
export const PORT_TRANSPORTS = Object.freeze(["DISABLED", "SYNTHETIC", "LIVE"]);

// ── Timeout de drain ─────────────────────────────────────────
/**
 * Maior TTL de operação do Operation Registry (migration 154,
 * app_maintenance_operation_begin_internal: ONBOARDING = 180s; demais 120s).
 */
export const MAX_OPERATION_TTL_SECONDS = 180;
/**
 * Drain natural = sessão viva expira em <= 120s (TTL canônico) E a operação
 * mais longa expira em <= 180s. Somando (pior caso sequencial) = 300s. Não há
 * razão para esperar mais que o que a expiração natural explica; passou disso
 * é sintoma (sessão/operação presa) e o pipeline PARA em vez de esperar.
 */
export const DRAIN_TIMEOUT_SECONDS = MAX_OPERATION_TTL_SECONDS + SELECTED_ALIVE_TTL_SECONDS;
export const DRAIN_TIMEOUT_MS = DRAIN_TIMEOUT_SECONDS * 1000;
export const DRAIN_TIMEOUT_MIN_MS = 60_000;
export const DRAIN_TIMEOUT_MAX_MS = 15 * 60_000;
export const DRAIN_TIMEOUT_RATIONALE =
  "300s = TTL máximo de operação do registry (180s, ONBOARDING) + TTL canônico de sessão (120s). Configurável em [60s, 900s]; fora disso volta ao padrão. Estourou → nunca segue para backup.";
/** Dica (não é timer) de reinvocação enquanto o drain espera. */
export const DRAIN_POLL_HINT_MS = 15_000;

export function resolveDrainTimeoutMs(policy) {
  const value = policy?.drainTimeoutMs;
  if (Number.isFinite(value) && value >= DRAIN_TIMEOUT_MIN_MS && value <= DRAIN_TIMEOUT_MAX_MS) return value;
  return DRAIN_TIMEOUT_MS;
}

/** Espera mínima de NOTICE antes de FENCING. 0 = sem mínimo imposto em I2C2. */
export const NOTICE_MIN_MS_DEFAULT = 0;
export const NOTICE_MIN_MS_MAX = 30 * 60_000;

export function resolveNoticeMinMs(policy) {
  const value = policy?.noticeMinMs;
  if (Number.isFinite(value) && value >= 0 && value <= NOTICE_MIN_MS_MAX) return value;
  return NOTICE_MIN_MS_DEFAULT;
}

// ── Steps determinísticos (app_db_release_execution_steps) ───
/** step_order único por execução (unique(execution_id, step_order)). */
export const STEP_ORDER = Object.freeze({
  PREFLIGHT: 1,
  LOGIN_GATE_CLOSE: 2,
  FENCE: 3,
  DRAIN: 4,
  QUIESCE: 5,
  BACKUP: 6,
  BACKUP_VERIFY: 7,
  SCHEMA_VALIDATE: 900,
  SMOKE: 910,
  LOGIN_GATE_OPEN: 920,
  RECOVERY: 990,
});

export const MIGRATE_STEP_BASE = 100;
export const MAX_MIGRATIONS_PER_PLAN = 500;

export function migrateStepOrder(migrationOrder) {
  return Number.isInteger(migrationOrder) && migrationOrder >= 1 && migrationOrder <= MAX_MIGRATIONS_PER_PLAN
    ? MIGRATE_STEP_BASE + migrationOrder
    : null;
}

// ── Execução: arestas legais (vocabulário da migration 160) ──
export const EXECUTION_PIPELINE_EDGES = Object.freeze([
  ["REQUESTED", "PREPARING"],
  ["PREPARING", "DRAINING"],
  ["DRAINING", "BACKING_UP"],
  ["BACKING_UP", "MIGRATING"],
  ["MIGRATING", "VERIFYING"],
  ["VERIFYING", "SUCCEEDED"],
  // saídas protetoras
  ["REQUESTED", "CANCELED"],
  ["PREPARING", "CANCELED"],
  ["DRAINING", "CANCELED"],
  ["BACKING_UP", "CANCELED"],
  ["PREPARING", "FAILED"],
  ["DRAINING", "FAILED"],
  ["BACKING_UP", "FAILED"],
  ["MIGRATING", "FAILED"],
  ["FAILED", "CANCELED"],
  ["REQUESTED", "RECOVERY_REQUIRED"],
  ["PREPARING", "RECOVERY_REQUIRED"],
  ["DRAINING", "RECOVERY_REQUIRED"],
  ["BACKING_UP", "RECOVERY_REQUIRED"],
  ["MIGRATING", "RECOVERY_REQUIRED"],
  ["VERIFYING", "RECOVERY_REQUIRED"],
]);

export function isPipelineExecutionEdge(from, to) {
  return EXECUTION_PIPELINE_EDGES.some(([left, right]) => left === from && right === to);
}

// ── Modelo de resultado do apply de migration ────────────────
export const APPLY_RESULTS = Object.freeze({
  SUCCESS_COMMITTED: "SUCCESS_COMMITTED",
  FAILED_NOT_COMMITTED: "FAILED_NOT_COMMITTED",
  AMBIGUOUS_UNKNOWN_COMMIT: "AMBIGUOUS_UNKNOWN_COMMIT",
});
export const APPLY_RESULT_VALUES = Object.freeze(Object.values(APPLY_RESULTS));

/** Retry de mutação: ZERO. Timeout/transporte/desconhecido → AMBIGUOUS → reconciliação. */
export const MUTATION_RETRY_COUNT = 0;
export const MIGRATION_ATTEMPTS_PER_STEP = 1;

/** Único primitivo de aplicação permitido (adapter dedicado futuro). */
export const APPLY_PRIMITIVE = "APPLY_MIGRATION_ADAPTER";
/** Fallbacks genéricos PROIBIDOS: uma falha do primitivo nunca cai neles. */
export const PROHIBITED_APPLY_FALLBACKS = Object.freeze(["execute_sql", "postgrest_sql", "raw_sql"]);

/** Erro tipado: o adapter PROVA que o commit NÃO ocorreu. Qualquer outro erro = ambíguo. */
export class MigrationNotCommittedError extends Error {
  constructor(message = "MIGRATION_NOT_COMMITTED", { code = "MIGRATION_NOT_COMMITTED" } = {}) {
    super(message);
    this.name = "MigrationNotCommittedError";
    this.code = code;
    this.notCommitted = true;
  }
}

/** Normaliza o retorno/erro do adapter em UM dos três resultados. */
export function classifyApplyOutcome(returned, thrown = null) {
  if (thrown) {
    if (thrown.notCommitted === true) {
      return {
        result: APPLY_RESULTS.FAILED_NOT_COMMITTED,
        reasonCode: thrown.code || "MIGRATION_NOT_COMMITTED",
      };
    }
    const timeout = thrown.name === "TimeoutError" || thrown.code === "TIMEOUT" || thrown.code === "ETIMEDOUT";
    return {
      result: APPLY_RESULTS.AMBIGUOUS_UNKNOWN_COMMIT,
      reasonCode: timeout ? "APPLY_TIMEOUT" : "APPLY_TRANSPORT_ERROR",
    };
  }
  if (!returned || typeof returned !== "object" || !APPLY_RESULT_VALUES.includes(returned.result)) {
    return { result: APPLY_RESULTS.AMBIGUOUS_UNKNOWN_COMMIT, reasonCode: "APPLY_RESULT_UNRECOGNIZED" };
  }
  return {
    result: returned.result,
    reasonCode: typeof returned.reasonCode === "string" ? returned.reasonCode.slice(0, 80) : null,
  };
}

// ── Falhas: quais permitem unwind controlado pré-mutação ─────
/** Falhas determinísticas, sem mutação de schema nem backup ambíguo. */
export const SAFE_ABORT_FAILURE_CODES = Object.freeze([
  "WRITE_FENCE_COVERAGE_INCOMPLETE",
  "WRITE_FENCE_NOT_VERIFIED",
  "DRAIN_TIMEOUT",
  "QUIESCENCE_NOT_PROVEN",
  "READY_TO_BACKUP_LOST",
  "BACKUP_CREATE_FAILED",
  "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION",
  "BACKUP_VERIFY_FAILED",
  "BACKUP_CORRELATION_MISMATCH",
  "BACKUP_EVIDENCE_STALE",
  "READY_TO_MIGRATE_NOT_SATISFIED",
  "T_TIME_REVALIDATION_FAILED",
  "ABORTED_BEFORE_MUTATION",
]);

export const AMBIGUITY_FAILURE_CODES = Object.freeze([
  "BACKUP_OUTCOME_AMBIGUOUS",
  "MIGRATION_OUTCOME_AMBIGUOUS",
  "LEASE_LOST_AFTER_MUTATION",
  "LEASE_LOST_PRE_MUTATION",
  "POST_MIGRATION_VERIFICATION_FAILED",
  "SMOKE_FAILED_AFTER_COMMIT",
]);

// ── Portas ───────────────────────────────────────────────────
export const MAINTENANCE_PORT_METHODS = Object.freeze([
  "readState",
  "startNotice",
  "fence",
  "closeLoginGate",
  "startDrain",
  "quiesce",
  "startBackup",
  "startMigrating",
  "startSmoke",
  "completeNormal",
  "openLoginGate",
  "markFailed",
  "abortToNormal",
]);
export const PROBES_PORT_METHODS = Object.freeze(["readSessionZeroProof", "readInFlight", "readWriteFenceCoverage"]);
export const BACKUP_PORT_METHODS = Object.freeze(["createBackup", "observeArtifacts", "recordVerification", "readEvidence"]);
export const MIGRATION_PORT_METHODS = Object.freeze(["describeMigration", "applyOneMigration", "readCommitState"]);
export const SMOKE_PORT_METHODS = Object.freeze(["run"]);
export const VERIFIER_PORT_METHODS = Object.freeze(["verifyPostMigration"]);

export const PORT_DISABLED_CODES = Object.freeze({
  maintenance: "MAINTENANCE_TRANSPORT_NOT_ENABLED",
  probes: "RUNTIME_PROBES_NOT_ENABLED",
  backup: "BACKUP_EXECUTOR_NOT_ENABLED",
  migration: "MIGRATION_EXECUTOR_NOT_ENABLED",
  smoke: "SMOKE_ADAPTER_NOT_ENABLED",
  verifier: "POST_MIGRATION_VERIFIER_NOT_ENABLED",
});

function createDisabledPort(name, methods) {
  const code = PORT_DISABLED_CODES[name];
  const port = { enabled: false, transport: "DISABLED", disabledCode: code };
  for (const method of methods) {
    port[method] = async () => ({ ok: false, code, disabled: true });
  }
  return Object.freeze(port);
}

export const createDisabledMaintenanceTransport = () => createDisabledPort("maintenance", MAINTENANCE_PORT_METHODS);
export const createDisabledRuntimeProbes = () => createDisabledPort("probes", PROBES_PORT_METHODS);
export const createDisabledBackupExecutor = () => createDisabledPort("backup", BACKUP_PORT_METHODS);
export const createDisabledMigrationExecutor = () => Object.freeze({
  ...createDisabledPort("migration", MIGRATION_PORT_METHODS),
  applyPrimitive: APPLY_PRIMITIVE,
});
export const createDisabledSmokeAdapter = () => createDisabledPort("smoke", SMOKE_PORT_METHODS);
export const createDisabledPostMigrationVerifier = () => createDisabledPort("verifier", VERIFIER_PORT_METHODS);

/** Composição padrão do repositório: TUDO desabilitado (nada live é alcançável). */
export function createDefaultDisabledPorts() {
  return {
    maintenance: createDisabledMaintenanceTransport(),
    probes: createDisabledRuntimeProbes(),
    backup: createDisabledBackupExecutor(),
    migration: createDisabledMigrationExecutor(),
    smoke: createDisabledSmokeAdapter(),
    verifier: createDisabledPostMigrationVerifier(),
  };
}

export const PORT_METHODS = Object.freeze({
  maintenance: MAINTENANCE_PORT_METHODS,
  probes: PROBES_PORT_METHODS,
  backup: BACKUP_PORT_METHODS,
  migration: MIGRATION_PORT_METHODS,
  smoke: SMOKE_PORT_METHODS,
  verifier: VERIFIER_PORT_METHODS,
});

export function isPortShape(name, port) {
  const methods = PORT_METHODS[name];
  return Boolean(methods) && Boolean(port) && methods.every((method) => typeof port[method] === "function");
}

// ── Elegibilidade LIVE (defesa em profundidade) ──────────────
/**
 * Lacunas de persistência reais (migration 160/161) que I2D precisa fechar
 * ANTES de qualquer execução live. Todas verdadeiras hoje = lacuna aberta.
 */
export const PERSISTENCE_GAPS = Object.freeze({
  LEASE_GENERATION_NOT_PERSISTED: true,
  ACTIVE_EXECUTION_UNIQUENESS_NOT_ENFORCED: true,
  PLAN_CORRELATION_UNIQUENESS_NOT_ENFORCED: true,
  AUDIT_TAXONOMY_INCOMPLETE: true,
  MAINTENANCE_DB_EDGE_RPCS_MISSING: true,
  LOGIN_GATE_WRITER_MISSING: true,
  DB_BINDING_RPC_MISSING: true,
  REOPEN_GUARD_FOR_DB_BINDING_MISSING: true,
});

export const LIVE_BLOCKER_CODES = Object.freeze([
  "REAL_MAINTENANCE_TRANSPORT_MISSING",
  "REAL_RUNTIME_PROBES_MISSING",
  "REAL_BACKUP_TRANSPORT_MISSING",
  "REAL_APPLY_TRANSPORT_MISSING",
  "REAL_SMOKE_TRANSPORT_MISSING",
  "REAL_POST_MIGRATION_VERIFIER_MISSING",
  "WRITE_FENCE_COVERAGE_INCOMPLETE",
  "HML_VALIDATED_DERIVER_MISSING",
  "PROD_BASELINE_DERIVER_MISSING",
  "PERSISTENCE_GAPS_OPEN",
]);

const PORT_BLOCKERS = Object.freeze({
  maintenance: "REAL_MAINTENANCE_TRANSPORT_MISSING",
  probes: "REAL_RUNTIME_PROBES_MISSING",
  backup: "REAL_BACKUP_TRANSPORT_MISSING",
  migration: "REAL_APPLY_TRANSPORT_MISSING",
  smoke: "REAL_SMOKE_TRANSPORT_MISSING",
  verifier: "REAL_POST_MIGRATION_VERIFIER_MISSING",
});

/**
 * Avalia se um composto de portas/evidências poderia executar contra um banco
 * REAL. Elegível somente com TODOS os transportes LIVE, cobertura de escrita
 * completa vinda de CATALOG_PROBE, derivadores confiáveis de HML/baseline e a
 * persistência sem lacunas. O repositório atual: nunca elegível.
 */
export function evaluateLivePipelineEligibility({
  ports = {},
  coverageEvidence = null,
  trustedDerivers = {},
  persistenceGaps = PERSISTENCE_GAPS,
} = {}) {
  const blockers = [];
  for (const [name, code] of Object.entries(PORT_BLOCKERS)) {
    const port = ports[name];
    if (!port || port.enabled !== true || port.transport !== "LIVE") blockers.push(code);
  }
  if (!isLiveAuthoritativeCoverage(coverageEvidence)) blockers.push("WRITE_FENCE_COVERAGE_INCOMPLETE");
  if (trustedDerivers?.HML_VALIDATED !== true) blockers.push("HML_VALIDATED_DERIVER_MISSING");
  if (trustedDerivers?.PROD_BASELINE_VERIFIED !== true) blockers.push("PROD_BASELINE_DERIVER_MISSING");
  if (Object.values(persistenceGaps || {}).some(Boolean)) blockers.push("PERSISTENCE_GAPS_OPEN");
  return { eligible: blockers.length === 0, blockers };
}

/** Portas que declaram LIVE. O pipeline recusa rodar se algo é LIVE e não elegível. */
export function anyPortIsLive(ports = {}) {
  return Object.keys(PORT_METHODS).some((name) => ports[name]?.transport === "LIVE");
}
