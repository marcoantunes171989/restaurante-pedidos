import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/login-banco.js";

// ════════════════════════════════════════════════════════════
// Gate REL-02C-SUPA-ISO-D — comprova que /api/login-banco não usa mais URL
// fixa de produção como fallback e falha fechado (sem fetch) quando a
// configuração do Supabase está ausente.
// ════════════════════════════════════════════════════════════

function makeReq(body) {
  return { method: "POST", headers: {}, body };
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

const credenciais = { email: "usuario@demo.com", senha: "senha123456" };

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("login-banco — falha fechada sem configuração", () => {
  it("sem URL nem SERVICE_ROLE_KEY: não chama fetch, responde 503 sem revelar detalhes internos", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(credenciais), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    const payload = res.json();
    expect(payload.code).toBe("SERVICE_ROLE_MISSING");
    expect(payload.error).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|rwnzggjxhxnfrhstbxkm|https?:\/\//i);
  });

  it("com URL mas sem SERVICE_ROLE_KEY: não chama fetch", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(credenciais), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it("com SERVICE_ROLE_KEY mas sem nenhuma URL: não chama fetch", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(credenciais), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });
});

describe("login-banco — precedência SUPABASE_URL > VITE_SUPABASE_URL e comportamento válido", () => {
  it("usa SUPABASE_URL (não VITE_SUPABASE_URL) em todas as chamadas e mantém o fluxo de login", async () => {
    const url = "https://hml-correta.supabase.co";
    process.env.SUPABASE_URL = url;
    process.env.VITE_SUPABASE_URL = "https://vite-nao-deve-ser-usada.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";

    const authId = "auth-uuid-1";
    const calls = [];
    const fn = vi.fn(async (reqUrl, opts = {}) => {
      const urlStr = String(reqUrl);
      const method = (opts.method || "GET").toUpperCase();
      calls.push({ url: urlStr, method });
      if (urlStr === `${url}/rest/v1/rpc/app_validar_login`) {
        return {
          ok: true,
          json: async () => ({ ok: true, usuario: { id: 1, email: credenciais.email, nome: "Teste", loja_id: 9, perfil: "Operador" } }),
        };
      }
      if (urlStr.startsWith(`${url}/auth/v1/admin/users?email=`)) {
        return { ok: true, json: async () => ({ users: [{ id: authId, email: credenciais.email, user_metadata: {} }] }) };
      }
      if (urlStr === `${url}/auth/v1/admin/users/${authId}` && method === "PUT") {
        return { ok: true, json: async () => ({ id: authId, email: credenciais.email }) };
      }
      throw new Error(`Unmocked fetch no teste: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(credenciais), res);

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(calls.every((c) => c.url.startsWith(url))).toBe(true);
    expect(calls.some((c) => c.url.includes("vite-nao-deve-ser-usada"))).toBe(false);
  });
});

describe("login-banco — não referencia mais o projeto fixo de produção", () => {
  it("o código-fonte não contém a URL/ref fixa de produção", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../api/login-banco.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
  });
});
