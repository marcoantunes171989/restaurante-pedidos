// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/ambientes  (Microgate 09 + 11)
//  Central de Ambientes & Releases — contrato READ-ONLY protegido.
//
//  Microgate 11 acrescenta integração GitHub read-only (GET-only, token
//  server-side) para os resources "environments" e "compare". Microgate 13
//  acrescenta integração Vercel read-only (GET-only, token server-side
//  dedicado) para o resource "deployments". Health real de infraestrutura
//  continua fora de escopo: health/history seguem UNKNOWN/not_connected.
//  Protegido: exige Bearer + operador ativo com autorização de Super Admin
//  (mesma condição usada em api/landing-analytics.js — ver checkAuth abaixo).
// ════════════════════════════════════════════════════════════

/* global process */
import https from "node:https";
import crypto from "node:crypto";

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

// ── Vercel read-only provider (deployments) ────────────────────────────
// Tokens de leitura dedicados e independentes por projeto/ambiente
// (VERCEL_HML_READ_TOKEN / VERCEL_PROD_READ_TOKEN) — cada ambiente usa
// SOMENTE o seu próprio token, nunca o do outro ambiente e nunca um token
// genérico compartilhado (sem VERCEL_READ_TOKEN nem VERCEL_TOKEN, que pode
// ter capacidade de deploy no pipeline de Produção). A Vercel não usa mais
// um team compartilhado neste contrato: sem VERCEL_TEAM_ID.
const VERCEL_API_URL = "https://api.vercel.com";
const VERCEL_TIMEOUT_MS = 7000;
const VERCEL_DEPLOYMENTS_LIMIT = 10;
const VERCEL_MAX_ITEMS_TOTAL = 20;

const VERCEL_ENVIRONMENTS = [
  {
    environment: "homologacao", branch: "homologacao", tokenKey: "hmlToken", projectIdKey: "hmlProjectId", cacheKey: "vercel-hml",
  },
  {
    environment: "producao", branch: "main", tokenKey: "prodToken", projectIdKey: "prodProjectId", cacheKey: "vercel-prod",
  },
];

const vercelConfig = () => ({
  hmlToken: process.env.VERCEL_HML_READ_TOKEN || "",
  prodToken: process.env.VERCEL_PROD_READ_TOKEN || "",
  hmlProjectId: process.env.VERCEL_HML_PROJECT_ID || "",
  prodProjectId: process.env.VERCEL_PROD_PROJECT_ID || "",
});

// Configuração é avaliada POR AMBIENTE: HML pode estar configurado enquanto
// PROD não está (e vice-versa) — nunca um gate agregado dos dois.
const vercelConfiguredForEnvironment = (env, cfg) => Boolean(cfg[env.tokenKey] && cfg[env.projectIdKey]);

