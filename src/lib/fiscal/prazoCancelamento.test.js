import { describe, it, expect } from "vitest";
import { prazoCancelamentoNfceMin, janelaCancelamentoNfce, podeCancelarNfce, textoContagem, nfceForaDoPrazo } from "./prazoCancelamento";

const AUT = "2026-11-20T15:00:00Z";
const NOTA = { modelo: 65, status: "autorizado", protocolo: "135", chave: "3".repeat(44), tpEmis: 1, contingenciaNumero: null, dhAutorizacao: AUT };
const em = (min) => new Date(new Date(AUT).getTime() + min * 60000);

describe("prazo por UF", () => {
  it("30 minutos é o teto: SP, MG e as demais UFs", () => {
    for (const uf of ["SP", "MG", "RJ", "BA", "", undefined]) expect(prazoCancelamentoNfceMin(uf)).toBe(30);
  });
});
describe("janela de cancelamento", () => {
  it("conta 30 minutos da autorização: dentro até 29:59, fora a partir de 30:00", () => {
    expect(janelaCancelamentoNfce({ dhAutorizacao: AUT, uf: "SP", agora: em(0) })).toMatchObject({ aplicavel: true, dentro: true, prazoMin: 30, restanteMs: 30 * 60000 });
    expect(janelaCancelamentoNfce({ dhAutorizacao: AUT, uf: "SP", agora: new Date(em(30).getTime() - 1000) }).dentro).toBe(true);
    expect(janelaCancelamentoNfce({ dhAutorizacao: AUT, uf: "SP", agora: em(30) }).dentro).toBe(false);
  });
  it("sem data de autorização: não aplicável", () => {
    expect(janelaCancelamentoNfce({ dhAutorizacao: null }).aplicavel).toBe(false);
  });
  it("textoContagem", () => {
    expect(textoContagem(754000)).toBe("12:34");
    expect(textoContagem(-5)).toBe("00:00");
  });
});
describe("quem aparece para cancelar", () => {
  const ctx = (m) => ({ uf: "SP", agora: em(m) });
  it("NFC-e autorizada, normal e dentro do prazo", () => expect(podeCancelarNfce(NOTA, ctx(10))).toBe(true));
  it("fora do prazo, não autorizada, NF-e, sem protocolo, contingência ou coberta por contingência: não", () => {
    expect(podeCancelarNfce(NOTA, ctx(31))).toBe(false);
    for (const status of ["rejeitado", "enviado", "erro", "cancelado", "reservado", "contingencia"]) expect(podeCancelarNfce({ ...NOTA, status }, ctx(5)), status).toBe(false);
    expect(podeCancelarNfce({ ...NOTA, modelo: 55 }, ctx(5))).toBe(false);
    expect(podeCancelarNfce({ ...NOTA, protocolo: null }, ctx(5))).toBe(false);
    expect(podeCancelarNfce({ ...NOTA, tpEmis: 9 }, ctx(5))).toBe(false);
    expect(podeCancelarNfce({ ...NOTA, contingenciaNumero: 4 }, ctx(5))).toBe(false);
    expect(podeCancelarNfce({ ...NOTA, dhAutorizacao: null }, ctx(5))).toBe(false);
  });
  it("nfceForaDoPrazo conta só NFC-e autorizada que passou do prazo", () => {
    expect(nfceForaDoPrazo(NOTA, ctx(45))).toBe(true);
    expect(nfceForaDoPrazo(NOTA, ctx(10))).toBe(false);
    expect(nfceForaDoPrazo({ ...NOTA, status: "cancelado" }, ctx(45))).toBe(false);
  });
});
