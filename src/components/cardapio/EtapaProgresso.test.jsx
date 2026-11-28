// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import EtapaProgresso from "./EtapaProgresso";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

const ETAPAS = [{ label: "Pedido" }, { label: "Identificação" }, { label: "Confirmação" }];

function montar(atualIdx) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<EtapaProgresso etapas={ETAPAS} atualIdx={atualIdx} />));
}

describe("Indicador de progresso do checkout", () => {
  it("mostra as 3 etapas", () => {
    montar(0);
    expect(container.textContent).toContain("Pedido");
    expect(container.textContent).toContain("Identificação");
    expect(container.textContent).toContain("Confirmação");
  });

  it("etapa atual fica marcada com aria-current=step", () => {
    montar(1);
    const atual = container.querySelector('[aria-current="step"]');
    expect(atual).toBeTruthy();
  });

  it("etapas já feitas mostram o ícone de check em vez do número", () => {
    montar(2);
    expect(container.querySelectorAll("svg").length).toBe(2); // as 2 primeiras etapas (antes da atual) feitas
  });
});
