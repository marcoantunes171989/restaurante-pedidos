import { describe, expect, it } from "vitest";
import {
  analisarVendas,
  filtrarPedidosPorPeriodo,
  faturamentoPorCanal,
  statusPedidos,
  vendasPorHora,
  metricasFila,
  melhorMesVendas,
} from "./analiseDashboard.js";

const base = [
  {
    id: 1,
    status: "delivered",
    paymentStatus: "paid",
    command: "C1",
    table: "Mesa 07",
    createdAtISO: "2026-08-10T13:00:00.000Z",
    items: [{ name: "Burger", price: 30, quantity: 2 }],
  },
  {
    id: 2,
    status: "received",
    paymentStatus: "open",
    createdAtISO: "2026-08-10T14:00:00.000Z",
    items: [{ name: "Suco", price: 10, quantity: 1 }],
  },
  {
    id: 3,
    status: "cancelled",
    paymentStatus: "open",
    createdAtISO: "2026-08-10T15:00:00.000Z",
    items: [{ name: "Burger", price: 30, quantity: 1 }],
  },
  {
    id: 4,
    status: "ready",
    paymentStatus: "requested",
    table: "Mesa 03",
    command: "C3",
    createdAtISO: "2026-08-10T16:00:00.000Z",
    items: [{ name: "Burger", price: 30, quantity: 1 }],
  },
  {
    id: 5,
    status: "delivered",
    paymentStatus: "paid",
    table: "Externo · Entrega",
    command: "EXT-123456",
    createdAtISO: "2026-07-15T19:00:00.000Z",
    items: [{ name: "Burger", price: 40, quantity: 1 }],
  },
];

describe("analiseDashboard", () => {
  it("calcula faturamento só com pagos e taxa 10%", () => {
    const a = analisarVendas(base, [{ name: "Burger", category: "Lanches" }, { name: "Suco", category: "Bebidas" }]);
    expect(a.pagos).toHaveLength(2);
    expect(a.faturamento).toBeCloseTo((60 + 40) * 1.1, 2);
    expect(a.topProdutos[0].nome).toBe("Burger");
    expect(a.categorias[0].categoria).toBe("Lanches");
  });

  it("separa canal mesa, externo e balcão", () => {
    const pagos = base.filter((o) => o.paymentStatus === "paid");
    const canais = faturamentoPorCanal(pagos);
    expect(canais.some((c) => c.label.includes("Mesa"))).toBe(true);
    expect(canais.some((c) => c.label.includes("Externo"))).toBe(true);
  });

  it("agrega status incluindo aguardando pagamento", () => {
    const st = statusPedidos(base);
    expect(st.find((s) => s.label === "Pago")?.valor).toBe(2);
    expect(st.find((s) => s.label === "Cancelado")?.valor).toBe(1);
    expect(st.find((s) => s.label === "Aguardando pag.")?.valor).toBe(1);
    expect(st.find((s) => s.label === "Em aberto")?.valor).toBe(1);
  });

  it("metricasFila conta externos, abertos e aguardando", () => {
    const m = metricasFila(base);
    expect(m.externos).toBe(1);
    expect(m.externosPagos).toBe(1);
    expect(m.emAberto).toBe(1);
    expect(m.aguardandoPagamento).toBe(1);
    expect(m.cancelados).toBe(1);
  });

  it("melhorMesVendas escolhe o mês com maior faturamento", () => {
    const pagos = base.filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled");
    const mes = melhorMesVendas(pagos);
    expect(mes.qtd).toBeGreaterThan(0);
    expect(mes.valor).toBeGreaterThan(0);
    expect(mes.label).not.toBe("—");
  });

  it("filtra por período tudo", () => {
    expect(filtrarPedidosPorPeriodo(base, "tudo")).toHaveLength(5);
  });

  it("monta série por hora", () => {
    const { sequencia, melhor } = vendasPorHora(base.filter((o) => o.paymentStatus === "paid"));
    expect(sequencia.length).toBeGreaterThan(0);
    expect(melhor.valor).toBeGreaterThan(0);
  });
});
