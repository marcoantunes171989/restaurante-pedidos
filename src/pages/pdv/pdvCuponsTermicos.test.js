import { describe, expect, it } from "vitest";
import {
  agruparItensPorSetor,
  linhasModificadores,
  setorDoItemCupom,
} from "./pdvCuponsTermicos";

describe("pdvCuponsTermicos", () => {
  const setores = [
    { id: 1, nome: "Cozinha", ativo: true },
    { id: 2, nome: "Bar", ativo: true },
  ];
  const products = [
    { id: 10, name: "X-Burger", setorId: 1 },
    { id: 11, name: "Suco", setorId: 2 },
    { id: 12, name: "Brownie", category: "Sobremesas" },
  ];

  it("resolve setor pelo vínculo do produto", () => {
    expect(setorDoItemCupom({ name: "X-Burger" }, products, setores)).toBe("Cozinha");
    expect(setorDoItemCupom({ name: "Suco" }, products, setores)).toBe("Bar");
  });

  it("usa heurística de categoria quando não há setor", () => {
    expect(setorDoItemCupom({ name: "Brownie" }, products, setores)).toBe("Sobremesa");
  });

  it("agrupa itens por setor na ordem de cadastro", () => {
    const grupos = agruparItensPorSetor(
      [
        { name: "Suco", quantity: 1 },
        { name: "X-Burger", quantity: 2 },
        { name: "Brownie", quantity: 1 },
      ],
      products,
      setores,
    );
    expect(grupos.map((g) => g.setor)).toEqual(["Cozinha", "Bar", "Sobremesa"]);
    expect(grupos[0].itens).toHaveLength(1);
    expect(grupos[0].itens[0].name).toBe("X-Burger");
  });

  it("formata modificadores com + e -", () => {
    const mods = linhasModificadores({
      extraIngredients: ["Bacon"],
      removedIngredients: ["Cebola"],
      observation: "Bem passado",
    });
    expect(mods).toEqual(["+ Bacon", "- Sem Cebola", "Obs: Bem passado"]);
  });
});
