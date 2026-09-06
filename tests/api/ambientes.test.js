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
} = {}) {
  const fn = vi.fn(async (url) => {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.VERCEL_READ_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.VERCEL_HML_PROJECT_ID;
  delete process.env.VERCEL_PROD_PROJECT_ID;
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

  it("resource=health → 200 + providers UNKNOWN", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "health" } }), res);
    expect(res.statusCode).toBe(200);
    const providers = res.json().data.providers;
    expect(Object.values(providers).every((v) => v === "UNKNOWN")).toBe(true);
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
