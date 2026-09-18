// ════════════════════════════════════════════════════════════
//  PDB-I1C2 — Lifecycle server-side do plano de release DB.
//
//  Plano ≠ execução. Este módulo descreve/congela/valida/aprova/
//  agenda/cancela. Não executa migration, backup, maintenance,
//  login gate, scheduler nem EXECUTE_NOW.
//  I/O via store injetável (default: server/db-release-plan-store.js).
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import { parseScheduledAt } from "./release-core.js";
import { isReleaseUuid } from "./release-store.js";
import * as defaultStore from "./db-release-plan-store.js";
import {
  FUTURE_EXECUTE_NOW_BOUNDARY,
  PLAN_APPROVE_CONFIRMATION,
  PLAN_CANCEL_CONFIRMATION,
  PLAN_SCHEDULE_CONFIRMATION,
  SHA1_RE,
  canRequestPlanExecution,
  isDbEnvironment,
  isPlanCancelableStatus,
  isPlanExecutorOwnedStatus,
} from "./db-release-contract.js";
import {
  draftPlanHash,
  frozenPlanIdentity,
} from "./db-release-plan-hash.js";
import { applyServerMigrationClassifications } from "./db-migration-safety.js";

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function fail(error, status = 400) {
  return { ok: false, error, status };
}

function storeOf(deps) {
  return deps?.store || defaultStore;
}

function toPublicPlan(row, { migrations = null } = {}) {
  if (!row) return null;
  const status = row.status;
  return {
    id: row.id,
    environment: row.environment,
    targetReleaseSha: row.target_release_sha,
    baseSha: row.base_sha,
    planHash: row.plan_hash,
    status,
    scheduledAt: row.scheduled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    readinessGeneration: row.readiness_generation,
    migrationCount: row.migration_count,
    migrations: migrations
      ? migrations.map((item) => ({
        order: item.order ?? item.migration_order,
        filename: item.filename,
        gitBlob: item.gitBlob ?? item.git_blob ?? null,
        sha256: item.sha256,
        bytes: item.bytes,
        classification: item.classification,
      }))
      : undefined,
    canRequestExecution: canRequestPlanExecution(status),
    futureExecutionBoundary: FUTURE_EXECUTE_NOW_BOUNDARY,
    executionCreated: false,
    prodAccessAuthorized: false,
  };
}

function alreadyApplied(row, migrations) {
  return {
    ok: true,
    alreadyApplied: true,
    plan: toPublicPlan(row, { migrations }),
  };
}

function success(row, { migrations = null, alreadyApplied: applied = false } = {}) {
  return {
    ok: true,
    alreadyApplied: applied === true,
    plan: toPublicPlan(row, { migrations }),
  };
}

function migrationsFromRows(rows) {
  return (rows || []).map((row) => ({
    order: row.migration_order ?? row.order,
    filename: row.filename,
    gitBlob: row.git_blob ?? row.gitBlob ?? null,
    sha256: row.sha256,
    bytes: row.bytes,
    classification: row.classification,
  }));
}

function hashFromStored(row, migrationRows) {
  const frozen = frozenPlanIdentity({
    environment: row.environment,
    targetReleaseSha: row.target_release_sha,
    baseSha: row.base_sha,
    migrations: migrationsFromRows(migrationRows),
  });
  if (!frozen.ok) return frozen;
  return frozen;
}

async function loadPlan(store, id) {
  if (!isReleaseUuid(id)) return fail("PLAN_ID_INVALID", 400);
  const loaded = await store.getPlanRow(id);
  if (!loaded.ok) {
    const status = loaded.error === "PLAN_NOT_FOUND" ? 404 : 503;
    return fail(loaded.error || "PLAN_STORE_UNAVAILABLE", status);
  }
  return { ok: true, row: loaded.row };
}

export function toPublicDbPlan(row, extras) {
  return toPublicPlan(row, extras);
}

