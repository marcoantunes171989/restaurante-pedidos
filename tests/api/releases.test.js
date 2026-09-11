/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "../../api/releases.js";
import { buildServiceRoleHeaders, classifyServiceKey, listReleases } from "../../server/release-store.js";

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
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const SCHEDULED_RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_STATUSES = new Set([
  "REQUESTED", "SCHEDULED", "WAITING", "VALIDATING", "DISPATCHED", "RUNNING",
]);
const GITHUB_READ_TOKEN = "github-read-token-secreto-teste";
const GITHUB_RELEASE_TOKEN = "github-release-token-secreto-teste";
const VERCEL_TOKEN = "vercel-token-secreto-teste";
// JWT legado fake (role=service_role), usado como SUPABASE_SERVICE_ROLE_KEY nos testes.
// Header: {"alg":"HS256","typ":"JWT"} · Payload: {"role":"service_role",...} · assinatura fake.
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ" +
  ".assinatura-fake-de-teste-nao-real";
// Mesmo formato, porém role=anon — usado só nos testes de fail-closed do release-store.
const ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLW1vY2stdGVzdGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0" +
  ".assinatura-fake-de-teste-nao-real";
const SECRET_KEY = "sb_secret_teste_nao_real_1234567890";
const BEARER = "jwt-operador-secreto-teste";

function githubOk(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function githubNoContent() {
  return {
    ok: true,
    status: 204,
    json: async () => {
      throw new Error("empty body");
    },
    text: async () => "",
  };
}

function githubError(status, body = {}) {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function githubAbort() {
  const err = new Error("aborted");
  err.name = "AbortError";
  throw err;
}

function githubNetworkError() {
  throw new Error("network down");
}

function githubMalformed() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("bad json");
    },
    text: async () => "not-json{{{",
  };
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

function createRegistryMock({ seed = [], failWrite = false, failWriteWhen = null } = {}) {
  const rows = new Map();
  for (const row of seed) rows.set(row.id, { ...row });

  function parseFilters(url) {
    const parsed = new URL(url);
    return {
      id: parsed.searchParams.get("id"),
      status: parsed.searchParams.get("status"),
      order: parsed.searchParams.get("order"),
      limit: parsed.searchParams.get("limit"),
    };
  }

  function matchFilter(row, raw, field) {
    if (!raw) return true;
    if (raw.startsWith("eq.")) return String(row[field] ?? "") === raw.slice(3);
    if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const items = raw.slice(4, -1).split(",");
      return items.includes(String(row[field] ?? ""));
    }
    return true;
  }

  function list(url) {
    const filters = parseFilters(url);
    let result = [...rows.values()].filter((row) => (
      matchFilter(row, filters.id, "id") && matchFilter(row, filters.status, "status")
    ));
    if (filters.order === "created_at.desc") {
      result = result.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    }
    if (filters.limit) result = result.slice(0, Number(filters.limit));
    return result;
  }

  function jsonResponse(status, payload, ok = status >= 200 && status < 300) {
    const raw = JSON.stringify(payload);
    return {
      ok,
      status,
      json: async () => payload,
      text: async () => raw,
    };
  }

  return {
    rows,
    async handle(url, options = {}) {
      const method = String(options.method || "GET").toUpperCase();
      if (failWrite && (method === "POST" || method === "PATCH")) {
        return jsonResponse(500, { message: "registry down" }, false);
      }
      if (typeof failWriteWhen === "function" && (method === "POST" || method === "PATCH")) {
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(options.body);
        } catch {
          parsedBody = null;
        }
        if (failWriteWhen(parsedBody, method)) {
          return jsonResponse(500, { message: "registry down" }, false);
        }
      }
      if (method === "POST") {
        const body = JSON.parse(options.body);
        const insertingActive = ACTIVE_STATUSES.has(body.status);
        const hasActive = [...rows.values()].some((row) => ACTIVE_STATUSES.has(row.status));
        if (insertingActive && hasActive) {
          return jsonResponse(409, {
            code: "23505",
            message: 'duplicate key value violates unique constraint "app_release_runs_single_active_uidx"',
          }, false);
        }
        const now = new Date().toISOString();
        const row = {
          created_at: now,
          updated_at: now,
          ...body,
        };
        rows.set(row.id, row);
        return jsonResponse(201, [row]);
      }
      if (method === "PATCH") {
        const body = JSON.parse(options.body);
        const matched = list(url);
        const updated = matched.map((row) => {
          const next = { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() };
          rows.set(row.id, next);
          return next;
        });
        return jsonResponse(200, updated);
      }
      return jsonResponse(200, list(url));
    },
  };
}

