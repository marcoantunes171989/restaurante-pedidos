import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/auth-health.js";

// ════════════════════════════════════════════════════════════
// Gate REL-02C-SUPA-ISO-D — comprova que /api/auth-health não usa mais
// URL fixa de produção nem fallback de anon key com precedência invertida,
// e falha fechado (sem fetch) quando a configuração está ausente.
// ════════════════════════════════════════════════════════════

function makeReq({ token = "jwt-operador" } = {}) {
  return {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
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

function operadorAdminRow() {
  return { ativo: true, super_admin: true, ids_acesso: [], perfil: "" };
}

function makeFetchMock(url, { apikeyEsperada } = {}) {
  const calls = [];
  const fn = vi.fn(async (reqUrl, opts = {}) => {
    const urlStr = String(reqUrl);
    calls.push({ url: urlStr, apikey: opts.headers?.apikey });
    if (apikeyEsperada && opts.headers?.apikey !== apikeyEsperada) {
      return { ok: false, status: 401, json: async () => ({}) };
    }
    if (urlStr === `${url}/auth/v1/user`) {
      return { ok: true, json: async () => ({ email: "admin@demo.com" }) };
    }
    if (urlStr.startsWith(`${url}/rest/v1/tab_usuarios`)) {
      return { ok: true, json: async () => [operadorAdminRow()] };
    }
    if (urlStr.startsWith(`${url}/auth/v1/admin/users`)) {
      return { ok: true, json: async () => ({ users: [] }) };
    }
    if (urlStr.startsWith(`${url}/rest/v1/rpc/app_validar_login`)) {
      return { ok: true, json: async () => ({ ok: false }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  return { fn, calls };
}

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth-health — falha fechada sem configuração", () => {
  it("sem nenhuma URL configurada: não chama fetch e responde 401 genérico", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    const payload = res.json();
    expect(payload.error).not.toMatch(/SUPABASE|rwnzggjxhxnfrhstbxkm|http/i);
  });

  it("sem service role nem anon key: não chama fetch", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("auth-health — precedência de configuração", () => {
  it("usa SUPABASE_URL quando ambas as variáveis de URL estão definidas", async () => {
    const url = "https://hml-correta.supabase.co";
    process.env.SUPABASE_URL = url;
    process.env.VITE_SUPABASE_URL = "https://vite-nao-deve-ser-usada.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-teste";

    const { fn, calls } = makeFetchMock(url);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(calls.every((c) => c.url.startsWith(url))).toBe(true);
    expect(calls.some((c) => c.url.includes("vite-nao-deve-ser-usada"))).toBe(false);
  });

  it("usa SUPABASE_ANON_KEY (não VITE_SUPABASE_ANON_KEY) quando não há service role", async () => {
    const url = "https://hml-x.supabase.co";
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_ANON_KEY = "anon-correta";
    process.env.VITE_SUPABASE_ANON_KEY = "anon-nao-deve-ser-usada";

    const { fn, calls } = makeFetchMock(url);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(), res);

    // A verificação de sessão (primeira chamada, /auth/v1/user) é a única que
    // usa a anon key como apikey — a consulta a tab_usuarios usa service role
    // por design (ver comentário em operadorAdmin), independente da anon key.
    const chamadaSessao = calls.find((c) => c.url === `${url}/auth/v1/user`);
    expect(chamadaSessao).toBeTruthy();
    expect(chamadaSessao.apikey).toBe("anon-correta");
    expect(calls.some((c) => c.apikey === "anon-nao-deve-ser-usada")).toBe(false);
  });
});

describe("auth-health — configuração válida mantém o comportamento", () => {
  it("com SUPABASE_URL e SERVICE_ROLE_KEY válidos, responde 200 com status coerente", async () => {
    const url = "https://hml-x.supabase.co";
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-teste";

    const { fn } = makeFetchMock(url);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload).toHaveProperty("serviceRoleConfigured", true);
    expect(payload).toHaveProperty("status");
  });
});

describe("auth-health — não referencia mais o projeto fixo de produção", () => {
  it("o código-fonte não contém a URL/ref fixa de produção", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../api/auth-health.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
  });
});
