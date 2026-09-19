// Fixtures determinísticos do PDB-I2C1. Sem rede, sem segredo, sem processo.
// Migrations SAFE_AUTO são SINTÉTICAS — as migrations 160/161 reais são
// PROHIBITED e jamais servem de fixture de sucesso.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { KNOWN_PROJECT_REFS } from "../../../server/db-backup-contract.js";
import { analyzeMigrationSet, bindSafetyEvidence } from "../../../server/db-migration-safety.js";
import { frozenPlanIdentity } from "../../../server/db-release-plan-hash.js";
import { createMemoryExecutionStore } from "../../../server/db-release-execution-store.js";

export const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
export const MIN = 60_000;
export const SEC = 1000;
export const iso = (ms) => new Date(ms).toISOString();

export const PLAN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const PLAN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const PLAN_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const PLAN_HML = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const CORR_1 = "11111111-1111-4111-8111-111111111111";
export const CORR_2 = "22222222-2222-4222-8222-222222222222";
export const CORR_3 = "33333333-3333-4333-8333-333333333333";
export const APPROVER = "99999999-9999-4999-8999-999999999999";
export const TARGET_SHA = "a".repeat(40);
export const BASE_SHA = "b".repeat(40);
export const HML_REF = KNOWN_PROJECT_REFS.HML;
export const PROD_REF = KNOWN_PROJECT_REFS.PROD;

export const SAFE_SQL = Object.freeze([
  "comment on table public.pdb_fixture_a is 'a';",
  "comment on table public.pdb_fixture_b is 'b';",
]);

export function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function gitBlobOf(text) {
  const body = Buffer.from(text, "utf8");
  return crypto
    .createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
}

export function itemsFromSql(sqls, { prefix = "900" } = {}) {
  return sqls.map((sql, index) => ({
    order: index + 1,
    filename: `${prefix}${index + 1}_synthetic.sql`,
    sql,
    sha256: sha256(sql),
    bytes: Buffer.byteLength(sql, "utf8"),
    gitBlob: gitBlobOf(sql),
  }));
}

/** Plano congelado (linhas snake_case do store) + análise servidor. */
export function buildPlan({
  id = PLAN_A,
  environment = "PROD",
  status = "APPROVED",
  scheduledAt = null,
  sqls = SAFE_SQL,
  items = null,
  declaredClassification = null,
  approvedAt = iso(NOW - 60 * MIN),
  approvedBy = APPROVER,
  readinessGeneration = 3,
  targetSha = TARGET_SHA,
  baseSha = BASE_SHA,
} = {}) {
  const source = items || itemsFromSql(sqls);
  const analysis = analyzeMigrationSet(source);
  const migrations = source.map((item, index) => ({
    order: item.order,
    filename: item.filename,
    gitBlob: item.gitBlob,
    sha256: item.sha256,
    bytes: item.bytes,
    classification: declaredClassification || analysis.results[index].classification,
  }));
  const frozen = frozenPlanIdentity({
    environment,
    targetReleaseSha: targetSha,
    baseSha,
    migrations,
  });
  if (!frozen.ok) throw new Error(`fixture plan inválido: ${frozen.error}`);
  const row = {
    id,
    environment,
    target_release_sha: targetSha,
    base_sha: baseSha,
    plan_hash: frozen.planHash,
    status,
    scheduled_at: scheduledAt,
    created_at: iso(NOW - 120 * MIN),
    updated_at: iso(NOW - 60 * MIN),
    created_by: APPROVER,
    approved_at: ["APPROVED", "SCHEDULED", "RUNNING"].includes(status) ? approvedAt : null,
    approved_by: ["APPROVED", "SCHEDULED", "RUNNING"].includes(status) ? approvedBy : null,
    readiness_generation: readinessGeneration,
    migration_count: migrations.length,
  };
  const migrationRows = frozen.identity.migrations.map((item) => ({
    id: crypto.randomUUID(),
    plan_id: id,
    migration_order: item.order,
    filename: item.filename,
    git_blob: item.gitBlob,
    sha256: item.sha256,
    bytes: item.bytes,
    classification: item.classification,
  }));
  return {
    id,
    environment,
    row,
    migrationRows,
    items: source,
    analysis,
    planHash: frozen.planHash,
    targetSha,
    baseSha,
    approvedAt: row.approved_at,
    readinessGeneration,
    scheduledAt,
  };
}

