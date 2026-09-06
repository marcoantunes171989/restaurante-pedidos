// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/ambientes  (Microgate 09)
//  Central de Ambientes & Releases — contrato READ-ONLY protegido.
//
//  Nesta fase NÃO integra GitHub API, Vercel API nem health real de
//  infraestrutura. Expõe somente um contrato estático/sanitizado que as
//  integrações futuras vão preencher. Protegido: exige Bearer + operador
//  ativo com autorização de Super Admin (mesma condição usada em
//  api/landing-analytics.js — ver checkAuth abaixo).
// ════════════════════════════════════════════════════════════

/* global process */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

// Reaplica a MESMA condição de autorização de api/landing-analytics.js
// (isSuperAdmin): bypass da conta-raiz por e-mail, OU super_admin === true,
// OU (sem loja própria + ids_acesso contendo "admin"). A Central de
// Ambientes expõe topologia/infra, então mantemos o precedente mais
// restritivo do projeto — só que aqui distinguimos 401 (sem token/token
// inválido) de 403 (autenticado mas sem autorização/inativo), conforme
// exigido pelo contrato deste endpoint.
async function checkAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { status: 401, error: "Token ausente." };
  if (!serviceKey() || !baseUrl()) return { status: 500, error: "Configuração do servidor indisponível." };

  let user;
  try {
    const userResponse = await fetch(`${baseUrl()}/auth/v1/user`, {
      headers: { apikey: serviceKey(), authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return { status: 401, error: "Token inválido." };
    user = await userResponse.json();
  } catch {
    return { status: 500, error: "Erro interno ao validar sessão." };
  }

  const email = clean(user?.email, 160)?.toLowerCase();
  if (!email) return { status: 401, error: "Token inválido." };
  // Conta-raiz criada pela migration 013 (mesmo bypass de landing-analytics.js).
  if (email === "admin@restaurante.com") return { status: 200 };

  let rows;
  try {
    const response = await fetch(
      `${baseUrl()}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(email)}&select=ativo,super_admin,loja_id,ids_acesso&limit=1`,
      { headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` } },
    );
    if (!response.ok) return { status: 500, error: "Erro interno ao validar operador." };
    rows = await response.json();
  } catch {
    return { status: 500, error: "Erro interno ao validar operador." };
  }

  const operator = rows?.[0];
  if (!operator || operator.ativo === false) return { status: 403, error: "Acesso restrito ao Super Admin." };
  const authorized = operator.super_admin === true
    || (operator.loja_id == null && Array.isArray(operator.ids_acesso) && operator.ids_acesso.includes("admin"));
  if (!authorized) return { status: 403, error: "Acesso restrito ao Super Admin." };
  return { status: 200 };
}

// ── Contrato estático/sanitizado por resource ──────────────────────────
// Nesta fase não há GitHub/Vercel/health real conectado: todo campo runtime
// assume estado seguro (UNKNOWN / null / not_connected), nunca um valor
// hardcoded como se fosse dado consultado agora.

function environmentsData() {
  return [
    {
      environment: "homologacao",
      label: "Homologação",
      url: "https://homologacao.pedidoprime.com.br",
      branch: "homologacao",
      status: "UNKNOWN",
      commit: null,
      deploy: null,
    },
    {
      environment: "producao",
      label: "Produção",
      url: "https://pedidoprime.com.br",
      branch: "main",
      status: "UNKNOWN",
      commit: null,
      deploy: null,
    },
  ];
}

function compareData() {
  return {
    status: "UNKNOWN",
    ahead: null,
    behind: null,
    mergeBase: null,
    commits: [],
    files: [],
    truncated: false,
    source: "not_connected",
  };
}

function deploymentsData() {
  return { source: "not_connected", items: [] };
}

function healthData() {
  return {
    providers: {
      frontend: "UNKNOWN",
      api: "UNKNOWN",
      supabase: "UNKNOWN",
      auth: "UNKNOWN",
      realtime: "UNKNOWN",
    },
  };
}

function historyData() {
  return { items: [], source: "not_connected" };
}

const RESOURCES = {
  environments: { source: "static", build: environmentsData },
  compare: { source: "not_connected", build: compareData },
  deployments: { source: "not_connected", build: deploymentsData },
  health: { source: "not_connected", build: healthData },
  history: { source: "not_connected", build: historyData },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "method_not_allowed" });
  }

  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });

  // Contrato explícito: resource é obrigatório (sem default implícito) para
  // que o consumidor sempre declare o que espera receber. Ausente ou
  // desconhecido → 400.
  const resource = clean(req.query?.resource, 40);
  const config = resource ? RESOURCES[resource] : null;
  if (!config) return json(res, 400, { error: "resource_invalido" });

  return json(res, 200, {
    ok: true,
    resource,
    source: config.source,
    generatedAt: new Date().toISOString(),
    data: config.build(),
  });
}
