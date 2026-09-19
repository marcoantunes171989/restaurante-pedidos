import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DB_RUNTIME_EVENT_TYPES,
  MAINTENANCE_EVENT_TYPES,
  RUNTIME_MAINTENANCE_EVENT_TYPES,
  isMaintenanceEventType,
  isRuntimeMaintenanceEventType,
} from "../../server/db-release-contract.js";
import { KNOWN_PROJECT_REFS } from "../../server/db-backup-contract.js";
import {
  PERSISTED_EXECUTION_COLUMNS_V162,
  RUNTIME_RPC_ERROR_CODES,
  RUNTIME_RPC_NAMES,
  buildRuntimeRpcArgs,
  createDisabledRuntimeRpcTransport,
  createPostgrestRpcCaller,
  createRuntimeRpcTransport,
  fromRuntimeExecutionJson,
  normalizeRuntimeResponse,
  validateRuntimeBinding,
} from "../../server/db-release-runtime-rpc.js";
import { PERSISTED_EXECUTION_COLUMNS } from "../../server/db-release-execution-store.js";
import { RUNTIME_MIGRATION, readMigration, root, stripComments } from "./helpers/migration-sql.js";

const HML = { expectedEnvironment: "HML", expectedProjectRef: KNOWN_PROJECT_REFS.HML };
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const CORRELATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const SHA1 = "a".repeat(40);

const claimRequest = (overrides = {}) => ({
  planId: PLAN_ID,
  environment: "HML",
  projectRef: KNOWN_PROJECT_REFS.HML,
  workerId: "worker-hml-01",
  correlationId: CORRELATION_ID,
  intent: "IMMEDIATE",
  expectedPlanHash: "b".repeat(64),
  expectedPlanUpdatedAt: "2026-09-19T12:00:00.123456+00:00",
  ...overrides,
});

const executionJson = (overrides = {}) => ({
  id: EXECUTION_ID,
  planId: PLAN_ID,
  environment: "HML",
  projectRef: KNOWN_PROJECT_REFS.HML,
  status: "REQUESTED",
  correlationId: CORRELATION_ID,
  workerId: "worker-hml-01",
  leaseGeneration: 1,
  heartbeatAt: "2026-09-19T12:00:00Z",
  leaseExpiresAt: "2026-09-19T12:02:00Z",
  ...overrides,
});

