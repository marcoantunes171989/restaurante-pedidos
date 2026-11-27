import { describe, expect, it } from "vitest";
import { clientesNoPeriodo, mesasAbertasAgora, prioridades } from "./analiseDashboard.js";
import { resumoVendas } from "../relatorios/analiseVendas.js";

const pedido = (extra) => ({
  status: "delivered",
  paymentStatus: "paid",
  table: "Mesa 01",
  command: "C1",
  items: [{ name: "Burger", price: 30, quantity: 1 }],
  ...extra,
});

describe("analiseDashboard", () => {
  it("conta só mesas de salão com conta aberta", () => {
    expect(mesasAbertasAgora([
      pedido({ paymentStatus: "open" }),
      pedido({ paymentStatus: "requested" }),
      pedido({ table: "Mesa 02" }),
      pedido({ table: "Externo · Entrega", command: "EXT-1", paymentStatus: "open" }),
      pedido({ table: "Balcão", command: "", paymentStatus: "open" }),
      pedido({ table: "Mesa 03", paymentStatus: "open", status: "cancelled" }),
    ])).toBe(1);
  });

  it("conta clientes distintos por telefone ou nome, sem cancelados", () => {
    expect(clientesNoPeriodo([
      pedido({ clienteTelefone: "11900000001" }),
      pedido({ clienteTelefone: "11900000001" }),
      pedido({ customer: "Ana" }),
      pedido({ customer: "Bia", status: "cancelled" }),
      pedido({}),
    ])).toBe(2);
  });

  it("sem pendências não inventa ação", () => {
    expect(prioridades({ atual: resumoVendas([pedido({})]) })).toEqual([]);
  });

  it("ordena as ações por urgência a partir dos dados", () => {
    const atual = resumoVendas([
      pedido({ paymentStatus: "open" }),
      pedido({ paymentStatus: "requested" }),
      pedido({ status: "cancelled" }),
      pedido({}),
    ]);
    const anterior = resumoVendas([pedido({}), pedido({ items: [{ name: "Burger", price: 90, quantity: 1 }] })]);
    const lista = prioridades({ atual, anterior, semEstoque: 2 });
    expect(lista.map((p) => p.id)).toEqual(["conta", "estoque", "abertos", "cancelados", "faturamento", "ticket"]);
  });
});
