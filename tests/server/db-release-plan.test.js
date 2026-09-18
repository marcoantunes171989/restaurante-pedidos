import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FUTURE_EXECUTE_NOW_BOUNDARY,
  PLAN_APPROVE_CONFIRMATION,
  PLAN_CANCEL_CONFIRMATION,
  PLAN_SCHEDULE_CONFIRMATION,
  PLAN_USER_TRANSITIONS,
  canRequestPlanExecution,
  isLegalPlanUserTransition,
  isPlanExecutorOwnedStatus,
} from "../../server/db-release-contract.js";
import {
  PLAN_HASH_ALGORITHM,
  PLAN_HASH_CANONICAL_VERSION,
  canonicalizePlanIdentity,
  computePlanHash,
  draftPlanHash,
  frozenPlanIdentity,
} from "../../server/db-release-plan-hash.js";
import {
  approveDbReleasePlan,
  cancelDbReleasePlan,
  createDbReleasePlan,
  scheduleDbReleasePlan,
  validateDbReleasePlan,
} from "../../server/db-release-plan.js";

const hashSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/db-release-plan-hash.js"),
  "utf8",
);
const planSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/db-release-plan.js"),
  "utf8",
);
const storeSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/db-release-plan-store.js"),
  "utf8",
);

const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
const TARGET = "a".repeat(40);
const BASE = "b".repeat(40);
const BLOB = "c".repeat(40);
const HASH_A = "d".repeat(64);
const HASH_B = "e".repeat(64);
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR = { userId: ACTOR_ID, email: "super@teste.com" };

const M1 = {
  order: 1,
  filename: "160_db_release_orchestrator_foundation.sql",
  gitBlob: BLOB,
  sha256: HASH_A,
  bytes: 120,
  classification: "REVIEW_REQUIRED",
};
const M2 = {
  order: 2,
  filename: "161_canonical_session_admission.sql",
  gitBlob: "f".repeat(40),
  sha256: HASH_B,
  bytes: 80,
  classification: "SAFE_AUTO",
};

function identity(overrides = {}) {
  return {
    environment: "HML",
    targetReleaseSha: TARGET,
    baseSha: BASE,
    migrations: [M1, M2],
    ...overrides,
  };
}

function createMemoryPlanStore({ inventory } = {}) {
  const plans = new Map();
  const migrations = new Map();
  const events = [];
  let currentInventory = inventory || { ok: false, errorCode: "MIGRATION_INVENTORY_UNAVAILABLE" };
  return {
    events,
    setInventory(value) { currentInventory = value; },
    async readCanonicalMigrationInventory() { return currentInventory; },
    async createPlanRow(row) {
      const stored = { ...row };
      plans.set(stored.id, stored);
      return { ok: true, row: { ...stored } };
    },
    async getPlanRow(id) {
      const row = plans.get(id);
      if (!row) return { ok: false, error: "PLAN_NOT_FOUND" };
      return { ok: true, row: { ...row } };
    },
    async listPlanRows() {
      return { ok: true, rows: [...plans.values()].map((row) => ({ ...row })) };
    },
    async listPlanMigrationRows(planId) {
      return { ok: true, rows: [...(migrations.get(planId) || [])].map((row) => ({ ...row })) };
    },
    async insertPlanMigrationRows(planId, rows) {
      if ((migrations.get(planId) || []).length > 0) return { ok: false, error: "PLAN_CONFLICT" };
      migrations.set(planId, rows.map((row) => ({ ...row })));
      return { ok: true };
    },
    async transitionPlanRow({ id, fromStatus, expectedUpdatedAt, expectedPlanHash, patch }) {
      const current = plans.get(id);
      if (!current) return { ok: false, error: "PLAN_NOT_FOUND" };
      if (current.status !== fromStatus) return { ok: false, error: "PLAN_CONFLICT" };
      if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
        return { ok: false, error: "PLAN_CONFLICT" };
      }
      if (expectedPlanHash && current.plan_hash !== expectedPlanHash) {
        return { ok: false, error: "PLAN_CONFLICT" };
      }
      Object.assign(current, patch);
      return { ok: true, row: { ...current } };
    },
    async appendPlanEvent(event) {
      events.push(event);
      return { ok: true };
    },
  };
}

