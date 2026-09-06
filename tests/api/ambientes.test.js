/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/ambientes.js";

// ════════════════════════════════════════════════════════════
// Microgate 09 — /api/ambientes: backend read-only protegido.
// Cobre método, autenticação/autorização e os 5 resources do contrato.
// Microgate 11 acrescenta integração GitHub read-only (environments/compare).
// Nenhum teste chama Homologação/Produção/GitHub reais: fetch é sempre
// mockado.
// ════════════════════════════════════════════════════════════

function makeReq({ method = "GET", headers = {}, query = {} } = {}) {
  return { method, headers, query };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) { this.body = payload; },
    json() { return JSON.parse(this.body); },
  };
}

// `github`/`vercel` são funções (url) => respostaMock, chamadas para toda
// requisição a api.github.com / api.vercel.com. Sem elas, uma chamada
// inesperada falha o teste.
function mockFetch({
  userOk = true,
  email = "super@teste.com",
  operatorOk = true,
  operatorRows = [],
  github,
  vercel,
  health,
  supabaseHealth,
  authHealth,
  realtimeHealth,
} = {}) {
  const fn = vi.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      if (!userOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      if (!operatorOk) return { ok: false, json: async () => [] };
      return { ok: true, json: async () => operatorRows };
    }
    if (target.includes("api.github.com")) {
      if (typeof github !== "function") throw new Error(`github fetch inesperado no teste: ${target}`);
      return github(target);
    }
    if (target.includes("api.vercel.com")) {
      if (typeof vercel !== "function") throw new Error(`vercel fetch inesperado no teste: ${target}`);
      return vercel(target);
    }
    if (target === AUTH_HML_PROBE_URL || target === AUTH_PROD_PROBE_URL) {
      if (typeof authHealth !== "function") throw new Error(`auth health fetch inesperado no teste: ${target}`);
      return authHealth(target, options);
    }
    if (target === SUPABASE_HML_PROBE_URL || target === SUPABASE_PROD_PROBE_URL) {
      if (typeof supabaseHealth !== "function") throw new Error(`supabase health fetch inesperado no teste: ${target}`);
      return supabaseHealth(target, options);
    }
    if (target === REALTIME_HML_PROBE_URL || target === REALTIME_PROD_PROBE_URL) {
      if (typeof realtimeHealth !== "function") throw new Error(`realtime health fetch inesperado no teste: ${target}`);
      return realtimeHealth(target, options);
    }
    if (target.includes("pedidoprime.com.br")) {
      if (typeof health !== "function") throw new Error(`health fetch inesperado no teste: ${target}`);
      return health(target, options);
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function githubOk(body, headers = {}) {
  return { ok: true, status: 200, json: async () => body, headers: { get: (k) => headers[k] ?? null } };
}

function githubError(status, body = {}, headers = {}) {
  return { ok: false, status, json: async () => body, headers: { get: (k) => headers[k] ?? null } };
}

function githubAbort() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}

function makeCommit(sha, { message = "feat: ajuste", author = "marco", email: authorEmail = "marco@example.com", date = "2026-01-01T10:00:00Z" } = {}) {
  return {
    sha,
    commit: { message, author: { name: author, email: authorEmail, date } },
    author: { login: author },
  };
}

function githubBranchHandler({ homologacao, main } = {}) {
  return (url) => {
    if (url.includes("/branches/homologacao")) return homologacao();
    if (url.includes("/branches/main")) return main();
    throw new Error(`branch inesperada no teste: ${url}`);
  };
}

function vercelOk(deployments) {
  return { ok: true, status: 200, json: async () => ({ deployments }) };
}

function vercelError(status, body = {}) {
  return { ok: false, status, json: async () => body };
}

function vercelAbort() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}

function makeDeployment(uid, {
  state = "READY",
  url = `${uid}.vercel.app`,
  created = Date.parse("2026-01-01T10:00:00Z"),
  ready = Date.parse("2026-01-01T10:02:00Z"),
  githubCommitSha = "abc1234567890",
} = {}) {
  return {
    uid,
    url,
    state,
    created,
    ready,
    meta: githubCommitSha ? { githubCommitSha } : {},
  };
}

function vercelHandler({ homologacao, producao } = {}) {
  return (url) => {
    if (url.includes(`projectId=${VERCEL_HML_PROJECT_ID}`)) return homologacao();
    if (url.includes(`projectId=${VERCEL_PROD_PROJECT_ID}`)) return producao();
    throw new Error(`projeto vercel inesperado no teste: ${url}`);
  };
}

const VERCEL_HML_PROJECT_ID = "prj-hml";
const VERCEL_PROD_PROJECT_ID = "prj-prod";

function setVercelEnv() {
  process.env.VERCEL_READ_TOKEN = "token-vercel-teste";
  process.env.VERCEL_TEAM_ID = "team-teste";
  process.env.VERCEL_HML_PROJECT_ID = VERCEL_HML_PROJECT_ID;
  process.env.VERCEL_PROD_PROJECT_ID = VERCEL_PROD_PROJECT_ID;
}

const HML_FRONTEND_URL = "https://homologacao.pedidoprime.com.br";
const HML_API_URL = "https://homologacao.pedidoprime.com.br/api/session-meta";
const PROD_FRONTEND_URL = "https://pedidoprime.com.br";
const PROD_API_URL = "https://pedidoprime.com.br/api/session-meta";

function healthOk(status = 200) {
  return { ok: status >= 200 && status < 300, status };
}

function healthError(status) {
  return { ok: false, status };
}

function healthTimeout() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}

function healthNetworkError() {
  throw new Error("network fail");
}

// Handler padrão: todos os 4 probes 200 salvo overrides explícitos.
function healthHandler({ hmlFrontend, hmlApi, prodFrontend, prodApi } = {}) {
  return (url) => {
    if (url === HML_API_URL) return (hmlApi || healthOk)();
    if (url === HML_FRONTEND_URL) return (hmlFrontend || healthOk)();
    if (url === PROD_API_URL) return (prodApi || healthOk)();
    if (url === PROD_FRONTEND_URL) return (prodFrontend || healthOk)();
    throw new Error(`health url inesperada no teste: ${url}`);
  };
}

// ── Microgate 17 — Supabase real (HML + PROD) ──────────────────────────
const SUPABASE_HML_PROBE_URL = "https://zzixvyspwszewhxzusot.supabase.co/rest/v1/";
const SUPABASE_PROD_PROBE_URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co/rest/v1/";
const SUPABASE_HML_ANON_KEY = "anon-hml-teste";
const SUPABASE_PROD_ANON_KEY = "anon-prod-teste";

function setSupabaseHmlKey() { process.env.SUPABASE_HML_ANON_KEY = SUPABASE_HML_ANON_KEY; }
function setSupabaseProdKey() { process.env.SUPABASE_PROD_ANON_KEY = SUPABASE_PROD_ANON_KEY; }

function supabaseHealthOk(status = 200) {
  return { ok: status >= 200 && status < 300, status };
}
function supabaseHealthError(status) {
  return { ok: false, status };
}
function supabaseHealthTimeout() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}
function supabaseHealthNetworkError() {
  throw new Error("network fail");
}

// Handler padrão: HML e PROD 200 salvo overrides explícitos.
function supabaseHealthHandler({ hml, prod } = {}) {
  return (url) => {
    if (url === SUPABASE_HML_PROBE_URL) return (hml || supabaseHealthOk)();
    if (url === SUPABASE_PROD_PROBE_URL) return (prod || supabaseHealthOk)();
    throw new Error(`supabase health url inesperada no teste: ${url}`);
  };
}

// ── Microgate 19 — Auth real (HML + PROD) ──────────────────────────────
// Reutiliza as MESMAS anon keys do Supabase real (SUPABASE_HML_ANON_KEY /
// SUPABASE_PROD_ANON_KEY, ver §4 do Microgate 19) — o probe Auth só muda o
// path (/auth/v1/health em vez de /rest/v1/).
const AUTH_HML_PROBE_URL = "https://zzixvyspwszewhxzusot.supabase.co/auth/v1/health";
const AUTH_PROD_PROBE_URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co/auth/v1/health";

function authHealthOk(status = 200) {
  return { ok: status >= 200 && status < 300, status };
}
function authHealthError(status) {
  return { ok: false, status };
}
function authHealthTimeout() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}
function authHealthNetworkError() {
  throw new Error("network fail");
}

// Handler padrão: HML e PROD 200 salvo overrides explícitos. Também serve
// como default seguro para testes que não fazem asserções sobre Auth mas
// configuram as anon keys (que agora disparam o probe Auth como efeito
// colateral) — o handler só é chamado se o probe realmente ocorrer.
function authHealthHandler({ hml, prod } = {}) {
  return (url) => {
    if (url === AUTH_HML_PROBE_URL) return (hml || authHealthOk)();
    if (url === AUTH_PROD_PROBE_URL) return (prod || authHealthOk)();
    throw new Error(`auth health url inesperada no teste: ${url}`);
  };
}

