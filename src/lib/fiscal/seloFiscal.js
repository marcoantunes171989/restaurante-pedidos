// ════════════════════════════════════════════════════════════
//  Selo "Nota fiscal" da conta no PDV (Etapa 1c) — só PRÉVIA
//
//  Mostra ao caixa, antes de fechar, se a venda já teria tudo para virar
//  nota fiscal ou o que falta. NÃO emite, NÃO bloqueia o fechamento, NÃO
//  grava nada. Só aparece para lojas com NFC-e ou NF-e habilitada no
//  cadastro fiscal (loja_fiscal_emitente) — as demais não veem diferença.
// ════════════════════════════════════════════════════════════

import { montarVendaFiscal } from "./vendaFiscal.js";

/**
 * Chave de ativação da prévia (build-time), no padrão de PAYMENT_V2_ENABLED.
 * Desligada por padrão: em PROD, 3 lojas já têm NFC-e "habilitada" em modo
 * simulação, e o selo não deve aparecer para elas antes da configuração
 * fiscal de venda existir. Ligar só em DEV/HML: VITE_FISCAL_PREVIA_PDV=true.
 */
export function previaFiscalAtivaPorEnv(env) {
  return String(env?.VITE_FISCAL_PREVIA_PDV ?? "").trim().toLowerCase() === "true";
}
export const PREVIA_FISCAL_PDV_ATIVA = (() => {
  try { return previaFiscalAtivaPorEnv(import.meta.env); } catch { return false; }
})();

/** O emitente habilitou algum documento fiscal? */
export function lojaEmiteNota(emitente) {
  return !!(emitente && (emitente.nfceHabilitada === true || emitente.nfeHabilitada === true));
}

/**
 * @param {object}   p
 * @param {object}   p.emitente   emitente da loja (dbParaEmitente).
 * @param {object[]} p.pedidos    pedidos da conta selecionada.
 * @param {object[]} p.produtos   produtos da loja.
 * @param {object}   p.composicao composicaoDaConta(...) da conta.
 * @param {object[]} [p.pagamentos] parcelas já lançadas [{ forma, valor }].
 * @param {object[]} [p.formas]   formas cadastradas.
 * @param {object}   [p.config]   { mapaMeios, regras } — configuração fiscal de venda da loja.
 * @param {object}   [p.ctxFiscal] contexto do resolverFiscalProduto.
 * @returns {null | { estado:'pronta'|'pendente', titulo:string, pendencias:string[] }}
 */
export function seloFiscalDaConta({
  emitente = null, pedidos = [], produtos = [], composicao = {}, pagamentos = [],
  formas = [], config = {}, ctxFiscal = {}, ativo = true,
} = {}) {
  if (!ativo || !lojaEmiteNota(emitente) || !Array.isArray(pedidos) || pedidos.length === 0) return null;
  let venda;
  try {
    venda = montarVendaFiscal({
      pedidos, produtos, formas, ctxFiscal, parcial: true,
      ajustes: composicao || {}, regras: config?.regras || {}, mapaMeios: config?.mapaMeios || {},
      pagamento: { total: composicao?.total, detalhes: pagamentos || [] },
    });
  } catch {
    return { estado: "pendente", titulo: "Nota fiscal: não foi possível conferir", pendencias: ["Erro ao montar a prévia fiscal."] };
  }
  const lista = [...(venda.pendencias || [])];
  for (const it of venda.itens || []) {
    for (const p of it.pendencias || []) lista.push(p.includes(it.nome) ? p : `${it.nome}: ${p}`);
  }
  const pendencias = [...new Set(lista)];
  if (pendencias.length === 0) return { estado: "pronta", titulo: "Nota fiscal: pronta", pendencias };
  return {
    estado: "pendente",
    titulo: `Nota fiscal: ${pendencias.length} ${pendencias.length === 1 ? "pendência" : "pendências"}`,
    pendencias,
  };
}
