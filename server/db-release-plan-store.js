// ════════════════════════════════════════════════════════════
//  PDB-I1C2 — Persistência server-side do plano de release DB.
//
//  Control plane interno (app_db_release_plans / migrations / events).
//  Sempre usa SUPABASE_URL da aplicação — environment do plano é
//  metadado (HML|PROD), NÃO um seletor de conexão.
//  Sem DELETE. Sem executor. Sem backup. Sem parser de schema.
//  Testes devem mockar estas funções. Nenhuma chamada live neste gate.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";
import { buildServiceRoleHeaders, isReleaseUuid } from "./release-store.js";
import { PLAN_LIFECYCLE_EVENT_TYPES, isMaintenanceEventType } from "./db-release-contract.js";

const PLANS_TABLE = "app_db_release_plans";
const MIGRATIONS_TABLE = "app_db_release_plan_migrations";
const EVENTS_TABLE = "app_maintenance_events";

const PLAN_SELECT = [
  "id",
  "environment",
  "target_release_sha",
  "base_sha",
  "plan_hash",
  "status",
  "scheduled_at",
  "created_at",
  "updated_at",
  "created_by",
  "approved_at",
  "approved_by",
  "readiness_generation",
  "migration_count",
].join(",");

const MIGRATION_SELECT = [
  "id",
  "plan_id",
  "migration_order",
  "filename",
  "git_blob",
  "sha256",
  "bytes",
  "classification",
  "created_at",
].join(",");

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

function restUrl(table, query = "") {
  return `${supabaseUrl()}/rest/v1/${table}${query}`;
}

