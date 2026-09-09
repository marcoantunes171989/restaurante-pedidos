/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/releases.js";

// ════════════════════════════════════════════════════════════
// RELEASE-AUTO-01 — /api/releases: control plane de preflight.
// Nenhum teste chama GitHub/Supabase reais: fetch é sempre mockado.
// ════════════════════════════════════════════════════════════

function makeReq({ method = "POST", headers = {}, body } = {}) {
  return { method, headers, body };
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

const superAdminRow = { ativo: true, super_admin: true, loja_id: null, ids_acesso: [] };
const SHA_MAIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_HML = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_OTHER = "cccccccccccccccccccccccccccccccccccccccc";
const GITHUB_READ_TOKEN = "github-read-token-secreto-teste";
const GITHUB_RELEASE_TOKEN = "github-release-token-secreto-teste";
const VERCEL_TOKEN = "vercel-token-secreto-teste";
const SERVICE_ROLE = "supabase-service-role-secreto-teste";
const BEARER = "jwt-operador-secreto-teste";

function githubOk(body) {
  return { ok: true, status: 200, json: async () => body };
}

function githubError(status, body = {}) {
  return { ok: false, status, json: async () => body };
}

function githubAbort() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}

function makeCommit(sha, { message = "feat: ajuste", author = "marco", date = "2026-09-09T10:00:00Z" } = {}) {
  return {
    sha,
    commit: { message, author: { name: author, email: "marco@example.com", date } },
    author: { login: author },
  };
}

function branchBody(sha) {
  return { commit: makeCommit(sha) };
}

function compareBody({
  status = "ahead",
  ahead_by = 2,
  behind_by = 0,
  mergeBase = SHA_MAIN,
  commits = [makeCommit(SHA_HML)],
  files = [{ filename: "src/x.js", status: "modified" }],
} = {}) {
  return {
    status,
    ahead_by,
    behind_by,
    merge_base_commit: mergeBase ? { sha: mergeBase } : null,
    commits,
    files,
  };
}

function mockFetch({
  userOk = true,
  email = "super@teste.com",
  operatorOk = true,
  operatorRows = [],
  github,
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
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function githubHandler({ main, homologacao, compare }) {
  return (url) => {
    if (url.includes("/branches/homologacao")) return homologacao();
    if (url.includes("/branches/main")) return main();
    if (url.includes("/compare/main...homologacao")) return compare();
    throw new Error(`github url inesperada no teste: ${url}`);
  };
}

function authHeaders() {
  return { authorization: `Bearer ${BEARER}` };
}

async function preflight(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "preflight", ...extraBody },
  }), res);
  return res;
}

function blockerCodes(body) {
  return (body.blockers || []).map((item) => item.code);
}

function assertNoSecrets(raw) {
  expect(raw).not.toContain(GITHUB_READ_TOKEN);
  expect(raw).not.toContain(GITHUB_RELEASE_TOKEN);
  expect(raw).not.toContain(VERCEL_TOKEN);
  expect(raw).not.toContain(SERVICE_ROLE);
  expect(raw).not.toContain(BEARER);
  expect(raw).not.toMatch(/Bearer /i);
  expect(raw).not.toContain("authorization");
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.GITHUB_READ_TOKEN = GITHUB_READ_TOKEN;
  process.env.GITHUB_RELEASE_TOKEN = GITHUB_RELEASE_TOKEN;
  process.env.VERCEL_TOKEN = VERCEL_TOKEN;
  delete process.env.VITE_SUPABASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.GITHUB_RELEASE_TOKEN;
  delete process.env.VERCEL_TOKEN;
});

describe("releases — endpoint", () => {
  it("handler existe e é uma função", () => {
    expect(typeof handler).toBe("function");
  });
});