// ── Microgate 21 — Realtime real (HML + PROD) ──────────────────────────
// Reutiliza as MESMAS anon keys do Supabase/Auth real (SUPABASE_HML_ANON_KEY
// / SUPABASE_PROD_ANON_KEY) — o probe Realtime só muda o path
// (/realtime/v1/api/ping, HTTP-only — nunca WebSocket/channel/subscribe).
const REALTIME_HML_PROBE_URL = "https://zzixvyspwszewhxzusot.supabase.co/realtime/v1/api/ping";
const REALTIME_PROD_PROBE_URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co/realtime/v1/api/ping";

function realtimeHealthOk(status = 200) {
  return { ok: status >= 200 && status < 300, status };
}
function realtimeHealthError(status) {
  return { ok: false, status };
}
function realtimeHealthTimeout() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}
function realtimeHealthNetworkError() {
  throw new Error("network fail");
}

// Handler padrão: HML e PROD 200 salvo overrides explícitos. Também serve
// como default seguro para testes que não fazem asserções sobre Realtime mas
// configuram as anon keys (que agora disparam o probe Realtime como efeito
// colateral) — o handler só é chamado se o probe realmente ocorrer.
function realtimeHealthHandler({ hml, prod } = {}) {
  return (url) => {
    if (url === REALTIME_HML_PROBE_URL) return (hml || realtimeHealthOk)();
    if (url === REALTIME_PROD_PROBE_URL) return (prod || realtimeHealthOk)();
    throw new Error(`realtime health url inesperada no teste: ${url}`);
  };
}

const superAdminRow = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.VERCEL_READ_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.VERCEL_HML_PROJECT_ID;
  delete process.env.VERCEL_PROD_PROJECT_ID;
  delete process.env.SUPABASE_HML_ANON_KEY;
  delete process.env.SUPABASE_PROD_ANON_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.VERCEL_READ_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.VERCEL_HML_PROJECT_ID;
  delete process.env.VERCEL_PROD_PROJECT_ID;
  delete process.env.SUPABASE_HML_ANON_KEY;
  delete process.env.SUPABASE_PROD_ANON_KEY;
});

