// ════════════════════════════════════════════════════════════
//  PDB-I2D1 — Transporte (INTERFACE) das RPCs de runtime da migration 162.
//
//  Constrói e valida os argumentos das RPCs server-only, amarra SEMPRE o
//  ambiente esperado ao project ref esperado (HML=zzixvyspwszewhxzusot,
//  PROD=rwnzggjxhxnfrhstbxkm — nunca trocáveis) e normaliza as respostas.
//
//  NÃO chama nada por conta própria:
//   • sem fetch/ambiente/timer no import;
//   • `rpc` e `fetchImpl` são SEMPRE injetados (sem fallback live oculto);
//   • o padrão do repositório é o transporte DESABILITADO;
//   • testes usam mocks. Uso live é escopo do I2D2, com autorização humana.
//  Credenciais nunca são lidas, impressas nem devolvidas.
// ════════════════════════════════════════════════════════════

import { isDbEnvironment, isExecutionStatus } from "./db-release-contract.js";
import {
  checkBackupIdentity,
  containsSecretMaterial,
  expectedProjectRefFor,
  isUuid,
} from "./db-backup-contract.js";
import {
  CLAIM_INTENTS,
  EXECUTOR_LEASE_TTL_SECONDS,
  validateWorkerId,
} from "./db-release-executor-contract.js";
import { isPipelineExecutionEdge } from "./db-release-pipeline-contract.js";
import { COVERAGE_PROBE_RPC_NAME } from "./db-release-write-coverage-probe.js";

export const RUNTIME_RPC_CONTRACT_VERSION = 1;

/** Fase de manutenção DB: 14 edges controladas (espelha a migration 162). */
export const DB_MAINTENANCE_TRANSITION_EDGES = Object.freeze([
  ["NOTICE", "FENCING"],
  ["FENCING", "DRAINING"],
  ["DRAINING", "QUIESCENT"],
  ["QUIESCENT", "BACKING_UP"],
  ["BACKING_UP", "MIGRATING"],
  ["MIGRATING", "SMOKE"],
  ["SMOKE", "NORMAL"],
  ["NOTICE", "FAILED"],
  ["FENCING", "FAILED"],
  ["DRAINING", "FAILED"],
  ["QUIESCENT", "FAILED"],
  ["BACKING_UP", "FAILED"],
  ["MIGRATING", "FAILED"],
  ["SMOKE", "FAILED"],
]);

export function isDbMaintenanceTransitionEdge(from, to) {
  return DB_MAINTENANCE_TRANSITION_EDGES.some(([left, right]) => left === from && right === to);
}

/** Colunas persistidas de app_db_release_executions após a migration 162. */
export const PERSISTED_EXECUTION_COLUMNS_V162 = Object.freeze([
  "id",
  "plan_id",
  "environment",
  "status",
  "correlation_id",
  "executor_id",
  "started_at",
  "completed_at",
  "heartbeat_at",
  "failure_code",
  "failure_message",
  "created_at",
  "project_ref",
  "lease_generation",
  "lease_expires_at",
  "lock_released_at",
  "mutation_started_at",
  "reconciled_at",
  "reconciled_by",
  "reconciliation_evidence",
]);

