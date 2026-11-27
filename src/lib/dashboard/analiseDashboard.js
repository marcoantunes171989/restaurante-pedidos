/** Regras exclusivas do Dashboard: situação do momento e prioridades. */
import { CANAIS, canalDoPedido, ehCancelado, variacaoPct } from "../relatorios/analiseVendas.js";

/** Mesas de salão com pedido ainda não pago (externo e balcão não contam). */
export function mesasAbertasAgora(orders) {
  const abertas = (orders || []).filter((o) => (
    o.paymentStatus !== "paid" && !ehCancelado(o) && o.table && canalDoPedido(o) === CANAIS[0]
  ));
  return new Set(abertas.map((o) => o.table)).size;
}

export function clientesNoPeriodo(orders) {
  return new Set((orders || []).filter((o) => !ehCancelado(o)).map((o) => o.clienteTelefone || o.customer).filter(Boolean)).size;
}

/**
 * Lista de ações derivada somente do que os dados mostram. Os números ficam
 * nos indicadores; aqui vai apenas o que fazer e para onde ir.
 * `atual` e `anterior` são resultados de resumoVendas().
 */
export function prioridades({ atual, anterior = null, semEstoque = 0 }) {
  const lista = [];
  if (atual.aguardando.qtd > 0) {
    lista.push({ id: "conta", prio: "alta", titulo: "Receber quem já pediu a conta", texto: "Há contas aguardando pagamento no caixa." });
  }
  if (atual.emAberto.qtd > 0) {
    lista.push({ id: "abertos", prio: "media", titulo: "Acompanhar pedidos em aberto", texto: "Confira se algum ficou parado antes do fechamento." });
  }
  if (semEstoque > 0) {
    lista.push({ id: "estoque", prio: "alta", titulo: "Repor o estoque", texto: "Há produtos zerados ou abaixo do mínimo cadastrado.", destino: "estoque" });
  }
  if (anterior) {
    if (atual.cancelados.qtd > anterior.cancelados.qtd) {
      lista.push({ id: "cancelados", prio: "media", titulo: "Entender os cancelamentos", texto: "Houve mais cancelamentos que no período anterior.", destino: "cupom" });
    }
    const fat = variacaoPct(atual.faturamento, anterior.faturamento);
    if (fat != null && fat < 0) {
      lista.push({ id: "faturamento", prio: "media", titulo: "Reagir à queda de vendas", texto: "O faturamento está abaixo do período anterior.", destino: "geral" });
    }
    const ticket = variacaoPct(atual.ticket, anterior.ticket);
    if (ticket != null && ticket < 0) {
      lista.push({ id: "ticket", prio: "baixa", titulo: "Oferecer adicionais e combos", texto: "O ticket médio caiu em relação ao período anterior.", destino: "vendas" });
    }
  }
  const ordem = { alta: 0, media: 1, baixa: 2 };
  return lista.sort((a, b) => ordem[a.prio] - ordem[b.prio]);
}
