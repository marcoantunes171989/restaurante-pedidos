// ════════════════════════════════════════════════════════════
//  Nota em cada venda no caixa (Etapa E8, parte 1)
//
//  Depois que o pagamento é finalizado, em segundo plano:
//   1) monta a venda fiscal (conferência completa) — se tiver pendência,
//      NÃO reserva número (nada é gasto) e avisa o caixa;
//   2) reserva a NFC-e com chave de idempotência derivada dos pedidos
//      (a mesma venda nunca gera duas notas, mesmo com clique duplo);
//   3) pede ao servidor para emitir — o servidor monta e confere a nota;
//   4) SEFAZ fora/sem resposta → contingência off-line da NFC-e.
//  NUNCA trava nem desfaz a venda: qualquer falha vira um aviso.
//
//  Ligado só com VITE_FISCAL_EMISSAO_PDV=true (desligado por padrão: em
//  PROD lojas têm NFC-e "habilitada" em simulação) e com o emitente em
//  homologação ou produção (simulação não emite).
// ════════════════════════════════════════════════════════════

import { montarVendaFiscal } from "./vendaFiscal.js";
import { reservarDocumentoFiscal } from "./fiscalApi.js";

export function emissaoPdvAtivaPorEnv(env) {
  return String(env?.VITE_FISCAL_EMISSAO_PDV ?? "").trim().toLowerCase() === "true";
}
export const EMISSAO_FISCAL_PDV_ATIVA = (() => {
  try { return emissaoPdvAtivaPorEnv(import.meta.env); } catch { return false; }
})();

export const JUSTIFICATIVA_CONTINGENCIA = "SEFAZ indisponivel no momento da venda";

/** Ambiente em que a loja emite NFC-e, ou null (simulação / não habilitada). */
export function ambienteNfceDaLoja(emitente) {
  if (!emitente || emitente.nfceHabilitada !== true) return null;
  return ["homologacao", "producao"].includes(emitente.nfceAmbiente) ? emitente.nfceAmbiente : null;
}

/** UUID estável da venda: SHA-256 de loja + pedidos (ordenados). */
export async function chaveIdempotenciaVenda(lojaId, pedidosIds = [], subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("Navegador sem criptografia para gerar a chave da venda.");
  const base = `pp-venda-fiscal:v1:${lojaId}:${[...pedidosIds].map(String).sort().join(",")}`;
  const h = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(base)));
  h[6] = (h[6] & 0x0f) | 0x50; // versão 5 (derivado por hash)
  h[8] = (h[8] & 0x3f) | 0x80; // variante RFC 4122
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** POST na API fiscal que devolve a resposta mesmo quando a nota não foi autorizada. */
export async function postarApiFiscal(supabase, corpo, { fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const { data } = (await supabase?.auth?.getSession?.()) || {};
  const token = data?.session?.access_token;
  if (!token) return { ok: false, code: "SEM_LOGIN", erro: "Faça login novamente para emitir a nota." };
  let resp;
  try {
    resp = await fetchFn("/api/fiscal-emitir", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo || {}),
    });
  } catch {
    return { ok: false, code: "REDE", erro: "Sem conexão com o servidor." };
  }
  try { return (await resp.json()) || { ok: false, code: `HTTP_${resp.status}` }; } catch { return { ok: false, code: `HTTP_${resp.status}`, erro: "Resposta inválida do servidor." }; }
}

/**
 * Resultado para a tela: { estado: 'autorizada'|'contingencia'|'pendente'|'erro'|'fora', titulo, detalhe?, numero? }
 * 'fora' = a loja não emite nota (nada a mostrar).
 */
export async function emitirNotaDaVenda({
  supabase, emitente, pedidos = [], produtos = [], composicao = {}, pagamento = {}, formas = [],
  config = {}, ctxFiscal = {}, cpf = "", ativo = EMISSAO_FISCAL_PDV_ATIVA, fetchFn, subtle,
} = {}) {
  const ambiente = ativo ? ambienteNfceDaLoja(emitente) : null;
  if (!ambiente) return { estado: "fora" };

  let venda;
  try {
    venda = montarVendaFiscal({
      pedidos, produtos, formas, ctxFiscal,
      ajustes: composicao || {}, regras: config?.regras || {}, mapaMeios: config?.mapaMeios || {},
      pagamento: { total: pagamento.total, troco: pagamento.troco, detalhes: pagamento.detalhes || [] },
    });
  } catch {
    return { estado: "erro", titulo: "Nota fiscal não emitida", detalhe: "Erro ao montar a nota da venda." };
  }
  if (!venda.apto) {
    const lista = [...(venda.pendencias || []), ...(venda.itens || []).flatMap((it) => it.pendencias || [])];
    return { estado: "pendente", titulo: "Nota fiscal não emitida: venda com pendência", detalhe: lista.slice(0, 3).join(" ") };
  }

  let reserva;
  try {
    const idempotencyKey = await chaveIdempotenciaVenda(venda.lojaId, venda.pedidosIds, subtle);
    reserva = await reservarDocumentoFiscal(supabase, {
      lojaId: venda.lojaId, modelo: 65, ambiente, idempotencyKey,
      rascunho: { versao: 1, origem: "pdv", venda, cpf: String(cpf || "").replace(/\D/g, "") },
      pedidosIds: venda.pedidosIds, valorTotal: venda.totais.vNF, qtdItens: venda.itens.length,
    });
  } catch (e) {
    return { estado: "erro", titulo: "Nota fiscal não emitida", detalhe: e?.message || "Não foi possível reservar o número da nota." };
  }

  const opts = fetchFn ? { fetchFn } : {};
  const r = await postarApiFiscal(supabase, { acao: "emitir", documentoId: reserva.documentoId }, opts);
  if (r.ok && r.situacao === "autorizada") return { estado: "autorizada", titulo: `NFC-e nº ${r.numero ?? reserva.numero} autorizada`, numero: r.numero ?? reserva.numero, documentoId: reserva.documentoId };
  if (r.situacao === "rejeitada") return { estado: "erro", titulo: `NFC-e nº ${reserva.numero} rejeitada`, detalhe: [r.cStat, r.xMotivo].filter(Boolean).join(" — "), documentoId: reserva.documentoId };
  // Resposta de "já foi para a contingência" (repetição): a nota que vale é a de contingência.
  if (r.code === "EM_CONTINGENCIA") return { estado: "contingencia", titulo: "Nota emitida em contingência", detalhe: "Será enviada à SEFAZ automaticamente.", documentoId: r.contingenciaDocumentoId };

  if (r.podeContingencia) {
    const c = await postarApiFiscal(supabase, { acao: "contingencia", documentoId: reserva.documentoId, xJust: JUSTIFICATIVA_CONTINGENCIA }, opts);
    if (c.ok) return { estado: "contingencia", titulo: `NFC-e nº ${c.numero} em contingência`, numero: c.numero, detalhe: "SEFAZ fora do ar: a nota vale e será enviada depois.", documentoId: c.documentoId };
    return { estado: "erro", titulo: "Nota fiscal pendente", detalhe: c.erro || "SEFAZ fora do ar e a contingência falhou. Veja em Notas emitidas.", documentoId: reserva.documentoId };
  }
  return { estado: "erro", titulo: "Nota fiscal pendente", detalhe: r.erro || r.xMotivo || "Não foi possível emitir agora. Veja em Notas emitidas.", documentoId: reserva.documentoId };
}
