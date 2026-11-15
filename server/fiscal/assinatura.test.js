// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, createVerify, X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { validateXML } from "xmllint-wasm";
import { lerCertificadoPfx } from "./certificado.js";
import { assinarNFe } from "./assinarNFe.js";
import { validarNFeXsd } from "./validarXsd.js";
import { urlQrCodeV3, grupoInfNFeSupl } from "./qrcodeNfce.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";

const PFX = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url));
const SENHA = "teste-pedido-prime"; // senha pública do certificado de TESTE (ver LEIA-ME)

const CHAVE = "35261112345678000195650010000000011234567890";
const NOTA = {
  chave: CHAVE,
  ide: { cUF: "35", cNF: "23456789", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 1, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Bar & Restaurante \"Teste\"", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger <duplo>", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 2, vUnCom: 32.9, vProd: 65.8,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 70 }] },
};

async function c14n(xml) {
  const r = await validateXML({ xml: [{ fileName: "x.xml", contents: xml }], normalization: "c14n" });
  return String(r.normalized).replace(/\n$/, "");
}
const entre = (s, ini, fim) => s.slice(s.indexOf(ini), s.indexOf(fim) + fim.length);
const tag = (s, n) => (s.match(new RegExp(`<${n}>([^<]*)</${n}>`)) || [])[1];

describe("lerCertificadoPfx", () => {
  it("abre o PFX com a senha e lê titular, CNPJ e validade", () => {
    const c = lerCertificadoPfx(PFX, SENHA);
    expect(c.titular).toMatch(/EMPRESA TESTE PEDIDO PRIME LTDA/);
    expect(c.cnpj).toBe("12345678000195");
    expect(c.validadeFim.getUTCFullYear()).toBe(2036);
    expect(c.chavePrivadaPem).toMatch(/BEGIN (RSA )?PRIVATE KEY/);
    expect(c.certificadoBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
  it("senha errada → erro claro, sem vazar detalhes", () => {
    expect(() => lerCertificadoPfx(PFX, "errada")).toThrow(/senha/i);
  });
  it("arquivo que não é PFX → erro claro", () => {
    expect(() => lerCertificadoPfx(Buffer.from("não sou um certificado"), SENHA)).toThrow(/certificado/i);
  });
});

describe("assinarNFe (XMLDSig enveloped, RSA-SHA1, C14N 2001)", () => {
  const cert = lerCertificadoPfx(PFX, SENHA);
  const { xml } = montarXmlNFe(NOTA);
  const assinado = assinarNFe(xml, { chavePrivadaPem: cert.chavePrivadaPem, certificadoBase64: cert.certificadoBase64 });

  it("insere ds:Signature logo após infNFe, com os algoritmos fixos do leiaute", () => {
    expect(assinado).toContain('</infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>');
    expect(assinado).toContain('<Reference URI="#NFe' + CHAVE + '">');
    expect(assinado).toContain('Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"');
    expect(assinado.endsWith("</Signature></NFe>")).toBe(true);
  });

  it("DigestValue confere com o SHA-1 do infNFe canonicalizado pelo libxml2 (verificação independente)", async () => {
    const infNFe = entre(assinado, "<infNFe ", "</infNFe>").replace("<infNFe ", '<infNFe xmlns="http://www.portalfiscal.inf.br/nfe" ');
    const digest = createHash("sha1").update(await c14n(infNFe), "utf8").digest("base64");
    expect(tag(assinado, "DigestValue")).toBe(digest);
  });

  it("SignatureValue confere com a chave pública do certificado do KeyInfo (verificação independente)", async () => {
    const signedInfo = entre(assinado, "<SignedInfo>", "</SignedInfo>").replace("<SignedInfo>", '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
    const certDoXml = new X509Certificate(Buffer.from(tag(assinado, "X509Certificate"), "base64"));
    const v = createVerify("RSA-SHA1");
    v.update(await c14n(signedInfo), "utf8");
    expect(v.verify(certDoXml.publicKey, tag(assinado, "SignatureValue"), "base64")).toBe(true);
  });

  it("alterar qualquer valor depois de assinar quebra o resumo", async () => {
    const adulterado = assinado.replace("<vProd>65.80</vProd>", "<vProd>6.58</vProd>");
    const infNFe = entre(adulterado, "<infNFe ", "</infNFe>").replace("<infNFe ", '<infNFe xmlns="http://www.portalfiscal.inf.br/nfe" ');
    const digest = createHash("sha1").update(await c14n(infNFe), "utf8").digest("base64");
    expect(tag(adulterado, "DigestValue")).not.toBe(digest);
  });

  it("documento assinado (com QR Code v3) é aprovado no XSD oficial", async () => {
    const supl = grupoInfNFeSupl({ qrCode: urlQrCodeV3({ urlBase: "https://www.exemplo-sefaz.gov.br/qrcode", chave: CHAVE, tpAmb: 2 }), urlChave: "https://www.exemplo-sefaz.gov.br/consulta" });
    const assinadoNfce = assinarNFe(xml, { chavePrivadaPem: cert.chavePrivadaPem, certificadoBase64: cert.certificadoBase64, infNFeSupl: supl });
    const r = await validarNFeXsd(assinadoNfce);
    expect(r.erros).toEqual([]);
    expect(r.valido).toBe(true);
  });

  it("o documento inteiro continua na forma canônica", async () => {
    expect(await c14n(assinado)).toBe(assinado);
  });

  it("recusa XML sem infNFe ou já assinado", () => {
    expect(() => assinarNFe("<NFe/>", cert)).toThrow(/infNFe/);
    expect(() => assinarNFe(assinado, cert)).toThrow(/assinado/);
  });
});