/** Códigos que as RPCs levantam em `detail` (P0001). Espelha a migration 162. */
export const RUNTIME_RPC_ERROR_CODES = Object.freeze([
  "CLAIM_REQUEST_INVALID",
  "ENVIRONMENT_INVALID",
  "PROJECT_REF_MISMATCH",
  "WORKER_ID_INVALID",
  "CLAIM_INTENT_INVALID",
  "PLAN_NOT_FOUND",
  "EXECUTION_OWNED_BY_OTHER_WORKER",
  "PLAN_EXECUTION_EXISTS",
  "INTENT_STATUS_MISMATCH",
  "PLAN_STATUS_INVALID",
  "SCHEDULE_INVALID",
  "SCHEDULE_NOT_DUE",
  "SCHEDULE_WINDOW_EXPIRED",
  "PLAN_DRIFT",
  "EXECUTION_NOT_FOUND",
  "PLAN_MISMATCH",
  "WORKER_MISMATCH",
  "LEASE_GENERATION_MISMATCH",
  "EXECUTION_TERMINAL",
  "LEASE_EXPIRED",
  "HEARTBEAT_CONFLICT",
  "INVALID_TRANSITION",
  "TRANSITION_CONFLICT",
  "LOCK_RELEASE_NOT_ALLOWED",
  "STATE_CONFLICT",
  "VERSION_CONFLICT",
  "NOT_FOUND",
  "ACTIVE_RELEASE_CONFLICT",
  "TARGET_MISMATCH",
  "DB_BINDING_RELEASE_UNSAFE",
  "LOGIN_GATE_MUST_BE_CLOSED",
  "LOGIN_GATE_CLOSE_NOT_ALLOWED",
  "LOGIN_GATE_OPEN_NOT_ALLOWED",
  "LOGIN_GATE_OPEN_UNSAFE",
  "PLAN_RUNNING_WITHOUT_EXECUTION",
  "PLAN_RUNNING_CANNOT_REVERT",
  "PLAN_SUCCEEDED_WITHOUT_EXECUTION",
  "EXECUTION_WITHOUT_PLAN_CAS",
  "MAINTENANCE_FENCE_ACTIVE",
]);

