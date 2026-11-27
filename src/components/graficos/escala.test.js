import { describe, expect, it } from "vitest";
import { caminhoSuave, compacto, degrauDeCor, indicesDeRotulo, ticks } from "./escala.js";

describe("escala dos gráficos", () => {
  it("gera marcas redondas que cobrem o máximo", () => {
    expect(ticks(950)).toEqual([0, 250, 500, 750, 1000]);
    expect(ticks(0)).toEqual([0, 1]);
    expect(ticks(7).at(-1)).toBeGreaterThanOrEqual(7);
  });

  it("abrevia valores grandes", () => {
    expect(compacto(950)).toBe("950");
    expect(compacto(12500)).toBe("12,5 mil");
    expect(compacto(2000000)).toBe("2 mi");
  });

  it("pula rótulos quando não há largura", () => {
    expect(indicesDeRotulo(30, 264)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(indicesDeRotulo(3, 600)).toEqual([0, 1, 2]);
    expect(indicesDeRotulo(0, 600)).toEqual([]);
  });

  it("a curva não ultrapassa os valores dos pontos", () => {
    const d = caminhoSuave([[0, 100], [10, 100], [20, 0], [30, 100]]);
    const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("escolhe o degrau de cor proporcional ao máximo", () => {
    expect(degrauDeCor(0, 10)).toBe(-1);
    expect(degrauDeCor(1, 10)).toBe(0);
    expect(degrauDeCor(10, 10)).toBe(4);
  });
});
