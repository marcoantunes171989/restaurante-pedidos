// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/copiloto-ia
//  "Pergunte ao Copiloto" — chat de gestão com Claude (Anthropic).
//  A chave da API fica SÓ no servidor (env var ANTHROPIC_API_KEY na Vercel),
//  nunca no navegador. O front chama /api/copiloto-ia (mesma origem, sem CORS).
//
//  Sobe automaticamente junto com o deploy do app. Para ativar o chat, defina
//  a variável de ambiente na Vercel:
//    Vercel → Projeto → Settings → Environment Variables →
//      ANTHROPIC_API_KEY = sk-ant-...   (Production)  → Redeploy
//
//  O front é TOLERANTE: sem a chave/função, cai no motor de análise local.
//
//  Segurança: exige um token de sessão Supabase válido (Authorization: Bearer)
//  — o mesmo usado pelo restante do app — antes de consultar a IA. O contexto
//  (resumoDados) já chega pronto e isolado por empresa a partir do front
//  (mesmos dados já filtrados por loja/período usados na tela), então nenhuma
//  consulta nova ao banco é feita aqui.
// ════════════════════════════════════════════════════════════

const MODEL = "claude-opus-4-8"; // modelo Claude mais capaz da família Opus
const PERGUNTA_MAX_LEN = 2000;
const RESUMO_MAX_LEN = 12000;
const TIMEOUT_MS = 25000;

async function usuarioAutenticado(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const url = process.env.VITE_SUPABASE_URL || "https://rwnzggjxhxnfrhstbxkm.supabase.co";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM";
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u?.id;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada. Defina em Vercel → Settings → Environment Variables e faça um redeploy." });
  }

  if (!(await usuarioAutenticado(req))) {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    // Sanitização básica: string, aparada e com limite de tamanho (evita payloads abusivos).
    const pergunta = String(body.pergunta ?? "").trim().slice(0, PERGUNTA_MAX_LEN);
    const resumoDados = String(body.resumoDados ?? "").slice(0, RESUMO_MAX_LEN);
    const historico = Array.isArray(body.historico) ? body.historico : [];
    if (!pergunta) return res.status(400).json({ error: "Pergunta vazia." });

    const system =
      "Você é o Copiloto de Gestão do Pedido Prime, um SaaS de gestão para restaurantes (vendas, mesas, cardápio digital, CRM, estoque e financeiro). " +
      "Responda SEMPRE em português do Brasil, de forma objetiva, prática e acionável, ajudando o gestor a tomar decisões. " +
      "Use apenas os dados do contexto abaixo; se faltar informação, diga objetivamente o que seria preciso. " +
      "Não invente números. Quando recomendar algo, explique brevemente o porquê e priorize impacto no faturamento, ticket médio, retenção de clientes e operação. " +
      "Seja conciso (no máximo alguns parágrafos curtos ou uma lista enxuta).\n\n" +
      "DADOS DO PERÍODO SELECIONADO (contexto):\n" + (resumoDados || "(sem dados)");

    const messages = [
      ...historico.slice(-8).map((m) => ({
        role: m && m.role === "user" ? "user" : "assistant",
        content: String((m && m.content) || "").slice(0, PERGUNTA_MAX_LEN),
      })),
      { role: "user", content: pergunta },
    ];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e?.name === "AbortError") return res.status(504).json({ error: "IA demorou demais para responder. Tente novamente." });
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: (data && data.error && data.error.message) || `Erro ${r.status} na API da IA.` });
    if (data.stop_reason === "refusal") return res.status(200).json({ resposta: "Não consigo responder a essa solicitação." });

    const resposta = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    return res.status(200).json({ resposta, modelo: data.model || MODEL });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
