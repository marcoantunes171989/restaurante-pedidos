// ════════════════════════════════════════════════════════════
//  Edge Function: copiloto-ia
//  "Pergunte ao Copiloto" — chat de gestão com Claude (Anthropic).
//  A chave da API fica SOMENTE no servidor (secret ANTHROPIC_API_KEY),
//  nunca no front. O front chama via supabase.functions.invoke('copiloto-ia').
//
//  Deploy (uma vez):
//    supabase functions deploy copiloto-ia
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
//  O front é TOLERANTE: se a função não estiver publicada ou der erro,
//  ele cai no motor de análise local (Copiloto de Gestão).
// ════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-opus-4-8"; // modelo Claude mais capaz da família Opus

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY não configurada na Edge Function (rode: supabase secrets set ANTHROPIC_API_KEY=...)." }, 500);
  }

  try {
    const { resumoDados = "", pergunta = "", historico = [] } = await req.json();
    if (!String(pergunta).trim()) return json({ error: "Pergunta vazia." }, 400);

    const system =
      "Você é o Copiloto de Gestão do Pedido Prime, um SaaS de gestão para restaurantes (vendas, mesas, cardápio digital, CRM, estoque e financeiro). " +
      "Responda SEMPRE em português do Brasil, de forma objetiva, prática e acionável, ajudando o gestor a tomar decisões. " +
      "Use apenas os dados do contexto abaixo; se faltar informação, diga objetivamente o que seria preciso. " +
      "Não invente números. Quando recomendar algo, explique brevemente o porquê e priorize impacto no faturamento, ticket médio, retenção de clientes e operação. " +
      "Seja conciso (no máximo alguns parágrafos curtos ou uma lista enxuta).\n\n" +
      "DADOS DO PERÍODO SELECIONADO (contexto):\n" + String(resumoDados || "(sem dados)");

    const messages = [
      ...(Array.isArray(historico) ? historico : []).slice(-8).map((m: { role?: string; content?: string }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content || ""),
      })),
      { role: "user", content: String(pergunta) },
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
    });

    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || `Erro ${r.status} na API da IA.` }, 502);
    if (data.stop_reason === "refusal") return json({ resposta: "Não consigo responder a essa solicitação." });

    const resposta = (data.content || [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text || "")
      .join("\n")
      .trim();

    return json({ resposta, modelo: data.model || MODEL });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
