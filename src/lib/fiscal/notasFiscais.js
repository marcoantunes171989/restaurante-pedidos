// ════════════════════════════════════════════════════════════
//  Notas emitidas (Etapa E6): situação em português, ações possíveis e
//  chamadas (lista pela RPC 179/181; cancelar/corrigir/enviar/consultar
//  pela /api/fiscal-emitir). E7: contingência off-line da NFC-e (tpEmis 9)
//  e NF-e pela SVC (tpEmis 6/7, sem prazo: é on-line) ou EPEC (tpEmis 4, 168 h).
// ════════════════════════════════════════════════════════════

import { chamarApiFiscal } from "./fiscalApi.js";

const SITUACOES = {
  reservado: { rotulo: "Em preparo", tom: "neutro" },
  enviado: { rotulo: "Aguardando confirmação", tom: "alerta" },
  autorizado: { rotulo: "Autorizada", tom: "ok" },
  rejeitado: { rotulo: "Rejeitada", tom: "erro" },
  cancelado: { rotulo: "Cancelada", tom: "neutro" },
  contingencia: { rotulo: "Em contingência", tom: "alerta" },
  erro: { rotulo: "SEFAZ indisponível", tom: "erro" },
  descartado: { rotulo: "Descartada", tom: "neutro" },
};
export function situacaoNota(status) {
  return SITUACOES[status] || { rotulo: String(status || "—"), tom: "neutro" };
}

const PENDENTE_OFF = new Set(["contingencia", "enviado", "erro"]);
// Consulta confirmou que a nota não chegou à SEFAZ (cStat 217) e a venda saiu em contingência.
const naoUsada = (d) => !!d?.contingenciaNumero && d.status === "erro" && Number(d.cStat) === 217;
const ehContPendente = (d) => Number(d?.tpEmis || 1) !== 1 && PENDENTE_OFF.has(d?.status);
const ehSvc = (d) => [6, 7].includes(Number(d?.tpEmis));

/** Situação considerando a contingência (E7). */
export function situacaoDaNota(doc) {
  if (ehContPendente(doc) && ehSvc(doc)) return { rotulo: "Contingência SVC: enviar", tom: "alerta" };
  // EPEC sem protocolo: a NF-e não pode ser impressa (NT 2014.001).
  if (ehContPendente(doc) && Number(doc.tpEmis) === 4 && !doc.contingencia?.epecProtocolo) return { rotulo: "EPEC não registrado", tom: "erro" };
  if (ehContPendente(doc)) {
    return doc.contingencia?.vencida ? { rotulo: "Contingência: prazo vencido", tom: "erro" } : { rotulo: "Em contingência", tom: "alerta" };
  }
  if (naoUsada(doc)) return { rotulo: "Número não usado", tom: "neutro" };
  if (doc?.contingenciaNumero && ["enviado", "erro"].includes(doc.status)) return { rotulo: "Sem resposta: consultar", tom: "alerta" };
  return situacaoNota(doc?.status);
}

export function acoesDaNota(doc) {
  const autorizada = doc?.status === "autorizado";
  const off = Number(doc?.tpEmis || 1) !== 1;
  return {
    cancelar: autorizada,
    cce: autorizada && Number(doc?.modelo) === 55,
    // Nota de contingência assinada e ainda não autorizada: enviar.
    enviar: ehContPendente(doc) && doc.contingencia?.assinada !== false,
    // Já foi enviada e não teve resposta certa: perguntar à SEFAZ.
    consultar: !!doc?.chave && !naoUsada(doc) && (doc.status === "enviado" || (doc.status === "erro" && !off)),
    // DANFE NFC-e (E8): autorizada, ou off-line (tpEmis 9) já assinada.
    imprimir: Number(doc?.modelo) === 65 && (autorizada || (Number(doc?.tpEmis) === 9 && ehContPendente(doc) && doc.contingencia?.assinada !== false)),
  };
}

/** Notas em contingência que ainda precisam ser enviadas (as da SVC não têm prazo). */
export function resumoContingencia(notas = []) {
  const p = notas.filter(ehContPendente);
  const prazos = p.map((n) => n.contingencia?.prazo).filter(Boolean).sort();
  return { pendentes: p.length, vencidas: p.filter((n) => n.contingencia?.vencida).length, proximoPrazo: prazos[0] || null, ids: p.map((n) => n.id) };
}

const fmtBr = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " às ").replace(" ", " ");
export function textoPrazo(prazoIso, agora = new Date()) {
  if (!prazoIso) return "";
  return new Date(prazoIso).getTime() < agora.getTime() ? `prazo vencido em ${fmtBr(prazoIso)}` : `até ${fmtBr(prazoIso)}`;
}

const LIMITES = { cancelar: [15, 255, "A justificativa"], cce: [15, 1000, "A correção"] };
export function validarTextoEvento(acao, texto) {
  const [min, max, nome] = LIMITES[acao] || [15, 255, "O texto"];
  const n = String(texto || "").trim().replace(/\s+/g, " ").length;
  if (n < min || n > max) return `${nome} deve ter de ${min} a ${max} caracteres (agora: ${n}).`;
  return null;
}

export async function listarDocumentosFiscais(supabase, lojaId, { limite = 50, antes = null } = {}) {
  const { data, error } = await supabase.rpc("app_fiscal_listar_documentos", { p_loja_id: lojaId, p_limite: limite, p_antes: antes });
  if (error) {
    const ausente = /could not find the function|does not exist/i.test(String(error.message)) || ["42883", "PGRST202"].includes(String(error.code));
    throw Object.assign(new Error(ausente ? "A lista de notas ainda não está instalada no banco (migration 179)." : "Não foi possível carregar as notas."), { code: ausente ? "MIGRACAO_PENDENTE" : "RPC_ERROR" });
  }
  if (data?.ok === false) throw Object.assign(new Error("Sem permissão para ver as notas desta loja."), { code: data.code });
  return (data?.documentos || []).map((d) => ({
    id: d.id, modelo: d.modelo, serie: d.serie, numero: d.numero, ambiente: d.ambiente, status: d.status,
    chave: d.chave, protocolo: d.protocolo, cStat: d.cstat, xMotivo: d.xmotivo, valorTotal: Number(d.valor_total || 0),
    criadoEm: d.criado_em, dhAutorizacao: d.dh_autorizacao, cartasCorrecao: Number(d.cartas_correcao || 0), ultimoEvento: d.ultimo_evento || null,
    tpEmis: Number(d.tp_emis || 1),
    contingencia: d.contingencia ? { prazo: d.contingencia.prazo, vencida: !!d.contingencia.vencida, tentativas: Number(d.contingencia.tentativas || 0),
      numeroOrigem: d.contingencia.numero_origem ?? null, assinada: d.contingencia.assinada !== false, epecProtocolo: d.contingencia.epec_protocolo ?? null } : null,
    contingenciaNumero: d.contingencia_numero ?? null,
  }));
}

/** Cancelar / corrigir: vai ao servidor, que assina e envia à SEFAZ. */
export async function pedirEventoFiscal(supabase, corpo, opts = {}) {
  // Mesmo cliente HTTP autenticado da aba Emissão.
  return chamarApiFiscal(supabase, "/api/fiscal-emitir", corpo, opts);
}
