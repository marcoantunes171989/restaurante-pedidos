// ════════════════════════════════════════════════════════════
//  PDB-I1C1 — Adapters read-only de evidência de readiness DB.
//
//  Somente GET PostgREST / RPC STABLE / GitHub preflight GET.
//  Nenhuma mutação de manutenção, plano, backup, schema ou Git.
// ════════════════════════════════════════════════════════════

/* global process */
import { SHA_RE, runPreflight } from "./release-core.js";
import { buildServiceRoleHeaders } from "./release-store.js";
import { ZERO_PROOF_RPC } from "./session-admission-contract.js";
import { isLoginGateState, isMaintenancePhase } from "./db-release-contract.js";
import {
  buildReadinessSnapshot,
  failClosedSnapshot,
} from "./db-release-readiness.js";
import { readPlanEvidence } from "./db-release-plan-store.js";

const STATE_TABLE = "app_maintenance_state";
const OPERATIONS_TABLE = "app_maintenance_operations";

const READINESS_STATE_SELECT = [
  "phase",
  "version",
  "epoch",
  "release_id",
  "target_sha",
  "login_gate",
  "plan_kind",
  "db_plan_id",
  "fence_effective_at",
  "quiet_since",
  "quiescent_at",
  "updated_at",
].join(",");

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isValidOptionalTimestamp(value) {
  return value === null || value === undefined || isValidIsoTimestamp(value);
}

function isValidOptionalString(value) {
  return value == null || typeof value === "string";
}

export async function readGitReadinessEvidence({ releaseSha, nowMs = Date.now() } = {}) {
  try {
    const requested = SHA_RE.test(releaseSha || "") ? releaseSha : undefined;
    const preflight = await runPreflight(requested);
    const blockers = Array.isArray(preflight?.blockers) ? preflight.blockers : [];
    const unavailable = blockers.some((item) => item?.code === "GITHUB_UNAVAILABLE");
    const evaluatedAt = preflight?.generatedAt || nowIso(nowMs);
    if (unavailable) {
      return { ok: false, errorCode: "GITHUB_UNAVAILABLE", evaluatedAt };
    }
    const observedReleaseSha = SHA_RE.test(preflight?.source?.sha || "") ? preflight.source.sha : null;
    const baseSha = SHA_RE.test(preflight?.destination?.sha || "") ? preflight.destination.sha : null;
    if (!observedReleaseSha || !baseSha) {
      return { ok: false, errorCode: "GITHUB_UNAVAILABLE", evaluatedAt };
    }
    return {
      ok: true,
      releaseSha: observedReleaseSha,
      baseSha,
      relation: {
        ahead: preflight.compare?.ahead ?? null,
        behind: preflight.compare?.behind ?? null,
        fastForward: preflight.compare?.fastForward === true,
        status: preflight.compare?.status || "UNKNOWN",
      },
      drift: blockers.some((item) => item?.code === "TARGET_SHA_CHANGED"),
      evaluatedAt,
    };
  } catch {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE", evaluatedAt: nowIso(nowMs) };
  }
}

function normalizeMaintenanceEvidence(row, evaluatedAt) {
  if (!row || typeof row !== "object") return null;
    if (!isMaintenancePhase(row.phase)) return null;
  if (!Number.isInteger(row.version) || row.version < 0) return null;
  if (!Number.isInteger(row.epoch) || row.epoch < 0) return null;
  if (!isValidIsoTimestamp(row.updated_at)) return null;
  if (!isValidOptionalTimestamp(row.fence_effective_at)) return null;
  if (!isValidOptionalTimestamp(row.quiet_since)) return null;
  if (!isValidOptionalTimestamp(row.quiescent_at)) return null;
  if (!isValidOptionalString(row.release_id)) return null;
  if (!isValidOptionalString(row.target_sha)) return null;
  if (!isValidOptionalString(row.plan_kind)) return null;
  if (!isValidOptionalString(row.db_plan_id)) return null;
  const loginGate = row.login_gate ?? null;
  if (loginGate != null && !isLoginGateState(loginGate)) return null;
  return {
    ok: true,
    phase: row.phase,
    version: row.version,
    epoch: row.epoch,
    loginGate,
    binding: {
      releaseId: row.release_id ?? null,
      targetSha: row.target_sha ?? null,
      planKind: row.plan_kind ?? null,
      dbPlanId: row.db_plan_id ?? null,
    },
    fenceEffectiveAt: row.fence_effective_at ?? null,
    quietSince: row.quiet_since ?? null,
    quiescentAt: row.quiescent_at ?? null,
    updatedAt: row.updated_at,
    evaluatedAt,
  };
}

export async function readMaintenanceReadinessEvidence({ nowMs = Date.now() } = {}) {
  const evaluatedAt = nowIso(nowMs);
  const baseUrl = supabaseUrl();
  const headers = buildServiceRoleHeaders();
  if (!baseUrl || !headers) {
    return { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt };
  }
  let response;
  try {
    response = await fetch(
      `${baseUrl}/rest/v1/${STATE_TABLE}?select=${READINESS_STATE_SELECT}&scope=eq.global&limit=2`,
      { method: "GET", headers },
    );
  } catch {
    return { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt };
  }
  if (!response.ok) {
    return { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt };
  }
  let rows;
  try {
    rows = await response.json();
  } catch {
    return { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt };
  }
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, errorCode: "MAINTENANCE_STATE_INTEGRITY_ERROR", evaluatedAt };
  }
  const evidence = normalizeMaintenanceEvidence(rows[0], evaluatedAt);
  if (!evidence) {
    return { ok: false, errorCode: "MAINTENANCE_STATE_INTEGRITY_ERROR", evaluatedAt };
  }
  return evidence;
}