function mockFetch({
  userOk = true,
  email = "super@teste.com",
  userId = OPERATOR_ID,
  operatorOk = true,
  operatorRows = [],
  github,
  registry = createRegistryMock(),
} = {}) {
  const fn = vi.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      if (!userOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: userId, email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      if (!operatorOk) return { ok: false, json: async () => [] };
      return { ok: true, json: async () => operatorRows };
    }
    if (target.includes("/rest/v1/app_release_runs")) {
      return registry.handle(target, options);
    }
    if (target.includes("api.github.com")) {
      if (typeof github !== "function") throw new Error(`github fetch inesperado no teste: ${target}`);
      return github(target, options);
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  fn.registry = registry;
  vi.stubGlobal("fetch", fn);
  return fn;
}

function githubHandler({ main, homologacao, compare, runs, dispatch }) {
  return (url) => {
    if (url.includes("/branches/homologacao")) return homologacao();
    if (url.includes("/branches/main")) return main();
    if (url.includes("/compare/main...homologacao")) return compare();
    if (url.includes("/actions/workflows/") && url.includes("/runs")) {
      if (typeof runs !== "function") throw new Error(`github runs inesperado no teste: ${url}`);
      return runs();
    }
    if (url.includes("/actions/workflows/") && url.includes("/dispatches")) {
      if (typeof dispatch !== "function") throw new Error(`github dispatch inesperado no teste: ${url}`);
      return dispatch();
    }
    throw new Error(`github url inesperada no teste: ${url}`);
  };
}

function readyGithub(overrides = {}) {
  return githubHandler({
    main: () => githubOk(branchBody(SHA_MAIN)),
    homologacao: () => githubOk(branchBody(SHA_HML)),
    compare: () => githubOk(compareBody()),
    runs: () => githubOk({ workflow_runs: [] }),
    dispatch: () => githubNoContent(),
    ...overrides,
  });
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

async function promote(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "promote", targetSha: SHA_HML, confirmation: "PROMOVER", ...extraBody },
  }), res);
  return res;
}

function futureIso(extraMs = 120_000) {
  return new Date(Date.now() + extraMs).toISOString();
}

async function schedule(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: {
      action: "schedule",
      targetSha: SHA_HML,
      scheduledAt: futureIso(),
      confirmation: "AGENDAR",
      ...extraBody,
    },
  }), res);
  return res;
}

async function cancelRelease(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "cancel", confirmation: "CANCELAR", ...extraBody },
  }), res);
  return res;
}

async function releaseGithubDiagnostic(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "release-github-diagnostic", ...extraBody },
  }), res);
  return res;
}

async function history(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "history", ...extraBody },
  }), res);
  return res;
}

async function statusOf(extraBody = {}) {
  const res = makeRes();
  await handler(makeReq({
    headers: authHeaders(),
    body: { action: "status", ...extraBody },
  }), res);
  return res;
}

function registryCalls(fn) {
  return fn.mock.calls.filter(([url]) => String(url).includes("/rest/v1/app_release_runs"));
}

function registryPosts(fn) {
  return registryCalls(fn).filter(([, options]) => String(options?.method || "GET").toUpperCase() === "POST");
}

function githubCalls(fn) {
  return fn.mock.calls.filter(([url]) => String(url).includes("api.github.com"));
}

function dispatchCalls(fn) {
  return githubCalls(fn).filter(([url]) => String(url).includes("/dispatches"));
}

function actionsCalls(fn) {
  return githubCalls(fn).filter(([url]) => String(url).includes("/actions/"));
}

function readCalls(fn) {
  return githubCalls(fn).filter(([url]) => {
    const target = String(url);
    return target.includes("/branches/") || target.includes("/compare/");
  });
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

describe("releases — cancel requer confirmação", () => {
  it("cancel sem confirmation → CANCEL_CONFIRMATION_REQUIRED", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow] });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "cancel" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("CANCEL_CONFIRMATION_REQUIRED");
    expect(fn.mock.calls.some(([url]) => String(url).includes("api.github.com"))).toBe(false);
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

describe("releases — promote bloqueado sem confirmação/target", () => {
  it("promote sem confirmation → PROMOTION_CONFIRMATION_REQUIRED e nenhum dispatch", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "promote", targetSha: SHA_HML },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("PROMOTION_CONFIRMATION_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("confirmation diferente de PROMOVER → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await promote({ confirmation: "DEPLOY-PROD" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("PROMOTION_CONFIRMATION_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("promote sem targetSha → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "promote", confirmation: "PROMOVER" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("TARGET_SHA_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });
});

describe("releases — promote revalida preflight e não dispara se não estiver pronto", () => {
  it("targetSha alterou → RELEASE_NOT_READY e nenhum dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub(),
    });
    const res = await promote({ targetSha: SHA_OTHER });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("RELEASE_NOT_READY");
    expect(body.releaseReady).toBe(false);
    expect(blockerCodes(body)).toContain("TARGET_SHA_CHANGED");
    expect(body.targetSha).toBe(SHA_HML);
    expect(actionsCalls(fn)).toHaveLength(0);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("branch divergiu → nenhum dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        compare: () => githubOk(compareBody({
          status: "diverged",
          ahead_by: 2,
          behind_by: 1,
          mergeBase: SHA_OTHER,
        })),
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(res.json())).toContain("BRANCH_DIVERGED");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("NO_CHANGES → nenhum dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
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
    const res = await promote({ targetSha: SHA_MAIN });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(res.json())).toContain("NO_CHANGES_TO_RELEASE");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });
});

