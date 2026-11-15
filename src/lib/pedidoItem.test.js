import { describe, it, expect } from "vitest";
import { produtoIdDoItem, itemPersistidoDoCarrinho, copiarItemPedido } from "./pedidoItem.js";

describe("produtoIdDoItem", () => {
  it("usa productId gravado (mesma chave do cardápio público V2)", () => {
    expect(produtoIdDoItem({ productId: 12, id: 99 })).toBe(12);
  });
  it("aceita produtoId e, no carrinho, o id do próprio produto", () => {
    expect(produtoIdDoItem({ produtoId: "7" })).toBe(7);
    expect(produtoIdDoItem({ id: 5, name: "X" })).toBe(5);
  });
  it("descarta ids que não são de produto (texto, zero, vazio)", () => {
    expect(produtoIdDoItem({ id: "PED-123" })).toBeNull();
    expect(produtoIdDoItem({ id: 0 })).toBeNull();
    expect(produtoIdDoItem({})).toBeNull();
    expect(produtoIdDoItem(null)).toBeNull();
  });
});

describe("itemPersistidoDoCarrinho", () => {
  const carrinho = {
    id: 10, name: "X-Burger", quantity: 2, price: 30, ingredients: ["Pão"],
    selectedIngredients: ["Pão"], removedIngredients: [], extraIngredients: ["Bacon"],
    selectedOptions: [{ nome: "Ponto", optionId: 3 }], observation: "sem cebola",
    extraIngredientInput: "lixo de tela", description: "não vai pro pedido",
  };
  it("mantém o contrato atual do item e acrescenta productId", () => {
    expect(itemPersistidoDoCarrinho(carrinho)).toEqual({
      productId: 10, name: "X-Burger", quantity: 2, price: 30,
      selectedIngredients: ["Pão"], removedIngredients: [], extraIngredients: ["Bacon"],
      selectedOptions: [{ nome: "Ponto", optionId: 3 }], observation: "sem cebola",
    });
  });
  it("sem id de produto, não inventa productId", () => {
    const r = itemPersistidoDoCarrinho({ name: "Avulso", quantity: 1, price: 5 });
    expect(r).not.toHaveProperty("productId");
    expect(r.selectedOptions).toEqual([]);
  });
});

describe("copiarItemPedido (separar/transferir itens)", () => {
  it("preserva productId e normaliza listas", () => {
    expect(copiarItemPedido({ productId: 4, name: "Suco", quantity: 1, price: 9, key: "P1-0", orderId: "P1", index: 0 })).toEqual({
      productId: 4, name: "Suco", quantity: 1, price: 9,
      selectedIngredients: [], removedIngredients: [], extraIngredients: [], observation: "", selectedOptions: [],
    });
  });
  it("item antigo sem productId continua igual ao formato de hoje", () => {
    const r = copiarItemPedido({ name: "Suco", quantity: 1, price: 9 });
    expect(r).not.toHaveProperty("productId");
  });
});
