// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/fiscal-xml-email
//   { ids:[documentoId...], destinatario } → envia o(s) XML(s) por e-mail, em anexo.
//
//  O XML é buscado DE NOVO aqui no servidor (RPC app_fiscal_xml_lote, com o
//  TOKEN DO USUÁRIO — a mesma função e a mesma permissão que a tela de XMLs
//  usa para listar/baixar), nunca confiando no que o navegador mandaria.
//  O envio em si usa a API do Resend (chave RESEND_API_KEY, configurada só
//  na Vercel — nunca aparece aqui no código nem na resposta).
// ════════════════════════════════════════════════════════════

import process from "node:process";
import { Buffer } from "node:buffer";
import { nomeArquivoXml } from "../src/lib/fiscal/xmlNota.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const resendKey = () => process.env.RESEND_API_KEY || "";
const remetente = () => process.env.FISCAL_EMAIL_REMETENTE || "Pedido Prime <fiscal@pedidoprime.com.br>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_NOTAS = 20;

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

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, erro: "Método não permitido." });
  if (!resendKey()) return json(res, 503, { ok: false, code: "SEM_EMAIL", erro: "Envio por e-mail ainda não está configurado neste ambiente." });
  if (!supabaseUrl() || !anonKey()) return json(res, 503, { ok: false, erro: "Configuração do servidor ausente." });
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { ok: false, erro: "Faça login para continuar." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const ids = Array.from(new Set(Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : []));
  const destinatario = String(body?.destinatario || "").trim();
  if (!ids.length) return json(res, 400, { ok: false, code: "SEM_NOTAS", erro: "Nenhuma nota selecionada." });
  if (ids.length > LIMITE_NOTAS) return json(res, 400, { ok: false, code: "LOTE_GRANDE", erro: `No máximo ${LIMITE_NOTAS} notas por envio.` });
  if (!EMAIL_RE.test(destinatario)) return json(res, 400, { ok: false, code: "EMAIL_INVALIDO", erro: "Informe um e-mail válido para enviar." });

  try {
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
        from: remetente(),
        to: [destinatario],
        subject: `XML${plural} fiscal${plural} — ${xmls.length} nota(s)`,
        text: `Em anexo o(s) XML(s) fiscal(is):\n\n${linhas}\n`,
        attachments: anexos,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[fiscal-xml-email] Resend HTTP", resp.status, String(txt).slice(0, 300));
      return json(res, 502, { ok: false, code: "ENVIO_FALHOU", erro: "Não foi possível enviar o e-mail agora. Tente novamente." });
    }
    return json(res, 200, { ok: true, enviados: xmls.length });
  } catch (e) {
    console.error("[fiscal-xml-email] falha inesperada", e?.code || e?.name || "Erro", String(e?.message || "").slice(0, 300));
    return json(res, 500, { ok: false, erro: "Não foi possível concluir. Tente novamente.", codigo: String(e?.code || e?.name || "Erro").slice(0, 40) });
  }
}
