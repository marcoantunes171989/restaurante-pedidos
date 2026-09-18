// ════════════════════════════════════════════════════════════
//  PDB-I1A — Contrato estático do Production Database Orchestrator.
//
//  Source comum futuro para I1C. Somente constantes congeladas e
//  helpers puros. Sem rede, sem DB, sem segredo, sem executor.
// ════════════════════════════════════════════════════════════

export const PLAN_KINDS = Object.freeze(["APP_RELEASE", "DB_MIGRATION"]);

export const LOGIN_GATE_STATES = Object.freeze(["OPEN", "CLOSED"]);

export const MAINTENANCE_PHASES = Object.freeze([
  "NORMAL",
  "NOTICE",
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
  "CANCELED",
  "BACKING_UP",
  "MIGRATING",
]);

export const LEGACY_MAINTENANCE_PHASES = Object.freeze([
  "NORMAL",
  "NOTICE",
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
  "CANCELED",
]);

export const DB_PLAN_STATUSES = Object.freeze([
  "DRAFT",
  "VALIDATED",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "BLOCKED",
  "FAILED",
  "RECOVERY_REQUIRED",
  "SUCCEEDED",
  "CANCELED",
]);

export const BACKUP_STATUSES = Object.freeze([
  "REQUESTED",
  "RUNNING",
  "COMPLETED",
  "VERIFYING",
  "VERIFIED",
  "FAILED",
]);

export const EXECUTION_STATUSES = Object.freeze([
  "REQUESTED",
  "PREPARING",
  "DRAINING",
  "BACKING_UP",
  "MIGRATING",
  "VERIFYING",
  "RECOVERY_REQUIRED",
  "FAILED",
  "SUCCEEDED",
  "CANCELED",
]);

export const EXECUTION_STEP_STATUSES = Object.freeze([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "CANCELED",
]);

export const EXECUTION_STEP_TYPES = Object.freeze([
  "PREFLIGHT",
  "LOGIN_GATE_CLOSE",
  "FENCE",
  "DRAIN",
  "QUIESCE",
  "BACKUP",
  "BACKUP_VERIFY",
  "MIGRATE",
  "SCHEMA_VALIDATE",
  "SMOKE",
  "LOGIN_GATE_OPEN",
  "RECOVERY",
]);

export const SCHEMA_CLASSIFICATIONS = Object.freeze([
  "SAFE_AUTO",
  "REVIEW_REQUIRED",
  "PROHIBITED",
]);

export const SCHEMA_VALIDATION_RESULTS = Object.freeze(["PASS", "FAIL"]);

export const DB_ENVIRONMENTS = Object.freeze(["HML", "PROD"]);

export const READINESS_GATE_STATUSES = Object.freeze([
  "VERIFIED",
  "PENDING",
  "BLOCKED",
  "FAILED",
  "UNKNOWN",
  "STALE",
]);

export const READINESS_APPLICABILITY = Object.freeze({
  ALWAYS: "always",
  SCHEDULED: "scheduled",
});

/** Lista canônica única PDB-A2. Sempre 16 + 1 condicional de janela. */
export const CANONICAL_READINESS_GATES = Object.freeze([
  Object.freeze({ key: "GIT_SHA_MATCH", required: true, applicability: "always" }),
  Object.freeze({ key: "HML_VALIDATED", required: true, applicability: "always" }),
  Object.freeze({ key: "PROD_BASELINE_VERIFIED", required: true, applicability: "always" }),
  Object.freeze({ key: "MIGRATION_SET_FROZEN", required: true, applicability: "always" }),
  Object.freeze({ key: "MIGRATION_IDENTITY_VERIFIED", required: true, applicability: "always" }),
  Object.freeze({ key: "SCHEMA_SAFETY_PASS", required: true, applicability: "always" }),
  Object.freeze({ key: "NO_DML", required: true, applicability: "always" }),
  Object.freeze({ key: "NO_DESTRUCTIVE_DDL", required: true, applicability: "always" }),
  Object.freeze({ key: "BACKUP_VERIFIED", required: true, applicability: "always" }),
  Object.freeze({ key: "LOGIN_GATE_CLOSED", required: true, applicability: "always" }),
  Object.freeze({ key: "ACTIVE_SESSION_COUNT_ZERO", required: true, applicability: "always" }),
  Object.freeze({ key: "IN_FLIGHT_OPERATION_COUNT_ZERO", required: true, applicability: "always" }),
  Object.freeze({ key: "WRITE_FENCE_ACTIVE", required: true, applicability: "always" }),
  Object.freeze({ key: "EXECUTOR_HEALTHY", required: true, applicability: "always" }),
  Object.freeze({ key: "LOCK_ACQUIRED", required: true, applicability: "always" }),
  Object.freeze({ key: "HUMAN_APPROVAL_VALID", required: true, applicability: "always" }),
  Object.freeze({ key: "SCHEDULE_WINDOW_VALID", required: true, applicability: "scheduled" }),
]);

