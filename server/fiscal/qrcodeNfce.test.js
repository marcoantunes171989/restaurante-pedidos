// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { urlQrCodeV3, urlQrCodeV2, grupoInfNFeSupl } from "./qrcodeNfce.js";

// Padrões copiados do XSD oficial (leiauteNFe_v4.00.xsd, infNFeSupl/qrCode, PL 010h v1.03).
const XSD_V3_NORMAL = /^((HTTPS?|https?):\/\/.*\?p=([0-9]{6}[0-9A-Z]{12}[0-9]{16}(1|3|4)[0-9]{9})\|[3]\|[1-2])$/;
const XSD_V2_NORMAL = /^((HTTPS?|https?):\/\/.*\?p=([0-9]{6}[0-9A-Z]{12}[0-9]{16}(1|3|4)[0-9]{9})\|[2]\|[1-2]\|(0|[1-9]{1}([0-9]{1,5})?)\|[A-Fa-f0-9]{40})$/;

const CHAVE = "35261112345678000195650010000000011234567890";
const URL = "https://www.exemplo-sefaz.gov.br/qrcode"; // URL de TESTE; a real vem da tabela oficial por UF

describe("QR Code NFC-e", () => {
  it("v3 (emissão normal): só chave, versão e ambiente — sem CSC (padrão do XSD)", () => {
    const u = urlQrCodeV3({ urlBase: URL, chave: CHAVE, tpAmb: 2 });
    expect(u).toBe(`${URL}?p=${CHAVE}|3|2`);
    expect(XSD_V3_NORMAL.test(u)).toBe(true);
  });
  it("v2: id do CSC sem zeros à esquerda e hash SHA-1 de 40 hex", () => {
    const u = urlQrCodeV2({ urlBase: URL, chave: CHAVE, tpAmb: 2, idCsc: "000001", csc: "CSC-DE-TESTE-123" });
    expect(XSD_V2_NORMAL.test(u)).toBe(true);
    const esperado = createHash("sha1").update(`${CHAVE}|2|2|1` + "CSC-DE-TESTE-123").digest("hex").toUpperCase();
    expect(u).toBe(`${URL}?p=${CHAVE}|2|2|1|${esperado}`);
  });
  it("recusa chave de contingência (tpEmis 9) no QR normal e chave inválida", () => {
    const contingencia = CHAVE.slice(0, 34) + "9" + CHAVE.slice(35);
    expect(() => urlQrCodeV3({ urlBase: URL, chave: contingencia, tpAmb: 2 })).toThrow(/off-line/i);
    expect(() => urlQrCodeV3({ urlBase: URL, chave: "123", tpAmb: 2 })).toThrow(/chave/i);
    expect(() => urlQrCodeV2({ urlBase: URL, chave: CHAVE, tpAmb: 2, idCsc: "1", csc: "" })).toThrow(/CSC/);
  });
  it("URL base precisa ser http(s) e sem parâmetros", () => {
    expect(() => urlQrCodeV3({ urlBase: "ftp://x", chave: CHAVE, tpAmb: 2 })).toThrow(/URL/);
    expect(() => urlQrCodeV3({ urlBase: "https://x/?a=1", chave: CHAVE, tpAmb: 2 })).toThrow(/URL/);
  });
  it("grupo infNFeSupl (fica fora do trecho assinado)", () => {
    const g = grupoInfNFeSupl({ qrCode: `${URL}?p=${CHAVE}|3|2`, urlChave: "https://www.exemplo-sefaz.gov.br/consulta" });
    expect(g).toBe(`<infNFeSupl><qrCode>${URL}?p=${CHAVE}|3|2</qrCode><urlChave>https://www.exemplo-sefaz.gov.br/consulta</urlChave></infNFeSupl>`);
  });
});