describe("ambientes — método", () => {
  it("método não GET → 405", async () => {
    mockFetch();
    const res = makeRes();
    await handler(makeReq({ method: "POST" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET");
  });
});

describe("ambientes — autenticação", () => {
  it("GET sem Authorization → 401", async () => {
    const fn = mockFetch();
    const res = makeRes();
    await handler(makeReq({ query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("Bearer inválido → 401", async () => {
    mockFetch({ userOk: false });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer invalido" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("usuário autenticado porém não autorizado → 403", async () => {
    mockFetch({ operatorRows: [{ ativo: true, super_admin: false, loja_id: 5, ids_acesso: [] }] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("usuário inativo → 403", async () => {
    mockFetch({ operatorRows: [{ ativo: false, super_admin: true, loja_id: null, ids_acesso: [] }] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe("ambientes — resources (superAdmin válido)", () => {
  it("resource=environments → 200", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.resource).toBe("environments");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((e) => e.status === "UNKNOWN")).toBe(true);
  });

  it("resource=compare → 200 + UNKNOWN", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("UNKNOWN");
  });

  it("resource=deployments sem config Vercel → 200 + not_configured", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("not_configured");
    expect(body.data.errorCode).toBe("vercel_not_configured");
  });

  it("resource=health → 200 + supabase/auth/realtime UNKNOWN nos dois ambientes", async () => {
    mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);
    const { environments } = res.json().data;
    for (const env of ["homologacao", "producao"]) {
      expect(environments[env].supabase.status).toBe("UNKNOWN");
      expect(environments[env].auth.status).toBe("UNKNOWN");
      expect(environments[env].realtime.status).toBe("UNKNOWN");
    }
  });

  it("resource=history → 200 + vazio/not_connected", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "history" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("not_connected");
  });

  it("resource inválido → 400", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "invalido" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("resource ausente → 400 (contrato explícito, sem default implícito)", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 15 — health real de Frontend/API (HML + PROD).
// Todo fetch de health é mockado (healthHandler/healthOk/healthError/
// healthTimeout/healthNetworkError) — nenhum teste chama
// homologacao.pedidoprime.com.br ou pedidoprime.com.br de verdade.
// Supabase/Auth/Realtime continuam UNKNOWN/not_connected (fora de escopo).
// ════════════════════════════════════════════════════════════
describe("ambientes — health real: Frontend/API (HML + PROD)", () => {
  async function callHealth(health) {
    mockFetch({ operatorRows: [superAdminRow], health });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    return res;
  }

  it("HML frontend 200 → ONLINE", async () => {
    const res = await callHealth(healthHandler());
    expect(res.json().data.environments.homologacao.frontend.status).toBe("ONLINE");
  });

  it("HML API 200 → ONLINE", async () => {
    const res = await callHealth(healthHandler());
    expect(res.json().data.environments.homologacao.api.status).toBe("ONLINE");
  });

  it("PROD frontend 200 → ONLINE", async () => {
    const res = await callHealth(healthHandler());
    expect(res.json().data.environments.producao.frontend.status).toBe("ONLINE");
  });

  it("PROD API 200 → ONLINE", async () => {
    const res = await callHealth(healthHandler());
    expect(res.json().data.environments.producao.api.status).toBe("ONLINE");
  });

  it("frontend 500 → OFFLINE", async () => {
    const res = await callHealth(healthHandler({ hmlFrontend: () => healthError(500) }));
    const check = res.json().data.environments.homologacao.frontend;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("health_http_5xx");
  });

  it("API 500 → OFFLINE", async () => {
    const res = await callHealth(healthHandler({ prodApi: () => healthError(500) }));
    const check = res.json().data.environments.producao.api;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("health_http_5xx");
  });

  it("404 → nunca ONLINE", async () => {
    const res = await callHealth(healthHandler({ hmlApi: () => healthError(404) }));
    expect(res.json().data.environments.homologacao.api.status).not.toBe("ONLINE");
  });

  it("timeout → OFFLINE + health_timeout", async () => {
    const res = await callHealth(healthHandler({ prodFrontend: healthTimeout }));
    const check = res.json().data.environments.producao.frontend;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("health_timeout");
  });

  it("network error → OFFLINE + health_network_error", async () => {
    const res = await callHealth(healthHandler({ hmlFrontend: healthNetworkError }));
    const check = res.json().data.environments.homologacao.frontend;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("health_network_error");
  });

  it("resposta inesperada (status não numérico) → não ONLINE", async () => {
    const res = await callHealth(healthHandler({ prodApi: () => ({ ok: false, status: undefined }) }));
    const check = res.json().data.environments.producao.api;
    expect(["DEGRADED", "UNKNOWN"]).toContain(check.status);
  });

  it("HML falha e PROD funciona → resultados independentes", async () => {
    const res = await callHealth(healthHandler({ hmlFrontend: () => healthError(500), hmlApi: () => healthError(500) }));
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.frontend.status).toBe("OFFLINE");
    expect(homologacao.api.status).toBe("OFFLINE");
    expect(producao.frontend.status).toBe("ONLINE");
    expect(producao.api.status).toBe("ONLINE");
  });

  it("frontend falha e API funciona → resultados independentes", async () => {
    const res = await callHealth(healthHandler({ hmlFrontend: () => healthError(500) }));
    const homologacao = res.json().data.environments.homologacao;
    expect(homologacao.frontend.status).toBe("OFFLINE");
    expect(homologacao.api.status).toBe("ONLINE");
  });

  it("API falha e frontend funciona → resultados independentes", async () => {
    const res = await callHealth(healthHandler({ hmlApi: () => healthError(500) }));
    const homologacao = res.json().data.environments.homologacao;
    expect(homologacao.api.status).toBe("OFFLINE");
    expect(homologacao.frontend.status).toBe("ONLINE");
  });

  it("latencyMs preenchido (número >= 0)", async () => {
    const res = await callHealth(healthHandler());
    const check = res.json().data.environments.homologacao.frontend;
    expect(typeof check.latencyMs).toBe("number");
    expect(check.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("checkedAt preenchido (ISO string válida)", async () => {
    const res = await callHealth(healthHandler());
    const check = res.json().data.environments.producao.api;
    expect(typeof check.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(check.checkedAt))).toBe(false);
  });

  it("Supabase sem anon keys configuradas continua UNKNOWN nos dois ambientes (not_configured)", async () => {
    const res = await callHealth(healthHandler());
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase).toEqual({ status: "UNKNOWN", checkedAt: null, latencyMs: null, errorCode: "supabase_not_configured", source: "not_configured" });
    expect(producao.supabase.status).toBe("UNKNOWN");
    expect(producao.supabase.source).toBe("not_configured");
  });

  it("Auth sem anon keys configuradas continua UNKNOWN nos dois ambientes (not_configured)", async () => {
    const res = await callHealth(healthHandler());
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("UNKNOWN");
    expect(producao.auth.status).toBe("UNKNOWN");
    expect(homologacao.auth.source).toBe("not_configured");
    expect(homologacao.auth.errorCode).toBe("auth_not_configured");
    expect(homologacao.auth.latencyMs).toBeNull();
  });

  it("Realtime continua UNKNOWN nos dois ambientes (sem anon key configurada)", async () => {
    const res = await callHealth(healthHandler());
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("UNKNOWN");
    expect(producao.realtime.status).toBe("UNKNOWN");
    expect(producao.realtime.source).toBe("not_configured");
  });

  it("nenhuma credencial da sessão do operador ou dos providers é encaminhada ao probe", async () => {
    process.env.GITHUB_READ_TOKEN = "token-github-teste";
    setVercelEnv();
    const fn = mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt-operador" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const healthCalls = fn.mock.calls.filter(([url]) => String(url).includes("pedidoprime.com.br"));
    expect(healthCalls).toHaveLength(4);
    for (const [, options] of healthCalls) {
      const headers = options?.headers ? Object.entries(options.headers).map(([k, v]) => `${k}:${v}`).join(" ") : "";
      expect(headers).not.toMatch(/jwt-operador/);
      expect(headers).not.toMatch(/chave-teste/);
      expect(headers).not.toMatch(/token-github-teste/);
      expect(headers).not.toMatch(/token-vercel-teste/);
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("nenhuma URL é controlável pelo query param (url/host/target ignorados)", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({
      headers: { authorization: "Bearer jwt" },
      query: { resource: "health", url: "https://evil.example.com", host: "evil.example.com", target: "evil.example.com" },
    }), res);
    expect(res.statusCode).toBe(200);
    const healthUrls = fn.mock.calls.filter(([url]) => String(url).includes("pedidoprime.com.br")).map(([url]) => String(url));
    expect(healthUrls.sort()).toEqual([HML_API_URL, HML_FRONTEND_URL, PROD_API_URL, PROD_FRONTEND_URL].sort());
    expect(healthUrls.some((u) => u.includes("evil.example.com"))).toBe(false);
  });

  it("resposta não inclui body/HTML (implementação nunca lê o corpo do probe)", async () => {
    // healthOk() não expõe .json()/.text() — se o código tentasse ler o
    // corpo, a chamada falharia e o status cairia para OFFLINE/UNKNOWN.
    const res = await callHealth(healthHandler());
    const raw = res.body;
    expect(raw).not.toMatch(/<html/i);
    expect(res.json().data.environments.homologacao.frontend.status).toBe("ONLINE");
  });

  it("resposta não inclui stack trace", async () => {
    const res = await callHealth(healthHandler({ hmlFrontend: healthNetworkError }));
    expect(res.body).not.toMatch(/at\s+\S+\s+\(/);
    expect(res.body.toLowerCase()).not.toContain("stack");
  });

  it("cache health usa namespace separado (desabilitado sob VITEST, sempre reprobe)", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res1 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res1);
    const res2 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res2);
    const healthCallsTotal = fn.mock.calls.filter(([url]) => String(url).includes("pedidoprime.com.br"));
    expect(healthCallsTotal).toHaveLength(8);
  });

  it("probes HML/PROD usam URLs fixas corretas", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);
    const healthUrls = fn.mock.calls.filter(([url]) => String(url).includes("pedidoprime.com.br")).map(([url]) => String(url));
    expect(healthUrls.sort()).toEqual([HML_API_URL, HML_FRONTEND_URL, PROD_API_URL, PROD_FRONTEND_URL].sort());
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 17 — health real de Supabase (HML + PROD), somente PostgREST
// (`GET /rest/v1/`) com anon key do respectivo ambiente. Auth/Realtime
// continuam UNKNOWN/not_connected (fora de escopo). Nenhum teste chama
// zzixvyspwszewhxzusot.supabase.co ou rwnzggjxhxnfrhstbxkm.supabase.co de
// verdade — fetch é sempre mockado via `supabaseHealth`.
// ════════════════════════════════════════════════════════════
describe("ambientes — health real: Supabase (HML + PROD)", () => {
  async function callHealth({ supabaseHealth, health, authHealth, realtimeHealth } = {}) {
    mockFetch({
      operatorRows: [superAdminRow],
      health: health || healthHandler(),
      supabaseHealth,
      authHealth: authHealth || authHealthHandler(),
      realtimeHealth: realtimeHealth || realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    return res;
  }

  it("cenário 1: HML anon key ausente → HML UNKNOWN/not_configured", async () => {
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ prod: () => supabaseHealthOk() }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("supabase_not_configured");
  });

  it("cenário 2: PROD anon key ausente → PROD UNKNOWN/not_configured", async () => {
    setSupabaseHmlKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthOk() }) });
    const check = res.json().data.environments.producao.supabase;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("supabase_not_configured");
  });

  it("cenário 3: ambas keys ausentes → nenhum fetch Supabase", async () => {
    mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.source).toBe("not_configured");
    expect(producao.supabase.source).toBe("not_configured");
  });

  it("cenário 4: HML 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    expect(res.json().data.environments.homologacao.supabase.status).toBe("ONLINE");
  });

  it("cenário 5: PROD 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    expect(res.json().data.environments.producao.supabase.status).toBe("ONLINE");
  });

  it("cenário 6: ambas 200 → ambos ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.status).toBe("ONLINE");
    expect(producao.supabase.status).toBe("ONLINE");
  });

  it("cenário 7: HML funciona / PROD falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      supabaseHealth: supabaseHealthHandler({ prod: () => supabaseHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.status).toBe("ONLINE");
    expect(producao.supabase.status).toBe("OFFLINE");
  });

  it("cenário 8: PROD funciona / HML falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.status).toBe("OFFLINE");
    expect(producao.supabase.status).toBe("ONLINE");
  });

  it("cenário 9: 401 → DEGRADED/supabase_auth_failed", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthError(401) }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("supabase_auth_failed");
  });

  it("cenário 10: 403 → DEGRADED/supabase_auth_failed", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthError(403) }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("supabase_auth_failed");
  });

  it("cenário 11: 404 → DEGRADED/supabase_unexpected_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthError(404) }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("supabase_unexpected_response");
  });

  it("cenário 12: 500 → OFFLINE/supabase_unavailable", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => supabaseHealthError(500) }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("supabase_unavailable");
  });

  it("cenário 13: timeout → OFFLINE/supabase_timeout", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: supabaseHealthTimeout }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("supabase_timeout");
  });

  it("cenário 14: network error → OFFLINE/supabase_network_error", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: supabaseHealthNetworkError }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("supabase_network_error");
  });

  it("cenário 15: resposta inválida (status não numérico) → UNKNOWN/supabase_invalid_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler({ hml: () => ({ ok: false, status: undefined }) }) });
    const check = res.json().data.environments.homologacao.supabase;
    expect(check.status).toBe("UNKNOWN");
    expect(check.errorCode).toBe("supabase_invalid_response");
  });

  it("cenário 16: checkedAt preenchido (ISO string válida)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    const check = res.json().data.environments.homologacao.supabase;
    expect(typeof check.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(check.checkedAt))).toBe(false);
  });

  it("cenário 17: latencyMs preenchido (número >= 0)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    const check = res.json().data.environments.producao.supabase;
    expect(typeof check.latencyMs).toBe("number");
    expect(check.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("cenários 18/19/20: key HML só para URL HML, key PROD só para URL PROD, sem fallback cruzado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const hmlCall = fn.mock.calls.find(([url]) => String(url) === SUPABASE_HML_PROBE_URL);
    const prodCall = fn.mock.calls.find(([url]) => String(url) === SUPABASE_PROD_PROBE_URL);
    expect(hmlCall[1]?.headers?.apikey).toBe(SUPABASE_HML_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).toBe(SUPABASE_PROD_ANON_KEY);
    expect(hmlCall[1]?.headers?.apikey).not.toBe(SUPABASE_PROD_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).not.toBe(SUPABASE_HML_ANON_KEY);
  });

  it("cenários 21/22/23/24: nenhuma credencial da sessão/operador/service_role/GitHub/Vercel é encaminhada ao probe Supabase", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    process.env.GITHUB_READ_TOKEN = "token-github-teste";
    setVercelEnv();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt-operador" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const supabaseCalls = fn.mock.calls.filter(([url]) => (
      String(url) === SUPABASE_HML_PROBE_URL || String(url) === SUPABASE_PROD_PROBE_URL
    ));
    expect(supabaseCalls).toHaveLength(2);
    for (const [, options] of supabaseCalls) {
      const headers = options?.headers ? Object.entries(options.headers).map(([k, v]) => `${k}:${v}`).join(" ") : "";
      expect(headers).not.toMatch(/jwt-operador/);
      expect(headers).not.toMatch(/chave-teste/);
      expect(headers).not.toMatch(/token-github-teste/);
      expect(headers).not.toMatch(/token-vercel-teste/);
      expect(headers.toLowerCase()).not.toContain("authorization");
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("cenário 25: anon keys não aparecem no payload", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    expect(res.body).not.toMatch(new RegExp(SUPABASE_HML_ANON_KEY));
    expect(res.body).not.toMatch(new RegExp(SUPABASE_PROD_ANON_KEY));
  });

  it("cenário 26: response body Supabase não aparece (implementação nunca lê o corpo do probe)", async () => {
    // supabaseHealthOk() não expõe .json()/.text() — se o código tentasse ler
    // o corpo, a chamada falharia e o status cairia para OFFLINE/UNKNOWN.
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    expect(res.body).not.toMatch(/openapi/i);
    expect(res.body).not.toMatch(/swagger/i);
    expect(res.json().data.environments.homologacao.supabase.status).toBe("ONLINE");
  });

  it("cenário 27: query url/host/project não altera o target do probe Supabase", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({
      headers: { authorization: "Bearer jwt" },
      query: { resource: "health", url: "https://evil.example.com", host: "evil.example.com", project: "evil-project", supabase: "evil", ref: "evil" },
    }), res);
    expect(res.statusCode).toBe(200);
    const supabaseUrls = fn.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url === SUPABASE_HML_PROBE_URL || url === SUPABASE_PROD_PROBE_URL || url.includes("evil"));
    expect(supabaseUrls.sort()).toEqual([SUPABASE_HML_PROBE_URL, SUPABASE_PROD_PROBE_URL].sort());
  });

  it("cenário 28: Frontend/API continuam funcionando no contrato junto com Supabase real", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.frontend.status).toBe("ONLINE");
    expect(homologacao.api.status).toBe("ONLINE");
    expect(producao.frontend.status).toBe("ONLINE");
    expect(producao.api.status).toBe("ONLINE");
  });

  it("cenário 29: Auth agora é real (probe) quando as mesmas anon keys estão configuradas", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler(), authHealth: authHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("ONLINE");
    expect(homologacao.auth.source).toBe("probe");
    expect(producao.auth.status).toBe("ONLINE");
  });

  it("cenário 30: Realtime agora é real (probe) quando as mesmas anon keys estão configuradas", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ supabaseHealth: supabaseHealthHandler(), realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("ONLINE");
    expect(homologacao.realtime.source).toBe("probe");
    expect(producao.realtime.status).toBe("ONLINE");
  });

  it("cenário 31: cache do Supabase tem namespace separado (desabilitado sob VITEST, sempre reprobe)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res1 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res1);
    const res2 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res2);
    const supabaseCallsTotal = fn.mock.calls.filter(([url]) => (
      String(url) === SUPABASE_HML_PROBE_URL || String(url) === SUPABASE_PROD_PROBE_URL
    ));
    expect(supabaseCallsTotal).toHaveLength(4);
  });

  it("cenário 32: nenhuma chamada POST/PUT/PATCH/DELETE ocorre no probe Supabase", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    const supabaseCalls = fn.mock.calls.filter(([url]) => (
      String(url) === SUPABASE_HML_PROBE_URL || String(url) === SUPABASE_PROD_PROBE_URL
    ));
    expect(supabaseCalls.length).toBeGreaterThan(0);
    for (const [, options] of supabaseCalls) {
      expect(options?.method === undefined || options.method === "GET").toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 19 — health real de Auth (HML + PROD), somente GoTrue
// (`GET /auth/v1/health`) com a MESMA anon key do respectivo ambiente já
// usada pelo Supabase real (Microgate 17). Deliberadamente independente de
// api/auth-health.js (diagnóstico administrativo protegido, service_role,
// RPC, admin/users — nunca chamado aqui). Realtime continua UNKNOWN/
// not_connected (fora de escopo). Nenhum teste chama
// zzixvyspwszewhxzusot.supabase.co ou rwnzggjxhxnfrhstbxkm.supabase.co de
// verdade — fetch é sempre mockado via `authHealth`.
// ════════════════════════════════════════════════════════════
describe("ambientes — health real: Auth (HML + PROD)", () => {
  async function callHealth({ authHealth, health, supabaseHealth, realtimeHealth } = {}) {
    mockFetch({
      operatorRows: [superAdminRow],
      health: health || healthHandler(),
      supabaseHealth: supabaseHealth || supabaseHealthHandler(),
      authHealth,
      realtimeHealth: realtimeHealth || realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    return res;
  }

  it("cenário 1: HML anon key ausente → HML Auth UNKNOWN/not_configured", async () => {
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ prod: () => authHealthOk() }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("auth_not_configured");
    expect(check.latencyMs).toBeNull();
  });

  it("cenário 2: PROD anon key ausente → PROD Auth UNKNOWN/not_configured", async () => {
    setSupabaseHmlKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => authHealthOk() }) });
    const check = res.json().data.environments.producao.auth;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("auth_not_configured");
    expect(check.latencyMs).toBeNull();
  });

  it("cenário 3: ambas keys ausentes → nenhum fetch Auth", async () => {
    mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.source).toBe("not_configured");
    expect(producao.auth.source).toBe("not_configured");
  });

  it("cenário 4: HML health 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    expect(res.json().data.environments.homologacao.auth.status).toBe("ONLINE");
  });

  it("cenário 5: PROD health 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    expect(res.json().data.environments.producao.auth.status).toBe("ONLINE");
  });

  it("cenário 6: ambos 200 → ambos ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("ONLINE");
    expect(producao.auth.status).toBe("ONLINE");
  });

  it("cenário 7: HML funciona / PROD falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      authHealth: authHealthHandler({ prod: () => authHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("ONLINE");
    expect(producao.auth.status).toBe("OFFLINE");
  });

  it("cenário 8: PROD funciona / HML falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      authHealth: authHealthHandler({ hml: () => authHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("OFFLINE");
    expect(producao.auth.status).toBe("ONLINE");
  });

  it("cenário 9: 401 → DEGRADED/auth_key_rejected", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => authHealthError(401) }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("auth_key_rejected");
  });

  it("cenário 10: 403 → DEGRADED/auth_key_rejected", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => authHealthError(403) }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("auth_key_rejected");
  });

  it("cenário 11: 404 → DEGRADED/auth_unexpected_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => authHealthError(404) }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("auth_unexpected_response");
  });

  it("cenário 12: 500 → OFFLINE/auth_unavailable", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => authHealthError(500) }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("auth_unavailable");
  });

  it("cenário 13: timeout → OFFLINE/auth_timeout", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: authHealthTimeout }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("auth_timeout");
  });

  it("cenário 14: network error → OFFLINE/auth_network_error", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: authHealthNetworkError }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("auth_network_error");
  });

  it("cenário 15: resposta inválida (status não numérico) → UNKNOWN/auth_invalid_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler({ hml: () => ({ ok: false, status: undefined }) }) });
    const check = res.json().data.environments.homologacao.auth;
    expect(check.status).toBe("UNKNOWN");
    expect(check.errorCode).toBe("auth_invalid_response");
  });

  it("cenário 16: checkedAt preenchido (ISO string válida)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const check = res.json().data.environments.homologacao.auth;
    expect(typeof check.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(check.checkedAt))).toBe(false);
  });

  it("cenário 17: latencyMs preenchido (número >= 0)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const check = res.json().data.environments.producao.auth;
    expect(typeof check.latencyMs).toBe("number");
    expect(check.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("cenários 18/19/20: key HML só para URL HML, key PROD só para URL PROD, sem fallback cruzado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const hmlCall = fn.mock.calls.find(([url]) => String(url) === AUTH_HML_PROBE_URL);
    const prodCall = fn.mock.calls.find(([url]) => String(url) === AUTH_PROD_PROBE_URL);
    expect(hmlCall[1]?.headers?.apikey).toBe(SUPABASE_HML_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).toBe(SUPABASE_PROD_ANON_KEY);
    expect(hmlCall[1]?.headers?.apikey).not.toBe(SUPABASE_PROD_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).not.toBe(SUPABASE_HML_ANON_KEY);
  });

  it("cenários 21/22/23/24: nenhuma credencial da sessão/operador/service_role/GitHub/Vercel é encaminhada ao probe Auth", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    process.env.GITHUB_READ_TOKEN = "token-github-teste";
    setVercelEnv();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt-operador" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const authCalls = fn.mock.calls.filter(([url]) => (
      String(url) === AUTH_HML_PROBE_URL || String(url) === AUTH_PROD_PROBE_URL
    ));
    expect(authCalls).toHaveLength(2);
    for (const [, options] of authCalls) {
      const headers = options?.headers ? Object.entries(options.headers).map(([k, v]) => `${k}:${v}`).join(" ") : "";
      expect(headers).not.toMatch(/jwt-operador/);
      expect(headers).not.toMatch(/chave-teste/);
      expect(headers).not.toMatch(/token-github-teste/);
      expect(headers).not.toMatch(/token-vercel-teste/);
      expect(headers.toLowerCase()).not.toContain("authorization");
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("cenário 25: anon keys não aparecem no payload", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    expect(res.body).not.toMatch(new RegExp(SUPABASE_HML_ANON_KEY));
    expect(res.body).not.toMatch(new RegExp(SUPABASE_PROD_ANON_KEY));
  });

  it("cenário 26/27: body do GoTrue não aparece no payload — classificação não depende de response.json()", async () => {
    // authHealthOk() não expõe .json()/.text() — se o código tentasse ler o
    // corpo, a chamada falharia e o status cairia para OFFLINE/UNKNOWN.
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    expect(res.body).not.toMatch(/gotrue/i);
    expect(res.body).not.toMatch(/"version"/);
    expect(res.body).not.toMatch(/"description"/);
    expect(res.json().data.environments.homologacao.auth.status).toBe("ONLINE");
  });

  it("cenário 28: query url/host/project/ref/auth não altera o target do probe Auth", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({
      headers: { authorization: "Bearer jwt" },
      query: { resource: "health", url: "https://evil.example.com", host: "evil.example.com", project: "evil-project", ref: "evil", auth: "evil", target: "evil" },
    }), res);
    expect(res.statusCode).toBe(200);
    const authUrls = fn.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url === AUTH_HML_PROBE_URL || url === AUTH_PROD_PROBE_URL || url.includes("evil"));
    expect(authUrls.sort()).toEqual([AUTH_HML_PROBE_URL, AUTH_PROD_PROBE_URL].sort());
  });

  it("cenários 29/30/31/32: nenhuma chamada POST, /admin/users, /token, /signup ou /otp ocorre no probe Auth", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    // A única URL de Auth chamada é `.../auth/v1/health` — nenhuma variante
    // (/admin/users, /token, /signup, /otp) aparece entre as chamadas. Se o
    // código tentasse qualquer uma delas, mockFetch lançaria "fetch
    // inesperado no teste" e este teste falharia.
    const authRelatedCalls = fn.mock.calls.filter(([url]) => (
      String(url) === AUTH_HML_PROBE_URL || String(url) === AUTH_PROD_PROBE_URL
    ));
    expect(authRelatedCalls).toHaveLength(2);
    for (const [url, options] of authRelatedCalls) {
      expect(String(url)).toMatch(/\/auth\/v1\/health$/);
      expect(String(url)).not.toMatch(/\/admin\/users/);
      expect(String(url)).not.toMatch(/\/token/);
      expect(String(url)).not.toMatch(/\/signup/);
      expect(String(url)).not.toMatch(/\/otp/);
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("cenário 33: Frontend continua preservado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.frontend.status).toBe("ONLINE");
    expect(producao.frontend.status).toBe("ONLINE");
  });

  it("cenário 34: API continua preservada", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.api.status).toBe("ONLINE");
    expect(producao.api.status).toBe("ONLINE");
  });

  it("cenário 35: Supabase continua preservado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.status).toBe("ONLINE");
    expect(producao.supabase.status).toBe("ONLINE");
  });

  it("cenário 36: Realtime agora é real (probe) quando as mesmas anon keys estão configuradas", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ authHealth: authHealthHandler(), realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("ONLINE");
    expect(homologacao.realtime.source).toBe("probe");
    expect(producao.realtime.status).toBe("ONLINE");
  });

  it("cenário 37: cache do Auth tem namespace separado (desabilitado sob VITEST, sempre reprobe)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res1 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res1);
    const res2 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res2);
    const authCallsTotal = fn.mock.calls.filter(([url]) => (
      String(url) === AUTH_HML_PROBE_URL || String(url) === AUTH_PROD_PROBE_URL
    ));
    expect(authCallsTotal).toHaveLength(4);
  });

  it("cenário 38: cache do Auth não colide com o cache do Supabase (chaves e contadores independentes)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    const supabaseCalls = fn.mock.calls.filter(([url]) => (
      String(url) === SUPABASE_HML_PROBE_URL || String(url) === SUPABASE_PROD_PROBE_URL
    ));
    const authCalls = fn.mock.calls.filter(([url]) => (
      String(url) === AUTH_HML_PROBE_URL || String(url) === AUTH_PROD_PROBE_URL
    ));
    expect(supabaseCalls).toHaveLength(2);
    expect(authCalls).toHaveLength(2);
  });

  it("cenário 39: api/auth-health.js não é chamado pelo provider (nenhuma chamada exige service_role/RPC/admin)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    // api/auth-health.js chamaria /auth/v1/admin/users e/ou
    // /rest/v1/rpc/app_validar_login com o header apikey=service_role. Se o
    // provider Auth desta Central reutilizasse aquele código, alguma dessas
    // chamadas apareceria aqui — e falharia como "fetch inesperado".
    const suspectCalls = fn.mock.calls.filter(([url]) => (
      String(url).includes("/admin/users") || String(url).includes("/rpc/app_validar_login")
    ));
    expect(suspectCalls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 21 — health real de Realtime (HML + PROD), somente o endpoint
// HTTP de disponibilidade do gateway (`GET /realtime/v1/api/ping`) com a
// MESMA anon key do respectivo ambiente já usada por Supabase/Auth real
// (Microgates 17/19). REALTIME_HTTP_HEALTH_ONLY=true: nenhum teste abre
// WebSocket, cria channel, faz subscribe/broadcast/Presence/postgres_changes
// — fetch é sempre mockado via `realtimeHealth`, nenhum teste chama
// zzixvyspwszewhxzusot.supabase.co ou rwnzggjxhxnfrhstbxkm.supabase.co de
// verdade.
// ════════════════════════════════════════════════════════════
describe("ambientes — health real: Realtime (HML + PROD)", () => {
  async function callHealth({ realtimeHealth, health, supabaseHealth, authHealth } = {}) {
    mockFetch({
      operatorRows: [superAdminRow],
      health: health || healthHandler(),
      supabaseHealth: supabaseHealth || supabaseHealthHandler(),
      authHealth: authHealth || authHealthHandler(),
      realtimeHealth,
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    return res;
  }

  it("cenário 1: HML anon key ausente → HML Realtime UNKNOWN/not_configured", async () => {
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ prod: () => realtimeHealthOk() }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("realtime_not_configured");
    expect(check.latencyMs).toBeNull();
  });

  it("cenário 2: PROD anon key ausente → PROD Realtime UNKNOWN/not_configured", async () => {
    setSupabaseHmlKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthOk() }) });
    const check = res.json().data.environments.producao.realtime;
    expect(check.status).toBe("UNKNOWN");
    expect(check.source).toBe("not_configured");
    expect(check.errorCode).toBe("realtime_not_configured");
    expect(check.latencyMs).toBeNull();
  });

  it("cenário 3: ambas keys ausentes → nenhum fetch Realtime", async () => {
    mockFetch({ operatorRows: [superAdminRow], health: healthHandler() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.source).toBe("not_configured");
    expect(producao.realtime.source).toBe("not_configured");
  });

  it("cenário 4: HML ping 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    expect(res.json().data.environments.homologacao.realtime.status).toBe("ONLINE");
  });

  it("cenário 5: PROD ping 200 → ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    expect(res.json().data.environments.producao.realtime.status).toBe("ONLINE");
  });

  it("cenário 6: ambos 200 → ambos ONLINE", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("ONLINE");
    expect(producao.realtime.status).toBe("ONLINE");
  });

  it("cenário 7: HML funciona / PROD falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      realtimeHealth: realtimeHealthHandler({ prod: () => realtimeHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("ONLINE");
    expect(producao.realtime.status).toBe("OFFLINE");
  });

  it("cenário 8: PROD funciona / HML falha → independentes", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({
      realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(500) }),
    });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.realtime.status).toBe("OFFLINE");
    expect(producao.realtime.status).toBe("ONLINE");
  });

  it("cenário 9: 401 → DEGRADED/realtime_key_rejected", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(401) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("realtime_key_rejected");
  });

  it("cenário 10: 403 → DEGRADED/realtime_key_rejected", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(403) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("realtime_key_rejected");
  });

  it("cenário 11: 404 → DEGRADED/realtime_unexpected_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(404) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("realtime_unexpected_response");
  });

  it("cenário 12: 429 → DEGRADED/realtime_rate_limited", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(429) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("DEGRADED");
    expect(check.errorCode).toBe("realtime_rate_limited");
  });

  it("cenário 13: 500 → OFFLINE/realtime_unavailable", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => realtimeHealthError(500) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("realtime_unavailable");
  });

  it("cenário 14: timeout → OFFLINE/realtime_timeout", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: realtimeHealthTimeout }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("realtime_timeout");
  });

  it("cenário 15: network error → OFFLINE/realtime_network_error", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: realtimeHealthNetworkError }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("OFFLINE");
    expect(check.errorCode).toBe("realtime_network_error");
  });

  it("cenário 16: resposta inválida (status não numérico) → UNKNOWN/realtime_invalid_response", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler({ hml: () => ({ ok: false, status: undefined }) }) });
    const check = res.json().data.environments.homologacao.realtime;
    expect(check.status).toBe("UNKNOWN");
    expect(check.errorCode).toBe("realtime_invalid_response");
  });

  it("cenário 17: checkedAt preenchido (ISO string válida)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const check = res.json().data.environments.homologacao.realtime;
    expect(typeof check.checkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(check.checkedAt))).toBe(false);
  });

  it("cenário 18: latencyMs preenchido (número >= 0)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const check = res.json().data.environments.producao.realtime;
    expect(typeof check.latencyMs).toBe("number");
    expect(check.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("cenários 19/20/21: key HML só para URL HML, key PROD só para URL PROD, sem fallback cruzado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const hmlCall = fn.mock.calls.find(([url]) => String(url) === REALTIME_HML_PROBE_URL);
    const prodCall = fn.mock.calls.find(([url]) => String(url) === REALTIME_PROD_PROBE_URL);
    expect(hmlCall[1]?.headers?.apikey).toBe(SUPABASE_HML_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).toBe(SUPABASE_PROD_ANON_KEY);
    expect(hmlCall[1]?.headers?.apikey).not.toBe(SUPABASE_PROD_ANON_KEY);
    expect(prodCall[1]?.headers?.apikey).not.toBe(SUPABASE_HML_ANON_KEY);
  });

  it("cenários 22/23/24/25: nenhuma credencial da sessão/operador/service_role/GitHub/Vercel é encaminhada ao probe Realtime", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    process.env.GITHUB_READ_TOKEN = "token-github-teste";
    setVercelEnv();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt-operador" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    const realtimeCalls = fn.mock.calls.filter(([url]) => (
      String(url) === REALTIME_HML_PROBE_URL || String(url) === REALTIME_PROD_PROBE_URL
    ));
    expect(realtimeCalls).toHaveLength(2);
    for (const [, options] of realtimeCalls) {
      const headers = options?.headers ? Object.entries(options.headers).map(([k, v]) => `${k}:${v}`).join(" ") : "";
      expect(headers).not.toMatch(/jwt-operador/);
      expect(headers).not.toMatch(/chave-teste/);
      expect(headers).not.toMatch(/token-github-teste/);
      expect(headers).not.toMatch(/token-vercel-teste/);
      expect(headers.toLowerCase()).not.toContain("authorization");
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("cenários 26/27: anon keys não aparecem no payload nem na URL do probe Realtime", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.body).not.toMatch(new RegExp(SUPABASE_HML_ANON_KEY));
    expect(res.body).not.toMatch(new RegExp(SUPABASE_PROD_ANON_KEY));
    const realtimeUrls = fn.mock.calls
      .filter(([url]) => String(url) === REALTIME_HML_PROBE_URL || String(url) === REALTIME_PROD_PROBE_URL)
      .map(([url]) => String(url));
    for (const url of realtimeUrls) {
      expect(url).not.toMatch(new RegExp(SUPABASE_HML_ANON_KEY));
      expect(url).not.toMatch(new RegExp(SUPABASE_PROD_ANON_KEY));
      expect(url).not.toContain("?");
    }
  });

  it("cenários 28/29/30: body do ping Realtime não aparece no payload — classificação não depende de response.json()/response.text()", async () => {
    // realtimeHealthOk() não expõe .json()/.text() — se o código tentasse ler
    // o corpo, a chamada falharia e o status cairia para OFFLINE/UNKNOWN.
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    expect(res.body).not.toMatch(/"message"/);
    expect(res.json().data.environments.homologacao.realtime.status).toBe("ONLINE");
  });

  it("cenários 31/32/33/34: query url/host/project/ref/realtime/socket não altera o target do probe Realtime", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({
      headers: { authorization: "Bearer jwt" },
      query: { resource: "health", url: "https://evil.example.com", host: "evil.example.com", project: "evil-project", ref: "evil", realtime: "evil", socket: "evil" },
    }), res);
    expect(res.statusCode).toBe(200);
    const realtimeUrls = fn.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url === REALTIME_HML_PROBE_URL || url === REALTIME_PROD_PROBE_URL || url.includes("evil"));
    expect(realtimeUrls.sort()).toEqual([REALTIME_HML_PROBE_URL, REALTIME_PROD_PROBE_URL].sort());
  });

  it("cenários 35/36/37/38: nenhuma chamada POST, de broadcast, WebSocket ou channel ocorre no probe Realtime", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);

    // A única URL de Realtime chamada é `.../realtime/v1/api/ping` — nenhuma
    // variante de broadcast/channel/websocket aparece entre as chamadas. Se o
    // código tentasse qualquer uma delas, mockFetch lançaria "fetch
    // inesperado no teste" e este teste falharia.
    const realtimeRelatedCalls = fn.mock.calls.filter(([url]) => (
      String(url) === REALTIME_HML_PROBE_URL || String(url) === REALTIME_PROD_PROBE_URL
    ));
    expect(realtimeRelatedCalls).toHaveLength(2);
    for (const [url, options] of realtimeRelatedCalls) {
      expect(String(url)).toMatch(/\/realtime\/v1\/api\/ping$/);
      expect(String(url)).not.toMatch(/\/broadcast/);
      expect(String(url)).not.toMatch(/\/channel/);
      expect(String(url).startsWith("wss://")).toBe(false);
      expect(String(options?.method || "GET")).toBe("GET");
    }
  });

  it("cenário 39: Frontend continua preservado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.frontend.status).toBe("ONLINE");
    expect(producao.frontend.status).toBe("ONLINE");
  });

  it("cenário 40: API continua preservada", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.api.status).toBe("ONLINE");
    expect(producao.api.status).toBe("ONLINE");
  });

  it("cenário 41: Supabase continua preservado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.supabase.status).toBe("ONLINE");
    expect(producao.supabase.status).toBe("ONLINE");
  });

  it("cenário 42: Auth continua preservado", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const res = await callHealth({ realtimeHealth: realtimeHealthHandler() });
    const { homologacao, producao } = res.json().data.environments;
    expect(homologacao.auth.status).toBe("ONLINE");
    expect(producao.auth.status).toBe("ONLINE");
  });

  it("cenário 43: cache do Realtime tem namespace isolado (não colide com Frontend/API/Supabase/Auth/GitHub/Vercel, desabilitado sob VITEST)", async () => {
    setSupabaseHmlKey();
    setSupabaseProdKey();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      health: healthHandler(),
      supabaseHealth: supabaseHealthHandler(),
      authHealth: authHealthHandler(),
      realtimeHealth: realtimeHealthHandler(),
    });
    const res1 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res1);
    const res2 = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res2);

    const realtimeCallsTotal = fn.mock.calls.filter(([url]) => (
      String(url) === REALTIME_HML_PROBE_URL || String(url) === REALTIME_PROD_PROBE_URL
    ));
    // Sem cache (VITEST=true), cada chamada ao handler reprobe — 2 requisições
    // x 2 chamadas ao handler = 4. Se o cache de Realtime colidisse com o de
    // Supabase/Auth (mesma chave), o total divergiria.
    expect(realtimeCallsTotal).toHaveLength(4);

    const supabaseCalls = fn.mock.calls.filter(([url]) => (
      String(url) === SUPABASE_HML_PROBE_URL || String(url) === SUPABASE_PROD_PROBE_URL
    ));
    const authCalls = fn.mock.calls.filter(([url]) => (
      String(url) === AUTH_HML_PROBE_URL || String(url) === AUTH_PROD_PROBE_URL
    ));
    expect(supabaseCalls).toHaveLength(4);
    expect(authCalls).toHaveLength(4);
  });
});

