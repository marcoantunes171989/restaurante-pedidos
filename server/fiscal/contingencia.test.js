// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { lerCertificadoPfx } from "./certificado.js";
import { validarNFeXsd } from "./validarXsd.js";
import { urlQrCodeV2, urlQrCodeV2Offline } from "./qrcodeNfce.js";
import { paraContingencia, montarNfceContingencia, prazoContingencia, svcDaUf, montarNfeSvc } from "./contingencia.js";
import { dvChave } from "../../src/lib/fiscal/nfeDaVenda.js";

// ── Exemplos OFICIAIS do "Manual de Padrões Técnicos do DANFE NFC-e e
//    QR-Code" v6.0 (março/2025), seções 4.3.6.1 e 4.3.6.2. A entrada do
//    hash no manual usa o CSC "SEU-CODIGO-CSC-CONTRIBUINTE-36-CARACTERES".
const MANUAL = {
  url: "http://www.sefazexemplo.gov.br/nfce/qrcode",
  csc: "SEU-CODIGO-CSC-CONTRIBUINTE-36-CARACTERES",
  online: { chave: "28170800156225000131650110000151341562040824", hash: "DC6AE2C2B9A992BE59679AC365E29922DE6B7511" },
  offline: {
    chave: "28170800156225000131650110000151349562040824", dia: "02", vNF: "60.90",
    digest: "yzGYhUx1/XYYzksWB+fPR3Qc50c=", digVal: "797a4759685578312f5859597a6b7357422b6650523351633530633d",
    hash: "4615A93BB0D7C4E780F8D30EE77EDD5BA55C7D66",
  },
};
// Padrão do XSD oficial (PL 010h v1.03, infNFeSupl/qrCode) para tpEmis 9.
const XSD_V2_OFFLINE = /^((HTTPS?|https?):\/\/.*\?p=([0-9]{6}[0-9A-Z]{12}[0-9]{16}9[0-9]{9})\|[2]\|[1-2]\|([0]{1}[1-9]{1}|[1-2]{1}[0-9]{1}|[3]{1}[0-1]{1})\|(0|0\.[0-9]{2}|[1-9]{1}[0-9]{0,12}(\.[0-9]{2})?)\|[A-Fa-f0-9]{56}\|(0|[1-9]{1}([0-9]{1,5})?)\|[A-Fa-f0-9]{40})$/;

describe("QR Code v2 — exemplos oficiais do manual", () => {
  it("online: reproduz o hash do manual", () => {
    const u = urlQrCodeV2({ urlBase: MANUAL.url, chave: MANUAL.online.chave, tpAmb: 1, idCsc: "1", csc: MANUAL.csc });
    expect(u).toBe(`${MANUAL.url}?p=${MANUAL.online.chave}|2|1|1|${MANUAL.online.hash}`);
  });
  it("off-line: digVal em hexa e hash idênticos ao manual", () => {
    const o = MANUAL.offline;
    const u = urlQrCodeV2Offline({ urlBase: MANUAL.url, chave: o.chave, tpAmb: 1, dia: o.dia, vNF: o.vNF, digestValue: o.digest, idCsc: "000001", csc: MANUAL.csc });
    expect(u).toBe(`${MANUAL.url}?p=${o.chave}|2|1|02|60.90|${o.digVal}|1|${o.hash}`);
    expect(XSD_V2_OFFLINE.test(u)).toBe(true);
  });
  it("off-line exige chave de contingência (tpEmis 9) e dados válidos", () => {
    const base = { urlBase: MANUAL.url, tpAmb: 1, dia: "02", vNF: "60.90", digestValue: MANUAL.offline.digest, idCsc: "1", csc: MANUAL.csc };
    expect(() => urlQrCodeV2Offline({ ...base, chave: MANUAL.online.chave })).toThrow(/contingência/i);
    expect(() => urlQrCodeV2Offline({ ...base, chave: MANUAL.offline.chave, dia: "32" })).toThrow(/dia/i);
    expect(() => urlQrCodeV2Offline({ ...base, chave: MANUAL.offline.chave, vNF: "60,90" })).toThrow(/valor/i);
    expect(() => urlQrCodeV2Offline({ ...base, chave: MANUAL.offline.chave, digestValue: "curto" })).toThrow(/DigestValue/);
    expect(() => urlQrCodeV2Offline({ ...base, chave: MANUAL.offline.chave, csc: "" })).toThrow(/CSC/);
  });
});

