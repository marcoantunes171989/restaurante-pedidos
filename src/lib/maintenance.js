// ════════════════════════════════════════════════════════════
//  Microgate 08-B3-B — Cliente HTTP do aviso de manutenção (frontend).
//
//  Único consumidor previsto: useMaintenanceState. Lê GET /api/maintenance
//  (leitura pública, sem Authorization) e valida defensivamente o payload —
//  nunca confia ciegamente no shape devolvido pela API. Nenhuma escrita,
//  nenhum write fence: isto é puramente informativo (fase NOTICE).
// ════════════════════════════════════════════════════════════

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

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isValidOptionalTimestamp(value) {
  return value == null || isValidIsoTimestamp(value);
}

function isValidOptionalMessage(value) {
  return value == null || typeof value === "string";
}

// Projeta o payload cru no contrato normalizado do frontend. Qualquer campo
// fora do esperado (phase fora do enum, epoch inválido, timestamps
// malformados, updatedAt ausente) invalida o state inteiro — nunca inventa
// um valor default para preencher a lacuna.
function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!VALID_PHASES.has(raw.phase)) return null;
  if (!Number.isInteger(raw.epoch) || raw.epoch < 0) return null;
  if (!isValidIsoTimestamp(raw.updatedAt)) return null;
  if (!isValidOptionalTimestamp(raw.fenceEffectiveAt)) return null;
  if (!isValidOptionalTimestamp(raw.noticeStartedAt)) return null;
  if (!isValidOptionalTimestamp(raw.scheduledFor)) return null;
  if (!isValidOptionalMessage(raw.messagePublic)) return null;

  return {
    phase: raw.phase,
    epoch: raw.epoch,
    fenceEffectiveAt: raw.fenceEffectiveAt ?? null,
    noticeStartedAt: raw.noticeStartedAt ?? null,
    scheduledFor: raw.scheduledFor ?? null,
    messagePublic: raw.messagePublic ?? null,
    updatedAt: raw.updatedAt,
  };
}

// Busca o estado público de manutenção. Retorna sempre { ok: true, state }
// ou { ok: false, error } — nenhuma exception escapa daqui, exceto
// AbortError (propagada intacta para o caller identificar/tratar).
export async function fetchMaintenanceState({ signal } = {}) {
  let response;
  try {
    response = await fetch("/api/maintenance", {
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return { ok: false, error: "MAINTENANCE_FETCH_FAILED" };
  }

  if (!response.ok) {
    return { ok: false, error: "MAINTENANCE_FETCH_FAILED" };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "MAINTENANCE_INVALID_PAYLOAD" };
  }

  if (!payload || typeof payload !== "object" || payload.ok !== true) {
    return { ok: false, error: "MAINTENANCE_INVALID_PAYLOAD" };
  }

  const state = normalizeState(payload.state);
  if (!state) {
    return { ok: false, error: "MAINTENANCE_INVALID_PAYLOAD" };
  }

  return { ok: true, state };
}
