import { describe, expect, it } from "vitest";
import { conferirPagamentos, dadosDaEmissao, pagamentoSugerido, pedidosComNota, subtotalDoPedido, taxaSugerida, totaisDaEmissao, vendasSemNota } from "./vendasSemNota.js";

const pedido = (id, extra = {}) => ({ id, lojaId: 9, status: "delivered", paymentStatus: "paid", table: "Mesa 01", command: "C1", createdAtISO: "2026-11-21T01:00:00Z", pagamentoForma: "PIX", items: [{ productId: 1, name: "X-Salada", price: 25.9, quantity: 2 }], ...extra });

describe("vendas pagas sem nota", () => {
  it("lista só o que está pago, da loja, não cancelado e SEM nota", () => {
    const orders = [
      pedido("A"), pedido("B", { paymentStatus: "open" }), pedido("C", { status: "cancelled" }), pedido("D", { lojaId: 10 }), pedido("E"), pedido("F", { items: [] }),
    ];
    const docs = [{ pedidosIds: ["E"], status: "autorizado" }];
    expect(vendasSemNota({ orders, documentos: docs, lojaId: 9 }).map((v) => v.id)).toEqual(["A"]);
  });
  it("pedido que já tem QUALQUER nota (até rejeitada ou descartada) não aparece: a nota dele se resolve em Notas emitidas", () => {
    const orders = [pedido("A"), pedido("B"), pedido("C")];
    const docs = [{ pedidosIds: ["A"], status: "rejeitado" }, { pedidosIds: ["B"], status: "descartado" }];
    expect(vendasSemNota({ orders, documentos: docs, lojaId: 9 }).map((v) => v.id)).toEqual(["C"]);
    expect([...pedidosComNota(docs)].sort()).toEqual(["A", "B"]);
  });
  it("filtra por período e ordena do mais novo para o mais antigo", () => {
    const orders = [pedido("A", { createdAtISO: "2026-11-10T10:00:00Z" }), pedido("B", { createdAtISO: "2026-11-20T10:00:00Z" }), pedido("C", { createdAtISO: "2026-11-21T10:00:00Z" })];
    expect(vendasSemNota({ orders, lojaId: 9 }).map((v) => v.id)).toEqual(["C", "B", "A"]);
    expect(vendasSemNota({ orders, lojaId: 9, desde: "2026-11-15T00:00:00Z" }).map((v) => v.id)).toEqual(["C", "B"]);
  });
  it("traz subtotal, itens e a forma que o caixa gravou", () => {
    const [v] = vendasSemNota({ orders: [pedido("A")], lojaId: 9 });
    expect(v).toMatchObject({ id: "A", subtotal: 51.8, itens: 2, forma: "PIX", mesa: "Mesa 01" });
    expect(subtotalDoPedido(pedido("A"))).toBe(51.8);
  });
});

describe("totais e pagamentos da nota", () => {
  it("total = subtotal + taxa − desconto, em centavos exatos", () => {
    expect(totaisDaEmissao({ subtotal: 52.8, taxa: 5.28 })).toEqual({ subtotal: 52.8, taxa: 5.28, desconto: 0, total: 58.08 });
    expect(totaisDaEmissao({ subtotal: 52.8, taxa: 0, desconto: 2.8 }).total).toBe(50);
    expect(totaisDaEmissao({ subtotal: 10, desconto: 99 }).total).toBe(0);
  });
  it("taxa sugerida pela configuração da loja (e zero quando não cobra)", () => {
    expect(taxaSugerida(52.8, { enabled: true, percent: 10, chargingRule: "sempre" })).toBe(5.28);
    expect(taxaSugerida(52.8, { enabled: false, percent: 10 })).toBe(0);
    expect(taxaSugerida(52.8, { enabled: true, percent: 10, chargingRule: "nao_cobrar" })).toBe(0);
  });
  it("as formas de pagamento têm de somar exatamente o total", () => {
    expect(conferirPagamentos(58.08, [{ forma: "PIX", valor: 58.08 }])).toMatchObject({ ok: true, diferenca: 0 });
    expect(conferirPagamentos(58.08, [{ forma: "PIX", valor: 30 }, { forma: "Dinheiro", valor: 28.08 }]).ok).toBe(true);
    expect(conferirPagamentos(58.08, [{ forma: "PIX", valor: 50 }])).toMatchObject({ ok: false, diferenca: 8.08 });
    expect(conferirPagamentos(58.08, [{ forma: "", valor: 58.08 }])).toMatchObject({ ok: false, semForma: true });
    expect(conferirPagamentos(58.08, []).ok).toBe(false);
  });
  it("sugere a forma só quando todos os pedidos têm a mesma forma conhecida", () => {
    const formas = [{ nome: "PIX" }, { nome: "Dinheiro" }];
    expect(pagamentoSugerido([{ forma: "PIX" }, { forma: "pix" }], formas)).toBe("PIX");
    expect(pagamentoSugerido([{ forma: "PIX" }, { forma: "Dinheiro" }], formas)).toBe("");
    expect(pagamentoSugerido([{ forma: "Dinheiro + Pontos" }], formas)).toBe("");
  });
  it("monta os dados da emissão no mesmo formato do PDV", () => {
    const sel = vendasSemNota({ orders: [pedido("A"), pedido("B")], lojaId: 9 });
    const d = dadosDaEmissao({ selecionadas: sel, taxa: 10.36, desconto: 0, linhas: [{ forma: "PIX", valor: 113.96 }, { forma: "Dinheiro", valor: 0 }] });
    expect(d.pedidos).toHaveLength(2);
    expect(d.composicao).toMatchObject({ subtotal: 103.6, taxaServico: 10.36, total: 113.96 });
    expect(d.pagamento).toEqual({ total: 113.96, troco: 0, detalhes: [{ forma: "PIX", valor: 113.96 }] });
  });
});
