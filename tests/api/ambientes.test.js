/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/ambientes.js";

// ════════════════════════════════════════════════════════════
// Microgate 09 — /api/ambientes: backend read-only protegido.
// Cobre método, autenticação/autorização e os 5 resources do contrato
// estático. Nenhum teste chama Homologação/Produção reais: fetch é sempre
// mockado.
// ════════════════════════════════════════════════════════════

function makeReq({ method = "GET", headers = {}, query = {} } = {}) {
  return { method, headers, query };
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

function mockFetch({ userOk = true, email = "super@teste.com", operatorOk = true, operatorRows = [] } = {}) {
  const fn = vi.fn(async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      if (!userOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      if (!operatorOk) return { ok: false, json: async () => [] };
      return { ok: true, json: async () => operatorRows };
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const superAdminRow = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
  delete process.env.VITE_SUPABASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ambientes — método", () => {
  it("método não GET → 405", async () => {
    mockFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET");
  });
});

describe("ambientes — autenticação", () => {
  it("GET sem Authorization → 401", async () => {
    const fn = mockFetch();
    const res = makeRes();
    await handler(makeReq({ query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("Bearer inválido → 401", async () => {
    mockFetch({ userOk: false });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer invalido" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("usuário autenticado porém não autorizado → 403", async () => {
    mockFetch({ operatorRows: [{ ativo: true, super_admin: false, loja_id: 5, ids_acesso: [] }] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("usuário inativo → 403", async () => {
    mockFetch({ operatorRows: [{ ativo: false, super_admin: true, loja_id: null, ids_acesso: [] }] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe("ambientes — resources (superAdmin válido)", () => {
  it("resource=environments → 200", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.resource).toBe("environments");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((e) => e.status === "UNKNOWN")).toBe(true);
  });

  it("resource=compare → 200 + UNKNOWN", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("UNKNOWN");
  });

  it("resource=deployments → 200 + not_connected", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("not_connected");
  });

  it("resource=health → 200 + providers UNKNOWN", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);
    const providers = res.json().data.providers;
    expect(Object.values(providers).every((v) => v === "UNKNOWN")).toBe(true);
  });

  it("resource=history → 200 + vazio/not_connected", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "history" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("not_connected");
  });

  it("resource inválido → 400", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "invalido" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("resource ausente → 400 (contrato explícito, sem default implícito)", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("ambientes — sanitização de payload", () => {
  it("resposta não contém segredos nem dados sensíveis", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    const raw = res.body;
    expect(raw).not.toMatch(/service_role/i);
    expect(raw).not.toMatch(/authorization/i);
    expect(raw).not.toMatch(/secret/i);
    expect(raw).not.toMatch(/Bearer /);
    expect(raw).not.toMatch(/stack/i);
  });
});
