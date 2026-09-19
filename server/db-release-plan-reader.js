// ════════════════════════════════════════════════════════════
//  PDB-I2C2 — Leitor PURO de plano DB sobre uma porta de store explícita.
//
//  Existe para que o caminho do executor (claim + pipeline) NÃO importe
//  db-release-plan.js — que arrasta db-release-plan-store.js e, por
//  `storeOf(deps) = deps.store || defaultStore`, teria um fallback silencioso
//  para o Supabase live. Aqui não há default: sem porta → falha fechada.
//
//  Porta exigida: getPlanRow(id) e listPlanMigrationRows(id) (mesmos nomes
//  do plan-store real). Sem rede, sem ambiente, sem DB.
// ════════════════════════════════════════════════════════════

import { isUuid } from "./db-backup-contract.js";

export function isPlanReadPort(store) {
  return Boolean(store)
    && typeof store.getPlanRow === "function"
    && typeof store.listPlanMigrationRows === "function";
}

export function isPlanTransitionPort(store) {
  return isPlanReadPort(store) && typeof store.transitionPlanRow === "function";
}

function fail(error, status) {
  return { ok: false, error, status };
}

export function migrationsFromRows(rows) {
  return (rows || [])
    .map((row) => ({
      order: row.migration_order ?? row.order,
      filename: row.filename,
      gitBlob: row.git_blob ?? row.gitBlob ?? null,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    }))
    .sort((left, right) => left.order - right.order);
}

export function toPublicPlanRecord(row, migrations) {
  return {
    id: row.id,
    environment: row.environment,
    targetReleaseSha: row.target_release_sha,
    baseSha: row.base_sha,
    planHash: row.plan_hash,
    status: row.status,
    scheduledAt: row.scheduled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    readinessGeneration: row.readiness_generation,
    migrationCount: row.migration_count,
    migrations,
  };
}

/** Lê plano + migrations congeladas pela porta. Nunca usa store default. */
export async function readDbReleasePlan(planId, { store } = {}) {
  if (!isPlanReadPort(store)) return fail("PLAN_STORE_REQUIRED", 503);
  if (!isUuid(planId)) return fail("PLAN_ID_INVALID", 400);
  const loaded = await store.getPlanRow(planId);
  if (!loaded?.ok) {
    return fail(loaded?.error || "PLAN_STORE_UNAVAILABLE", loaded?.error === "PLAN_NOT_FOUND" ? 404 : 503);
  }
  const listed = await store.listPlanMigrationRows(planId);
  if (!listed?.ok) return fail(listed?.error || "PLAN_STORE_UNAVAILABLE", 503);
  return { ok: true, plan: toPublicPlanRecord(loaded.row, migrationsFromRows(listed.rows)) };
}
