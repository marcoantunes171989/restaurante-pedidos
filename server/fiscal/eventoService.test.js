// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";
import { validarMensagemXsd } from "./validarXsd.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const CHAVE = "35261112345678000195650010000000011234567890";
const CHAVE_SUBST = "35261112345678000195650010000000021234567891";

const ret = (cStat, motivo, tp = "110111") => `<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>` +
  `<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>${tp}</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-15T12:40:05-03:00</dhRegEvento>${cStat === 135 ? "<nProt>135260000000099</nProt>" : ""}</infEvento></retEvento></retEnvEvento>`;

function deps(doc = {}, extra = {}) {
  const enviados = [];
  return {
    podeConfigurar: vi.fn().mockResolvedValue(true),
    podeEmitir: vi.fn().mockResolvedValue(true),
    ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
    documento: vi.fn().mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "autorizado", chave: CHAVE, protocolo: "135260000000001", rascunho: { dados: { emit: { CNPJ: "12345678000195" } } }, ...doc }),
    proximaSequencia: vi.fn().mockResolvedValue(1),
    registrarEvento: vi.fn().mockResolvedValue({ ok: true }),
    enviar: vi.fn(async (o) => { enviados.push(o); return { ok: true, xml: ret(135, "Evento registrado e vinculado a NF-e", o.dados.includes("110110") ? "110110" : "110111") }; }),
    enviados,
    ...extra,
  };
}

describe("eventos pela rota de emissão", () => {
  it("cancelar: envio válido no XSD, registra e devolve protocolo", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente no caixa" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "registrado", protocolo: "135260000000099" });
    expect(d.enviados[0].servico).toBe("NFeRecepcaoEvento4");
    expect((await validarMensagemXsd(d.enviados[0].dados, "envEvento")).erros).toEqual([]);
    expect(d.registrarEvento.mock.calls[0][0]).toMatchObject({ documentoId: "d1", tpEvento: "110111", nSeq: 1, status: "registrado", protocolo: "135260000000099" });
    expect(d.registrarEvento.mock.calls[0][0].xml).toMatch(/^<procEventoNFe /);
  });
  it("cancelar exige permissão de gestão (admin) e justificativa de 15+ letras", async () => {
    expect(await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" }, deps({}, { podeConfigurar: vi.fn().mockResolvedValue(false) }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "curta" }, deps())).toMatchObject({ code: "ENTRADA_INVALIDA" });
  });
  it("só cancela nota autorizada", async () => {
    expect(await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" }, deps({ status: "rejeitado" }))).toMatchObject({ code: "STATUS_NAO_PERMITE" });
  });
  it("prazo vencido: rejeição da SEFAZ registrada e devolvida", async () => {
    const d = deps({}, { enviar: vi.fn().mockResolvedValue({ ok: true, xml: ret(501, "Rejeicao: Prazo de cancelamento superior ao previsto na Legislacao") }) });
    const r = await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente no caixa" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "rejeitado", cStat: 501 });
    expect(d.registrarEvento.mock.calls[0][0]).toMatchObject({ status: "rejeitado", cStat: 501 });
  });
  it("substituição: só NFC-e, com a chave da nota substituta", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "substituir", documentoId: "d1", chNFeRef: CHAVE_SUBST, xJust: "Nota emitida em contingencia substituida" }, d);
    expect(r).toMatchObject({ ok: true });
    expect(d.enviados[0].dados).toContain(`<chNFeRef>${CHAVE_SUBST}</chNFeRef>`);
    expect(await processarEmissao({ acao: "substituir", documentoId: "d1", chNFeRef: CHAVE_SUBST, xJust: "Nota emitida em contingencia substituida" }, deps({ modelo: 55 }))).toMatchObject({ code: "SO_NFCE" });
  });
  it("carta de correção: só NF-e, sequência vinda do banco", async () => {
    const d = deps({ modelo: 55 }, { proximaSequencia: vi.fn().mockResolvedValue(3) });
    const r = await processarEmissao({ acao: "cce", documentoId: "d1", xCorrecao: "Endereco do destinatario: Rua das Flores, 100" }, d);
    expect(r).toMatchObject({ ok: true });
    expect(d.enviados[0].dados).toContain("<nSeqEvento>3</nSeqEvento>");
    expect(await processarEmissao({ acao: "cce", documentoId: "d1", xCorrecao: "Endereco do destinatario: Rua das Flores, 100" }, deps())).toMatchObject({ code: "SO_NFE" });
  });
  it("sem resposta da SEFAZ → incerto (não marca como cancelada)", async () => {
    const d = deps({}, { enviar: vi.fn().mockResolvedValue({ ok: false, code: "TEMPO_ESGOTADO", incerto: true, erro: "x" }) });
    const r = await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente no caixa" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "incerto" });
    expect(d.registrarEvento.mock.calls[0][0]).toMatchObject({ status: "incerto" });
  });
});

describe("eventos de nota autorizada pela SVC", () => {
  const CHAVE_SVC = "35261112345678000195550010000000216123456789";
  it("cancelamento vai à própria SVC-AN; CC-e vai à SEFAZ de origem", async () => {
    const d = deps({ modelo: 55, chave: CHAVE_SVC });
    await processarEmissao({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente no caixa" }, d);
    expect(d.enviados[0].url).toBe("https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx");
    await processarEmissao({ acao: "cce", documentoId: "d1", xCorrecao: "Corrige o endereco de entrega do cliente" }, d);
    expect(d.enviados[1].url).toBe("https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx");
  });
});
