// ════════════════════════════════════════════════════════════
//  Item do pedido — formato persistido em tab_pedidos.itens (jsonb)
//
//  Fonte única para os canais INTERNOS (tablet/garçom, PDV, separar itens)
//  montarem o item gravado. Acrescenta `productId` — a mesma chave que o
//  cardápio público V2 (migration 134) já grava no servidor — para que a nota
//  fiscal ache o produto (NCM/regra fiscal) sem depender do nome.
//  Aditivo: itens antigos sem productId continuam válidos em todas as telas.
// ════════════════════════════════════════════════════════════

/** Id do produto de um item (gravado ou de carrinho). null se não houver. */
export function produtoIdDoItem(item) {
  if (!item || typeof item !== "object") return null;
  const bruto = item.productId ?? item.produtoId ?? item.id ?? null;
  if (bruto == null || bruto === "") return null;
  const n = typeof bruto === "number" ? bruto : (/^\d+$/.test(String(bruto).trim()) ? Number(bruto) : NaN);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function comProductId(item, base) {
  const pid = produtoIdDoItem(item);
  return pid != null ? { productId: pid, ...base } : base;
}

/** Carrinho (produto + escolhas) → item gravado no pedido. */
export function itemPersistidoDoCarrinho(i) {
  return comProductId(i, {
    name: i.name, quantity: i.quantity, price: i.price,
    selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients,
    extraIngredients: i.extraIngredients, selectedOptions: i.selectedOptions || [],
    observation: i.observation,
  });
}

// Recusas do banco ao gravar itens (migration 217). O nome do item vem em `details`.
const RECUSAS_DE_ITEM = [
  ["item_preco_abaixo_do_cadastro", (n) => `O preço de ${n} está abaixo do cadastro. Atualize a tela e inclua o item novamente.`],
  ["item_sem_produto_no_cadastro", (n) => `${n} não está no cadastro de produtos desta empresa. Inclua o item pela lista de produtos.`],
  ["item_invalido", (n) => `Confira a quantidade e o preço de ${n}.`],
];

/** Mensagem para o usuário quando o banco recusa um item; null se o erro for outro. */
export function mensagemDeItemRecusado(erro) {
  const texto = String(erro?.message || "");
  const achada = RECUSAS_DE_ITEM.find(([codigo]) => texto.includes(codigo));
  if (!achada) return null;
  const nome = String(erro?.details || "").trim();
  return achada[1](nome ? `"${nome}"` : "um item");
}

/**
 * Cópia de um item já gravado (separar/transferir itens). Só productId gravado
 * conta — `id` aqui pode ser de outra coisa, então não é usado.
 */
export function copiarItemPedido(it) {
  const pid = produtoIdDoItem({ productId: it?.productId ?? it?.produtoId });
  const base = {
    name: it.name, quantity: it.quantity, price: it.price,
    selectedIngredients: it.selectedIngredients || [],
    removedIngredients: it.removedIngredients || [],
    extraIngredients: it.extraIngredients || [],
    observation: it.observation || "",
    selectedOptions: it.selectedOptions || [],
  };
  return pid != null ? { productId: pid, ...base } : base;
}
