// ════════════════════════════════════════════════════════════
//  MICROGATE 08-B2-A — Leitura server-side do Maintenance Write Fence.
//
//  Lê exclusivamente public.vw_app_maintenance_public (migration 140),
//  a projeção pública mínima do singleton de manutenção. Nenhuma escrita:
//  somente GET contra o REST do PostgREST. Reaplica buildServiceRoleHeaders
//  de server/release-store.js — mesmo padrão server-side já adotado pelo
//  projeto para autenticar contra o Supabase sem nunca expor a credencial
//  ao caller.
//
//  B15-A2 acrescenta leitura administrativa (readMaintenanceAdminState,
//  direto em app_maintenance_state — nunca exposta a anon/authenticated,
//  só chamada a partir de /api/maintenance com Bearer + Super Admin) e os
//  dois wrappers de escrita que consomem as RPCs já existentes das
//  migrations 153/156 (app_maintenance_orchestration_start/notice).
//  Nenhuma migration nova, nenhuma tabela/coluna/RPC nova — somente
//  chamadas HTTP ao contrato SQL já aplicado.
// ════════════════════════════════════════════════════════════

/* global process */
import { buildServiceRoleHeaders } from "./release-store.js";

const VIEW = "vw_app_maintenance_public";
const STATE_TABLE = "app_maintenance_state";
// Colunas reais de app_maintenance_state (migration 140) — leitura
// administrativa. Nunca inclui message_operator/abort_reason/
// created_by_user_id/created_by_email/updated_by_user_id (dados internos
// sem necessidade real para a tela B15).
const ADMIN_SELECT = [
  "phase", "version", "epoch", "release_id", "target_sha", "reason",
  "notice_started_at", "scheduled_for", "fence_effective_at", "drain_started_at",
  "quiet_since", "quiescent_at", "release_started_at", "smoke_started_at",
  "recovering_at", "completed_at", "aborted_at", "timeout_at", "result_code",
  "message_public", "updated_by_email", "updated_at", "created_at",
].join(",");
// Exatamente as 7 colunas públicas da view — nunca acrescentar coluna da
// tabela bruta (app_maintenance_state) aqui.
const PUBLIC_SELECT = "phase,epoch,fence_effective_at,notice_started_at,scheduled_for,message_public,updated_at";

