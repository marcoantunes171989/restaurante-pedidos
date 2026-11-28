// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/fiscal-emitir
//   { acao: "status", lojaId, modelo, ambiente }  → teste de conexão com a SEFAZ
//   { acao: "emitir", documentoId }               → envia a nota reservada
//   { acao: "cancelar", documentoId, xJust }      → cancelamento (110111)
//   { acao: "substituir", documentoId, chNFeRef, xJust } → canc. substituição NFC-e
//   { acao: "cce", documentoId, xCorrecao }       → carta de correção NF-e
//   { acao: "contingencia", documentoId, xJust }  → NFC-e off-line (tpEmis 9) da venda que falhou
//   { acao: "transmitir_contingencia", documentoId } → envia a nota off-line
//   { acao: "pendentes_contingencia", lojaId }    → fila de notas off-line
//   { acao: "xml", documentoId }                  → XML guardado (consulta/download)
//   { acao: "conferir", documentoId } → confere a nota na base nacional da SEFAZ (só lê; grava no histórico)
//   { acao: "inutilizar", documentoId, motivo } → inutiliza/descarta número que nunca foi autorizado (consulta a SEFAZ antes; protocolo onde o serviço existe)
//   { acao: "manutencao_abrir"|"manutencao_salvar", documentoId, motivo, alteracoes, transmitir } → manutenção fiscal (admin da loja)
//   { acao: "enviar_email_xml", ids:[documentoId...], destinatario } → envia XML(s) guardado(s) por e-mail, em anexo
//
//  Permissões conferidas no banco com o TOKEN DO USUÁRIO:
//   status, cancelar, substituir, cce → app_fiscal_pode_configurar (admin da loja / super)
//   emitir, contingencia, transmitir_contingencia, pendentes_contingencia →
//     app_pode_receber_pagamento (caixa da loja / super)
//   enviar_email_xml → app_fiscal_xml_lote (mesma permissão da tela XMLs fiscais)
//  Certificado (cofre 176) e gravação do resultado (177): service role,
//  só aqui no servidor. Nada sensível volta na resposta.
//
//  Vercel Hobby: limite de 12 Serverless Functions por deployment — por isso o
//  envio de e-mail do XML (ação nova) entra NESTE arquivo em vez de um
//  endpoint próprio; nunca criar outro arquivo em api/ sem antes conferir
//  `ls api/*.js | wc -l` (ver docs/dev/RELEASE_CHECKLIST.md).
// ════════════════════════════════════════════════════════════

import process from "node:process";
import { Buffer } from "node:buffer";
import { processarEmissao } from "../server/fiscal/emissaoService.js";
import { cadeiaConfiavelSefaz } from "../server/fiscal/sefaz/cadeiaIcp.js";
import { criarLeitorTabelaIbpt } from "../server/fiscal/ibptTabela.js";
import { dbParaEmitente } from "../src/lib/emitenteFiscalService.js";
import { nomeArquivoXml } from "../src/lib/fiscal/xmlNota.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const resendKey = () => process.env.RESEND_API_KEY || "";
const remetenteEmail = () => process.env.FISCAL_EMAIL_REMETENTE || "Pedido Prime <fiscal@pedidoprime.com.br>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_NOTAS_EMAIL = 20;