describe("transporte de runtime — sem efeito no import e desabilitado por padrão", () => {
  it("importar os módulos não chama fetch nem lê ambiente/timers (verificação estática + spy)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    await import("../../server/db-release-runtime-rpc.js");
    await import("../../server/db-release-write-coverage-probe.js");
    await import("../../server/db-release-environment-evidence.js");
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const file of ["db-release-runtime-rpc.js", "db-release-write-coverage-probe.js", "db-release-write-fence-manifest.js", "db-release-environment-evidence.js"]) {
      const text = readFileSync(resolve(root, "server", file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(text, file).not.toMatch(/process\.env|\bprocess\b\s*\./);
      expect(text, file).not.toMatch(/(?<![A-Za-z_.])fetch\s*\(/);
      expect(text, file).not.toMatch(/setTimeout|setInterval|createClient|supabase-js/);
      expect(text, file).not.toMatch(/console\.(log|error|warn)/);
    }
  });

  it("transporte padrão é DISABLED: nenhum método alcança rede/banco", async () => {
    const disabled = createDisabledRuntimeRpcTransport();
    expect(disabled).toMatchObject({ enabled: false, transport: "DISABLED" });
    for (const method of ["claimExecution", "heartbeat", "maintenanceTransition", "maintenanceLoginGate", "readCoverageProbe"]) {
      expect(await disabled[method]({})).toMatchObject({ ok: false, code: "RUNTIME_RPC_TRANSPORT_NOT_ENABLED", disabled: true });
    }
  });

  it("factories exigem dependências INJETADAS e transport explícito (sem fallback live oculto)", () => {
    expect(() => createRuntimeRpcTransport({ ...HML, transport: "SYNTHETIC" })).toThrow(/rpc injetado/);
    expect(() => createRuntimeRpcTransport({ ...HML, rpc: async () => ({}) })).toThrow(/transport explícito/);
    expect(() => createPostgrestRpcCaller({ baseUrl: `https://${KNOWN_PROJECT_REFS.HML}.supabase.co`, headers: {}, ...HML })).toThrow(/fetchImpl/);
    expect(() => createPostgrestRpcCaller({ baseUrl: `https://${KNOWN_PROJECT_REFS.HML}.supabase.co`, fetchImpl: async () => ({}), ...HML })).toThrow(/headers/);
  });
});

describe("binding de ambiente e projeto (HML/PROD nunca trocáveis)", () => {
  it("binding válido só para os pares canônicos", () => {
    expect(validateRuntimeBinding(HML)).toMatchObject({ ok: true, environment: "HML", projectRef: "zzixvyspwszewhxzusot" });
    expect(validateRuntimeBinding({ expectedEnvironment: "PROD" })).toMatchObject({ ok: true, projectRef: "rwnzggjxhxnfrhstbxkm" });
    expect(validateRuntimeBinding({ expectedEnvironment: "HML", expectedProjectRef: KNOWN_PROJECT_REFS.PROD })).toMatchObject({ ok: false, code: "PROJECT_REF_MISMATCH" });
    expect(validateRuntimeBinding({ expectedEnvironment: "PROD", expectedProjectRef: KNOWN_PROJECT_REFS.HML })).toMatchObject({ ok: false, code: "PROJECT_REF_MISMATCH" });
    expect(validateRuntimeBinding({ expectedEnvironment: "STAGING" })).toMatchObject({ ok: false, code: "ENVIRONMENT_INVALID" });
    expect(() => createRuntimeRpcTransport({ rpc: async () => ({}), transport: "SYNTHETIC", expectedEnvironment: "HML", expectedProjectRef: KNOWN_PROJECT_REFS.PROD })).toThrow(TypeError);
  });

  it("claim: ambiente/projeto trocados ou contra o binding do transporte são rejeitados ANTES de qualquer chamada", async () => {
    const rpc = vi.fn();
    const transport = createRuntimeRpcTransport({ rpc, transport: "SYNTHETIC", ...HML });
    expect(await transport.claimExecution(claimRequest({ environment: "PROD", projectRef: KNOWN_PROJECT_REFS.PROD }))).toMatchObject({ ok: false, code: "ENVIRONMENT_INVALID" });
    expect(await transport.claimExecution(claimRequest({ projectRef: KNOWN_PROJECT_REFS.PROD }))).toMatchObject({ ok: false, code: "PROJECT_REF_MISMATCH" });
    expect(await transport.claimExecution(claimRequest({ environment: "PROD" }))).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("caller PostgREST só fala com <projectRef>.supabase.co do banco esperado (https)", () => {
    const base = { headers: { apikey: "k" }, fetchImpl: async () => ({}), ...HML };
    expect(() => createPostgrestRpcCaller({ ...base, baseUrl: `https://${KNOWN_PROJECT_REFS.PROD}.supabase.co` })).toThrow(/project ref esperado/);
    expect(() => createPostgrestRpcCaller({ ...base, baseUrl: `http://${KNOWN_PROJECT_REFS.HML}.supabase.co` })).toThrow(/project ref esperado/);
    expect(() => createPostgrestRpcCaller({ ...base, baseUrl: "https://evil.example.com" })).toThrow();
    expect(() => createPostgrestRpcCaller({ ...base, baseUrl: `https://${KNOWN_PROJECT_REFS.HML}.supabase.co.evil.com` })).toThrow();
    expect(() => createPostgrestRpcCaller({ ...base, baseUrl: "não é url" })).toThrow(/baseUrl/);
    expect(typeof createPostgrestRpcCaller({ ...base, baseUrl: `https://${KNOWN_PROJECT_REFS.HML}.supabase.co` })).toBe("function");
  });
});

describe("validação das requisições (server-side, sem confiar no browser)", () => {
  it("claim válido mapeia para os parâmetros SQL na ordem exata; TTL padrão 120s", () => {
    const built = buildRuntimeRpcArgs("CLAIM", claimRequest(), { binding: HML });
    expect(built).toMatchObject({ ok: true, name: "app_db_release_claim_execution" });
    expect(Object.keys(built.args)).toEqual([
      "p_plan_id", "p_environment", "p_project_ref", "p_worker_id", "p_correlation_id",
      "p_intent", "p_expected_plan_hash", "p_expected_plan_updated_at", "p_lease_ttl_seconds",
    ]);
    expect(built.args.p_lease_ttl_seconds).toBe(120);
  });

  it("rejeita autoridade/campos extras (status, leaseGeneration, tempo do cliente...) e valores inválidos", () => {
    for (const extra of [{ status: "SUCCEEDED" }, { leaseGeneration: 9 }, { now: 1 }, { nowMs: 1 }, { gates: [] }]) {
      expect(buildRuntimeRpcArgs("CLAIM", claimRequest(extra), { binding: HML })).toMatchObject({ ok: false, code: "CLIENT_AUTHORITY_FIELD_REJECTED" });
    }
    const cases = [
      [{ workerId: "svc_token_1" }, "WORKER_ID_INVALID"],
      [{ workerId: "" }, "WORKER_ID_INVALID"],
      [{ intent: "NOW" }, "CLAIM_INTENT_INVALID"],
      [{ leaseTtlSeconds: 5 }, "CLAIM_REQUEST_INVALID"],
      [{ leaseTtlSeconds: 901 }, "CLAIM_REQUEST_INVALID"],
      [{ planId: "x" }, "CLAIM_REQUEST_INVALID"],
      [{ expectedPlanHash: "abc" }, "CLAIM_REQUEST_INVALID"],
      [{ expectedPlanUpdatedAt: "ontem" }, "CLAIM_REQUEST_INVALID"],
    ];
    for (const [patch, code] of cases) {
      expect(buildRuntimeRpcArgs("CLAIM", claimRequest(patch), { binding: HML }), JSON.stringify(patch)).toMatchObject({ ok: false, code });
    }
    expect(buildRuntimeRpcArgs("CLAIM", { planId: PLAN_ID }, { binding: HML })).toMatchObject({ ok: false, code: "CLAIM_REQUEST_INVALID" });
  });

  it("transição de execução: só arestas do pipeline; FAILED/RECOVERY_REQUIRED exigem failureCode; sem segredo em mensagens", () => {
    const base = { executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1 };
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "DRAINING", toStatus: "BACKING_UP" })).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "REQUESTED", toStatus: "SUCCEEDED" })).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "SUCCEEDED", toStatus: "DRAINING" })).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "MIGRATING", toStatus: "RECOVERY_REQUIRED" })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "MIGRATING", toStatus: "RECOVERY_REQUIRED", failureCode: "MIGRATION_OUTCOME_AMBIGUOUS" })).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("TRANSITION_EXECUTION", { ...base, fromStatus: "MIGRATING", toStatus: "FAILED", failureCode: "X", failureMessage: "Bearer abcdefghijklmnop" })).toMatchObject({ ok: false });
  });

  it("manutenção: só as 14 edges DB; login gate OPEN|CLOSED; reason obrigatório", () => {
    const base = { executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1, expectedVersion: 4, reason: "fence" };
    expect(buildRuntimeRpcArgs("MAINTENANCE_TRANSITION", { ...base, expectedPhase: "QUIESCENT", toPhase: "BACKING_UP" })).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("MAINTENANCE_TRANSITION", { ...base, expectedPhase: "QUIESCENT", toPhase: "RELEASING" })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("MAINTENANCE_TRANSITION", { ...base, expectedPhase: "NORMAL", toPhase: "NOTICE" })).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(buildRuntimeRpcArgs("MAINTENANCE_LOGIN_GATE", { ...base, gate: "OPEN" })).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("MAINTENANCE_LOGIN_GATE", { ...base, gate: "AJAR" })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("MAINTENANCE_START", { ...base, planId: PLAN_ID, targetSha: SHA1 })).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("MAINTENANCE_START", { ...base, planId: PLAN_ID, targetSha: "abc" })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("MAINTENANCE_ABORT_TO_NORMAL", { ...base, reason: "" })).toMatchObject({ ok: false });
  });

  it("reconciliação exige ator humano (uuid), resolução conhecida e evidência sem segredo", () => {
    const base = { executionId: EXECUTION_ID, actorUserId: ACTOR_ID, resolution: "RESTORED_VERIFIED", evidence: { restoredAt: "2026-09-19T12:00:00Z" } };
    expect(buildRuntimeRpcArgs("RECONCILE", base)).toMatchObject({ ok: true });
    expect(buildRuntimeRpcArgs("RECONCILE", { ...base, actorUserId: null })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("RECONCILE", { ...base, resolution: "AUTO" })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("RECONCILE", { ...base, evidence: {} })).toMatchObject({ ok: false });
    expect(buildRuntimeRpcArgs("RECONCILE", { ...base, evidence: { token: "x" } })).toMatchObject({ ok: false });
  });
});

