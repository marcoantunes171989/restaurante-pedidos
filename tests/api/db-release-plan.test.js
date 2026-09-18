/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/maintenance.js";
import * as planStore from "../../server/db-release-plan-store.js";
import {
  PLAN_APPROVE_CONFIRMATION,
  PLAN_CANCEL_CONFIRMATION,
  PLAN_SCHEDULE_CONFIRMATION,
} from "../../server/db-release-contract.js";
import { computePlanHash } from "../../server/db-release-plan-hash.js";

const SUPABASE_URL = "https://hml-x.supabase.co";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
  + ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ"
  + ".assinatura-fake-de-teste-nao-real";

const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const SUPER_ADMIN_ROW = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };
const NON_ADMIN_ROW = { ativo: true, super_admin: false, loja_id: "loja-1", ids_acesso: [] };
const TARGET = "a".repeat(40);
const BASE = "b".repeat(40);
const M1 = {
  order: 1,
  filename: "160_db_release_orchestrator_foundation.sql",
  gitBlob: "c".repeat(40),
  sha256: "d".repeat(64),
  bytes: 10,
  classification: "SAFE_AUTO",
};

function makeReq({ method = "POST", headers = {}, query = {}, body } = {}) {
  return { method, headers, query, body };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) { this.body = payload; },
    json() { return JSON.parse(this.body); },
  };
}

function authHeader() {
  return { authorization: "Bearer token-operador-teste" };
}

