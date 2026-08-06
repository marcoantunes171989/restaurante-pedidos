import { describe, expect, it } from "vitest";
import {
  classificarMotivoCupom,
  dentroDoHorarioCupom,
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
    canal: "ambos",
    horaInicio: "",
    horaFim: "",
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

  it("rejeita canal externo em cupom só interno", () => {
    const r = validarCupomLocal({
      cupons: [{ ...base, canal: "interno" }],
      codigo: "PRIME10",
      valorConta: 100,
      canalConta: "externo",
      agora: new Date("2026-08-06T12:00:00"),
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("canal");
    expect(r.motivo).toMatch(/interno/i);
  });

  it("rejeita canal interno em cupom só externo", () => {
    const r = validarCupomLocal({
      cupons: [{ ...base, canal: "externo" }],
      codigo: "PRIME10",
      valorConta: 100,
      canalConta: "interno",
      agora: new Date("2026-08-06T12:00:00"),
    });
    expect(r.status).toBe("canal");
    expect(r.motivo).toMatch(/externo|delivery/i);
  });

  it("rejeita fora do horário permitido", () => {
    const r = validarCupomLocal({
      cupons: [{ ...base, horaInicio: "11:00", horaFim: "14:00" }],
      codigo: "PRIME10",
      valorConta: 100,
      agora: new Date("2026-08-06T16:30:00"),
    });
    expect(r.status).toBe("horario");
    expect(r.motivo).toMatch(/11:00|14:00/);
  });

  it("aceita dentro do horário", () => {
    const r = validarCupomLocal({
      cupons: [{ ...base, horaInicio: "11:00", horaFim: "14:00" }],
      codigo: "PRIME10",
      valorConta: 100,
      agora: new Date("2026-08-06T12:30:00"),
    });
    expect(r.ok).toBe(true);
  });

  it("dentroDoHorarioCupom cobre janela noturna", () => {
    expect(dentroDoHorarioCupom({
      horaInicio: "22:00",
      horaFim: "02:00",
      agora: new Date("2026-08-06T23:15:00"),
    })).toBe(true);
    expect(dentroDoHorarioCupom({
      horaInicio: "22:00",
      horaFim: "02:00",
      agora: new Date("2026-08-06T10:00:00"),
    })).toBe(false);
  });

  it("classifica motivos do banco", () => {
    expect(classificarMotivoCupom("Cupom expirado.")).toBe("expirado");
    expect(classificarMotivoCupom("Cupom esgotado.")).toBe("esgotado");
    expect(classificarMotivoCupom("Cupom não encontrado.")).toBe("nao_encontrado");
    expect(classificarMotivoCupom("Este cupom é válido apenas para consumo interno (mesa).")).toBe("canal");
    expect(classificarMotivoCupom("Cupom fora do horário permitido (11:00 às 14:00).")).toBe("horario");
  });

  it("monta legenda de cupom válido com restantes", () => {
    const l = legendaCupom("valido", { desconto: 13.06, restantes: 2 });
    expect(l.tom).toBe("ok");
    expect(l.texto.replace(/\u00a0/g, " ")).toBe("Cupom válido · −R$ 13,06 · 2 restante(s)");
  });
});