export async function createDbReleasePlan(input, deps = {}) {
  const store = storeOf(deps);
  const environment = input?.environment;
  const targetReleaseSha = input?.targetReleaseSha;
  const baseSha = input?.baseSha;
  if (!isDbEnvironment(environment)) return fail("ENVIRONMENT_INVALID", 400);
  if (!SHA1_RE.test(targetReleaseSha || "") || !SHA1_RE.test(baseSha || "")) {
    return fail("SHA_INVALID", 400);
  }
  const draft = draftPlanHash({ environment, targetReleaseSha, baseSha });
  if (!draft.ok) return fail(draft.error, 400);

  const actorUserId = isReleaseUuid(deps.actor?.userId) ? deps.actor.userId : null;
  const now = nowIso(deps.nowMs);
  const row = {
    id: crypto.randomUUID(),
    environment,
    target_release_sha: targetReleaseSha,
    base_sha: baseSha,
    plan_hash: draft.planHash,
    status: "DRAFT",
    scheduled_at: null,
    created_at: now,
    updated_at: now,
    created_by: actorUserId,
    approved_at: null,
    approved_by: null,
    readiness_generation: 0,
    migration_count: 0,
  };
  const created = await store.createPlanRow(row);
  if (!created.ok) return fail(created.error || "PLAN_STORE_UNAVAILABLE", 503);
  await store.appendPlanEvent({
    planId: created.row.id,
    eventType: "DB_PLAN_CREATED",
    actorUserId,
    actorEmail: deps.actor?.email || null,
    message: "Plano DB criado em DRAFT.",
    metadata: {
      environment,
      targetReleaseSha,
      baseSha,
      planHash: draft.planHash,
      prodAccessAuthorized: false,
    },
  });
  return success(created.row, { migrations: [] });
}

export async function getDbReleasePlan(id, deps = {}) {
  const store = storeOf(deps);
  const loaded = await loadPlan(store, id);
  if (!loaded.ok) return loaded;
  const migrations = await store.listPlanMigrationRows(id);
  if (!migrations.ok) return fail(migrations.error || "PLAN_STORE_UNAVAILABLE", 503);
  return success(loaded.row, { migrations: migrationsFromRows(migrations.rows) });
}

export async function listDbReleasePlans(deps = {}) {
  const store = storeOf(deps);
  const listed = await store.listPlanRows({ limit: deps.limit });
  if (!listed.ok) return fail(listed.error || "PLAN_STORE_UNAVAILABLE", 503);
  return {
    ok: true,
    plans: listed.rows.map((row) => toPublicPlan(row)),
  };
}

