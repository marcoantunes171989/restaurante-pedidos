import { describe, it, expect } from "vitest";
import { parseCsvIbpt, tributosAproximados } from "./ibpt.js";

// ATENÇÃO: alíquotas FICTÍCIAS, só para testar o cálculo (não são a tabela do IBPT).
const CSV = `codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte
21069090;;0;Preparacoes alimenticias (teste);10,00;15,00;18,00;0,00;01/07/2026;31/12/2026;ABC123;26.2.A;IBPT/empresometro.com.br
22021000;;0;Bebida (teste);12,50;20,00;25,00;0,00;01/07/2026;31/12/2026;ABC123;26.2.A;IBPT/empresometro.com.br
21069090;1;0;Excecao (teste);99,00;99,00;99,00;0,00;01/07/2026;31/12/2026;ABC123;26.2.A;IBPT/empresometro.com.br
0101;;1;Servico NBS (teste);5,00;5,00;5,00;5,00;01/07/2026;31/12/2026;ABC123;26.2.A;IBPT/empresometro.com.br`;

describe("parseCsvIbpt", () => {
  it("lê só mercadorias (tipo 0, sem exceção), com vírgula decimal e metadados", () => {
    const t = parseCsvIbpt(CSV, "sp");
    expect(Object.keys(t.ncm)).toEqual(["21069090", "22021000"]);
    expect(t.ncm["21069090"]).toEqual({ nf: 10, imp: 15, est: 18, mun: 0 });
    expect(t.meta).toMatchObject({ uf: "SP", versao: "26.2.A", chave: "ABC123", fonte: "IBPT/empresometro.com.br", vigenciaFim: "31/12/2026" });
  });
  it("CSV sem as colunas esperadas → erro claro", () => {
    expect(() => parseCsvIbpt("a;b\n1;2")).toThrow(/fora do formato/);
  });
});

describe("tributosAproximados", () => {
  const tabela = parseCsvIbpt(CSV, "SP");
  it("calcula por item (base com desconto) e no total, com texto no padrão do IBPT", () => {
    const r = tributosAproximados([{ NCM: "21069090", base: 100 }, { NCM: "22021000", base: 40 }], tabela);
    expect(r.aplicavel).toBe(true);
    expect(r.itens).toEqual([28, 15]); // 100×(10+18)% e 40×(12,5+25)%
    expect(r.federal).toBe(15); expect(r.estadual).toBe(28); expect(r.municipal).toBe(0);
    expect(r.total).toBe(43);
    expect(r.itens.reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(r.texto).toBe("Trib aprox R$: 15,00 Federal, 28,00 Estadual e 0,00 Municipal. Fonte: IBPT/empresometro.com.br 26.2.A ABC123");
  });
  it("origem importada usa a alíquota de importados", () => {
    const r = tributosAproximados([{ NCM: "21069090", base: 100, orig: "1" }], tabela);
    expect(r.federal).toBe(15);
  });
  it("NCM fora da tabela → não informa nada (valor parcial seria enganoso)", () => {
    const r = tributosAproximados([{ NCM: "21069090", base: 100 }, { NCM: "99999999", base: 10 }], tabela);
    expect(r.aplicavel).toBe(false);
    expect(r.semNcm).toEqual(["99999999"]);
  });
  it("sem tabela → não aplicável", () => {
    expect(tributosAproximados([{ NCM: "21069090", base: 100 }], null).aplicavel).toBe(false);
  });
});
