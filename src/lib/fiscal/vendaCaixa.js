// ════════════════════════════════════════════════════════════
//  Venda Balcão (migration 208): o registro do que o caixa cobrou em cada venda e a lista das vendas que ainda podem virar nota.
//  A nota emitida depois usa EXATAMENTE os itens, valores e formas de pagamento gravados no fechamento: nada é editável.
// ════════════════════════════════════════════════════════════
import { pedidosComNota, tentativasDescartadas, subtotalDoPedido } from "./vendasSemNota.js";

const CANCELADO = new Set(["cancelled", "cancelado", "canceled"]);
export const ROTULO_TIPO = Object.freeze({ balcao: "Venda Balcão", nfce: "NFC-e", nfe: "NF-e" });

const rpcAusente = (e) => e?.code === "PGRST202" || e?.code === "42883" || /could not find the function|does not exist/i.test(e?.message || "");
const MENSAGENS = {
  SEM_PERMISSAO: "Sem permissão de caixa nesta empresa.",
  DADOS_INVALIDOS: "Dados da venda inválidos.",
  VALORES_NAO_CONFEREM: "Os valores da venda não conferem.",
  PEDIDO_NAO_PAGO: "Há pedido da venda que não consta como pago.",
};

/** Só o que a nota precisa de cada pedido (sem telefone nem outros dados do cliente). */
export function pedidosParaRegistro(pedidos = []) {
  return pedidos.map((o) => ({
    id: String(o.id), lojaId: o.lojaId ?? null, table: o.table || "", command: o.command || "",
    items: (o.items || []).map((it) => ({
      productId: it.productId ?? it.produtoId ?? null, name: it.name ?? it.nome ?? "",
      price: Number(it.price ?? it.valorUnitario) || 0, quantity: Number(it.quantity ?? it.quantidade) || 0,
    })),
  }));
}

/** Grava a venda fechada. Nunca lança: devolve { ok } ou { ok:false, erro, migracaoPendente? }. */
export async function registrarVendaCaixa(supabase, { lojaId, codigo, tipo, mesa = "", pedidos = [], composicao, pagamento } = {}) {
  if (!supabase?.rpc || lojaId == null) return { ok: false, erro: "Sem conexão com o banco." };
  try {
    const { data, error } = await supabase.rpc("app_venda_caixa_registrar", {
      p_loja_id: lojaId,
      p_venda: { codigo, tipo, mesa, composicao, pagamento, pedidos: pedidosParaRegistro(pedidos) },
    });
    if (error) return rpcAusente(error) ? { ok: false, migracaoPendente: true, erro: "Registro de vendas não instalado no banco (migration 208)." } : { ok: false, erro: "Não foi possível guardar a venda." };
    return data?.ok ? { ok: true, existente: data.existente === true } : { ok: false, erro: MENSAGENS[data?.code] || "Não foi possível guardar a venda." };
  } catch {
    return { ok: false, erro: "Não foi possível guardar a venda." };
  }
}

export async function listarVendasCaixa(supabase, lojaId, desde = null) {
  if (!supabase?.rpc || lojaId == null) return { ok: false, vendas: [], erro: "Sem conexão com o banco." };
  try {
    const { data, error } = await supabase.rpc("app_venda_caixa_listar", { p_loja_id: lojaId, p_desde: desde ? new Date(desde).toISOString() : null });
    if (error) return rpcAusente(error) ? { ok: false, vendas: [], migracaoPendente: true, erro: "Registro de vendas não instalado no banco (migration 208)." } : { ok: false, vendas: [], erro: "Não foi possível ler as vendas do caixa." };
    if (!data?.ok) return { ok: false, vendas: [], erro: MENSAGENS[data?.code] || "Não foi possível ler as vendas do caixa." };
    return { ok: true, vendas: Array.isArray(data.vendas) ? data.vendas : [] };
  } catch {
    return { ok: false, vendas: [], erro: "Não foi possível ler as vendas do caixa." };
  }
}

const somaItens = (pedidos) => pedidos.reduce((s, o) => s + (o.items || []).reduce((q, it) => q + (Number(it.quantity) || 0), 0), 0);

/**
 * Vendas pagas SEM nota fiscal: primeiro as registradas pelo caixa (com valores travados) e depois os pedidos pagos sem registro
 * (anteriores à migration 208): esses aparecem para consulta, mas não podem virar nota por aqui.
 */
export function vendasDoBalcao({ registros = [], orders = [], documentos = [], lojaId, desde = null } = {}) {
  const cobertos = pedidosComNota(documentos);
  const ini = desde ? new Date(desde).getTime() : null;
  const doPeriodo = (iso) => ini == null || !iso || new Date(iso).getTime() >= ini;
  const porId = new Map(orders.map((o) => [String(o.id), o]));
  const registrados = new Set();
  const saida = [];

  for (const r of registros) {
    const ids = (r?.pedidos_ids || []).map(String);
    ids.forEach((id) => registrados.add(id));
    if (!ids.length || ids.some((id) => cobertos.has(id))) continue;
    if (ids.some((id) => CANCELADO.has(String(porId.get(id)?.status || "").toLowerCase()))) continue;
    if (!doPeriodo(r.criado_em)) continue;
    const pedidos = r.pedidos || [];
    saida.push({
      id: `v:${r.codigo}`, codigo: r.codigo, registrada: true, pedidosIds: ids, pedidos,
      composicao: r.composicao, pagamento: r.pagamento, total: Number(r.total) || 0, tipo: r.tipo_escolhido || "balcao",
      mesa: r.mesa || pedidos[0]?.table || "", comandas: [...new Set(pedidos.map((o) => o.command).filter(Boolean))],
      quando: r.criado_em || null, itens: somaItens(pedidos), tentativa: tentativasDescartadas(documentos, ids),
    });
  }

  for (const o of orders) {
    if (!o || (lojaId != null && o.lojaId != null && Number(o.lojaId) !== Number(lojaId))) continue;
    const id = String(o.id);
    if (o.paymentStatus !== "paid" || CANCELADO.has(String(o.status || "").toLowerCase())) continue;
    if (registrados.has(id) || cobertos.has(id) || !((o.items || []).length > 0 && subtotalDoPedido(o) > 0) || !doPeriodo(o.createdAtISO)) continue;
    saida.push({
      id: `p:${id}`, codigo: null, registrada: false, pedidosIds: [id], pedidos: [o], composicao: null, pagamento: null,
      total: subtotalDoPedido(o), tipo: null, mesa: o.table || "", comandas: o.command ? [o.command] : [], forma: o.pagamentoForma || "",
      quando: o.createdAtISO || null, itens: somaItens([o]), tentativa: 0,
    });
  }
  return saida.sort((a, b) => String(b.quando || "").localeCompare(String(a.quando || "")));
}
