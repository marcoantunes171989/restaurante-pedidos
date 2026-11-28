// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardapioProdutoCard from "./CardapioProdutoCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });

const ITEM = { id: "p1", name: "X-Bacon", description: "Hambúrguer, queijo e bacon crocante.", price: 28.9, imageUrl: "", time: "12-18 min" };

function montar(props = {}) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const base = { item: ITEM, promo: null, favorito: false, onAbrir: vi.fn() };
  act(() => root.render(<CardapioProdutoCard {...base} {...props} />));
  return { ...base, ...props };
}

describe("Card de produto da grade do Cardápio Externo", () => {
  it("mostra nome, descrição, tempo de preparo e preço", () => {
    montar();
    expect(container.textContent).toContain("X-Bacon");
    expect(container.textContent).toContain("Hambúrguer, queijo e bacon crocante.");
    expect(container.textContent).toContain("12-18 min");
    expect(container.textContent).toContain("28,90");
  });

  it("clicar na imagem ou no botão + chama onAbrir", async () => {
    const onAbrir = vi.fn();
    montar({ onAbrir });
    await act(async () => { container.querySelector(`[aria-label="Ver ${ITEM.name}"]`).click(); });
    expect(onAbrir).toHaveBeenCalledTimes(1);
    await act(async () => { container.querySelector(`[aria-label="Adicionar ${ITEM.name}"]`).click(); });
    expect(onAbrir).toHaveBeenCalledTimes(2);
  });

  it("produto indisponível: desabilita os botões e não chama onAbrir ao clicar", async () => {
    const onAbrir = vi.fn();
    montar({ item: { ...ITEM, disponivel: false }, onAbrir });
    expect(container.textContent).toContain("Indisponível");
    const btn = container.querySelector(`[aria-label="${ITEM.name} — indisponível"]`);
    expect(btn.disabled).toBe(true);
    await act(async () => { btn.click(); });
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it("com promoção: mostra preço original riscado, preço promocional e economia", () => {
    montar({ promo: { preco: 20, original: 28.9, label: "-30%" } });
    expect(container.textContent).toContain("-30%");
    expect(container.textContent).toContain("28,90");
    expect(container.textContent).toContain("20,00");
    expect(container.textContent).toContain("Economize");
  });

  it("favorito: mostra o selo de coração", () => {
    montar({ favorito: true });
    expect(container.querySelector('[aria-label="Favorito"]')).toBeTruthy();
  });

  it("destaque (isFeatured): mostra o selo \"Mais vendido\" (ou featuredLabel customizado)", () => {
    montar({ item: { ...ITEM, isFeatured: true, featuredLabel: "Favorito da casa" } });
    expect(container.textContent).toContain("Favorito da casa");
  });
});
