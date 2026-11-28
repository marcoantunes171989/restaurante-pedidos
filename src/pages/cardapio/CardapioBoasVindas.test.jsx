// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardapioBoasVindas from "./CardapioBoasVindas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").includes(txt));

const PRODUTOS = [
  { id: "p1", name: "X-Bacon", description: "Hambúrguer com bacon", price: 28.9, imageUrl: "", disponivel: true, isFeatured: true, featuredOrder: 1, time: "12-18 min" },
  { id: "p2", name: "Batata Frita", description: "Porção crocante", price: 18.9, imageUrl: "", disponivel: true, isFeatured: true, featuredOrder: 2, time: "8-14 min" },
];

function montar(props = {}) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const base = {
    loja: { nome: "Burger Station", logoUrl: "", prefixo: "BS" },
    modoExterno: true, currentTable: null, lojaStatus: "aberto", fechaHoje: "22:00",
    produtos: PRODUTOS, catNomePorId: {},
    mesa: null, meusPedidos: [], chamando: "", chamar: vi.fn(), msg: null,
    detalhe: null, gruposOpcoes: [], opcoes: [], addConfigurado: vi.fn(), onFecharDetalhe: vi.fn(),
    onAbrirCardapio: vi.fn(), onAbrirProduto: vi.fn(), onAcompanharPedido: vi.fn(),
  };
  act(() => root.render(<CardapioBoasVindas {...base} {...props} />));
  return { ...base, ...props };
}

describe("Tela de boas-vindas do Cardápio Externo", () => {
  it("mostra a marca da loja e o destaque ativo (primeiro produto em destaque)", () => {
    montar();
    expect(container.textContent).toContain("Burger Station");
    expect(container.textContent).toContain("X-Bacon");
    expect(container.textContent).toContain("R$");
  });

  it("modo externo sem mesa: mostra \"Pedido online\" e os 3 selos de benefício", () => {
    montar({ modoExterno: true, currentTable: null });
    expect(container.textContent).toContain("Pedido online");
    expect(container.textContent).toContain("Ingredientes");
    expect(container.textContent).toContain("Preparo");
    expect(container.textContent).toContain("Qualidade");
  });

  it("com mesa (QR): mostra o número da mesa em vez de \"Pedido online\"", () => {
    montar({ modoExterno: false, currentTable: "Mesa 07", mesa: 7 });
    expect(container.textContent).toContain("Mesa 07");
    expect(container.textContent).not.toContain("Pedido online");
  });

  it("status aberto: mostra \"Aberto agora\" com o horário de fechamento", () => {
    montar({ lojaStatus: "aberto", fechaHoje: "23:30" });
    expect(container.textContent).toContain("Aberto agora");
    expect(container.textContent).toContain("Até 23:30");
  });

  it("status fechado: mostra \"Fechado agora\"", () => {
    montar({ lojaStatus: "fechado", fechaHoje: null });
    expect(container.textContent).toContain("Fechado agora");
  });

  it("clicar no destaque chama onAbrirProduto com o produto ativo", async () => {
    const onAbrirProduto = vi.fn();
    montar({ onAbrirProduto });
    await act(async () => { container.querySelector('[role="button"][aria-label^="Ver "]').click(); });
    expect(onAbrirProduto).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("os pontinhos do carrossel trocam o destaque ativo", async () => {
    montar();
    expect(container.textContent).toContain("X-Bacon");
    await act(async () => { container.querySelectorAll('[role="tab"]')[1].click(); });
    expect(container.textContent).toContain("Batata Frita");
  });

  it("botão \"Ver cardápio completo\" chama onAbrirCardapio", async () => {
    const onAbrirCardapio = vi.fn();
    montar({ onAbrirCardapio });
    await act(async () => { botao("Ver cardápio completo").click(); });
    expect(onAbrirCardapio).toHaveBeenCalledTimes(1);
  });

  it("com pedidos em andamento, mostra o atalho \"Acompanhar pedido\" e chama onAcompanharPedido", async () => {
    const onAcompanharPedido = vi.fn();
    montar({ meusPedidos: [{ id: "o1" }, { id: "o2" }], onAcompanharPedido });
    const btn = botao("Acompanhar pedido");
    expect(btn.textContent).toContain("(2)");
    await act(async () => { btn.click(); });
    expect(onAcompanharPedido).toHaveBeenCalledTimes(1);
  });

  it("mesa (não externo): chamar garçom/ajuda/limpeza aciona chamar(tipo, rótulo)", async () => {
    const chamar = vi.fn();
    montar({ modoExterno: false, mesa: 5, chamar });
    await act(async () => { container.querySelector('[aria-label="Chamar garçom"]').click(); });
    expect(chamar).toHaveBeenCalledWith("garcom", "Garçom");
  });

  it("sem produtos disponíveis, não quebra (sem carrossel)", () => {
    montar({ produtos: [] });
    expect(container.textContent).not.toContain("Destaques da casa");
  });

  it("avança o carrossel sozinho a cada 4s (regressão: o timer precisa viver aqui, não no componente pai)", async () => {
    vi.useFakeTimers();
    montar();
    expect(container.textContent).toContain("X-Bacon");
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(container.textContent).toContain("Batata Frita");
    vi.useRealTimers();
  });
});
