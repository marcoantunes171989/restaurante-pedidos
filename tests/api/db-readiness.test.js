/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/maintenance.js";
import * as maintenanceStore from "../../server/maintenance-store.js";
import {
  ALWAYS_REQUIRED_READINESS_GATES,
  REQUIRED_READINESS_GATES,
} from "../../server/db-release-contract.js";

const SUPABASE_URL = "https://hml-x.supabase.co";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
  + ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ"
  + ".assinatura-fake-de-teste-nao-real";

const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const SUPER_ADMIN_ROW = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };
const NON_ADMIN_ROW = { ativo: true, super_admin: false, loja_id: "loja-1", ids_acesso: [] };
const RELEASE_SHA = "c".repeat(40);

const MAINTENANCE_ROW = {
  phase: "NORMAL",
  version: 3,
  epoch: 0,
  release_id: null,
  target_sha: null,
  login_gate: "OPEN",
  plan_kind: null,
  db_plan_id: null,
  fence_effective_at: null,
  quiet_since: null,
  quiescent_at: null,
  updated_at: "2026-09-18T19:00:00.000Z",
};

function makeReq({ method = "GET", headers = {}, query = { scope: "db-readiness" }, body } = {}) {
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

function jsonResponse(status, payload, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

function authHeader() {
  return { authorization: "Bearer token-operador-teste" };
}

function mockReadinessFetch({
  userOk = true,
  email = "super@teste.com",
  userId = OPERATOR_ID,
  operatorRows = [SUPER_ADMIN_ROW],
  maintenanceRow = MAINTENANCE_ROW,
  maintenanceOk = true,
  zeroProof,
  zeroProofStatus = 404,
  operations = [],
  operationsOk = true,
} = {}) {
  const fn = vi.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      if (!userOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: userId, email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      return { ok: true, json: async () => operatorRows };
    }
    if (target.includes("/rest/v1/app_maintenance_state")) {
      if (!maintenanceOk) return jsonResponse(500, { message: "segredo interno" }, false);
      expect(String(options.method || "GET").toUpperCase()).toBe("GET");
      return jsonResponse(200, [maintenanceRow]);
    }
    if (target.includes("/rest/v1/rpc/app_canonical_session_zero_proof")) {
      if (zeroProof) return jsonResponse(200, zeroProof);
      return jsonResponse(zeroProofStatus, { code: "PGRST202", message: "function not found" }, false);
    }
    if (target.includes("/rest/v1/app_maintenance_operations")) {
      if (!operationsOk) return jsonResponse(500, { message: "ops fail" }, false);
      expect(String(options.method || "GET").toUpperCase()).toBe("GET");
      return jsonResponse(200, operations);
    }
    if (target.includes("/rest/v1/rpc/app_maintenance_orchestration_start")) {
      throw new Error("mutation start inesperada no GET db-readiness");
    }
    if (target.includes("/rest/v1/rpc/app_maintenance_orchestration_notice")) {
      throw new Error("mutation notice inesperada no GET db-readiness");
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.GITHUB_RELEASE_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.GITHUB_RELEASE_TOKEN;
});

describe("GET /api/maintenance?scope=db-readiness — HTTP", () => {
  it("não autenticado → 401", async () => {
    mockReadinessFetch();
    const res = makeRes();
    await handler(makeReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("não Super Admin → 403", async () => {
    mockReadinessFetch({ operatorRows: [NON_ADMIN_ROW] });
    const res = makeRes();
    await handler(makeReq({ headers: authHeader() }), res);
    expect(res.statusCode).toBe(403);
  });

  it("Super Admin recebe snapshot sanitizado e not-ready", async () => {
    mockReadinessFetch({
      zeroProof: {
        alive_session_count: 0,
        stale_session_count: 0,
        heartbeat_after_gate_close_count: 0,
        evaluated_at: "2026-09-18T19:00:00.000Z",
        maintenance_generation: 3,
      },
    });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeader(),
      query: { scope: "db-readiness", releaseSha: RELEASE_SHA },
    }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("db-readiness");
    expect(body.readiness.ready).toBe(false);
    expect(body.readiness.gates).toHaveLength(REQUIRED_READINESS_GATES.length);
    expect(body.readiness.gates.map((gate) => gate.key)).toEqual([...REQUIRED_READINESS_GATES]);
    expect(ALWAYS_REQUIRED_READINESS_GATES.every((key) => (
      body.readiness.gates.some((gate) => gate.key === key && gate.applicable === true)
    ))).toBe(true);
    const serialized = res.body;
    expect(serialized).not.toContain(SERVICE_ROLE);
    expect(serialized).not.toContain("token-operador-teste");
    expect(serialized).not.toContain("GITHUB_READ_TOKEN");
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toMatch(/Bearer /);
  });

  it("somente GET — PUT é 405 e POST não avalia readiness", async () => {
    mockReadinessFetch();
    const putRes = makeRes();
    await handler(makeReq({ method: "PUT", headers: authHeader() }), putRes);
    expect(putRes.statusCode).toBe(405);

    const postRes = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      query: { scope: "db-readiness" },
      body: { action: "execute" },
    }), postRes);
    expect(postRes.statusCode).toBe(400);
    expect(postRes.json().error).toBe("action_invalida");
    expect(postRes.body).not.toContain("readiness");
  });

  it("GET não invoca mutações de manutenção", async () => {
    const startSpy = vi.spyOn(maintenanceStore, "startMaintenanceOrchestration");
    const noticeSpy = vi.spyOn(maintenanceStore, "noticeMaintenanceOrchestration");
    const fetchSpy = mockReadinessFetch();
    await handler(makeReq({ headers: authHeader() }), makeRes());
    expect(startSpy).not.toHaveBeenCalled();
    expect(noticeSpy).not.toHaveBeenCalled();
    const mutating = fetchSpy.mock.calls.filter(([, options]) => {
      const method = String(options?.method || "GET").toUpperCase();
      return ["PATCH", "PUT", "DELETE"].includes(method);
    });
    expect(mutating).toHaveLength(0);
    const posts = fetchSpy.mock.calls.filter(([, options]) => String(options?.method || "").toUpperCase() === "POST");
    expect(posts.every(([url]) => String(url).includes("app_canonical_session_zero_proof"))).toBe(true);
  });

  it("falha de provider ainda devolve resposta not-ready segura", async () => {
    mockReadinessFetch({ maintenanceOk: false, operationsOk: false, zeroProofStatus: 500 });
    const res = makeRes();
    await handler(makeReq({ headers: authHeader() }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.readiness.ready).toBe(false);
    expect(body.readiness.overallStatus).not.toBe("READY");
    expect(res.body).not.toContain("segredo interno");
    expect(res.body).not.toContain(SERVICE_ROLE);
  });
});