// Busca o lote de XML com o TOKEN DO USUÁRIO (não service role): a própria função do
// banco confere se ele pode ver os XMLs daquela loja — igual à tela (xmlExportacao.js).
async function xmlDoUsuario(ids, token) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/app_fiscal_xml_lote`, {
    method: "POST",
    headers: { apikey: anonKey(), authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ p_ids: ids }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`RPC app_fiscal_xml_lote HTTP ${r.status}`);
  return txt ? JSON.parse(txt) : null;
}

async function enviarEmailXml(body, token, res) {
  if (!resendKey()) return json(res, 503, { ok: false, code: "SEM_EMAIL", erro: "Envio por e-mail ainda não está configurado neste ambiente." });
  if (!supabaseUrl() || !anonKey()) return json(res, 503, { ok: false, erro: "Configuração do servidor ausente." });
  const ids = Array.from(new Set(Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : []));
  const destinatario = String(body?.destinatario || "").trim();
  if (!ids.length) return json(res, 400, { ok: false, code: "SEM_NOTAS", erro: "Nenhuma nota selecionada." });
  if (ids.length > LIMITE_NOTAS_EMAIL) return json(res, 400, { ok: false, code: "LOTE_GRANDE", erro: `No máximo ${LIMITE_NOTAS_EMAIL} notas por envio.` });
  if (!EMAIL_RE.test(destinatario)) return json(res, 400, { ok: false, code: "EMAIL_INVALIDO", erro: "Informe um e-mail válido para enviar." });

  const r = await xmlDoUsuario(ids, token);
  if (!r?.ok) {
    const code = r?.code || "RPC_ERROR";
    const erro = code === "FORBIDDEN" ? "Você não tem permissão para enviar os XMLs desta loja." : "Não foi possível obter os XMLs para enviar.";
    return json(res, code === "FORBIDDEN" ? 403 : 400, { ok: false, code, erro });
  }
  const xmls = r.xmls || [];
  if (!xmls.length) return json(res, 400, { ok: false, code: "SEM_NOTAS", erro: "Nenhum XML encontrado para as notas selecionadas." });

  const anexos = xmls.map((n) => ({ filename: nomeArquivoXml(n), content: Buffer.from(String(n.xml || ""), "utf8").toString("base64") }));
  const plural = xmls.length > 1 ? "s" : "";
  const linhas = xmls.map((n) => `${Number(n.modelo) === 55 ? "NF-e" : "NFC-e"} ${n.numero}/${n.serie} — ${n.chave}`).join("\n");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: remetenteEmail(),
      to: [destinatario],
      subject: `XML${plural} fiscal${plural} — ${xmls.length} nota(s)`,
      text: `Em anexo o(s) XML(s) fiscal(is):\n\n${linhas}\n`,
      attachments: anexos,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[fiscal-emitir] enviar_email_xml: Resend HTTP", resp.status, String(txt).slice(0, 300));
    return json(res, 502, { ok: false, code: "ENVIO_FALHOU", erro: "Não foi possível enviar o e-mail agora. Tente novamente." });
  }
  return json(res, 200, { ok: true, enviados: xmls.length });
}

async function rpc(nome, params, bearer) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: serviceKey(), authorization: `Bearer ${bearer}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(params),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`RPC ${nome} HTTP ${r.status}`);
  return txt ? JSON.parse(txt) : null;
}
// Um leitor por instância da função (o cache curto vale entre as requisições).
const leitorIbpt = criarLeitorTabelaIbpt((uf) => rpc("app_fiscal_ibpt_da_uf", { p_uf: uf }, serviceKey()));