export const REQUIRED_READINESS_GATES = Object.freeze(
  CANONICAL_READINESS_GATES.map((gate) => gate.key),
);

export const ALWAYS_REQUIRED_READINESS_GATES = Object.freeze(
  CANONICAL_READINESS_GATES
    .filter((gate) => gate.applicability === READINESS_APPLICABILITY.ALWAYS)
    .map((gate) => gate.key),
);

export const CONDITIONAL_READINESS_GATES = Object.freeze(
  CANONICAL_READINESS_GATES
    .filter((gate) => gate.applicability !== READINESS_APPLICABILITY.ALWAYS)
    .map((gate) => gate.key),
);

export const DB_MAINTENANCE_EVENT_TYPES = Object.freeze([
  "DB_PLAN_CREATED",
  "DB_PLAN_VALIDATED",
  "DB_PLAN_APPROVED",
  "DB_PLAN_SCHEDULED",
  "DB_PREFLIGHT_PASSED",
  "DB_PREFLIGHT_BLOCKED",
  "LOGIN_GATE_CLOSED",
  "LOGIN_GATE_OPENED",
  "SESSION_DRAIN_STARTED",
  "SESSION_DRAIN_COMPLETED",
  "BACKUP_REQUESTED",
  "BACKUP_STARTED",
  "BACKUP_COMPLETED",
  "BACKUP_VERIFYING",
  "BACKUP_VERIFIED",
  "BACKUP_FAILED",
  "DB_MIGRATION_STARTED",
  "DB_MIGRATION_APPLIED",
  "DB_MIGRATION_RECONCILED",
  "DB_SCHEMA_VALIDATION_PASSED",
  "DB_SCHEMA_VALIDATION_FAILED",
  "DB_RECOVERY_REQUIRED",
  "DB_RELEASE_SUCCEEDED",
  "DB_RELEASE_FAILED",
]);

export const LEGACY_MAINTENANCE_EVENT_TYPES = Object.freeze([
  "NOTICE_STARTED",
  "NOTICE_TICK",
  "FENCE_STARTED",
  "DRAIN_STARTED",
  "OPERATION_BEGUN",
  "OPERATION_DRAINED",
  "OPERATION_EXPIRED",
  "QUIESCENCE_REACHED",
  "QUIESCENCE_PROBE_PASSED",
  "RELEASE_STARTED",
  "SMOKE_STARTED",
  "RECOVERY_STARTED",
  "MAINTENANCE_COMPLETED",
  "MAINTENANCE_ABORTED",
  "MAINTENANCE_FAILED",
  "MAINTENANCE_CANCELED",
  "ORCHESTRATION_STARTED",
  "MAINTENANCE_REOPENED",
]);

export const MAINTENANCE_EVENT_TYPES = Object.freeze([
  ...LEGACY_MAINTENANCE_EVENT_TYPES,
  ...DB_MAINTENANCE_EVENT_TYPES,
]);

export const APP_STRUCTURAL_EDGES = Object.freeze([
  ["NORMAL", "NOTICE"],
  ["NOTICE", "FENCING"],
  ["FENCING", "DRAINING"],
  ["DRAINING", "QUIESCENT"],
  ["QUIESCENT", "RELEASING"],
  ["RELEASING", "SMOKE"],
  ["SMOKE", "NORMAL"],
  ["SMOKE", "RECOVERING"],
  ["RECOVERING", "FAILED"],
  ["RELEASING", "ABORTING"],
  ["ABORTING", "FAILED"],
  ["FENCING", "FAILED"],
  ["DRAINING", "FAILED"],
  ["NORMAL", "CANCELED"],
  ["NOTICE", "CANCELED"],
  ["QUIESCENT", "FAILED"],
]);

export const APP_HAPPY_PATH = Object.freeze([
  ["NORMAL", "NOTICE"],
  ["NOTICE", "FENCING"],
  ["FENCING", "DRAINING"],
  ["DRAINING", "QUIESCENT"],
  ["QUIESCENT", "RELEASING"],
  ["RELEASING", "SMOKE"],
  ["SMOKE", "NORMAL"],
]);