export async function readSessionZeroProof({ nowMs = Date.now() } = {}) {
  const evaluatedAt = nowIso(nowMs);
  const baseUrl = supabaseUrl();
  const headers = buildServiceRoleHeaders({ json: true });
  if (!baseUrl || !headers) {
    return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE", evaluatedAt };
  }
  let response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/rpc/${ZERO_PROOF_RPC}`, {
      method: "POST",
      headers,
      body: "{}",
    });
  } catch {
    return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE", evaluatedAt };
  }
  if (!response.ok) {
    return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE", evaluatedAt };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE", evaluatedAt };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_INVALID", evaluatedAt };
  }
  return {
    ok: true,
    unavailable: false,
    aliveSessionCount: payload.alive_session_count,
    staleSessionCount: payload.stale_session_count,
    heartbeatAfterGateCloseCount: payload.heartbeat_after_gate_close_count,
    evaluatedAt: isValidIsoTimestamp(payload.evaluated_at) ? payload.evaluated_at : evaluatedAt,
    maintenanceEpoch: payload.maintenance_epoch ?? null,
    maintenanceGeneration: payload.maintenance_generation ?? null,
  };
}

export async function readInFlightOperationsEvidence({ nowMs = Date.now() } = {}) {
  const evaluatedAt = nowIso(nowMs);
  const baseUrl = supabaseUrl();
  const headers = buildServiceRoleHeaders();
  if (!baseUrl || !headers) {
    return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt };
  }
  let response;
  try {
    response = await fetch(
      `${baseUrl}/rest/v1/${OPERATIONS_TABLE}?select=id&status=eq.IN_FLIGHT&limit=200`,
      { method: "GET", headers },
    );
  } catch {
    return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt };
  }
  if (!response.ok) {
    return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt };
  }
  let rows;
  try {
    rows = await response.json();
  } catch {
    return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt };
  }
  if (!Array.isArray(rows)) {
    return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt };
  }
  return {
    ok: true,
    coverageComplete: false,
    inFlightCount: rows.length,
    evaluatedAt,
  };
}

async function safeAdapter(label, fn, fallback) {
  try {
    return await fn();
  } catch {
    return { ...fallback, errorCode: fallback.errorCode || `${label}_FAILED` };
  }
}

export async function collectReadinessEvidence({
  releaseSha = null,
  planId = null,
  nowMs = Date.now(),
  adapters = {},
} = {}) {
  const git = await safeAdapter(
    "GIT",
    () => (adapters.git || readGitReadinessEvidence)({ releaseSha, nowMs }),
    { ok: false, errorCode: "GITHUB_UNAVAILABLE", evaluatedAt: nowIso(nowMs) },
  );
  const maintenance = await safeAdapter(
    "MAINTENANCE",
    () => (adapters.maintenance || readMaintenanceReadinessEvidence)({ nowMs }),
    { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE", evaluatedAt: nowIso(nowMs) },
  );
  const sessionZero = await safeAdapter(
    "SESSION_ZERO",
    () => (adapters.sessionZero || readSessionZeroProof)({ nowMs }),
    { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE", evaluatedAt: nowIso(nowMs) },
  );
  const inFlight = await safeAdapter(
    "IN_FLIGHT",
    () => (adapters.inFlight || readInFlightOperationsEvidence)({ nowMs }),
    { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE", evaluatedAt: nowIso(nowMs) },
  );
  let plan = { absent: true, ok: false, errorCode: "PLAN_EVIDENCE_ABSENT", evaluatedAt: nowIso(nowMs) };
  if (planId) {
    plan = await safeAdapter(
      "PLAN",
      () => (adapters.plan || readPlanEvidence)({ planId, nowMs }),
      { ok: false, errorCode: "PLAN_EVIDENCE_UNAVAILABLE", evaluatedAt: nowIso(nowMs) },
    );
  }
  return { git, maintenance, sessionZero, inFlight, plan };
}

export async function evaluateDbReleaseReadiness({
  releaseSha = null,
  baseSha = null,
  planId = null,
  scheduled = false,
  nowMs = Date.now(),
  adapters = {},
  stale = false,
} = {}) {
  try {
    const evidence = await collectReadinessEvidence({ releaseSha, planId, nowMs, adapters });
    const scheduledEffective = scheduled === true || evidence.plan?.status === "SCHEDULED";
    return buildReadinessSnapshot({
      evidence,
      releaseSha: releaseSha || evidence.plan?.targetReleaseSha || null,
      baseSha: baseSha || evidence.git?.baseSha || evidence.plan?.baseSha || null,
      planId: planId || evidence.plan?.id || null,
      scheduled: scheduledEffective,
      generation: evidence.plan?.readinessGeneration
        ?? evidence.maintenance?.version
        ?? null,
      nowMs,
      stale,
    });
  } catch {
    return failClosedSnapshot({
      nowMs,
      releaseSha,
      baseSha,
      planId,
      scheduled,
      reasonCode: "READINESS_EVALUATION_FAILED",
      message: "Avaliação de readiness falhou fechada.",
    });
  }
}