describe("ambientes — sanitização de payload", () => {
  it("resposta não contém segredos nem dados sensíveis", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    const raw = res.body;
    expect(raw).not.toMatch(/service_role/i);
    expect(raw).not.toMatch(/authorization/i);
    expect(raw).not.toMatch(/secret/i);
    expect(raw).not.toMatch(/Bearer /);
    expect(raw).not.toMatch(/stack/i);
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 11 — integração GitHub read-only (environments/compare).
// GITHUB_READ_TOKEN nunca é real aqui: fetch para api.github.com é sempre
// mockado via `github` (ver mockFetch acima).
// ════════════════════════════════════════════════════════════

describe("ambientes — GitHub sem token configurado", () => {
  it("cenário 1: compare sem GITHUB_READ_TOKEN → UNKNOWN/not_configured", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const body = res.json();
    expect(body.data.status).toBe("UNKNOWN");
    expect(body.data.source).toBe("not_configured");
    expect(body.data.errorCode).toBe("github_not_configured");
    expect(body.data.ahead).toBeNull();
    expect(body.data.behind).toBeNull();
    expect(body.data.mergeBase).toBeNull();
    expect(body.data.commits).toEqual([]);
    expect(body.data.files).toEqual([]);
  });

  it("cenário 2: environments sem GITHUB_READ_TOKEN → commit null / source not_configured", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    const body = res.json();
    for (const env of body.data) {
      expect(env.commit).toBeNull();
      expect(env.source).toBe("not_configured");
      expect(env.status).toBe("UNKNOWN");
    }
  });
});

describe("ambientes — GitHub com token: environments", () => {
  it("cenário 3: main + homologacao resolvidas → SHAs corretos", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubBranchHandler({
        homologacao: () => githubOk({ commit: makeCommit("abc1234567890") }),
        main: () => githubOk({ commit: makeCommit("def9876543210") }),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    const body = res.json();
    const hml = body.data.find((e) => e.environment === "homologacao");
    const prod = body.data.find((e) => e.environment === "producao");
    expect(hml.commit.sha).toBe("abc1234567890");
    expect(hml.commit.shortSha).toBe("abc1234");
    expect(hml.source).toBe("github");
    expect(prod.commit.sha).toBe("def9876543210");
    expect(prod.commit.shortSha).toBe("def9876");
    expect(prod.source).toBe("github");
  });
});

describe("ambientes — GitHub com token: compare status", () => {
  const baseCompareBody = (status) => ({
    status,
    ahead_by: 2,
    behind_by: 1,
    merge_base_commit: { sha: "base123" },
    commits: [makeCommit("c1"), makeCommit("c2")],
    files: [{ filename: "src/x.js", status: "modified" }],
  });

  it("cenário 4: identical → SYNCED", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubOk(baseCompareBody("identical")) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.json().data.status).toBe("SYNCED");
  });

  it("cenário 5: ahead → HML_AHEAD", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubOk(baseCompareBody("ahead")) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const body = res.json();
    expect(body.data.status).toBe("HML_AHEAD");
    expect(body.data.ahead).toBe(2);
    expect(body.data.behind).toBe(1);
    expect(body.data.mergeBase).toBe("base123");
    expect(body.data.source).toBe("github");
  });

  it("cenário 6: behind → PROD_AHEAD", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubOk(baseCompareBody("behind")) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.json().data.status).toBe("PROD_AHEAD");
  });

  it("cenário 7: diverged → DIVERGED", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubOk(baseCompareBody("diverged")) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.json().data.status).toBe("DIVERGED");
  });

  it("valor inesperado de status → UNKNOWN", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubOk(baseCompareBody("qualquer-coisa")) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.json().data.status).toBe("UNKNOWN");
  });
});