describe("releases — método", () => {
  it("GET → 405 com Allow adequado", async () => {
    const fn = mockFetch();
    const res = makeRes();
    await handler(makeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("OPTIONS, POST");
    expect(res.json().error).toBe("method_not_allowed");
    expect(fn).not.toHaveBeenCalled();
  });

  it("PUT → 405", async () => {
    mockFetch();
    const res = makeRes();
    await handler(makeReq({ method: "PUT" }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe("releases — autenticação", () => {
  it("POST sem Authorization → 401 e não consulta GitHub", async () => {
    const fn = mockFetch();
    const res = makeRes();
    await handler(makeReq({ body: { action: "preflight" } }), res);
    expect(res.statusCode).toBe(401);
    expect(fn.mock.calls.some(([url]) => String(url).includes("api.github.com"))).toBe(false);
  });

  it("Bearer inválido → 401", async () => {
    mockFetch({ userOk: false });
    const res = makeRes();
    await handler(makeReq({ headers: authHeaders(), body: { action: "preflight" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("usuário autenticado porém não Super Admin → 403", async () => {
    mockFetch({ operatorRows: [{ ativo: true, super_admin: false, loja_id: 5, ids_acesso: [] }] });
    const res = makeRes();
    await handler(makeReq({ headers: authHeaders(), body: { action: "preflight" } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe("releases — preflight GitHub server-side", () => {
  it("consulta GitHub no servidor (main, homologacao e compare) com token de leitura", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody()),
      }),
    });
    const res = await preflight();
    expect(res.statusCode).toBe(200);
    const githubCalls = fn.mock.calls.filter(([url]) => String(url).includes("api.github.com"));
    expect(githubCalls.some(([url]) => String(url).includes("/branches/main"))).toBe(true);
    expect(githubCalls.some(([url]) => String(url).includes("/branches/homologacao"))).toBe(true);
    expect(githubCalls.some(([url]) => String(url).includes("/compare/main...homologacao"))).toBe(true);
    githubCalls.forEach(([, options]) => {
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe(`Bearer ${GITHUB_READ_TOKEN}`);
    });
  });
});

describe("releases — regras de candidato", () => {
  it("main = homologacao → releaseReady false + NO_CHANGES_TO_RELEASE", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_MAIN)),
        compare: () => githubOk(compareBody({
          status: "identical",
          ahead_by: 0,
          behind_by: 0,
          mergeBase: SHA_MAIN,
          commits: [],
          files: [],
        })),
      }),
    });
    const res = await preflight();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("preflight");
    expect(body.releaseReady).toBe(false);
    expect(blockerCodes(body)).toContain("NO_CHANGES_TO_RELEASE");
    expect(body.targetSha).toBe(SHA_MAIN);
  });

  it("homologacao à frente com fast-forward → releaseReady true", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody({
          status: "ahead",
          ahead_by: 3,
          behind_by: 0,
          mergeBase: SHA_MAIN,
          commits: [makeCommit(SHA_HML), makeCommit(SHA_OTHER)],
          files: [
            { filename: "api/releases.js", status: "added" },
            { filename: "src/x.js", status: "modified" },
          ],
        })),
      }),
    });
    const res = await preflight();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.releaseReady).toBe(true);
    expect(body.source).toEqual({ branch: "homologacao", sha: SHA_HML });
    expect(body.destination).toEqual({ branch: "main", sha: SHA_MAIN });
    expect(body.compare.ahead).toBe(3);
    expect(body.compare.behind).toBe(0);
    expect(body.compare.fastForward).toBe(true);
    expect(body.targetSha).toBe(SHA_HML);
    expect(body.commits.length).toBeGreaterThan(0);
    expect(body.filesChanged).toBe(2);
    expect(body.blockers).toEqual([]);
  });

  it("branches divergentes → releaseReady false + BRANCH_DIVERGED", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody({
          status: "diverged",
          ahead_by: 2,
          behind_by: 1,
          mergeBase: SHA_OTHER,
        })),
      }),
    });
    const res = await preflight();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.releaseReady).toBe(false);
    expect(body.compare.fastForward).toBe(false);
    expect(blockerCodes(body)).toContain("BRANCH_DIVERGED");
  });

  it("targetSha do cliente divergente do HEAD real de homologacao → TARGET_SHA_CHANGED", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody()),
      }),
    });
    const res = await preflight({ targetSha: SHA_OTHER });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.releaseReady).toBe(false);
    expect(body.targetSha).toBe(SHA_HML);
    expect(blockerCodes(body)).toContain("TARGET_SHA_CHANGED");
  });
});

describe("releases — fail-closed", () => {
  it("falha GitHub não inventa SHA e impede release", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubAbort(),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody()),
      }),
    });
    const res = await preflight({ targetSha: SHA_HML });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.releaseReady).toBe(false);
    expect(body.source.sha).toBeNull();
    expect(body.destination.sha).toBeNull();
    expect(body.targetSha).toBeNull();
    expect(blockerCodes(body)).toContain("GITHUB_UNAVAILABLE");
  });

  it("HTTP GitHub 500 → fail-closed", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: () => githubError(500, { message: "boom" }),
    });
    const res = await preflight();
    const body = res.json();
    expect(body.releaseReady).toBe(false);
    expect(body.source.sha).toBeNull();
    expect(blockerCodes(body)).toContain("GITHUB_UNAVAILABLE");
  });
});

describe("releases — ações ainda desabilitadas", () => {
  it("promote → 409 RELEASE_ACTION_NOT_ENABLED e não consulta GitHub", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "promote", targetSha: SHA_HML },
    }), res);
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("RELEASE_ACTION_NOT_ENABLED");
    expect(body.enabled).toBe(false);
    expect(body.action).toBe("promote");
    expect(fn.mock.calls.some(([url]) => String(url).includes("api.github.com"))).toBe(false);
  });

  it("schedule → 409 RELEASE_ACTION_NOT_ENABLED", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "schedule" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_ACTION_NOT_ENABLED");
    expect(res.json().action).toBe("schedule");
  });
});

describe("releases — database e segredos", () => {
  it("database.automation blocked com reason PROD_MIGRATION_BASELINE_UNTRUSTED", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody()),
      }),
    });
    const res = await preflight();
    const body = res.json();
    expect(body.database.automation).toBe("blocked");
    expect(body.database.reason).toBe("PROD_MIGRATION_BASELINE_UNTRUSTED");
  });

  it("nenhum segredo aparece na resposta", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: githubHandler({
        main: () => githubOk(branchBody(SHA_MAIN)),
        homologacao: () => githubOk(branchBody(SHA_HML)),
        compare: () => githubOk(compareBody()),
      }),
    });
    const res = await preflight();
    assertNoSecrets(String(res.body));
  });
});