async function createValidatedPlan(store, extras = {}) {
  store.setInventory({ ok: true, migrations: extras.migrations || [M1, M2] });
  const created = await createDbReleasePlan({
    environment: extras.environment || "HML",
    targetReleaseSha: extras.targetReleaseSha || TARGET,
    baseSha: extras.baseSha || BASE,
  }, { store, actor: ACTOR, nowMs: NOW });
  const validated = await validateDbReleasePlan({ id: created.plan.id }, {
    store,
    actor: ACTOR,
    nowMs: NOW + 1_000,
  });
  return { created, validated };
}

describe("db-release-plan-hash — canonicalização determinística", () => {
  it("documenta SHA-256 e versão de canonicalização", () => {
    expect(PLAN_HASH_ALGORITHM).toBe("sha256");
    expect(PLAN_HASH_CANONICAL_VERSION).toBe(1);
    expect(hashSource).toContain("chaves em ordem alfabética");
    expect(hashSource).not.toMatch(/\bfetch\s*\(/);
    expect(hashSource).not.toMatch(/(?:^|\n)\s*process\.env/);
  });

  it("mesmo conteúdo → mesmo hash e mesmo canonical", () => {
    const left = frozenPlanIdentity(identity());
    const right = frozenPlanIdentity(identity());
    expect(left.ok).toBe(true);
    expect(left.planHash).toBe(right.planHash);
    expect(left.canonical).toBe(canonicalizePlanIdentity(identity()));
    expect(left.planHash).toBe(computePlanHash(identity()));
    expect(left.planHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("troca de ordem das migrations → hash diferente", () => {
    const original = computePlanHash(identity());
    const swapped = computePlanHash(identity({
      migrations: [
        { ...M2, order: 1 },
        { ...M1, order: 2 },
      ],
    }));
    expect(swapped).not.toBe(original);
  });

  it("troca de sha256 → hash diferente", () => {
    expect(computePlanHash(identity({
      migrations: [{ ...M1, sha256: "1".repeat(64) }, M2],
    }))).not.toBe(computePlanHash(identity()));
  });

  it("troca de gitBlob → hash diferente", () => {
    expect(computePlanHash(identity({
      migrations: [{ ...M1, gitBlob: "1".repeat(40) }, M2],
    }))).not.toBe(computePlanHash(identity()));
  });

  it("troca de bytes → hash diferente", () => {
    expect(computePlanHash(identity({
      migrations: [{ ...M1, bytes: 121 }, M2],
    }))).not.toBe(computePlanHash(identity()));
  });

  it("troca de target SHA → hash diferente", () => {
    expect(computePlanHash(identity({ targetReleaseSha: "1".repeat(40) })))
      .not.toBe(computePlanHash(identity()));
  });

  it("troca de base SHA → hash diferente", () => {
    expect(computePlanHash(identity({ baseSha: "1".repeat(40) })))
      .not.toBe(computePlanHash(identity()));
  });

  it("troca de environment → hash diferente", () => {
    expect(computePlanHash(identity({ environment: "PROD" })))
      .not.toBe(computePlanHash(identity()));
  });

  it("classification entra no hash", () => {
    expect(computePlanHash(identity({
      migrations: [{ ...M1, classification: "PROHIBITED" }, M2],
    }))).not.toBe(computePlanHash(identity()));
  });
});

describe("db-release-plan — máquina de estados", () => {
  it("CREATE null → DRAFT com actor server-derived e environment allowlisted", async () => {
    const store = createMemoryPlanStore();
    const result = await createDbReleasePlan({
      environment: "PROD",
      targetReleaseSha: TARGET,
      baseSha: BASE,
      status: "APPROVED",
      createdBy: "11111111-1111-4111-8111-111111111111",
      planHash: "0".repeat(64),
    }, { store, actor: ACTOR, nowMs: NOW });
    expect(result.ok).toBe(true);
    expect(result.plan.status).toBe("DRAFT");
    expect(result.plan.environment).toBe("PROD");
    expect(result.plan.createdBy).toBe(ACTOR_ID);
    expect(result.plan.planHash).toBe(draftPlanHash({
      environment: "PROD",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }).planHash);
    expect(result.plan.canRequestExecution).toBe(false);
    expect(result.plan.executionCreated).toBe(false);
    expect(result.plan.prodAccessAuthorized).toBe(false);
    expect(result.plan.futureExecutionBoundary).toBe(FUTURE_EXECUTE_NOW_BOUNDARY);
    expect(store.events.map((event) => event.eventType)).toEqual(["DB_PLAN_CREATED"]);
    expect(store.events[0].metadata.prodAccessAuthorized).toBe(false);
  });

  it("VALIDATE DRAFT → VALIDATED congela inventário server-side", async () => {
    const store = createMemoryPlanStore({ inventory: { ok: true, migrations: [M1, M2] } });
    const created = await createDbReleasePlan({
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { store, actor: ACTOR, nowMs: NOW });
    const validated = await validateDbReleasePlan({ id: created.plan.id }, {
      store,
      actor: ACTOR,
      nowMs: NOW + 1_000,
    });
    expect(validated.ok).toBe(true);
    expect(validated.plan.status).toBe("VALIDATED");
    expect(validated.plan.migrationCount).toBe(2);
    expect(validated.plan.planHash).toBe(computePlanHash(identity()));
    expect(validated.plan.migrations.map((row) => row.filename)).toEqual([M1.filename, M2.filename]);
    expect(store.events.map((event) => event.eventType)).toEqual(["DB_PLAN_CREATED", "DB_PLAN_VALIDATED"]);
  });

  it("APPROVE exige APROVAR, actor UUID e hash congelado", async () => {
    const store = createMemoryPlanStore();
    const { validated } = await createValidatedPlan(store);
    const denied = await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: "OK",
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    expect(denied.error).toBe("CONFIRMATION_INVALID");
    const approved = await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    expect(approved.ok).toBe(true);
    expect(approved.plan.status).toBe("APPROVED");
    expect(approved.plan.approvedBy).toBe(ACTOR_ID);
    expect(approved.plan.approvedAt).toBe(new Date(NOW + 2_000).toISOString());
    expect(approved.plan.canRequestExecution).toBe(true);
    expect(approved.plan.executionCreated).toBe(false);
    expect(canRequestPlanExecution(approved.plan.status)).toBe(true);
  });

  it("SCHEDULE persiste timestamp futuro e não cria execução", async () => {
    const store = createMemoryPlanStore();
    const { validated } = await createValidatedPlan(store);
    await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    const scheduledAt = new Date(NOW + 120_000).toISOString();
    const scheduled = await scheduleDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt,
    }, { store, actor: ACTOR, nowMs: NOW + 3_000 });
    expect(scheduled.ok).toBe(true);
    expect(scheduled.plan.status).toBe("SCHEDULED");
    expect(scheduled.plan.scheduledAt).toBe(scheduledAt);
    expect(scheduled.plan.canRequestExecution).toBe(false);
    expect(scheduled.plan.executionCreated).toBe(false);
    expect(store.events.at(-1).metadata.executionCreated).toBe(false);
    expect(store.events.at(-1).metadata.backupTriggered).toBe(false);
    expect(store.events.at(-1).metadata.maintenanceStarted).toBe(false);
  });

  it("CANCEL é permitido só em estados pré-execução", async () => {
    const store = createMemoryPlanStore();
    const created = await createDbReleasePlan({
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { store, actor: ACTOR, nowMs: NOW });
    const canceled = await cancelDbReleasePlan({
      id: created.plan.id,
      confirmation: PLAN_CANCEL_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 500 });
    expect(canceled.ok).toBe(true);
    expect(canceled.plan.status).toBe("CANCELED");
  });

  it("rejeita transições ilegais e statuses do executor", async () => {
    const store = createMemoryPlanStore();
    const created = await createDbReleasePlan({
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { store, actor: ACTOR, nowMs: NOW });
    const draftApprove = await approveDbReleasePlan({
      id: created.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 1_000 });
    expect(draftApprove.error).toBe("INVALID_TRANSITION");
    const draftSchedule = await scheduleDbReleasePlan({
      id: created.plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt: new Date(NOW + 120_000).toISOString(),
    }, { store, actor: ACTOR, nowMs: NOW + 1_000 });
    expect(draftSchedule.error).toBe("INVALID_TRANSITION");

    const { validated } = await createValidatedPlan(store);
    const validatedSchedule = await scheduleDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt: new Date(NOW + 120_000).toISOString(),
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    expect(validatedSchedule.error).toBe("INVALID_TRANSITION");

    await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    const approveToValidate = await validateDbReleasePlan({ id: validated.plan.id }, {
      store,
      actor: ACTOR,
      nowMs: NOW + 3_000,
    });
    expect(approveToValidate.error).toBe("INVALID_TRANSITION");

    await scheduleDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt: new Date(NOW + 120_000).toISOString(),
    }, { store, actor: ACTOR, nowMs: NOW + 3_000 });
    const scheduleToApprove = await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 4_000 });
    expect(scheduleToApprove.error).toBe("INVALID_TRANSITION");

    await store.transitionPlanRow({
      id: validated.plan.id,
      fromStatus: "SCHEDULED",
      expectedUpdatedAt: (await store.getPlanRow(validated.plan.id)).row.updated_at,
      expectedPlanHash: (await store.getPlanRow(validated.plan.id)).row.plan_hash,
      patch: { status: "RUNNING" },
    });
    const runningCancel = await cancelDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_CANCEL_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 5_000 });
    expect(runningCancel.error).toBe("INVALID_TRANSITION");
    expect(isPlanExecutorOwnedStatus("RUNNING")).toBe(true);
    expect(isPlanExecutorOwnedStatus("SUCCEEDED")).toBe(true);
    expect(isLegalPlanUserTransition("DRAFT", "APPROVED", "APPROVE")).toBe(false);
    expect(PLAN_USER_TRANSITIONS).toHaveLength(7);
  });

  it("rejeita transição concorrente/stale", async () => {
    const store = createMemoryPlanStore({ inventory: { ok: true, migrations: [M1, M2] } });
    const created = await createDbReleasePlan({
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { store, actor: ACTOR, nowMs: NOW });
    const first = await validateDbReleasePlan({ id: created.plan.id }, {
      store,
      actor: ACTOR,
      nowMs: NOW + 1_000,
    });
    expect(first.ok).toBe(true);
    const stale = await store.transitionPlanRow({
      id: created.plan.id,
      fromStatus: "DRAFT",
      expectedUpdatedAt: created.plan.updatedAt,
      expectedPlanHash: created.plan.planHash,
      patch: { status: "VALIDATED" },
    });
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe("PLAN_CONFLICT");
  });

  it("idempotência: reaplicar a mesma transição não emite segundo evento", async () => {
    const store = createMemoryPlanStore();
    const { validated } = await createValidatedPlan(store);
    const first = await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 2_000 });
    const before = store.events.length;
    const second = await approveDbReleasePlan({
      id: validated.plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    }, { store, actor: ACTOR, nowMs: NOW + 3_000 });
    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);
    expect(second.plan.status).toBe("APPROVED");
    expect(store.events.length).toBe(before);
    expect(first.alreadyApplied).toBe(false);
  });

  it("plano PROD não autoriza acesso PROD", async () => {
    const store = createMemoryPlanStore({ inventory: { ok: true, migrations: [M1, M2] } });
    const created = await createDbReleasePlan({
      environment: "PROD",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { store, actor: ACTOR, nowMs: NOW });
    expect(created.plan.prodAccessAuthorized).toBe(false);
    expect(storeSource).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
    expect(storeSource).not.toMatch(/zzixvyspwszewhxzusot/);
    expect(storeSource).not.toMatch(/environment === ["']PROD["']/);
    expect(planSource).not.toMatch(/EXECUTE_NOW_APPROVAL_START/);
    expect(planSource).not.toMatch(/createBackup|apply_migration|cron/);
  });
});
