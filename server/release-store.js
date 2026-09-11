// ════════════════════════════════════════════════════════════
//  Persistência server-side do registry de releases.
//  Usa somente SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//  Nunca exporta a service role nem envia credencial ao cliente.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";

const TABLE = "app_release_runs";
const EVENTS_TABLE = "app_release_events";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_MESSAGE_MAX = 240;
const EVENT_METADATA_MAX_JSON_BYTES = 4000;

// MICROGATE-07 — tipos de evento da timeline (app_release_events).
// Somente os tipos abaixo têm caminho real de emissão no backend; nenhum
// evento fictício é criado.
const EVENT_TYPES = new Set([
  "RELEASE_REQUESTED",
  "RELEASE_SCHEDULED",
  "RELEASE_VALIDATION_STARTED",
  "RELEASE_DISPATCHED",
  "RELEASE_RUNNING",
  "RELEASE_SUCCEEDED",
  "RELEASE_FAILED",
  "RELEASE_BLOCKED",
  "RELEASE_CANCELED",
  "RELEASE_REQUEUED",
]);

// Origem do evento: quem disparou a transição de estado real.
const EVENT_SOURCES = new Set(["api", "executor", "github_reconcile"]);

// createRelease é o único ponto que grava o estado inicial (sem status_from).
const CREATE_STATUS_TO_EVENT_TYPE = {
  REQUESTED: "RELEASE_REQUESTED",
  SCHEDULED: "RELEASE_SCHEDULED",
};

// transitionRelease só é chamado para os estados abaixo; SCHEDULED aqui é
// sempre um requeue (VALIDATING -> SCHEDULED), nunca a criação inicial —
// essa passa por createRelease, não por transitionRelease.
const TRANSITION_STATUS_TO_EVENT_TYPE = {
  SCHEDULED: "RELEASE_REQUEUED",
  VALIDATING: "RELEASE_VALIDATION_STARTED",
  DISPATCHED: "RELEASE_DISPATCHED",
  RUNNING: "RELEASE_RUNNING",
  SUCCEEDED: "RELEASE_SUCCEEDED",
  FAILED: "RELEASE_FAILED",
  BLOCKED: "RELEASE_BLOCKED",
  CANCELED: "RELEASE_CANCELED",
};

export const ACTIVE_RELEASE_STATUSES = [
  "REQUESTED",
  "SCHEDULED",
  "WAITING",
  "VALIDATING",
  "DISPATCHED",
  "RUNNING",
];

export const CANCELABLE_RELEASE_STATUSES = ["REQUESTED", "SCHEDULED", "WAITING"];

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 50;

const supabaseUrl = () => process.env.SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const viteSupabaseUrl = () => process.env.VITE_SUPABASE_URL || "";

const PROJECT_REF_RE = /^([a-z0-9-]{1,63})\.supabase\.co$/i;

// Extrai somente o project-ref do host Supabase (ex.: "zzixvyspwszewhxzusot").
// Nunca retorna a URL completa.
function extractProjectRef(url) {
  if (typeof url !== "string" || !url) return null;
  let hostname;
  try {
    hostname = new URL(url.trim()).hostname;
  } catch {
    return null;
  }
  const match = hostname.match(PROJECT_REF_RE);
  return match ? match[1].toLowerCase() : null;
}

const SECRET_KEY_PREFIX = "sb_secret_";
const JWT_SHAPE_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// Classifica a service key sem nunca logar seu conteúdo.
// "secret"  → chave moderna sb_secret_...      (apikey apenas)
// "legacy"  → JWT legado com role=service_role (apikey + Authorization Bearer)
// "invalid" → qualquer outro formato ou role != service_role (fail closed)
export function classifyServiceKey(key) {
  if (typeof key !== "string" || !key) return { kind: "invalid" };
  if (key.startsWith(SECRET_KEY_PREFIX)) return { kind: "secret", key };
  if (JWT_SHAPE_RE.test(key)) {
    const payload = decodeJwtPayload(key);
    if (payload && payload.role === "service_role") {
      return { kind: "legacy", key };
    }
    return { kind: "invalid" };
  }
  return { kind: "invalid" };
}

