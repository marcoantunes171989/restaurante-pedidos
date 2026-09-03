import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/copiloto-ia.js";

// ════════════════════════════════════════════════════════════
// Gate REL-02C-SUPA-ISO-D — comprova que /api/copiloto-ia não usa mais
// URL/anon key fixas de produção como fallback na validação de sessão, e
// falha fechado (sem fetch ao Supabase) quando a configuração está ausente.
// ════════════════════════════════════════════════════════════

function makeReq(body, { token = "jwt-usuario" } = {}) {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    _body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this._body = payload; return this; },
  };
}

const perguntaValida = { pergunta: "Como estão as vendas?", resumoDados: "vendas: 100" };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-teste";
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.VITE_SUPABASE_ANON_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("copiloto-ia — falha fechada sem configuração do Supabase", () => {
  it("sem nenhuma URL/anon key: não chama fetch e responde 401 genérico", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(perguntaValida), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._body.error).not.toMatch(/SUPABASE|rwnzggjxhxnfrhstbxkm/i);
  });

  it("com URL mas sem anon key: não chama fetch", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(perguntaValida), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("com anon key mas sem URL: não chama fetch", async () => {
    process.env.SUPABASE_ANON_KEY = "anon-teste";
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(perguntaValida), res);

    expect(fn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("copiloto-ia — precedência de configuração", () => {
  it("usa SUPABASE_URL e SUPABASE_ANON_KEY (não as variantes VITE_*)", async () => {
    process.env.SUPABASE_URL = "https://hml-correta.supabase.co";
    process.env.VITE_SUPABASE_URL = "https://vite-nao-deve-ser-usada.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-correta";
    process.env.VITE_SUPABASE_ANON_KEY = "anon-nao-deve-ser-usada";

    const calls = [];
    const fn = vi.fn(async (url, opts = {}) => {
      const urlStr = String(url);
      calls.push({ url: urlStr, apikey: opts.headers?.apikey });
      if (urlStr === "https://hml-correta.supabase.co/auth/v1/user") {
        return { ok: true, json: async () => ({ id: "u1" }) };
      }
      // rota da Anthropic não mockada aqui — o que importa é a chamada de sessão.
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(perguntaValida), res);

    const chamadaSessao = calls.find((c) => c.url === "https://hml-correta.supabase.co/auth/v1/user");
    expect(chamadaSessao).toBeTruthy();
    expect(chamadaSessao.apikey).toBe("anon-correta");
    expect(calls.some((c) => c.url.includes("vite-nao-deve-ser-usada"))).toBe(false);
  });
});

describe("copiloto-ia — configuração válida mantém o comportamento (sessão + IA)", () => {
  it("com Supabase e Anthropic configurados, retorna resultado estruturado", async () => {
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-teste";

    const fn = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr === "https://hml-x.supabase.co/auth/v1/user") {
        return { ok: true, json: async () => ({ id: "u1" }) };
      }
      if (urlStr === "https://api.anthropic.com/v1/messages") {
        return {
          ok: true,
          json: async () => ({
            model: "claude-opus-4-8",
            content: [{
              type: "tool_use",
              name: "responder_gestor",
              input: {
                summary: "ok", evidence: [], diagnosis: "d", recommendations: [],
                impact: "i", confidence: "alta", limitations: [],
              },
            }],
          }),
        };
      }
      throw new Error(`Unmocked fetch: ${urlStr}`);
    });
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq(perguntaValida), res);

    expect(res.statusCode).toBe(200);
    expect(res._body.resultado.summary).toBe("ok");
  });
});

describe("copiloto-ia — sem credenciais fixas de produção", () => {
  it("o código-fonte não contém a URL fixa nem a anon key fixa de produção", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../api/copiloto-ia.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
    // Chave anon fixa antiga (JWT completo) não pode mais existir no fonte.
    expect(src).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI/);
  });
});
