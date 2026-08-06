import { describe, expect, it } from "vitest";
import {
  agruparItensPorSetor,
  htmlComprovanteCompletoPagamento,
  htmlCupomClienteSimplificado,
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

  it("cupom simplificado traz marca e desconto de cupom", () => {
    const html = htmlCupomClienteSimplificado({
      lojaInfo: { nome: "Burger Station", documento: "12345678000199" },
      pedidoNumero: "1024",
      itens: [{ name: "Burger", quantity: 1, price: 34.9 }],
      subtotal: 34.9,
      desconto: 3.49,
      cupomCodigo: "PRIME10",
      total: 31.41,
      formaPagamento: "PIX",
    });
    expect(html).toMatch(/PEDIDO PRIME/);
    expect(html).toMatch(/CUPOM DO CLIENTE/);
    expect(html).toMatch(/PRIME10/);
    expect(html).toMatch(/NÃO FISCAL/i);
  });

  it("comprovante completo lista pagamentos e controle interno", () => {
    const html = htmlComprovanteCompletoPagamento({
      lojaInfo: { nome: "Burger Station" },
      mesa: "Mesa 07",
      comanda: "CMD-1",
      itens: [{ name: "Burger", quantity: 2, price: 34.9 }],
      subtotal: 69.8,
      total: 69.8,
      pagamentos: [{ forma: "PIX", valor: 69.8 }],
      pagamentoId: "PAG-123",
      operador: "Ana",
    });
    expect(html).toMatch(/COMPROVANTE COMPLETO/);
    expect(html).toMatch(/PIX/);
    expect(html).toMatch(/CONTROLE INTERNO/);
    expect(html).toMatch(/PAG-123/);
  });
});