// ── validadores ──────────────────────────────────────────────
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const PHASES = Object.freeze(["NORMAL", "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "FAILED"]);
const RECONCILE_RESOLUTIONS = Object.freeze(["APPLIED_VERIFIED", "NOT_APPLIED_VERIFIED", "RESTORED_VERIFIED"]);

const V = {
  uuid: (value) => isUuid(value),
  env: (value) => isDbEnvironment(value),
  worker: (value) => validateWorkerId(value).ok,
  intent: (value) => CLAIM_INTENTS.includes(value),
  sha256: (value) => typeof value === "string" && SHA256_RE.test(value),
  sha1: (value) => typeof value === "string" && SHA1_RE.test(value),
  iso: (value) => typeof value === "string" && ISO_TS_RE.test(value) && Number.isFinite(Date.parse(value)),
  ttl: (value) => Number.isInteger(value) && value >= 30 && value <= 900,
  generation: (value) => Number.isInteger(value) && value >= 1,
  version: (value) => Number.isInteger(value) && value >= 1,
  status: (value) => isExecutionStatus(value),
  phase: (value) => PHASES.includes(value),
  gate: (value) => value === "OPEN" || value === "CLOSED",
  resolution: (value) => RECONCILE_RESOLUTIONS.includes(value),
  reason: (value) => typeof value === "string" && value.length >= 1 && value.length <= 240 && !containsSecretMaterial(value),
  email: (value) => value === null || (typeof value === "string" && value.length <= 160 && !containsSecretMaterial(value)),
  nullableUuid: (value) => value === null || isUuid(value),
  code: (value) => value === null || (typeof value === "string" && value.length >= 1 && value.length <= 200 && !containsSecretMaterial(value)),
  message: (value) => value === null || (typeof value === "string" && value.length <= 1000 && !containsSecretMaterial(value)),
  metadata: (value) => value === null || (typeof value === "object" && !Array.isArray(value) && !containsSecretMaterial(value)),
  evidence: (value) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length > 0 && !containsSecretMaterial(value),
};

/**
 * Especificação declarativa: [parâmetro SQL, chave da requisição, validador, default].
 * A ordem e os nomes espelham as assinaturas da migration 162 (um teste
 * estático compara com o SQL).
 */
export const RUNTIME_RPC_SPECS = Object.freeze({
  CLAIM: {
    name: "app_db_release_claim_execution",
    params: [
      ["p_plan_id", "planId", V.uuid],
      ["p_environment", "environment", V.env],
      ["p_project_ref", "projectRef", (value) => typeof value === "string"],
      ["p_worker_id", "workerId", V.worker],
      ["p_correlation_id", "correlationId", V.uuid],
      ["p_intent", "intent", V.intent],
      ["p_expected_plan_hash", "expectedPlanHash", V.sha256],
      ["p_expected_plan_updated_at", "expectedPlanUpdatedAt", V.iso],
      ["p_lease_ttl_seconds", "leaseTtlSeconds", V.ttl, EXECUTOR_LEASE_TTL_SECONDS],
    ],
  },
  HEARTBEAT: {
    name: "app_db_release_heartbeat_execution",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_lease_ttl_seconds", "leaseTtlSeconds", V.ttl, EXECUTOR_LEASE_TTL_SECONDS],
    ],
  },
  TRANSITION_EXECUTION: {
    name: "app_db_release_transition_execution",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_from_status", "fromStatus", V.status],
      ["p_to_status", "toStatus", V.status],
      ["p_failure_code", "failureCode", V.code, null],
      ["p_failure_message", "failureMessage", V.message, null],
    ],
  },
  RELEASE_LOCK: {
    name: "app_db_release_release_lock",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
    ],
  },
  FLAG_STALE: {
    name: "app_db_release_flag_stale_execution",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_expected_lease_generation", "leaseGeneration", V.generation],
    ],
  },
  RECONCILE: {
    name: "app_db_release_reconcile_execution",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_actor_user_id", "actorUserId", V.uuid],
      ["p_resolution", "resolution", V.resolution],
      ["p_evidence", "evidence", V.evidence],
    ],
  },
  RELEASE_RECONCILED_LOCK: {
    name: "app_db_release_release_reconciled_lock",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_actor_user_id", "actorUserId", V.uuid],
    ],
  },
  MAINTENANCE_START: {
    name: "app_maintenance_db_orchestration_start",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_expected_version", "expectedVersion", V.version],
      ["p_plan_id", "planId", V.uuid],
      ["p_target_sha", "targetSha", V.sha1],
      ["p_actor_user_id", "actorUserId", V.nullableUuid, null],
      ["p_actor_email", "actorEmail", V.email, null],
      ["p_reason", "reason", V.reason],
      ["p_metadata", "metadata", V.metadata, null],
    ],
  },
  MAINTENANCE_TRANSITION: {
    name: "app_maintenance_db_orchestration_transition",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_expected_phase", "expectedPhase", V.phase],
      ["p_expected_version", "expectedVersion", V.version],
      ["p_to_phase", "toPhase", V.phase],
      ["p_actor_user_id", "actorUserId", V.nullableUuid, null],
      ["p_actor_email", "actorEmail", V.email, null],
      ["p_reason", "reason", V.reason],
      ["p_metadata", "metadata", V.metadata, null],
    ],
  },
  MAINTENANCE_LOGIN_GATE: {
    name: "app_maintenance_db_orchestration_login_gate",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_expected_version", "expectedVersion", V.version],
      ["p_gate", "gate", V.gate],
      ["p_actor_user_id", "actorUserId", V.nullableUuid, null],
      ["p_actor_email", "actorEmail", V.email, null],
      ["p_reason", "reason", V.reason],
      ["p_metadata", "metadata", V.metadata, null],
    ],
  },
  MAINTENANCE_ABORT_TO_NORMAL: {
    name: "app_maintenance_db_orchestration_abort_to_normal",
    params: [
      ["p_execution_id", "executionId", V.uuid],
      ["p_worker_id", "workerId", V.worker],
      ["p_lease_generation", "leaseGeneration", V.generation],
      ["p_expected_version", "expectedVersion", V.version],
      ["p_actor_user_id", "actorUserId", V.nullableUuid, null],
      ["p_actor_email", "actorEmail", V.email, null],
      ["p_reason", "reason", V.reason],
      ["p_metadata", "metadata", V.metadata, null],
    ],
  },
  COVERAGE_PROBE: {
    name: COVERAGE_PROBE_RPC_NAME,
    params: [],
  },
});

export const RUNTIME_RPC_NAMES = Object.freeze(Object.values(RUNTIME_RPC_SPECS).map((spec) => spec.name));

