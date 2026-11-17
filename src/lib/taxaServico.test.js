import { describe, it, expect } from "vitest";
import { cobraTaxaServico } from "./taxaServico";

describe("taxa de serviço só no consumo no local", () => {
  it("retirada e entrega externas não pagam taxa", () => {
    expect(cobraTaxaServico("Externo · Retirada")).toBe(false);
    expect(cobraTaxaServico("Externo · Entrega")).toBe(false);
    expect(cobraTaxaServico("  externo · retirada ")).toBe(false);
  });
  it("mesa, consumo no local externo e rótulo vazio pagam", () => {
    expect(cobraTaxaServico("Mesa 01")).toBe(true);
    expect(cobraTaxaServico("Externo · Consumo no local")).toBe(true);
    expect(cobraTaxaServico("")).toBe(true);
    expect(cobraTaxaServico(null)).toBe(true);
  });
});
