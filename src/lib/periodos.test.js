import { describe, expect, it } from "vitest";
import { PERIODOS, hojeISO, rotuloPeriodoSelecionado } from "./periodos.js";
import { intervaloPeriodo } from "./relatorios/analiseVendas.js";

describe("períodos", () => {
  it("oferece sempre os mesmos campos", () => {
    expect(PERIODOS.map((p) => p.id)).toEqual(["hoje", "ontem", "7", "15", "30", "mes", "tudo", "periodo"]);
  });

  it("descreve o período escolhido", () => {
    expect(rotuloPeriodoSelecionado("7")).toBe("7 dias");
    expect(rotuloPeriodoSelecionado("periodo", "2026-11-01", "2026-11-05")).toBe("01/11/2026 a 05/11/2026");
    expect(rotuloPeriodoSelecionado("periodo")).toBe("Datas");
  });

  it("o mês atual vai do dia 1 até hoje", () => {
    const [a, b] = intervaloPeriodo("mes", "", "", new Date(2026, 10, 26, 15));
    expect([a.getDate(), a.getMonth(), b.getDate()]).toEqual([1, 10, 26]);
    expect(hojeISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