export async function validateDbReleasePlan(input, deps = {}) {
  const store = storeOf(deps);
  const loaded = await loadPlan(store, input?.id);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  const existing = await store.listPlanMigrationRows(row.id);
  if (!existing.ok) return fail(existing.error || "PLAN_STORE_UNAVAILABLE", 503);
  const existingMigrations = migrationsFromRows(existing.rows);

  if (row.status === "VALIDATED") {
    const frozen = hashFromStored(row, existing.rows);
    if (!frozen.ok || frozen.planHash !== row.plan_hash) {
      return fail("PLAN_HASH_MISMATCH", 409);
    }
    return alreadyApplied(row, existingMigrations);
  }
  if (row.status !== "DRAFT") return fail("INVALID_TRANSITION", 409);

  const inventory = await store.readCanonicalMigrationInventory();
  if (!inventory || inventory.ok !== true) {
    return fail(inventory?.errorCode || "MIGRATION_INVENTORY_UNAVAILABLE", 503);
  }
  const classified = applyServerMigrationClassifications(inventory.migrations);
  if (!classified.ok) return fail(classified.error, 400);
  const frozen = frozenPlanIdentity({
    environment: row.environment,
    targetReleaseSha: row.target_release_sha,
    baseSha: row.base_sha,
    migrations: classified.migrations,
  });
  if (!frozen.ok) return fail(frozen.error, 400);

  if (existing.rows.length > 0) {
    const current = hashFromStored(row, existing.rows);
    if (!current.ok || current.planHash !== frozen.planHash) {
      return fail("PLAN_CONFLICT", 409);
    }
  } else {
    const inserted = await store.insertPlanMigrationRows(
      row.id,
      frozen.identity.migrations.map((item) => ({
        id: crypto.randomUUID(),
        plan_id: row.id,
        migration_order: item.order,
        filename: item.filename,
        git_blob: item.gitBlob,
        sha256: item.sha256,
        bytes: item.bytes,
        classification: item.classification,
      })),
    );
    if (!inserted.ok) return fail(inserted.error || "PLAN_STORE_UNAVAILABLE", inserted.error === "PLAN_CONFLICT" ? 409 : 503);
  }

  const patched = await store.transitionPlanRow({
    id: row.id,
    fromStatus: "DRAFT",
    expectedUpdatedAt: row.updated_at,
    expectedPlanHash: row.plan_hash,
    patch: {
      status: "VALIDATED",
      plan_hash: frozen.planHash,
      migration_count: frozen.identity.migrations.length,
      updated_at: nowIso(deps.nowMs),
      readiness_generation: Number(row.readiness_generation || 0) + 1,
    },
  });
  if (!patched.ok) return fail(patched.error || "PLAN_CONFLICT", 409);
  await store.appendPlanEvent({
    planId: row.id,
    eventType: "DB_PLAN_VALIDATED",
    actorUserId: deps.actor?.userId,
    actorEmail: deps.actor?.email || null,
    message: "Identidade de migrations congelada.",
    metadata: {
      planHash: frozen.planHash,
      migrationCount: frozen.identity.migrations.length,
    },
  });
  return success(patched.row, { migrations: frozen.identity.migrations });
}

export async function approveDbReleasePlan(input, deps = {}) {
  const store = storeOf(deps);
  if (input?.confirmation !== PLAN_APPROVE_CONFIRMATION) {
    return fail("CONFIRMATION_INVALID", 400);
  }
  const actorUserId = isReleaseUuid(deps.actor?.userId) ? deps.actor.userId : null;
  if (!actorUserId) return fail("ACTOR_ID_REQUIRED", 400);

  const loaded = await loadPlan(store, input?.id);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  const listed = await store.listPlanMigrationRows(row.id);
  if (!listed.ok) return fail(listed.error || "PLAN_STORE_UNAVAILABLE", 503);

  if (row.status === "APPROVED") {
    const frozen = hashFromStored(row, listed.rows);
    if (!frozen.ok || frozen.planHash !== row.plan_hash) {
      return fail("PLAN_HASH_MISMATCH", 409);
    }
    return alreadyApplied(row, frozen.identity.migrations);
  }
  if (row.status !== "VALIDATED") return fail("INVALID_TRANSITION", 409);

  const frozen = hashFromStored(row, listed.rows);
  if (!frozen.ok || frozen.planHash !== row.plan_hash) {
    return fail("PLAN_HASH_MISMATCH", 409);
  }

  const approvedAt = nowIso(deps.nowMs);
  const patched = await store.transitionPlanRow({
    id: row.id,
    fromStatus: "VALIDATED",
    expectedUpdatedAt: row.updated_at,
    expectedPlanHash: row.plan_hash,
    patch: {
      status: "APPROVED",
      approved_at: approvedAt,
      approved_by: actorUserId,
      updated_at: approvedAt,
      readiness_generation: Number(row.readiness_generation || 0) + 1,
    },
  });
  if (!patched.ok) return fail(patched.error || "PLAN_CONFLICT", 409);
  await store.appendPlanEvent({
    planId: row.id,
    eventType: "DB_PLAN_APPROVED",
    actorUserId,
    actorEmail: deps.actor?.email || null,
    message: "Plano DB aprovado.",
    metadata: { planHash: row.plan_hash, approvedAt },
  });
  return success(patched.row, { migrations: frozen.identity.migrations });
}

