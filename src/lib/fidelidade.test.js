import { describe, expect, it } from "vitest";
import { fidelidadeHabilitada, numeroFidelidade } from "./fidelidade";

describe("regra de fidelidade", () => {
  it("preserva zero como valor válido", () => {
    expect(numeroFidelidade(0, 1)).toBe(0);
    expect(numeroFidelidade("0", 100)).toBe(0);
  });

  it("fica desabilitada quando ganho e resgate estão zerados", () => {
    expect(fidelidadeHabilitada({ ativo: true, valorPorPonto: 0, pontosPorReal: 0 })).toBe(false);
  });

  it("só fica habilitada com ganho e resgate positivos", () => {
    expect(fidelidadeHabilitada({ ativo: true, valorPorPonto: 1, pontosPorReal: 100 })).toBe(true);
    expect(fidelidadeHabilitada({ ativo: true, valorPorPonto: 1, pontosPorReal: 0 })).toBe(false);
    expect(fidelidadeHabilitada({ ativo: true, valorPorPonto: 0, pontosPorReal: 100 })).toBe(false);
  });
});
