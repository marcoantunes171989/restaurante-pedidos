/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "../../api/releases-executor.js";
import { claimReleaseForValidation, findDueScheduledRelease } from "../../server/release-store.js";

// ════════════════════════════════════════════════════════════
// RELEASE-AUTO-06B — /api/releases-executor: claim atômico + dispatch
// idempotente de releases agendadas. Nenhum teste chama GitHub/Supabase
// reais: fetch é sempre mockado. Autenticação independente de usuário
// (Bearer RELEASE_EXECUTOR_SECRET), nunca confia em dados do request.
// ════════════════════════════════════════════════════════════

const SHA_MAIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_HML = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const GITHUB_READ_TOKEN = "github-read-token-secreto-teste";
const GITHUB_RELEASE_TOKEN = "github-release-token-secreto-teste";
const EXECUTOR_SECRET = "release-executor-secret-de-teste-com-mais-de-32-bytes";
const SHORT_SECRET = "muito-curto";

function makeReq({ method = "POST", headers = {} } = {}) {
  return { method, headers };
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

function githubOk(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function githubNoContent() {
  return {
    ok: true,
    status: 204,
    json: async () => { throw new Error("empty body"); },
    text: async () => "",
  };
}

function githubError(status, body = {}) {
  return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) };
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

// Registry mock genérico o bastante para os filtros PostgREST usados pelo
// executor: eq./lte./in.() em id, mode, status, scheduled_at, updated_at,
// mais order=<campo>.asc e limit=N.
function createExecutorRegistryMock({ seed = [], patchOverride = null } = {}) {
  const rows = new Map();
  for (const row of seed) rows.set(row.id, { ...row });

  function parseFilters(url) {
    const parsed = new URL(url);
    const out = {};
    for (const [key, value] of parsed.searchParams.entries()) out[key] = value;
    return out;
  }

  function matchOp(rowValue, raw) {
    if (raw == null) return true;
    if (raw.startsWith("eq.")) return String(rowValue ?? "") === raw.slice(3);
    if (raw.startsWith("lte.")) return String(rowValue ?? "") <= raw.slice(4);
    if (raw.startsWith("in.(") && raw.endsWith(")")) {
      return raw.slice(4, -1).split(",").includes(String(rowValue ?? ""));
    }
    return true;
  }

  function list(url) {
    const filters = parseFilters(url);
    let result = [...rows.values()].filter((row) => (
      matchOp(row.id, filters.id)
      && matchOp(row.mode, filters.mode)
      && matchOp(row.status, filters.status)
      && matchOp(row.scheduled_at, filters.scheduled_at)
      && matchOp(row.updated_at, filters.updated_at)
    ));
    if (filters.order === "scheduled_at.asc") {
      result = [...result].sort((a, b) => String(a.scheduled_at || "").localeCompare(String(b.scheduled_at || "")));
    }
    if (filters.order === "updated_at.asc") {
      result = [...result].sort((a, b) => String(a.updated_at || "").localeCompare(String(b.updated_at || "")));
    }
    if (filters.limit) result = result.slice(0, Number(filters.limit));
    return result;
  }

  function jsonResponse(status, payload, ok = status >= 200 && status < 300) {
    const raw = JSON.stringify(payload);
    return { ok, status, json: async () => payload, text: async () => raw };
  }

  return {
    rows,
    async handle(url, options = {}) {
      const method = String(options.method || "GET").toUpperCase();
      if (method === "PATCH") {
        if (typeof patchOverride === "function") {
          const forced = patchOverride(url, options, rows);
          if (forced) return forced;
        }
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

function mockExecutorFetch({ github, registry = createExecutorRegistryMock() } = {}) {
  const fn = vi.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/rest/v1/app_release_runs")) return registry.handle(target, options);
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

function scheduledRow({
  id,
  status = "SCHEDULED",
  scheduledAt,
  updatedAt,
  targetSha = SHA_HML,
  baseSha = SHA_MAIN,
} = {}) {
  return {
    id,
    mode: "scheduled",
    status,
    base_sha: baseSha,
    target_sha: targetSha,
    scheduled_at: scheduledAt,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

function pastIso(msAgo = 120_000) {
  return new Date(Date.now() - msAgo).toISOString();
}

function futureIso(msAhead = 300_000) {
  return new Date(Date.now() + msAhead).toISOString();
}

async function callExecutor({ secret = EXECUTOR_SECRET } = {}) {
  const res = makeRes();
  const headers = secret ? { authorization: `Bearer ${secret}` } : {};
  await handler(makeReq({ headers }), res);
  return res;
}

function registryCalls(fn) {
  return fn.mock.calls.filter(([url]) => String(url).includes("/rest/v1/app_release_runs"));
}

function registryPatches(fn) {
  return registryCalls(fn).filter(([, options]) => String(options?.method || "GET").toUpperCase() === "PATCH");
}

function githubCalls(fn) {
  return fn.mock.calls.filter(([url]) => String(url).includes("api.github.com"));
}

function dispatchCalls(fn) {
  return githubCalls(fn).filter(([url]) => String(url).includes("/dispatches"));
}

function assertNoSecrets(raw) {
  expect(raw).not.toContain(GITHUB_READ_TOKEN);
  expect(raw).not.toContain(GITHUB_RELEASE_TOKEN);
  expect(raw).not.toContain(EXECUTOR_SECRET);
  expect(raw).not.toMatch(/Bearer /i);
  expect(raw).not.toContain("authorization");
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://hml-x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    + ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ"
    + ".assinatura-fake-de-teste-nao-real";
  process.env.GITHUB_READ_TOKEN = GITHUB_READ_TOKEN;
  process.env.GITHUB_RELEASE_TOKEN = GITHUB_RELEASE_TOKEN;
  process.env.RELEASE_EXECUTOR_SECRET = EXECUTOR_SECRET;
  delete process.env.VITE_SUPABASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_READ_TOKEN;
  delete process.env.GITHUB_RELEASE_TOKEN;
  delete process.env.RELEASE_EXECUTOR_SECRET;
});

describe("releases-executor — método", () => {
  it("GET → 405 com Allow adequado, sem consultar registry/GitHub", async () => {
    const fn = mockExecutorFetch({ github: readyGithub() });
    const res = makeRes();
    await handler(makeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
    expect(res.json().error).toBe("method_not_allowed");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("releases-executor — autenticação independente de usuário", () => {
  it("RELEASE_EXECUTOR_SECRET ausente → 503 EXECUTOR_CONFIG_UNAVAILABLE, sem registry/GitHub", async () => {
    delete process.env.RELEASE_EXECUTOR_SECRET;
    const fn = mockExecutorFetch({ github: readyGithub() });
    const res = await callExecutor({ secret: EXECUTOR_SECRET });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("EXECUTOR_CONFIG_UNAVAILABLE");
    expect(fn).not.toHaveBeenCalled();
  });

  it("RELEASE_EXECUTOR_SECRET com menos de 32 bytes → 503 EXECUTOR_CONFIG_UNAVAILABLE", async () => {
    process.env.RELEASE_EXECUTOR_SECRET = SHORT_SECRET;
    const fn = mockExecutorFetch({ github: readyGithub() });
    const res = await callExecutor({ secret: SHORT_SECRET });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("EXECUTOR_CONFIG_UNAVAILABLE");
    expect(fn).not.toHaveBeenCalled();
  });

  it("Bearer ausente → 401 EXECUTOR_UNAUTHORIZED, sem registry/GitHub", async () => {
    const fn = mockExecutorFetch({ github: readyGithub() });
    const res = await callExecutor({ secret: null });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("EXECUTOR_UNAUTHORIZED");
    expect(fn).not.toHaveBeenCalled();
  });

  it("Bearer inválido (não bate com o secret) → 401 EXECUTOR_UNAUTHORIZED", async () => {
    const fn = mockExecutorFetch({ github: readyGithub() });
    const res = await callExecutor({ secret: "secret-errado-mas-com-32-bytes-ok" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("EXECUTOR_UNAUTHORIZED");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("releases-executor — sem candidato", () => {
  it("registry vazio → NO_DUE_RELEASE", async () => {
    mockExecutorFetch({ registry: createExecutorRegistryMock() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, result: "NO_DUE_RELEASE" });
  });

  it("release SCHEDULED no futuro → NO_DUE_RELEASE, nenhum claim/GitHub", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: "11111111-1111-4111-8111-111111111111", scheduledAt: futureIso(), updatedAt: pastIso() })],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, result: "NO_DUE_RELEASE" });
    expect(registryPatches(fn)).toHaveLength(0);
    expect(githubCalls(fn)).toHaveLength(0);
  });
});

describe("releases-executor — claim atômico", () => {
  const releaseId = "22222222-2222-4222-8222-222222222222";

  it("release SCHEDULED vencida → claim muda para VALIDATING antes de qualquer dispatch", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    const patches = registryPatches(fn);
    expect(patches.length).toBeGreaterThanOrEqual(1);
    const firstPatchBody = JSON.parse(patches[0][1].body);
    expect(firstPatchBody.status).toBe("VALIDATING");
    // O claim (PATCH -> VALIDATING) precisa ocorrer ANTES do primeiro dispatch GitHub.
    const claimIdx = fn.mock.calls.findIndex(([, options]) => (
      options?.method === "PATCH" && JSON.parse(options.body).status === "VALIDATING"
    ));
    const dispatchIdx = fn.mock.calls.findIndex(([url]) => String(url).includes("/dispatches"));
    expect(claimIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(claimIdx);
  });

  it("dois executores concorrentes sobre o mesmo snapshot → só 1 claim vence", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    mockExecutorFetch({ registry, github: readyGithub() });

    const due = await findDueScheduledRelease(new Date().toISOString());
    const snapshot = due.row;

    const claimA = await claimReleaseForValidation(snapshot);
    const claimB = await claimReleaseForValidation(snapshot);

    const wins = [claimA, claimB].filter((r) => r.ok);
    const losses = [claimA, claimB].filter((r) => !r.ok && r.claimLost);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
  });

  it("claim perdido → zero chamadas GitHub, resultado CLAIM_LOST", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
      patchOverride: () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, result: "CLAIM_LOST" });
    expect(githubCalls(fn)).toHaveLength(0);
  });
});

describe("releases-executor — resultados do dispatch", () => {
  const releaseId = "33333333-3333-4333-8333-333333333333";

  it("sucesso → DISPATCHED, persiste github_run_id/url", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        runs: () => githubOk({ workflow_runs: [] }),
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCHED" });
    expect(dispatchCalls(fn)).toHaveLength(1);
    expect(fn.registry.rows.get(releaseId).status).toBe("DISPATCHED");
    assertNoSecrets(String(res.body));
  });

  it("RELEASE_NOT_READY (branch divergiu entre o agendamento e a execução) → BLOCKED", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        compare: () => githubOk(compareBody({ status: "diverged", ahead_by: 2, behind_by: 1, mergeBase: SHA_HML })),
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "BLOCKED", resultCode: "RELEASE_NOT_READY" });
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(fn.registry.rows.get(releaseId).status).toBe("BLOCKED");
    expect(fn.registry.rows.get(releaseId).result_code).toBe("RELEASE_NOT_READY");
  });

  it("GITHUB_RELEASE_UNAVAILABLE (sem GITHUB_RELEASE_TOKEN) → FAILED", async () => {
    delete process.env.GITHUB_RELEASE_TOKEN;
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "FAILED", resultCode: "GITHUB_RELEASE_UNAVAILABLE" });
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(fn.registry.rows.get(releaseId).status).toBe("FAILED");
    expect(fn.registry.rows.get(releaseId).result_code).toBe("GITHUB_RELEASE_UNAVAILABLE");
  });

  it("release de produção já ativa no GitHub → volta para SCHEDULED (WAITING_FOR_ACTIVE_RELEASE), sem dispatch", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        runs: () => githubOk({ workflow_runs: [{ id: 999, status: "in_progress", name: "outra release" }] }),
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "WAITING_FOR_ACTIVE_RELEASE" });
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(fn.registry.rows.get(releaseId).status).toBe("SCHEDULED");
    expect(fn.registry.rows.get(releaseId).result_code).toBe("WAITING_FOR_ACTIVE_RELEASE");
  });

  it("dispatch incerto (WORKFLOW_DISPATCH_FAILED) → permanece VALIDATING, sem marcar FAILED", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        dispatch: () => githubError(500, { message: "boom" }),
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCH_UNCERTAIN", resultCode: "WORKFLOW_DISPATCH_FAILED" });
    expect(fn.registry.rows.get(releaseId).status).toBe("VALIDATING");
    // Somente 1 PATCH (o claim) — nenhuma segunda escrita para este ciclo.
    expect(registryPatches(fn)).toHaveLength(1);
  });

  it("falha ao consultar status ativo (RELEASE_STATUS_UNAVAILABLE) → permanece VALIDATING", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        runs: () => githubError(500, { message: "boom" }),
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCH_UNCERTAIN", resultCode: "RELEASE_STATUS_UNAVAILABLE" });
    expect(dispatchCalls(fn)).toHaveLength(0);
    expect(fn.registry.rows.get(releaseId).status).toBe("VALIDATING");
  });

  it("dispatch confirmado mas persistência DISPATCHED falha → permanece VALIDATING", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
      patchOverride: (url, options) => {
        const body = JSON.parse(options.body);
        if (body.status === "DISPATCHED") {
          return { ok: false, status: 500, json: async () => ({ message: "registry down" }), text: async () => '{"message":"registry down"}' };
        }
        return null;
      },
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCH_PERSISTENCE_FAILED" });
    expect(dispatchCalls(fn)).toHaveLength(1);
    expect(fn.registry.rows.get(releaseId).status).toBe("VALIDATING");
  });
});

