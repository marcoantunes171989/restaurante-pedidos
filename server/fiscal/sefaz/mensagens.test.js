// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  montarConsStatServ, montarConsSitNFe, montarEnviNFeSincrono, montarProcNFe,
  lerRetorno, interpretarAutorizacao, interpretarConsulta, interpretarStatus,
} from "./mensagens.js";
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
const NFE_ASSINADA = assinarNFe(xml, cert);

// Retornos de EXEMPLO no formato do XSD (não são respostas reais da SEFAZ).
const prot = (cStat, xMotivo, nProt = "135260000000001") =>
  `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SP_NFCE_TESTE</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto>` +
  `${nProt ? `<nProt>${nProt}</nProt>` : ""}<digVal>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</digVal><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt></protNFe>`;
const retEnvi = (cStatLote, protXml = "") =>
  `<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SP_NFCE_TESTE</verAplic><cStat>${cStatLote}</cStat>` +
  `<xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto>${protXml}</retEnviNFe>`;

describe("mensagens de envio (validadas no XSD oficial)", () => {
  it("status do serviço", async () => {
    const m = montarConsStatServ({ tpAmb: 2, cUF: "35" });
    expect(m).toBe('<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><cUF>35</cUF><xServ>STATUS</xServ></consStatServ>');
    expect((await validarMensagemXsd(m, "consStatServ")).erros).toEqual([]);
  });
  it("consulta por chave", async () => {
    const m = montarConsSitNFe({ tpAmb: 2, chNFe: CHAVE });
    expect((await validarMensagemXsd(m, "consSitNFe")).erros).toEqual([]);
  });
  it("envio SÍNCRONO (indSinc=1) de uma nota assinada", async () => {
    const m = montarEnviNFeSincrono({ idLote: "202611150000001", nfeAssinada: NFE_ASSINADA });
    expect(m).toContain("<indSinc>1</indSinc>");
    expect((await validarMensagemXsd(m, "enviNFe")).erros).toEqual([]);
  });
  it("recusa lote inválido e nota sem assinatura", () => {
    expect(() => montarEnviNFeSincrono({ idLote: "abc", nfeAssinada: NFE_ASSINADA })).toThrow(/lote/i);
    expect(() => montarEnviNFeSincrono({ idLote: "1", nfeAssinada: xml })).toThrow(/assinad/i);
  });
});

describe("leitura e interpretação dos retornos", () => {
  it("retorno de exemplo é válido no XSD (garante que o teste usa o formato oficial)", async () => {
    expect((await validarMensagemXsd(retEnvi(104, prot(100, "Autorizado o uso da NF-e")), "retEnviNFe")).erros).toEqual([]);
  });
  it("autorizada: guarda protocolo e monta o nfeProc (nota + protocolo) válido no XSD", async () => {
    const r = interpretarAutorizacao(lerRetorno(retEnvi(104, prot(100, "Autorizado o uso da NF-e"))));
    expect(r).toMatchObject({ situacao: "autorizada", cStat: 100, nProt: "135260000000001", chNFe: CHAVE });
    const proc = montarProcNFe({ nfeAssinada: NFE_ASSINADA, protNFeXml: r.protNFeXml });
    expect((await validarMensagemXsd(proc, "procNFe")).erros).toEqual([]);
  });
  it("rejeição da nota: motivo da SEFAZ chega ao usuário", () => {
    const r = interpretarAutorizacao(lerRetorno(retEnvi(104, prot(778, "Rejeicao: Informado NCM inexistente", null))));
    expect(r).toMatchObject({ situacao: "rejeitada", cStat: 778, xMotivo: "Rejeicao: Informado NCM inexistente" });
  });
  it("rejeição do lote inteiro (sem protNFe)", () => {
    expect(interpretarAutorizacao(lerRetorno(retEnvi(225)))).toMatchObject({ situacao: "rejeitada", cStat: 225 });
  });
  it("duplicidade: não é erro final — pede consulta pela chave", () => {
    expect(interpretarAutorizacao(lerRetorno(retEnvi(104, prot(204, "Rejeicao: Duplicidade de NF-e", null))))).toMatchObject({ situacao: "consultar" });
  });
  it("serviço paralisado → indisponível (vai para contingência na E7)", () => {
    expect(interpretarAutorizacao(lerRetorno(retEnvi(108)))).toMatchObject({ situacao: "indisponivel" });
    expect(interpretarStatus(lerRetorno('<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>X</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:00:00-03:00</dhRecbto></retConsStatServ>'))).toMatchObject({ operando: true, cStat: 107 });
  });
  it("consulta: autorizada, não encontrada (pode reenviar) e cancelada", () => {
    const base = (cStat, protXml = "") => `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>X</verAplic><cStat>${cStat}</cStat><xMotivo>m</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:00:00-03:00</dhRecbto><chNFe>${CHAVE}</chNFe>${protXml}</retConsSitNFe>`;
    expect(interpretarConsulta(lerRetorno(base(100, prot(100, "Autorizado")))) ).toMatchObject({ situacao: "autorizada", nProt: "135260000000001" });
    expect(interpretarConsulta(lerRetorno(base(217)))).toMatchObject({ situacao: "nao_encontrada" });
    expect(interpretarConsulta(lerRetorno(base(101)))).toMatchObject({ situacao: "cancelada" });
  });
});