export function criarDeps(token) {
  const doServidor = (nome, params) => rpc(nome, params, serviceKey());
  // 185: emitente/CNPJ por função do servidor (no HML o service_role não lê as tabelas direto).
  const lojas = new Map();
  const lojaServidor = (lojaId) => {
    const id = Number(lojaId);
    if (!lojas.has(id)) lojas.set(id, doServidor("app_fiscal_loja_servidor", { p_loja_id: id }).catch((e) => { lojas.delete(id); throw e; }));
    return lojas.get(id);
  };
  return {
    podeConfigurar: async (lojaId) => { try { return (await rpc("app_fiscal_pode_configurar", { p_loja_id: lojaId }, token)) === true; } catch { return false; } },
    podeEmitir: async (lojaId) => { try { return (await rpc("app_pode_receber_pagamento", { p_loja_id: lojaId }, token)) === true; } catch { return false; } },
    ufDaLoja: async (lojaId) => (await lojaServidor(lojaId))?.emitente?.uf || "",
    segredoCertificado: async (lojaId) => {
      const r = await doServidor("app_fiscal_credencial_segredo", { p_loja_id: lojaId, p_tipo: "certificado_a1", p_ambiente: null });
      if (!r?.ok) return null;
      try { return JSON.parse(r.segredo); } catch { return null; }
    },
    documento: async (id) => {
      const r = await doServidor("app_fiscal_documento_para_emissao", { p_documento_id: id });
      return r?.ok ? r.documento : null;
    },
    registrar: (p) => doServidor("app_fiscal_documento_registrar_resultado", {
      p_documento_id: p.documentoId, p_status: p.status, p_chave: p.chave ?? null, p_cstat: p.cStat ?? null,
      p_xmotivo: p.xMotivo ?? null, p_protocolo: p.protocolo ?? null, p_dh_autorizacao: p.dhAutorizacao ?? null,
      p_xml: p.xml ?? null, p_payload: p.payload ?? {},
    }),
    // Eventos (E6, migration 178)
    proximaSequencia: (docId, tp) => doServidor("app_fiscal_evento_proxima_sequencia", { p_documento_id: docId, p_tp_evento: tp }),
    registrarEvento: (p) => doServidor("app_fiscal_evento_registrar", {
      p_documento_id: p.documentoId, p_tp_evento: p.tpEvento, p_n_seq: p.nSeq, p_status: p.status, p_cstat: p.cStat ?? null,
      p_xmotivo: p.xMotivo ?? null, p_protocolo: p.protocolo ?? null, p_xml: p.xml ?? null, p_usuario_id: null, p_payload: {},
    }),
    // Contingência off-line da NFC-e (E7, migration 180)
    segredoCsc: async (lojaId, ambiente) => {
      const r = await doServidor("app_fiscal_credencial_segredo", { p_loja_id: lojaId, p_tipo: "csc", p_ambiente: ambiente });
      return r?.ok && r.segredo ? { idCsc: r.id_csc, csc: r.segredo } : null;
    },
    abrirContingencia: (p) => doServidor("app_fiscal_contingencia_abrir", {
      p_origem_documento_id: p.origemId, p_dh_cont: p.dhCont, p_x_just: p.xJust, p_prazo: p.prazo ?? null,
      p_tp_emis: p.tpEmis ?? 9, // 182: 9 off-line (NFC-e) | 6/7 SVC (NF-e)
    }),
    contingencia: async (id) => {
      const r = await doServidor("app_fiscal_contingencia_para_transmitir", { p_documento_id: id });
      return r?.ok ? r.documento : null;
    },
    salvarContingencia: (p) => doServidor("app_fiscal_contingencia_salvar_xml", {
      p_documento_id: p.documentoId, p_chave: p.chave, p_xml: p.xml, p_qr_code: p.qrCode,
    }),
    // EPEC da NF-e (E7 parte 5, migration 183)
    registrarEpec: (p) => doServidor("app_fiscal_contingencia_registrar_epec", {
      p_documento_id: p.documentoId, p_protocolo: p.protocolo, p_dh_registro: p.dhRegistro ?? null, p_xml: p.xml,
      p_cstat: p.cStat ?? null, p_xmotivo: p.xMotivo ?? null,
    }),
    // Nota em cada venda (E8 parte 1, migration 184): o servidor confere a
    // venda com os pedidos do banco e monta a nota com o emitente do banco.
    pedidosDaNota: async (documentoId) => {
      const r = await doServidor("app_fiscal_pedidos_do_documento", { p_documento_id: documentoId });
      return r?.ok ? r.pedidos : [];
    },
    emitente: async (lojaId) => {
      const r = await lojaServidor(lojaId);
      if (!r?.ok || !r.emitente) return null;
      return { dados: dbParaEmitente(r.emitente), cnpj: String(r.documento || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase() };
    },
    // DANFE (E8 parte 2): XML guardado da nota (autorizada ou contingência).
    paraDanfe: async (id) => {
      const r = await doServidor("app_fiscal_documento_para_danfe", { p_documento_id: id });
      return r?.ok || r?.code === "SEM_XML" ? r : null;
    },
    // 205: parâmetros do IBS/CBS do Simples da loja (falha → desligado).
    ibsCbsSn: async (lojaId) => { try { const r = await doServidor("app_fiscal_ibscbs_sn_servidor", { p_loja_id: lojaId }); return r?.ok ? r.ibscbs_sn : null; } catch { return null; } },
    // 206: parâmetros da NFC-e de entrega da loja (falha → desligado, e a nota de entrega não é montada).
    entregaNfce: async (lojaId) => { try { const r = await doServidor("app_fiscal_entrega_nfce_servidor", { p_loja_id: lojaId }); return r?.ok ? r.entrega_nfce : null; } catch { return null; } },
    salvarDados: (p) => doServidor("app_fiscal_documento_salvar_dados", { p_documento_id: p.documentoId, p_chave: p.chave, p_dados: p.dados }),
    // 193: manutenção fiscal. O usuário logado vem do banco com o TOKEN dele; a gravação (com log) é só do servidor.
    usuarioAtual: async () => { try { return await rpc("app_fiscal_usuario_atual", {}, token); } catch { return null; } },
    salvarManutencao: (p) => doServidor("app_fiscal_documento_manutencao_salvar", {
      p_documento_id: p.documentoId, p_dados: p.dados, p_usuario_id: p.usuario?.id ?? null, p_usuario_nome: p.usuario?.nome ?? null,
      p_usuario_email: p.usuario?.email ?? null, p_motivo: p.motivo, p_alteracoes: p.alteracoes,
    }),
    // 197: inutilização / número não usado (com o protocolo da SEFAZ onde o serviço existe).
    registrarInutilizacao: (p) => doServidor("app_fiscal_inutilizacao_registrar", {
      p_documento_id: p.documentoId, p_motivo: p.motivo, p_usuario_id: p.usuarioId ?? null, p_inutilizado: !!p.inutilizado, p_protocolo: p.protocolo ?? null,
      p_cstat: p.cStat ?? null, p_xmotivo: p.xMotivo ?? null, p_dh: p.dhRecbto ?? null, p_xml: p.xml ?? null,
    }),
    registrarConferencia: (p) => doServidor("app_fiscal_conferencia_registrar", {
      p_documento_id: p.documentoId, p_conforme: !!p.conforme, p_cstat: p.cStat ?? null, p_xmotivo: p.xMotivo ?? null, p_protocolo: p.protocolo ?? null,
      p_dh_recbto: p.dhRecbto ?? null, p_dig_val: p.digVal ?? null, p_situacao: p.situacaoSefaz ?? null, p_divergencias: p.divergencias ?? [],
    }),
    // 199: a loja ainda não tem NFC-e de produção autorizada? (proteção da 1ª nota real)
    // NFC-e: função da migration 199; NF-e: função da 204 (se ainda não existir no banco, a consulta falha e o servidor segue sem o limite).
    primeiraNotaProducao: (lojaId, modelo) => (Number(modelo) === 55
      ? doServidor("app_fiscal_producao_primeira_nota_modelo", { p_loja_id: lojaId, p_modelo: 55 })
      : doServidor("app_fiscal_producao_primeira_nota", { p_loja_id: lojaId })),
    limitePrimeiraNota: Number(process.env.FISCAL_PRIMEIRA_NOTA_LIMITE) > 0 ? Number(process.env.FISCAL_PRIMEIRA_NOTA_LIMITE) : 30,
    // 192: grava a data-hora de emissão renovada no reenvio (a consulta posterior recompõe o MESMO XML transmitido).
    renovarDhEmissao: (p) => doServidor("app_fiscal_documento_renovar_dh_emissao", { p_documento_id: p.documentoId, p_dh_emi: p.dhEmi }),
    pendentes: (lojaId) => doServidor("app_fiscal_contingencia_pendentes", { p_loja_id: lojaId, p_limite: 50 }),
    timeoutMs: 30000,
    // Cadeia ICP-Brasil das SEFAZ (ausente do armazenamento padrão do Node).
    ca: cadeiaConfiavelSefaz(),
    // Tributos aproximados (Lei 12.741): tabela IBPT da UF no banco (190), com reserva em arquivo.
    tabelaIbpt: leitorIbpt,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, erro: "Método não permitido." });
  if (!serviceKey() || !supabaseUrl()) return json(res, 503, { ok: false, erro: "Configuração do servidor ausente." });
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { ok: false, erro: "Faça login para continuar." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body?.acao === "enviar_email_xml") {
    try { return await enviarEmailXml(body, token, res); }
    catch (e) {
      console.error("[fiscal-emitir] enviar_email_xml falha inesperada", e?.code || e?.name || "Erro", String(e?.message || "").slice(0, 300));
      return json(res, 500, { ok: false, erro: "Não foi possível concluir. Tente novamente.", codigo: String(e?.code || e?.name || "Erro").slice(0, 40) });
    }
  }
  try {
    const r = await processarEmissao(body || {}, criarDeps(token));
    // A situação da nota vai no corpo; 200 mesmo em rejeição (o caixa precisa do motivo).
    const status = r.code === "FORBIDDEN" ? 403 : r.code && !r.situacao ? 400 : 200;
    return json(res, status, r);
  } catch (e) {
    // Antes a falha sumia sem rastro (500 genérico, nada no log). Registra o tipo e o começo da mensagem (sem segredos: o
    // certificado e as senhas nunca passam por aqui) e devolve só um código curto para quem chamou.
    console.error("[fiscal-emitir] falha inesperada", String(body?.acao || ""), e?.code || e?.name || "Erro", String(e?.message || "").slice(0, 300));
    return json(res, 500, { ok: false, erro: "Não foi possível concluir. Tente novamente.", codigo: String(e?.code || e?.name || "Erro").slice(0, 40) });
  }
}
