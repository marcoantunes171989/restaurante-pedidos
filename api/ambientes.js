// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/ambientes  (Microgate 09 + 11)
//  Central de Ambientes & Releases — contrato READ-ONLY protegido.
//
//  Microgate 11 acrescenta integração GitHub read-only (GET-only, token
//  server-side) para os resources "environments" e "compare". Vercel API e
//  health real de infraestrutura continuam fora de escopo: deployment/health
//  seguem UNKNOWN/not_connected. Protegido: exige Bearer + operador ativo com
//  autorização de Super Admin (mesma condição usada em api/landing-analytics.js
//  — ver checkAuth abaixo).
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

// ── GitHub read-only provider ──────────────────────────────────────────
// Repositório oficial. Branch de produção = main, branch de homologação =
// homologacao. "master" é LEGACY_INACTIVE e não deve ser usada.
const GITHUB_OWNER = "marcoantunes171989";
const GITHUB_REPO = "restaurante-pedidos";
const GITHUB_BASE_BRANCH = "main";
const GITHUB_HEAD_BRANCH = "homologacao";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 7000;
const GITHUB_ITEM_LIMIT = 100;

const githubToken = () => process.env.GITHUB_READ_TOKEN || "";

// Cache em memória do processo, best-effort: não garante compartilhamento
// entre instâncias/regiões da Serverless Function nem sobrevive a cold
// start — serve apenas para evitar chamadas idênticas em rajada. Desativado
// sob o test runner (vitest define VITEST=true) para que cada teste exercite
// a chamada GitHub real (mockada) em vez de reaproveitar cache de outro teste.
const GITHUB_CACHE_TTL_MS = 30000;
const githubCache = new Map();
const githubCacheEnabled = () => process.env.VITEST !== "true";

function cacheGet(key) {
  if (!githubCacheEnabled()) return null;
  const entry = githubCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    githubCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (!githubCacheEnabled()) return;
  githubCache.set(key, { value, expiresAt: Date.now() + GITHUB_CACHE_TTL_MS });
}

async function githubFetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PedidoPrime-Ambientes/1.0",
      },
    });
    let body = null;
    let parseError = false;
    try {
      body = await response.json();
    } catch {
      parseError = true;
    }
    const rateLimitRemaining = typeof response.headers?.get === "function"
      ? response.headers.get("x-ratelimit-remaining")
      : null;
    return { ok: response.ok, status: response.status, body, parseError, rateLimitRemaining };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, status: 0, timeout: true };
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

// Normaliza qualquer falha GitHub (rede, timeout, HTTP) num errorCode
// sanitizado — nunca repassa body bruto/stack ao frontend.
function mapGithubError(result) {
  if (result.timeout) return "github_timeout";
  if (result.networkError) return "github_unavailable";
  if (result.status === 401) return "github_auth_failed";
  if (result.status === 403) {
    const message = String(result.body?.message || "").toLowerCase();
    if (result.rateLimitRemaining === "0" || message.includes("rate limit")) return "github_rate_limited";
    return "github_forbidden";
  }
  if (result.status === 404) return "github_not_found";
  if (result.status >= 500) return "github_unavailable";
  return "github_unknown_error";
}

async function fetchBranch(branch, token) {
  const cacheKey = `branch:${branch}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const result = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${branch}`, token);
  if (result.ok) cacheSet(cacheKey, result);
  return result;
}

async function fetchCompare(token) {
  const cacheKey = `compare:${GITHUB_BASE_BRANCH}...${GITHUB_HEAD_BRANCH}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const result = await githubFetch(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${GITHUB_BASE_BRANCH}...${GITHUB_HEAD_BRANCH}`,
    token,
  );
  if (result.ok) cacheSet(cacheKey, result);
  return result;
}

// Sanitiza um objeto de commit do GitHub (mesmo formato em branches.commit e
// compare.commits[i]): nunca expõe e-mail do autor, trunca mensagem à
// primeira linha (<=200 chars).
function sanitizeCommit(raw) {
  const sha = raw?.sha ? String(raw.sha) : null;
  if (!sha) return null;
  const firstLine = clean(raw?.commit?.message, 2000)?.split("\n")[0]?.slice(0, 200) || "";
  const author = clean(raw?.commit?.author?.name, 100) || clean(raw?.author?.login, 100) || null;
  const committedAt = raw?.commit?.author?.date || null;
  return { sha, shortSha: sha.slice(0, 7), message: firstLine, author, committedAt };
}

function mapCompareStatus(status) {
  switch (status) {
    case "identical": return "SYNCED";
    case "ahead": return "HML_AHEAD";
    case "behind": return "PROD_AHEAD";
    case "diverged": return "DIVERGED";
    default: return "UNKNOWN";
  }
}

