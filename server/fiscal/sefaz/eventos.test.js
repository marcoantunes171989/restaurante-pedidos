// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, createVerify, X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { validateXML } from "xmllint-wasm";
import {
  detCancelamento, detCancelamentoSubstituicao, detCartaCorrecao, montarEvento, assinarEvento,
  montarEnvEvento, interpretarRetEvento, montarProcEvento, enviarEvento,
} from "./eventos.js";
import { validarMensagemXsd } from "../validarXsd.js";
import { lerCertificadoPfx } from "../certificado.js";

const cert = lerCertificadoPfx(readFileSync(new URL("../__fixtures__/certificado-teste.pfx", import.meta.url)), "teste-pedido-prime");
const CHAVE = "35261112345678000195650010000000011234567890";
const CHAVE_SUBST = "35261112345678000195650010000000021234567891";
const PROT = "135260000000001";
const base = { tpAmb: 2, cOrgao: "35", cnpj: "12345678000195", chNFe: CHAVE, dhEvento: "2026-11-15T15:40:00Z", nSeqEvento: 1 };

async function c14n(xml) {
  const r = await validateXML({ xml: [{ fileName: "x.xml", contents: xml }], normalization: "c14n" });
  return String(r.normalized).replace(/\n$/, "");
}
const entre = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b) + b.length);
const tag = (s, n) => (s.match(new RegExp(`<${n}>([^<]*)</${n}>`)) || [])[1];

describe("conteúdo dos eventos (detEvento × XSD específico)", () => {
  it("cancelamento (110111)", async () => {
    const d = detCancelamento({ nProt: PROT, xJust: "Venda desfeita pelo cliente no caixa" });
    expect((await validarMensagemXsd(`<detEvento xmlns="http://www.portalfiscal.inf.br/nfe"${d.slice(10)}`, "det110111")).erros).toEqual([]);
  });
  it("cancelamento por substituição (110112, NFC-e)", async () => {
    const d = detCancelamentoSubstituicao({ cOrgaoAutor: "35", verAplic: "PedidoPrime 1.0", nProt: PROT, xJust: "Nota emitida em contingencia substituida", chNFeRef: CHAVE_SUBST });
    expect((await validarMensagemXsd(`<detEvento xmlns="http://www.portalfiscal.inf.br/nfe"${d.slice(10)}`, "det110112")).erros).toEqual([]);
  });
  it("carta de correção (110110, NF-e) com o texto legal lido do XSD oficial", async () => {
    const d = detCartaCorrecao({ xCorrecao: "Endereco do destinatario: Rua das Flores, 100 - Centro" });
    expect(d).toContain("<xCondUso>A Carta de Correcao e disciplinada pelo paragrafo 1o-A");
    expect((await validarMensagemXsd(`<detEvento xmlns="http://www.portalfiscal.inf.br/nfe"${d.slice(10)}`, "det110110")).erros).toEqual([]);
  });
  it("justificativa e correção respeitam os tamanhos do leiaute", () => {
    expect(() => detCancelamento({ nProt: PROT, xJust: "curta" })).toThrow(/15/);
    expect(() => detCartaCorrecao({ xCorrecao: "x".repeat(1001) })).toThrow(/1000/);
    expect(() => detCancelamento({ nProt: "123", xJust: "Justificativa suficientemente longa" })).toThrow(/protocolo/i);
  });
});

describe("evento completo: monta, assina e valida", () => {
  const evento = montarEvento({ ...base, tpEvento: "110111", detEvento: detCancelamento({ nProt: PROT, xJust: "Venda desfeita pelo cliente no caixa" }) });
  const assinado = assinarEvento(evento, cert);

  it("Id = ID + tipo + chave + sequência (2 dígitos)", () => {
    expect(evento).toContain(`<infEvento Id="ID110111${CHAVE}01">`);
  });
  it("envEvento assinado é válido no XSD oficial", async () => {
    expect((await validarMensagemXsd(montarEnvEvento({ idLote: "1", eventoAssinado: assinado }), "envEvento")).erros).toEqual([]);
  });
  it("assinatura conferida de forma independente (libxml2 + chave do certificado)", async () => {
    const inf = entre(assinado, "<infEvento ", "</infEvento>").replace("<infEvento ", '<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" ');
    expect(tag(assinado, "DigestValue")).toBe(createHash("sha1").update(await c14n(inf), "utf8").digest("base64"));
    const si = entre(assinado, "<SignedInfo>", "</SignedInfo>").replace("<SignedInfo>", '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
    const v = createVerify("RSA-SHA1");
    v.update(await c14n(si), "utf8");
    expect(v.verify(new X509Certificate(Buffer.from(tag(assinado, "X509Certificate"), "base64")).publicKey, tag(assinado, "SignatureValue"), "base64")).toBe(true);
  });
});

describe("retorno do evento", () => {
  const evento = assinarEvento(montarEvento({ ...base, tpEvento: "110111", detEvento: detCancelamento({ nProt: PROT, xJust: "Venda desfeita pelo cliente no caixa" }) }), cert);
  const ret = (cStat, motivo, nProt = "135260000000099") => `<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>` +
    `<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cOrgao>35</cOrgao><cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-15T12:40:05-03:00</dhRegEvento>${nProt ? `<nProt>${nProt}</nProt>` : ""}</infEvento></retEvento></retEnvEvento>`;

  it("retorno de exemplo válido no XSD (formato oficial)", async () => {
    expect((await validarMensagemXsd(ret(135, "Evento registrado e vinculado a NF-e"), "retEnvEvento")).erros).toEqual([]);
  });
  it("registrado → guarda protocolo e monta procEventoNFe válido", async () => {
    const r = interpretarRetEvento(ret(135, "Evento registrado e vinculado a NF-e"));
    expect(r).toMatchObject({ situacao: "registrado", cStat: 135, nProt: "135260000000099" });
    expect((await validarMensagemXsd(montarProcEvento({ eventoAssinado: evento, retEventoXml: r.retEventoXml }), "procEventoNFe")).erros).toEqual([]);
  });
  it("prazo de cancelamento vencido → rejeitado com o motivo da SEFAZ", () => {
    expect(interpretarRetEvento(ret(501, "Rejeicao: Prazo de cancelamento superior ao previsto na Legislacao", null))).toMatchObject({ situacao: "rejeitado", cStat: 501 });
  });
  it("envio usa o serviço oficial RecepcaoEvento e trata falta de resposta", async () => {
    const chamadas = [];
    const enviar = async (o) => { chamadas.push(o); return { ok: true, xml: ret(135, "Evento registrado e vinculado a NF-e") }; };
    const r = await enviarEvento({ uf: "SP", modelo: 65, ambiente: "homologacao", eventoAssinado: evento, idLote: "1", pfx: Buffer.from(""), senha: "", enviar });
    expect(r).toMatchObject({ situacao: "registrado" });
    expect(chamadas[0]).toMatchObject({ url: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx", servico: "NFeRecepcaoEvento4" });
    const semResposta = await enviarEvento({ uf: "SP", modelo: 65, ambiente: "homologacao", eventoAssinado: evento, idLote: "2", pfx: Buffer.from(""), senha: "", enviar: async () => ({ ok: false, code: "TEMPO_ESGOTADO", incerto: true, erro: "x" }) });
    expect(semResposta).toMatchObject({ situacao: "incerto" });
  });
});