// phase é enum discreto (migration 140): nunca comparar/ordenar lexicalmente.
const VALID_PHASES = new Set([
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

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isValidOptionalTimestamp(value) {
  return value === null || isValidIsoTimestamp(value);
}

function isValidOptionalMessage(value) {
  return value === null || typeof value === "string";
}

// Valida e projeta a linha crua do PostgREST no contrato público da API.
// Qualquer desvio do esperado (phase fora do enum, epoch inválido,
// updated_at ausente/inválido, timestamps opcionais malformados,
// message_public de tipo errado) retorna null — o caller trata isso como
// falha de integridade, nunca inventa um valor default.
function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  if (!VALID_PHASES.has(row.phase)) return null;
  if (!Number.isInteger(row.epoch) || row.epoch < 0) return null;
  if (!isValidIsoTimestamp(row.updated_at)) return null;
  if (!isValidOptionalTimestamp(row.fence_effective_at)) return null;
  if (!isValidOptionalTimestamp(row.notice_started_at)) return null;
  if (!isValidOptionalTimestamp(row.scheduled_for)) return null;
  if (!isValidOptionalMessage(row.message_public)) return null;

  return {
    phase: row.phase,
    epoch: row.epoch,
    fenceEffectiveAt: row.fence_effective_at ?? null,
    noticeStartedAt: row.notice_started_at ?? null,
    scheduledFor: row.scheduled_for ?? null,
    messagePublic: row.message_public ?? null,
    updatedAt: row.updated_at,
  };
}

// Leitura pública read-only do singleton de manutenção. Íntegro somente com
// EXATAMENTE 1 row — 0 ou 2+ rows é falha de integridade (nunca inventa
// NORMAL na ausência do singleton). Nenhum POST/PATCH/PUT/DELETE/RPC.
export async function readMaintenanceState() {
  const baseUrl = supabaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  const headers = buildServiceRoleHeaders();
  if (!headers) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  let response;
  try {
    // limit=2 (não 1): permite detectar violação do singleton (2+ rows) em
    // vez de mascará-la silenciosamente.
    response = await fetch(
      `${baseUrl}/rest/v1/${VIEW}?select=${PUBLIC_SELECT}&limit=2`,
      { method: "GET", headers },
    );
  } catch {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  if (!response.ok) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  let rows;
  try {
    rows = await response.json();
  } catch {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" };
  }

  const state = normalizeRow(rows[0]);
  if (!state) {
    return { ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" };
  }

  return { ok: true, state };
}

// ════════════════════════════════════════════════════════════
//  B15-A2 — Leitura administrativa (app_maintenance_state direto)
// ════════════════════════════════════════════════════════════

function isValidOptionalString(value) {
  return value === null || typeof value === "string";
}

// Mesma disciplina fail-closed de normalizeRow: qualquer desvio do formato
// esperado retorna null (nunca inventa default). release_id/target_sha
// vêm sempre juntos (NULL/NULL ou full/full) pelo binding_guard da
// migration 153, mas a validação aqui não assume isso — só tipa cada campo.
function normalizeAdminRow(row) {
  if (!row || typeof row !== "object") return null;
  if (!VALID_PHASES.has(row.phase)) return null;
  if (!Number.isInteger(row.version) || row.version < 0) return null;
  if (!Number.isInteger(row.epoch) || row.epoch < 0) return null;
  if (!isValidIsoTimestamp(row.updated_at)) return null;
  if (!isValidIsoTimestamp(row.created_at)) return null;

  const optionalTimestampFields = [
    "notice_started_at", "scheduled_for", "fence_effective_at", "drain_started_at",
    "quiet_since", "quiescent_at", "release_started_at", "smoke_started_at",
    "recovering_at", "completed_at", "aborted_at", "timeout_at",
  ];
  for (const field of optionalTimestampFields) {
    if (!isValidOptionalTimestamp(row[field])) return null;
  }

  if (!isValidOptionalString(row.reason)) return null;
  if (!isValidOptionalString(row.result_code)) return null;
  if (!isValidOptionalMessage(row.message_public)) return null;
  if (!isValidOptionalString(row.updated_by_email)) return null;
  if (!isValidOptionalString(row.release_id)) return null;
  if (!isValidOptionalString(row.target_sha)) return null;

  return {
    phase: row.phase,
    version: row.version,
    epoch: row.epoch,
    releaseId: row.release_id ?? null,
    targetSha: row.target_sha ?? null,
    reason: row.reason ?? null,
    noticeStartedAt: row.notice_started_at ?? null,
    scheduledFor: row.scheduled_for ?? null,
    fenceEffectiveAt: row.fence_effective_at ?? null,
    drainStartedAt: row.drain_started_at ?? null,
    quietSince: row.quiet_since ?? null,
    quiescentAt: row.quiescent_at ?? null,
    releaseStartedAt: row.release_started_at ?? null,
    smokeStartedAt: row.smoke_started_at ?? null,
    recoveringAt: row.recovering_at ?? null,
    completedAt: row.completed_at ?? null,
    abortedAt: row.aborted_at ?? null,
    timeoutAt: row.timeout_at ?? null,
    resultCode: row.result_code ?? null,
    messagePublic: row.message_public ?? null,
    updatedByEmail: row.updated_by_email ?? null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

// Leitura administrativa (service_role, nunca exposta diretamente ao
// browser — só via /api/maintenance?scope=admin com Bearer + Super Admin).
// Mesma disciplina fail-closed da leitura pública: exatamente 1 row, nunca
// inventa NORMAL na ausência do singleton. Nenhum POST/PATCH/PUT/DELETE.
export async function readMaintenanceAdminState() {
  const baseUrl = supabaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  const headers = buildServiceRoleHeaders();
  if (!headers) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  let response;
  try {
    response = await fetch(
      `${baseUrl}/rest/v1/${STATE_TABLE}?select=${ADMIN_SELECT}&scope=eq.global&limit=2`,
      { method: "GET", headers },
    );
  } catch {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  if (!response.ok) {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  let rows;
  try {
    rows = await response.json();
  } catch {
    return { ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" };
  }

  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" };
  }

  const state = normalizeAdminRow(rows[0]);
  if (!state) {
    return { ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" };
  }

  return { ok: true, state };
}

// ════════════════════════════════════════════════════════════
//  B15-A2 — RPCs de escrita (migrations 153/156, já aplicadas).
//  Nenhuma RPC nova: somente chamadas HTTP às funções públicas existentes.
//  Ambas retornam void — sucesso é HTTP 2xx (204 no content) sem body.
//  Falha: PostgREST devolve {code,details,hint,message} — "details" é o
//  detail sanitizado (STATE_CONFLICT/VERSION_CONFLICT/NOT_FOUND/
//  TARGET_MISMATCH/ACTIVE_RELEASE_CONFLICT) usado pelo raise exception das
//  migrations 153/156. Nunca repassa message/hint/stack ao caller.
// ════════════════════════════════════════════════════════════

const KNOWN_RPC_ERROR_CODES = new Set([
  "NOT_FOUND",
  "STATE_CONFLICT",
  "VERSION_CONFLICT",
  "TARGET_MISMATCH",
  "ACTIVE_RELEASE_CONFLICT",
  "INVALID_TRANSITION",
]);

function sanitizeRpcErrorCode(value) {
  return typeof value === "string" && KNOWN_RPC_ERROR_CODES.has(value) ? value : null;
}

async function callOrchestrationRpc(fnName, payload) {
  const baseUrl = supabaseUrl();
  if (!baseUrl) {
    return { ok: false, code: null };
  }

  const headers = buildServiceRoleHeaders({ json: true });
  if (!headers) {
    return { ok: false, code: null };
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, code: null };
  }

  if (response.ok) {
    return { ok: true };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    /* corpo não-JSON — details indisponível */
  }

  return { ok: false, code: sanitizeRpcErrorCode(body?.details) };
}

// public.app_maintenance_orchestration_start(uuid, text, uuid, text, text, jsonb)
// Actor SEMPRE vem da sessão autenticada (operator resolvido em
// /api/maintenance) — nunca do body do client. targetSha SEMPRE vem da
// release já revalidada no servidor (server/release-store.js), nunca do
// que o browser enviou.
export async function startMaintenanceOrchestration({
  releaseId,
  targetSha,
  actorUserId,
  actorEmail,
  reason,
  metadata,
}) {
  return callOrchestrationRpc("app_maintenance_orchestration_start", {
    p_release_id: releaseId,
    p_target_sha: targetSha,
    p_actor_user_id: actorUserId ?? null,
    p_actor_email: actorEmail ?? null,
    p_reason: reason ?? null,
    p_metadata: metadata ?? null,
  });
}

// public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb)
// expectedVersion vem sempre do último state administrativo carregado pelo
// client (nunca digitado manualmente) — o RPC faz o CAS real; o servidor
// só valida o tipo (inteiro >= 0) antes de repassar.
export async function noticeMaintenanceOrchestration({
  expectedVersion,
  actorUserId,
  actorEmail,
  reason,
  messagePublic,
  scheduledFor,
  metadata,
}) {
  return callOrchestrationRpc("app_maintenance_orchestration_notice", {
    p_expected_version: expectedVersion,
    p_actor_user_id: actorUserId ?? null,
    p_actor_email: actorEmail ?? null,
    p_reason: reason ?? null,
    p_message_public: messagePublic ?? null,
    p_scheduled_for: scheduledFor ?? null,
    p_metadata: metadata ?? null,
  });
}