export async function scheduleDbReleasePlan(input, deps = {}) {
  const store = storeOf(deps);
  if (input?.confirmation !== PLAN_SCHEDULE_CONFIRMATION) {
    return fail("CONFIRMATION_INVALID", 400);
  }
  const scheduled = parseScheduledAt(input?.scheduledAt, deps.nowMs ?? Date.now());
  if (!scheduled.ok) return fail("SCHEDULE_TIME_INVALID", 400);

  const loaded = await loadPlan(store, input?.id);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  const listed = await store.listPlanMigrationRows(row.id);
  if (!listed.ok) return fail(listed.error || "PLAN_STORE_UNAVAILABLE", 503);

  if (row.status === "SCHEDULED") {
    const frozen = hashFromStored(row, listed.rows);
    if (!frozen.ok || frozen.planHash !== row.plan_hash) {
      return fail("PLAN_HASH_MISMATCH", 409);
    }
    if (row.scheduled_at === scheduled.utc) {
      return alreadyApplied(row, frozen.identity.migrations);
    }
    return fail("INVALID_TRANSITION", 409);
  }
  if (row.status !== "APPROVED") return fail("INVALID_TRANSITION", 409);

  const frozen = hashFromStored(row, listed.rows);
  if (!frozen.ok || frozen.planHash !== row.plan_hash) {
    return fail("PLAN_HASH_MISMATCH", 409);
  }

  const updatedAt = nowIso(deps.nowMs);
  const patched = await store.transitionPlanRow({
    id: row.id,
    fromStatus: "APPROVED",
    expectedUpdatedAt: row.updated_at,
    expectedPlanHash: row.plan_hash,
    patch: {
      status: "SCHEDULED",
      scheduled_at: scheduled.utc,
      updated_at: updatedAt,
      readiness_generation: Number(row.readiness_generation || 0) + 1,
    },
  });
  if (!patched.ok) return fail(patched.error || "PLAN_CONFLICT", 409);
  await store.appendPlanEvent({
    planId: row.id,
    eventType: "DB_PLAN_SCHEDULED",
    actorUserId: deps.actor?.userId,
    actorEmail: deps.actor?.email || null,
    message: "Intenção de agenda persistida. Executor não iniciado.",
    metadata: {
      planHash: row.plan_hash,
      scheduledAt: scheduled.utc,
      executionCreated: false,
      backupTriggered: false,
      maintenanceStarted: false,
    },
  });
  return success(patched.row, { migrations: frozen.identity.migrations });
}

export async function cancelDbReleasePlan(input, deps = {}) {
  const store = storeOf(deps);
  if (input?.confirmation !== PLAN_CANCEL_CONFIRMATION) {
    return fail("CONFIRMATION_INVALID", 400);
  }
  const loaded = await loadPlan(store, input?.id);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  const listed = await store.listPlanMigrationRows(row.id);
  if (!listed.ok) return fail(listed.error || "PLAN_STORE_UNAVAILABLE", 503);
  const migrations = migrationsFromRows(listed.rows);

  if (row.status === "CANCELED") return alreadyApplied(row, migrations);
  if (isPlanExecutorOwnedStatus(row.status) || !isPlanCancelableStatus(row.status)) {
    return fail("INVALID_TRANSITION", 409);
  }

  const patched = await store.transitionPlanRow({
    id: row.id,
    fromStatus: row.status,
    expectedUpdatedAt: row.updated_at,
    expectedPlanHash: row.plan_hash,
    patch: {
      status: "CANCELED",
      updated_at: nowIso(deps.nowMs),
      readiness_generation: Number(row.readiness_generation || 0) + 1,
    },
  });
  if (!patched.ok) return fail(patched.error || "PLAN_CONFLICT", 409);
  return success(patched.row, { migrations });
}
