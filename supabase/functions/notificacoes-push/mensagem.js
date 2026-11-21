// ════════════════════════════════════════════════════════════
//  Texto das notificações push de pedido — função PURA (sem Deno/IO),
//  usada pela Edge Function notificacoes-push e testada pelo vitest
//  (tests/notificacoes/mensagem.test.js).
//
//  Objetivo: quem vê a notificação na tela bloqueada já sabe QUAL loja,
//  QUE tipo de pedido, ONDE (mesa/cliente) e QUANTO vale — sem abrir o app.
// ════════════════════════════════════════════════════════════

const SEM_TAXA = /^Externo · (Retirada|Entrega)\b/i;

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Classifica o pedido a partir do rótulo gravado em tab_pedidos.mesa. */
export function classificarPedido(mesa, comanda) {
  const m = String(mesa ?? "").trim();
  const externo = /^Externo\b/i.test(m) || /^EXT-/.test(String(comanda ?? ""));
  if (externo) {
    const tipo = /retirada/i.test(m) ? "Retirada" : /entrega/i.test(m) ? "Entrega" : "Delivery";
    return { tipo, externo: true, local: "" };
  }
  const local = /^mesa\b/i.test(m) ? m : m ? `Mesa ${m}` : "";
  return { tipo: "Mesa", externo: false, local };
}

/** Total cobrado: itens + 10% de serviço, exceto retirada/entrega externa
 * (mesma regra de src/lib/taxaServico.js / totalComTaxa do App). */
export function totalDoPedido(itens, mesa) {
  const soma = (Array.isArray(itens) ? itens : []).reduce(
    (s, i) => s + (Number(i?.price) || 0) * (Number(i?.quantity) || 0), 0);
  return soma * (SEM_TAXA.test(String(mesa ?? "").trim()) ? 1 : 1.1);
}

function qtdItens(itens) {
  return (Array.isArray(itens) ? itens : []).reduce((s, i) => s + (Number(i?.quantity) || 0), 0);
}

/**
 * @param {{evento:'novo_pedido'|'caixa_aguardando', pedido:object, lojaNome?:string, numero?:number|string}} p
 * @returns {{titulo:string, corpo:string}}
 */
export function montarMensagemPedido({ evento, pedido, lojaNome, numero }) {
  const { tipo, local } = classificarPedido(pedido?.mesa, pedido?.comanda);
  const cliente = String(pedido?.cliente || "").trim();
  const clienteUtil = cliente && !/^visitante$/i.test(cliente) ? cliente : "";
  const n = Number(qtdItens(pedido?.itens));
  const valor = totalDoPedido(pedido?.itens, pedido?.mesa);
  const num = numero ? ` #${numero}` : "";

  // "Mesa 5" / "Retirada" / "Entrega" — o que mais importa a quem atende.
  const destino = local || tipo;
  const titulo = evento === "caixa_aguardando"
    ? `💳 Pagamento aguardando${num} · ${destino}`
    : `🛎️ Novo pedido${num} · ${destino}`;

  const partes = [];
  if (lojaNome) partes.push(lojaNome);
  if (tipo !== "Mesa") partes.push(tipo);
  if (clienteUtil) partes.push(clienteUtil);
  if (n > 0) partes.push(`${n} ${n === 1 ? "item" : "itens"}`);
  if (valor > 0) partes.push(brl(valor));
  const corpo = partes.join(" · ") || (evento === "caixa_aguardando" ? "Pedido enviado para o Caixa" : "Pedido aguardando atendimento");
  return { titulo, corpo };
}
