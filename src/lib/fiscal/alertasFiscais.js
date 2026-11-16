// ════════════════════════════════════════════════════════════
//  Alertas fiscais (Etapa E9, parte 2) — o que precisa de atenção agora.
//  Base: notas da loja (app_fiscal_listar_documentos) e, para quem pode ver,
//  o resumo das credenciais (certificado). Nada aqui grava ou envia.
//  Prazos: os da própria contingência guardada (NFC-e off-line: 1º dia útil
//  seguinte; EPEC: 168 h — NT 2014.001 §4.2). Certificado: 30 dias (E4).
// ════════════════════════════════════════════════════════════

import { situacaoCertificado } from "./emissaoConfig.js";

const HORA = 3600000;
export const HORAS_PRAZO_PERTO = 6;
export const MINUTOS_SEM_RESPOSTA = 10;
const PEND = new Set(["contingencia", "enviado", "erro"]);
const contPendente = (n) => Number(n.tpEmis || 1) !== 1 && PEND.has(n.status);
const plural = (q, um, varios) => (q === 1 ? um : varios);

/**
 * @returns {Array<{ id:string, nivel:'erro'|'alerta', texto:string, destino:'notas'|'emissao', quantidade?:number }>}
 *          ordenado: erros primeiro.
 */
export function alertasFiscais({ notas = [], credenciais = null, agora = new Date() } = {}) {
  const t = agora.getTime();
  const out = [];
  if (Array.isArray(credenciais)) {
    const cert = credenciais.find((c) => c.tipo === "certificado_a1");
    if (cert) {
      const sc = situacaoCertificado(cert, agora);
      if (sc.estado === "vencido") out.push({ id: "cert-vencido", nivel: "erro", destino: "emissao", texto: `Certificado digital vencido: as notas não saem. ${sc.texto}` });
      else if (sc.estado === "vencendo") out.push({ id: "cert-vencendo", nivel: "alerta", destino: "emissao", texto: `Certificado digital: ${sc.texto}` });
    }
  }
  const cont = notas.filter(contPendente);
  const epecSem = cont.filter((n) => Number(n.tpEmis) === 4 && !n.contingencia?.epecProtocolo);
  if (epecSem.length) out.push({ id: "epec-sem-aviso", nivel: "erro", destino: "notas", quantidade: epecSem.length,
    texto: `${epecSem.length} NF-e em EPEC sem o aviso registrado na Receita: ${plural(epecSem.length, "não imprima", "não imprima")} até registrar.` });
  const vencidas = cont.filter((n) => n.contingencia?.vencida);
  if (vencidas.length) out.push({ id: "cont-vencida", nivel: "erro", destino: "notas", quantidade: vencidas.length,
    texto: `${vencidas.length} ${plural(vencidas.length, "nota", "notas")} em contingência com prazo de envio vencido: envie agora.` });
  const perto = cont.filter((n) => !n.contingencia?.vencida && n.contingencia?.prazo && new Date(n.contingencia.prazo).getTime() - t <= HORAS_PRAZO_PERTO * HORA);
  if (perto.length) out.push({ id: "cont-perto", nivel: "alerta", destino: "notas", quantidade: perto.length,
    texto: `${perto.length} ${plural(perto.length, "nota", "notas")} em contingência com prazo nas próximas ${HORAS_PRAZO_PERTO} horas.` });
  const marcadas = new Set([...epecSem, ...vencidas, ...perto]);
  const outras = cont.filter((n) => !marcadas.has(n)).length;
  if (outras > 0) out.push({ id: "cont-pendente", nivel: "alerta", destino: "notas", quantidade: outras,
    texto: `${outras} ${plural(outras, "nota", "notas")} em contingência aguardando envio à SEFAZ (o caixa envia sozinho).` });
  // Nota normal enviada e sem resposta há mais de 10 min: perguntar à SEFAZ.
  const semResposta = notas.filter((n) => Number(n.tpEmis || 1) === 1 && n.status === "enviado" && !n.contingenciaNumero
    && t - new Date(n.criadoEm).getTime() > MINUTOS_SEM_RESPOSTA * 60000);
  if (semResposta.length) out.push({ id: "sem-resposta", nivel: "alerta", destino: "notas", quantidade: semResposta.length,
    texto: `${semResposta.length} ${plural(semResposta.length, "nota enviada", "notas enviadas")} sem resposta da SEFAZ: use "Consultar na SEFAZ".` });
  // U1: reservada e nunca enviada há mais de 10 min (ex.: sem certificado na hora da venda).
  const presas = notas.filter((n) => n.status === "reservado" && Number(n.tpEmis || 1) === 1 && !n.contingenciaNumero
    && t - new Date(n.criadoEm).getTime() > MINUTOS_SEM_RESPOSTA * 60000);
  if (presas.length) out.push({ id: "reservadas", nivel: "alerta", destino: "notas", quantidade: presas.length,
    texto: `${presas.length} ${plural(presas.length, "nota reservada", "notas reservadas")} sem envio à SEFAZ: use "Emitir agora" (ou descarte o número).` });
  const rejeitadas = notas.filter((n) => n.status === "rejeitado" && t - new Date(n.criadoEm).getTime() <= 7 * 24 * HORA);
  if (rejeitadas.length) out.push({ id: "rejeitadas", nivel: "alerta", destino: "notas", quantidade: rejeitadas.length,
    texto: `${rejeitadas.length} ${plural(rejeitadas.length, "nota rejeitada", "notas rejeitadas")} pela SEFAZ nos últimos 7 dias: veja o motivo.` });
  return out.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "erro" ? -1 : 1));
}
