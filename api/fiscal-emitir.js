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
//
//  Permissões conferidas no banco com o TOKEN DO USUÁRIO:
//   status, cancelar, substituir, cce → app_fiscal_pode_configurar (admin da loja / super)
//   emitir, contingencia, transmitir_contingencia, pendentes_contingencia →
//     app_pode_receber_pagamento (caixa da loja / super)
//  Certificado (cofre 176) e gravação do resultado (177): service role,
//  só aqui no servidor. Nada sensível volta na resposta.
// ════════════════════════════════════════════════════════════

import process from "node:process";
import { processarEmissao } from "../server/fiscal/emissaoService.js";
import { cadeiaConfiavelSefaz } from "../server/fiscal/sefaz/cadeiaIcp.js";
import { dbParaEmitente } from "../src/lib/emitenteFiscalService.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
    salvarDados: (p) => doServidor("app_fiscal_documento_salvar_dados", { p_documento_id: p.documentoId, p_chave: p.chave, p_dados: p.dados }),
    pendentes: (lojaId) => doServidor("app_fiscal_contingencia_pendentes", { p_loja_id: lojaId, p_limite: 50 }),
    timeoutMs: 30000,
    // Cadeia ICP-Brasil das SEFAZ (ausente do armazenamento padrão do Node).
    ca: cadeiaConfiavelSefaz(),
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
  try {
    const r = await processarEmissao(body || {}, criarDeps(token));
    // A situação da nota vai no corpo; 200 mesmo em rejeição (o caixa precisa do motivo).
    const status = r.code === "FORBIDDEN" ? 403 : r.code && !r.situacao ? 400 : 200;
    return json(res, status, r);
  } catch {
    return json(res, 500, { ok: false, erro: "Não foi possível concluir. Tente novamente." });
  }
}
