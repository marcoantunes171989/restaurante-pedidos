/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("workflow/api", () => ({
  start: vi.fn(async () => ({ runId: "wrun_mock_schedule" })),
  getRun: vi.fn(() => ({ cancel: vi.fn(async () => {}) })),
}));

vi.mock("../../workflows/scheduled-release.js", () => ({
  scheduledReleaseWorkflow: async function scheduledReleaseWorkflow() {},
}));

import handler from "../../api/releases.js";
import { getRun, start } from "workflow/api";
import { scheduledReleaseWorkflow } from "../../workflows/scheduled-release.js";
import { executeScheduledRelease } from "../../server/release-core.js";

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
const SERVICE_ROLE = "supabase-service-role-secreto-teste";
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

function createRegistryMock({ seed = [], failWrite = false } = {}) {
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
  start.mockReset();
  start.mockResolvedValue({ runId: "wrun_mock_schedule" });
  getRun.mockReset();
  getRun.mockImplementation((runId) => ({
    runId,
    cancel: vi.fn(async () => {}),
  }));
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
    expect(start).not.toHaveBeenCalled();
    expect(getRun).not.toHaveBeenCalled();
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

    expect(start).not.toHaveBeenCalled();
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

describe("releases — schedule bloqueado sem confirmation/target/horario", () => {
  it("schedule sem confirmation → SCHEDULE_CONFIRMATION_REQUIRED e nenhum start", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "schedule", targetSha: SHA_HML, scheduledAt: futureIso() },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("SCHEDULE_CONFIRMATION_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it("confirmation diferente de AGENDAR → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ confirmation: "PROMOVER" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("SCHEDULE_CONFIRMATION_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it("schedule sem targetSha → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "schedule", confirmation: "AGENDAR", scheduledAt: futureIso() },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("TARGET_SHA_REQUIRED");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it("schedule sem scheduledAt → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({
      headers: authHeaders(),
      body: { action: "schedule", targetSha: SHA_HML, confirmation: "AGENDAR" },
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(githubCalls(fn)).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it("scheduledAt inválido → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: "amanha-as-dez" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(start).not.toHaveBeenCalled();
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("scheduledAt sem timezone → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: "2026-12-01T15:00:00" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(start).not.toHaveBeenCalled();
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("scheduledAt no passado → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: "2020-01-01T00:00:00Z" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(start).not.toHaveBeenCalled();
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("scheduledAt < now + 60s → bloqueado", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: futureIso(10_000) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INVALID_SCHEDULE_TIME");
    expect(start).not.toHaveBeenCalled();
    expect(githubCalls(fn)).toHaveLength(0);
  });
});

describe("releases — schedule revalida preflight e não inicia workflow se não estiver pronto", () => {
  it("targetSha mudou → não inicia workflow", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ targetSha: SHA_OTHER });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(res.json())).toContain("TARGET_SHA_CHANGED");
    expect(start).not.toHaveBeenCalled();
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("branches divergiram → não inicia workflow", async () => {
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
    expect(res.json().error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(res.json())).toContain("BRANCH_DIVERGED");
    expect(start).not.toHaveBeenCalled();
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("NO_CHANGES → não inicia workflow", async () => {
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
    const res = await schedule({ targetSha: SHA_MAIN });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("RELEASE_NOT_READY");
    expect(blockerCodes(res.json())).toContain("NO_CHANGES_TO_RELEASE");
    expect(start).not.toHaveBeenCalled();
    expect(dispatchCalls(fn)).toHaveLength(0);
  });
});

describe("releases — schedule válido inicia workflow durável", () => {
  it("schedule válido → HTTP 202 com identidade congelada e start único", async () => {
    const scheduledAt = "2026-12-01T18:00:00-03:00";
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({
      scheduledAt,
      releaseId: "id-enviado-pelo-frontend",
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("schedule");
    expect(body.status).toBe("SCHEDULED");
    expect(body.baseSha).toBe(SHA_MAIN);
    expect(body.targetSha).toBe(SHA_HML);
    expect(body.scheduledAtUtc).toBe("2026-12-01T21:00:00.000Z");
    expect(body.displayTimezone).toBe("America/Sao_Paulo");
    expect(body.workflowRunId).toBe("wrun_mock_schedule");
    expect(body.database).toEqual({
      automation: "blocked",
      reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
    });
    expect(body.releaseId).not.toBe("id-enviado-pelo-frontend");
    expect(body.releaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(scheduledReleaseWorkflow, [{
      releaseId: body.releaseId,
      baseSha: SHA_MAIN,
      targetSha: SHA_HML,
      scheduledAt: body.scheduledAtUtc,
    }]);
    const [, args] = start.mock.calls[0];
    expect(JSON.stringify(args[0])).not.toContain(GITHUB_READ_TOKEN);
    expect(JSON.stringify(args[0])).not.toContain(GITHUB_RELEASE_TOKEN);
    expect(JSON.stringify(args[0])).not.toContain(SERVICE_ROLE);
    expect(JSON.stringify(args[0])).not.toContain(BEARER);

    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(actionsCalls(fn)).toHaveLength(0);
    readCalls(fn).forEach(([, callOptions]) => {
      expect(callOptions.method).toBe("GET");
      expect(callOptions.headers.Authorization).toBe(`Bearer ${GITHUB_READ_TOKEN}`);
    });
    githubCalls(fn).forEach(([callUrl, callOptions]) => {
      expect(callOptions.method).not.toBe("PATCH");
      expect(callOptions.method).not.toBe("PUT");
      expect(String(callUrl)).not.toMatch(/\/git\/refs/);
    });
    assertNoSecrets(String(res.body));
  });
});

describe("releases — workflow durável estrutural", () => {
  const source = readFileSync(
    resolve(process.cwd(), "workflows/scheduled-release.js"),
    "utf8",
  );

  it("usa use workflow, sleep absoluto e use step sem timers/cron", () => {
    expect(source).toContain('"use workflow"');
    expect(source).toContain("await sleep(new Date(input.scheduledAt))");
    expect(source).toContain('"use step"');
    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("setInterval");
    expect(source).not.toMatch(/\bCron\b/);
    expect(source).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(source).not.toContain("GITHUB_READ_TOKEN");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/Bearer /);
  });
});

describe("releases — step de wake-up revalida e protege o dispatch", () => {
  const scheduledInput = {
    releaseId: SCHEDULED_RELEASE_ID,
    baseSha: SHA_MAIN,
    targetSha: SHA_HML,
    scheduledAt: "2026-12-01T21:00:00.000Z",
  };

  function scheduledRegistry(overrides = {}) {
    return createRegistryMock({
      seed: [{
        id: SCHEDULED_RELEASE_ID,
        mode: "scheduled",
        status: "SCHEDULED",
        base_sha: SHA_MAIN,
        target_sha: SHA_HML,
        scheduled_at: scheduledInput.scheduledAt,
        workflow_run_id: "wrun_mock_schedule",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        ...overrides,
      }],
    });
  }

  it("revalida main e homologacao no wake-up", async () => {
    const fn = mockFetch({ github: readyGithub(), registry: scheduledRegistry() });
    await executeScheduledRelease(scheduledInput);
    const urls = githubCalls(fn).map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/branches/main"))).toBe(true);
    expect(urls.some((url) => url.includes("/branches/homologacao"))).toBe(true);
    expect(urls.some((url) => url.includes("/compare/main...homologacao"))).toBe(true);
  });

  it("não promove se target mudou", async () => {
    const fn = mockFetch({
      github: readyGithub({
        homologacao: () => githubOk(branchBody(SHA_OTHER)),
      }),
      registry: scheduledRegistry(),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.resultCode).toBe("TARGET_SHA_CHANGED");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("não promove se base mudou", async () => {
    const fn = mockFetch({
      github: readyGithub({
        main: () => githubOk(branchBody(SHA_OTHER)),
        compare: () => githubOk(compareBody({
          status: "ahead",
          ahead_by: 2,
          behind_by: 0,
          mergeBase: SHA_OTHER,
        })),
      }),
      registry: scheduledRegistry(),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.resultCode).toBe("BASE_SHA_CHANGED");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("não promove se release ativa", async () => {
    const fn = mockFetch({
      github: readyGithub({
        runs: () => githubOk({
          workflow_runs: [{ id: 88, status: "in_progress", name: "outra-release" }],
        }),
      }),
      registry: scheduledRegistry(),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
    expect(result.resultCode).toBe("RELEASE_ALREADY_IN_PROGRESS");
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("usa releaseId como request_id e protege dispatch duplicado", async () => {
    const fn = mockFetch({
      github: readyGithub({
        runs: () => githubOk({
          workflow_runs: [{
            id: 99,
            status: "completed",
            name: `Production release ${SHA_HML} / ${scheduledInput.releaseId}`,
          }],
        }),
      }),
      registry: scheduledRegistry(),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ALREADY_DISPATCHED");
    expect(result.workflowRunId).toBe(99);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("dispatch programado envia o mesmo request_id congelado", async () => {
    const fn = mockFetch({ github: readyGithub(), registry: scheduledRegistry() });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("DISPATCHED");
    const posted = dispatchCalls(fn);
    expect(posted).toHaveLength(1);
    const payload = JSON.parse(posted[0][1].body);
    expect(payload.inputs.request_id).toBe(scheduledInput.releaseId);
    expect(payload.inputs.release_sha).toBe(SHA_HML);
    expect(payload.inputs.base_sha).toBe(SHA_MAIN);
    expect(payload.inputs.confirmation).toBe("DEPLOY-PROD");
    expect(posted[0][1].headers.Authorization).toBe(`Bearer ${GITHUB_RELEASE_TOKEN}`);
  });

  it("wake sem registry → não dispatch", async () => {
    const fn = mockFetch({ github: readyGithub(), registry: createRegistryMock() });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("wake CANCELED → não dispatch", async () => {
    const fn = mockFetch({
      github: readyGithub(),
      registry: scheduledRegistry({ status: "CANCELED", result_code: "CANCELED_BY_OPERATOR" }),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("wake baseSha mismatch → não dispatch", async () => {
    const fn = mockFetch({
      github: readyGithub(),
      registry: scheduledRegistry({ base_sha: SHA_OTHER }),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(dispatchCalls(fn)).toHaveLength(0);
  });

  it("wake targetSha mismatch → não dispatch", async () => {
    const fn = mockFetch({
      github: readyGithub(),
      registry: scheduledRegistry({ target_sha: SHA_OTHER }),
    });
    const result = await executeScheduledRelease(scheduledInput);
    expect(result.ok).toBe(false);
    expect(dispatchCalls(fn)).toHaveLength(0);
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

describe("releases — schedule persiste registry antes do start", () => {
  it("cria REQUESTED e após start marca SCHEDULED + workflowRunId", async () => {
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule({ scheduledAt: "2026-12-01T18:00:00-03:00" });
    expect(res.statusCode).toBe(202);
    const created = JSON.parse(registryPosts(fn)[0][1].body);
    expect(created.status).toBe("REQUESTED");
    expect(created.mode).toBe("scheduled");
    expect(res.json().workflowRunId).toBe("wrun_mock_schedule");
    const stored = [...fn.registry.rows.values()][0];
    expect(stored.status).toBe("SCHEDULED");
    expect(stored.workflow_run_id).toBe("wrun_mock_schedule");
    expect(start).toHaveBeenCalledTimes(1);
    assertNoSecrets(String(res.body));
  });

  it("start failure → FAILED WORKFLOW_START_FAILED", async () => {
    start.mockRejectedValueOnce(new Error("boom"));
    const fn = mockFetch({ operatorRows: [superAdminRow], github: readyGithub() });
    const res = await schedule();
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("WORKFLOW_START_FAILED");
    const stored = [...fn.registry.rows.values()][0];
    expect(stored.status).toBe("FAILED");
    expect(stored.result_code).toBe("WORKFLOW_START_FAILED");
  });
});

describe("releases — cancel seguro", () => {
  it("cancel release inexistente → RELEASE_NOT_FOUND", async () => {
    mockFetch({ operatorRows: [superAdminRow] });
    const res = await cancelRelease({ releaseId: "99999999-9999-4999-8999-999999999999" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("RELEASE_NOT_FOUND");
    expect(getRun).not.toHaveBeenCalled();
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
    expect(getRun).not.toHaveBeenCalled();
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
    expect(getRun).not.toHaveBeenCalled();
  });

  it("cancel SCHEDULED chama getRun.cancel uma vez e marca CANCELED", async () => {
    const cancel = vi.fn(async () => {});
    getRun.mockReturnValue({ cancel });
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
          workflow_run_id: "wrun_mock_schedule",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CANCELED");
    expect(getRun).toHaveBeenCalledTimes(1);
    expect(getRun).toHaveBeenCalledWith("wrun_mock_schedule");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fn.registry.rows.get(releaseId).status).toBe("CANCELED");
    expect(fn.registry.rows.get(releaseId).result_code).toBe("CANCELED_BY_OPERATOR");
    assertNoSecrets(String(res.body));
  });

  it("cancel já CANCELED é idempotente e não chama getRun", async () => {
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
    expect(getRun).not.toHaveBeenCalled();
  });

  it("falha cancel → não marca CANCELED", async () => {
    getRun.mockReturnValue({
      cancel: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
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
          workflow_run_id: "wrun_mock_schedule",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        }],
      }),
    });
    const res = await cancelRelease({ releaseId });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("WORKFLOW_CANCEL_FAILED");
    expect(fn.registry.rows.get(releaseId).status).toBe("SCHEDULED");
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

