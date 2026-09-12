/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/maintenance.js";

// ════════════════════════════════════════════════════════════
// MICROGATE 08-B2-A — /api/maintenance: leitura pública read-only do
// Maintenance Write Fence (vw_app_maintenance_public, migration 140).
// Nenhum teste chama Supabase real: fetch é sempre mockado. Nenhuma
// operação de escrita é exercida — a API é GET/OPTIONS apenas.
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

function makeReq({ method = "GET", headers = {} } = {}) {
  return { method, headers };
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
  return { ok, status, json: async () => payload };
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
    expect(res.headers.Allow).toBe("GET, OPTIONS");
    expect(spy).not.toHaveBeenCalled();
  });

  it("J. POST → 405 sem fetch", async () => {
    const spy = mockFetch(async () => jsonResponse(200, [VALID_ROW]));
    const req = makeReq({ method: "POST" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET, OPTIONS");
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