// Constrói os headers de autenticação server-side a partir da service key
// configurada. Retorna null (fail closed) quando a chave não é reconhecida
// como service_role — nesse caso nenhuma request REST deve ser feita.
export function buildServiceRoleHeaders({ json = false, prefer } = {}) {
  const classification = classifyServiceKey(serviceKey());
  if (classification.kind === "invalid") return null;
  const headers = { apikey: classification.key, Accept: "application/json" };
  if (classification.kind === "legacy") {
    headers.authorization = `Bearer ${classification.key}`;
  }
  if (json) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 200) {
  return value == null ? null : String(value).trim().slice(0, max) || null;
}

export function isReleaseUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function clampHistoryLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.floor(parsed));
}

export function sanitizeErrorMessage(value) {
  const text = clean(value, ERROR_MESSAGE_MAX);
  if (!text) return null;
  return text
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/sk_live_\S+/gi, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, "[redacted]");
}

export function toPublicRelease(row) {
  if (!row) return null;
  return {
    releaseId: row.id,
    mode: row.mode,
    status: row.status,
    baseSha: row.base_sha,
    targetSha: row.target_sha,
    scheduledAt: row.scheduled_at || null,
    workflowRunId: row.workflow_run_id || null,
    githubRunId: row.github_run_id ?? null,
    githubRunUrl: row.github_run_url || null,
    vercelDeploymentId: row.vercel_deployment_id || null,
    vercelDeploymentUrl: row.vercel_deployment_url || null,
    requestedBy: {
      userId: row.requested_by_user_id || null,
      email: row.requested_by_email || null,
    },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    dispatchedAt: row.dispatched_at || null,
    completedAt: row.completed_at || null,
    canceledAt: row.canceled_at || null,
    resultCode: row.result_code || null,
    errorMessage: sanitizeErrorMessage(row.error_message),
  };
}

function restUrl(query = "", table = TABLE) {
  return `${supabaseUrl()}/rest/v1/${table}${query}`;
}

// Sanitiza metadata da timeline: só aceita objeto plano serializável e
// dentro de um teto de tamanho. Nunca lança — retorna null em vez de
// propagar erro para a transição real de estado.
function sanitizeEventMetadata(metadata) {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  let json;
  try {
    json = JSON.stringify(metadata);
  } catch {
    return null;
  }
  if (!json || json.length > EVENT_METADATA_MAX_JSON_BYTES) return null;
  return JSON.parse(json);
}

async function parseJson(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return { body: null, raw: "" };
  try {
    return { body: JSON.parse(raw), raw };
  } catch {
    return { body: null, raw };
  }
}

function firstRow(body) {
  if (Array.isArray(body)) return body[0] || null;
  if (body && typeof body === "object") return body;
  return null;
}

function isUniqueConflict(status, body) {
  if (status === 409) return true;
  const code = body?.code || body?.error;
  return code === "23505";
}

const POSTGREST_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

function sanitizePostgrestCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return POSTGREST_CODE_RE.test(trimmed) ? trimmed : null;
}

// Campos de diagnóstico comuns a qualquer estágio: nunca incluem a chave,
// prefixo de chave, JWT, headers ou a URL completa do Supabase.
function baseDiagnosticFields() {
  const url = supabaseUrl();
  const key = serviceKey();
  return {
    supabaseUrlConfigured: Boolean(url),
    serviceKeyConfigured: Boolean(key),
    serviceKeyKind: key ? classifyServiceKey(key).kind : "missing",
    supabaseProjectRef: extractProjectRef(url),
    viteSupabaseProjectRef: extractProjectRef(viteSupabaseUrl()),
  };
}

