// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardItemCarrinho from "./CardItemCarrinho";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });

function montar(item, onRemover = vi.fn()) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<CardItemCarrinho item={item} onRemover={onRemover} />));
  return onRemover;
}

describe("Card de item do carrinho", () => {
  it("mostra quantidade, nome e preço total (quantidade × preço unitário)", () => {
    montar({ quantity: 2, name: "X-Bacon", price: 28.9 });
    expect(container.textContent).toContain("2×");
    expect(container.textContent).toContain("X-Bacon");
    expect(container.textContent).toContain("57,80");
  });

  it("item de combo mostra o nome do combo", () => {
    montar({ quantity: 1, name: "X-Bacon", price: 28.9, comboId: "c1", comboNome: "Combo Bacon" });
    expect(container.textContent).toContain("Combo: Combo Bacon");
  });

  it("personalização (ingredientes removidos/extras/observação) aparece sob o nome", () => {
    montar({ quantity: 1, name: "X-Bacon", price: 28.9, removedIngredients: ["Cebola"], extraIngredients: ["Bacon extra"], observation: "Sem maionese" });
    expect(container.textContent).toContain("Sem: Cebola");
    expect(container.textContent).toContain("Com: Bacon extra");
    expect(container.textContent).toContain("Sem maionese");
  });

  it("clicar em remover chama onRemover com o item", async () => {
    const item = { id: "i1", quantity: 1, name: "X-Bacon", price: 28.9 };
    const onRemover = montar(item);
    await act(async () => { container.querySelector(`[aria-label="Remover ${item.name} do pedido"]`).click(); });
    expect(onRemover).toHaveBeenCalledWith(item);
  });
});
