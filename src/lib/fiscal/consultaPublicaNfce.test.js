import { describe, expect, it } from "vitest";
import { chaveFormatada, chaveValida, linksConsultaNfce } from "./consultaPublicaNfce.js";

const CHAVE = "35261144422195000133650010000000021482135790";

describe("consulta pública da NFC-e na SEFAZ", () => {
  it("chave em blocos de 4", () => {
    expect(chaveFormatada(CHAVE)).toBe("3526 1144 4221 9500 0133 6500 1000 0000 0214 8213 5790");
    expect(chaveFormatada(" 3526-1144 ")).toBe("3526 1144");
  });
  it("só chave de 44 dígitos vale", () => {
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida("123")).toBe(false);
    expect(linksConsultaNfce({ chave: "123", ambiente: "producao" })).toBeNull();
  });
  it("SP produção: link direto igual ao do QR Code (tpAmb 1) e portal de consulta", () => {
    expect(linksConsultaNfce({ chave: CHAVE, ambiente: "producao" })).toEqual({
      uf: "SP", ambiente: "producao", direta: `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|3|1`, portal: "https://www.nfce.fazenda.sp.gov.br/consulta",
    });
  });
  it("SP homologação usa o host de homologação (tpAmb 2); ambiente desconhecido vira homologação", () => {
    const l = linksConsultaNfce({ chave: CHAVE, ambiente: "homologacao" });
    expect(l.direta).toBe(`https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|3|2`);
    expect(linksConsultaNfce({ chave: CHAVE, ambiente: "simulacao" }).ambiente).toBe("homologacao");
  });
  it("NF-e (modelo 55): portal nacional com a chave já preenchida, no ambiente da nota", () => {
    const p = linksConsultaNfce({ chave: CHAVE, ambiente: "producao", modelo: 55 });
    expect(p.direta).toBe(`https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=&nfe=${CHAVE}`);
    expect(p.confirmarHumano).toBe(true);
    const h = linksConsultaNfce({ chave: CHAVE, ambiente: "homologacao", modelo: 55 });
    expect(h.direta.startsWith("https://hom.nfe.fazenda.gov.br/portal/")).toBe(true);
    expect(h.portal).not.toContain("nfe=");
  });
  it("outra UF: sem link direto, só o portal nacional", () => {
    const l = linksConsultaNfce({ chave: `41${CHAVE.slice(2)}`, ambiente: "producao" });
    expect(l.direta).toBeNull();
    expect(l.portal).toMatch(/nfe\.fazenda\.gov\.br/);
  });
});