function mapChangeType(status) {
  if (status === "added") return "added";
  if (status === "modified") return "modified";
  if (status === "removed") return "deleted";
  if (status === "renamed") return "renamed";
  return "unknown";
}

// ── Contrato por resource ───────────────────────────────────────────────
// Nesta fase deployment/health continuam sem integração real: todo campo
// runtime desses assume estado seguro (UNKNOWN / null / not_connected).

async function environmentsData() {
  const token = githubToken();
  const definitions = [
    {
      environment: "homologacao",
      label: "Homologação",
      url: "https://homologacao.pedidoprime.com.br",
      branch: "homologacao",
    },
    {
      environment: "producao",
      label: "Produção",
      url: "https://pedidoprime.com.br",
      branch: "main",
    },
  ];

  if (!token) {
    return definitions.map((env) => ({
      ...env,
      status: "UNKNOWN",
      commit: null,
      deploy: null,
      source: "not_configured",
    }));
  }

  return Promise.all(definitions.map(async (env) => {
    const result = await fetchBranch(env.branch, token);
    if (!result.ok) {
      return {
        ...env,
        status: "UNKNOWN",
        commit: null,
        deploy: null,
        source: "github_error",
        errorCode: mapGithubError(result),
      };
    }
    if (result.parseError || !result.body?.commit) {
      return {
        ...env,
        status: "UNKNOWN",
        commit: null,
        deploy: null,
        source: "github_error",
        errorCode: "github_invalid_response",
      };
    }
    return {
      ...env,
      status: "UNKNOWN",
      commit: sanitizeCommit(result.body.commit),
      deploy: null,
      source: "github",
    };
  }));
}

async function compareData() {
  const token = githubToken();
  if (!token) {
    return {
      status: "UNKNOWN",
      source: "not_configured",
      errorCode: "github_not_configured",
      ahead: null,
      behind: null,
      mergeBase: null,
      commits: [],
      files: [],
      truncated: false,
    };
  }

  const result = await fetchCompare(token);

  if (!result.ok) {
    return {
      status: "UNKNOWN",
      source: "github_error",
      errorCode: mapGithubError(result),
      ahead: null,
      behind: null,
      mergeBase: null,
      commits: [],
      files: [],
      truncated: false,
    };
  }

  if (result.parseError || !result.body || typeof result.body !== "object") {
    return {
      status: "UNKNOWN",
      source: "github_error",
      errorCode: "github_invalid_response",
      ahead: null,
      behind: null,
      mergeBase: null,
      commits: [],
      files: [],
      truncated: false,
    };
  }

  const body = result.body;
  const commitsRaw = Array.isArray(body.commits) ? body.commits : [];
  const filesRaw = Array.isArray(body.files) ? body.files : [];

  // direction: fluxo mapeado é HML → PROD (base=main, head=homologacao).
  const commits = commitsRaw.slice(0, GITHUB_ITEM_LIMIT).map((c) => {
    const sanitized = sanitizeCommit(c);
    return sanitized ? { ...sanitized, direction: "pending_to_prod" } : null;
  }).filter(Boolean);

  const files = filesRaw.slice(0, GITHUB_ITEM_LIMIT).map((f) => ({
    path: clean(f?.filename, 500),
    changeType: mapChangeType(f?.status),
  }));

  return {
    status: mapCompareStatus(body.status),
    source: "github",
    ahead: typeof body.ahead_by === "number" ? body.ahead_by : null,
    behind: typeof body.behind_by === "number" ? body.behind_by : null,
    mergeBase: body.merge_base_commit?.sha ? String(body.merge_base_commit.sha) : null,
    commits,
    files,
    truncated: commitsRaw.length > GITHUB_ITEM_LIMIT || filesRaw.length > GITHUB_ITEM_LIMIT,
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

const RESOURCE_ENVELOPE_SOURCE = {
  environments: "static",
  compare: "not_connected",
  deployments: "not_connected",
  health: "not_connected",
  history: "not_connected",
};

const RESOURCES = {
  environments: environmentsData,
  compare: compareData,
  deployments: deploymentsData,
  health: healthData,
  history: historyData,
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
  const build = resource ? RESOURCES[resource] : null;
  if (!build) return json(res, 400, { error: "resource_invalido" });

  const data = await build();
  // Para "compare" o source depende do runtime (not_configured/github/
  // github_error); para os demais resources permanece o rótulo estático.
  const envelopeSource = (data && typeof data === "object" && !Array.isArray(data) && "source" in data)
    ? data.source
    : RESOURCE_ENVELOPE_SOURCE[resource];

  return json(res, 200, {
    ok: true,
    resource,
    source: envelopeSource,
    generatedAt: new Date().toISOString(),
    data,
  });
}
