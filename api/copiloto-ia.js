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
// ════════════════════════════════════════════════════════════

const MODEL = "claude-opus-4-8"; // modelo Claude mais capaz da família Opus

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada. Defina em Vercel → Settings → Environment Variables e faça um redeploy." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const { resumoDados = "", pergunta = "", historico = [] } = body;
    if (!String(pergunta).trim()) return res.status(400).json({ error: "Pergunta vazia." });

    const system =
      "Você é o Copiloto de Gestão do Pedido Prime, um SaaS de gestão para restaurantes (vendas, mesas, cardápio digital, CRM, estoque e financeiro). " +
      "Responda SEMPRE em português do Brasil, de forma objetiva, prática e acionável, ajudando o gestor a tomar decisões. " +
      "Use apenas os dados do contexto abaixo; se faltar informação, diga objetivamente o que seria preciso. " +
      "Não invente números. Quando recomendar algo, explique brevemente o porquê e priorize impacto no faturamento, ticket médio, retenção de clientes e operação. " +
      "Seja conciso (no máximo alguns parágrafos curtos ou uma lista enxuta).\n\n" +
      "DADOS DO PERÍODO SELECIONADO (contexto):\n" + String(resumoDados || "(sem dados)");

    const messages = [
      ...(Array.isArray(historico) ? historico : []).slice(-8).map((m) => ({
        role: m && m.role === "user" ? "user" : "assistant",
        content: String((m && m.content) || ""),
      })),
      { role: "user", content: String(pergunta) },
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
    });

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