const fail = (code, reason = null) => ({ ok: false, code, ...(reason ? { reason } : {}) });

// ── binding de ambiente ──────────────────────────────────────
export function validateRuntimeBinding({ expectedEnvironment, expectedProjectRef } = {}) {
  if (!isDbEnvironment(expectedEnvironment)) return fail("ENVIRONMENT_INVALID");
  const projectRef = expectedProjectRef ?? expectedProjectRefFor(expectedEnvironment);
  const identity = checkBackupIdentity({ environment: expectedEnvironment, projectRef });
  if (!identity.ok) return fail("PROJECT_REF_MISMATCH", identity.reason);
  return { ok: true, environment: expectedEnvironment, projectRef };
}

/**
 * Constrói args nomeados de uma RPC. Chave desconhecida => rejeita (a
 * requisição não pode carregar campos extras/autoridade do cliente).
 */
export function buildRuntimeRpcArgs(key, request = {}, { binding = null } = {}) {
  const spec = RUNTIME_RPC_SPECS[key];
  if (!spec) return fail("CLAIM_REQUEST_INVALID", "RPC_UNKNOWN");
  if (!request || typeof request !== "object" || Array.isArray(request)) return fail("CLAIM_REQUEST_INVALID");
  const allowed = new Set(spec.params.map((param) => param[1]));
  const extra = Object.keys(request).filter((name) => !allowed.has(name));
  if (extra.length > 0) return fail("CLIENT_AUTHORITY_FIELD_REJECTED", extra.join(","));

  const args = {};
  for (const [sqlName, requestKey, validate, defaultValue] of spec.params) {
    const provided = Object.prototype.hasOwnProperty.call(request, requestKey) && request[requestKey] !== undefined;
    let value;
    if (provided) value = request[requestKey];
    else if (defaultValue !== undefined) value = defaultValue;
    else return fail("CLAIM_REQUEST_INVALID", `${requestKey}_MISSING`);
    if (!validate(value)) return fail(codeForKey(requestKey), `${requestKey}_INVALID`);
    args[sqlName] = value;
  }

  if (binding) {
    const checked = validateRuntimeBinding(binding);
    if (!checked.ok) return checked;
    if ("environment" in request && request.environment !== checked.environment) return fail("ENVIRONMENT_INVALID", "ENVIRONMENT_BINDING_MISMATCH");
    if ("projectRef" in request && request.projectRef !== checked.projectRef) return fail("PROJECT_REF_MISMATCH", "PROJECT_REF_BINDING_MISMATCH");
  }
  if (key === "CLAIM") {
    const identity = checkBackupIdentity({ environment: args.p_environment, projectRef: args.p_project_ref });
    if (!identity.ok) return fail("PROJECT_REF_MISMATCH", identity.reason);
  }
  if (key === "TRANSITION_EXECUTION" && !isPipelineExecutionEdge(args.p_from_status, args.p_to_status)) {
    return fail("INVALID_TRANSITION");
  }
  if (key === "TRANSITION_EXECUTION"
    && (args.p_to_status === "FAILED" || args.p_to_status === "RECOVERY_REQUIRED")
    && args.p_failure_code === null) {
    return fail("CLAIM_REQUEST_INVALID", "failureCode_MISSING");
  }
  if (key === "MAINTENANCE_TRANSITION" && !isDbMaintenanceTransitionEdge(args.p_expected_phase, args.p_to_phase)) {
    return fail("INVALID_TRANSITION");
  }
  return { ok: true, name: spec.name, args };
}

function codeForKey(requestKey) {
  if (requestKey === "workerId") return "WORKER_ID_INVALID";
  if (requestKey === "environment") return "ENVIRONMENT_INVALID";
  if (requestKey === "projectRef") return "PROJECT_REF_MISMATCH";
  if (requestKey === "intent") return "CLAIM_INTENT_INVALID";
  return "CLAIM_REQUEST_INVALID";
}