async function vercelFetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERCEL_TIMEOUT_MS);
  try {
    const response = await fetch(`${VERCEL_API_URL}${path}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    let body = null;
    let parseError = false;
    try {
      body = await response.json();
    } catch {
      parseError = true;
    }
    return { ok: response.ok, status: response.status, body, parseError };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, status: 0, timeout: true };
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

// Normaliza qualquer falha Vercel (rede, timeout, HTTP) num errorCode
// sanitizado — nunca repassa body bruto/stack ao frontend.
function mapVercelError(result) {
  if (result.timeout) return "vercel_timeout";
  if (result.networkError) return "vercel_unavailable";
  if (result.status === 401) return "vercel_auth_failed";
  if (result.status === 403) return "vercel_forbidden";
  if (result.status === 404) return "vercel_not_found";
  if (result.status === 429) return "vercel_rate_limited";
  if (result.status >= 500) return "vercel_unavailable";
  return "vercel_unknown_error";
}

function mapVercelStatus(state) {
  switch (String(state || "").toUpperCase()) {
    case "READY": return "READY";
    case "BUILDING": return "BUILDING";
    case "INITIALIZING": return "INITIALIZING";
    case "QUEUED": return "QUEUED";
    case "ERROR": return "ERROR";
    case "CANCELED": return "CANCELED";
    case "BLOCKED": return "BLOCKED";
    default: return "UNKNOWN";
  }
}

function normalizeVercelUrl(url) {
  const value = clean(url, 300);
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function toIsoTimestamp(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Sanitiza um deployment bruto da Vercel: nunca expõe creator/e-mail, token,
// headers, env/build env, project settings, git credentials, logs ou meta
// completo — apenas os campos necessários para o dashboard.
function sanitizeDeployment(raw, env) {
  const id = clean(raw?.uid ?? raw?.id, 100);
  if (!id) return null;

  const createdAt = toIsoTimestamp(raw?.created ?? raw?.createdAt);
  const readyAt = toIsoTimestamp(raw?.ready ?? raw?.readyAt);
  let durationMs = null;
  if (createdAt && readyAt) {
    const diff = new Date(readyAt).getTime() - new Date(createdAt).getTime();
    if (Number.isFinite(diff) && diff >= 0) durationMs = diff;
  }

  return {
    environment: env.environment,
    id,
    status: mapVercelStatus(raw?.state ?? raw?.readyState),
    url: normalizeVercelUrl(raw?.url),
    createdAt,
    readyAt,
    durationMs,
    commitSha: clean(raw?.meta?.githubCommitSha ?? raw?.meta?.gitCommitSha, 64),
    branch: env.branch,
  };
}

async function fetchVercelDeployments(env, cfg) {
  // Validação isolada por ambiente: a ausência do token/projeto DESTE
  // ambiente nunca impede a consulta do outro ambiente.
  if (!vercelConfiguredForEnvironment(env, cfg)) {
    return { errorCode: "vercel_not_configured", notConfigured: true };
  }

  const cacheKey = `${env.cacheKey}:deployments`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Sem teamId na query — cada projeto é resolvido só por projectId/branch.
  const params = new URLSearchParams({
    projectId: cfg[env.projectIdKey],
    branch: env.branch,
    limit: String(VERCEL_DEPLOYMENTS_LIMIT),
  });
  // Bearer token exclusivo deste ambiente — nunca o token do outro ambiente.
  const result = await vercelFetch(`/v7/deployments?${params.toString()}`, cfg[env.tokenKey]);

  if (!result.ok) return { errorCode: mapVercelError(result) };
  const deploymentsRaw = Array.isArray(result.body?.deployments) ? result.body.deployments : null;
  if (result.parseError || !deploymentsRaw) return { errorCode: "vercel_invalid_response" };

  const truncated = deploymentsRaw.length > VERCEL_DEPLOYMENTS_LIMIT;
  const items = deploymentsRaw
    .slice(0, VERCEL_DEPLOYMENTS_LIMIT)
    .map((item) => sanitizeDeployment(item, env))
    .filter(Boolean);

  const outcome = { items, truncated };
  cacheSet(cacheKey, outcome);
  return outcome;
}

async function deploymentsData() {
  const cfg = vercelConfig();

  // Ambos ausentes: not_configured explícito, sem chamar a Vercel — nunca
  // depende de uma falha de rede para chegar a esse estado.
  const anyEnvironmentConfigured = VERCEL_ENVIRONMENTS.some((env) => vercelConfiguredForEnvironment(env, cfg));
  if (!anyEnvironmentConfigured) {
    return {
      source: "not_configured",
      items: [],
      errors: VERCEL_ENVIRONMENTS.map((env) => ({ environment: env.environment, errorCode: "vercel_not_configured" })),
    };
  }

  const settled = await Promise.allSettled(
    VERCEL_ENVIRONMENTS.map((env) => fetchVercelDeployments(env, cfg)),
  );

  const items = [];
  const errors = [];
  let anyTruncated = false;
  let anyOk = false;
  let anyFail = false;

  settled.forEach((result, idx) => {
    const env = VERCEL_ENVIRONMENTS[idx];
    const outcome = result.status === "fulfilled" ? result.value : { errorCode: "vercel_unknown_error" };
    if (outcome.errorCode) {
      anyFail = true;
      errors.push({ environment: env.environment, errorCode: outcome.errorCode });
      return;
    }
    anyOk = true;
    items.push(...outcome.items);
    if (outcome.truncated) anyTruncated = true;
  });

  const source = anyOk && !anyFail ? "vercel" : anyOk && anyFail ? "partial" : "vercel_error";
  const limitedItems = items.slice(0, VERCEL_MAX_ITEMS_TOTAL);
  const truncated = anyTruncated || items.length > VERCEL_MAX_ITEMS_TOTAL;

  const payload = { source, items: limitedItems };
  if (truncated) payload.truncated = true;
  if (errors.length) payload.errors = errors;
  return payload;
}

// ── Health real (Microgate 15) ──────────────────────────────────────────
// Probes GET-only, sem credenciais, para Frontend e API de cada ambiente.
// URLs FIXAS (constantes) — nunca aceitar url/host/target vindos de query,
// para não transformar este resource num proxy/SSRF. Supabase/Auth/Realtime
// permanecem UNKNOWN/not_connected nesta etapa (fora de escopo).
const HEALTH_TIMEOUT_MS = 5000;
const HEALTH_CACHE_TTL_MS = 15000;

const HEALTH_TARGETS = {
  homologacao: {
    frontend: { url: "https://homologacao.pedidoprime.com.br", cacheKey: "health:hml:frontend" },
    api: { url: "https://homologacao.pedidoprime.com.br/api/session-meta", cacheKey: "health:hml:api" },
  },
  producao: {
    frontend: { url: "https://pedidoprime.com.br", cacheKey: "health:prod:frontend" },
    api: { url: "https://pedidoprime.com.br/api/session-meta", cacheKey: "health:prod:api" },
  },
};

// Cache em memória do processo, separado do cache GitHub/Vercel (chaves
// health:* dedicadas). Mesma política: best-effort, desativado sob VITEST
// (githubCacheEnabled reflete apenas process.env.VITEST, não é específico
// de provider) para que cada teste exerça o probe mockado.
const healthCache = new Map();

function healthCacheGet(key) {
  if (!githubCacheEnabled()) return null;
  const entry = healthCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    healthCache.delete(key);
    return null;
  }
  return entry.value;
}

function healthCacheSet(key, value) {
  if (!githubCacheEnabled()) return;
  healthCache.set(key, { value, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS });
}

// Classifica a resposta HTTP do probe. Nunca ONLINE fora de 2xx — um probe
// público que responde 401/403 indica problema (não confirma indisponibi-
// lidade total, então DEGRADED em vez de OFFLINE). 4xx genérico (ex.: 404)
// também nunca é ONLINE. 5xx é OFFLINE. Status ausente/não numérico é
// resposta impossível de classificar → UNKNOWN.
function classifyHealthResponse(response, latencyMs) {
  const httpStatus = typeof response?.status === "number" ? response.status : null;
  if (httpStatus == null) {
    return { status: "UNKNOWN", errorCode: "health_unexpected_response", latencyMs, httpStatus: null };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "ONLINE", errorCode: null, latencyMs, httpStatus };
  }
  if (httpStatus >= 500) {
    return { status: "OFFLINE", errorCode: "health_http_5xx", latencyMs, httpStatus };
  }
  if (httpStatus >= 400) {
    return { status: "DEGRADED", errorCode: "health_http_4xx", latencyMs, httpStatus };
  }
  // 1xx/3xx residual (fetch já segue redirects; resposta final cai nos
  // ramos acima). Resposta alcançável mas fora do esperado → DEGRADED.
  return { status: "DEGRADED", errorCode: "health_unexpected_response", latencyMs, httpStatus };
}

async function probeHealth(cacheKey, url) {
  const cached = healthCacheGet(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let outcome;
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    outcome = classifyHealthResponse(response, Date.now() - startedAt);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    outcome = err?.name === "AbortError"
      ? { status: "OFFLINE", errorCode: "health_timeout", latencyMs, httpStatus: null }
      : { status: "OFFLINE", errorCode: "health_network_error", latencyMs, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }

  const checked = { ...outcome, checkedAt: new Date().toISOString(), source: "probe" };
  healthCacheSet(cacheKey, checked);
  return checked;
}

// ── Supabase real health (Microgate 17 / correção Microgate 38) ─────────
// Probe GET-only e sem escrita contra a raiz do PostgREST de cada projeto
// Supabase (`/rest/v1/`), autenticado só com a anon key do MESMO ambiente —
// nunca service_role, nunca a anon key do outro ambiente. URLs FIXAS
// (constantes de servidor): nunca aceitar url/host/project vindos de query,
// pelo mesmo motivo de HEALTH_TARGETS acima (evitar proxy/SSRF). O corpo da
// resposta (OpenAPI/schema do PostgREST) nunca é lido nem exposto — só o
// status HTTP é usado para classificar. Auth/Realtime têm probes próprios
// (abaixo).
//
// IMPORTANTE (Microgate 38): este GET em `/rest/v1/` é usado SOMENTE como
// verificação de reachability/policy do API Gateway — ele NÃO valida
// consulta real de tabela nem afirma saúde end-to-end do PostgREST. Desde
// 2026 o Supabase rejeita (401/403) o acesso de chaves public/anon à
// raiz/OpenAPI de `/rest/v1/`; essa rejeição é política esperada do
// gateway, não uma falha — por isso 401/403 aqui classificam como ONLINE.
const SUPABASE_HML_URL = "https://zzixvyspwszewhxzusot.supabase.co";
const SUPABASE_PROD_URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co";

const SUPABASE_TARGETS = {
  homologacao: { url: SUPABASE_HML_URL, cacheKey: "health:hml:supabase" },
  producao: { url: SUPABASE_PROD_URL, cacheKey: "health:prod:supabase" },
};

// Mapeamento fixo ambiente → variável de chave: cada ambiente lê SOMENTE a
// sua própria env var, nunca a do outro (sem fallback cruzado) e nunca
// SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY.
function supabaseAnonKey(environment) {
  if (environment === "homologacao") return process.env.SUPABASE_HML_ANON_KEY || "";
  if (environment === "producao") return process.env.SUPABASE_PROD_ANON_KEY || "";
  return "";
}

// Classifica a resposta HTTP do probe Supabase (contrato §11 do Microgate
// 17, revisado no Microgate 38 — contrato 2026 da raiz `/rest/v1/`). Nunca
// ONLINE fora de 2xx, EXCETO 401/403: na raiz/OpenAPI exata (`/rest/v1/`)
// essa rejeição é a política ESPERADA do API Gateway para chaves
// public/anon (não uma falha de credencial) — por isso classifica ONLINE
// com errorCode nulo e source "policy_probe" (nunca afirma saúde end-to-end
// do PostgREST, só que o gateway está acessível e aplicando a política
// esperada). 404 e demais 4xx residuais → resposta alcançável mas fora do
// esperado → DEGRADED (nunca mascarados como ONLINE). 408 e 5xx → OFFLINE.
// Status ausente/não numérico → impossível classificar → UNKNOWN.
function classifySupabaseResponse(response, latencyMs) {
  const httpStatus = typeof response?.status === "number" ? response.status : null;
  if (httpStatus == null) {
    return { status: "UNKNOWN", errorCode: "supabase_invalid_response", latencyMs, httpStatus: null };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "ONLINE", errorCode: null, latencyMs, httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "ONLINE", errorCode: null, latencyMs, httpStatus, source: "policy_probe",
    };
  }
  if (httpStatus === 408) {
    return { status: "OFFLINE", errorCode: "supabase_timeout", latencyMs, httpStatus };
  }
  if (httpStatus >= 500) {
    return { status: "OFFLINE", errorCode: "supabase_unavailable", latencyMs, httpStatus };
  }
  return { status: "DEGRADED", errorCode: "supabase_unexpected_response", latencyMs, httpStatus };
}

// GET puro, sem body, com apenas o header `apikey` (mínimo necessário) —
// nunca Authorization do operador, nunca service_role, nunca token
// GitHub/Vercel. O corpo da resposta nunca é lido (nem .json() nem .text()):
// só response.status é usado, então o schema do PostgREST nunca chega ao
// payload nem a logs.
async function probeSupabase(cacheKey, url, apikey) {
  const cached = healthCacheGet(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let outcome;
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey },
    });
    outcome = classifySupabaseResponse(response, Date.now() - startedAt);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    outcome = err?.name === "AbortError"
      ? { status: "OFFLINE", errorCode: "supabase_timeout", latencyMs, httpStatus: null }
      : { status: "OFFLINE", errorCode: "supabase_network_error", latencyMs, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }

  // "source: probe" é o default; classifySupabaseResponse pode sobrescrever
  // com "policy_probe" (401/403 na raiz — ver comentário acima) via spread.
  const checked = { source: "probe", ...outcome, checkedAt: new Date().toISOString() };
  healthCacheSet(cacheKey, checked);
  return checked;
}

// Verificação independente por ambiente: sem a anon key correspondente,
// nenhum fetch é feito (§6/§13) — UNKNOWN/not_configured, latencyMs null.
async function supabaseCheck(environment) {
  const target = SUPABASE_TARGETS[environment];
  const apikey = supabaseAnonKey(environment);
  if (!apikey) {
    return { status: "UNKNOWN", checkedAt: null, latencyMs: null, errorCode: "supabase_not_configured", source: "not_configured" };
  }
  return probeSupabase(target.cacheKey, target.url, apikey);
}

// ── Auth real health (Microgate 19) ─────────────────────────────────────
// Probe GET-only e sem escrita contra `/auth/v1/health` (GoTrue) de cada
// projeto Supabase, autenticado só com a anon key do MESMO ambiente — nunca
// service_role, nunca a anon key do outro ambiente. Deliberadamente
// independente de api/auth-health.js (diagnóstico administrativo protegido
// com service_role/RPC/admin-users — escopo maior, não usado aqui). URLs
// FIXAS (constantes de servidor): nunca aceitar url/host/project/ref/target
// vindos de query. O corpo da resposta do GoTrue nunca é lido nem exposto —
// só o status HTTP é usado para classificar. Realtime permanece fora de
// escopo (UNKNOWN/not_connected via notConnectedCheck).
const AUTH_TARGETS = {
  homologacao: { url: SUPABASE_HML_URL, cacheKey: "health:hml:auth" },
  producao: { url: SUPABASE_PROD_URL, cacheKey: "health:prod:auth" },
};

// Mesmo mapeamento fixo ambiente → variável de chave do Supabase real
// (Microgate 17): cada ambiente lê SOMENTE a sua própria anon key, nunca a
// do outro (sem fallback cruzado) e nunca SUPABASE_SERVICE_ROLE_KEY.
function authAnonKey(environment) {
  return supabaseAnonKey(environment);
}

// Classifica a resposta HTTP do probe Auth (contrato §10 do Microgate 19).
// Nunca ONLINE fora de 2xx. 401/403 é problema de credencial (a anon key
// pode estar revogada/errada) → DEGRADED, não OFFLINE. 404 e demais 4xx
// residuais → resposta alcançável mas fora do esperado → DEGRADED. 5xx →
// OFFLINE. Status ausente/não numérico → impossível classificar → UNKNOWN.
function classifyAuthResponse(response, latencyMs) {
  const httpStatus = typeof response?.status === "number" ? response.status : null;
  if (httpStatus == null) {
    return { status: "UNKNOWN", errorCode: "auth_invalid_response", latencyMs, httpStatus: null };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "ONLINE", errorCode: null, latencyMs, httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "DEGRADED", errorCode: "auth_key_rejected", latencyMs, httpStatus };
  }
  if (httpStatus >= 500) {
    return { status: "OFFLINE", errorCode: "auth_unavailable", latencyMs, httpStatus };
  }
  return { status: "DEGRADED", errorCode: "auth_unexpected_response", latencyMs, httpStatus };
}

// GET puro, sem body, com apenas o header `apikey` (mínimo necessário) —
// nunca Authorization do operador, nunca service_role, nunca token
// GitHub/Vercel. O corpo da resposta nunca é lido (nem .json() nem .text()):
// só response.status é usado, então o body do GoTrue nunca chega ao
// payload nem a logs.
async function probeAuth(cacheKey, url, apikey) {
  const cached = healthCacheGet(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let outcome;
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey },
    });
    outcome = classifyAuthResponse(response, Date.now() - startedAt);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    outcome = err?.name === "AbortError"
      ? { status: "OFFLINE", errorCode: "auth_timeout", latencyMs, httpStatus: null }
      : { status: "OFFLINE", errorCode: "auth_network_error", latencyMs, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }

  const checked = { ...outcome, checkedAt: new Date().toISOString(), source: "probe" };
  healthCacheSet(cacheKey, checked);
  return checked;
}

// Verificação independente por ambiente: sem a anon key correspondente,
// nenhum fetch é feito (§6/§13) — UNKNOWN/not_configured, latencyMs null.
async function authCheck(environment) {
  const target = AUTH_TARGETS[environment];
  const apikey = authAnonKey(environment);
  if (!apikey) {
    return { status: "UNKNOWN", checkedAt: null, latencyMs: null, errorCode: "auth_not_configured", source: "not_configured" };
  }
  return probeAuth(target.cacheKey, target.url, apikey);
}

// ── Realtime real health (Microgate 21, corrigido no Microgate 38) ──────
// O antigo probe HTTP (`GET /realtime/v1/api/ping`) foi REMOVIDO: não prova
// mais saúde do Realtime (o gateway aceita a rota mas rejeita a
// public/anon key nesta fase — ver evidência do Microgate 38). Em seu lugar,
// um handshake WebSocket real e mínimo — sem channel, sem subscribe, sem
// broadcast/Presence/postgres_changes, sem enviar nenhum frame WebSocket —
// contra `/realtime/v1/websocket`, autenticado só com a anon key do MESMO
// ambiente (nunca service_role, nunca a anon key do outro ambiente). URLs
// FIXAS (constantes de servidor): nunca aceitar url/host/project/ref/
// realtime/socket vindos de query. O corpo de qualquer resposta HTTP
// (quando o gateway não faz upgrade) nunca é lido nem exposto — só o status
// HTTP/upgrade é usado para classificar. A anon key só é usada no query
// string da própria conexão (contrato do protocolo Realtime) — nunca em
// header, log, exceção ou errorCode.
const REALTIME_TARGETS = {
  homologacao: { url: SUPABASE_HML_URL, cacheKey: "health:hml:realtime" },
  producao: { url: SUPABASE_PROD_URL, cacheKey: "health:prod:realtime" },
};

// Mesmo mapeamento fixo ambiente → variável de chave do Supabase/Auth real:
// cada ambiente lê SOMENTE a sua própria anon key, nunca a do outro (sem
// fallback cruzado) e nunca SUPABASE_SERVICE_ROLE_KEY.
function realtimeAnonKey(environment) {
  return supabaseAnonKey(environment);
}

// Classifica o resultado do handshake WebSocket Realtime (contrato §3 do
// Microgate 38). 101 (upgrade aceito) → ONLINE. 401/403 (key rejeitada pelo
// gateway) → DEGRADED. 429 (rate limit do gateway) → DEGRADED. 5xx →
// OFFLINE. Qualquer outro status HTTP (200 sem upgrade, 404, etc.) ou status
// ausente/não numérico → resposta fora do contrato esperado → UNKNOWN.
function classifyRealtimeHandshake(httpStatus, latencyMs) {
  if (typeof httpStatus !== "number") {
    return { status: "UNKNOWN", errorCode: "realtime_invalid_response", latencyMs, httpStatus: null };
  }
  if (httpStatus === 101) {
    return { status: "ONLINE", errorCode: null, latencyMs, httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "DEGRADED", errorCode: "realtime_key_rejected", latencyMs, httpStatus };
  }
  if (httpStatus === 429) {
    return { status: "DEGRADED", errorCode: "realtime_rate_limited", latencyMs, httpStatus };
  }
  if (httpStatus >= 500) {
    return { status: "OFFLINE", errorCode: "realtime_unavailable", latencyMs, httpStatus };
  }
  return { status: "UNKNOWN", errorCode: "realtime_invalid_response", latencyMs, httpStatus };
}

// Handshake WebSocket real e mínimo via node:https — apenas o GET com
// headers de Upgrade é enviado; a apikey vai SOMENTE no query string da
// conexão (contrato do protocolo Realtime), nunca em header/log/exceção.
// Ao receber o upgrade (101) ou qualquer resposta HTTP normal, o socket é
// destruído IMEDIATAMENTE — nenhum frame WebSocket é enviado, nenhum
// channel/subscribe/broadcast/Presence/postgres_changes é criado. O corpo
// de uma eventual resposta HTTP (quando o gateway não faz upgrade) nunca é
// lido. Estruturado como Promise sobre https.request para permitir mock
// determinístico de node:https nos testes (sem depender de internet).
function performRealtimeHandshake(host, apikey) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const path = `/realtime/v1/websocket?apikey=${encodeURIComponent(apikey)}&vsn=1.0.0`;
    let req;
    try {
      req = https.request({
        host,
        path,
        method: "GET",
        timeout: HEALTH_TIMEOUT_MS,
        headers: {
          Host: host,
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
          "Sec-WebSocket-Version": "13",
        },
      });
    } catch {
      finish({ status: "OFFLINE", errorCode: "realtime_network_error", latencyMs: Date.now() - startedAt, httpStatus: null });
      return;
    }

    req.on("upgrade", (res, socket) => {
      const outcome = classifyRealtimeHandshake(res.statusCode, Date.now() - startedAt);
      socket.destroy();
      finish(outcome);
    });

    req.on("response", (res) => {
      const outcome = classifyRealtimeHandshake(res.statusCode, Date.now() - startedAt);
      res.resume();
      finish(outcome);
    });

    req.on("timeout", () => {
      req.destroy();
      finish({ status: "OFFLINE", errorCode: "realtime_timeout", latencyMs: Date.now() - startedAt, httpStatus: null });
    });

    req.on("error", () => {
      finish({ status: "OFFLINE", errorCode: "realtime_network_error", latencyMs: Date.now() - startedAt, httpStatus: null });
    });

    req.end();
  });
}

async function probeRealtime(cacheKey, url, apikey) {
  const cached = healthCacheGet(cacheKey);
  if (cached) return cached;

  const host = new URL(url).host;
  const outcome = await performRealtimeHandshake(host, apikey);
  const checked = { ...outcome, checkedAt: new Date().toISOString(), source: "probe" };
  healthCacheSet(cacheKey, checked);
  return checked;
}

// Verificação independente por ambiente: sem a anon key correspondente,
// nenhum fetch é feito (§6/§13) — UNKNOWN/not_configured, latencyMs null.
async function realtimeCheck(environment) {
  const target = REALTIME_TARGETS[environment];
  const apikey = realtimeAnonKey(environment);
  if (!apikey) {
    return { status: "UNKNOWN", checkedAt: null, latencyMs: null, errorCode: "realtime_not_configured", source: "not_configured" };
  }
  return probeRealtime(target.cacheKey, target.url, apikey);
}

async function healthData() {
  const probes = [
    { environment: "homologacao", check: "frontend", ...HEALTH_TARGETS.homologacao.frontend },
    { environment: "homologacao", check: "api", ...HEALTH_TARGETS.homologacao.api },
    { environment: "producao", check: "frontend", ...HEALTH_TARGETS.producao.frontend },
    { environment: "producao", check: "api", ...HEALTH_TARGETS.producao.api },
  ];

  // Isolamento: uma falha (rede/timeout) num probe não pode apagar os
  // resultados dos demais — cada probe já captura seus próprios erros, e
  // allSettled garante que mesmo uma rejeição inesperada não propague.
  const settled = await Promise.allSettled(probes.map((p) => probeHealth(p.cacheKey, p.url)));

  const results = { homologacao: {}, producao: {} };
  settled.forEach((result, idx) => {
    const p = probes[idx];
    results[p.environment][p.check] = result.status === "fulfilled"
      ? result.value
      : { status: "UNKNOWN", checkedAt: new Date().toISOString(), latencyMs: null, errorCode: "health_unknown_error", source: "probe" };
  });

  // Supabase HML/PROD são independentes entre si e independentes de
  // Frontend/API/GitHub/Vercel — allSettled próprio, nunca compartilhado.
  const supabaseSettled = await Promise.allSettled([
    supabaseCheck("homologacao"),
    supabaseCheck("producao"),
  ]);
  const supabaseResults = supabaseSettled.map((result) => (result.status === "fulfilled"
    ? result.value
    : { status: "UNKNOWN", checkedAt: new Date().toISOString(), latencyMs: null, errorCode: "supabase_invalid_response", source: "probe" }));

  // Auth HML/PROD são independentes entre si e independentes de
  // Frontend/API/Supabase/GitHub/Vercel — allSettled próprio, nunca
  // compartilhado (Microgate 19, §14).
  const authSettled = await Promise.allSettled([
    authCheck("homologacao"),
    authCheck("producao"),
  ]);
  const authResults = authSettled.map((result) => (result.status === "fulfilled"
    ? result.value
    : { status: "UNKNOWN", checkedAt: new Date().toISOString(), latencyMs: null, errorCode: "auth_invalid_response", source: "probe" }));

  // Realtime HML/PROD são independentes entre si e independentes de
  // Frontend/API/Supabase/Auth/GitHub/Vercel — allSettled próprio, nunca
  // compartilhado (Microgate 21/38, §14). Probe via handshake WebSocket real
  // (upgrade HTTP 101), sem channel/subscribe/broadcast/Presence.
  const realtimeSettled = await Promise.allSettled([
    realtimeCheck("homologacao"),
    realtimeCheck("producao"),
  ]);
  const realtimeResults = realtimeSettled.map((result) => (result.status === "fulfilled"
    ? result.value
    : { status: "UNKNOWN", checkedAt: new Date().toISOString(), latencyMs: null, errorCode: "realtime_invalid_response", source: "probe" }));

  const buildEnvironment = (env, supabase, auth, realtime) => ({
    frontend: results[env].frontend,
    api: results[env].api,
    supabase,
    auth,
    realtime,
  });

  return {
    environments: {
      homologacao: buildEnvironment("homologacao", supabaseResults[0], authResults[0], realtimeResults[0]),
      producao: buildEnvironment("producao", supabaseResults[1], authResults[1], realtimeResults[1]),
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
