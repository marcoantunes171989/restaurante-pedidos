// @vitest-environment jsdom
// Cartões, faturamento e resumo do turno do PDV: retirada e entrega externas não somam taxa de serviço (igual ao fechamento).
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = window.matchMedia || ((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
vi.setConfig({ testTimeout: 60000 }); // a 1ª importação do PDV completo é lenta quando a suíte roda em paralelo

let root, el;
afterEach(() => { if (root) act(() => root.unmount()); el?.remove(); root = el = null; });

const AGORA = new Date().toISOString();
const pedido = (id, table, extra = {}) => ({ id, lojaId: 9, table, command: `C-${id}`, status: "delivered", paymentStatus: "open", createdAtISO: AGORA, updatedAtISO: AGORA,
  items: [{ productId: 45, name: "Burger", price: 29.9, quantity: 1 }], ...extra });

async function montar(orders) {
  const { default: CashierPdv } = await import("./CashierPdv.jsx");
  el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<CashierPdv orders={orders} lojaInfo={{ id: 9, nome: "Burger Station" }}
    currentUser={{ id: 1, name: "Admin", role: "admin", accessIds: ["cashier", "admin"] }} caixaAberto={{ id: 1 }} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return () => el.textContent.replace(/\s+/g, " ");
}
const aba = async (texto) => {
  const botao = [...el.querySelectorAll('[role="tab"], button')].find((b) => (b.textContent || "").trim() === texto);
  await act(async () => { botao.click(); await new Promise((r) => setTimeout(r, 30)); });
};

describe("PDV: taxa de serviço só no consumo no local", () => {
  it("cartão de retirada e de entrega mostra o valor sem a taxa; consumo no local mostra com a taxa", async () => {
    const tela = await montar([
      pedido("R1", "Externo · Retirada"),
      pedido("E1", "Externo · Entrega", { items: [{ productId: 45, name: "Batata", price: 26.9, quantity: 1 }] }),
      pedido("L1", "Externo · Consumo no local", { items: [{ productId: 45, name: "Suco", price: 10, quantity: 1 }] }),
    ]);
    await aba("Delivery");
    expect(tela()).toContain("29,90");
    expect(tela()).toContain("26,90");
    expect(tela()).toContain("11,00");
    expect(tela()).not.toContain("32,89");
    expect(tela()).not.toContain("29,59");
  });
  it("faturamento do turno soma o que foi cobrado", async () => {
    const tela = await montar([
      pedido("R1", "Externo · Retirada", { paymentStatus: "paid" }),
      pedido("R2", "Externo · Retirada", { paymentStatus: "paid" }),
    ]);
    expect(tela()).toMatch(/Faturamento\s*R\$\s*59,80/);
    expect(tela()).not.toContain("65,78");
  });
  it("nenhum total do PDV multiplica a taxa sem olhar o tipo do pedido", () => {
    for (const arquivo of ["src/pages/pdv/CashierPdv.jsx", "src/pages/pdv/PdvStatsBar.jsx"]) {
      expect(readFileSync(arquivo, "utf8")).not.toMatch(/\*\s*\(1 \+ \(?(Number\()?taxaPct|\*\s*fator\b/);
    }
  });
});
