import { describe, expect, it } from "vitest";
import {
  agruparItensPorSetorCadastro,
  montarFilasImpressaoPedido,
  resolverImpressoraDoItem,
  resolverSetorDoItem,
} from "./impressaoCozinha";

describe("impressaoCozinha", () => {
  const setores = [
    { id: 1, nome: "Cozinha", ativo: true },
    { id: 2, nome: "Bar", ativo: true },
    { id: 3, nome: "Sobremesa", ativo: true },
  ];
  const impressoras = [
    { id: 201, nome: "Imp Cozinha", destino: "EPSON-TM", impressaoAuto: true, ativo: true },
    { id: 202, nome: "Imp Bar", destino: "\\\\BAR\\Fila", impressaoAuto: true, ativo: true },
    { id: 203, nome: "Imp Doce", destino: "192.168.0.20:9100", impressaoAuto: false, ativo: true },
  ];
  const categories = [
    { id: 10, nome: "Bebidas", setorId: 2, impressoraId: 202 },
    { id: 11, nome: "Sobremesas", setorId: 3, impressoraId: 203 },
    { id: 12, nome: "Lanches", setorId: 1, impressoraId: 201 },
  ];
  const products = [
    { id: 100, name: "X-Burger", setorId: 1, categoriaId: 12, category: "Lanches" },
    { id: 101, name: "Suco", categoriaId: 10, category: "Bebidas" },
    { id: 102, name: "Brownie", setorId: 3, categoriaId: 11, category: "Sobremesas" },
    { id: 103, name: "Drink Especial", setorId: 2, categoriaId: 10, category: "Bebidas", impressoraId: 201 },
  ];
  const ctx = { products, categories, setores, impressoras };

  it("prioriza setor do produto sobre o da categoria", () => {
    const r = resolverSetorDoItem({ name: "Brownie" }, ctx);
    expect(r.setorId).toBe(3);
    expect(r.origem).toBe("produto");
  });

  it("usa setor da categoria quando produto não tem setor", () => {
    const r = resolverSetorDoItem({ name: "Suco" }, ctx);
    expect(r.setorId).toBe(2);
    expect(r.origem).toBe("categoria");
  });

  it("resolve impressora da categoria e prioriza override do produto", () => {
    const viaCat = resolverImpressoraDoItem({ name: "Suco" }, ctx);
    expect(viaCat.impressoraId).toBe(202);
    expect(viaCat.origemImpressora).toBe("categoria");
    expect(viaCat.impressora.nome).toBe("Imp Bar");

    const viaProd = resolverImpressoraDoItem({ name: "Drink Especial" }, ctx);
    expect(viaProd.impressoraId).toBe(201);
    expect(viaProd.origemImpressora).toBe("produto");
    expect(viaProd.setorId).toBe(2);
  });

  it("agrupa lanche, bebida e sobremesa em três filas com impressoras", () => {
    const { grupos, semSetor } = agruparItensPorSetorCadastro(
      [
        { name: "X-Burger", quantity: 1 },
        { name: "Suco", quantity: 1 },
        { name: "Brownie", quantity: 1 },
      ],
      ctx,
    );
    expect(semSetor).toHaveLength(0);
    expect(grupos.map((g) => g.setorNome)).toEqual(["Cozinha", "Bar", "Sobremesa"]);
    expect(grupos.map((g) => g.impressoraNome)).toEqual(["Imp Cozinha", "Imp Bar", "Imp Doce"]);
    expect(grupos[2].impressaoAuto).toBe(false);
  });

  it("monta filas de impressão com mesa e impressora cadastrada", () => {
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
      ctx,
      "tablet",
    );
    expect(filas).toHaveLength(2);
    expect(filas[0].mesa).toBe("Mesa 07");
    expect(filas[0].impressoraId).toBe(201);
    expect(filas[0].impressoraNome).toBe("Imp Cozinha");
    expect(filas[1].origem).toBe("tablet");
  });

  it("usa impressora legada do setor quando não há cadastro novo", () => {
    const setoresLegado = [
      { id: 1, nome: "Cozinha", impressoraNome: "Legado Cozinha", impressoraDestino: "USB001", impressaoAuto: true, ativo: true },
    ];
    const r = resolverImpressoraDoItem(
      { name: "X-Burger" },
      {
        products: [{ id: 100, name: "X-Burger", setorId: 1 }],
        categories: [],
        setores: setoresLegado,
        impressoras: [],
      },
    );
    expect(r.origemImpressora).toBe("setor-legado");
    expect(r.impressora.nome).toBe("Legado Cozinha");
  });
});