function buildDiagnostic(stage, {
  requestAttempted,
  httpStatus = null,
  postgrestCode = null,
  networkError = null,
} = {}) {
  return {
    stage,
    requestAttempted,
    httpStatus,
    postgrestCode,
    networkError,
    ...baseDiagnosticFields(),
  };
}

function emptyDiagnostic() {
  return buildDiagnostic(null, { requestAttempted: false });
}

// Diagnóstico sanitizado do estágio server-side em que a request falhou.
// Nunca inclui message/details/hint/raw body/URL completa/headers/credenciais.
function diagnosticFromResult(result) {
  return result?.diagnostic || emptyDiagnostic();
}

async function restRequest(query, { method = "GET", body, prefer, table = TABLE } = {}) {
  if (!supabaseUrl()) {
    return {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      diagnostic: buildDiagnostic("SUPABASE_URL_MISSING", { requestAttempted: false }),
    };
  }
  const headers = buildServiceRoleHeaders({ json: body !== undefined, prefer });
  if (!headers) {
    return {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      diagnostic: buildDiagnostic("SERVICE_KEY_INVALID", { requestAttempted: false }),
    };
  }
  try {
    const response = await fetch(restUrl(query, table), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const parsed = await parseJson(response);
    return {
      ok: response.ok,
      status: response.status,
      body: parsed.body,
      raw: parsed.raw,
      diagnostic: buildDiagnostic("POSTGREST_RESPONSE", {
        requestAttempted: true,
        httpStatus: response.status,
        postgrestCode: sanitizePostgrestCode(parsed.body?.code),
      }),
    };
  } catch {
    return {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      diagnostic: buildDiagnostic("FETCH_NETWORK_ERROR", { requestAttempted: true, networkError: true }),
    };
  }
}

// MICROGATE-07 — grava um evento append-only na timeline forense
// (app_release_events). Nunca lança: uma falha aqui não pode derrubar a
// transição real de estado do release em app_release_runs. Nunca chamado
// diretamente pela API/frontend — somente por createRelease,
// transitionRelease e claimReleaseForValidation, os únicos pontos que
// mutam o estado de um release.
export async function appendReleaseEvent({
  releaseId,
  eventType,
  statusFrom = null,
  statusTo = null,
  actorUserId = null,
  actorEmail = null,
  source,
  message = null,
  metadata = null,
} = {}) {
  if (!isReleaseUuid(releaseId) || !EVENT_TYPES.has(eventType) || !EVENT_SOURCES.has(source)) {
    return { ok: false, error: "RELEASE_EVENT_INVALID_INPUT" };
  }
  const payload = {
    id: crypto.randomUUID(),
    release_id: releaseId,
    event_type: eventType,
    status_from: clean(statusFrom, 40),
    status_to: clean(statusTo, 40),
    actor_user_id: isReleaseUuid(actorUserId) ? actorUserId : null,
    actor_email: clean(actorEmail, 160)?.toLowerCase() || null,
    source,
    message: sanitizeErrorMessage(message),
    metadata: sanitizeEventMetadata(metadata),
  };
  const result = await restRequest("", {
    method: "POST",
    prefer: "return=minimal",
    body: payload,
    table: EVENTS_TABLE,
  });
  if (!result.ok) {
    return { ok: false, error: "RELEASE_EVENT_WRITE_FAILED", diagnostic: diagnosticFromResult(result) };
  }
  return { ok: true };
}

export async function createRelease(input) {
  const payload = {
    id: input.id,
    mode: input.mode,
    status: input.status || "REQUESTED",
    base_sha: input.baseSha,
    target_sha: input.targetSha,
    scheduled_at: input.scheduledAt || null,
    workflow_run_id: input.workflowRunId || null,
    github_run_id: input.githubRunId ?? null,
    github_run_url: input.githubRunUrl || null,
    vercel_deployment_id: input.vercelDeploymentId || null,
    vercel_deployment_url: input.vercelDeploymentUrl || null,
    requested_by_user_id: input.requestedByUserId || null,
    requested_by_email: input.requestedByEmail || null,
    result_code: input.resultCode || null,
    error_message: sanitizeErrorMessage(input.errorMessage),
  };

  const result = await restRequest("", {
    method: "POST",
    prefer: "return=representation",
    body: payload,
  });

  if (isUniqueConflict(result.status, result.body)) {
    return { ok: false, conflict: true, error: "RELEASE_ALREADY_IN_PROGRESS" };
  }
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  const row = firstRow(result.body);
  if (!row?.id) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  const eventType = CREATE_STATUS_TO_EVENT_TYPE[row.status];
  if (eventType) {
    await appendReleaseEvent({
      releaseId: row.id,
      eventType,
      statusFrom: null,
      statusTo: row.status,
      actorUserId: row.requested_by_user_id || null,
      actorEmail: row.requested_by_email || null,
      source: "api",
    });
  }
  return { ok: true, row };
}

export async function getRelease(id) {
  if (!isReleaseUuid(id)) return { ok: false, error: "RELEASE_NOT_FOUND" };
  const result = await restRequest(`?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  const row = firstRow(result.body);
  if (!row) return { ok: false, error: "RELEASE_NOT_FOUND" };
  return { ok: true, row };
}

export async function listReleases({ limit = DEFAULT_HISTORY_LIMIT } = {}) {
  const safeLimit = clampHistoryLimit(limit);
  const result = await restRequest(
    `?select=*&order=created_at.desc&limit=${safeLimit}`,
  );
  if (!result.ok || !Array.isArray(result.body)) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  return { ok: true, rows: result.body, limit: safeLimit };
}

export async function findActiveRelease() {
  const statuses = ACTIVE_RELEASE_STATUSES.join(",");
  const result = await restRequest(
    `?status=in.(${statuses})&select=*&order=created_at.desc&limit=1`,
  );
  if (!result.ok) return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE" };
  return { ok: true, row: firstRow(result.body) };
}

export async function updateRelease(id, patch, { fromStatuses } = {}) {
  if (!isReleaseUuid(id)) return { ok: false, error: "RELEASE_NOT_FOUND" };
  const filters = [`id=eq.${encodeURIComponent(id)}`];
  if (Array.isArray(fromStatuses) && fromStatuses.length > 0) {
    filters.push(`status=in.(${fromStatuses.join(",")})`);
  }
  const body = {
    ...patch,
    updated_at: patch.updated_at || nowIso(),
  };
  if (Object.prototype.hasOwnProperty.call(body, "error_message")) {
    body.error_message = sanitizeErrorMessage(body.error_message);
  }
  const result = await restRequest(`?${filters.join("&")}`, {
    method: "PATCH",
    prefer: "return=representation",
    body,
  });
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  const row = firstRow(result.body);
  if (!row) return { ok: false, unchanged: true, error: "RELEASE_STATUS_CONFLICT" };
  return { ok: true, row };
}

export async function transitionRelease(id, {
  fromStatuses,
  status,
  resultCode = null,
  errorMessage = null,
  extra = {},
  event = null,
} = {}) {
  const terminal = ["SUCCEEDED", "FAILED", "BLOCKED", "CANCELED"].includes(status);
  const patch = {
    status,
    result_code: resultCode,
    error_message: errorMessage,
    ...extra,
  };
  if (status === "DISPATCHED" && !patch.dispatched_at) patch.dispatched_at = nowIso();
  if (status === "CANCELED" && !patch.canceled_at) patch.canceled_at = nowIso();
  if (terminal && !patch.completed_at) patch.completed_at = nowIso();
  const result = await updateRelease(id, patch, { fromStatuses });
  // Só grava evento quando a transição realmente aconteceu (result.ok) —
  // um retry idempotente que não casa fromStatuses (unchanged/conflict)
  // não gera evento duplicado.
  if (result.ok && event) {
    const eventType = TRANSITION_STATUS_TO_EVENT_TYPE[status];
    if (eventType) {
      await appendReleaseEvent({
        releaseId: id,
        eventType,
        statusFrom: event.statusFrom ?? null,
        statusTo: status,
        actorUserId: event.actorUserId ?? null,
        actorEmail: event.actorEmail ?? null,
        source: event.source,
        message: event.message ?? null,
        metadata: event.metadata ?? null,
      });
    }
  }
  return result;
}

// RELEASE-AUTO-06B — candidatos do scheduler nativo (Supabase HML Cron →
// /api/releases-executor). Nenhuma migration nova: usa somente colunas já
// existentes em app_release_runs (mode, status, scheduled_at, updated_at).

// Release SCHEDULED cujo scheduled_at já venceu (<= now). A mais antiga
// primeiro. Nunca retorna mais de uma linha — o executor processa no
// máximo uma release por chamada.
export async function findDueScheduledRelease(nowIso) {
  const result = await restRequest(
    `?mode=eq.scheduled&status=eq.SCHEDULED&scheduled_at=lte.${encodeURIComponent(nowIso)}&select=*&order=scheduled_at.asc&limit=1`,
  );
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  return { ok: true, row: firstRow(result.body) };
}

// Release VALIDATING travada há mais tempo que o timeout de recuperação
// (claim perdido por execução interrompida). Permite ao executor retomar
// com idempotent=true em vez de deixá-la presa para sempre.
export async function findStaleValidatingRelease(staleBeforeIso) {
  const result = await restRequest(
    `?mode=eq.scheduled&status=eq.VALIDATING&updated_at=lte.${encodeURIComponent(staleBeforeIso)}&select=*&order=updated_at.asc&limit=1`,
  );
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  return { ok: true, row: firstRow(result.body) };
}

// Claim atômico (CAS) de um candidato observado por findDueScheduledRelease
// ou findStaleValidatingRelease: a PATCH só é aplicada se id+status+updated_at
// ainda casarem com o que foi lido — se outro executor já claimou a linha
// nesse meio-tempo, updated_at mudou e a PATCH não afeta nenhuma linha.
// Zero rows retornadas → claimLost: true (fail closed, sem chamada GitHub).
// Serve tanto para SCHEDULED -> VALIDATING quanto para renovar (mesmo
// status) VALIDATING stale -> VALIDATING com updated_at fresco.
export async function claimReleaseForValidation(release) {
  if (!release || !isReleaseUuid(release.id) || !release.status || !release.updated_at) {
    return { ok: false, error: "RELEASE_NOT_FOUND" };
  }
  const filters = [
    `id=eq.${encodeURIComponent(release.id)}`,
    `status=eq.${encodeURIComponent(release.status)}`,
    `updated_at=eq.${encodeURIComponent(release.updated_at)}`,
  ];
  const result = await restRequest(`?${filters.join("&")}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status: "VALIDATING", updated_at: nowIso() },
  });
  if (!result.ok) {
    return { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE", diagnostic: diagnosticFromResult(result) };
  }
  const row = firstRow(result.body);
  if (!row) return { ok: false, claimLost: true, error: "CLAIM_LOST" };
  // Só é uma transição real de estado (e gera evento) quando o release
  // ainda não estava VALIDATING. A renovação de claim stale
  // (VALIDATING -> VALIDATING com updated_at fresco) é o mesmo ciclo de
  // validação continuando — não deve duplicar RELEASE_VALIDATION_STARTED.
  if (release.status !== "VALIDATING") {
    await appendReleaseEvent({
      releaseId: row.id,
      eventType: "RELEASE_VALIDATION_STARTED",
      statusFrom: release.status,
      statusTo: "VALIDATING",
      source: "executor",
    });
  }
  return { ok: true, row };
}