export const DB_HAPPY_PATH = Object.freeze([
  ["NORMAL", "NOTICE"],
  ["NOTICE", "FENCING"],
  ["FENCING", "DRAINING"],
  ["DRAINING", "QUIESCENT"],
  ["QUIESCENT", "BACKING_UP"],
  ["BACKING_UP", "MIGRATING"],
  ["MIGRATING", "SMOKE"],
  ["SMOKE", "NORMAL"],
]);

export const DB_STRUCTURAL_EDGES_RESERVED = Object.freeze([
  ["QUIESCENT", "BACKING_UP"],
  ["BACKING_UP", "MIGRATING"],
  ["MIGRATING", "SMOKE"],
  ["BACKING_UP", "FAILED"],
  ["MIGRATING", "FAILED"],
]);

export const SHA1_RE = /^[0-9a-f]{40}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;

export const CONTROL_PLANE_TABLES = Object.freeze([
  "app_db_release_plans",
  "app_db_release_plan_migrations",
  "app_db_release_executions",
  "app_db_release_execution_steps",
  "app_backup_runs",
  "app_schema_validation_results",
]);

function frozenHas(list, value) {
  return list.includes(value);
}

export function isReadinessGateStatus(value) {
  return frozenHas(READINESS_GATE_STATUSES, value);
}

export function isCanonicalReadinessGate(key) {
  return frozenHas(REQUIRED_READINESS_GATES, key);
}

export function isPlanKind(value) {
  return frozenHas(PLAN_KINDS, value);
}

export function isLoginGateState(value) {
  return frozenHas(LOGIN_GATE_STATES, value);
}

export function isMaintenancePhase(value) {
  return frozenHas(MAINTENANCE_PHASES, value);
}

export function isDbPlanStatus(value) {
  return frozenHas(DB_PLAN_STATUSES, value);
}

export function isBackupStatus(value) {
  return frozenHas(BACKUP_STATUSES, value);
}

export function isExecutionStatus(value) {
  return frozenHas(EXECUTION_STATUSES, value);
}

export function isSchemaClassification(value) {
  return frozenHas(SCHEMA_CLASSIFICATIONS, value);
}

export function isSchemaValidationResult(value) {
  return frozenHas(SCHEMA_VALIDATION_RESULTS, value);
}

export function isDbEnvironment(value) {
  return frozenHas(DB_ENVIRONMENTS, value);
}

export function isMaintenanceEventType(value) {
  return frozenHas(MAINTENANCE_EVENT_TYPES, value);
}

export function isAppHappyPathEdge(fromPhase, toPhase) {
  return APP_HAPPY_PATH.some(([from, to]) => from === fromPhase && to === toPhase);
}

export function isDbHappyPathEdge(fromPhase, toPhase) {
  return DB_HAPPY_PATH.some(([from, to]) => from === fromPhase && to === toPhase);
}

export function isAppStructuralEdge(fromPhase, toPhase) {
  return APP_STRUCTURAL_EDGES.some(([from, to]) => from === fromPhase && to === toPhase);
}

export function isReservedDbStructuralEdge(fromPhase, toPhase) {
  return DB_STRUCTURAL_EDGES_RESERVED.some(([from, to]) => from === fromPhase && to === toPhase);
}

export function appAndDbBindingCannotCoexist({ releaseId, dbPlanId } = {}) {
  return !(releaseId != null && dbPlanId != null);
}

export function isUnboundLegacyState({
  releaseId = null,
  targetSha = null,
  dbPlanId = null,
  planKind = null,
} = {}) {
  return releaseId == null && targetSha == null && dbPlanId == null && planKind == null;
}

export function isAppReleaseBinding({
  releaseId = null,
  targetSha = null,
  dbPlanId = null,
  planKind = null,
} = {}) {
  return (
    releaseId != null &&
    targetSha != null &&
    dbPlanId == null &&
    (planKind == null || planKind === "APP_RELEASE")
  );
}

export function isDbMigrationBinding({
  releaseId = null,
  targetSha = null,
  dbPlanId = null,
  planKind = null,
} = {}) {
  return (
    releaseId == null &&
    targetSha != null &&
    dbPlanId != null &&
    planKind === "DB_MIGRATION"
  );
}

export function isValidBindingState(binding = {}) {
  return (
    isUnboundLegacyState(binding) ||
    isAppReleaseBinding(binding) ||
    isDbMigrationBinding(binding)
  );
}
