// ════════════════════════════════════════════════════════════
//  Imprimir a nota fiscal (E8): NFC-e em cupom de 80 mm ou NF-e em A4.
//  A janela abre NA HORA do clique (bloqueio de pop-up) e é preenchida
//  quando o servidor devolve os dados tirados do XML guardado.
// ════════════════════════════════════════════════════════════

import { qrCodeDataUrl, escreverDanfeNfce } from "./danfeNfceHtml.js";
import { escreverDanfeNfe } from "./danfeNfeHtml.js";

/** @returns {Promise<{ok:boolean, erro?:string}>} */
export async function imprimirNotaFiscal({ documentoId, buscar, abrir = (...a) => window.open(...a), gerarQr } = {}) {
  const j = abrir("", "_blank", "width=900,height=760");
  if (!j) return { ok: false, erro: "Permita pop-ups para imprimir a nota fiscal." };
  try { j.document.write('<p style="font-family:Arial;padding:16px">Preparando a nota fiscal…</p>'); } catch { /* janela fechada */ }
  const fechar = () => { try { j.close(); } catch { /* já fechada */ } };
  const r = await buscar({ acao: "danfe", documentoId });
  if (!r?.ok || !r.danfe) { fechar(); return { ok: false, erro: r?.erro || "Não foi possível montar a nota para impressão." }; }
  if (Number(r.modelo) === 55) {
    try { escreverDanfeNfe(j, r.danfe); } catch (e) { fechar(); return { ok: false, erro: e?.message || "Não foi possível montar o DANFE." }; }
    return { ok: true };
  }
  let qr;
  try { qr = await qrCodeDataUrl(r.danfe.qrCode, gerarQr); } catch { qr = ""; }
  if (!qr) { fechar(); return { ok: false, erro: "Não foi possível gerar o QR Code da nota." }; }
  escreverDanfeNfce(j, r.danfe, qr);
  return { ok: true };
}