describe("ambientes — GitHub com token: falhas isoladas (não derrubam a Central)", () => {
  it("cenário 8: timeout → 200 + UNKNOWN + github_timeout", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubAbort() });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("UNKNOWN");
    expect(body.data.errorCode).toBe("github_timeout");
    expect(body.data.source).toBe("github_error");
  });

  it("cenário 9: 401 upstream → UNKNOWN + github_auth_failed", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubError(401, { message: "Bad credentials" }) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.errorCode).toBe("github_auth_failed");
  });

  it("cenário 10: 403 rate limit → UNKNOWN + github_rate_limited", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubError(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.errorCode).toBe("github_rate_limited");
  });

  it("cenário 11: 404 → UNKNOWN + github_not_found", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubError(404, { message: "Not Found" }) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.errorCode).toBe("github_not_found");
  });

  it("cenário 12: 5xx → UNKNOWN + github_unavailable", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({ operatorRows: [superAdminRow], github: () => githubError(502, { message: "Bad Gateway" }) });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.errorCode).toBe("github_unavailable");
  });

  it("falha isolada também não derruba environments (500 upstream → github_error)", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubBranchHandler({
        homologacao: () => githubError(503, { message: "Service Unavailable" }),
        main: () => githubOk({ commit: makeCommit("def9876543210") }),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    expect(res.statusCode).toBe(200);
    const hml = res.json().data.find((e) => e.environment === "homologacao");
    expect(hml.commit).toBeNull();
    expect(hml.source).toBe("github_error");
    expect(hml.errorCode).toBe("github_unavailable");
  });
});

