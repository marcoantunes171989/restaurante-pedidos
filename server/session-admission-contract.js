// ════════════════════════════════════════════════════════════
//  PDB-I1B — Contrato estático de admissão canônica de sessão.
//
//  Source comum futuro para I1C/I3C. Somente constantes congeladas e
//  helpers puros. Sem rede, sem DB, sem segredo, sem Realtime, sem
//  executor de drain.
// ════════════════════════════════════════════════════════════

import { ACCESS_HEARTBEAT_MS, ACCESS_PRESENCE } from "../src/lib/accessControl/constants.js";
import {
  isSessionSurface,
  SESSION_SURFACES,
  surfaceFromAppTab,
  surfaceFromPathname,
} from "../src/lib/accessControl/sessionSurfaces.js";
import { LOGIN_GATE_STATES } from "./db-release-contract.js";

export {
  SESSION_SURFACES,
  isSessionSurface,
  surfaceFromAppTab,
  surfaceFromPathname,
};

export const SESSION_STATUSES = Object.freeze(["ACTIVE", "CLOSED", "EXPIRED"]);

export const SESSION_ADMISSION_CODES = Object.freeze([
  "SESSION_ADMISSION_ALLOWED",
  "MAINTENANCE_LOGIN_LOCKED",
  "SESSION_EXPIRED",
  "SESSION_CLOSED",
  "SESSION_NOT_FOUND",
  "SESSION_FORBIDDEN",
]);

/** Phases incompatíveis com login funcional (PDB-A2), mesmo se login_gate driftar OPEN. */
export const LOGIN_INCOMPATIBLE_PHASES = Object.freeze([
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "BACKING_UP",
  "MIGRATING",
]);

/**
 * Heartbeat real do cliente (Controle de Acessos).
 * Evidência: ACCESS_HEARTBEAT_MS em src/lib/accessControl/constants.js
 * (useUserSessionHeartbeat). 45s — não um número inventado neste gate.
 */
export const HEARTBEAT_INTERVAL_SECONDS = ACCESS_HEARTBEAT_MS / 1000;

/**
 * TTL server-side de sessão viva.
 * Evidência:
 *  - heartbeat cliente = 45s
 *  - presença ONLINE no servidor (app_listar_sessoes) = 2 minutes
 *  - ACCESS_PRESENCE.ONLINE_MS = 120_000
 *  - ACCESS_PRESENCE.INATIVO_MS = 600_000 (abandono de UI, não alive PDB)
 *  - heartbeat de tab_dispositivos = 120s (independente; não governa PDB)
 *
 * 120s = limiar ONLINE já usado pelo banco para "sessão viva".
 * Ratio 120/45 ≈ 2.67 — cabe 1 heartbeat perdido + jitter sem expirar
 * falso-positivo. Relógio do cliente não entra no cálculo: expires_at =
 * now() + TTL no servidor.
 */
export const SELECTED_ALIVE_TTL_SECONDS = ACCESS_PRESENCE.ONLINE_MS / 1000;

/** Ratio mínimo: TTL deve sobreviver ao menos 1 miss + margem igual ao intervalo. */
export const MIN_TTL_RATIO = 2;

export const TTL_RATIO = SELECTED_ALIVE_TTL_SECONDS / HEARTBEAT_INTERVAL_SECONDS;

export const TTL_RATIONALE =
  "TTL=120s casa com ACCESS_PRESENCE.ONLINE_MS e com o intervalo '2 minutes' de app_listar_sessoes; heartbeat cliente=45s (ratio 2.67). Presença INATIVO (10min) é observabilidade de UI, não critério PDB de sessão viva.";

export const CANONICAL_SESSION_TABLE = "app_active_sessions";

export const START_RPC = "app_canonical_session_start";
export const HEARTBEAT_RPC = "app_canonical_session_heartbeat";
export const CLOSE_RPC = "app_canonical_session_close";
export const ZERO_PROOF_RPC = "app_canonical_session_zero_proof";
export const TTL_SECONDS_RPC = "app_canonical_session_ttl_seconds";

export const LOGIN_GATE_SOURCE = "app_maintenance_state.login_gate";

function frozenHas(list, value) {
  return list.includes(value);
}

export function isSessionStatus(value) {
  return frozenHas(SESSION_STATUSES, value);
}

export function isSessionAdmissionCode(value) {
  return frozenHas(SESSION_ADMISSION_CODES, value);
}

export function isLoginIncompatiblePhase(phase) {
  return frozenHas(LOGIN_INCOMPATIBLE_PHASES, phase);
}

export function isLoginGateOpen(loginGate) {
  return loginGate === "OPEN" && frozenHas(LOGIN_GATE_STATES, loginGate);
}

/**
 * Admissão funcional: login_gate OPEN e phase compatível.
 * Fail-closed se gate/phase ausentes.
 */
export function isFunctionalLoginAllowed({ loginGate, phase } = {}) {
  if (!isLoginGateOpen(loginGate)) return false;
  if (phase == null || phase === "") return false;
  if (isLoginIncompatiblePhase(phase)) return false;
  return true;
}

export function expiresAtFrom(fromMs, ttlSeconds = SELECTED_ALIVE_TTL_SECONDS, nowMs = fromMs) {
  const base = Number(fromMs);
  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(base) || !Number.isFinite(ttl) || ttl <= 0) return null;
  void nowMs;
  return base + ttl * 1000;
}

export function isCanonicalSessionAlive({ status, expiresAtMs, closedAtMs, nowMs }) {
  if (status !== "ACTIVE") return false;
  if (closedAtMs != null) return false;
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) return false;
  if (!Number.isFinite(nowMs)) return false;
  return expiresAtMs > nowMs;
}

export function isTtlSafeAgainstHeartbeat(
  ttlSeconds = SELECTED_ALIVE_TTL_SECONDS,
  heartbeatSeconds = HEARTBEAT_INTERVAL_SECONDS,
) {
  if (!(heartbeatSeconds > 0) || !(ttlSeconds > heartbeatSeconds)) return false;
  return ttlSeconds / heartbeatSeconds >= MIN_TTL_RATIO;
}

export function isActiveSessionCountZero({
  aliveSessionCount,
  heartbeatAfterGateCloseCount,
} = {}) {
  return Number(aliveSessionCount) === 0 && Number(heartbeatAfterGateCloseCount) === 0;
}
