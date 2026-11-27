// @vitest-environment jsdom
// Divisão da conta por pessoa: a mesma cota na pré-conta impressa, em "Dividir a conta" e no fechamento.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckoutSplit from "../../components/orders/checkout/CheckoutSplit";
import ModalDividirConta from "./PdvDividirConta";
import { htmlPreConta } from "./pdvCuponsTermicos";
import { cotaPorPessoa } from "./pdvHelpers";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (tela) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(tela)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; });
const texto = (s) => String(s).replace(/\u00a0/g, " ");

describe("cota por pessoa", () => {
  it("divisão exata não ganha 1 centavo", () => {
    expect([cotaPorPessoa(0.14, 2), cotaPorPessoa(1.16, 4), cotaPorPessoa(120, 4)]).toEqual([0.07, 0.29, 30]);
  });
  it("divisão com sobra arredonda para cima, e a soma cobre a conta com menos de 1 centavo por pessoa", () => {
    expect(cotaPorPessoa(100, 3)).toBe(33.34);
    const erradas = [];
    for (let centavos = 1; centavos <= 20000; centavos += 1) {
      for (let n = 1; n <= 12; n += 1) {
        const sobra = Math.round(cotaPorPessoa(centavos / 100, n) * 100) * n - centavos;
        if (sobra < 0 || sobra >= n) erradas.push([centavos, n, sobra]);
      }
    }
    expect(erradas).toEqual([]);
  });
  it("sem valor ou sem pessoas, vale zero", () => {
    expect([cotaPorPessoa(0, 3), cotaPorPessoa(10, 0), cotaPorPessoa(null, null)]).toEqual([0, 0, 0]);
  });
});

describe("pré-conta impressa", () => {
  const preConta = (total, pessoas) => texto(htmlPreConta({ mesa: "Mesa 1", total, subtotal: total, pessoas, itens: [] }));
  it("divisão exata: valor certo e sem ajuste", () => {
    const html = preConta(0.14, 2);
    expect(html).toContain("R$ 0,07 / pessoa");
    expect(html).not.toContain("Ajuste de arredondamento");
  });
  it("com sobra: mostra a cota e o ajuste", () => {
    const html = preConta(100, 3);
    expect(html).toContain("R$ 33,34 / pessoa");
    expect(html).toMatch(/Ajuste de arredondamento<\/span><span>R\$ 0,02/);
  });
});

describe("telas de divisão", () => {
  const abrir = async (total, restante) => {
    const onAplicar = vi.fn();
    await montar(<ModalDividirConta total={total} restante={restante} onAplicar={onAplicar} onFechar={() => {}} />);
    return onAplicar;
  };
  const aumentar = (indice) => act(async () => el.querySelectorAll('button[aria-label="Aumentar"]')[indice].click());
  const usar = () => act(async () => [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Usar este valor").click());

  it("uma cota de três: a mesma da pré-conta", async () => {
    const onAplicar = await abrir(100, 100);
    await aumentar(0);
    expect(texto(document.body.textContent)).toContain("R$ 33,34 por pessoa");
    await usar();
    expect(onAplicar).toHaveBeenCalledWith(33.34);
  });
  it("todas as cotas somam exatamente a conta, sem aviso de excesso", async () => {
    const onAplicar = await abrir(100, 100);
    await aumentar(0);
    await aumentar(1);
    await aumentar(1);
    expect(texto(document.body.textContent)).not.toContain("passa do que falta");
    await usar();
    expect(onAplicar).toHaveBeenCalledWith(100);
  });
  it("a última pessoa recebe só o que falta (não sobra centavo em aberto)", async () => {
    const onAplicar = await abrir(100, 33.32);
    await aumentar(0);
    await usar();
    expect(onAplicar).toHaveBeenCalledWith(33.32);
  });
  it("divisão do fechamento mostra a mesma cota", async () => {
    await montar(<CheckoutSplit total={100} pessoas={3} onPessoas={() => {}} />);
    expect(texto(document.body.textContent)).toContain("R$ 33,34");
  });
});
