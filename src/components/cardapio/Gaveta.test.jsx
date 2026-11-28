// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Gaveta from "./Gaveta";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });

function montar(props = {}) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const base = { titulo: "Finalizar pedido", subtitulo: "Revise os dados antes de confirmar", onFechar: vi.fn() };
  act(() => root.render(<Gaveta {...base} {...props}>{props.children ?? <p>Conteúdo</p>}</Gaveta>));
  return { ...base, ...props };
}

describe("Gaveta (bottom sheet do Cardápio Externo)", () => {
  it("mostra título, subtítulo e o conteúdo (children)", () => {
    montar();
    expect(container.textContent).toContain("Finalizar pedido");
    expect(container.textContent).toContain("Revise os dados antes de confirmar");
    expect(container.textContent).toContain("Conteúdo");
  });

  it("o rodapé só aparece quando a prop rodape é passada", () => {
    montar();
    expect(container.textContent).not.toContain("Confirmar e enviar");
    act(() => root.unmount()); container.remove();
    montar({ rodape: <button>Confirmar e enviar</button> });
    expect(container.textContent).toContain("Confirmar e enviar");
  });

  it("clicar no X ou no fundo (overlay) chama onFechar; clicar dentro da folha não fecha", async () => {
    const onFechar = vi.fn();
    montar({ onFechar });
    await act(async () => { container.querySelector('[aria-label="Fechar"]').click(); });
    expect(onFechar).toHaveBeenCalledTimes(1);
    await act(async () => { container.querySelector("h2").click(); });
    expect(onFechar).toHaveBeenCalledTimes(1); // não aumentou: clique dentro não propaga pro overlay
  });

  it("fecharLabel customiza o aria-label/title do botão de fechar", () => {
    montar({ fecharLabel: "Fechar acompanhamento dos pedidos" });
    expect(container.querySelector('[aria-label="Fechar acompanhamento dos pedidos"]')).toBeTruthy();
  });
});