describe("releases — promote guards e dispatch", () => {
  it("GITHUB_RELEASE_TOKEN ausente → fail closed", async () => {
    delete process.env.GITHUB_RELEASE_TOKEN;
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await promote();
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("GITHUB_RELEASE_UNAVAILABLE");
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(actionsCalls(fn)).toHaveLength(0);
    readCalls(fn).forEach(([, options]) => {
      expect(options.headers.Authorization).toBe(`Bearer ${GITHUB_READ_TOKEN}`);
    });
  });

  it("release ativa → RELEASE_ALREADY_IN_PROGRESS", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        runs: () => githubOk({
          workflow_runs: [{ id: 11, status: "in_progress" }],
        }),
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_ALREADY_IN_PROGRESS");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("falha ao consultar active runs → fail closed", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        runs: () => githubError(500, { message: "boom" }),
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("RELEASE_STATUS_UNAVAILABLE");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("dispatch GitHub falha → WORKFLOW_DISPATCH_FAILED sem retry", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        dispatch: () => githubError(500, { message: "dispatch failed" }),
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("WORKFLOW_DISPATCH_FAILED");
    expect(dispatchCalls(fn)).toHaveLength(1);
  });

  it("dispatch GitHub sucesso → HTTP 202 com identidade server-side", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await promote({ releaseId: "id-enviado-pelo-frontend" });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("promote");
    expect(body.status).toBe("DISPATCHED");
    expect(body.baseSha).toBe(SHA_MAIN);
    expect(body.targetSha).toBe(SHA_HML);
    expect(body.workflow).toBe("vercel-production-deploy.yml");
    expect(body.database).toEqual({
      automation: "blocked",
      reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
    });
    expect(body.releaseId).not.toBe("id-enviado-pelo-frontend");
    expect(body.releaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const posted = dispatchCalls(fn);
    expect(posted).toHaveLength(1);
    const [url, options] = posted[0];
    expect(String(url)).toContain("/actions/workflows/vercel-production-deploy.yml/dispatches");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe(`Bearer ${GITHUB_RELEASE_TOKEN}`);
    const payload = JSON.parse(options.body);
    expect(payload.ref).toBe("main");
    expect(payload.inputs.release_sha).toBe(SHA_HML);
    expect(payload.inputs.base_sha).toBe(SHA_MAIN);
    expect(payload.inputs.confirmation).toBe("DEPLOY-PROD");
    expect(payload.inputs.request_id).toBe(body.releaseId);

    readCalls(fn).forEach(([, callOptions]) => {
      expect(callOptions.method).toBe("GET");
      expect(callOptions.headers.Authorization).toBe(`Bearer ${GITHUB_READ_TOKEN}`);
    });
    actionsCalls(fn).forEach(([callUrl, callOptions]) => {
      expect(String(callUrl)).toContain("/actions/");
      expect(callOptions.headers.Authorization).toBe(`Bearer ${GITHUB_RELEASE_TOKEN}`);
    });
    githubCalls(fn).forEach(([callUrl, callOptions]) => {
      expect(callOptions.method).not.toBe("PATCH");
      expect(callOptions.method).not.toBe("PUT");
      expect(String(callUrl)).not.toMatch(/\/git\/refs/);
    });
    assertNoSecrets(String(res.body));
  });
});

describe("releases — workflow production estático", () => {
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/vercel-production-deploy.yml"),
    "utf8",
  );

  it("reutiliza o workflow com validação fail-closed e fast-forward", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("base_sha");
    expect(workflow).toContain("release_sha");
    expect(workflow).toContain("request_id");
    expect(workflow).toContain("DEPLOY-PROD");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pedido-prime-production");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("git fetch origin main homologacao");
    expect(workflow).toContain("Revalidate branches before push");
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).not.toContain("vercel --prod");
    expect(workflow).not.toContain("VERCEL_TOKEN");
    expect(workflow).not.toContain("--force-with-lease");
    expect(workflow).not.toMatch(/(?:^|[\s"])--force(?:\s|$)/m);
  });
});

