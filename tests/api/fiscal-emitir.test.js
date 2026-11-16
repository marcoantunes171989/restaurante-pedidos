// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import process from "node:process";
import handler from "../../api/fiscal-emitir.js";

const SERVICE = "service-key-de-teste-nao-deve-vazar";
function resFake() {
  const r = { statusCode: 0, corpo: "" };
  r.setHeader = () => {};
  r.end = (b) => { r.corpo = b || ""; };
  return r;
}
async function chamar(body, { token = "token-do-caixa", method = "POST" } = {}) {
  const res = resFake();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return { status: res.statusCode, json: res.corpo ? JSON.parse(res.corpo) : null, bruto: res.corpo };
}

let chamadas;
beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  chamadas = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    const ok = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d), json: async () => d });
    if (String(url).endsWith("/rpc/app_fiscal_documento_para_emissao")) return ok({ ok: true, documento: { id: "d1", loja_id: 7, status: "autorizado", numero: 7, protocolo: "135260000000007" } });
    if (String(url).endsWith("/rpc/app_pode_receber_pagamento")) return ok(init.headers.authorization === "Bearer token-do-caixa");
    if (String(url).endsWith("/rpc/app_fiscal_pode_configurar")) return ok(false);
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/api/fiscal-emitir", () => {
  it("sem login → 401 sem tocar no banco", async () => {
    expect((await chamar({ acao: "emitir", documentoId: "d1" }, { token: "" })).status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });
  it("permissão de emitir é conferida com o TOKEN DO CAIXA", async () => {
    const r = await chamar({ acao: "emitir", documentoId: "d1" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, jaAutorizada: true });
    const perm = chamadas.find((c) => c.url.endsWith("/rpc/app_pode_receber_pagamento"));
    expect(perm.init.headers.authorization).toBe("Bearer token-do-caixa");
    const doc = chamadas.find((c) => c.url.endsWith("/rpc/app_fiscal_documento_para_emissao"));
    expect(doc.init.headers.authorization).toBe(`Bearer ${SERVICE}`);
  });
  it("outro usuário → 403", async () => {
    expect((await chamar({ acao: "emitir", documentoId: "d1" }, { token: "outro" })).status).toBe(403);
  });
  it("cancelar pela mesma rota exige permissão de gestão (admin), conferida com o token do usuário", async () => {
    globalThis.fetch.mockImplementation(async (url, init = {}) => {
      chamadas.push({ url: String(url), init });
      const ok = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d), json: async () => d });
      if (String(url).endsWith("/rpc/app_fiscal_documento_para_emissao")) return ok({ ok: true, documento: { id: "d1", loja_id: 7, modelo: 65, status: "autorizado", chave: "x", protocolo: "135260000000001" } });
      if (String(url).endsWith("/rpc/app_fiscal_pode_configurar")) return ok(false);
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    });
    const r = await chamar({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" });
    expect(r.status).toBe(403);
    const perm = chamadas.find((c) => c.url.endsWith("/rpc/app_fiscal_pode_configurar"));
    expect(perm.init.headers.authorization).toBe("Bearer token-do-caixa");
    expect(chamadas.some((c) => c.url.includes("evento_registrar"))).toBe(false);
  });
  it("teste de conexão sem permissão de admin → 403 e a chave do servidor não aparece", async () => {
    const r = await chamar({ acao: "status", lojaId: 7, modelo: 65, ambiente: "homologacao" });
    expect(r.status).toBe(403);
    expect(r.bruto).not.toContain(SERVICE);
  });
});