describe("releases-executor — recuperação de VALIDATING stale", () => {
  const releaseId = "44444444-4444-4444-8444-444444444444";

  it("VALIDATING travada há mais de 2 minutos é recuperada e concluída", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({
        id: releaseId,
        status: "VALIDATING",
        scheduledAt: pastIso(600_000),
        updatedAt: pastIso(180_000),
      })],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCHED" });
    expect(fn.registry.rows.get(releaseId).status).toBe("DISPATCHED");
  });

  it("VALIDATING recente (< 2 min) NÃO é recuperada → NO_DUE_RELEASE", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({
        id: releaseId,
        status: "VALIDATING",
        scheduledAt: pastIso(600_000),
        updatedAt: pastIso(5_000),
      })],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, result: "NO_DUE_RELEASE" });
    expect(githubCalls(fn)).toHaveLength(0);
  });

  it("recuperação stale usa idempotent=true: run existente evita novo dispatch", async () => {
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({
        id: releaseId,
        status: "VALIDATING",
        scheduledAt: pastIso(600_000),
        updatedAt: pastIso(300_000),
      })],
    });
    const fn = mockExecutorFetch({
      registry,
      github: readyGithub({
        runs: () => githubOk({
          workflow_runs: [{
            id: 777,
            status: "queued",
            html_url: `https://github.com/marcoantunes171989/restaurante-pedidos/actions/runs/777`,
            name: `Production release ${releaseId}`,
          }],
        }),
        dispatch: () => { throw new Error("dispatch não deveria ser chamado: run já existe para este releaseId"); },
      }),
    });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, releaseId, result: "DISPATCHED" });
    expect(dispatchCalls(fn)).toHaveLength(0);
    const stored = fn.registry.rows.get(releaseId);
    expect(stored.status).toBe("DISPATCHED");
    expect(stored.github_run_id).toBe(777);
  });
});