describe("releases — schedule (RELEASE-AUTO-06B, scheduler nativo)", () => {
  it("schedule sem confirmation → SCHEDULE_CONFIRMATION_REQUIRED, sem registry, sem GitHub", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ confirmation: undefined });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("SCHEDULE_CONFIRMATION_REQUIRED");
    expect(registryPosts(fn)).toHaveLength(0);
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("confirmation diferente de AGENDAR → SCHEDULE_CONFIRMATION_REQUIRED", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ confirmation: "PROMOVER" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("SCHEDULE_CONFIRMATION_REQUIRED");
    expect(registryPosts(fn)).toHaveLength(0);
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("schedule sem targetSha → TARGET_SHA_REQUIRED, sem GitHub", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "schedule", confirmation: "AGENDAR", scheduledAt: futureIso() },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("TARGET_SHA_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("scheduledAt inválido (sem timezone explícito) → INVALID_SCHEDULE_TIME, sem GitHub", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: "2026-09-10 10:00:00" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("scheduledAt no passado → INVALID_SCHEDULE_TIME", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: new Date(Date.now() - 60_000).toISOString() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("preflight blocked (branches divergidas) → RELEASE_NOT_READY, sem registry", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        compare: () => githubOk(compareBody({
          status: "diverged",
          ahead_by: 2,
          behind_by: 1,
          mergeBase: SHA_OTHER,
        })),
      }),
    });
    const res = await schedule();
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(body)).toContain("BRANCH_DIVERGED");
    expect(registryPosts(fn)).toHaveLength(0);
  });

  it("release ativa no registry → RELEASE_ALREADY_IN_PROGRESS sem criar segunda linha", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub(),
      registry: createRegistryMock({
        seed: [{
          id: "33333333-3333-4333-8333-333333333333",
          mode: "immediate",
          status: "RUNNING",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await schedule();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_ALREADY_IN_PROGRESS");
    expect(fn.registry.rows.size).toBe(1);
  });

  it("falha no registry → RELEASE_REGISTRY_UNAVAILABLE", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub(),
      registry: createRegistryMock({ failWrite: true }),
    });
    const res = await schedule();
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(fn.registry.rows.size).toBe(0);
  });

  it("schedule success → cria app_release_runs mode=scheduled/status=SCHEDULED diretamente, HTTP 202, sem dispatch GitHub", async () => {
    const scheduledAt = futureIso(300_000);
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("schedule");
    expect(body.status).toBe("SCHEDULED");
    expect(body.baseSha).toBe(SHA_MAIN);
    expect(body.targetSha).toBe(SHA_HML);
    expect(body.scheduledAtUtc).toBe(new Date(scheduledAt).toISOString());
    expect(body.displayTimezone).toBe("America/Sao_Paulo");
    expect(body.releaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const posted = registryPosts(fn);
    expect(posted).toHaveLength(1);
    const created = JSON.parse(posted[0][1].body);
    expect(created.mode).toBe("scheduled");
    expect(created.status).toBe("SCHEDULED");
    expect(created.base_sha).toBe(SHA_MAIN);
    expect(created.target_sha).toBe(SHA_HML);
    expect(created.scheduled_at).toBe(new Date(scheduledAt).toISOString());
    expect(created.requested_by_user_id).toBe(OPERATOR_ID);

    // Nenhuma chamada externa além do preflight GitHub read-only: sem
    // /dispatches e sem /actions/workflows runs (isso é responsabilidade
    // exclusiva do executor, não do schedule).
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(actionsCalls(fn)).toHaveLength(0);
    readCalls(fn).forEach(([, options]) => {
      expect(options.method).toBe("GET");
      expect(options.headers.Authorization).toBe(`Bearer ${GITHUB_READ_TOKEN}`);
    });
    assertNoSecrets(String(res.body));
  });
});

describe("releases — promote persiste registry antes do dispatch", () => {
  it("cria registry REQUESTED before dispatch e marca DISPATCHED no sucesso", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await promote();
    expect(res.statusCode).toBe(202);
    const posted = registryPosts(fn);
    expect(posted).toHaveLength(1);
    const created = JSON.parse(posted[0][1].body);
    expect(created.status).toBe("REQUESTED");
    expect(created.mode).toBe("immediate");
    expect(created.requested_by_user_id).toBe(OPERATOR_ID);
    expect(created.requested_by_email).toBe("super@teste.com");
    expect(created.base_sha).toBe(SHA_MAIN);
    expect(created.target_sha).toBe(SHA_HML);

    const postIdx = fn.mock.calls.findIndex(([url, options]) => (
      String(url).includes("/rest/v1/app_release_runs") && String(options?.method).toUpperCase() === "POST"
    ));
    const dispatchIdx = fn.mock.calls.findIndex(([url]) => String(url).includes("/dispatches"));
    expect(postIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(postIdx);

    const stored = [...fn.registry.rows.values()][0];
    expect(stored.status).toBe("DISPATCHED");
    expect(stored.id).toBe(res.json().releaseId);
    assertNoSecrets(String(res.body));
  });

  it("falha registry → nenhum dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub(),
      registry: createRegistryMock({ failWrite: true }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("single active conflict → RELEASE_ALREADY_IN_PROGRESS sem dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub(),
      registry: createRegistryMock({
        seed: [{
          id: "33333333-3333-4333-8333-333333333333",
          mode: "immediate",
          status: "RUNNING",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_ALREADY_IN_PROGRESS");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("dispatch failure → FAILED e sem segundo dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        dispatch: () => githubError(500, { message: "dispatch failed" }),
      }),
    });
    const res = await promote();
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("WORKFLOW_DISPATCH_FAILED");
    expect(dispatchCalls(fn)).toHaveLength(1);
    const stored = [...fn.registry.rows.values()][0];
    expect(stored.status).toBe("FAILED");
    expect(stored.result_code).toBe("WORKFLOW_DISPATCH_FAILED");
  });
});

describe("releases — cancel seguro (sem orquestrador externo, RELEASE-AUTO-06A)", () => {
  it("cancel release inexistente → RELEASE_NOT_FOUND", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = await cancelRelease({ releaseId: "99999999-9999-4999-8999-999999999999" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("RELEASE_NOT_FOUND");
  });

  it("cancel immediate → RELEASE_NOT_CANCELABLE", async () => {
    const releaseId = "44444444-4444-4444-8444-444444444444";
    mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "immediate",
          status: "REQUESTED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_CANCELABLE");
  });

  it("cancel estado RUNNING → RELEASE_NOT_CANCELABLE", async () => {
    const releaseId = "55555555-5555-4555-8555-555555555555";
    mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "scheduled",
          status: "RUNNING",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          workflow_run_id: "wrun_running",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_CANCELABLE");
  });

  it("cancel SCHEDULED marca CANCELED localmente, sem chamar serviço externo", async () => {
    const releaseId = SCHEDULED_RELEASE_ID;
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "scheduled",
          status: "SCHEDULED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          workflow_run_id: "wrun_legado_pre_migracao",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CANCELED");
    expect(fn.registry.rows.get(releaseId).status).toBe("CANCELED");
    expect(fn.registry.rows.get(releaseId).result_code).toBe("CANCELED_BY_OPERATOR");
    assertNoSecrets(String(res.body));
  });

  it("cancel SCHEDULED sem workflow_run_id também marca CANCELED (não depende de orquestrador)", async () => {
    const releaseId = SCHEDULED_RELEASE_ID;
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "scheduled",
          status: "SCHEDULED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          workflow_run_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CANCELED");
    expect(fn.registry.rows.get(releaseId).status).toBe("CANCELED");
  });

  it("cancel já CANCELED é idempotente", async () => {
    const releaseId = SCHEDULED_RELEASE_ID;
    mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "scheduled",
          status: "CANCELED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          workflow_run_id: "wrun_mock_schedule",
          result_code: "CANCELED_BY_OPERATOR",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          canceled_at: "2026-09-01T01:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CANCELED");
  });
});

