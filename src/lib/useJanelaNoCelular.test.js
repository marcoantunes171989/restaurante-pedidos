// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ALTURA_BAIXA, medirAreaVisivel, useJanelaNoCelular } from "./useJanelaNoCelular.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el, resultado;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = resultado = null; delete window.visualViewport; document.body.innerHTML = ""; });

function Sonda() { resultado = useJanelaNoCelular(); return null; }
const montar = async () => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(createElement(Sonda))); };
const areaFalsa = (altura) => { const vv = new EventTarget(); Object.assign(vv, { height: altura, offsetTop: 0, scale: 1 }); window.visualViewport = vv; return vv; };

describe("janela do cadastro no celular", () => {
  it("mede a área visível e ignora o zoom de pinça", () => {
    expect(medirAreaVisivel({})).toBeNull();
    expect(medirAreaVisivel({ visualViewport: { height: 330.4, offsetTop: 12.6, scale: 1 } })).toEqual({ topo: 13, altura: 330 });
    expect(medirAreaVisivel({ visualViewport: { height: 300, offsetTop: 0, scale: 2 } })).toBeNull();
  });
  it("acompanha o teclado abrindo e avisa quando sobra pouca altura", async () => {
    const vv = areaFalsa(700);
    await montar();
    expect(resultado).toEqual({ estilo: { top: 0, height: 700, bottom: "auto" }, baixa: false });
    await act(async () => { vv.height = ALTURA_BAIXA - 150; vv.dispatchEvent(new Event("resize")); });
    expect(resultado.estilo.height).toBe(ALTURA_BAIXA - 150);
    expect(resultado.baixa).toBe(true);
  });
  it("trava a rolagem do fundo enquanto a janela está aberta e devolve ao fechar", async () => {
    const fundo = document.createElement("div");
    fundo.className = "pp-admin-content";
    fundo.style.overflow = "auto";
    document.body.appendChild(fundo);
    await montar();
    expect([fundo.style.overflow, document.body.style.overflow]).toEqual(["hidden", "hidden"]);
    await act(async () => { root.unmount(); });
    root = null;
    expect([fundo.style.overflow, document.body.style.overflow]).toEqual(["auto", ""]);
  });
});
