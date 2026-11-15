// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarCredencial } from "./credencialService.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const SENHA = "teste-pedido-prime"; // senha pública do certificado de TESTE

function deps(extra = {}) {
  return {
    podeConfigurar: vi.fn().mockResolvedValue(true),
    documentoDaLoja: vi.fn().mockResolvedValue("12345678000195"),
    registrar: vi.fn().mockResolvedValue({ ok: true, id: "c1" }),
    revogar: vi.fn().mockResolvedValue({ ok: true }),
    agora: () => new Date("2026-11-20T12:00:00Z"), // certificado de teste vale de 15/11/2026 22:05 UTC a 2036
    ...extra,
  };
}

describe("processarCredencial — certificado A1", () => {
  it("valida, guarda no cofre e devolve só metadados", async () => {
    const d = deps();
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, d);
    expect(r).toMatchObject({ ok: true, titular: expect.stringMatching(/EMPRESA TESTE/), cnpj: "12345678000195" });
    expect(r.diasRestantes).toBeGreaterThan(3000);
    expect(JSON.stringify(r)).not.toContain(SENHA);
    expect(JSON.stringify(r)).not.toContain(PFX_B64.slice(0, 40));
    const p = d.registrar.mock.calls[0][0];
    expect(p).toMatchObject({ lojaId: 7, tipo: "certificado_a1", ambiente: null, documentoTitular: "12345678000195" });
    expect(JSON.parse(p.segredo)).toEqual({ pfx: PFX_B64, senha: SENHA });
  });
  it("filial com a mesma raiz de CNPJ (8 dígitos) é aceita", async () => {
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, deps({ documentoDaLoja: vi.fn().mockResolvedValue("12345678000276") }));
    expect(r.ok).toBe(true);
  });
  it("raiz de CNPJ diferente da loja é recusada (regra da rejeição 213)", async () => {
    const d = deps({ documentoDaLoja: vi.fn().mockResolvedValue("99888777000100") });
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, d);
    expect(r).toMatchObject({ ok: false, code: "CNPJ_DIVERGENTE" });
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("senha errada → mensagem simples, nada gravado", async () => {
    const d = deps();
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: "x" }, d);
    expect(r).toMatchObject({ ok: false, code: "SENHA_INCORRETA" });
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("certificado vencido é recusado", async () => {
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, deps({ agora: () => new Date("2040-01-01T00:00:00Z") }));
    expect(r).toMatchObject({ ok: false, code: "CERTIFICADO_VENCIDO" });
  });
  it("arquivo grande demais ou vazio é recusado antes de abrir", async () => {
    expect(await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: "", senha: SENHA }, deps())).toMatchObject({ code: "ARQUIVO_INVALIDO" });
    expect(await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: "A".repeat(200000), senha: SENHA }, deps())).toMatchObject({ code: "ARQUIVO_GRANDE" });
  });
});

describe("processarCredencial — permissões e CSC", () => {
  it("sem permissão de configurar a loja → nada acontece", async () => {
    const d = deps({ podeConfigurar: vi.fn().mockResolvedValue(false) });
    const r = await processarCredencial({ acao: "certificado", lojaId: 7, pfxBase64: PFX_B64, senha: SENHA }, d);
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(d.documentoDaLoja).not.toHaveBeenCalled();
  });
  it("CSC por ambiente vai para o cofre", async () => {
    const d = deps();
    const r = await processarCredencial({ acao: "csc", lojaId: 7, ambiente: "homologacao", idCsc: "000001", csc: "ABCDEF0123456789ABCDEF0123456789" }, d);
    expect(r.ok).toBe(true);
    expect(d.registrar.mock.calls[0][0]).toMatchObject({ tipo: "csc", ambiente: "homologacao", idCsc: "1", segredo: "ABCDEF0123456789ABCDEF0123456789" });
    expect(JSON.stringify(r)).not.toContain("ABCDEF0123456789");
  });
  it("CSC sem ambiente ou id inválido é recusado", async () => {
    expect(await processarCredencial({ acao: "csc", lojaId: 7, idCsc: "1", csc: "X".repeat(16) }, deps())).toMatchObject({ code: "AMBIENTE_INVALIDO" });
    expect(await processarCredencial({ acao: "csc", lojaId: 7, ambiente: "producao", idCsc: "abc", csc: "X".repeat(16) }, deps())).toMatchObject({ code: "ID_CSC_INVALIDO" });
  });
  it("revogar repassa o id", async () => {
    const d = deps();
    expect(await processarCredencial({ acao: "revogar", lojaId: 7, id: "c1" }, d)).toMatchObject({ ok: true });
    expect(d.revogar).toHaveBeenCalledWith("c1", 7);
  });
  it("ação desconhecida", async () => {
    expect(await processarCredencial({ acao: "apagar-tudo", lojaId: 7 }, deps())).toMatchObject({ ok: false, code: "ACAO_INVALIDA" });
  });
});