describe("releases — history", () => {
  it("history default limit 20, máximo 50 e ordem DESC", async () => {
    const registry = createRegistryMock({
      seed: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          mode: "immediate",
          status: "SUCCEEDED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T10:00:00.000Z",
          updated_at: "2026-09-01T10:00:00.000Z",
          error_message: "falha Bearer super-secreto-xyz",
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          mode: "scheduled",
          status: "CANCELED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-02T10:00:00.000Z",
          updated_at: "2026-09-02T10:00:00.000Z",
        },
      ],
    });
    const fn = mockFetch({ operatorRows: [superAdminRow], registry });
    const res = await history();
    expect(res.statusCode).toBe(200);
    const listUrl = registryCalls(fn).map(([url]) => String(url)).find((url) => url.includes("order=created_at.desc"));
    expect(listUrl).toContain("limit=20");
    expect(res.json().items[0].releaseId).toBe("77777777-7777-4777-8777-777777777777");
    expect(res.json().items[1].releaseId).toBe("66666666-6666-4666-8666-666666666666");
    assertNoSecrets(String(res.body));

    const capped = await history({ limit: 999 });
    expect(capped.statusCode).toBe(200);
    const cappedUrl = registryCalls(fn).map(([url]) => String(url)).filter((url) => url.includes("order=created_at.desc")).at(-1);
    expect(cappedUrl).toContain("limit=50");
    expect(cappedUrl).not.toContain("limit=999");
  });
});

