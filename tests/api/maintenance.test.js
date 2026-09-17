/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/maintenance.js";

// ════════════════════════════════════════════════════════════
// MICROGATE 08-B2-A + B15-A2 — /api/maintenance: leitura pública
// (vw_app_maintenance_public) e, autenticada, leitura administrativa
// + POST start/notice. Nenhum teste chama Supabase real: fetch é
// sempre mockado. GET nunca muta estado.
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = "https://hml-x.supabase.co";
// JWT legado fake (role=service_role) — mesmo formato usado em
// tests/server/release-store-events.test.js e tests/api/releases.test.js.
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ" +
  ".assinatura-fake-de-teste-nao-real";

const VALID_ROW = {
  phase: "NORMAL",
  epoch: 0,
  fence_effective_at: null,
  notice_started_at: null,
  scheduled_for: null,
  message_public: null,
  updated_at: "2026-09-11T10:00:00.000Z",
};

function makeReq({ method = "GET", headers = {}, query = {}, body } = {}) {
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

function mockFetch(fn) {
  const spy = vi.fn(fn);
  vi.stubGlobal("fetch", spy);
  return spy;
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

describe("GET /api/maintenance — contrato de sucesso", () => {
  it("A. NORMAL com 1 row válida → 200", async () => {
    mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq();
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.state.phase).toBe("NORMAL");
    expect(body.state.epoch).toBe(0);
    expect(typeof body.generatedAt).toBe("string");
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("B. funciona sem Authorization header", async () => {
    mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("C. payload de sucesso possui somente os campos públicos esperados", async () => {
    mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const res = makeRes();

    await handler(makeReq(), res);

    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(["generatedAt", "ok", "state"].sort());
    expect(Object.keys(body.state).sort()).toEqual(
      ["phase", "epoch", "fenceEffectiveAt", "noticeStartedAt", "scheduledFor", "messagePublic", "updatedAt"].sort(),
    );
  });

  it("D. campos sensíveis extras vindos do backend NÃO aparecem na resposta", async () => {
    mockFetch(async () => jsonResponse(200, [{
      ...VALID_ROW,
      reason: "manutenção planejada",
      release_id: "11111111-1111-4111-8111-111111111111",
      target_sha: "a".repeat(40),
      message_operator: "segredo interno",
      created_by_email: "admin@restaurante.com",
      version: 3,
    }]));
    const res = makeRes();

    await handler(makeReq(), res);

    const body = res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("release_id");
    expect(serialized).not.toContain("target_sha");
    expect(serialized).not.toContain("message_operator");
    expect(serialized).not.toContain("created_by_email");
    expect(serialized).not.toContain("version");
  });

  it("E. query aponta somente para vw_app_maintenance_public", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));

    await handler(makeReq(), makeRes());

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain("/rest/v1/vw_app_maintenance_public");
    expect(String(url)).not.toContain("app_maintenance_state");
  });

  it("F. select contém exatamente as 7 colunas públicas", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));

    await handler(makeReq(), makeRes());

    const [url] = spy.mock.calls[0];
    const parsed = new URL(String(url));
    const select = parsed.searchParams.get("select");
    expect(select.split(",").sort()).toEqual(
      ["phase", "epoch", "fence_effective_at", "notice_started_at", "scheduled_for", "message_public", "updated_at"].sort(),
    );
  });

  it("G. chamada outbound é GET", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));

    await handler(makeReq(), makeRes());

    const [, options] = spy.mock.calls[0];
    expect(options.method).toBe("GET");
  });

  it("H. nenhuma operação write é executada", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));

    await handler(makeReq(), makeRes());

    spy.mock.calls.forEach(([, options]) => {
      const method = String(options?.method || "GET").toUpperCase();
      expect(["GET"]).toContain(method);
    });
  });
});