describe("ambientes — GitHub: sanitização e limites", () => {
  it("cenário 13: payload não contém token, Authorization, e-mail ou stack", async () => {
    process.env.GITHUB_READ_TOKEN = "token-super-secreto";
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubBranchHandler({
        homologacao: () => githubOk({ commit: makeCommit("abc1234567890", { email: "vazamento@exemplo.com" }) }),
        main: () => githubOk({ commit: makeCommit("def9876543210", { email: "vazamento@exemplo.com" }) }),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "environments" } }), res);
    const raw = res.body;
    expect(raw).not.toMatch(/token-super-secreto/);
    expect(raw).not.toMatch(/authorization/i);
    expect(raw).not.toMatch(/vazamento@exemplo\.com/);
    expect(raw).not.toMatch(/stack/i);
  });

  it("cenário 14: commits limitados a <=100", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    const manyCommits = Array.from({ length: 150 }, (_, i) => makeCommit(`sha${i}`));
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubOk({ status: "diverged", ahead_by: 150, behind_by: 0, commits: manyCommits, files: [] }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const body = res.json();
    expect(body.data.commits.length).toBe(100);
    expect(body.data.truncated).toBe(true);
  });

  it("cenário 15: files limitados a <=100", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    const manyFiles = Array.from({ length: 120 }, (_, i) => ({ filename: `src/f${i}.js`, status: "modified" }));
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubOk({ status: "diverged", ahead_by: 1, behind_by: 0, commits: [], files: manyFiles }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const body = res.json();
    expect(body.data.files.length).toBe(100);
    expect(body.data.truncated).toBe(true);
  });

  it("cenário 16: patch/diff bruto não aparece no payload", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubOk({
        status: "diverged",
        ahead_by: 1,
        behind_by: 0,
        commits: [makeCommit("c1")],
        files: [{ filename: "src/x.js", status: "modified", patch: "@@ -1,3 +1,3 @@\n-old\n+new", raw_url: "https://x" }],
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const raw = res.body;
    expect(raw).not.toMatch(/@@ -1,3/);
    expect(raw).not.toMatch(/"patch"/);
    expect(raw).not.toMatch(/raw_url/);
  });

  it("changeType mapeado corretamente (added/modified/removed/renamed/desconhecido)", async () => {
    process.env.GITHUB_READ_TOKEN = "token-teste";
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubOk({
        status: "diverged",
        ahead_by: 1,
        behind_by: 0,
        commits: [],
        files: [
          { filename: "a.js", status: "added" },
          { filename: "b.js", status: "modified" },
          { filename: "c.js", status: "removed" },
          { filename: "d.js", status: "renamed" },
          { filename: "e.js", status: "algo-novo" },
        ],
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "compare" } }), res);
    const files = res.json().data.files;
    expect(files.map((f) => f.changeType)).toEqual(["added", "modified", "deleted", "renamed", "unknown"]);
  });
});