function registryFailureFetch({
  status,
  body,
  networkError = false,
  email = "super@teste.com",
  userId = OPERATOR_ID,
} = {}) {
  const fn = vi.fn(async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      return { ok: true, json: async () => ({ id: userId, email }) };
    }
    if (target.includes("/rest/v1/tab_usuarios")) {
      return { ok: true, json: async () => [superAdminRow] };
    }
    if (target.includes("/rest/v1/app_release_runs")) {
      if (networkError) throw new Error("network down");
      const raw = JSON.stringify(body ?? {});
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => raw,
      };
    }
    throw new Error(`fetch inesperado no teste: ${target}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const REGISTRY_DIAGNOSTIC_KEYS = [
  "httpStatus",
  "networkError",
  "postgrestCode",
  "requestAttempted",
  "serviceKeyConfigured",
  "serviceKeyKind",
  "stage",
  "supabaseProjectRef",
  "supabaseUrlConfigured",
  "viteSupabaseProjectRef",
].sort();

describe("releases — registryDiagnostic sanitizado (history)", () => {
  it("PostgREST 401 → stage POSTGREST_RESPONSE com httpStatus e postgrestCode, sem message/hint", async () => {
    registryFailureFetch({
      status: 401,
      body: { code: "PGRST301", message: "JWT expired", hint: "check token" },
    });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(Object.keys(body.registryDiagnostic).sort()).toEqual(REGISTRY_DIAGNOSTIC_KEYS);
    expect(body.registryDiagnostic).toEqual({
      stage: "POSTGREST_RESPONSE",
      requestAttempted: true,
      httpStatus: 401,
      postgrestCode: "PGRST301",
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    expect(String(res.body)).not.toContain("JWT expired");
    expect(String(res.body)).not.toContain("check token");
  });

  it("PostgREST 403 → stage POSTGREST_RESPONSE sem message", async () => {
    registryFailureFetch({
      status: 403,
      body: { code: "42501", message: "permission denied for table app_release_runs" },
    });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "POSTGREST_RESPONSE",
      requestAttempted: true,
      httpStatus: 403,
      postgrestCode: "42501",
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    expect(String(res.body)).not.toContain("permission denied");
  });

  it("PostgREST 404 + PGRST205 → stage POSTGREST_RESPONSE sem message/details/hint", async () => {
    registryFailureFetch({
      status: 404,
      body: {
        code: "PGRST205",
        message: "Could not find the table 'public.app_release_runs' in the schema cache",
        details: null,
        hint: null,
      },
    });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "POSTGREST_RESPONSE",
      requestAttempted: true,
      httpStatus: 404,
      postgrestCode: "PGRST205",
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    expect(String(res.body)).not.toContain("schema cache");
  });

  it("sb_secret válida + PostgREST 401 → serviceKeyKind secret", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET_KEY;
    registryFailureFetch({
      status: 401,
      body: { code: "PGRST301", message: "JWT expired" },
    });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "POSTGREST_RESPONSE",
      requestAttempted: true,
      httpStatus: 401,
      postgrestCode: "PGRST301",
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "secret",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("erro de rede → stage FETCH_NETWORK_ERROR, httpStatus e postgrestCode nulos", async () => {
    registryFailureFetch({ networkError: true });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "FETCH_NETWORK_ERROR",
      requestAttempted: true,
      httpStatus: null,
      postgrestCode: null,
      networkError: true,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
  });

  // checkAuth (api/releases.js) exige SUPABASE_URL/SERVICE_ROLE_KEY para
  // autenticar o operador e retorna 500 antes de chegar ao release-store
  // quando ausentes — por isso estes dois cenários exercitam listReleases()
  // diretamente (nível release-store), não o handler HTTP completo.
  it("SUPABASE_URL ausente → stage SUPABASE_URL_MISSING, requestAttempted false", async () => {
    delete process.env.SUPABASE_URL;
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("fetch não deveria ser chamado sem SUPABASE_URL");
    }));
    const result = await listReleases({ limit: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(result.diagnostic).toEqual({
      stage: "SUPABASE_URL_MISSING",
      requestAttempted: false,
      httpStatus: null,
      postgrestCode: null,
      networkError: null,
      supabaseUrlConfigured: false,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: null,
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(JSON.stringify(result));
    process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  });

  it("SUPABASE_SERVICE_ROLE_KEY ausente → stage SERVICE_KEY_INVALID, serviceKeyKind missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("fetch não deveria ser chamado sem SERVICE_ROLE_KEY");
    }));
    const result = await listReleases({ limit: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(result.diagnostic).toEqual({
      stage: "SERVICE_KEY_INVALID",
      requestAttempted: false,
      httpStatus: null,
      postgrestCode: null,
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: false,
      serviceKeyKind: "missing",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(JSON.stringify(result));
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("SUPABASE_SERVICE_ROLE_KEY em formato inválido → stage SERVICE_KEY_INVALID, serviceKeyKind invalid", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "formato-desconhecido-qualquer";
    registryFailureFetch();
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "SERVICE_KEY_INVALID",
      requestAttempted: false,
      httpStatus: null,
      postgrestCode: null,
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "invalid",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("registryDiagnostic nunca vaza raw body, URL Supabase ou credenciais mesmo se presentes no erro do PostgREST", async () => {
    registryFailureFetch({
      status: 500,
      body: {
        code: "XX000",
        message: "internal error",
        details: "raw detail",
        hint: "raw hint",
        url: "https://rwnzggjxhxnfrhstbxkm.supabase.co",
        apikey: "leaked-key",
        authorization: "Bearer leaked-token",
      },
    });
    const res = await history();
    const body = res.json();
    expect(Object.keys(body.registryDiagnostic).sort()).toEqual(REGISTRY_DIAGNOSTIC_KEYS);
    expect(body.registryDiagnostic).toEqual({
      stage: "POSTGREST_RESPONSE",
      requestAttempted: true,
      httpStatus: 500,
      postgrestCode: "XX000",
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "legacy",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    expect(String(res.body)).not.toContain("internal error");
    expect(String(res.body)).not.toContain("raw detail");
    expect(String(res.body)).not.toContain("raw hint");
    expect(String(res.body)).not.toContain("rwnzggjxhxnfrhstbxkm.supabase.co");
    expect(String(res.body)).not.toContain("leaked-key");
    expect(String(res.body)).not.toContain("leaked-token");
  });
});

describe("releases — status e reconciliação GitHub", () => {
  it("status 404 para release inexistente", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = await statusOf({ releaseId: "99999999-9999-4999-8999-999999999999" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("RELEASE_NOT_FOUND");
  });

  it("status GitHub success → SUCCEEDED", async () => {
    const releaseId = "88888888-8888-4888-8888-888888888888";
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        runs: () => githubOk({
          workflow_runs: [{
            id: 321,
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/marcoantunes171989/restaurante-pedidos/actions/runs/321",
            name: `Production release ${releaseId}`,
          }],
        }),
      }),
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "immediate",
          status: "DISPATCHED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await statusOf({ releaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("SUCCEEDED");
    expect(res.json().release.status).toBe("SUCCEEDED");
    expect(fn.registry.rows.get(releaseId).status).toBe("SUCCEEDED");
    expect(res.json().activeRelease).toBeNull();
    assertNoSecrets(String(res.body));
  });

  it("status sem releaseId retorna activeRelease", async () => {
    const releaseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mockFetch({
      operatorRows: [superAdminRow],
      registry: createRegistryMock({
        seed: [{
          id: releaseId,
          mode: "scheduled",
          status: "SCHEDULED",
          base_sha: SHA_MAIN,
          target_sha: SHA_HML,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await statusOf();
    expect(res.statusCode).toBe(200);
    expect(res.json().activeRelease.releaseId).toBe(releaseId);
    expect(res.json().database).toEqual({
      automation: "blocked",
      reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
    });
  });
});

describe("release-store — autenticação da service key contra o Data API", () => {
  it("classifyServiceKey: sb_secret_ → kind secret", () => {
    expect(classifyServiceKey(SECRET_KEY)).toEqual({ kind: "secret", key: SECRET_KEY });
  });

  it("classifyServiceKey: JWT legado role=service_role → kind legacy", () => {
    expect(classifyServiceKey(SERVICE_ROLE)).toEqual({ kind: "legacy", key: SERVICE_ROLE });
  });

  it("classifyServiceKey: JWT role=anon → invalid (fail closed)", () => {
    expect(classifyServiceKey(ANON_JWT)).toEqual({ kind: "invalid" });
  });

  it("classifyServiceKey: JWT sem role → invalid (fail closed)", () => {
    const noRoleJwt = "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ4In0.assinatura";
    expect(classifyServiceKey(noRoleJwt)).toEqual({ kind: "invalid" });
  });

  it("classifyServiceKey: formato desconhecido → invalid (fail closed)", () => {
    expect(classifyServiceKey("supabase-service-role-secreto-teste")).toEqual({ kind: "invalid" });
    expect(classifyServiceKey("")).toEqual({ kind: "invalid" });
    expect(classifyServiceKey(null)).toEqual({ kind: "invalid" });
  });

  it("buildServiceRoleHeaders: sb_secret_ usa apenas apikey (sem Authorization Bearer)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET_KEY;
    const headers = buildServiceRoleHeaders({ json: true, prefer: "return=representation" });
    expect(headers.apikey).toBe(SECRET_KEY);
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Prefer).toBe("return=representation");
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("buildServiceRoleHeaders: JWT legado service_role usa apikey + Authorization Bearer", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    const headers = buildServiceRoleHeaders({});
    expect(headers.apikey).toBe(SERVICE_ROLE);
    expect(headers.authorization).toBe(`Bearer ${SERVICE_ROLE}`);
  });

  it("buildServiceRoleHeaders: JWT anon falha fechado (null, nenhum header)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ANON_JWT;
    expect(buildServiceRoleHeaders({})).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("buildServiceRoleHeaders: formato desconhecido falha fechado (null, nenhum header)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "formato-desconhecido-qualquer";
    expect(buildServiceRoleHeaders({})).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("history com service key inválida → RELEASE_REGISTRY_UNAVAILABLE sem chamar o Data API", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ANON_JWT;
    const fn = mockFetch({ operatorRows: [superAdminRow] });
    const res = await history();
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("RELEASE_REGISTRY_UNAVAILABLE");
    expect(registryCalls(fn)).toHaveLength(0);
    assertNoSecrets(String(res.body));
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("history continua funcionando com mock de service_role (JWT legado)", async () => {
    const registry = createRegistryMock({
      seed: [{
        id: "99999999-9999-4999-8999-999999999999",
        mode: "immediate",
        status: "SUCCEEDED",
        base_sha: SHA_MAIN,
        target_sha: SHA_HML,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }],
    });
    const fn = mockFetch({ operatorRows: [superAdminRow], registry });
    const res = await history();
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    const [, options] = registryCalls(fn)[0];
    expect(options.headers.apikey).toBe(SERVICE_ROLE);
    expect(options.headers.authorization).toBe(`Bearer ${SERVICE_ROLE}`);
    assertNoSecrets(String(res.body));
  });

  it("diagnóstico seguro continua disponível quando a service key falha fechado", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "formato-desconhecido-qualquer";
    mockFetch({ operatorRows: [superAdminRow] });
    const res = await history();
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.registryDiagnostic).toEqual({
      stage: "SERVICE_KEY_INVALID",
      requestAttempted: false,
      httpStatus: null,
      postgrestCode: null,
      networkError: null,
      supabaseUrlConfigured: true,
      serviceKeyConfigured: true,
      serviceKeyKind: "invalid",
      supabaseProjectRef: "hml-x",
      viteSupabaseProjectRef: null,
    });
    assertNoSecrets(String(res.body));
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  });

  it("nenhuma service key aparece na resposta em nenhum cenário", async () => {
    const registry = createRegistryMock();
    mockFetch({ operatorRows: [superAdminRow], registry });
    const ok = await history();
    assertNoSecrets(String(ok.body));
    expect(String(ok.body)).not.toContain(SECRET_KEY);
    expect(String(ok.body)).not.toContain(ANON_JWT);
  });
});

// ════════════════════════════════════════════════════════════
// RELEASE-AUTO-06N-DIAG-01 — release-github-diagnostic:
// ação Super Admin somente leitura, mesma consulta GitHub Actions de
// findActiveProductionRelease(), nunca dispatch/promote/schedule/registry.
// ════════════════════════════════════════════════════════════
describe("releases — release-github-diagnostic", () => {
  it("token GITHUB_RELEASE_TOKEN ausente → diagnostic tokenConfigured false, sem chamada GitHub", async () => {
    delete process.env.GITHUB_RELEASE_TOKEN;
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await releaseGithubDiagnostic();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("release-github-diagnostic");
    expect(body.diagnostic).toEqual({
      stage: "workflow-runs",
      tokenConfigured: false,
      httpStatus: null,
      timeout: false,
      networkError: false,
      parseError: false,
      workflowRunsArray: false,
      ok: false,
    });
    expect(actionsCalls(fn)).toHaveLength(0);
  });

  it.each([401, 403])("GitHub HTTP %d → diagnostic httpStatus refletido, ok false", async (status) => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        runs: () => githubError(status, { message: "Bad credentials" }),
      }),
    });
    const res = await releaseGithubDiagnostic();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.diagnostic.tokenConfigured).toBe(true);
    expect(body.diagnostic.httpStatus).toBe(status);
    expect(body.diagnostic.ok).toBe(false);
    expect(body.diagnostic.timeout).toBe(false);
    expect(body.diagnostic.networkError).toBe(false);
    expect(body.diagnostic.parseError).toBe(false);
    expect(body.diagnostic.workflowRunsArray).toBe(false);
  });

  it("timeout na consulta GitHub → diagnostic timeout true, ok false", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({ runs: () => githubAbort() }),
    });
    const res = await releaseGithubDiagnostic();
    const body = res.json();
    expect(body.diagnostic.timeout).toBe(true);
    expect(body.diagnostic.httpStatus).toBe(0);
    expect(body.diagnostic.ok).toBe(false);
  });

  it("networkError na consulta GitHub → diagnostic networkError true, ok false", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({ runs: () => githubNetworkError() }),
    });
    const res = await releaseGithubDiagnostic();
    const body = res.json();
    expect(body.diagnostic.networkError).toBe(true);
    expect(body.diagnostic.timeout).toBe(false);
    expect(body.diagnostic.ok).toBe(false);
  });

  it("parseError no corpo do GitHub → diagnostic parseError true, ok false", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({ runs: () => githubMalformed() }),
    });
    const res = await releaseGithubDiagnostic();
    const body = res.json();
    expect(body.diagnostic.parseError).toBe(true);
    expect(body.diagnostic.httpStatus).toBe(200);
    expect(body.diagnostic.workflowRunsArray).toBe(false);
    expect(body.diagnostic.ok).toBe(false);
  });

  it("workflow_runs ausente no corpo (200 válido) → workflowRunsArray false, ok false", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({ runs: () => githubOk({ message: "sem campo workflow_runs" }) }),
    });
    const res = await releaseGithubDiagnostic();
    const body = res.json();
    expect(body.diagnostic.httpStatus).toBe(200);
    expect(body.diagnostic.parseError).toBe(false);
    expect(body.diagnostic.workflowRunsArray).toBe(false);
    expect(body.diagnostic.ok).toBe(false);
  });

  it("workflow_runs válido → diagnostic ok true", async () => {
    mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({ runs: () => githubOk({ workflow_runs: [{ id: 1, status: "completed", conclusion: "success" }] }) }),
    });
    const res = await releaseGithubDiagnostic();
    const body = res.json();
    expect(body.diagnostic.httpStatus).toBe(200);
    expect(body.diagnostic.workflowRunsArray).toBe(true);
    expect(body.diagnostic.ok).toBe(true);
    expect(body.diagnostic.timeout).toBe(false);
    expect(body.diagnostic.networkError).toBe(false);
    expect(body.diagnostic.parseError).toBe(false);
  });

  it("nenhum segredo aparece na resposta do diagnóstico", async () => {
    mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await releaseGithubDiagnostic();
    assertNoSecrets(String(res.body));
  });

  it("diagnostic action não chama workflow_dispatch", async () => {
    const fn = mockFetch({
      operatorRows: [superAdminRow],
      github: readyGithub({
        runs: () => githubOk({ workflow_runs: [{ id: 1, status: "in_progress" }] }),
      }),
    });
    const res = await releaseGithubDiagnostic();
    expect(res.statusCode).toBe(200);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("diagnostic action não cria nem atualiza app_release_runs", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await releaseGithubDiagnostic();
    expect(res.statusCode).toBe(200);
    expect(registryCalls(fn)).toHaveLength(0);
    expect(fn.registry.rows.size).toBe(0);
  });

  it("usuário autenticado porém não Super Admin → 403, sem consultar GitHub", async () => {
    const fn = mockFetch({
      operatorRows: [{ ativo: true, super_admin: false, loja_id: 5, ids_acesso: [] }],
      github: readyGithub(),
    });
    const res = await releaseGithubDiagnostic();
    expect(res.statusCode).toBe(403);
    expect(githubCalls(fn)).toHaveLength(0);
  });
});

