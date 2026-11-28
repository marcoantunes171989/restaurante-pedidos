// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardapioMeusPedidos from "./CardapioMeusPedidos";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").includes(txt));

const PEDIDO = { id: "o1", createdAt: "14:32", status: "preparing", setorStatus: {}, items: [{ quantity: 1, name: "X-Bacon", price: 28.9 }] };

function montar(props = {}) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const base = {
    meusPedidos: [], pedidosOffline: false, onFechar: vi.fn(),
    modoExterno: true, currentTable: null, comanda: null,
    statusGeralConta: null, tomStatusGeral: "info", contaAbertaEm: "14:30", totalMesa: 28.9, pagamentoPosteriorConta: false,
    fidRegraPub: null, pontosGanharConta: 0, clienteIdentificado: false, saldoPontos: 0,
    pedidoRecolhido: {}, onToggleRecolhido: vi.fn(),
    setoresDoPedido: () => ["Cozinha"], modoEntregaPedido: () => "mesa",
    estiloStatusCliente: () => ({ chip: "border-x bg-y text-z", dot: "bg-z" }), statusClienteLabel: () => "Em preparo",
    resumoMesa: { taxa: 0 }, taxaPct: 10, subtotal: 28.9,
    contaSolicitada: false, contaPaga: false, podeFechar: false,
    usarPontos: false, onUsarPontosChange: vi.fn(), solicitando: false, onSolicitarFechamento: vi.fn(),
  };
  act(() => root.render(<CardapioMeusPedidos {...base} {...props} />));
  return { ...base, ...props };
}

describe("Gaveta Meus Pedidos", () => {
  it("sem pedidos: mensagem vazia e botão para voltar ao cardápio", async () => {
    const onFechar = vi.fn();
    montar({ onFechar });
    expect(container.textContent).toContain("Nenhum pedido para acompanhar ainda");
    await act(async () => { botao("Voltar ao cardápio").click(); });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("offline sem pedidos: avisa que não foi possível consultar (não diz que não há pedido)", () => {
    montar({ pedidosOffline: true });
    expect(container.querySelector('[data-testid="acompanhamento-indisponivel"]')).toBeTruthy();
  });

  it("com pedido: mostra o resumo da conta, a timeline operacional e os itens", () => {
    montar({ meusPedidos: [PEDIDO], totalMesa: 28.9 });
    expect(container.textContent).toContain("Pedido nº");
    expect(container.textContent).toContain("Em preparo");
    expect(container.textContent).toContain("X-Bacon");
    expect(container.textContent).toContain("Preparo · Cozinha"); // vem da LinhaTempoOperacional de verdade
  });

  it("clicar no cabeçalho do pedido chama onToggleRecolhido com o id", async () => {
    const onToggleRecolhido = vi.fn();
    montar({ meusPedidos: [PEDIDO, { ...PEDIDO, id: "o2" }], onToggleRecolhido });
    await act(async () => { container.querySelector('[aria-expanded]').click(); });
    expect(onToggleRecolhido).toHaveBeenCalledWith("o1");
  });

  it("quando pode fechar, o botão de solicitar fechamento fica habilitado e chama onSolicitarFechamento", async () => {
    const onSolicitarFechamento = vi.fn();
    montar({ meusPedidos: [PEDIDO], podeFechar: true, onSolicitarFechamento });
    const btn = botao("Solicitar fechamento da conta");
    expect(btn.disabled).toBe(false);
    await act(async () => { btn.click(); });
    expect(onSolicitarFechamento).toHaveBeenCalledTimes(1);
  });

  it("com saldo de pontos, o checkbox \"usar pontos\" chama onUsarPontosChange", async () => {
    const onUsarPontosChange = vi.fn();
    montar({ meusPedidos: [PEDIDO], saldoPontos: 120, onUsarPontosChange });
    await act(async () => { container.querySelector('input[type="checkbox"]').click(); });
    expect(onUsarPontosChange).toHaveBeenCalledWith(true);
  });
});
