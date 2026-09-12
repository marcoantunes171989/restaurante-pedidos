// ════════════════════════════════════════════════════════════
//  MICROGATE 08-B2-A — Leitura server-side do Maintenance Write Fence.
//
//  Lê exclusivamente public.vw_app_maintenance_public (migration 140),
//  a projeção pública mínima do singleton de manutenção. Nenhuma escrita:
//  somente GET contra o REST do PostgREST. Reaplica buildServiceRoleHeaders
//  de server/release-store.js — mesmo padrão server-side já adotado pelo
//  projeto para autenticar contra o Supabase sem nunca expor a credencial
//  ao caller.
// ════════════════════════════════════════════════════════════

/* global process */
import { buildServiceRoleHeaders } from "./release-store.js";

const VIEW = "vw_app_maintenance_public";
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
