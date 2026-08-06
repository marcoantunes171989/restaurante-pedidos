import { describe, expect, it } from "vitest";
import {
  classificarMotivoCupom,
  legendaCupom,
  validarCupomLocal,
} from "./pdvCupomValidacao";

describe("pdvCupomValidacao", () => {
  const base = {
    id: 1,
    codigo: "PRIME10",
    ativo: true,
    tipo: "percentual",
    valor: 10,
    minimoCompra: 50,
    quantidadeTotal: 3,
    quantidadeUsada: 1,
    inicioEm: "2026-01-01T00:00:00",
    fimEm: "2026-12-31T23:59:59",
  };

  it("aceita cupom válido dentro do prazo e com saldo", () => {
    const r = validarCupomLocal({
      cupons: [base],
      codigo: "prime10",
      valorConta: 100,
      agora: new Date("2026-08-06T12:00:00"),
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("valido");
    expect(r.desconto).toBe(10);
    expect(r.restantes).toBe(2);
  });

  it("rejeita código inexistente", () => {
    const r = validarCupomLocal({ cupons: [base], codigo: "XYZ", valorConta: 100 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("nao_encontrado");
  });

  it("rejeita fora do prazo (expirado)", () => {
    const r = validarCupomLocal({
      cupons: [base],
      codigo: "PRIME10",
      valorConta: 100,
      agora: new Date("2027-01-02T00:00:00"),
    });
    expect(r.status).toBe("expirado");
  });

  it("rejeita quando quantidade esgotada", () => {
    const r = validarCupomLocal({
      cupons: [{ ...base, quantidadeUsada: 3 }],
      codigo: "PRIME10",
      valorConta: 100,
      agora: new Date("2026-08-06T12:00:00"),
    });
    expect(r.status).toBe("esgotado");
  });

  it("rejeita consumo mínimo", () => {
    const r = validarCupomLocal({
      cupons: [base],
      codigo: "PRIME10",
      valorConta: 20,
      agora: new Date("2026-08-06T12:00:00"),
    });
    expect(r.status).toBe("minimo");
  });

  it("classifica motivos do banco", () => {
    expect(classificarMotivoCupom("Cupom expirado.")).toBe("expirado");
    expect(classificarMotivoCupom("Cupom esgotado.")).toBe("esgotado");
    expect(classificarMotivoCupom("Cupom não encontrado.")).toBe("nao_encontrado");
  });

  it("monta legenda de cupom válido", () => {
    const l = legendaCupom("valido", { desconto: 11.99, restantes: 2 });
    expect(l.tom).toBe("ok");
    expect(l.texto).toMatch(/Cupom válido/);
  });
});
