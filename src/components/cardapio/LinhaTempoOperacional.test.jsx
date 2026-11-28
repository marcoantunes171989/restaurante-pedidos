// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import LinhaTempoOperacional from "./LinhaTempoOperacional";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

function montar(props) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<LinhaTempoOperacional {...props} />));
}

describe("Linha do tempo operacional do pedido", () => {
  it("pedido cancelado: mostra só o aviso, sem a timeline", () => {
    montar({ status: "cancelled" });
    expect(container.textContent).toContain("Pedido cancelado");
    expect(container.querySelectorAll("li").length).toBe(0);
  });

  it("recebido: mostra o passo atual em azul (informativo), nenhum feito ainda", () => {
    montar({ status: "received", setoresPedido: ["Cozinha"] });
    const atual = container.querySelector('[aria-current="step"]');
    expect(atual.textContent).toContain("Pedido recebido");
  });

  it("em preparo: mostra o setor correspondente como etapa atual", () => {
    montar({ status: "preparing", setoresPedido: ["Cozinha", "Bar"] });
    expect(container.textContent).toContain("Preparo · Cozinha");
    expect(container.textContent).toContain("Preparo · Bar");
  });

  it("pronto, modo retirada: rótulo específico de retirada", () => {
    montar({ status: "ready", modo: "retirada" });
    expect(container.textContent).toContain("Pronto para retirada");
  });

  it("entregue, modo mesa (padrão): rótulo \"Entregue na mesa\"", () => {
    montar({ status: "delivered" });
    expect(container.textContent).toContain("Entregue na mesa");
  });
});