describe("transporte com RPC mock — normalização das respostas", () => {
  const withRpc = (response) => {
    const calls = [];
    const rpc = async (name, args) => {
      calls.push([name, args]);
      return typeof response === "function" ? response(name, args) : response;
    };
    return { calls, transport: createRuntimeRpcTransport({ rpc, transport: "SYNTHETIC", ...HML }) };
  };

  it("CLAIMED devolve a execução de domínio (lease_generation persistida)", async () => {
    const { calls, transport } = withRpc({ ok: true, data: { outcome: "CLAIMED", execution: executionJson(), planStatus: "RUNNING" } });
    const result = await transport.claimExecution(claimRequest());
    expect(result).toMatchObject({ ok: true, outcome: "CLAIMED", planStatus: "RUNNING" });
    expect(result.execution).toMatchObject({ id: EXECUTION_ID, leaseGeneration: 1, projectRef: KNOWN_PROJECT_REFS.HML, workerId: "worker-hml-01" });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("app_db_release_claim_execution");
  });

  it("LOCKED => LOCK_UNAVAILABLE; LEASE_EXPIRED => falha (não revive); outcomes desconhecidos => falha fechada", async () => {
    expect(await withRpc({ ok: true, data: { outcome: "LOCKED", holder: { executionId: EXECUTION_ID } } }).transport.claimExecution(claimRequest()))
      .toMatchObject({ ok: false, code: "LOCK_UNAVAILABLE", outcome: "LOCKED" });
    expect(await withRpc({ ok: true, data: { outcome: "LEASE_EXPIRED", execution: executionJson() } }).transport.heartbeat({ executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1 }))
      .toMatchObject({ ok: false, code: "LEASE_EXPIRED" });
    expect(await withRpc({ ok: true, data: { outcome: "SURPRISE" } }).transport.claimExecution(claimRequest())).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    expect(await withRpc({ ok: true, data: { outcome: "CLAIMED", execution: { id: "x" } } }).transport.claimExecution(claimRequest())).toMatchObject({ ok: false });
  });

  it("erros P0001 mapeiam o `detail` para o código canônico; desconhecido/queda => STORE_UNAVAILABLE (nunca ecoa mensagem)", async () => {
    const error = (details) => ({ ok: false, status: 400, error: { code: "P0001", details, message: "texto interno com segredo" } });
    const heartbeat = { executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1 };
    expect(await withRpc(error("WORKER_MISMATCH")).transport.heartbeat(heartbeat)).toEqual({ ok: false, code: "WORKER_MISMATCH" });
    expect(await withRpc(error("LEASE_GENERATION_MISMATCH")).transport.heartbeat(heartbeat)).toEqual({ ok: false, code: "LEASE_GENERATION_MISMATCH" });
    expect(await withRpc(error("DB_BINDING_RELEASE_UNSAFE")).transport.maintenanceAbortToNormal({ executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1, expectedVersion: 3, reason: "abort" }))
      .toEqual({ ok: false, code: "DB_BINDING_RELEASE_UNSAFE" });
    expect(await withRpc(error("ALGO_NOVO")).transport.heartbeat(heartbeat)).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
    expect(await withRpc(() => { throw new Error("socket"); }).transport.heartbeat(heartbeat)).toEqual({ ok: false, code: "STORE_UNAVAILABLE" });
  });

  it("RPCs void (manutenção) => ok; probe devolve o dado bruto para o avaliador", async () => {
    expect(await withRpc({ ok: true, data: null }).transport.maintenanceLoginGate({ executionId: EXECUTION_ID, workerId: "worker-hml-01", leaseGeneration: 1, expectedVersion: 3, gate: "CLOSED", reason: "fence" }))
      .toMatchObject({ ok: true });
    expect(await withRpc({ ok: true, data: { manifestVersion: "WFC-2" } }).transport.readCoverageProbe()).toEqual({ ok: true, data: { manifestVersion: "WFC-2" } });
    expect(normalizeRuntimeResponse("HEARTBEAT", null)).toMatchObject({ ok: false });
  });
});

