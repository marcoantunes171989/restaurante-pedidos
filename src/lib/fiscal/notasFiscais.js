// ════════════════════════════════════════════════════════════
//  Notas emitidas (Etapa E6): situação em português, ações possíveis e
//  chamadas (lista pela RPC 179; cancelar/corrigir pela /api/fiscal-emitir).
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

export function acoesDaNota(doc) {
  const autorizada = doc?.status === "autorizado";
  return { cancelar: autorizada, cce: autorizada && Number(doc?.modelo) === 55 };
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
  }));
}

/** Cancelar / corrigir: vai ao servidor, que assina e envia à SEFAZ. */
export async function pedirEventoFiscal(supabase, corpo, opts = {}) {
  // Mesmo cliente HTTP autenticado da aba Emissão.
  return chamarApiFiscal(supabase, "/api/fiscal-emitir", corpo, opts);
}
