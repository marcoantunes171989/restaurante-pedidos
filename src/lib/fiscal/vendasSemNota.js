// ════════════════════════════════════════════════════════════
//  Vendas PAGAS que ainda não têm nota fiscal (para emitir a NFC-e depois, pela tela "Vendas sem nota").
//  Funções puras: recebem os pedidos da loja e as notas já reservadas/emitidas e devolvem o que falta.
//  Regra de ouro: pedido que já consta em QUALQUER nota (autorizada, rejeitada, descartada…) não aparece aqui — a nota dele se resolve em
//  Notas emitidas. E emitir de novo nunca duplica: a chave de idempotência da reserva vem dos pedidos.
// ════════════════════════════════════════════════════════════

import { composicaoDaConta } from "./vendaFiscal.js";
import { cobraTaxaServico } from "../taxaServico.js";

const CANCELADO = new Set(["cancelled", "cancelado", "canceled"]);
const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;

export const subtotalDoPedido = (o) => reais((o?.items || []).reduce((s, it) => s + centavos((Number(it.price) || 0) * (Number(it.quantity) || 0)), 0));

/** ids de pedidos que já têm nota (qualquer situação). */
export function pedidosComNota(documentos = []) {
  const ids = new Set();
  for (const d of documentos) for (const id of d?.pedidosIds || []) ids.add(String(id));
  return ids;
}

/**
 * Pedidos pagos da loja, sem nota, do período. Mais recentes primeiro.
 * @param {{ orders:object[], documentos:object[], lojaId:number, desde?:Date|string|number|null }} p
 */
export function vendasSemNota({ orders = [], documentos = [], lojaId, desde = null } = {}) {
  const cobertos = pedidosComNota(documentos);
  const ini = desde ? new Date(desde).getTime() : null;
  return orders
    .filter((o) => o && (lojaId == null || o.lojaId == null || Number(o.lojaId) === Number(lojaId)))
    .filter((o) => o.paymentStatus === "paid" && !CANCELADO.has(String(o.status || "").toLowerCase()))
    .filter((o) => (o.items || []).length > 0 && subtotalDoPedido(o) > 0)
    .filter((o) => !cobertos.has(String(o.id)))
    .filter((o) => ini == null || !o.createdAtISO || new Date(o.createdAtISO).getTime() >= ini)
    .map((o) => ({
      id: String(o.id), pedido: o, mesa: o.table || "", comanda: o.command || "", quando: o.createdAtISO || null,
      subtotal: subtotalDoPedido(o), itens: (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0), forma: o.pagamentoForma || "",
    }))
    .sort((a, b) => String(b.quando || "").localeCompare(String(a.quando || "")));
}

/** Total da nota: subtotal + taxa de serviço − desconto (em centavos, sem erro de ponto flutuante). */
export function totaisDaEmissao({ subtotal = 0, taxa = 0, desconto = 0 } = {}) {
  const sub = centavos(subtotal), tx = Math.max(0, centavos(taxa)), ds = Math.max(0, centavos(desconto));
  return { subtotal: reais(sub), taxa: reais(tx), desconto: reais(ds), total: reais(Math.max(0, sub + tx - ds)) };
}

/** Taxa de serviço sugerida pela configuração da loja (editável na tela): percentual sobre o subtotal, ou 0. */
export function taxaSugerida(subtotal, cfg = {}) {
  const liga = cfg?.enabled !== false && cfg?.chargingRule !== "nao_cobrar";
  const pct = Number(cfg?.percent);
  return liga && pct > 0 ? reais(Math.round(centavos(subtotal) * pct / 100)) : 0;
}

/** Taxa sugerida para um conjunto de vendas: só entra a de consumo no local (entrega e retirada do cardápio externo não têm taxa). */
export function taxaSugeridaDasVendas(vendas = [], cfg = {}) {
  return reais(vendas.reduce((s, v) => s + (cobraTaxaServico(v.mesa) ? centavos(taxaSugerida(v.subtotal, cfg)) : 0), 0));
}

/** As formas de pagamento têm de somar EXATAMENTE o total da nota. */
export function conferirPagamentos(total, linhas = []) {
  const soma = linhas.reduce((s, l) => s + centavos(l?.valor), 0);
  const falta = centavos(total) - soma;
  const semForma = linhas.some((l) => centavos(l?.valor) > 0 && !String(l?.forma || "").trim());
  return { ok: falta === 0 && soma > 0 && !semForma, soma: reais(soma), diferenca: reais(falta), semForma };
}

/** Forma que o caixa gravou no pedido ("PIX", "Dinheiro + Pontos"): sugere a linha de pagamento. Só uma forma conhecida vira sugestão. */
export function pagamentoSugerido(selecionadas = [], formas = []) {
  const nomes = new Set(selecionadas.map((v) => String(v.forma || "").trim().toLowerCase()).filter(Boolean));
  if (nomes.size !== 1) return "";
  const [nome] = [...nomes];
  return formas.find((f) => String(f.nome).trim().toLowerCase() === nome.toLowerCase())?.nome || "";
}

/** Dados prontos para emitirNotaDaVenda (a mesma montagem do PDV: composição + pagamento). */
export function dadosDaEmissao({ selecionadas = [], taxa = 0, desconto = 0, linhas = [] } = {}) {
  const sub = reais(selecionadas.reduce((s, v) => s + centavos(v.subtotal), 0));
  const t = totaisDaEmissao({ subtotal: sub, taxa, desconto });
  return {
    pedidos: selecionadas.map((v) => v.pedido),
    composicao: composicaoDaConta({ subtotal: t.subtotal, taxaServico: t.taxa, descontoManual: t.desconto }),
    pagamento: { total: t.total, troco: 0, detalhes: linhas.filter((l) => centavos(l.valor) > 0).map((l) => ({ forma: String(l.forma).trim(), valor: reais(centavos(l.valor)) })) },
    totais: t,
  };
}
