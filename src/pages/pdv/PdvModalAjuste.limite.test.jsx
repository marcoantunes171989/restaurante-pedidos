// @vitest-environment jsdom
// Desconto e acréscimo com o limite da empresa: reais ou percentual, motivo obrigatório e nunca zerar a venda.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PdvModalAjuste from "./PdvModalAjuste";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (props) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(<PdvModalAjuste onFechar={() => {}} {...props} />)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; });
const q = (id) => el.querySelector(`[data-testid="${id}"]`);
const digitar = async (rotulo, valor) => {
  const input = el.querySelector(`input[aria-label^="${rotulo}"]`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const LIMITE = { percentualMax: 10, valorMax: null };

describe("PdvModalAjuste com limite da empresa", () => {
  it("mostra o máximo e só confirma com valor dentro do limite e motivo", async () => {
    const onConfirmar = vi.fn();
    await montar({ tipo: "desconto", compra: 200, limite: LIMITE, onConfirmar });
    expect(q("ajuste-limite").textContent).toContain("R$ 20,00");
    await digitar("Valor", "1500");
    expect(q("ajuste-confirmar").disabled).toBe(true); // falta o motivo
    await digitar("Motivo", "cliente fiel");
    await act(async () => q("ajuste-confirmar").click());
    expect(onConfirmar).toHaveBeenCalledWith(15, "cliente fiel");
  });
  it("acima do limite não confirma e avisa", async () => {
    const onConfirmar = vi.fn();
    await montar({ tipo: "acrescimo", compra: 200, limite: LIMITE, onConfirmar });
    await digitar("Valor", "2001");
    await digitar("Motivo", "embalagem");
    expect(q("ajuste-limite").textContent).toContain("Acima do limite");
    expect(q("ajuste-confirmar").disabled).toBe(true);
    await act(async () => q("ajuste-confirmar").click());
    expect(onConfirmar).not.toHaveBeenCalled();
  });
  it("percentual vira reais ao confirmar", async () => {
    const onConfirmar = vi.fn();
    await montar({ tipo: "desconto", compra: 59.9, limite: LIMITE, onConfirmar });
    await act(async () => q("ajuste-percentual").click());
    await digitar("Valor", "1000"); // 10,00%
    await digitar("Motivo", "promoção");
    await act(async () => q("ajuste-confirmar").click());
    expect(onConfirmar).toHaveBeenCalledWith(5.99, "promoção");
  });
  it("sem limite configurado, 100% da compra continua recusado", async () => {
    await montar({ tipo: "desconto", compra: 80, limite: { percentualMax: null, valorMax: null }, onConfirmar: vi.fn() });
    await digitar("Valor", "8000");
    await digitar("Motivo", "cortesia");
    expect(q("ajuste-confirmar").disabled).toBe(true);
    await digitar("Valor", "7999");
    expect(q("ajuste-confirmar").disabled).toBe(false);
  });
});
