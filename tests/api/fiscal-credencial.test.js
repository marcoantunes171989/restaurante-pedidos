// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import process from "node:process";
import handler from "../../api/fiscal-credencial.js";

const URL_SB = "https://test.supabase.co";
const SERVICE = "service-key-de-teste-nao-deve-vazar";
const PFX_B64 = readFileSync(new URL("../../server/fiscal/__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const SENHA = "teste-pedido-prime";

function resFake() {
  const r = { statusCode: 0, headers: {}, corpo: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.corpo = b || ""; };
  return r;
}
async function chamar(body, { token = "token-do-usuario", method = "POST" } = {}) {
  const res = resFake();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return { status: res.statusCode, json: res.corpo ? JSON.parse(res.corpo) : null, bruto: res.corpo };
}

let chamadas;
beforeEach(() => {
  process.env.SUPABASE_URL = URL_SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  chamadas = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
    if (u.endsWith("/rpc/app_fiscal_pode_configurar")) return ok(init.headers.authorization === "Bearer token-do-usuario");
    if (u.endsWith("/rpc/app_fiscal_loja_servidor")) return ok({ ok: true, documento: "12.345.678/0001-95", emitente: null });
    if (u.endsWith("/rpc/app_fiscal_credencial_registrar")) return ok({ ok: true, id: "c1" });
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/api/fiscal-credencial", () => {
  it("sem login → 401 e nenhuma chamada ao banco", async () => {
    const r = await chamar({ acao: "certificado", lojaId: 7 }, { token: "" });
    expect(r.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });
  it("só aceita POST", async () => {
    expect((await chamar({}, { method: "GET" })).status).toBe(405);
  });
  it("permissão é conferida com o TOKEN DO USUÁRIO (não com a chave do servidor)", async () => {
    const r = await chamar({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, { token: "token-de-outro" });
    expect(r.status).toBe(403);
    const perm = chamadas.find((c) => c.url.endsWith("/rpc/app_fiscal_pode_configurar"));
    expect(perm.init.headers.authorization).toBe("Bearer token-de-outro");
    expect(chamadas.some((c) => c.url.includes("credencial_registrar"))).toBe(false);
  });
  it("certificado válido → grava pelo servidor e a resposta não traz senha, arquivo nem chave do servidor", async () => {
    const r = await chamar({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, cnpj: "12345678000195" });
    expect(r.bruto).not.toContain(SENHA);
    expect(r.bruto).not.toContain(PFX_B64.slice(0, 40));
    expect(r.bruto).not.toContain(SERVICE);
    const reg = chamadas.find((c) => c.url.endsWith("/rpc/app_fiscal_credencial_registrar"));
    expect(reg.init.headers.authorization).toBe(`Bearer ${SERVICE}`);
    expect(r.json).toMatchObject({ ok: true });
  });
  it("erro inesperado → 500 genérico", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error(`falha com ${SENHA}`); });
    const r = await chamar({ acao: "csc", lojaId: 7, ambiente: "homologacao", idCsc: "1", csc: "X".repeat(16) });
    expect([403, 500]).toContain(r.status);
    expect(r.bruto).not.toContain(SENHA);
  });
});
