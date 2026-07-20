import { describe, it, expect } from "vitest";
import {
  CATEGORIA_TODOS, slugify, agruparProdutosPorCategoria, montarListaCategorias,
  escolherCategoriaAtiva, calcularDestinoScroll,
} from "./cardapioCategorias";

describe("slugify", () => {
  it("normaliza acentos, espaços e maiúsculas", () => {
    expect(slugify("Hambúrgueres")).toBe("cat-hamburgueres");
    expect(slugify("Combos & Promoções")).toBe("cat-combos-promocoes");
  });
  it("nunca fica vazio, mesmo sem nenhum caractere aproveitável", () => {
    expect(slugify("")).toBe("cat-sem-nome");
    expect(slugify("!!!")).toBe("cat-sem-nome");
    expect(slugify(null)).toBe("cat-sem-nome");
  });
});

describe("agruparProdutosPorCategoria", () => {
  const categorias = [
    { id: 1, nome: "Hambúrgueres", ordem: 1 },
    { id: 2, nome: "Bebidas", ordem: 2 },
  ];

  it("agrupa pelo vínculo real categoriaId (migration 068)", () => {
    const produtos = [
      { name: "X-Tudo", categoriaId: 1, price: 20 },
      { name: "Coca-Cola", categoriaId: 2, price: 6 },
    ];
    const grupos = agruparProdutosPorCategoria(produtos, categorias);
    expect(grupos.map((g) => g.id)).toEqual(["1", "2"]);
    expect(grupos[0].nome).toBe("Hambúrgueres");
    expect(grupos[0].produtos).toHaveLength(1);
  });

  it("produto sem categoria cai em 'Outros', sem quebrar a navegação", () => {
    const produtos = [{ name: "Item avulso", categoriaId: null, category: "", price: 10 }];
    const grupos = agruparProdutosPorCategoria(produtos, categorias);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe("Outros");
    expect(grupos[0].id).toBe("cat-outros");
  });

  it("carregamento assíncrono: sem produtos/categorias ainda, devolve lista vazia (sem quebrar)", () => {
    expect(agruparProdutosPorCategoria([], [])).toEqual([]);
    expect(agruparProdutosPorCategoria(undefined, undefined)).toEqual([]);
  });

  it("nomes com acentos/espaços/caracteres especiais que colidem no slug continuam com IDs únicos no DOM", () => {
    const produtos = [
      { name: "A", category: "Promoções!", categoriaId: null },
      { name: "B", category: "Promoções?", categoriaId: null },
    ];
    const grupos = agruparProdutosPorCategoria(produtos, []);
    // "Promoções!" e "Promoções?" são categorias de texto livre DIFERENTES,
    // mas normalizam pro MESMO slug — precisam continuar sendo grupos
    // separados, com ids únicos (senão vira `key`/`id` duplicado no DOM).
    expect(grupos).toHaveLength(2);
    const ids = grupos.map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("respeita a ordem de exibição das categorias e, dentro do grupo, dos produtos", () => {
    const produtos = [
      { name: "Zebra", categoriaId: 2, price: 1 },
      { name: "Água", categoriaId: 2, price: 1 },
      { name: "X-Salada", categoriaId: 1, price: 1 },
    ];
    const grupos = agruparProdutosPorCategoria(produtos, categorias);
    expect(grupos.map((g) => g.nome)).toEqual(["Hambúrgueres", "Bebidas"]); // ordem 1 antes de ordem 2
    expect(grupos[1].produtos.map((p) => p.name)).toEqual(["Água", "Zebra"]); // alfabético dentro do grupo
  });

  it("categoria excluída/sem correspondência (categoriaId órfão) não quebra — cai no nome salvo no produto", () => {
    const produtos = [{ name: "Combo antigo", categoriaId: 999, category: "Combos", price: 30 }];
    const grupos = agruparProdutosPorCategoria(produtos, categorias);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe("Combos");
    expect(grupos[0].id).toBe("999");
  });
});

describe("montarListaCategorias", () => {
  it("sempre começa com 'Todos'", () => {
    const cats = montarListaCategorias([{ id: "1", nome: "Hambúrgueres" }]);
    expect(cats[0]).toEqual({ id: CATEGORIA_TODOS, nome: "Todos" });
    expect(cats).toHaveLength(2);
  });
  it("sem grupos ainda (carregando) → só 'Todos'", () => {
    expect(montarListaCategorias([])).toEqual([{ id: CATEGORIA_TODOS, nome: "Todos" }]);
  });
});

describe("escolherCategoriaAtiva", () => {
  const grupos = [{ id: "1", nome: "A" }, { id: "2", nome: "B" }, { id: "3", nome: "C" }];

  it("ao abrir a tela / sem nenhuma seção na faixa (topo da página) → Todos", () => {
    expect(escolherCategoriaAtiva(grupos, new Set())).toBe(CATEGORIA_TODOS);
  });

  it("uma seção cruzando a faixa → essa categoria fica ativa (scroll manual)", () => {
    expect(escolherCategoriaAtiva(grupos, new Set(["2"]))).toBe("2");
  });

  it("mais de uma seção na faixa ao mesmo tempo → vence a que vem primeiro no cardápio", () => {
    expect(escolherCategoriaAtiva(grupos, new Set(["3", "1"]))).toBe("1");
  });
});

describe("calcularDestinoScroll", () => {
  it("compensa a altura do cabeçalho e da barra fixa ao clicar numa categoria", () => {
    // Seção a 500px do topo do viewport, container já rolado 100px, 130px de offset fixo.
    expect(calcularDestinoScroll({ rectTop: 500, scrollAtual: 100, stickyOffset: 130 })).toBe(470);
  });
  it("nunca devolve destino negativo", () => {
    expect(calcularDestinoScroll({ rectTop: 10, scrollAtual: 0, stickyOffset: 130 })).toBe(0);
  });
  it("'Todos' (stickyOffset 0) rola exatamente até o topo do sentinela", () => {
    expect(calcularDestinoScroll({ rectTop: 800, scrollAtual: 800, stickyOffset: 0 })).toBe(1600);
  });
});
