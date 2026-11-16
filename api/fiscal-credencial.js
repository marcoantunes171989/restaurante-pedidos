// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/fiscal-credencial
//  Recebe do painel o certificado A1 (.pfx em base64) + senha, ou o CSC,
//  valida no servidor e guarda no cofre (Supabase Vault, migration 176).
//
//  - Exige o login do usuário (Bearer). A permissão é conferida NO BANCO,
//    com o próprio token do usuário: app_fiscal_pode_configurar(loja)
//    (admin da loja ou super admin — migration 175).
//  - A gravação usa a SERVICE ROLE (só aqui no servidor) nas RPCs da 176.
//  - Nunca devolve nem registra em log o arquivo, a senha ou o CSC.
// ════════════════════════════════════════════════════════════

import process from "node:process";
import { processarCredencial } from "../server/fiscal/credencialService.js";

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
  let data;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
  if (!r.ok) {
    const err = new Error(`RPC ${nome} HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function restServico(path) {
  const r = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`REST HTTP ${r.status}`);
  return r.json();
}

export function criarDeps(tokenUsuario) {
  return {
    podeConfigurar: async (lojaId) => {
      try { return (await rpc("app_fiscal_pode_configurar", { p_loja_id: lojaId }, tokenUsuario)) === true; } catch { return false; }
    },
    documentoDaLoja: async (lojaId) => {
      // 185: por função do servidor (no HML o service_role não lê tab_lojas direto).
      const r = await rpc("app_fiscal_loja_servidor", { p_loja_id: Number(lojaId) }, serviceKey());
      return r?.ok ? r.documento || "" : "";
    },
    registrar: async (p) => rpc("app_fiscal_credencial_registrar", {
      p_loja_id: p.lojaId, p_tipo: p.tipo, p_ambiente: p.ambiente ?? null, p_titular: p.titular ?? null,
      p_documento_titular: p.documentoTitular ?? null, p_id_csc: p.idCsc ?? null,
      p_validade_inicio: p.validadeInicio ?? null, p_validade_fim: p.validadeFim ?? null, p_segredo: p.segredo,
    }, serviceKey()),
    revogar: async (id, lojaId) => {
      const rows = await restServico(`/loja_fiscal_credencial?id=eq.${encodeURIComponent(id)}&loja_id=eq.${Number(lojaId)}&select=id`);
      if (!rows?.length) return { ok: false, code: "NAO_ENCONTRADO" };
      return rpc("app_fiscal_credencial_revogar", { p_id: id }, serviceKey());
    },
    agora: () => new Date(),
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
    const r = await processarCredencial(body || {}, criarDeps(token));
    const status = r.ok ? 200 : r.code === "FORBIDDEN" ? 403 : 400;
    return json(res, status, r);
  } catch {
    // Sem detalhes: o erro pode carregar dados sensíveis do pedido.
    return json(res, 500, { ok: false, erro: "Não foi possível concluir. Tente novamente." });
  }
}