export function createMemoryPlanStore(bundles = []) {
  const plans = new Map(bundles.map((bundle) => [bundle.id, {
    row: structuredClone(bundle.row),
    migrationRows: structuredClone(bundle.migrationRows),
  }]));
  return {
    async getPlanRow(id) {
      const found = plans.get(id);
      if (!found) return { ok: false, error: "PLAN_NOT_FOUND" };
      return { ok: true, row: structuredClone(found.row) };
    },
    async listPlanMigrationRows(id) {
      const found = plans.get(id);
      if (!found) return { ok: false, error: "PLAN_NOT_FOUND" };
      return { ok: true, rows: structuredClone(found.migrationRows) };
    },
    __patchRow(id, patch) {
      Object.assign(plans.get(id).row, patch);
    },
    __patchMigrationRow(id, index, patch) {
      Object.assign(plans.get(id).migrationRows[index], patch);
    },
  };
}

export function publicPlanFrom(bundle) {
  return {
    id: bundle.id,
    environment: bundle.environment,
    targetReleaseSha: bundle.targetSha,
    baseSha: bundle.baseSha,
    planHash: bundle.planHash,
    status: bundle.row.status,
    scheduledAt: bundle.row.scheduled_at,
    approvedAt: bundle.row.approved_at,
    approvedBy: bundle.row.approved_by,
    readinessGeneration: bundle.readinessGeneration,
  };
}

/** Coletor SERVIDOR de evidência T-time (o request nunca fornece evidência). */
export function createEvidenceCollector({
  bundles = [],
  git = null,
  hml = true,
  baseline = true,
  safety = "auto",
} = {}) {
  const byId = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  const calls = { count: 0 };
  const collect = async ({ plan, nowMs }) => {
    calls.count += 1;
    const bundle = byId.get(plan.id);
    const evidence = {
      git: git ?? {
        ok: true,
        releaseSha: plan.targetReleaseSha,
        baseSha: plan.baseSha,
        drift: false,
        evaluatedAt: iso(nowMs),
      },
    };
    if (safety === "auto" && bundle) {
      evidence.schemaSafety = bindSafetyEvidence({
        analysis: analyzeMigrationSet(bundle.items),
        planHash: plan.planHash,
        identities: plan.migrations,
        evaluatedAt: iso(nowMs),
      });
    } else if (safety && safety !== "auto") {
      evidence.schemaSafety = safety;
    }
    const overrides = [];
    if (hml) {
      overrides.push({
        key: "HML_VALIDATED",
        status: hml === true ? "VERIFIED" : hml,
        reasonCode: "FIXTURE_HML",
        evidenceAt: iso(nowMs),
        expiresAt: iso(nowMs + 45 * SEC),
      });
    }
    if (baseline) {
      overrides.push({
        key: "PROD_BASELINE_VERIFIED",
        status: baseline === true ? "VERIFIED" : baseline,
        reasonCode: "FIXTURE_BASELINE",
        evidenceAt: iso(nowMs),
        expiresAt: iso(nowMs + 45 * SEC),
      });
    }
    return { ok: true, evidence, gateOverrides: overrides };
  };
  collect.calls = calls;
  return collect;
}

export function createClock(startMs = NOW) {
  const clock = {
    ms: startMs,
    nowMs: () => clock.ms,
    set(ms) {
      clock.ms = ms;
    },
    advance(ms) {
      clock.ms += ms;
    },
  };
  return clock;
}

export function createAuditRecorder() {
  const events = [];
  return {
    events,
    async append(event) {
      events.push(structuredClone(event));
    },
  };
}

/** Mundo compartilhado: stores + clock; `depsFor(worker)` = worker distinto. */
export function createWorld({ bundles = [bundle0()], storeFaults = {}, collectorOptions = {} } = {}) {
  const planStore = createMemoryPlanStore(bundles);
  const executionStore = createMemoryExecutionStore({ faults: storeFaults });
  const clock = createClock();
  const audit = createAuditRecorder();
  const collectEvidence = createEvidenceCollector({ bundles, ...collectorOptions });
  const depsFor = (workerId = "worker-a", extra = {}) => ({
    planStore,
    executionStore,
    collectEvidence,
    clock,
    audit,
    worker: { id: workerId },
    ...extra,
  });
  return { planStore, executionStore, clock, audit, collectEvidence, depsFor, bundles };
}

function bundle0() {
  return buildPlan();
}

export function claimRequest(bundle, overrides = {}) {
  const { expected: expectedOverrides = {}, ...rest } = overrides;
  return {
    intent: bundle.row.status === "SCHEDULED" ? "SCHEDULED" : "IMMEDIATE",
    planId: bundle.id,
    correlationId: CORR_1,
    expected: {
      environment: bundle.environment,
      planHash: bundle.planHash,
      targetReleaseSha: bundle.targetSha,
      baseSha: bundle.baseSha,
      approvedAt: bundle.approvedAt,
      readinessGeneration: bundle.readinessGeneration,
      ...expectedOverrides,
    },
    ...rest,
  };
}
