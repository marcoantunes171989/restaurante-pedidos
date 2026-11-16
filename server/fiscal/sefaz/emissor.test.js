// @vitest-environment node
// Fluxo de ponta a ponta contra uma SEFAZ SIMULADA (função no lugar do
// transporte). Nada sai da máquina. O transporte real (HTTPS com
// certificado) tem seus próprios testes em transporte.test.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { emitirNaSefaz, statusServico, consultarNota } from "./emissor.js";
import { validarMensagemXsd } from "../validarXsd.js";
import { lerCertificadoPfx } from "../certificado.js";
import { assinarNFe } from "../assinarNFe.js";
import { montarXmlNFe } from "../../../src/lib/fiscal/nfeXml.js";

const CHAVE = "35261112345678000195650010000000011234567890";
const cert = lerCertificadoPfx(readFileSync(new URL("../__fixtures__/certificado-teste.pfx", import.meta.url)), "teste-pedido-prime");
const { xml } = montarXmlNFe({
  chave: CHAVE,
  ide: { cUF: "35", cNF: "23456789", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 1, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Teste Ltda", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
});
const NFE = assinarNFe(xml, cert);

const prot = (cStat, motivo) => `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><nProt>135260000000001</nProt><digVal>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</digVal><cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo></infProt></protNFe>`;
const RET = {
  autorizada: `<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto>${prot(100, "Autorizado o uso da NF-e")}</retEnviNFe>`,
  paralisado: `<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>108</cStat><xMotivo>Servico Paralisado Momentaneamente</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto></retEnviNFe>`,
  consAutorizada: `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>100</cStat><xMotivo>Autorizado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:31:00-03:00</dhRecbto><chNFe>${CHAVE}</chNFe>${prot(100, "Autorizado o uso da NF-e")}</retConsSitNFe>`,
  consNaoConsta: `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>217</cStat><xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:31:00-03:00</dhRecbto><chNFe>${CHAVE}</chNFe></retConsSitNFe>`,
  status: `<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:00:00-03:00</dhRecbto></retConsStatServ>`,
};

// SEFAZ simulada: responde conforme o roteiro de cada teste e registra as chamadas.
function sefaz(roteiro) {
  const chamadas = [];
  const enviar = async ({ url, servico, dados }) => {
    chamadas.push({ url, servico, dados });
    const r = roteiro[servico];
    return typeof r === "function" ? r(chamadas.length) : r;
  };
  return { enviar, chamadas };
}
const base = (s) => ({ uf: "SP", modelo: 65, ambiente: "homologacao", pfx: Buffer.from(""), senha: "", enviar: s.enviar });

describe("emissão de ponta a ponta (SEFAZ simulada)", () => {
  it("autorizada: usa o endereço oficial de homologação da NFC-e SP e devolve nfeProc válido", async () => {
    const s = sefaz({ NFeAutorizacao4: { ok: true, xml: RET.autorizada } });
    const r = await emitirNaSefaz({ ...base(s), nfeAssinada: NFE, chNFe: CHAVE, idLote: "1" });
    expect(r).toMatchObject({ situacao: "autorizada", nProt: "135260000000001" });
    expect(s.chamadas[0].url).toBe("https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx");
    expect((await validarMensagemXsd(r.procNFe, "procNFe")).erros).toEqual([]);
  });
  it("sem resposta (tempo esgotado) → CONSULTA antes de reenviar e descobre que foi autorizada", async () => {
    const s = sefaz({
      NFeAutorizacao4: { ok: false, code: "TEMPO_ESGOTADO", incerto: true, erro: "sem resposta" },
      NFeConsultaProtocolo4: { ok: true, xml: RET.consAutorizada },
    });
    const r = await emitirNaSefaz({ ...base(s), nfeAssinada: NFE, chNFe: CHAVE, idLote: "2" });
    expect(r).toMatchObject({ situacao: "autorizada", consultou: true });
    expect(s.chamadas.map((c) => c.servico)).toEqual(["NFeAutorizacao4", "NFeConsultaProtocolo4"]);
    expect(r.procNFe).toContain("<nProt>135260000000001</nProt>");
  });
  it("sem resposta e a SEFAZ não tem a nota → liberada para reenviar", async () => {
    const s = sefaz({
      NFeAutorizacao4: { ok: false, code: "TEMPO_ESGOTADO", incerto: true, erro: "sem resposta" },
      NFeConsultaProtocolo4: { ok: true, xml: RET.consNaoConsta },
    });
    const r = await emitirNaSefaz({ ...base(s), nfeAssinada: NFE, chNFe: CHAVE, idLote: "3" });
    expect(r).toMatchObject({ situacao: "indisponivel", consultou: true });
    expect(r.xMotivo).toMatch(/reenviar/);
  });
  it("sem resposta no envio NEM na consulta → continua incerta (nunca reenvia às cegas)", async () => {
    const falha = { ok: false, code: "TEMPO_ESGOTADO", incerto: true, erro: "sem resposta" };
    const s = sefaz({ NFeAutorizacao4: falha, NFeConsultaProtocolo4: falha });
    expect(await emitirNaSefaz({ ...base(s), nfeAssinada: NFE, chNFe: CHAVE, idLote: "4" })).toMatchObject({ situacao: "incerta" });
  });
  it("serviço paralisado → indisponível (base para a contingência da E7)", async () => {
    const s = sefaz({ NFeAutorizacao4: { ok: true, xml: RET.paralisado } });
    expect(await emitirNaSefaz({ ...base(s), nfeAssinada: NFE, chNFe: CHAVE, idLote: "5" })).toMatchObject({ situacao: "indisponivel", cStat: 108 });
  });
  it("nota fora do leiaute é barrada ANTES de sair da máquina", async () => {
    const s = sefaz({ NFeAutorizacao4: { ok: true, xml: RET.autorizada } });
    const quebrada = NFE.replace("<CFOP>5102</CFOP>", "<CFOP>X</CFOP>");
    const r = await emitirNaSefaz({ ...base(s), nfeAssinada: quebrada, chNFe: CHAVE, idLote: "6" });
    expect(r).toMatchObject({ situacao: "rejeitada", local: true });
    expect(s.chamadas).toHaveLength(0);
  });
  it("teste de conexão (status do serviço)", async () => {
    const s = sefaz({ NFeStatusServico4: { ok: true, xml: RET.status } });
    expect(await statusServico(base(s))).toMatchObject({ operando: true, cStat: 107 });
    expect(s.chamadas[0].url).toBe("https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx");
  });
  it("consulta isolada", async () => {
    const s = sefaz({ NFeConsultaProtocolo4: { ok: true, xml: RET.consNaoConsta } });
    expect(await consultarNota({ ...base(s), chNFe: CHAVE })).toMatchObject({ situacao: "nao_encontrada" });
  });
});
