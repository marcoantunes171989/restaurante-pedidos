// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ListaProdutos from "./ListaProdutos.jsx";
import InputAoSair from "./InputAoSair.jsx";
import { filtrarProdutos, filtrosDeSituacao, margemDoProduto, paginar, situacaoEstoque } from "../../../lib/listaProdutos.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; });
const montar = async (no) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(no)); };
const q = (id) => el.querySelector(`[data-testid="${id}"]`);
const todos = (id) => el.querySelectorAll(`[data-testid="${id}"]`);
const clicar = (alvo) => act(async () => { alvo.click(); });
const digitar = (input, v) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

const P = (id, extra = {}) => ({ id, name: `Produto ${id}`, category: "Lanches", price: 10, cost: 0, estoque: 0, active: true, imageUrl: "foto.jpg", lojaFiscalRegraId: 3, ...extra });
const PRODUTOS = [P(1, { name: "Açaí Especial", category: "Sobremesas" }), P(2, { active: false }), P(3, { imageUrl: "", lojaFiscalRegraId: null })];

describe("regras da lista de produtos", () => {
  it("busca sem acento e junta com categoria e situação", () => {
    expect(filtrarProdutos(PRODUTOS, { busca: "acai" }).map((p) => p.id)).toEqual([1]);
    const inativos = filtrosDeSituacao(PRODUTOS).find((f) => f.id === "inativos");
    expect(filtrarProdutos(PRODUTOS, { situacao: inativos, categoria: "Lanches" }).map((p) => p.id)).toEqual([2]);
  });
  it("conta sem foto (inclusive a imagem padrão) e sem parâmetro fiscal só em loja que usa parâmetro", () => {
    expect(filtrosDeSituacao([P(1, { imageUrl: "padrao.png" })], { imagemPadrao: "padrao.png" }).find((f) => f.id === "sem-foto").total).toBe(1);
    expect(filtrosDeSituacao(PRODUTOS).some((f) => f.id === "sem-fiscal")).toBe(false);
    expect(filtrosDeSituacao(PRODUTOS, { usaParametroFiscal: true }).find((f) => f.id === "sem-fiscal").total).toBe(1);
  });
  it("margem só com custo; estoque só de quem controla ou tem quantidade", () => {
    expect(margemDoProduto(P(1))).toBeNull();
    expect(margemDoProduto(P(1, { cost: 4 }))).toBe(60);
    expect(situacaoEstoque(P(1))).toBeNull();
    expect(situacaoEstoque(P(1, { controlaEstoque: true }))).toEqual({ texto: "Estoque 0", baixo: true });
  });
  it("paginação não passa do fim", () => {
    expect(paginar([1, 2, 3], 9, 2)).toEqual({ itens: [3], atual: 2, total: 2 });
  });
});

describe("lista de produtos (tela)", () => {
  const fns = () => ({ onNovo: vi.fn(), onEditar: vi.fn(), onOpcoes: vi.fn(), onExcluir: vi.fn(), onAlternar: vi.fn() });
  it("filtra por situação, limpa filtros e chama as ações do produto certo", async () => {
    const f = fns();
    await montar(<ListaProdutos produtos={PRODUTOS} categorias={["Lanches", "Sobremesas"]} usaParametroFiscal {...f} />);
    expect(todos("cartao-produto")).toHaveLength(3);
    await clicar(q("situacao-inativos"));
    expect(todos("cartao-produto")).toHaveLength(1);
    await clicar(q("editar-produto"));
    expect(f.onEditar).toHaveBeenCalledWith(PRODUTOS[1]);
    await clicar(q("opcoes-produto"));
    expect(f.onOpcoes).toHaveBeenCalledWith(PRODUTOS[1]);
    await clicar(q("alternar-produto"));
    expect(f.onAlternar).toHaveBeenCalledWith(PRODUTOS[1]);
    await clicar(q("excluir-produto"));
    expect(f.onExcluir).toHaveBeenCalledWith(PRODUTOS[1]);
    await digitar(el.querySelector('input[aria-label="Buscar produto"]'), "nada disso");
    expect(q("produtos-sem-resultado")).not.toBeNull();
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent === "Ver todos"));
    expect(todos("cartao-produto")).toHaveLength(3);
  });
  it("sem nenhum produto, convida a cadastrar o primeiro", async () => {
    const f = fns();
    await montar(<ListaProdutos produtos={[]} {...f} />);
    await clicar(q("produtos-vazio").querySelector("button"));
    expect(f.onNovo).toHaveBeenCalled();
  });
  it("campo de grupo grava só ao terminar, não a cada tecla", async () => {
    const gravar = vi.fn();
    await montar(<InputAoSair valor="Tamanho" onConfirmar={gravar} />);
    const input = el.querySelector("input");
    await act(async () => { input.focus(); });
    await digitar(input, "Tamanho do copo");
    expect(gravar).not.toHaveBeenCalled();
    await act(async () => { input.blur(); });
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(gravar).toHaveBeenCalledWith("Tamanho do copo");
  });
});