function createMemoryPlanStore() {
  const plans = new Map();
  const migrations = new Map();
  const events = [];
  let inventory = { ok: true, migrations: [M1] };
  return {
    events,
    setInventory(value) { inventory = value; },
    async readCanonicalMigrationInventory() { return inventory; },
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

function installStore(memory) {
  vi.spyOn(planStore, "readCanonicalMigrationInventory").mockImplementation(
    (...args) => memory.readCanonicalMigrationInventory(...args),
  );
  vi.spyOn(planStore, "createPlanRow").mockImplementation((...args) => memory.createPlanRow(...args));
  vi.spyOn(planStore, "getPlanRow").mockImplementation((...args) => memory.getPlanRow(...args));
  vi.spyOn(planStore, "listPlanRows").mockImplementation((...args) => memory.listPlanRows(...args));
  vi.spyOn(planStore, "listPlanMigrationRows").mockImplementation((...args) => memory.listPlanMigrationRows(...args));
  vi.spyOn(planStore, "insertPlanMigrationRows").mockImplementation((...args) => memory.insertPlanMigrationRows(...args));
  vi.spyOn(planStore, "transitionPlanRow").mockImplementation((...args) => memory.transitionPlanRow(...args));
  vi.spyOn(planStore, "appendPlanEvent").mockImplementation((...args) => memory.appendPlanEvent(...args));
}

function mockAuthFetch({ userOk = true, email = "super@teste.com", userId = OPERATOR_ID, operatorRows = [SUPER_ADMIN_ROW] } = {}) {
  const fn = vi.fn(async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      if (!userOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: userId, email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      return { ok: true, json: async () => operatorRows };
    }
    throw new Error(`fetch inesperado no teste de plano: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function postPlan(body, { headers = authHeader() } = {}) {
  const res = makeRes();
  await handler(makeReq({ method: "POST", headers, body }), res);
  return res;
}

beforeEach(() => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  delete process.env.VITE_SUPABASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_URL;
});

describe("POST /api/maintenance db-plan-* — autenticação", () => {
  it("não autenticado → 401", async () => {
    installStore(createMemoryPlanStore());
    mockAuthFetch();
    const res = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    }, { headers: {} });
    expect(res.statusCode).toBe(401);
    expect(planStore.createPlanRow).not.toHaveBeenCalled();
  });

  it("não Super Admin → 403", async () => {
    installStore(createMemoryPlanStore());
    mockAuthFetch({ operatorRows: [NON_ADMIN_ROW] });
    const res = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    expect(res.statusCode).toBe(403);
    expect(planStore.createPlanRow).not.toHaveBeenCalled();
  });

  it("Super Admin cria plano e ignora spoof de actor/status", async () => {
    const memory = createMemoryPlanStore();
    installStore(memory);
    mockAuthFetch();
    const res = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
      status: "APPROVED",
      createdBy: "11111111-1111-4111-8111-111111111111",
      approvedBy: "11111111-1111-4111-8111-111111111111",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan.status).toBe("DRAFT");
    expect(body.plan.createdBy).toBe(OPERATOR_ID);
    expect(body.plan.approvedBy).toBe(null);
    expect(body.plan.prodAccessAuthorized).toBe(false);
    expect(body.plan.executionCreated).toBe(false);
    expect(body.plan.futureExecutionBoundary).toBe("EXECUTE_NOW_APPROVAL");
  });
});

describe("POST /api/maintenance db-plan-* — validação de request", () => {
  beforeEach(() => {
    installStore(createMemoryPlanStore());
    mockAuthFetch();
  });

  it("SHA inválido → SHA_INVALID", async () => {
    const res = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: "xyz",
      baseSha: BASE,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("SHA_INVALID");
  });

  it("UUID inválido → PLAN_ID_INVALID", async () => {
    const res = await postPlan({
      action: "db-plan-validate",
      id: "not-a-uuid",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("PLAN_ID_INVALID");
  });

  it("environment inválido → ENVIRONMENT_INVALID", async () => {
    const res = await postPlan({
      action: "db-plan-create",
      environment: "DEV",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("ENVIRONMENT_INVALID");
  });

  it("confirmação inválida → CONFIRMATION_INVALID", async () => {
    const created = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    const res = await postPlan({
      action: "db-plan-approve",
      id: created.json().plan.id,
      confirmation: "SIM",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("CONFIRMATION_INVALID");
  });

  it("schedule sem timezone explícito → SCHEDULE_TIME_INVALID", async () => {
    const created = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    await postPlan({ action: "db-plan-validate", id: created.json().plan.id });
    await postPlan({
      action: "db-plan-approve",
      id: created.json().plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    });
    const res = await postPlan({
      action: "db-plan-schedule",
      id: created.json().plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt: "2026-09-18 19:10:00",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("SCHEDULE_TIME_INVALID");
  });

  it("schedule no passado → SCHEDULE_TIME_INVALID", async () => {
    const created = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    await postPlan({ action: "db-plan-validate", id: created.json().plan.id });
    await postPlan({
      action: "db-plan-approve",
      id: created.json().plan.id,
      confirmation: PLAN_APPROVE_CONFIRMATION,
    });
    const res = await postPlan({
      action: "db-plan-schedule",
      id: created.json().plan.id,
      confirmation: PLAN_SCHEDULE_CONFIRMATION,
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("SCHEDULE_TIME_INVALID");
  });

  it("SQL/migrations do browser são rejeitados", async () => {
    const res = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
      sql: "create table x();",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("CLIENT_MIGRATION_PAYLOAD_FORBIDDEN");
    const res2 = await postPlan({
      action: "db-plan-validate",
      id: "33333333-3333-4333-8333-333333333333",
      migrations: [M1],
    });
    expect(res2.statusCode).toBe(400);
    expect(res2.json().error).toBe("CLIENT_MIGRATION_PAYLOAD_FORBIDDEN");
    const res3 = await postPlan({
      action: "db-plan-validate",
      id: "33333333-3333-4333-8333-333333333333",
      classification: "SAFE_AUTO",
    });
    expect(res3.statusCode).toBe(400);
    expect(res3.json().error).toBe("CLIENT_MIGRATION_PAYLOAD_FORBIDDEN");
  });

  it("action execute-now é inválida", async () => {
    const res = await postPlan({ action: "db-plan-execute-now" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("action_invalida");
  });
});

describe("POST /api/maintenance db-plan-* — lifecycle HTTP", () => {
  it("validate congela hash server-side, não o hash do client", async () => {
    const memory = createMemoryPlanStore();
    installStore(memory);
    mockAuthFetch();
    const created = await postPlan({
      action: "db-plan-create",
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
      planHash: "0".repeat(64),
    });
    const validated = await postPlan({
      action: "db-plan-validate",
      id: created.json().plan.id,
      planHash: "0".repeat(64),
    });
    expect(validated.statusCode).toBe(200);
    expect(validated.json().plan.planHash).toBe(computePlanHash({
      environment: "HML",
      targetReleaseSha: TARGET,
      baseSha: BASE,
      migrations: [M1],
    }));
    expect(validated.json().plan.planHash).not.toBe("0".repeat(64));
  });

  it("GET db-plans / db-plan exige Super Admin", async () => {
    installStore(createMemoryPlanStore());
    mockAuthFetch();
    const listRes = makeRes();
    await handler(makeReq({ method: "GET", headers: authHeader(), query: { scope: "db-plans" } }), listRes);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().action).toBe("db-plans");

    const unauth = makeRes();
    await handler(makeReq({ method: "GET", headers: {}, query: { scope: "db-plan", id: "33333333-3333-4333-8333-333333333333" } }), unauth);
    expect(unauth.statusCode).toBe(401);

    const badId = makeRes();
    await handler(makeReq({ method: "GET", headers: authHeader(), query: { scope: "db-plan", id: "nope" } }), badId);
    expect(badId.statusCode).toBe(400);
    expect(badId.json().error).toBe("PLAN_ID_INVALID");
  });

  it("cancel usa CANCELAR e não inicia manutenção", async () => {
    const memory = createMemoryPlanStore();
    installStore(memory);
    mockAuthFetch();
    const created = await postPlan({
      action: "db-plan-create",
      environment: "PROD",
      targetReleaseSha: TARGET,
      baseSha: BASE,
    });
    const canceled = await postPlan({
      action: "db-plan-cancel",
      id: created.json().plan.id,
      confirmation: PLAN_CANCEL_CONFIRMATION,
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().plan.status).toBe("CANCELED");
    expect(canceled.json().plan.prodAccessAuthorized).toBe(false);
    expect(canceled.json().plan.environment).toBe("PROD");
  });
});
