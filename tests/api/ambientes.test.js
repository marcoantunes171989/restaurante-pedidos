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

// `github` é uma função (url) => respostaMock, chamada para toda requisição
// a api.github.com. Sem ela, uma chamada GitHub inesperada falha o teste.
function mockFetch({ userOk = true, email = "super@teste.com", operatorOk = true, operatorRows = [], github } = {}) {
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

const superAdminRow = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-teste";
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.GITHUB_READ_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_READ_TOKEN;
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

  it("resource=deployments → 200 + not_connected", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: "Bearer jwt" }, query: { resource: "deployments" } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("not_connected");
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
