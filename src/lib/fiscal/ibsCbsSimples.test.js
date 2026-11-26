import { describe, it, expect } from "vitest";
import { aplicaIbsCbsSn, pendenciasIbsCbsSn, normalizarIbsCbsSn, itemComIbsCbsSn, aliquota, INICIO_PADRAO } from "./ibsCbsSimples.js";
import { validarAntesDeEmitir } from "./validacaoPreEmissao.js";

// Códigos e alíquotas abaixo são valores de TESTE (formato), não regra fiscal.
const CFG = { ativo: true, inicio: "2027-03-01", cst: "000", cClassTrib: "000001", cAtivSN: "01", pIBSSN: "0,1000", pCBSSN: "0.9" };

describe("parâmetros do IBS/CBS do Simples", () => {
  it("padrão: desligado, início previsto e nada preenchido", () => {
    expect(normalizarIbsCbsSn(null)).toEqual({ ativo: false, inicio: INICIO_PADRAO, cst: "", cClassTrib: "", cAtivSN: "", pIBSSN: "", pCBSSN: "" });
  });
  it("alíquota aceita vírgula e até 4 casas; recusa texto, negativo e acima de 100", () => {
    expect(aliquota("0,1234")).toBe(0.1234);
    expect(aliquota("0")).toBe(0);
    for (const v of ["", "abc", "-1", "101", "1.23456"]) expect(aliquota(v), v).toBeNull();
  });
  it("lista o que falta", () => {
    expect(pendenciasIbsCbsSn(CFG)).toEqual([]);
    expect(pendenciasIbsCbsSn({ ...CFG, cst: "1", cAtivSN: "07", pCBSSN: "" })).toHaveLength(3);
  });
  it("só CRT 1 ligado; homologação já envia; produção a partir da data (Brasília)", () => {
    const em = (extra) => aplicaIbsCbsSn({ config: CFG, crt: "1", ambiente: "producao", data: "2027-03-01T03:00:00Z", ...extra });
    expect(em({})).toBe(true);
    expect(em({ data: "2027-03-01T02:59:59Z" })).toBe(false);
    expect(em({ ambiente: "homologacao", data: "2026-12-01T12:00:00Z" })).toBe(true);
    for (const crt of ["2", "3", "4"]) expect(em({ crt }), crt).toBe(false);
    expect(em({ config: { ...CFG, ativo: false } })).toBe(false);
  });
  it("item: base = produto − desconto + outras; CST e cClassTrib do produto valem sobre os da loja", () => {
    const i = itemComIbsCbsSn({ vProd: 100, vDesc: 10, vOutro: 10 }, CFG, { cstIbsCbs: "200", cClassTrib: "x" });
    expect(i.cAtivSN).toBe("01");
    expect(i.ibscbs).toEqual({ CST: "200", cClassTrib: "000001", sn: { pIBSSN: 0.1, vIBSSN: 0.1, pCBSSN: 0.9, vCBSSN: 0.9 } });
  });
  it("ligado e incompleto: barra antes de reservar número; MEI não é afetado", () => {
    const base = { emitente: { crt: "1" }, venda: { itens: [] }, ibsCbsSn: { ...CFG, pCBSSN: "" }, ambiente: "homologacao" };
    expect(validarAntesDeEmitir(base).problemas.map((p) => p.codigo)).toContain("IBSCBS_SN");
    expect(validarAntesDeEmitir({ ...base, emitente: { crt: "4" } }).problemas.map((p) => p.codigo)).not.toContain("IBSCBS_SN");
  });
});