describe("OPTIONS e método não permitido", () => {
  it("I. OPTIONS → 204 sem fetch", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq({ method: "OPTIONS" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.headers.Allow).toBe("GET, POST, OPTIONS");
    expect(spy).not.toHaveBeenCalled();
  });

  it("J. POST sem Authorization → 401 sem fetch (B15-A2: POST agora existe, mas continua fail-closed sem token)", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq({ method: "POST", body: { action: "start" } });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("J2. DELETE → 405 sem fetch", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq({ method: "DELETE" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET, POST, OPTIONS");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Falhas de configuração/comunicação → 503 sanitizado", () => {
  it("K. config Supabase ausente → 503 sanitized", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("L. backend HTTP failure → 503 sanitized", async () => {
    mockFetch(async () => jsonResponse(500, { message: "internal error", hint: "x", details: "y" }, false));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" });
  });

  it("M. network failure → 503 sanitized", async () => {
    mockFetch(async () => {
      throw new Error("ECONNRESET algum detalhe de rede sensível");
    });
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" });
  });
});

describe("Integridade do singleton e validação de phase — 503 sanitizado", () => {
  it("N. 0 rows → integrity error", async () => {
    mockFetch(async () => jsonResponse(200, []));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
  });

  it("O. >1 row → integrity error", async () => {
    mockFetch(async () => jsonResponse(200, [VALID_ROW, { ...VALID_ROW, epoch: 1 }]));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
  });

  it("P. phase inválida → integrity error", async () => {
    mockFetch(async () => jsonResponse(200, [{ ...VALID_ROW, phase: "UNKNOWN_PHASE" }]));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
  });

  it("Q. epoch negativo ou não inteiro → integrity error", async () => {
    for (const badEpoch of [-1, 1.5, "0", null]) {
      mockFetch(async () => jsonResponse(200, [{ ...VALID_ROW, epoch: badEpoch }]));
      const res = makeRes();
      await handler(makeReq(), res);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
    }
  });

  it("R. updated_at inválido ou ausente → integrity error", async () => {
    for (const badUpdatedAt of [undefined, null, "", "not-a-date"]) {
      const row = { ...VALID_ROW, updated_at: badUpdatedAt };
      if (badUpdatedAt === undefined) delete row.updated_at;
      mockFetch(async () => jsonResponse(200, [row]));
      const res = makeRes();
      await handler(makeReq(), res);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
    }
  });

  it("S. timestamps opcionais inválidos → integrity error", async () => {
    for (const field of ["fence_effective_at", "notice_started_at", "scheduled_for"]) {
      mockFetch(async () => jsonResponse(200, [{ ...VALID_ROW, [field]: "not-a-date" }]));
      const res = makeRes();
      await handler(makeReq(), res);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
    }
  });

  it("T. message_public com tipo inválido → integrity error", async () => {
    mockFetch(async () => jsonResponse(200, [{ ...VALID_ROW, message_public: 12345 }]));
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: "MAINTENANCE_STATE_INTEGRITY_ERROR" });
  });

  it("U. resposta de erro não contém secret/raw backend details", async () => {
    mockFetch(async () => jsonResponse(500, {
      message: "PostgREST failure",
      hint: "check RLS",
      details: "internal",
      code: "42501",
    }, false));
    const res = makeRes();

    await handler(makeReq(), res);

    const serialized = res.body;
    expect(Object.keys(res.json()).sort()).toEqual(["error", "ok"].sort());
    expect(serialized).not.toContain(SERVICE_ROLE);
    expect(serialized).not.toContain(SUPABASE_URL);
    expect(serialized).not.toContain("PostgREST failure");
    expect(serialized).not.toContain("hint");
    expect(serialized).not.toContain("details");
    expect(serialized).not.toContain("42501");
  });
});

// ════════════════════════════════════════════════════════════
// B15-A2 — GET ?scope=admin e POST (start/notice). Reaplica a mesma
// condição de autorização de api/releases.js / api/ambientes.js
// (checkAuth: Bearer + Super Admin). Nenhum teste chama Supabase real —
// fetch é sempre mockado por rota (auth/v1/user, tab_usuarios,
// app_maintenance_state, app_release_runs, rpc/app_maintenance_orchestration_*).
// ════════════════════════════════════════════════════════════

const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_SHA = "b".repeat(40);
const SUPER_ADMIN_ROW = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };
const NON_ADMIN_ROW = { ativo: true, super_admin: false, loja_id: "loja-1", ids_acesso: [] };

const ADMIN_ROW = {
  phase: "NORMAL",
  version: 3,
  epoch: 0,
  release_id: null,
  target_sha: null,
  reason: null,
  notice_started_at: null,
  scheduled_for: null,
  fence_effective_at: null,
  drain_started_at: null,
  quiet_since: null,
  quiescent_at: null,
  release_started_at: null,
  smoke_started_at: null,
  recovering_at: null,
  completed_at: null,
  aborted_at: null,
  timeout_at: null,
  result_code: null,
  message_public: null,
  updated_by_email: null,
  updated_at: "2026-09-11T10:00:00.000Z",
  created_at: "2026-09-01T10:00:00.000Z",
};

function createReleaseRegistryMock(seed = []) {
  const rows = new Map();
  for (const row of seed) rows.set(row.id, { ...row });
  return {
    handle(url) {
      const parsed = new URL(url);
      const idFilter = parsed.searchParams.get("id");
      const statusFilter = parsed.searchParams.get("status");
      let result = [...rows.values()];
      if (idFilter?.startsWith("eq.")) {
        const id = idFilter.slice(3);
        result = result.filter((r) => r.id === id);
      }
      if (statusFilter?.startsWith("in.(") && statusFilter.endsWith(")")) {
        const statuses = statusFilter.slice(4, -1).split(",");
        result = result.filter((r) => statuses.includes(r.status));
      }
      return jsonResponse(200, result);
    },
  };
}

function rpcSuccess() {
  return { ok: true, status: 204, json: async () => { throw new Error("no body"); } };
}

function rpcError(status, details) {
  return { ok: false, status, json: async () => ({ code: "P0001", details, hint: "segredo interno", message: "erro interno do banco" }) };
}

function mockAuthedFetch({
  userOk = true,
  email = "super@teste.com",
  userId = OPERATOR_ID,
  operatorRows = [SUPER_ADMIN_ROW],
  adminRow = ADMIN_ROW,
  publicRow = VALID_ROW,
  releaseRegistry = createReleaseRegistryMock(),
  rpc = {},
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
    if (target.includes("/rest/v1/vw_app_maintenance_public")) {
      return jsonResponse(200, [publicRow]);
    }
    if (target.includes("/rest/v1/app_maintenance_state")) {
      return jsonResponse(200, [adminRow]);
    }
    if (target.includes("/rest/v1/app_release_runs")) {
      return releaseRegistry.handle(target);
    }
    if (target.includes("/rest/v1/rpc/app_maintenance_orchestration_start")) {
      if (!rpc.start) throw new Error("rpc start inesperado no teste");
      return rpc.start(JSON.parse(options.body || "{}"));
    }
    if (target.includes("/rest/v1/rpc/app_maintenance_orchestration_notice")) {
      if (!rpc.notice) throw new Error("rpc notice inesperado no teste");
      return rpc.notice(JSON.parse(options.body || "{}"));
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function authHeader() {
  return { authorization: "Bearer token-operador-teste" };
}

describe("GET /api/maintenance?scope=admin — autenticação/autorização", () => {
  it("sem token → 401", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("token inválido → 401", async () => {
    mockAuthedFetch({ userOk: false });
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), res);
    expect(res.statusCode).toBe(401);
  });

  it("usuário válido sem superAdmin → 403", async () => {
    mockAuthedFetch({ operatorRows: [NON_ADMIN_ROW] });
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), res);
    expect(res.statusCode).toBe(403);
  });

  it("super admin → 200 com estado administrativo completo", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toEqual(expect.objectContaining({
      phase: "NORMAL",
      version: 3,
      epoch: 0,
      releaseId: null,
      targetSha: null,
      noticeStartedAt: null,
      scheduledFor: null,
      messagePublic: null,
      fenceEffectiveAt: null,
      updatedAt: "2026-09-11T10:00:00.000Z",
    }));
  });

  it("estado vinculado expõe releaseId e targetSha no GET admin (não no GET público)", async () => {
    mockAuthedFetch({
      adminRow: {
        ...ADMIN_ROW,
        release_id: RELEASE_ID,
        target_sha: TARGET_SHA,
      },
    });
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().state.releaseId).toBe(RELEASE_ID);
    expect(res.json().state.targetSha).toBe(TARGET_SHA);
  });

  it("bypass de conta-raiz (admin@restaurante.com) funciona sem consultar tab_usuarios", async () => {
    const fn = mockAuthedFetch({ email: "admin@restaurante.com" });
    const res = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), res);
    expect(res.statusCode).toBe(200);
    expect(fn.mock.calls.some(([u]) => String(u).includes("/rest/v1/tab_usuarios"))).toBe(false);
  });
});

