// ════════════════════════════════════════════════════════════
//  Prazo legal de cancelamento da NFC-e (modelo 65).
//
//  Base: Ajuste SINIEF 19/16, cláusula décima quinta (redação do Ajuste SINIEF 07/18, efeitos desde 01.10.2018):
//   • o emitente pode cancelar a NFC-e "em prazo não superior a 30 minutos, podendo ser reduzido a critério de cada unidade federada,
//     contado do momento em que foi concedida a Autorização de Uso", desde que NÃO tenha havido a saída da mercadoria;
//   • a UF só pode REDUZIR o prazo (nunca ampliar): por isso 30 minutos é o teto para todos os estados;
//   • § 6º: a critério da UF, em casos excepcionais, pode haver cancelamento extemporâneo — fora do sistema, por pedido ao fisco
//     (em SP: pedido de regularização / denúncia espontânea no Posto Fiscal, via SIPET — Resposta à Consulta 30118/2024).
//   • Cláusula décima quinta-A: cancelamento por SUBSTITUIÇÃO (venda coberta por NFC-e em contingência): até 168 horas.
//  Conferido: SP = 30 min (RC 30118/2024); MG = 30 min (SPED-MG). Para as demais UFs vale o teto de 30 min até a UF publicar prazo menor:
//  se alguma publicar, basta informar a UF em PRAZO_POR_UF (em minutos).
// ════════════════════════════════════════════════════════════

export const PRAZO_CANCELAMENTO_NFCE_PADRAO_MIN = 30;
/** Prazos menores que 30 min adotados por uma UF (minutos). Vazio: nenhuma UF com redução confirmada. */
export const PRAZO_POR_UF = Object.freeze({});
export const PRAZO_SUBSTITUICAO_NFCE_HORAS = 168;
export const FUNDAMENTO_CANCELAMENTO_NFCE = "Ajuste SINIEF 19/16, cláusula 15: até 30 minutos da autorização de uso, desde que a mercadoria não tenha saído (a UF pode reduzir, nunca ampliar).";

/** Prazo em minutos para a UF (nunca maior que 30). */
export function prazoCancelamentoNfceMin(uf) {
  const u = String(uf || "").trim().toUpperCase();
  const p = Number(PRAZO_POR_UF[u]);
  return Number.isFinite(p) && p > 0 && p < PRAZO_CANCELAMENTO_NFCE_PADRAO_MIN ? p : PRAZO_CANCELAMENTO_NFCE_PADRAO_MIN;
}

/**
 * Situação da janela de cancelamento de uma NFC-e.
 * @returns {{ aplicavel:boolean, dentro:boolean, prazoMin:number, limite:Date|null, restanteMs:number }}
 */
export function janelaCancelamentoNfce({ dhAutorizacao, uf, agora = new Date() } = {}) {
  const prazoMin = prazoCancelamentoNfceMin(uf);
  const t = dhAutorizacao ? new Date(dhAutorizacao).getTime() : NaN;
  if (!Number.isFinite(t)) return { aplicavel: false, dentro: false, prazoMin, limite: null, restanteMs: 0 };
  const limite = new Date(t + prazoMin * 60 * 1000);
  const restanteMs = limite.getTime() - new Date(agora).getTime();
  return { aplicavel: true, dentro: restanteMs > 0, prazoMin, limite, restanteMs };
}

/**
 * A NFC-e pode ser cancelada AGORA pelo cancelamento normal? (autorizada, normal, sem nota de contingência cobrindo a venda, dentro do prazo)
 * Nota fora disso não aparece na tela de cancelamento.
 */
export function podeCancelarNfce(doc, { uf, agora = new Date() } = {}) {
  if (!doc || Number(doc.modelo) !== 65) return false;
  if (doc.status !== "autorizado" || !doc.protocolo || !doc.chave) return false;
  if (Number(doc.tpEmis || 1) !== 1) return false; // contingência (off-line): outra regra
  if (doc.contingenciaNumero) return false; // venda coberta por NFC-e de contingência: cancelamento por substituição (cl. 15-A)
  return janelaCancelamentoNfce({ dhAutorizacao: doc.dhAutorizacao, uf, agora }).dentro;
}

/** "12:34" (minutos:segundos) ou "00:00". */
export function textoContagem(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** NFC-e autorizada que JÁ passou do prazo (não aparece para cancelar): usado só para avisar quantas ficaram de fora. */
export function nfceForaDoPrazo(doc, { uf, agora = new Date() } = {}) {
  if (!doc || Number(doc.modelo) !== 65 || doc.status !== "autorizado") return false;
  const j = janelaCancelamentoNfce({ dhAutorizacao: doc.dhAutorizacao, uf, agora });
  return j.aplicavel && !j.dentro;
}
