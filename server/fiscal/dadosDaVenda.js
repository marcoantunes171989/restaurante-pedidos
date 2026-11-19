// ════════════════════════════════════════════════════════════
//  Nota em cada venda (Etapa E8, parte 1) — monta os dados do XML NO
//  SERVIDOR a partir da venda que o caixa reservou (rascunho.venda).
//
//  Confiável (vem do banco, não do navegador): emitente e CNPJ da loja,
//  número/série/ambiente da reserva, pedidos pagos e seus itens.
//  O servidor confere a venda contra os pedidos antes de montar:
//   - pedidos da reserva = pedidos da venda, todos da loja e PAGOS;
//   - soma dos itens dos pedidos = valor dos produtos da venda;
//   - valor da nota = valor reservado.
//  Grava os dados uma vez (migration 184) — reenvios usam a mesma chave.
// ════════════════════════════════════════════════════════════

import { dadosNFeDaVenda } from "../../src/lib/fiscal/nfeDaVenda.js";
import { tabelaIbpt } from "./ibptTabela.js";

const CANCELADOS = new Set(["cancelado", "cancelled", "canceled"]);
const centavos = (v) => Math.round((Number(v) || 0) * 100);

/** Soma (centavos) dos itens válidos dos pedidos, como montarVendaFiscal calcula. */
export function somaItensPedidos(pedidos = []) {
  let total = 0;
  for (const p of pedidos) {
    if (CANCELADOS.has(String(p?.status ?? "").toLowerCase())) continue;
    for (const it of Array.isArray(p?.itens) ? p.itens : []) {
      const q = Number(it?.quantity ?? it?.quantidade ?? 0);
      if (!(q > 0)) continue;
      total += Math.round(centavos(it?.price ?? it?.valorUnitario) * q);
    }
  }
  return total;
}

/** Confere a venda do rascunho contra o documento reservado e os pedidos do banco. */
export function conferirVenda(doc, venda, pedidos) {
  if (!venda?.apto || !Array.isArray(venda.itens) || !venda.totais) return "VENDA_INVALIDA";
  const idsDoc = [...(doc.pedidos_ids || [])].map(String).sort();
  const idsVenda = [...(venda.pedidosIds || [])].map(String).sort();
  if (!idsDoc.length || idsDoc.join(",") !== idsVenda.join(",")) return "VENDA_DIVERGENTE";
  if (!Array.isArray(pedidos) || pedidos.length !== idsDoc.length) return "VENDA_DIVERGENTE";
  for (const p of pedidos) {
    if (Number(p.loja_id) !== Number(doc.loja_id)) return "VENDA_DIVERGENTE";
    if (CANCELADOS.has(String(p.status ?? "").toLowerCase())) continue;
    if (p.status_pagamento !== "pago") return "VENDA_NAO_PAGA";
  }
  const somaItensVenda = venda.itens.reduce((s, it) => s + centavos(it.valorBruto), 0);
  if (somaItensPedidos(pedidos) !== somaItensVenda || centavos(venda.totais.vProd) !== somaItensVenda) return "VENDA_DIVERGENTE";
  if (centavos(venda.totais.vNF) !== centavos(doc.valor_total)) return "VENDA_DIVERGENTE";
  return null;
}

/**
 * Devolve os dados gravados da nota, montando-os na primeira vez.
 * @returns {Promise<{ dados?: object, code?: string, detalhe?: string }>}
 */
export async function dadosDaNota(doc, deps, agora = new Date()) {
  const gravados = doc.rascunho?.dados;
  if (gravados?.ide) return { dados: gravados };
  const venda = doc.rascunho?.venda;
  if (!venda) return { code: "SEM_DADOS_NOTA" };
  if (doc.status !== "reservado") return { code: "STATUS_NAO_PERMITE" };

  const pedidos = await deps.pedidosDaNota(doc.id);
  const divergencia = conferirVenda(doc, venda, pedidos);
  if (divergencia) return { code: divergencia };

  const emitente = await deps.emitente(doc.loja_id);
  if (!emitente?.cnpj) return { code: "SEM_EMITENTE" };
  const r = dadosNFeDaVenda({
    venda, emitente: emitente.dados, documento: emitente.cnpj, modelo: Number(doc.modelo), serie: Number(doc.serie),
    numero: Number(doc.numero), ambiente: doc.ambiente, dhEmi: agora.toISOString(),
    cpfConsumidor: doc.rascunho?.cpf || "",
    // NF-e (55): destinatário completo digitado no caixa (E8 parte 3).
    destinatario: doc.rascunho?.dest || null,
    // Tributos aproximados (Lei 12.741) pela tabela IBPT da UF da loja, se existir.
    ibpt: (deps.tabelaIbpt || tabelaIbpt)(emitente.dados?.uf),
  });
  if (!r.ok) return { code: "XML_INVALIDO", detalhe: String(r.erro || "").slice(0, 200) };
  const g = await deps.salvarDados({ documentoId: doc.id, chave: r.chave, dados: r.dados });
  if (!g?.ok) return { code: g?.code || "DADOS_DIVERGENTES" };
  return { dados: g.dados };
}