describe("GET público continua preservado e isolado do administrativo (B15-A2)", () => {
  it("GET sem scope continua público, sem exigir auth", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().state.version).toBeUndefined();
  });

  it("GET ?scope=algo-desconhecido cai no contrato público (fail-safe, não quebra consumidores existentes)", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ query: { scope: "outraCoisa" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().state.version).toBeUndefined();
  });

  it("a resposta pública nunca inclui version/releaseId/targetSha (somente a leitura admin expõe)", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq(), res);
    const serialized = res.body;
    expect(serialized).not.toContain("version");
    expect(serialized).not.toContain("releaseId");
    expect(serialized).not.toContain("targetSha");
  });
});

describe("POST /api/maintenance action=start", () => {
  it("sem token → 401", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST", body: { action: "start", releaseId: RELEASE_ID } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("sem superAdmin → 403", async () => {
    mockAuthedFetch({ operatorRows: [NON_ADMIN_ROW] });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(403);
  });

  it("releaseId ausente/inválido → 400, sem chamar a RPC", async () => {
    const fn = mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: "nao-e-um-uuid" },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(fn.mock.calls.some(([u]) => String(u).includes("rpc/app_maintenance_orchestration_start"))).toBe(false);
  });

  it("release inexistente → 404 NOT_FOUND", async () => {
    mockAuthedFetch({ releaseRegistry: createReleaseRegistryMock([]) });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("sucesso → 200; target_sha é sempre derivado da release real, nunca do body enviado pelo client", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    const rpcSpy = vi.fn((payload) => {
      expect(payload.p_release_id).toBe(RELEASE_ID);
      expect(payload.p_target_sha).toBe(TARGET_SHA);
      return rpcSuccess();
    });
    mockAuthedFetch({ releaseRegistry, rpc: { start: rpcSpy } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: { action: "start", releaseId: RELEASE_ID, reason: "manutenção planejada", targetSha: "sha-forjado-pelo-client-tentando-bypass" },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("actor nunca vem do body — sempre da sessão autenticada", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    const rpcSpy = vi.fn((payload) => {
      expect(payload.p_actor_email).toBe("super@teste.com");
      expect(payload.p_actor_user_id).toBe(OPERATOR_ID);
      return rpcSuccess();
    });
    mockAuthedFetch({ releaseRegistry, rpc: { start: rpcSpy } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: {
        action: "start",
        releaseId: RELEASE_ID,
        actorUserId: "99999999-9999-4999-8999-999999999999",
        actorEmail: "invasor@teste.com",
      },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("target mismatch retornado pela RPC → 409 TARGET_MISMATCH", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    mockAuthedFetch({ releaseRegistry, rpc: { start: () => rpcError(400, "TARGET_MISMATCH") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("TARGET_MISMATCH");
  });

  it("conflito de estado (RPC STATE_CONFLICT) → 409", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    mockAuthedFetch({ releaseRegistry, rpc: { start: () => rpcError(400, "STATE_CONFLICT") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("STATE_CONFLICT");
  });

  it("release já vinculada (ACTIVE_RELEASE_CONFLICT) → 409", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    mockAuthedFetch({ releaseRegistry, rpc: { start: () => rpcError(400, "ACTIVE_RELEASE_CONFLICT") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("ACTIVE_RELEASE_CONFLICT");
  });

  it("release existente mas não ativa → 404 NOT_FOUND, sem chamar a RPC", async () => {
    const fn = mockAuthedFetch({
      releaseRegistry: createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "SUCCEEDED" }]),
    });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
    expect(fn.mock.calls.some(([u]) => String(u).includes("rpc/app_maintenance_orchestration_start"))).toBe(false);
  });

  it("resposta de erro da RPC nunca contém message/hint/detail cru do backend", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    mockAuthedFetch({ releaseRegistry, rpc: { start: () => rpcError(400, "STATE_CONFLICT") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID },
    }), res);
    expect(res.body).not.toContain("segredo interno");
    expect(res.body).not.toContain("erro interno do banco");
  });
});

describe("POST /api/maintenance action=notice", () => {
  it("sem token → 401", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST", body: { action: "notice" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("sem superAdmin → 403", async () => {
    mockAuthedFetch({ operatorRows: [NON_ADMIN_ROW] });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "notice", expectedVersion: 3, messagePublic: "Manutenção às 22h" },
    }), res);
    expect(res.statusCode).toBe(403);
  });

  it("expectedVersion inválido/ausente → 400, sem chamar a RPC", async () => {
    const fn = mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "notice", messagePublic: "Manutenção às 22h" },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(fn.mock.calls.some(([u]) => String(u).includes("rpc/app_maintenance_orchestration_notice"))).toBe(false);
  });

  it("messagePublic ausente → 400", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "notice", expectedVersion: 3 },
    }), res);
    expect(res.statusCode).toBe(400);
  });

  it("scheduledFor inválido → 400", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: { action: "notice", expectedVersion: 3, messagePublic: "Manutenção às 22h", scheduledFor: "nao-e-uma-data" },
    }), res);
    expect(res.statusCode).toBe(400);
  });

  it("sucesso → 200; campos enviados corretamente à RPC", async () => {
    const rpcSpy = vi.fn((payload) => {
      expect(payload.p_expected_version).toBe(3);
      expect(payload.p_message_public).toBe("Manutenção às 22h");
      expect(payload.p_reason).toBe("janela programada");
      expect(typeof payload.p_scheduled_for).toBe("string");
      return rpcSuccess();
    });
    mockAuthedFetch({ rpc: { notice: rpcSpy } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: {
        action: "notice",
        expectedVersion: 3,
        reason: "janela programada",
        messagePublic: "Manutenção às 22h",
        scheduledFor: "2026-09-20T22:00:00.000Z",
      },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("scheduledFor ausente → RPC recebe null (não é obrigatório)", async () => {
    const rpcSpy = vi.fn((payload) => {
      expect(payload.p_scheduled_for).toBeNull();
      return rpcSuccess();
    });
    mockAuthedFetch({ rpc: { notice: rpcSpy } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: { action: "notice", expectedVersion: 3, messagePublic: "Manutenção às 22h" },
    }), res);
    expect(res.statusCode).toBe(200);
  });

  it("actor nunca vem do body — sempre da sessão autenticada", async () => {
    const rpcSpy = vi.fn((payload) => {
      expect(payload.p_actor_email).toBe("super@teste.com");
      expect(payload.p_actor_user_id).toBe(OPERATOR_ID);
      return rpcSuccess();
    });
    mockAuthedFetch({ rpc: { notice: rpcSpy } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST",
      headers: authHeader(),
      body: {
        action: "notice",
        expectedVersion: 3,
        messagePublic: "Manutenção às 22h",
        actorUserId: "99999999-9999-4999-8999-999999999999",
        actorEmail: "invasor@teste.com",
      },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("STATE_CONFLICT retornado pela RPC → 409", async () => {
    mockAuthedFetch({ rpc: { notice: () => rpcError(400, "STATE_CONFLICT") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "notice", expectedVersion: 3, messagePublic: "x" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("STATE_CONFLICT");
  });

  it("VERSION_CONFLICT retornado pela RPC → 409", async () => {
    mockAuthedFetch({ rpc: { notice: () => rpcError(400, "VERSION_CONFLICT") } });
    const res = makeRes();
    await handler(makeReq({
      method: "POST", headers: authHeader(), body: { action: "notice", expectedVersion: 3, messagePublic: "x" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("VERSION_CONFLICT");
  });
});

describe("POST /api/maintenance — action inválida/body inválido", () => {
  it("action desconhecida → 400", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST", headers: authHeader(), body: { action: "fence" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("body não é JSON válido → 400", async () => {
    mockAuthedFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST", headers: authHeader(), body: "{not-json" }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("Segurança — service_role e superfície de resposta (B15-A2)", () => {
  it("service_role nunca aparece em nenhuma resposta HTTP (GET público, GET admin, POST)", async () => {
    const releaseRegistry = createReleaseRegistryMock([{ id: RELEASE_ID, target_sha: TARGET_SHA, status: "REQUESTED" }]);
    mockAuthedFetch({ releaseRegistry, rpc: { start: rpcSuccess, notice: rpcSuccess } });

    const resPublic = makeRes();
    await handler(makeReq(), resPublic);
    expect(resPublic.body).not.toContain(SERVICE_ROLE);

    const resAdmin = makeRes();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), resAdmin);
    expect(resAdmin.body).not.toContain(SERVICE_ROLE);

    const resStart = makeRes();
    await handler(makeReq({ method: "POST", headers: authHeader(), body: { action: "start", releaseId: RELEASE_ID } }), resStart);
    expect(resStart.body).not.toContain(SERVICE_ROLE);
  });

  it("nenhuma mutation acontece em requisições GET (fetch outbound nunca usa POST/PATCH/PUT/DELETE)", async () => {
    const fn = mockAuthedFetch();
    await handler(makeReq({ query: { scope: "admin" }, headers: authHeader() }), makeRes());
    fn.mock.calls.forEach(([, options]) => {
      const method = String(options?.method || "GET").toUpperCase();
      expect(["GET"]).toContain(method);
    });
  });
});
