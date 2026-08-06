import { describe, expect, it } from "vitest";
import {
  agruparItensPorSetorCadastro,
  montarFilasImpressaoPedido,
  resolverSetorDoItem,
} from "./impressaoCozinha";

describe("impressaoCozinha", () => {
  const setores = [
    { id: 1, nome: "Cozinha", impressoraNome: "Imp Cozinha", impressaoAuto: true, ativo: true },
    { id: 2, nome: "Bar", impressoraNome: "Imp Bar", impressaoAuto: true, ativo: true },
    { id: 3, nome: "Sobremesa", impressoraNome: "Imp Doce", impressaoAuto: true, ativo: true },
  ];
  const categories = [
    { id: 10, nome: "Bebidas", setorId: 2 },
    { id: 11, nome: "Sobremesas", setorId: 3 },
    { id: 12, nome: "Lanches", setorId: 1 },
  ];
  const products = [
    { id: 100, name: "X-Burger", setorId: 1, categoriaId: 12, category: "Lanches" },
    { id: 101, name: "Suco", categoriaId: 10, category: "Bebidas" }, // só categoria
    { id: 102, name: "Brownie", setorId: 3, categoriaId: 11, category: "Sobremesas" }, // produto prioriza
  ];

  it("prioriza setor do produto sobre o da categoria", () => {
    const r = resolverSetorDoItem({ name: "Brownie" }, { products, categories, setores });
    expect(r.setorId).toBe(3);
    expect(r.origem).toBe("produto");
  });

  it("usa setor da categoria quando produto não tem setor", () => {
    const r = resolverSetorDoItem({ name: "Suco" }, { products, categories, setores });
    expect(r.setorId).toBe(2);
    expect(r.origem).toBe("categoria");
    expect(r.setor.impressoraNome).toBe("Imp Bar");
  });

  it("agrupa lanche, bebida e sobremesa em três filas", () => {
    const { grupos, semSetor } = agruparItensPorSetorCadastro(
      [
        { name: "X-Burger", quantity: 1 },
        { name: "Suco", quantity: 1 },
        { name: "Brownie", quantity: 1 },
      ],
      { products, categories, setores },
    );
    expect(semSetor).toHaveLength(0);
    expect(grupos.map((g) => g.setorNome)).toEqual(["Cozinha", "Bar", "Sobremesa"]);
  });

  it("monta filas de impressão com mesa e impressora", () => {
    const { filas } = montarFilasImpressaoPedido(
      {
        id: "PED-99",
        table: "Mesa 07",
        command: "HAM-1",
        items: [
          { name: "X-Burger", quantity: 2 },
          { name: "Suco", quantity: 1 },
        ],
        lojaId: 1,
      },
      { products, categories, setores },
      "tablet",
    );
    expect(filas).toHaveLength(2);
    expect(filas[0].mesa).toBe("Mesa 07");
    expect(filas[0].impressoraNome).toBe("Imp Cozinha");
    expect(filas[1].origem).toBe("tablet");
  });
});
