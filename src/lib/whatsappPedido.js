export function normalizarNumeroWhatsApp(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.startsWith("55") ? digitos.slice(0, 13) : `55${digitos}`.slice(0, 13);
}

export function numeroWhatsAppValido(numero) {
  const digitos = normalizarNumeroWhatsApp(numero);
  return /^55\d{10,11}$/.test(digitos);
}

function detalhesItem(item) {
  return [
    item.removedIngredients?.length ? `Sem: ${item.removedIngredients.join(", ")}` : "",
    item.extraIngredients?.length ? `Adicionais: ${item.extraIngredients.join(", ")}` : "",
    item.selectedOptions?.length ? `Opções: ${item.selectedOptions.map((o) => o.nome || o.name || o.label || o).join(", ")}` : "",
    item.observation ? `Obs.: ${item.observation}` : "",
  ].filter(Boolean);
}

export function montarMensagemPedidoWhatsApp({ pedido, pedidoId, total, formaPagamento, momentoPagamento, introducao }) {
  const linhas = [
    introducao?.trim() || `Olá! Fiz um pedido pelo cardápio digital da ${pedido.lojaNome || "loja"}.`,
    "",
    `*PEDIDO ${pedidoId || pedido.id || ""}*`,
    `Cliente: ${pedido.customer || "Cliente"}`,
    `WhatsApp do cliente: ${pedido.clienteTelefone || "Não informado"}`,
    `Modalidade: ${String(pedido.table || "Pedido externo").replace(/^Externo\s*·\s*/i, "")}`,
    "",
    "*ITENS*",
  ];
  (pedido.items || []).forEach((item) => {
    linhas.push(`${item.quantity}x ${item.name} — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(item.price) || 0) * (Number(item.quantity) || 0))}`);
    detalhesItem(item).forEach((d) => linhas.push(`  ${d}`));
  });
  linhas.push("", `*Total: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(total) || 0)}*`);
  if (formaPagamento) linhas.push(`Pagamento: ${formaPagamento}${momentoPagamento ? ` — ${momentoPagamento}` : ""}`);
  linhas.push("", "Aguardo a confirmação e as orientações para dar continuidade ao atendimento.");
  return linhas.join("\n");
}

export function criarUrlPedidoWhatsApp(numero, dados) {
  const destino = normalizarNumeroWhatsApp(numero);
  if (!numeroWhatsAppValido(destino)) return "";
  return `https://wa.me/${destino}?text=${encodeURIComponent(montarMensagemPedidoWhatsApp(dados))}`;
}
