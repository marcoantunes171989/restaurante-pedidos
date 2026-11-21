// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const CHAVE = "35261112345678000195650010000000011234567890";
const RET = `<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-15T12:30:05-03:00</dhRegEvento><nProt>135260000000099</nProt></infEvento></retEvento></retEnvEvento>`;
const AUT = "2026-11-20T15:00:00Z"; // autorizada às 12:00 em São Paulo

function deps({ dh = AUT, agora = "2026-11-20T15:20:00Z", modelo = 65, contingencia = null } = {}) {
  return {
    podeConfigurar: vi.fn().mockResolvedValue(true), podeEmitir: vi.fn().mockResolvedValue(true), ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
    documento: vi.fn().mockResolvedValue({ id: "d1", loja_id: 7, modelo, serie: 1, numero: 1, ambiente: "homologacao", status: "autorizado", chave: CHAVE, protocolo: "135260000000001", contingencia_documento_id: contingencia, rascunho: { dados: { emit: { CNPJ: "12345678000195" } } } }),
    paraDanfe: vi.fn().mockResolvedValue({ ok: true, xml: "<x/>", fonte: "autorizada", documento: { dh_autorizacao: dh, loja_id: 7 } }),
    proximaSequencia: vi.fn().mockResolvedValue(1), registrarEvento: vi.fn().mockResolvedValue({ ok: true }),
    enviar: vi.fn(async () => ({ ok: true, xml: RET })), agora: () => new Date(agora),
  };
}
const cancelar = (d) => processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente no caixa" }, d);

describe("cancelamento de NFC-e: prazo legal (Ajuste SINIEF 19/16, cl. 15)", () => {
  it("dentro dos 30 minutos: cancela normalmente", async () => {
    const d = deps({ agora: "2026-11-20T15:29:00Z" });
    expect((await cancelar(d)).ok).toBe(true);
    expect(d.enviar).toHaveBeenCalled();
  });
  it("passou dos 30 minutos: recusa ANTES de assinar/enviar, com o limite e o caminho legal", async () => {
    const d = deps({ agora: "2026-11-20T15:31:00Z" });
    const r = await cancelar(d);
    expect(r).toMatchObject({ ok: false, code: "PRAZO_EXPIRADO", prazoMin: 30 });
    expect(r.erro).toMatch(/30 minutos.*regularização.*SIPET/);
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.registrarEvento).not.toHaveBeenCalled();
  });
  it("exatamente no limite já não pode (o prazo é 'não superior a 30 minutos')", async () => {
    expect((await cancelar(deps({ agora: "2026-11-20T15:30:00Z" }))).code).toBe("PRAZO_EXPIRADO");
  });
  it("NF-e não segue essa regra (prazo próprio de 24 h): não é bloqueada por 30 minutos", async () => {
    const d = deps({ modelo: 55, agora: "2026-11-20T18:00:00Z" });
    expect((await cancelar(d)).code).not.toBe("PRAZO_EXPIRADO");
  });
  it("venda coberta por NFC-e de contingência segue outra regra (substituição): não aplica os 30 minutos", async () => {
    const d = deps({ agora: "2026-11-21T10:00:00Z", contingencia: "c1" });
    expect((await cancelar(d)).code).not.toBe("PRAZO_EXPIRADO");
  });
  it("sem a data de autorização (dado antigo) não inventa bloqueio: quem decide é a SEFAZ", async () => {
    const d = deps({ dh: null, agora: "2026-11-21T10:00:00Z" });
    expect((await cancelar(d)).code).not.toBe("PRAZO_EXPIRADO");
  });
});
