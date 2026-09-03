import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./access-event.js";

// ════════════════════════════════════════════════════════════
// Gate REL-02C-SUPA-ISO-D — comprova que /api/access-event não usa mais
// URL fixa de produção como fallback e falha fechado (sem fetch) quando a
// configuração do Supabase está ausente.
// ════════════════════════════════════════════════════════════

function makeReq(body) {
  return {
    method: "POST",
    headers: {},
    body,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    _headers: {},
    body: null,
    setHeader(k, v) { this._headers[k] = v; },
    end(payload) { this.body = payload; },
    json() { return JSON.parse(this.body); },
  };
}

const bodyValido = { eventType: "LOGIN_DENIED", email: "teste@demo.com" };

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("access-event — falha fechada sem configuração", () => {
  it("sem SUPABASE_URL/VITE_SUPABASE_URL e sem SERVICE_ROLE_KEY: não chama fetch", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(bodyValido), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, skipped: true, error: "missing_config" });
  });

  it("com URL configurada mas sem SERVICE_ROLE_KEY: não chama fetch", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(bodyValido), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({ ok: false, skipped: true, error: "missing_config" });
  });

  it("com SERVICE_ROLE_KEY mas sem nenhuma URL: não chama fetch", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(bodyValido), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({ ok: false, skipped: true, error: "missing_config" });
  });
});

describe("access-event — precedência SUPABASE_URL > VITE_SUPABASE_URL", () => {
  it("usa SUPABASE_URL quando ambas as variáveis estão definidas com valores diferentes", async () => {
    process.env.SUPABASE_URL = "https://hml-correta.supabase.co";
    process.env.VITE_SUPABASE_URL = "https://vite-nao-deve-ser-usada.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";

    const fn = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(bodyValido), res);

    expect(fn).toHaveBeenCalledTimes(1);
    const [url] = fn.mock.calls[0];
    expect(String(url)).toContain("https://hml-correta.supabase.co");
    expect(String(url)).not.toContain("vite-nao-deve-ser-usada");
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("VITE_SUPABASE_URL funciona como compatibilidade quando SUPABASE_URL está ausente", async () => {
    process.env.VITE_SUPABASE_URL = "https://hml-compat.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";

    const fn = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(bodyValido), res);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toContain("https://hml-compat.supabase.co");
    expect(res.json()).toMatchObject({ ok: true });
  });
});

describe("access-event — não referencia mais o projeto fixo de produção", () => {
  it("o código-fonte não contém a URL/ref fixa de produção", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./access-event.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
  });
});