describe("caller PostgREST — credenciais isoladas e allowlist", () => {
  const baseUrl = `https://${KNOWN_PROJECT_REFS.HML}.supabase.co`;
  const secret = "sb_secret_FAKE_TEST_VALUE_123456";

  it("chama apenas RPCs da allowlist, POST em /rest/v1/rpc/<nome>, sem devolver/expor os headers", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push([url, init]);
      return { ok: true, status: 200, text: async () => JSON.stringify({ outcome: "HEARTBEAT_OK" }) };
    };
    const rpc = createPostgrestRpcCaller({ baseUrl, headers: { apikey: secret, authorization: `Bearer ${secret}` }, fetchImpl, ...HML });
    const result = await rpc("app_db_release_heartbeat_execution", { p_execution_id: EXECUTION_ID });
    expect(result).toEqual({ ok: true, status: 200, data: { outcome: "HEARTBEAT_OK" } });
    expect(seen[0][0]).toBe(`${baseUrl}/rest/v1/rpc/app_db_release_heartbeat_execution`);
    expect(seen[0][1].method).toBe("POST");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(await rpc("pg_sleep", {})).toMatchObject({ ok: false, error: { code: "RPC_NOT_ALLOWED" } });
    expect(await rpc("execute_sql", { query: "drop table x" })).toMatchObject({ ok: false });
    expect(seen).toHaveLength(1);
  });

  it("erro HTTP devolve só code/details; falha de rede => TRANSPORT_ERROR sem detalhe", async () => {
    const failing = createPostgrestRpcCaller({
      baseUrl,
      headers: { apikey: secret },
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ code: "P0001", details: "STATE_CONFLICT", message: `leak ${secret}` }) }),
      ...HML,
    });
    const result = await failing("app_maintenance_db_orchestration_transition", {});
    expect(result).toEqual({ ok: false, status: 400, error: { code: "P0001", details: "STATE_CONFLICT" } });
    expect(JSON.stringify(result)).not.toContain(secret);
    const down = createPostgrestRpcCaller({ baseUrl, headers: { apikey: secret }, fetchImpl: async () => { throw new Error(secret); }, ...HML });
    expect(await down("app_db_release_write_coverage_probe", {})).toEqual({ ok: false, status: 0, error: { code: "TRANSPORT_ERROR" } });
  });

  it("allowlist == as 12 RPCs da migration 162", () => {
    expect(RUNTIME_RPC_NAMES).toHaveLength(12);
    const sql = stripComments(readMigration(RUNTIME_MIGRATION));
    for (const name of RUNTIME_RPC_NAMES) {
      expect(sql, name).toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
  });
});