// ── mapeamento de execução ───────────────────────────────────
/** JSON da RPC (camelCase, sem segredos) → domínio do executor. */
export function fromRuntimeExecutionJson(json) {
  if (!json || typeof json !== "object") return null;
  if (!isUuid(json.id) || !isUuid(json.planId) || !isDbEnvironment(json.environment)
    || !isExecutionStatus(json.status) || !Number.isInteger(json.leaseGeneration)) {
    return null;
  }
  return {
    id: json.id,
    planId: json.planId,
    environment: json.environment,
    projectRef: json.projectRef ?? null,
    status: json.status,
    correlationId: json.correlationId ?? null,
    workerId: json.workerId ?? null,
    leaseGeneration: json.leaseGeneration,
    heartbeatAt: json.heartbeatAt ?? null,
    leaseExpiresAt: json.leaseExpiresAt ?? null,
    startedAt: json.startedAt ?? null,
    completedAt: json.completedAt ?? null,
    claimedAt: json.claimedAt ?? null,
    lockReleasedAt: json.lockReleasedAt ?? null,
    mutationStartedAt: json.mutationStartedAt ?? null,
    reconciledAt: json.reconciledAt ?? null,
    failureCode: json.failureCode ?? null,
  };
}

const OK_OUTCOMES = Object.freeze([
  "CLAIMED",
  "REPLAYED",
  "HEARTBEAT_OK",
  "TRANSITIONED",
  "UNCHANGED",
  "RELEASED",
  "ALREADY_RELEASED",
  "RECONCILED",
  "FLAGGED_FAILED",
  "FLAGGED_RECOVERY_REQUIRED",
  "NOT_APPLICABLE",
  "LEASE_ALIVE",
]);

/** Resposta do transporte → resultado canônico (nunca ecoa mensagem/segredo). */
export function normalizeRuntimeResponse(key, response) {
  if (!response || typeof response !== "object") return fail("STORE_UNAVAILABLE");
  if (response.ok !== true) {
    const detail = response.error?.details ?? response.error?.detail ?? null;
    return fail(RUNTIME_RPC_ERROR_CODES.includes(detail) ? detail : "STORE_UNAVAILABLE");
  }
  const data = response.data;
  if (key === "COVERAGE_PROBE") return { ok: true, data };
  if (data == null) return { ok: true, outcome: "APPLIED" }; // RPCs void (manutenção)
  if (typeof data !== "object" || typeof data.outcome !== "string") return fail("STORE_UNAVAILABLE", "RESPONSE_SHAPE_INVALID");
  const execution = data.execution ? fromRuntimeExecutionJson(data.execution) : null;
  if (data.execution && !execution) return fail("STORE_UNAVAILABLE", "EXECUTION_SHAPE_INVALID");
  if (data.outcome === "LEASE_EXPIRED") return { ...fail("LEASE_EXPIRED"), outcome: data.outcome, execution };
  if (data.outcome === "LOCKED") {
    return { ...fail("LOCK_UNAVAILABLE"), outcome: "LOCKED", holder: data.holder ?? null };
  }
  if (!OK_OUTCOMES.includes(data.outcome)) return fail("STORE_UNAVAILABLE", "OUTCOME_UNKNOWN");
  return { ok: true, outcome: data.outcome, execution, planStatus: data.planStatus ?? null };
}

// ── transporte ───────────────────────────────────────────────
export const RUNTIME_TRANSPORT_METHODS = Object.freeze({
  claimExecution: "CLAIM",
  heartbeat: "HEARTBEAT",
  transitionExecution: "TRANSITION_EXECUTION",
  releaseLock: "RELEASE_LOCK",
  flagStale: "FLAG_STALE",
  reconcile: "RECONCILE",
  releaseReconciledLock: "RELEASE_RECONCILED_LOCK",
  maintenanceStart: "MAINTENANCE_START",
  maintenanceTransition: "MAINTENANCE_TRANSITION",
  maintenanceLoginGate: "MAINTENANCE_LOGIN_GATE",
  maintenanceAbortToNormal: "MAINTENANCE_ABORT_TO_NORMAL",
  readCoverageProbe: "COVERAGE_PROBE",
});

