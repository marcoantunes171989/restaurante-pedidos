// ════════════════════════════════════════════════════════════
//  Notas emitidas (Etapa E6): situação em português, ações possíveis e
//  chamadas (lista pela RPC 179/181; cancelar/corrigir/enviar/consultar
//  pela /api/fiscal-emitir). E7: contingência off-line da NFC-e (tpEmis 9)
//  e NF-e pela SVC (tpEmis 6/7, sem prazo: é on-line) ou EPEC (tpEmis 4, 168 h).
// ════════════════════════════════════════════════════════════
import { agruparTentativas } from "./historicoTentativas.js";

import { chamarApiFiscal } from "./fiscalApi.js";

const SITUACOES = {
  reservado: { rotulo: "Em preparo", tom: "neutro" },
  enviado: { rotulo: "Aguardando confirmação", tom: "alerta" },
  autorizado: { rotulo: "Autorizada", tom: "ok" },
  rejeitado: { rotulo: "Rejeitada", tom: "erro" },
  cancelado: { rotulo: "Cancelada", tom: "neutro" },
  contingencia: { rotulo: "Em contingência", tom: "alerta" },
  erro: { rotulo: "SEFAZ indisponível", tom: "erro" },
  descartado: { rotulo: "Número não usado", tom: "neutro" },
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
  // Número que nunca foi usado: inutilizado na SEFAZ (tem protocolo) ou só registrado como não usado (SP, BA e AC não têm mais o serviço).
  if (doc?.status === "descartado") return doc?.protocolo ? { rotulo: "Inutilizada na SEFAZ", tom: "neutro" } : { rotulo: "Número não usado", tom: "neutro" };
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

// Rejeições em que o número ficou usado ou não pode ser refeito (MOC 7.0 Anexo I):
// uso denegado 110/301/302/303, NF-e denegada 205, duplicidade 204/539.
export const CSTAT_SEM_REFAZER = new Set([110, 204, 205, 301, 302, 303, 539]);

export function acoesDaNota(doc) {
  const autorizada = doc?.status === "autorizado";
  const off = Number(doc?.tpEmis || 1) !== 1;
  const normalSemContingencia = !off && !doc?.contingenciaNumero;
  return {
    // U1: reservada e nunca enviada (ex.: sem certificado na hora da venda).
    emitir: doc?.status === "reservado" && normalSemContingencia,
    // Inutilizar / descartar o número: só nota que nunca foi autorizada (o servidor consulta a SEFAZ antes de aceitar).
    descartar: ["reservado", "rejeitado", "erro", "enviado"].includes(doc?.status) && normalSemContingencia,
    // Conferir na base nacional da SEFAZ: nota emitida (autorizada ou cancelada).
    conferir: ["autorizado", "cancelado"].includes(doc?.status) && !!doc?.chave,
    // U2: rejeitada → corrigir o cadastro e emitir de novo com o mesmo número.
    refazer: doc?.status === "rejeitado" && normalSemContingencia && !CSTAT_SEM_REFAZER.has(Number(doc?.cStat)),
    cancelar: autorizada,
    cce: autorizada && Number(doc?.modelo) === 55,
    // Nota de contingência assinada e ainda não autorizada: enviar.
    enviar: ehContPendente(doc) && doc.contingencia?.assinada !== false,
    // Falha técnica ou sem resposta (nota normal, sem contingência): reenviar com a MESMA numeração. O servidor consulta a SEFAZ
    // antes de concluir, então nunca duplica uma nota que já foi autorizada.
    reenviar: ["erro", "enviado"].includes(doc?.status) && normalSemContingencia && !CSTAT_SEM_REFAZER.has(Number(doc?.cStat)),
    // Já foi enviada e não teve resposta certa: perguntar à SEFAZ.
    consultar: !!doc?.chave && !naoUsada(doc) && (doc.status === "enviado" || (doc.status === "erro" && !off)),
    // DANFE (E8): autorizada; NFC-e off-line (tpEmis 9) já assinada; NF-e com EPEC registrado.
    imprimir: autorizada
      || (Number(doc?.modelo) === 65 && Number(doc?.tpEmis) === 9 && ehContPendente(doc) && doc.contingencia?.assinada !== false)
      || (Number(doc?.modelo) === 55 && Number(doc?.tpEmis) === 4 && ehContPendente(doc) && !!doc.contingencia?.epecProtocolo),
  };
}

// Filtros da lista de Notas Emitidas (só afetam o que aparece; nada é gravado).
export const FILTROS_NOTAS = [
  { id: "todas", rotulo: "Todas" },
  { id: "nfce", rotulo: "NFC-e" },
  { id: "nfe", rotulo: "NF-e" },
  { id: "problema", rotulo: "Com problema" },
  { id: "contingencia", rotulo: "Contingência" },
];
export function filtrarNotas(notas = [], filtro = "todas") {
  switch (filtro) {
    case "nfce": return notas.filter((n) => Number(n.modelo) === 65);
    case "nfe": return notas.filter((n) => Number(n.modelo) === 55);
    case "problema": return notas.filter((n) => situacaoDaNota(n).tom === "erro");
    case "contingencia": return notas.filter(ehContPendente);
    default: return notas;
  }
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

/** U2: a venda guardada na nota (para refazer a parte fiscal). */
export async function buscarVendaDaNota(supabase, documentoId) {
  const { data, error } = await supabase.rpc("app_fiscal_documento_venda", { p_documento_id: documentoId });
  if (error || !data?.ok) throw Object.assign(new Error(error ? "Não foi possível ler a venda da nota (migration 188)." : "Nota não encontrada."), { code: data?.code || "RPC_ERROR" });
  return data;
}

const ERROS_REFAZER = {
  STATUS_NAO_PERMITE: "Só dá para refazer uma nota rejeitada.",
  EM_CONTINGENCIA: "Esta venda já saiu em contingência.",
  NUMERO_USADO: "A SEFAZ considera este número usado (uso denegado ou duplicidade): não dá para refazer.",
  VENDA_DIVERGENTE: "Os valores da venda mudaram: não dá para refazer esta nota.",
  VENDA_COM_PENDENCIA: "Ainda há produto com cadastro fiscal incompleto.",
  VENDA_INVALIDA: "A venda guardada na nota está incompleta.",
};
/** U2: grava a venda com a parte fiscal corrigida e volta a nota para reservada. */
export async function refazerNota(supabase, documentoId, venda) {
  const { data, error } = await supabase.rpc("app_fiscal_documento_refazer", { p_documento_id: documentoId, p_venda: venda });
  if (error) throw Object.assign(new Error("Não foi possível refazer a nota (migration 188)."), { code: "RPC_ERROR" });
  if (!data?.ok) throw Object.assign(new Error(ERROS_REFAZER[data?.code] || "Não foi possível refazer a nota."), { code: data?.code });
  return data;
}

/**
 * Inutilizar / descartar o número de uma nota que nunca foi autorizada. Vai ao servidor, que consulta a SEFAZ antes e:
 *  • onde o serviço existe, envia a inutilização e guarda o protocolo;
 *  • em SP, BA e AC (sem o serviço desde 11/11/2026), registra só como número não usado (sem protocolo).
 * @returns {Promise<{ ok:true, inutilizado:boolean, protocolo?:string, aviso?:string }>}
 */
export async function inutilizarNota(supabase, documentoId, motivo, opts = {}) {
  const r = await chamarApiFiscal(supabase, "/api/fiscal-emitir", { acao: "inutilizar", documentoId, motivo }, opts);
  if (!r?.ok) throw Object.assign(new Error([r?.erro || "Não foi possível inutilizar o número.", r?.xMotivo].filter(Boolean).join(" ")), { code: r?.code || "ERRO", resposta: r });
  return r;
}

/** Confere a nota na base nacional da SEFAZ (só lê; grava a conferência no histórico). */
export async function conferirNotaSefaz(supabase, documentoId, opts = {}) {
  const r = await chamarApiFiscal(supabase, "/api/fiscal-emitir", { acao: "conferir", documentoId }, opts);
  if (!r?.ok) throw Object.assign(new Error(r?.erro || "Não foi possível conferir na SEFAZ."), { code: r?.code || "ERRO", resposta: r });
  return r;
}

/** Cancelar / corrigir: vai ao servidor, que assina e envia à SEFAZ. */
export async function pedirEventoFiscal(supabase, corpo, opts = {}) {
  // Mesmo cliente HTTP autenticado da aba Emissão.
  return chamarApiFiscal(supabase, "/api/fiscal-emitir", corpo, opts);
}


// ── Detalhes e histórico (log) de cada nota ──────────────────────────────────────────────────────────────────────────

const TIPOS_EVENTO = {
  RESERVADO: "Número reservado", RESERVA: "Número reservado", SEFAZ_ENVIADO: "Enviada à SEFAZ", SEFAZ_AUTORIZADO: "Autorizada pela SEFAZ",
  SEFAZ_REJEITADO: "Rejeitada pela SEFAZ", SEFAZ_ERRO: "Erro no envio", DESCARTADO: "Descartada", CANCELADO: "Cancelada",
  MANUTENCAO_FISCAL: "Manutenção fiscal", DH_EMISSAO_RENOVADA: "Data de emissão renovada",
  INUTILIZADO: "Número inutilizado na SEFAZ", NUMERO_NAO_USADO: "Número não usado (controle do emitente)", CONFERIDA_SEFAZ: "Conferência na SEFAZ",
};
export function rotuloEvento(e) {
  if (e?.payload?.falhaInterna) return "Falha técnica no envio";
  const t = String(e?.tipo || "");
  return TIPOS_EVENTO[t] || t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) || "Evento";
}

/** Linha do histórico pronta para mostrar: quando, o quê, de/para qual situação e o que a SEFAZ/servidor disse. */
export function linhaDoHistorico(e) {
  const p = e?.payload || {};
  const partes = [];
  if (e?.tipo === "MANUTENCAO_FISCAL") {
    // Log da manutenção: quem, motivo e cada campo alterado (de → para). A data é a do próprio evento.
    const quem = p.usuario?.nome || p.usuario?.email || "usuário não identificado";
    partes.push(`por ${quem}`, `motivo: ${p.motivo || "—"}`);
    const alt = Array.isArray(p.alteracoes) ? p.alteracoes : [];
    if (alt.length) partes.push(`alterações: ${alt.map((a) => `${a.campo}: "${a.de}" → "${a.para}"`).join("; ")}`);
    return { id: e?.id, quando: e?.criado_em || e?.criadoEm || null, titulo: rotuloEvento(e), mudanca: "", texto: partes.join(" · "), falha: false, bruto: e };
  }
  if (e?.tipo === "INUTILIZADO" || e?.tipo === "NUMERO_NAO_USADO") {
    partes.push(`motivo: ${p.motivo || "—"}`);
    if (p.protocolo) partes.push(`protocolo de inutilização ${p.protocolo}`);
    if (p.cStat != null && p.cStat !== "") partes.push(`código ${p.cStat}`);
    if (e.tipo === "NUMERO_NAO_USADO") partes.push("sem protocolo: a SEFAZ do estado não recebe mais inutilização");
    return { id: e?.id, quando: e?.criado_em || e?.criadoEm || null, titulo: rotuloEvento(e), mudanca: "", texto: partes.join(" · "), falha: false, bruto: e };
  }
  if (e?.tipo === "CONFERIDA_SEFAZ") {
    const div = Array.isArray(p.divergencias) ? p.divergencias : [];
    partes.push(p.conforme ? "conforme: a SEFAZ confirma a nota" : `DIVERGENTE: ${div.join(" ") || "ver detalhes"}`);
    if (p.cStat != null && p.cStat !== "") partes.push(`código ${p.cStat}`);
    if (p.protocolo) partes.push(`protocolo ${p.protocolo}`);
    return { id: e?.id, quando: e?.criado_em || e?.criadoEm || null, titulo: rotuloEvento(e), mudanca: "", texto: partes.join(" · "), falha: !p.conforme, bruto: e };
  }
  if (p.cStat != null && p.cStat !== "") partes.push(`código ${p.cStat}`);
  if (p.xMotivo) partes.push(String(p.xMotivo));
  else if (p.detalhe) partes.push(String(p.detalhe));
  if (p.protocolo) partes.push(`protocolo ${p.protocolo}`);
  return {
    id: e?.id, quando: e?.criado_em || e?.criadoEm || null, titulo: rotuloEvento(e),
    mudanca: e?.status_anterior && e?.status_novo && e.status_anterior !== e.status_novo ? `${situacaoNota(e.status_anterior).rotulo} → ${situacaoNota(e.status_novo).rotulo}` : "",
    texto: partes.join(" · "), falha: !!p.falhaInterna || e?.status_novo === "erro" || e?.status_novo === "rejeitado", bruto: e,
  };
}

export async function buscarHistoricoDocumento(supabase, documentoId) {
  const { data, error } = await supabase.rpc("app_fiscal_documento_historico", { p_documento_id: documentoId });
  if (error) {
    const ausente = /could not find the function|does not exist/i.test(String(error.message)) || ["42883", "PGRST202"].includes(String(error.code));
    throw Object.assign(new Error(ausente ? "O histórico detalhado ainda não está instalado no banco (migration 191)." : "Não foi possível carregar o histórico."), { code: ausente ? "MIGRACAO_PENDENTE" : "RPC_ERROR" });
  }
  if (data?.ok === false) throw Object.assign(new Error("Sem permissão para ver o histórico desta nota."), { code: data.code });
  return (data?.eventos || []).map(linhaDoHistorico);
}

/**
 * Explica em português o problema da nota e o que fazer (para o painel de detalhes). null = nota sem problema.
 * @returns {{ titulo:string, causa:string, passos:string[], tom:'erro'|'alerta' }|null}
 */
export function explicarNota(doc) {
  if (!doc) return null;
  const acoes = acoesDaNota(doc);
  const motivo = String(doc.xMotivo || "").trim();
  const cStat = doc.cStat != null && doc.cStat !== "" ? Number(doc.cStat) : null;
  if (doc.status === "autorizado" || doc.status === "cancelado" || doc.status === "descartado") return null;
  if (/Falha técnica depois do envio/i.test(motivo)) {
    return { tom: "alerta", titulo: "Falha técnica depois do envio",
      causa: "A nota foi transmitida, mas o sistema falhou ao ler/gravar a resposta. A SEFAZ PODE ter autorizado a nota.",
      passos: ["Clique em Consultar na SEFAZ antes de reenviar. Se ela já autorizou, a nota será registrada; se não recebeu, aí use Reenviar à SEFAZ."] };
  }
  if (/Falha técnica ao enviar/i.test(motivo)) {
    return { tom: "erro", titulo: "Falha técnica no envio",
      causa: "O sistema não conseguiu montar ou validar o XML para enviar. A nota NÃO chegou à SEFAZ e a numeração foi mantida.",
      passos: ["Clique em Reenviar à SEFAZ. Se a falha continuar, copie o diagnóstico (abaixo) e envie ao suporte."] };
  }
  if (doc.status === "rejeitado") {
    const sem = CSTAT_SEM_REFAZER.has(cStat);
    return { tom: "erro", titulo: `Rejeitada pela SEFAZ${cStat != null ? ` (código ${cStat})` : ""}`,
      causa: motivo || "A SEFAZ recusou a nota.",
      passos: sem
        ? ["Esta rejeição não permite reenviar com o mesmo número. Fale com o contador e, se preciso, emita uma nova venda."]
        : ["Corrija o cadastro indicado no motivo (produto, empresa, pagamento) e use Corrigir e emitir de novo — o número é mantido."] };
  }
  if (doc.status === "reservado") {
    return { tom: "alerta", titulo: "Número reservado, nota ainda não enviada", causa: "A venda foi fechada, mas a nota não chegou a ser enviada (por exemplo, falta de certificado ou queda no momento da venda).",
      passos: ["Clique em Emitir agora, ou em Descartar se esta venda não deve ter nota."] };
  }
  if (doc.status === "enviado" || doc.status === "erro") {
    if (doc.contingenciaNumero) return { tom: "alerta", titulo: "Venda saiu em contingência", causa: "A venda foi emitida em outra nota (contingência). Esta numeração só pode ser consultada.", passos: ["Use Consultar na SEFAZ."] };
    return { tom: doc.status === "erro" ? "erro" : "alerta",
      titulo: doc.status === "erro" ? "Sem confirmação da SEFAZ" : "Aguardando confirmação da SEFAZ",
      causa: motivo || "A nota foi enviada, mas a resposta da SEFAZ não foi gravada.",
      passos: [acoes.consultar ? "Clique em Consultar na SEFAZ para saber se ela recebeu a nota." : "", acoes.reenviar ? "Se a SEFAZ não recebeu (ou a consulta não responde), clique em Reenviar à SEFAZ: o sistema consulta antes e nunca duplica uma nota já autorizada." : ""].filter(Boolean) };
  }
  return null;
}

/** Texto para copiar e colar no suporte: tudo o que a pessoa precisa mandar, sem segredos. */
export function textoDiagnostico(doc, historico = [], tentativas = []) {
  const grupo = agruparTentativas(historico.map((h) => h.bruto).filter(Boolean));
  const l = [
    `${doc?.modelo === 65 ? "NFC-e" : "NF-e"} nº ${doc?.numero} · série ${doc?.serie} · ${doc?.ambiente === "homologacao" ? "homologação" : "produção"}`,
    `Situação: ${situacaoDaNota(doc).rotulo} (${doc?.status})${doc?.cStat != null ? ` · código ${doc.cStat}` : ""}`,
    doc?.xMotivo ? `Motivo: ${doc.xMotivo}` : "",
    doc?.chave ? `Chave: ${doc.chave}` : "",
    doc?.protocolo ? `Protocolo: ${doc.protocolo}` : "",
    `Valor: R$ ${Number(doc?.valorTotal || 0).toFixed(2).replace(".", ",")} · criada em ${doc?.criadoEm || "—"}`,
    `ID: ${doc?.id}`,
  ];
  if (historico.length) {
    l.push("Histórico:");
    for (const h of historico) l.push(`- ${h.quando || ""} ${h.titulo}${h.mudanca ? ` (${h.mudanca})` : ""}${h.texto ? `: ${h.texto}` : ""}`);
  }
  if (grupo.tentativas.length) {
    // Por tentativa de envio: resultado, causa provável e o que fazer (para o suporte técnico ler de uma vez).
    l.push("Tentativas de envio:");
    for (const t of grupo.tentativas) {
      l.push(`- ${t.consulta ? "Consulta" : `Tentativa ${t.numero}`} (${t.inicio || "—"}): ${t.resultado.titulo}${t.resultado.xMotivo ? ` — ${t.resultado.xMotivo}` : ""}`);
      l.push(`    Causa: ${t.analise.causa} | O que fazer: ${t.analise.acao}`);
      for (const m of t.manutencoes) l.push(`    Manutenção antes: por ${m.payload?.usuario?.nome || m.payload?.usuario?.email || "?"} em ${m.criado_em} — ${m.payload?.motivo || ""}`);
    }
  }
  if (tentativas.length) {
    l.push("Ações feitas nesta tela:");
    for (const x of tentativas) l.push(`- ${x.quando} ${x.acao} → ${x.ok ? "ok" : "falhou"}: ${x.texto}`);
  }
  return l.filter(Boolean).join("\n");
}
