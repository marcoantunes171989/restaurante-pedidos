import { describe, expect, it } from "vitest";
import { parcelasNoCaixa, resumoDoCaixa } from "./caixaResumo.js";

const formas = [{ nome: "PIX", permiteTroco: false }, { nome: "Vale", permiteTroco: true }];
const d = (forma, valor) => ({ forma, valor });

describe("parcelas no caixa, sem o troco", () => {
  it("desconta o troco do dinheiro", () => {
    expect(parcelasNoCaixa([d("Dinheiro", 100)], 60, formas)).toEqual([d("Dinheiro", 60)]);
  });

  it("com várias formas, o troco sai do dinheiro em qualquer ordem", () => {
    expect(parcelasNoCaixa([d("PIX", 10), d("Dinheiro", 50)], 30, formas)).toEqual([d("PIX", 10), d("Dinheiro", 20)]);
  });

  it("parcela toda devolvida em troco não é lançada", () => {
    expect(parcelasNoCaixa([d("Dinheiro", 20), d("Dinheiro", 50), d("PIX", 10)], 30, formas)).toEqual([d("Dinheiro", 20), d("PIX", 10)]);
  });

  it("o que passa do dinheiro sai da forma que permite troco", () => {
    expect(parcelasNoCaixa([d("Dinheiro", 10), d("Vale", 100)], 60, formas)).toEqual([d("Vale", 60)]);
  });

  it("pontos não dão troco", () => {
    expect(parcelasNoCaixa([d("Pontos", 5), d("Dinheiro", 100)], 60, formas)).toEqual([d("Pontos", 5), d("Dinheiro", 55)]);
  });

  it("sem troco não muda nada e não erra centavos", () => {
    expect(parcelasNoCaixa([d("Dinheiro", 0.1), d("PIX", 0.2)], 0.3, formas)).toEqual([d("Dinheiro", 0.1), d("PIX", 0.2)]);
    expect(parcelasNoCaixa([d("Dinheiro", 50)], 33.33, formas)).toEqual([d("Dinheiro", 33.33)]);
  });

  it("o esperado em dinheiro fica com o que está na gaveta", () => {
    const movimentos = parcelasNoCaixa([d("Dinheiro", 50), d("PIX", 10)], 30, formas)
      .map((p) => ({ tipo: "venda", valor: p.valor, descricao: `Venda ${p.forma} · Mesa 1` }));
    expect(resumoDoCaixa(movimentos, 100)).toMatchObject({ esperadoEmDinheiro: 120, totalVendido: 30 });
  });
});