async function parseJson(response) {
  try {
    const raw = await response.text();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function restRequest(query, { method = "GET", body, prefer, table, json = true } = {}) {
  const headers = buildServiceRoleHeaders({ json, prefer });
  if (!headers || !supabaseUrl()) {
    return { ok: false, error: "PLAN_STORE_UNAVAILABLE", status: 0 };
  }
  let response;
  try {
    response = await fetch(restUrl(table, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "PLAN_STORE_UNAVAILABLE", status: 0 };
  }
  const parsed = await parseJson(response);
  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
  };
}

export async function readCanonicalMigrationInventory() {
  return {
    ok: false,
    errorCode: "MIGRATION_INVENTORY_UNAVAILABLE",
    migrations: [],
  };
}

export async function createPlanRow(row) {
  const result = await restRequest("", {
    method: "POST",
    prefer: "return=representation",
    table: PLANS_TABLE,
    body: row,
  });
  if (!result.ok) return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  const created = Array.isArray(result.body) ? result.body[0] : result.body;
  if (!created?.id) return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  return { ok: true, row: created };
}

export async function getPlanRow(id) {
  if (!isReleaseUuid(id)) return { ok: false, error: "PLAN_ID_INVALID" };
  const result = await restRequest(
    `?select=${PLAN_SELECT}&id=eq.${encodeURIComponent(id)}&limit=2`,
    { method: "GET", table: PLANS_TABLE, json: false },
  );
  if (!result.ok) return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  if (!Array.isArray(result.body) || result.body.length !== 1) {
    return { ok: false, error: "PLAN_NOT_FOUND" };
  }
  return { ok: true, row: result.body[0] };
}

export async function listPlanRows({ limit = 50 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const result = await restRequest(
    `?select=${PLAN_SELECT}&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET", table: PLANS_TABLE, json: false },
  );
  if (!result.ok || !Array.isArray(result.body)) {
    return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  }
  return { ok: true, rows: result.body };
}

export async function listPlanMigrationRows(planId) {
  if (!isReleaseUuid(planId)) return { ok: false, error: "PLAN_ID_INVALID" };
  const result = await restRequest(
    `?select=${MIGRATION_SELECT}&plan_id=eq.${encodeURIComponent(planId)}&order=migration_order.asc&limit=500`,
    { method: "GET", table: MIGRATIONS_TABLE, json: false },
  );
  if (!result.ok || !Array.isArray(result.body)) {
    return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  }
  return { ok: true, rows: result.body };
}

export async function insertPlanMigrationRows(planId, rows) {
  if (!isReleaseUuid(planId)) return { ok: false, error: "PLAN_ID_INVALID" };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "MIGRATION_INVENTORY_EMPTY" };
  }
  const result = await restRequest("", {
    method: "POST",
    prefer: "return=minimal",
    table: MIGRATIONS_TABLE,
    body: rows,
  });
  if (result.status === 409) return { ok: false, error: "PLAN_CONFLICT" };
  if (!result.ok) return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  return { ok: true };
}

export async function transitionPlanRow({
  id,
  fromStatus,
  expectedUpdatedAt,
  expectedPlanHash,
  patch,
} = {}) {
  if (!isReleaseUuid(id) || !fromStatus || !patch || typeof patch !== "object") {
    return { ok: false, error: "PLAN_CONFLICT" };
  }
  const filters = [
    `id=eq.${encodeURIComponent(id)}`,
    `status=eq.${encodeURIComponent(fromStatus)}`,
  ];
  if (expectedUpdatedAt) {
    filters.push(`updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`);
  }
  if (expectedPlanHash) {
    filters.push(`plan_hash=eq.${encodeURIComponent(expectedPlanHash)}`);
  }
  const result = await restRequest(`?${filters.join("&")}`, {
    method: "PATCH",
    prefer: "return=representation",
    table: PLANS_TABLE,
    body: patch,
  });
  if (!result.ok) return { ok: false, error: "PLAN_STORE_UNAVAILABLE" };
  const updated = Array.isArray(result.body) ? result.body[0] : result.body;
  if (!updated?.id) return { ok: false, error: "PLAN_CONFLICT" };
  return { ok: true, row: updated };
}

export async function appendPlanEvent({
  planId,
  eventType,
  actorUserId = null,
  actorEmail = null,
  message = null,
  metadata = null,
} = {}) {
  if (!isReleaseUuid(planId) || !PLAN_LIFECYCLE_EVENT_TYPES.includes(eventType)) {
    return { ok: false, error: "PLAN_EVENT_INVALID_INPUT" };
  }
  if (!isMaintenanceEventType(eventType)) {
    return { ok: false, error: "PLAN_EVENT_INVALID_INPUT" };
  }
  const payload = {
    id: crypto.randomUUID(),
    maintenance_epoch: 0,
    release_id: null,
    event_type: eventType,
    source: "api",
    actor_user_id: isReleaseUuid(actorUserId) ? actorUserId : null,
    actor_email: typeof actorEmail === "string" ? actorEmail.trim().toLowerCase().slice(0, 160) || null : null,
    message: typeof message === "string" ? message.slice(0, 240) : null,
    metadata: {
      planId,
      ...(metadata && typeof metadata === "object" ? metadata : {}),
    },
  };
  const result = await restRequest("", {
    method: "POST",
    prefer: "return=minimal",
    table: EVENTS_TABLE,
    body: payload,
  });
  if (!result.ok) return { ok: false, error: "PLAN_EVENT_WRITE_FAILED" };
  return { ok: true };
}

export async function readPlanEvidence({ planId, nowMs = Date.now() } = {}) {
  const evaluatedAt = new Date(nowMs).toISOString();
  if (!isReleaseUuid(planId)) {
    return { ok: false, errorCode: "PLAN_ID_INVALID", evaluatedAt };
  }
  const loaded = await getPlanRow(planId);
  if (!loaded.ok) {
    return {
      ok: false,
      errorCode: loaded.error || "PLAN_EVIDENCE_UNAVAILABLE",
      evaluatedAt,
    };
  }
  const migrations = await listPlanMigrationRows(planId);
  if (!migrations.ok) {
    return { ok: false, errorCode: "PLAN_EVIDENCE_UNAVAILABLE", evaluatedAt };
  }
  return {
    ok: true,
    id: loaded.row.id,
    status: loaded.row.status,
    environment: loaded.row.environment,
    targetReleaseSha: loaded.row.target_release_sha,
    baseSha: loaded.row.base_sha,
    planHash: loaded.row.plan_hash,
    scheduledAt: loaded.row.scheduled_at,
    approvedAt: loaded.row.approved_at,
    approvedBy: loaded.row.approved_by,
    readinessGeneration: loaded.row.readiness_generation,
    updatedAt: loaded.row.updated_at,
    migrations: migrations.rows.map((row) => ({
      order: row.migration_order,
      filename: row.filename,
      gitBlob: row.git_blob ?? null,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    })),
    evaluatedAt,
  };
}
