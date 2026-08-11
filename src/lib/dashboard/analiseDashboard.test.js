import { describe, expect, it } from "vitest";
import {
  analisarVendas,
  filtrarPedidosPorPeriodo,
  faturamentoPorCanal,
  statusPedidos,
  vendasPorHora,
} from "./analiseDashboard.js";

const base = [
  {
    id: 1,
    status: "delivered",
    paymentStatus: "paid",
    command: "C1",
    createdAtISO: "2026-08-10T13:00:00.000Z",
    items: [{ name: "Burger", price: 30, quantity: 2 }],
  },
  {
    id: 2,
    status: "received",
    paymentStatus: "unpaid",
    createdAtISO: "2026-08-10T14:00:00.000Z",
    items: [{ name: "Suco", price: 10, quantity: 1 }],
  },
  {
    id: 3,
    status: "cancelled",
    paymentStatus: "unpaid",
    createdAtISO: "2026-08-10T15:00:00.000Z",
    items: [{ name: "Burger", price: 30, quantity: 1 }],
  },
];

describe("analiseDashboard", () => {
  it("calcula faturamento só com pagos e taxa 10%", () => {
    const a = analisarVendas(base, [{ name: "Burger", category: "Lanches" }, { name: "Suco", category: "Bebidas" }]);
    expect(a.pagos).toHaveLength(1);
    expect(a.faturamento).toBeCloseTo(60 * 1.1, 2);
    expect(a.topProdutos[0].nome).toBe("Burger");
    expect(a.categorias[0].categoria).toBe("Lanches");
  });

  it("separa canal mesa vs balcão", () => {
    const pagos = base.filter((o) => o.paymentStatus === "paid");
    const canais = faturamentoPorCanal(pagos);
    expect(canais.some((c) => c.label.includes("Mesa"))).toBe(true);
  });

  it("agrega status", () => {
    const st = statusPedidos(base);
    expect(st.find((s) => s.label === "Pago")?.valor).toBe(1);
    expect(st.find((s) => s.label === "Cancelado")?.valor).toBe(1);
  });

  it("filtra por período tudo", () => {
    expect(filtrarPedidosPorPeriodo(base, "tudo")).toHaveLength(3);
  });

  it("monta série por hora", () => {
    const { sequencia, melhor } = vendasPorHora(base.filter((o) => o.paymentStatus === "paid"));
    expect(sequencia.length).toBeGreaterThan(0);
    expect(melhor.valor).toBeGreaterThan(0);
  });
});