export function createDisabledRuntimeRpcTransport() {
  const transport = { enabled: false, transport: "DISABLED", disabledCode: "RUNTIME_RPC_TRANSPORT_NOT_ENABLED" };
  for (const method of Object.keys(RUNTIME_TRANSPORT_METHODS)) {
    transport[method] = async () => ({ ok: false, code: "RUNTIME_RPC_TRANSPORT_NOT_ENABLED", disabled: true });
  }
  return Object.freeze(transport);
}

/**
 * Transporte ligado a UM banco alvo (ambiente + project ref). `rpc(name, args)`
 * é injetado. `transport` explícito (SYNTHETIC em testes; LIVE só no I2D2).
 */
export function createRuntimeRpcTransport({ rpc, expectedEnvironment, expectedProjectRef, transport } = {}) {
  if (typeof rpc !== "function") throw new TypeError("createRuntimeRpcTransport: rpc injetado é obrigatório.");
  if (transport !== "SYNTHETIC" && transport !== "LIVE") {
    throw new TypeError("createRuntimeRpcTransport: transport explícito (SYNTHETIC|LIVE) é obrigatório.");
  }
  const binding = validateRuntimeBinding({ expectedEnvironment, expectedProjectRef });
  if (!binding.ok) throw new TypeError(`createRuntimeRpcTransport: binding inválido (${binding.code}).`);
  const bound = { expectedEnvironment: binding.environment, expectedProjectRef: binding.projectRef };

  const api = { enabled: true, transport, environment: binding.environment, projectRef: binding.projectRef };
  for (const [method, key] of Object.entries(RUNTIME_TRANSPORT_METHODS)) {
    api[method] = async (request = {}) => {
      const built = buildRuntimeRpcArgs(key, request, { binding: bound });
      if (!built.ok) return built;
      let response;
      try {
        response = await rpc(built.name, built.args);
      } catch {
        return fail("STORE_UNAVAILABLE");
      }
      return normalizeRuntimeResponse(key, response);
    };
  }
  return Object.freeze(api);
}

/**
 * Caller PostgREST com TUDO injetado: nada de process.env, nada de fetch
 * global. Recusa qualquer host diferente de `<projectRef>.supabase.co` do
 * banco esperado e qualquer RPC fora da allowlist. Os headers (credencial)
 * ficam só na closure; nunca são devolvidos nem logados.
 */
export function createPostgrestRpcCaller({ baseUrl, headers, fetchImpl, expectedEnvironment, expectedProjectRef } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("createPostgrestRpcCaller: fetchImpl injetado é obrigatório.");
  if (!headers || typeof headers !== "object") throw new TypeError("createPostgrestRpcCaller: headers injetados são obrigatórios.");
  const binding = validateRuntimeBinding({ expectedEnvironment, expectedProjectRef });
  if (!binding.ok) throw new TypeError(`createPostgrestRpcCaller: binding inválido (${binding.code}).`);
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("createPostgrestRpcCaller: baseUrl inválida.");
  }
  if (url.protocol !== "https:" || url.hostname !== `${binding.projectRef}.supabase.co`) {
    throw new TypeError("createPostgrestRpcCaller: baseUrl não pertence ao project ref esperado.");
  }
  const root = `https://${url.hostname}`;
  return async function rpc(name, args) {
    if (!RUNTIME_RPC_NAMES.includes(name)) return { ok: false, status: 0, error: { code: "RPC_NOT_ALLOWED" } };
    let response;
    try {
      response = await fetchImpl(`${root}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(args ?? {}),
      });
    } catch {
      return { ok: false, status: 0, error: { code: "TRANSPORT_ERROR" } };
    }
    const body = await response.text().then((raw) => (raw ? JSON.parse(raw) : null)).catch(() => null);
    if (response.ok) return { ok: true, status: response.status, data: body };
    return { ok: false, status: response.status, error: { code: body?.code ?? null, details: body?.details ?? null } };
  };
}
