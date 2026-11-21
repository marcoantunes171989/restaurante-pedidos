// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { processarEmissao } from "./emissaoService.js";

const DOC = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 3, ambiente: "homologacao", status: "autorizado", chave: "3".repeat(44), protocolo: "135" };
function deps({ emitir = false, configurar = false, retorno = { ok: true, fonte: "autorizada", xml: "<nfeProc/>", documento: DOC } } = {}) {
  return {
    podeEmitir: vi.fn(async () => emitir), podeConfigurar: vi.fn(async () => configurar),
    paraDanfe: vi.fn(async () => retorno),
  };
}

describe("ação xml (consulta e download)", () => {
  it("quem opera o caixa da loja recebe o XML com os dados do arquivo", async () => {
    const r = await processarEmissao({ acao: "xml", documentoId: "d1" }, deps({ emitir: true }));
    expect(r).toMatchObject({ ok: true, xml: "<nfeProc/>", modelo: 65, serie: 1, numero: 3, chave: "3".repeat(44), fonte: "autorizada" });
  });
  it("quem só administra a loja (sem caixa) também recebe", async () => {
    expect((await processarEmissao({ acao: "xml", documentoId: "d1" }, deps({ configurar: true }))).ok).toBe(true);
  });
  it("sem permissão na loja: FORBIDDEN, e o XML não vai na resposta", async () => {
    const r = await processarEmissao({ acao: "xml", documentoId: "d1" }, deps());
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(JSON.stringify(r)).not.toContain("nfeProc");
  });
  it("a permissão é conferida na loja DA NOTA (não na que o navegador disser)", async () => {
    const d = deps({ emitir: true });
    await processarEmissao({ acao: "xml", documentoId: "d1", lojaId: 999 }, d);
    expect(d.podeEmitir).toHaveBeenCalledWith(7);
  });
  it("nota ainda sem XML: mensagem clara; nota inexistente: NAO_ENCONTRADO", async () => {
    expect((await processarEmissao({ acao: "xml", documentoId: "d1" }, deps({ emitir: true, retorno: { ok: false, code: "SEM_XML", loja_id: 7 } }))).code).toBe("SEM_XML");
    expect((await processarEmissao({ acao: "xml", documentoId: "x" }, deps({ emitir: true, retorno: null }))).code).toBe("NAO_ENCONTRADO");
  });
});
