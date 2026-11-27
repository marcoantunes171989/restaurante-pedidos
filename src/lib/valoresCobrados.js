// ════════════════════════════════════════════════════════════
//  Quanto cada pedido realmente custou ao cliente, para os relatórios.
//  O fechamento pelo servidor grava, em cada pagamento, os pedidos, a taxa e o total cobrado (migration 218);
//  a função app_valores_cobrados (migration 221) entrega isso ao painel. Aqui o valor de uma conta é repartido
//  entre os seus pedidos, em centavos, sem sobrar nem faltar.
// ════════════════════════════════════════════════════════════
import { emCentavos, funcaoAusente, resumoDosPedidos } from "./parametrosCaixa";
import { cobraTaxaServico } from "./taxaServico";
import { orderTotal } from "../pages/pdv/pdvHelpers";

/** Reparte `valor` (centavos) conforme os pesos; a sobra do arredondamento fica no último com peso. */
function repartir(valor, pesos) {
  const total = pesos.reduce((s, p) => s + p, 0);
  const partes = pesos.map((p) => (total > 0 ? Math.trunc((valor * p) / total) : 0));
  let ultimo = pesos.length - 1;
  while (ultimo > 0 && !(pesos[ultimo] > 0)) ultimo -= 1;
  partes[ultimo] += valor - partes.reduce((s, p) => s + p, 0);
  return partes;
}

/** Map(id do pedido → { total, taxa }) em reais. Conta com algum pedido não carregado fica de fora. */
export function distribuirPagamentos(composicoes, pedidos) {
  const porId = new Map((pedidos || []).map((o) => [String(o.id), o]));
  const mapa = new Map();
  for (const c of composicoes || []) {
    const doPagamento = (c?.pedidos || []).map((id) => porId.get(String(id)));
    if (!doPagamento.length || doPagamento.some((o) => !o) || !Number.isFinite(Number(c.total))) continue;
    const itens = doPagamento.map((o) => emCentavos(orderTotal(o)));
    const base = doPagamento.map((o, i) => (cobraTaxaServico(o.table) ? itens[i] : 0));
    const taxaTotal = emCentavos(c.taxaServico);
    const ajusteTotal = emCentavos(c.total) - itens.reduce((s, v) => s + v, 0) - taxaTotal; // acréscimo − descontos
    const taxas = repartir(taxaTotal, base.some((v) => v > 0) ? base : itens);
    const ajustes = repartir(ajusteTotal, itens);
    doPagamento.forEach((o, i) => mapa.set(String(o.id), { total: (itens[i] + taxas[i] + ajustes[i]) / 100, taxa: taxas[i] / 100 }));
  }
  return mapa;
}

/**
 * Anota `cobrado` nos pedidos: o valor gravado no pagamento; nos ainda não pagos, a conta com a taxa atual da empresa
 * (quando `percentualAberto` é conhecido). Venda antiga, sem valor gravado, fica como está.
 */
export function anotarCobranca(pedidos, mapa, percentualAberto = null) {
  return (pedidos || []).map((o) => {
    const gravado = mapa?.get(String(o.id));
    if (gravado) return { ...o, cobrado: gravado };
    if (o.paymentStatus === "paid" || percentualAberto === null) return o;
    const { total, taxa } = resumoDosPedidos([o], percentualAberto);
    return { ...o, cobrado: { total, taxa } };
  });
}

/** null = banco sem a migration 221. */
export async function buscarValoresCobrados(supabase, lojaId) {
  if (!supabase?.rpc) return null;
  const { data, error } = await supabase.rpc("app_valores_cobrados", { p_loja_id: lojaId ?? null });
  if (error) { if (funcaoAusente(error)) return null; throw error; }
  return Array.isArray(data) ? data : null;
}