// ════════════════════════════════════════════════════════════
// Microgate 13 — integração Vercel read-only (resource=deployments).
// VERCEL_READ_TOKEN nunca é real aqui: fetch para api.vercel.com é sempre
// mockado via `vercel` (ver mockFetch acima). Nenhum teste chama a Vercel
// real e nenhum request usa método diferente de GET.
// ════════════════════════════════════════════════════════════

describe("ambientes — Vercel: configuração ausente", () => {
  it("cenário 1: VERCEL_READ_TOKEN ausente → not_configured", async () => {
    process.env.VERCEL_TEAM_ID = "team-teste";
    process.env.VERCEL_HML_PROJECT_ID = VERCEL_HML_PROJECT_ID;
    process.env.VERCEL_PROD_PROJECT_ID = VERCEL_PROD_PROJECT_ID;
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source).toBe("not_configured");
    expect(body.data.items).toEqual([]);
    expect(body.data.errorCode).toBe("vercel_not_configured");
  });

  it("cenário 2: VERCEL_TEAM_ID ausente → not_configured", async () => {
    process.env.VERCEL_READ_TOKEN = "token-vercel-teste";
    process.env.VERCEL_HML_PROJECT_ID = VERCEL_HML_PROJECT_ID;
    process.env.VERCEL_PROD_PROJECT_ID = VERCEL_PROD_PROJECT_ID;
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.source).toBe("not_configured");
  });

  it("cenário 3: VERCEL_HML_PROJECT_ID ausente → not_configured", async () => {
    process.env.VERCEL_READ_TOKEN = "token-vercel-teste";
    process.env.VERCEL_TEAM_ID = "team-teste";
    process.env.VERCEL_PROD_PROJECT_ID = VERCEL_PROD_PROJECT_ID;
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.source).toBe("not_configured");
  });

  it("cenário 4: VERCEL_PROD_PROJECT_ID ausente → not_configured", async () => {
    process.env.VERCEL_READ_TOKEN = "token-vercel-teste";
    process.env.VERCEL_TEAM_ID = "team-teste";
    process.env.VERCEL_HML_PROJECT_ID = VERCEL_HML_PROJECT_ID;
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.source).toBe("not_configured");
  });

  it("nunca usa VERCEL_TOKEN como fallback de VERCEL_READ_TOKEN", async () => {
    process.env.VERCEL_TOKEN = "token-de-deploy-nao-deve-ser-usado";
    process.env.VERCEL_TEAM_ID = "team-teste";
    process.env.VERCEL_HML_PROJECT_ID = VERCEL_HML_PROJECT_ID;
    process.env.VERCEL_PROD_PROJECT_ID = VERCEL_PROD_PROJECT_ID;
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.source).toBe("not_configured");
    delete process.env.VERCEL_TOKEN;
  });
});

