// Pontos de fidelidade sobre o TOTAL PAGO: o aviso do caixa e o crédito usam a mesma conta.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pontosDaVenda, pontosDoCliente, pontosPor } from "./fidelidade";

const pedido = (id, preco, telefone = "11900000000") => ({ id, clienteTelefone: telefone, valor: preco });
const venda = (pedidos, total, mais = {}) => pontosDaVenda({ pedidos, total, valorPorPonto: 1, valorDoPedido: (o) => o.valor, ...mais });

describe("pontos sobre o total pago", () => {
  it("conta em centavos, sem erro de ponto flutuante", () => {
    expect(pontosPor(34.89, 1)).toBe(34);
    expect(pontosPor(0.3, 0.1)).toBe(3);
    expect(pontosPor(29.9, 2)).toBe(14);
    expect(pontosPor(10, 0)).toBe(0);
    expect(pontosPor(-5, 1)).toBe(0);
  });
  it("taxa e acréscimo contam; desconto reduz", () => {
    expect(venda([pedido("A", 32.89)], 34.89)["11900000000"]).toEqual({ valor: 34.89, pontos: 34 });
    expect(venda([pedido("A", 32.89)], 29.9)["11900000000"].pontos).toBe(29);
  });
  it("a parte paga com pontos não gera pontos", () => {
    expect(venda([pedido("A", 50)], 50, { pagoComPontos: 20 })["11900000000"].pontos).toBe(30);
    expect(venda([pedido("A", 50)], 50, { pagoComPontos: 80 })["11900000000"].pontos).toBe(0);
  });
  it("vários pedidos do mesmo cliente somam o total exato; clientes diferentes repartem pelo valor", () => {
    const mesmo = venda([pedido("A", 10), pedido("B", 10), pedido("C", 10)], 100);
    expect(mesmo["11900000000"].valor).toBe(100);
    const dois = venda([pedido("A", 30, "1"), pedido("B", 70, "2")], 110);
    expect([dois["1"].pontos, dois["2"].pontos]).toEqual([33, 77]);
  });
  it("pedido sem cliente não gera crédito, mas ocupa a sua parte", () => {
    const m = venda([pedido("A", 50, null), pedido("B", 50, "2")], 100);
    expect(Object.keys(m)).toEqual(["2"]);
    expect(m["2"].pontos).toBe(50);
    expect(pontosDoCliente(m, "(2)")).toBe(50);
    expect(pontosDoCliente(m, "9")).toBe(0);
  });
});

describe("todas as telas usam a mesma regra", () => {
  const ler = (f) => readFileSync(f, "utf8");
  it("crédito e aviso do caixa partem de pontosDaVenda", () => {
    expect(ler("src/App.jsx")).toContain("total: totalDoServidor ?? info?.total");
    expect(ler("src/pages/pdv/CashierPdv.jsx")).toContain("pontosDoCliente(pontosDaVenda(");
  });
  it.each(["src/App.jsx", "src/CardapioPublico.jsx", "src/components/orders/AccountCard.jsx", "src/components/orders/checkout/CashierCheckout.jsx", "src/pages/pdv/CashierPdv.jsx"])(
    "%s não calcula pontos sobre o subtotal", (arquivo) => {
      expect(ler(arquivo)).not.toMatch(/Math\.floor\([^)]*(subtotal|1 \+ pctTaxa)[^;]*[vV]alorPorPonto/);
    });
});
