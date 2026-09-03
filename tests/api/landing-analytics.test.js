import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/landing-analytics.js";

// ════════════════════════════════════════════════════════════
// Gate REL-02C-SUPA-ISO-D — comprova que /api/landing-analytics não usa mais
// URL fixa de produção como fallback e falha fechado (sem fetch) quando a
// configuração do Supabase está ausente.
// ════════════════════════════════════════════════════════════

function makeReq({ method = "POST", body, headers = {}, query = {} } = {}) {
  return { method, headers, body, query };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    end(payload) { this.body = payload; },
    json() { return JSON.parse(this.body); },
  };
}

const visitaValida = { action: "start", sessionId: "s1", visitorId: "v1", path: "/" };

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("landing-analytics — falha fechada sem configuração (POST)", () => {
  it("sem URL nem SERVICE_ROLE_KEY: não chama fetch, responde 202 skipped", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ body: visitaValida }), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ ok: false, skipped: true });
  });

  it("com URL mas sem SERVICE_ROLE_KEY: não chama fetch", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ body: visitaValida }), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({ ok: false, skipped: true });
  });
});

describe("landing-analytics — falha fechada sem configuração (GET/DELETE protegidos)", () => {
  it("GET sem configuração: não chama fetch, responde 403 genérico", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ method: "GET", headers: { authorization: "Bearer jwt" } }), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("DELETE sem configuração: não chama fetch, responde 403 genérico", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ method: "DELETE", headers: { authorization: "Bearer jwt" }, query: { id: "1" } }), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("landing-analytics — precedência SUPABASE_URL > VITE_SUPABASE_URL", () => {
  it("usa SUPABASE_URL quando ambas as variáveis estão definidas", async () => {
    process.env.SUPABASE_URL = "https://hml-correta.supabase.co";
    process.env.VITE_SUPABASE_URL = "https://vite-nao-deve-ser-usada.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";

    const fn = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ body: visitaValida }), res);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toContain("https://hml-correta.supabase.co");
    expect(res.json()).toMatchObject({ ok: true });
  });
});

describe("landing-analytics — configuração válida mantém o comportamento", () => {
  it("registra a visita normalmente quando SUPABASE_URL e SERVICE_ROLE_KEY estão presentes", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";

    const fn = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ body: visitaValida }), res);

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

describe("landing-analytics — não referencia mais o projeto fixo de produção", () => {
  it("o código-fonte não contém a URL/ref fixa de produção", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../api/landing-analytics.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
  });
});