// ── Nota de teste (dados fictícios; certificado de TESTE autoassinado) ──
const PFX = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url));
const cert = lerCertificadoPfx(PFX, "teste-pedido-prime");
const CHAVE_NORMAL = (() => { const b = "3526111234567800019565001000000020" + "1" + "23456789"; return b + dvChave(b); })();
const NOTA = {
  chave: CHAVE_NORMAL,
  ide: { cUF: "35", cNF: "23456789", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 20, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Restaurante Teste", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 2, vUnCom: 30.45, vProd: 60.9,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 60.9 }] },
};
const JUST = "SEFAZ sem resposta no momento da venda";
const DH_CONT = "2026-11-15T15:31:00Z";

describe("paraContingencia (Anexo IV do MOC 7.0)", () => {
  it("vira tpEmis 9 com novo número, mesma série e cNF, chave e DV recalculados", () => {
    const c = paraContingencia(NOTA, { nNF: 21, dhCont: DH_CONT, xJust: JUST });
    expect(c.ide.tpEmis).toBe(9);
    expect(c.ide.nNF).toBe(21);
    expect(c.ide.cNF).toBe("23456789");
    expect(c.chave.slice(0, 22)).toBe(CHAVE_NORMAL.slice(0, 22));
    expect(c.chave.slice(22, 43)).toBe("001" + "000000021" + "9" + "23456789");
    expect(c.chave.slice(43)).toBe(String(dvChave(c.chave.slice(0, 43))));
    expect(c.ide.cDV).toBe(c.chave.slice(43));
    expect(c.ide.dhCont).toBe(DH_CONT);
    expect(c.ide.xJust).toBe(JUST);
    expect(NOTA.ide.tpEmis).toBeUndefined(); // não altera o original
  });
  it("recusa NF-e (contingência off-line é só da NFC-e) e justificativa fora de 15–256", () => {
    expect(() => paraContingencia({ ...NOTA, ide: { ...NOTA.ide, mod: 55 } }, { nNF: 21, dhCont: DH_CONT, xJust: JUST })).toThrow(/NFC-e/);
    expect(() => paraContingencia(NOTA, { nNF: 21, dhCont: DH_CONT, xJust: "curta" })).toThrow(/15/);
    expect(() => paraContingencia(NOTA, { nNF: 21, dhCont: DH_CONT, xJust: "x".repeat(257) })).toThrow(/256/);
    expect(() => paraContingencia(NOTA, { nNF: 21, dhCont: "ontem", xJust: JUST })).toThrow(/data/i);
  });
  it("exige operação presencial interna com consumidor final", () => {
    expect(() => paraContingencia({ ...NOTA, ide: { ...NOTA.ide, indPres: 4 } }, { nNF: 21, dhCont: DH_CONT, xJust: JUST })).toThrow(/presencial/i);
    expect(() => paraContingencia({ ...NOTA, ide: { ...NOTA.ide, idDest: 2 } }, { nNF: 21, dhCont: DH_CONT, xJust: JUST })).toThrow(/interna/i);
  });
  it("não reaproveita o número que já foi tentado no modo normal", () => {
    expect(() => paraContingencia(NOTA, { nNF: 20, dhCont: DH_CONT, xJust: JUST })).toThrow(/número/i);
  });
});

describe("montarNfceContingencia — NFC-e off-line assinada", () => {
  const dados = paraContingencia(NOTA, { nNF: 21, dhCont: DH_CONT, xJust: JUST });
  const r = montarNfceContingencia(dados, {
    chavePrivadaPem: cert.chavePrivadaPem, certificadoBase64: cert.certificadoBase64,
    urlQrCode: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode", urlChave: "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta",
    idCsc: "1", csc: "CSC-DE-TESTE-0123456789",
  });
  const tag = (n) => (r.xml.match(new RegExp(`<${n}>([^<]*)</${n}>`)) || [])[1];

  it("passa no XSD oficial (PL 010h v1.03)", async () => {
    const v = await validarNFeXsd(r.xml);
    expect(v.erros).toEqual([]);
    expect(v.valido).toBe(true);
  });
  it("leva tpEmis 9, dhCont e xJust no ide", () => {
    expect(r.xml).toContain("<tpEmis>9</tpEmis>");
    expect(r.xml).toContain("<dhCont>2026-11-15T12:31:00-03:00</dhCont><xJust>" + JUST + "</xJust>");
  });
  it("QR Code off-line: dia, valor e DigestValue da própria assinatura", () => {
    const qr = tag("qrCode");
    expect(qr).toBe(r.qrCode);
    expect(XSD_V2_OFFLINE.test(qr)).toBe(true);
    const p = qr.split("?p=")[1].split("|");
    expect(p[0]).toBe(dados.chave);
    expect(p[3]).toBe("15");
    expect(p[4]).toBe(tag("vNF"));
    expect(p[5]).toBe(Buffer.from(tag("DigestValue"), "ascii").toString("hex"));
    const hash = createHash("sha1").update(p.slice(0, 7).join("|") + "CSC-DE-TESTE-0123456789").digest("hex").toUpperCase();
    expect(p[7]).toBe(hash);
  });
});

describe("prazoContingencia — até o fim do 1º dia útil seguinte (Ajuste SINIEF 19/16)", () => {
  it("dia de semana → fim do dia seguinte (horário de Brasília)", () => {
    expect(prazoContingencia("2026-11-17T15:00:00-03:00").toISOString()).toBe("2026-11-19T02:59:59.999Z"); // terça → quarta 23:59:59
  });
  it("sexta e sábado → fim da segunda-feira", () => {
    expect(prazoContingencia("2026-11-20T22:00:00-03:00").toISOString()).toBe("2026-11-24T02:59:59.999Z");
    expect(prazoContingencia("2026-11-21T10:00:00-03:00").toISOString()).toBe("2026-11-24T02:59:59.999Z");
  });
  it("usa a data local de Brasília, não a UTC", () => {
    // 23:30 de terça em Brasília = 02:30Z de quarta → prazo continua sendo quarta.
    expect(prazoContingencia("2026-11-18T02:30:00Z").toISOString()).toBe("2026-11-19T02:59:59.999Z");
  });
});

describe("SVC da NF-e (MOC 7.0 Anexo III)", () => {
  const NFE = { ...NOTA, chave: CHAVE_NORMAL.slice(0, 20) + "55" + CHAVE_NORMAL.slice(22, 43), ide: { ...NOTA.ide, mod: 55, indPres: 4, idDest: 2 } };
  NFE.chave += String(dvChave(NFE.chave));
  it("SP usa a SVC-AN (tpEmis 6); BA usa a SVC-RS (tpEmis 7)", () => {
    expect(svcDaUf("SP")).toEqual({ autorizador: "SVC-AN", tpEmis: 6 });
    expect(svcDaUf("BA")).toEqual({ autorizador: "SVC-RS", tpEmis: 7 });
    expect(() => svcDaUf("XX")).toThrow(/SVC/);
  });
  it("NF-e vira tpEmis 6 com número novo (sem as regras presenciais da NFC-e)", () => {
    const c = paraContingencia(NFE, { nNF: 21, dhCont: DH_CONT, xJust: JUST, tpEmis: 6 });
    expect(c.ide.tpEmis).toBe(6);
    expect(c.chave.slice(20, 22)).toBe("55");
    expect(c.chave[34]).toBe("6");
    expect(c.chave.slice(43)).toBe(String(dvChave(c.chave.slice(0, 43))));
    expect(() => paraContingencia(NFE, { nNF: 20, dhCont: DH_CONT, xJust: JUST, tpEmis: 6 })).toThrow(/número/i);
  });
  it("SVC só para NF-e; off-line só para NFC-e; forma inválida recusada", () => {
    expect(() => paraContingencia(NOTA, { nNF: 21, dhCont: DH_CONT, xJust: JUST, tpEmis: 6 })).toThrow(/SVC/);
    expect(() => paraContingencia(NFE, { nNF: 21, dhCont: DH_CONT, xJust: JUST, tpEmis: 4 })).toThrow(/inválida/);
    expect(() => montarNfeSvc(NFE, cert)).toThrow(/tpEmis 6 ou 7/);
  });
});