describe("paridade JS ↔ migration 162", () => {
  const sql = stripComments(readMigration(RUNTIME_MIGRATION));

  it("todo `detail` levantado no SQL é conhecido pelo normalizador (e vice-versa)", () => {
    // `detail = 'X'` e `detail = case when ... then 'X' else 'Y' end`
    const sqlCodes = new Set(
      [...sql.matchAll(/detail\s*=\s*(case[\s\S]*?\bend\b|'[A-Z_]+')/g)]
        .flatMap((match) => (match[1].startsWith("case")
          ? [...match[1].matchAll(/(?:then|else)\s+'([A-Z_]{4,})'/g)]
          : [...match[1].matchAll(/'([A-Z_]{4,})'/g)]).map((code) => code[1])),
    );
    expect(sqlCodes.size).toBeGreaterThan(30);
    for (const code of sqlCodes) expect(RUNTIME_RPC_ERROR_CODES, code).toContain(code);
    for (const code of RUNTIME_RPC_ERROR_CODES) expect([...sqlCodes], code).toContain(code);
  });

  it("colunas persistidas de app_db_release_executions: 12 da 160 + 8 da 162; store I2C1 permanece inalterado", () => {
    expect(PERSISTED_EXECUTION_COLUMNS_V162).toHaveLength(20);
    expect(PERSISTED_EXECUTION_COLUMNS_V162.slice(0, 12)).toEqual([...PERSISTED_EXECUTION_COLUMNS]);
    const added = sql.match(/alter table public\.app_db_release_executions\s+add column[\s\S]*?;/i)[0];
    for (const column of PERSISTED_EXECUTION_COLUMNS_V162.slice(12)) expect(added, column).toContain(column);
  });

  it("eventos de runtime: 11 novos; contrato de 42 permanece congelado; superset de 53", () => {
    expect(DB_RUNTIME_EVENT_TYPES).toHaveLength(11);
    expect(MAINTENANCE_EVENT_TYPES).toHaveLength(42);
    expect(RUNTIME_MAINTENANCE_EVENT_TYPES).toHaveLength(53);
    for (const event of DB_RUNTIME_EVENT_TYPES) {
      expect(isRuntimeMaintenanceEventType(event)).toBe(true);
      expect(isMaintenanceEventType(event)).toBe(false);
    }
    for (const event of MAINTENANCE_EVENT_TYPES) expect(isRuntimeMaintenanceEventType(event)).toBe(true);
    expect(DB_RUNTIME_EVENT_TYPES).toEqual(expect.arrayContaining(["DB_LOCK_ACQUIRED", "DB_LOCK_RELEASED", "DB_WRITE_FENCE_VERIFIED", "DB_MIGRATION_FAILED", "DB_MIGRATION_AMBIGUOUS", "DB_SMOKE_PASSED", "DB_SMOKE_FAILED", "DB_EXECUTOR_HEARTBEAT_STALE"]));
  });

  it("mapeamento de execução recusa formas inválidas e mantém a geração de lease", () => {
    expect(fromRuntimeExecutionJson(executionJson({ leaseGeneration: 7 })).leaseGeneration).toBe(7);
    expect(fromRuntimeExecutionJson(executionJson({ status: "NOPE" }))).toBeNull();
    expect(fromRuntimeExecutionJson(executionJson({ leaseGeneration: "1" }))).toBeNull();
    expect(fromRuntimeExecutionJson(null)).toBeNull();
  });
});