describe("releases-executor — no máximo uma release por chamada", () => {
  it("duas releases SCHEDULED vencidas → só uma é claimada/processada", async () => {
    const idA = "55555555-5555-4555-8555-555555555555";
    const idB = "66666666-6666-4666-8666-666666666666";
    const registry = createExecutorRegistryMock({
      seed: [
        scheduledRow({ id: idA, scheduledAt: pastIso(200_000), updatedAt: pastIso(400_000) }),
        scheduledRow({ id: idB, scheduledAt: pastIso(100_000), updatedAt: pastIso(400_000) }),
      ],
    });
    const fn = mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    expect(res.statusCode).toBe(200);
    expect(dispatchCalls(fn)).toHaveLength(1);

    const statuses = [fn.registry.rows.get(idA).status, fn.registry.rows.get(idB).status];
    expect(statuses.filter((s) => s === "SCHEDULED")).toHaveLength(1);
    expect(statuses.filter((s) => s === "DISPATCHED")).toHaveLength(1);
    // A mais antiga vencida (idA, scheduled_at mais no passado) é priorizada.
    expect(fn.registry.rows.get(idA).status).toBe("DISPATCHED");
    expect(fn.registry.rows.get(idB).status).toBe("SCHEDULED");
  });
});

describe("releases-executor — nenhuma credencial vaza", () => {
  it("resposta de sucesso não contém segredos", async () => {
    const releaseId = "77777777-7777-4777-8777-777777777777";
    const registry = createExecutorRegistryMock({
      seed: [scheduledRow({ id: releaseId, scheduledAt: pastIso(), updatedAt: pastIso(180_000) })],
    });
    mockExecutorFetch({ registry, github: readyGithub() });
    const res = await callExecutor();
    assertNoSecrets(String(res.body));
  });

  it("resposta de 401/503 não contém segredos", async () => {
    delete process.env.RELEASE_EXECUTOR_SECRET;
    mockExecutorFetch({ github: readyGithub() });
    const res503 = await callExecutor({ secret: EXECUTOR_SECRET });
    assertNoSecrets(String(res503.body));

    process.env.RELEASE_EXECUTOR_SECRET = EXECUTOR_SECRET;
    mockExecutorFetch({ github: readyGithub() });
    const res401 = await callExecutor({ secret: "token-errado-com-32-bytes-no-minimo" });
    assertNoSecrets(String(res401.body));
  });
});