describe("ambientes — Vercel com config: sucesso e status parcial", () => {
  it("cenário 5: HML + PROD success → source=vercel", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("dpl-hml-1")]),
        producao: () => vercelOk([makeDeployment("dpl-prod-1")]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source).toBe("vercel");
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.find((d) => d.id === "dpl-hml-1").environment).toBe("homologacao");
    expect(body.data.items.find((d) => d.id === "dpl-prod-1").environment).toBe("producao");
  });

  it("cenário 6: HML success + PROD failure → source=partial (HML preservado)", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("dpl-hml-1")]),
        producao: () => vercelError(500, { error: { message: "Internal Error" } }),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source).toBe("partial");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].environment).toBe("homologacao");
    expect(body.data.errors).toEqual([{ environment: "producao", errorCode: "vercel_unavailable" }]);
  });

  it("cenário 7: PROD success + HML failure → source=partial (PROD preservado)", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(500, {}),
        producao: () => vercelOk([makeDeployment("dpl-prod-1")]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const body = res.json();
    expect(body.data.source).toBe("partial");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].environment).toBe("producao");
    expect(body.data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_unavailable" }]);
  });

  it("ambas falham → source=vercel_error", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(500, {}),
        producao: () => vercelError(500, {}),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const body = res.json();
    expect(body.data.source).toBe("vercel_error");
    expect(body.data.items).toEqual([]);
  });
});

describe("ambientes — Vercel: mapeamento de status", () => {
  it("cenário 8: READY mapeado corretamente", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { state: "READY" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].status).toBe("READY");
  });

  it("cenário 9: BUILDING mapeado corretamente", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { state: "BUILDING" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].status).toBe("BUILDING");
  });

  it("cenário 10: ERROR mapeado corretamente", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { state: "ERROR" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].status).toBe("ERROR");
  });

  it("cenário 11: estado desconhecido → UNKNOWN", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { state: "ALGO_NOVO" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].status).toBe("UNKNOWN");
  });
});

describe("ambientes — Vercel: normalização de campos", () => {
  it("cenário 12: timestamp convertido para ISO / cenário 13: durationMs calculado", async () => {
    setVercelEnv();
    const created = Date.parse("2026-01-01T10:00:00Z");
    const ready = Date.parse("2026-01-01T10:02:30Z");
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { created, ready })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const item = res.json().data.items[0];
    expect(item.createdAt).toBe(new Date(created).toISOString());
    expect(item.readyAt).toBe(new Date(ready).toISOString());
    expect(item.durationMs).toBe(ready - created);
  });

  it("durationMs é null quando createdAt/readyAt ausentes ou inválidos", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { created: null, ready: null })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const item = res.json().data.items[0];
    expect(item.createdAt).toBeNull();
    expect(item.readyAt).toBeNull();
    expect(item.durationMs).toBeNull();
  });

  it("cenário 14: URL normalizada para https", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { url: "meu-app-abc123.vercel.app" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].url).toBe("https://meu-app-abc123.vercel.app");
  });

  it("URL ausente → null", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([{ uid: "d1", state: "READY" }]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].url).toBeNull();
  });

  it("cenário 15: commit SHA sanitizado (extraído de meta.githubCommitSha)", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { githubCommitSha: "abc123def456" })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].commitSha).toBe("abc123def456");
    expect(res.json().data.items[0].branch).toBe("homologacao");
  });

  it("commit SHA ausente → null", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1", { githubCommitSha: null })]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.items[0].commitSha).toBeNull();
  });
});

describe("ambientes — Vercel: sanitização de payload", () => {
  it("cenário 16/17/18/19: resposta não contém meta bruto, e-mail, token ou Authorization", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([{
          uid: "d1",
          url: "app.vercel.app",
          state: "READY",
          created: Date.parse("2026-01-01T10:00:00Z"),
          ready: Date.parse("2026-01-01T10:02:00Z"),
          creator: { email: "vazamento@exemplo.com", uid: "usr_1" },
          meta: { githubCommitSha: "abc123", secret: "nao-pode-vazar" },
        }]),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const raw = res.body;
    expect(raw).not.toMatch(/vazamento@exemplo\.com/);
    expect(raw).not.toMatch(/token-vercel-teste/);
    expect(raw).not.toMatch(/authorization/i);
    expect(raw).not.toMatch(/creator/i);
    expect(raw).not.toMatch(/nao-pode-vazar/);
  });
});

describe("ambientes — Vercel: isolamento de falhas por ambiente", () => {
  it("cenário 20: timeout → vercel_timeout", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelAbort(),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_timeout" }]);
  });

  it("cenário 21: 401 → vercel_auth_failed", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(401, {}),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_auth_failed" }]);
  });

  it("cenário 22: 403 → vercel_forbidden", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(403, {}),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_forbidden" }]);
  });

  it("cenário 23: 404 → vercel_not_found", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(404, {}),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_not_found" }]);
  });

  it("cenário 24: 429 → vercel_rate_limited", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(429, {}),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_rate_limited" }]);
  });

  it("cenário 25: 5xx → vercel_unavailable", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelError(503, {}),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.errors).toEqual([{ environment: "homologacao", errorCode: "vercel_unavailable" }]);
  });
});

describe("ambientes — Vercel: limites de quantidade", () => {
  it("cenário 26: mais de 10 deploys HML → limita a 10 e marca truncated", async () => {
    setVercelEnv();
    const manyHml = Array.from({ length: 15 }, (_, i) => makeDeployment(`hml-${i}`));
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk(manyHml),
        producao: () => vercelOk([]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const body = res.json();
    expect(body.data.items.filter((d) => d.environment === "homologacao")).toHaveLength(10);
    expect(body.data.truncated).toBe(true);
  });

  it("cenário 27: mais de 10 deploys PROD → limita a 10 e marca truncated", async () => {
    setVercelEnv();
    const manyProd = Array.from({ length: 12 }, (_, i) => makeDeployment(`prod-${i}`));
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([]),
        producao: () => vercelOk(manyProd),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    const body = res.json();
    expect(body.data.items.filter((d) => d.environment === "producao")).toHaveLength(10);
    expect(body.data.truncated).toBe(true);
  });

  it("não marca truncated sem evidência (<=10 por ambiente)", async () => {
    setVercelEnv();
    mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1")]),
        producao: () => vercelOk([makeDeployment("d2")]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.json().data.truncated).toBeUndefined();
  });
});

describe("ambientes — Vercel: apenas leitura", () => {
  it("cenário 28: nenhum método de escrita é utilizado (todas as chamadas Vercel são GET)", async () => {
    setVercelEnv();
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      vercel: vercelHandler({
        homologacao: () => vercelOk([makeDeployment("d1")]),
        producao: () => vercelOk([makeDeployment("d2")]),
      }),
    });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const vercelCalls = fn.mock.calls.filter(([url]) => String(url).includes("api.vercel.com"));
    expect(vercelCalls.length).toBeGreaterThan(0);
    for (const [, options] of vercelCalls) {
      expect(options?.method === undefined || options.method === "GET").toBe(true);
    }
  });
});
