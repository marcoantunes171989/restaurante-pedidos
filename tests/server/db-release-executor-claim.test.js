import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { containsSecretMaterial } from "../../server/db-backup-contract.js";
import { EXECUTION_STATUSES } from "../../server/db-release-contract.js";
import { analyzeMigrationSet } from "../../server/db-migration-safety.js";
import {
  claimDbReleaseExecution,
  releaseDbReleaseEnvironmentLock,
  requestImmediateDbReleaseExecution,
} from "../../server/db-release-executor-claim.js";
import {
  CLAIM_FAILURE_CODES,
  EXECUTION_INITIAL_STATUS,
  EXECUTOR_OWNED_EXECUTION_STATUSES,
  buildEnvironmentLockKey,
  findClientAuthorityFields,
  isExecutorOwnedExecutionStatus,
} from "../../server/db-release-executor-contract.js";
import {
  ADAPTER_ONLY_EXECUTION_FIELDS,
  PERSISTED_EXECUTION_COLUMNS,
  createMemoryExecutionStore,
  isExecutionStore,
  toExecutionRow,
} from "../../server/db-release-execution-store.js";
import {
  CORR_1,
  CORR_2,
  CORR_3,
  HML_REF,
  MIN,
  NOW,
  PLAN_A,
  PLAN_B,
  PLAN_C,
  PLAN_HML,
  PROD_REF,
  buildPlan,
  claimRequest,
  createWorld,
  iso,
  sha256,
} from "./helpers/db-release-executor-fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function twoProdPlans() {
  return [buildPlan({ id: PLAN_A }), buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_other is 'x';"] })];
}

describe("claim — imediato e agendado convergem no mesmo serviço", () => {
  it("claim imediato válido: OWNED, execução REQUESTED, worker/lease ligados", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({
      ok: true,
      outcome: "OWNED",
      replay: false,
      executionCreated: true,
      lockAcquired: true,
      migrationAuthorized: false,
    });
    expect(result.execution).toMatchObject({
      planId: PLAN_A,
      planHash: bundle.planHash,
      environment: "PROD",
      projectRef: PROD_REF,
      targetReleaseSha: bundle.targetSha,
      baseSha: bundle.baseSha,
      correlationId: CORR_1,
      workerId: "worker-a",
      claimedAt: iso(NOW),
      leaseGeneration: 1,
      status: "REQUESTED",
      heartbeatAt: iso(NOW),
    });
    expect(result.execution.executionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.lock).toMatchObject({
      lockKey: `DB_RELEASE:PROD:${PROD_REF}`,
      executionId: result.execution.executionId,
      workerId: "worker-a",
      leaseGeneration: 1,
      acquiredAt: iso(NOW),
    });
    expect(result.lease).toMatchObject({ status: "ACTIVE", workerId: "worker-a", leaseGeneration: 1 });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(containsSecretMaterial(result)).toBe(false);
    expect(containsSecretMaterial(snapshot)).toBe(false);
  });

  it("claim agendado devido: converge no mesmo caminho e mesma forma de resultado", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW - 2 * MIN) });
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(result).toMatchObject({ ok: true, outcome: "OWNED", executionCreated: true, migrationAuthorized: false });
    expect(result.stage).toMatchObject({ name: "CLAIMABLE", satisfied: true });
    expect(result.stage.requiredGates).toContain("SCHEDULE_WINDOW_VALID");
  });

  it("requestImmediateDbReleaseExecution usa o MESMO claim com intent IMMEDIATE (sem executor concorrente)", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const { intent: _drop, ...request } = claimRequest(bundle);
    void _drop;
    const result = await requestImmediateDbReleaseExecution(request, world.depsFor());
    expect(result).toMatchObject({ ok: true, outcome: "OWNED" });
    expect(result.stage.requiredGates).not.toContain("SCHEDULE_WINDOW_VALID");
  });

  it("CLAIMABLE ≠ ready: claim ok com globalReady=false e nenhuma autorização de migration", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(result.ok).toBe(true);
    expect(result.globalReady).toBe(false);
    expect(result.migrationAuthorized).toBe(false);
    expect(result.execution.status).toBe("REQUESTED");
    expect(result.execution.status).not.toBe("MIGRATING");
  });

  it("regressão: BACKUP_VERIFIED / login / sessões / in-flight / fence / lock UNKNOWN não impedem o claim", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    // O coletor nunca fornece nenhum gate pós-claim; se o claim os exigisse, seria negado.
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(result.ok).toBe(true);
  });
});

describe("claim — negações (nada é criado)", () => {
  async function denied(bundle, request, { world = createWorld({ bundles: [bundle] }), depsExtra = {}, time = null } = {}) {
    if (time != null) world.clock.set(time);
    const result = await claimDbReleaseExecution(request, world.depsFor("worker-a", depsExtra));
    const snapshot = world.executionStore.snapshot();
    expect(result.ok).toBe(false);
    expect(result.executionCreated).toBe(false);
    expect(result.migrationAuthorized).toBe(false);
    expect(snapshot.executions).toEqual([]);
    expect(snapshot.locks).toEqual([]);
    return result;
  }

  it("agendado cedo demais → SCHEDULE_NOT_DUE", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW + 5 * MIN) });
    expect((await denied(bundle, claimRequest(bundle))).code).toBe("SCHEDULE_NOT_DUE");
  });

  it("agendado expirado → SCHEDULE_WINDOW_EXPIRED", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW - 16 * MIN) });
    expect((await denied(bundle, claimRequest(bundle))).code).toBe("SCHEDULE_WINDOW_EXPIRED");
  });

  it("agenda inválida/ausente → SCHEDULE_INVALID", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: null });
    expect((await denied(bundle, claimRequest(bundle))).code).toBe("SCHEDULE_INVALID");
  });

  it("relógio do servidor decide: avançar T abre/fecha a janela", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW + 5 * MIN) });
    const world = createWorld({ bundles: [bundle] });
    expect((await claimDbReleaseExecution(claimRequest(bundle), world.depsFor())).code).toBe("SCHEDULE_NOT_DUE");
    world.clock.set(NOW + 5 * MIN);
    const opened = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(opened.ok).toBe(true);
  });

  it("APPROVED não vira agendado implicitamente; SCHEDULED não vira imediato", async () => {
    const approved = buildPlan();
    expect((await denied(approved, claimRequest(approved, { intent: "SCHEDULED" }))).code).toBe("INTENT_STATUS_MISMATCH");
    const scheduled = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW - MIN) });
    expect((await denied(scheduled, claimRequest(scheduled, { intent: "IMMEDIATE" }))).code).toBe("INTENT_STATUS_MISMATCH");
  });

  it.each(["DRAFT", "VALIDATED", "RUNNING", "FAILED", "CANCELED", "SUCCEEDED"])("plano %s → PLAN_STATUS_INVALID", async (status) => {
    const bundle = buildPlan({ status });
    const request = claimRequest(bundle, { intent: "IMMEDIATE", expected: { approvedAt: iso(NOW - 60 * MIN) } });
    expect((await denied(bundle, request)).code).toBe("PLAN_STATUS_INVALID");
  });

  it("plan hash divergente → PLAN_DRIFT", async () => {
    const bundle = buildPlan();
    const result = await denied(bundle, claimRequest(bundle, { expected: { planHash: "0".repeat(64) } }));
    expect(result).toMatchObject({ code: "PLAN_DRIFT", reasonCode: "PLAN_HASH_DRIFT" });
  });

  it("target SHA divergente → PLAN_DRIFT; base SHA divergente → PLAN_DRIFT", async () => {
    const bundle = buildPlan();
    expect((await denied(bundle, claimRequest(bundle, { expected: { targetReleaseSha: "c".repeat(40) } }))))
      .toMatchObject({ code: "PLAN_DRIFT", reasonCode: "TARGET_SHA_DRIFT" });
    expect((await denied(bundle, claimRequest(bundle, { expected: { baseSha: "c".repeat(40) } }))))
      .toMatchObject({ code: "PLAN_DRIFT", reasonCode: "BASE_SHA_DRIFT" });
  });

  it("ambiente divergente → PLAN_DRIFT", async () => {
    const bundle = buildPlan();
    expect((await denied(bundle, claimRequest(bundle, { expected: { environment: "HML" } }))))
      .toMatchObject({ code: "PLAN_DRIFT", reasonCode: "ENVIRONMENT_DRIFT" });
  });

  it("identidade de migration adulterada no store → MIGRATION_IDENTITY_DRIFT", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    world.planStore.__patchMigrationRow(PLAN_A, 0, { sha256: "f".repeat(64) });
    const result = await denied(bundle, claimRequest(bundle), { world });
    expect(result).toMatchObject({ code: "MIGRATION_IDENTITY_DRIFT", reasonCode: "PLAN_HASH_NOT_REPRODUCIBLE" });
  });

  it("identidades congeladas esperadas divergentes → MIGRATION_IDENTITY_DRIFT", async () => {
    const bundle = buildPlan();
    const expectedMigrations = bundle.migrationRows.map((row) => ({
      order: row.migration_order,
      filename: row.filename,
      gitBlob: row.git_blob,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    }));
    expectedMigrations[1] = { ...expectedMigrations[1], sha256: "e".repeat(64) };
    const result = await denied(bundle, claimRequest(bundle, { expected: { migrations: expectedMigrations } }));
    expect(result).toMatchObject({ code: "MIGRATION_IDENTITY_DRIFT", reasonCode: "EXPECTED_MIGRATIONS_DIVERGED" });
  });

  it("identidades esperadas iguais passam", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const expectedMigrations = bundle.migrationRows.map((row) => ({
      order: row.migration_order,
      filename: row.filename,
      gitBlob: row.git_blob,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    }));
    const result = await claimDbReleaseExecution(
      claimRequest(bundle, { expected: { migrations: expectedMigrations } }),
      world.depsFor(),
    );
    expect(result.ok).toBe(true);
  });

  it("aprovação stale: approvedAt, geração ou aprovador ausente → APPROVAL_STALE", async () => {
    const bundle = buildPlan();
    expect((await denied(bundle, claimRequest(bundle, { expected: { approvedAt: iso(NOW - 5 * MIN) } }))).code).toBe("APPROVAL_STALE");
    expect((await denied(bundle, claimRequest(bundle, { expected: { readinessGeneration: 99 } }))).code).toBe("APPROVAL_STALE");
    const world = createWorld({ bundles: [bundle] });
    world.planStore.__patchRow(PLAN_A, { approved_by: null });
    expect((await denied(bundle, claimRequest(bundle), { world })).code).toBe("APPROVAL_STALE");
  });

  it("schema safety ausente → CLAIMABLE_NOT_SATISFIED com SCHEMA_SAFETY_PASS", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], collectorOptions: { safety: null } });
    const result = await denied(bundle, claimRequest(bundle), { world });
    expect(result.code).toBe("CLAIMABLE_NOT_SATISFIED");
    expect(result.blockers.map((item) => item.key)).toEqual(expect.arrayContaining(["SCHEMA_SAFETY_PASS"]));
  });

  it("REVIEW_REQUIRED e PROHIBITED sintéticos nunca passam como SAFE_AUTO", async () => {
    for (const sql of ["create index pdb_fixture_idx on public.pdb_fixture (id);", "insert into public.pdb_fixture values (1);"]) {
      const bundle = buildPlan({ sqls: [sql] });
      const result = await denied(bundle, claimRequest(bundle));
      expect(result.code).toBe("CLAIMABLE_NOT_SATISFIED");
      const safety = result.blockers.find((item) => item.key === "SCHEMA_SAFETY_PASS");
      expect(["PENDING", "FAILED"]).toContain(safety.status);
    }
  });

  it("classificação declarada (SAFE_AUTO) não é autoritativa: análise servidor manda", async () => {
    const bundle = buildPlan({ sqls: ["insert into public.pdb_fixture values (1);"], declaredClassification: "SAFE_AUTO" });
    const result = await denied(bundle, claimRequest(bundle));
    expect(result.code).toBe("CLAIMABLE_NOT_SATISFIED");
    expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ key: "SCHEMA_SAFETY_PASS", status: "FAILED" })]));
  });

  it("evidência Git com drift (SHA) → BLOCKED em GIT_SHA_MATCH", async () => {
    const bundle = buildPlan();
    const world = createWorld({
      bundles: [bundle],
      collectorOptions: { git: { ok: true, releaseSha: "c".repeat(40), baseSha: bundle.baseSha, drift: true, evaluatedAt: iso(NOW) } },
    });
    const result = await denied(bundle, claimRequest(bundle), { world });
    expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ key: "GIT_SHA_MATCH", status: "BLOCKED" })]));
  });

  it("HML_VALIDATED e PROD_BASELINE_VERIFIED sem evidência → negado", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], collectorOptions: { hml: false, baseline: false } });
    const result = await denied(bundle, claimRequest(bundle), { world });
    expect(result.blockers.map((item) => item.key)).toEqual(expect.arrayContaining(["HML_VALIDATED", "PROD_BASELINE_VERIFIED"]));
  });

  it.each(["UNKNOWN", "STALE", "FAILED", "BLOCKED", "PENDING"])("gate CLAIMABLE %s no instante T → negado", async (status) => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], collectorOptions: { hml: status } });
    const result = await denied(bundle, claimRequest(bundle), { world });
    expect(result.code).toBe("CLAIMABLE_NOT_SATISFIED");
    expect(result.blockers).toEqual([expect.objectContaining({ key: "HML_VALIDATED", status })]);
  });

  it("T-time: não confia em snapshot anterior — evidência que piora entre tentativas nega a segunda", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const request = claimRequest(bundle);
    // 1ª tentativa: coletor com Git em drift (nada é criado)…
    const driftWorld = createWorld({
      bundles: [bundle],
      collectorOptions: { git: { ok: true, releaseSha: "c".repeat(40), baseSha: bundle.baseSha, drift: true, evaluatedAt: iso(NOW) } },
    });
    expect((await claimDbReleaseExecution(request, driftWorld.depsFor())).ok).toBe(false);
    // …2ª (evidência recolhida de novo, agora íntegra): claim.
    expect((await claimDbReleaseExecution(request, world.depsFor())).ok).toBe(true);
    expect(world.collectEvidence.calls.count).toBe(1);
  });

  it("coletor de evidência que falha/lança → EVIDENCE_UNAVAILABLE", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const throwing = async () => { throw new Error("boom"); };
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a", { collectEvidence: throwing }));
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_UNAVAILABLE" });
    const notOk = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a", { collectEvidence: async () => ({ ok: false }) }));
    expect(notOk.code).toBe("EVIDENCE_UNAVAILABLE");
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("plano inexistente → PLAN_NOT_FOUND; store de plano indisponível → PLAN_STORE_UNAVAILABLE", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const missing = await claimDbReleaseExecution(claimRequest(bundle, { planId: PLAN_C }), world.depsFor());
    expect(missing.code).toBe("PLAN_NOT_FOUND");
    const broken = { getPlanRow: async () => ({ ok: false, error: "PLAN_STORE_UNAVAILABLE" }), listPlanMigrationRows: async () => ({ ok: false }) };
    const unavailable = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a", { planStore: broken }));
    expect(unavailable.code).toBe("PLAN_STORE_UNAVAILABLE");
  });

  it("projectRef de outro ambiente → PROJECT_REF_MISMATCH", async () => {
    const bundle = buildPlan();
    const result = await denied(bundle, claimRequest(bundle, { projectRef: HML_REF }));
    expect(result.code).toBe("PROJECT_REF_MISMATCH");
  });

  it("dependências ausentes / worker inválido / relógio inválido → fail-closed", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    expect((await claimDbReleaseExecution(claimRequest(bundle), {})).code).toBe("CLAIM_DEPENDENCY_MISSING");
    expect((await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a", { planStore: null }))).code).toBe("CLAIM_DEPENDENCY_MISSING");
    expect((await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a", { clock: { nowMs: () => NaN } }))).code).toBe("CLAIM_DEPENDENCY_MISSING");
    for (const bad of ["", "x".repeat(201), "svc-service_role-1", "my-token-worker", "has space"]) {
      expect((await claimDbReleaseExecution(claimRequest(bundle), world.depsFor(bad))).code).toBe("WORKER_ID_INVALID");
    }
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("request malformado → CLAIM_REQUEST_INVALID / CLAIM_INTENT_INVALID / CORRELATION_ID_INVALID", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const call = (request) => claimDbReleaseExecution(request, world.depsFor());
    expect((await call(null)).code).toBe("CLAIM_REQUEST_INVALID");
    expect((await call(claimRequest(bundle, { intent: "NOW" }))).code).toBe("CLAIM_INTENT_INVALID");
    expect((await call(claimRequest(bundle, { correlationId: "abc" }))).code).toBe("CORRELATION_ID_INVALID");
    expect((await call(claimRequest(bundle, { planId: "abc" }))).code).toBe("CLAIM_REQUEST_INVALID");
    expect((await call({ ...claimRequest(bundle), expected: null })).code).toBe("CLAIM_REQUEST_INVALID");
    expect((await call(claimRequest(bundle, { expected: { planHash: "zz" } }))).code).toBe("CLAIM_REQUEST_INVALID");
    expect((await call(claimRequest(bundle, { expected: { environment: "STAGING" } }))).code).toBe("ENVIRONMENT_INVALID");
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("todo código de falha emitido pertence ao vocabulário canônico", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: "x" }), world.depsFor());
    expect(CLAIM_FAILURE_CODES).toContain(result.code);
  });
});

describe("claim — autoridade do cliente e estado do executor", () => {
  it.each([
    ["status", "MIGRATING"],
    ["executionStatus", "SUCCEEDED"],
    ["createdBy", "11111111-1111-4111-8111-111111111111"],
    ["workerId", "worker-evil"],
    ["executorId", "worker-evil"],
    ["lockOwner", "worker-evil"],
    ["leaseGeneration", 99],
    ["claimedAt", "2020-01-01T00:00:00.000Z"],
    ["nowMs", 1],
    ["schemaSafety", { ok: true }],
    ["classification", "SAFE_AUTO"],
    ["gates", []],
    ["ready", true],
  ])("campo %s vindo do cliente é rejeitado", async (field, value) => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle, { [field]: value }), world.depsFor());
    expect(result).toMatchObject({ ok: false, code: "CLIENT_AUTHORITY_FIELD_REJECTED", executionCreated: false });
    expect(result.fields).toContain(field);
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("campos proibidos dentro de `expected` também são rejeitados", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle, { expected: { status: "SUCCEEDED" } }), world.depsFor());
    expect(result.code).toBe("CLIENT_AUTHORITY_FIELD_REJECTED");
    expect(result.fields).toContain("expected.status");
  });

  it("identidade do worker e status inicial vêm do servidor; status inicial é canônico", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("server-worker-7"));
    expect(result.execution.workerId).toBe("server-worker-7");
    expect(EXECUTION_INITIAL_STATUS).toBe("REQUESTED");
    expect(EXECUTION_STATUSES).toContain(EXECUTION_INITIAL_STATUS);
    expect(result.execution.status).toBe(EXECUTION_INITIAL_STATUS);
  });

  it("status do pipeline pertencem ao executor; browser não os define", () => {
    expect(EXECUTOR_OWNED_EXECUTION_STATUSES).toEqual([
      "PREPARING", "DRAINING", "BACKING_UP", "MIGRATING", "VERIFYING", "SUCCEEDED", "FAILED", "RECOVERY_REQUIRED",
    ]);
    for (const status of EXECUTOR_OWNED_EXECUTION_STATUSES) {
      expect(EXECUTION_STATUSES).toContain(status);
      expect(isExecutorOwnedExecutionStatus(status)).toBe(true);
      expect(findClientAuthorityFields({ status })).toEqual(["status"]);
    }
    expect(isExecutorOwnedExecutionStatus("REQUESTED")).toBe(false);
    expect(isExecutorOwnedExecutionStatus("CANCELED")).toBe(false);
  });
});

describe("concorrência — lock exclusivo por ambiente", () => {
  it("dois workers disputam o mesmo plano/correlação: exatamente um dono, uma execução, sem evento duplicado", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const [a, b] = await Promise.all([
      claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a")),
      claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-b")),
    ]);
    const owners = [a, b].filter((item) => item.ok && item.outcome === "OWNED");
    const losers = [a, b].filter((item) => !item.ok);
    expect(owners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["LOCKED", "ALREADY_CLAIMED"]).toContain(losers[0].outcome);
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(world.executionStore.counters.claimWrites).toBe(1);
    expect(world.audit.events).toEqual([]);
    expect(snapshot.locks[0].workerId).toBe(owners[0].execution.workerId);
  });

  it("dois planos PROD disputam o ambiente: um vence, o outro LOCK_UNAVAILABLE", async () => {
    const [planA, planB] = twoProdPlans();
    const world = createWorld({ bundles: [planA, planB] });
    const [a, b] = await Promise.all([
      claimDbReleaseExecution(claimRequest(planA, { correlationId: CORR_1 }), world.depsFor("worker-a")),
      claimDbReleaseExecution(claimRequest(planB, { correlationId: CORR_2 }), world.depsFor("worker-b")),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ outcome: "LOCKED", code: "LOCK_UNAVAILABLE", executionCreated: false, lockAcquired: false });
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("mesmo plano com correlações diferentes em disputa: um só vence", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const results = await Promise.all([
      claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_1 }), world.depsFor("worker-a")),
      claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_2 }), world.depsFor("worker-b")),
    ]);
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("5 workers, 5 planos PROD: exatamente 1 dono", async () => {
    const bundles = Array.from({ length: 5 }, (_, index) => buildPlan({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${index}`,
      sqls: [`comment on table public.pdb_race_${index} is 'x';`],
    }));
    const world = createWorld({ bundles });
    const results = await Promise.all(bundles.map((bundle, index) => claimDbReleaseExecution(
      claimRequest(bundle, { correlationId: `1111111${index}-1111-4111-8111-111111111111` }),
      world.depsFor(`worker-${index}`),
    )));
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => item.outcome === "LOCKED")).toHaveLength(4);
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
  });

  it("locks de HML e PROD são independentes (nos dois sentidos)", async () => {
    const prod = buildPlan({ id: PLAN_A, environment: "PROD" });
    const hml = buildPlan({ id: PLAN_HML, environment: "HML", sqls: ["comment on table public.pdb_hml is 'x';"] });
    const world = createWorld({ bundles: [prod, hml] });
    const hmlFirst = await claimDbReleaseExecution(claimRequest(hml, { correlationId: CORR_2 }), world.depsFor("worker-h"));
    const prodAfter = await claimDbReleaseExecution(claimRequest(prod, { correlationId: CORR_1 }), world.depsFor("worker-p"));
    expect(hmlFirst.ok).toBe(true);
    expect(prodAfter.ok).toBe(true);
    expect(hmlFirst.lock.lockKey).toBe(`DB_RELEASE:HML:${HML_REF}`);
    expect(prodAfter.lock.lockKey).toBe(`DB_RELEASE:PROD:${PROD_REF}`);
    const otherPlanHml = buildPlan({ id: PLAN_C, environment: "HML", sqls: ["comment on table public.pdb_hml2 is 'x';"] });
    const world2 = createWorld({ bundles: [prod, otherPlanHml] });
    const prodFirst = await claimDbReleaseExecution(claimRequest(prod, { correlationId: CORR_1 }), world2.depsFor("worker-p"));
    const hmlAfter = await claimDbReleaseExecution(claimRequest(otherPlanHml, { correlationId: CORR_3 }), world2.depsFor("worker-h"));
    expect(prodFirst.ok && hmlAfter.ok).toBe(true);
    expect(world2.executionStore.snapshot().locks).toHaveLength(2);
  });

  it("dois planos HML disputam o lock de HML", async () => {
    const one = buildPlan({ id: PLAN_A, environment: "HML" });
    const two = buildPlan({ id: PLAN_B, environment: "HML", sqls: ["comment on table public.pdb_hml3 is 'x';"] });
    const world = createWorld({ bundles: [one, two] });
    const first = await claimDbReleaseExecution(claimRequest(one), world.depsFor("worker-a"));
    const second = await claimDbReleaseExecution(claimRequest(two, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, outcome: "LOCKED", code: "LOCK_UNAVAILABLE" });
  });

  it("chave de lock: determinística, ligada a ambiente+projeto, nunca ao plano", () => {
    expect(buildEnvironmentLockKey({ environment: "PROD" }).lockKey).toBe(`DB_RELEASE:PROD:${PROD_REF}`);
    expect(buildEnvironmentLockKey({ environment: "PROD" })).toEqual(buildEnvironmentLockKey({ environment: "PROD", projectRef: PROD_REF }));
    expect(buildEnvironmentLockKey({ environment: "HML" }).lockKey).toBe(`DB_RELEASE:HML:${HML_REF}`);
    expect(buildEnvironmentLockKey({ environment: "PROD" }).lockKey).not.toBe(buildEnvironmentLockKey({ environment: "HML" }).lockKey);
    expect(buildEnvironmentLockKey({ environment: "PROD", projectRef: HML_REF })).toMatchObject({ ok: false, code: "PROJECT_REF_MISMATCH" });
    expect(buildEnvironmentLockKey({ environment: "HML", projectRef: PROD_REF })).toMatchObject({ ok: false });
    expect(buildEnvironmentLockKey({ environment: "STAGING" })).toMatchObject({ ok: false, code: "ENVIRONMENT_INVALID" });
    expect(buildEnvironmentLockKey({ environment: "PROD" }).lockKey).not.toContain(PLAN_A);
  });

  it("lock guarda o dono: execução + worker + geração + ambiente/projeto + acquiredAt", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const claim = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    const [lock] = world.executionStore.snapshot().locks;
    expect(lock).toMatchObject({
      executionId: claim.execution.executionId,
      workerId: "worker-a",
      leaseGeneration: 1,
      environment: "PROD",
      projectRef: PROD_REF,
      planId: PLAN_A,
      acquiredAt: iso(NOW),
    });
  });
});

describe("idempotência do claim", () => {
  it("mesmo worker + mesma correlação: devolve a mesma execução, sem duplicar execução/lock/evento", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const first = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    const replay = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(replay).toMatchObject({ ok: true, outcome: "OWNED", replay: true, executionCreated: false, lockAcquired: false });
    expect(replay.execution.executionId).toBe(first.execution.executionId);
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(world.executionStore.counters.claimWrites).toBe(1);
    expect(world.audit.events).toEqual([]);
  });

  it("replay não revalida CLAIMABLE (o plano pode ter avançado) mas confere o binding", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    world.planStore.__patchRow(PLAN_A, { status: "RUNNING" });
    const replay = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(replay).toMatchObject({ ok: true, replay: true });
    const drifted = await claimDbReleaseExecution(claimRequest(bundle, { expected: { targetReleaseSha: "c".repeat(40) } }), world.depsFor("worker-a"));
    expect(drifted).toMatchObject({ ok: false, code: "PLAN_DRIFT" });
  });

  it("outro worker + mesma correlação: não rouba a posse (ALREADY_CLAIMED)", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const first = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    const stolen = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-b"));
    expect(stolen).toMatchObject({ ok: false, outcome: "ALREADY_CLAIMED", code: "EXECUTION_OWNED_BY_OTHER_WORKER", executionCreated: false });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.executions[0].workerId).toBe("worker-a");
    expect(snapshot.locks[0].workerId).toBe("worker-a");
    expect(snapshot.executions[0].id).toBe(first.execution.executionId);
  });

  it("mesmo plano + nova correlação enquanto há tentativa ativa: negado por ciclo de vida", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    const second = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_2 }), world.depsFor("worker-a"));
    expect(second).toMatchObject({ ok: false, code: "PLAN_EXECUTION_EXISTS" });
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("nova tentativa (nova correlação) só depois de a anterior ser CANCELED e o lock liberado", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const first = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    world.executionStore.__setStatusForTest(first.execution.executionId, "CANCELED");
    const released = await releaseDbReleaseEnvironmentLock({ executionId: first.execution.executionId, leaseGeneration: 1 }, world.depsFor("worker-a"));
    expect(released).toMatchObject({ ok: true, lockReleased: true });
    const retry = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_2 }), world.depsFor("worker-a"));
    expect(retry).toMatchObject({ ok: true, outcome: "OWNED", replay: false });
    expect(retry.execution.executionId).not.toBe(first.execution.executionId);
    expect(world.executionStore.snapshot().executions).toHaveLength(2);
  });

  it.each(["FAILED", "SUCCEEDED", "RECOVERY_REQUIRED"])("tentativa anterior %s nega nova correlação", async (status) => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const first = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    world.executionStore.__setStatusForTest(first.execution.executionId, status);
    const retry = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_2 }), world.depsFor("worker-a"));
    expect(retry.ok).toBe(false);
    expect(retry.code).toBe("PLAN_EXECUTION_EXISTS");
  });

  it("replay pelo mesmo worker após lease expirada NÃO revive a posse", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    world.clock.advance(121 * 1000);
    const replay = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(replay).toMatchObject({ ok: false, outcome: "STALE", code: "LEASE_EXPIRED", requiresReconciliation: true });
  });
});

describe("atomicidade claim: lock + execução", () => {
  it("contrato: claimEnvironment com binding incoerente não grava nada", async () => {
    const store = createMemoryExecutionStore();
    expect(isExecutionStore(store)).toBe(true);
    const result = await store.claimEnvironment({
      lock: { lockKey: "K", executionId: "a", workerId: "w", leaseGeneration: 1, environment: "PROD", projectRef: PROD_REF },
      execution: { id: "b", workerId: "w", leaseGeneration: 1, environment: "PROD", projectRef: PROD_REF, planId: "p", correlationId: "c" },
    });
    expect(result).toMatchObject({ ok: false, code: "CLAIM_BINDING_INVALID" });
    expect(store.snapshot()).toEqual({ executions: [], locks: [] });
  });

  it("falha após lock (só o lock gravado): compensa liberando o lock — sem lock órfão", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { partialClaim: "LOCK_ONLY" } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, code: "EXECUTION_CREATE_FAILED", reasonCode: "ORPHAN_LOCK_COMPENSATED", lockReleased: true });
    expect(world.executionStore.snapshot()).toEqual({ executions: [], locks: [] });
    world.executionStore.faults.partialClaim = null;
    const retry = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(retry.ok).toBe(true);
  });

  it("lock órfão que não pode ser compensado → RECONCILIATION_REQUIRED (nunca 'sucesso') e o ambiente segue bloqueado", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { partialClaim: "LOCK_ONLY", failReleaseLock: true } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({
      ok: false,
      outcome: "RECONCILIATION_REQUIRED",
      code: "ORPHAN_LOCK",
      lockReleased: false,
      requiresReconciliation: true,
    });
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
    world.executionStore.faults.partialClaim = null;
    world.executionStore.faults.failReleaseLock = false;
    // Outro worker não consegue "limpar" o lock órfão automaticamente.
    const other = await claimDbReleaseExecution(claimRequest(bundle, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(other).toMatchObject({ ok: false, outcome: "RECONCILIATION_REQUIRED" });
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
  });

  it("execução sem lock (só a execução gravada): cancelada na compensação", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { partialClaim: "EXECUTION_ONLY" } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, code: "EXECUTION_CREATE_FAILED", reasonCode: "ORPHAN_EXECUTION_COMPENSATED", executionCanceled: true });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.locks).toEqual([]);
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.executions[0]).toMatchObject({ status: "CANCELED", failureCode: "EXECUTION_WITHOUT_LOCK" });
  });

  it("execução sem lock que não pode ser cancelada → RECONCILIATION_REQUIRED (ORPHAN_EXECUTION)", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { partialClaim: "EXECUTION_ONLY", failTransition: true } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, outcome: "RECONCILIATION_REQUIRED", code: "ORPHAN_EXECUTION", executionCanceled: false });
  });

  it("conexão perdida DEPOIS de gravar: reconcilia por leitura e reconhece o claim (uma execução, um lock)", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { throwOnClaim: true } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: true, outcome: "OWNED", recoveredFromAmbiguousClaim: true });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(snapshot.locks[0].executionId).toBe(snapshot.executions[0].id);
  });

  it("store indisponível: nada é gravado e o resultado é fail-closed", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle], storeFaults: { unavailable: true } });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE", executionCreated: false });
    expect(world.executionStore.snapshot()).toEqual({ executions: [], locks: [] });
  });

  it("leitura de reconciliação impossível → CLAIM_OUTCOME_UNKNOWN / RECONCILIATION_REQUIRED", async () => {
    const bundle = buildPlan();
    const world = createWorld({ bundles: [bundle] });
    const store = world.executionStore;
    const original = store.claimEnvironment.bind(store);
    store.claimEnvironment = async (args) => {
      await original(args);
      store.faults.unavailable = true;
      throw new Error("connection lost");
    };
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, outcome: "RECONCILIATION_REQUIRED", code: "CLAIM_OUTCOME_UNKNOWN" });
  });

  it("mapeamento de schema: só colunas reais da migration 160; lease/lockKey ficam no adapter", () => {
    const sql = readFileSync(resolve(root, "supabase/migrations/160_db_release_orchestrator_foundation.sql"), "utf8");
    const block = sql.match(/create table public\.app_db_release_executions \(([\s\S]*?)\n\);/)[1];
    const columns = block
      .split("\n")
      .map((line) => line.match(/^ {2}([a-z_]+) (uuid|text|timestamptz)/))
      .filter(Boolean)
      .map((match) => match[1]);
    expect([...PERSISTED_EXECUTION_COLUMNS].sort()).toEqual([...columns].sort());
    const row = toExecutionRow({
      id: "x", planId: "p", environment: "PROD", status: "REQUESTED", correlationId: "c", workerId: "w",
      claimedAt: iso(NOW), heartbeatAt: iso(NOW), projectRef: PROD_REF, leaseGeneration: 1, planHash: "h",
      targetReleaseSha: "t", baseSha: "b", lockKey: "k",
    });
    expect(Object.keys(row).sort()).toEqual([...PERSISTED_EXECUTION_COLUMNS].sort());
    for (const field of ADAPTER_ONLY_EXECUTION_FIELDS) {
      expect(Object.keys(row)).not.toContain(field);
    }
    expect(ADAPTER_ONLY_EXECUTION_FIELDS).toContain("leaseGeneration");
  });
});

describe("bootstrap 160/161 nunca são workload automático", () => {
  const BLOB_160 = "7f2784b5720aece674d953b32da351db21085421";
  const BLOB_161 = "a83bf385eae5fc088019ad455556fbe4f37e4a9d";

  function canonicalBlob(sha) {
    return execFileSync("git", ["cat-file", "blob", sha], { cwd: root }).toString("utf8");
  }

  function bootstrapItems() {
    return [
      { filename: "160_db_release_orchestrator_foundation.sql", blob: BLOB_160 },
      { filename: "161_canonical_session_admission.sql", blob: BLOB_161 },
    ].map((file, index) => {
      const sql = canonicalBlob(file.blob);
      return {
        order: index + 1,
        filename: file.filename,
        sql,
        sha256: sha256(sql),
        bytes: Buffer.byteLength(sql, "utf8"),
        gitBlob: file.blob,
      };
    });
  }

  it("classificação servidor de 160/161 permanece PROHIBITED (autoridade da I2A)", () => {
    const analysis = analyzeMigrationSet(bootstrapItems());
    expect(analysis.hasProhibited).toBe(true);
    expect(analysis.results.map((item) => item.classification)).toEqual(["PROHIBITED", "PROHIBITED"]);
  });

  it("claim imediato de um plano com 160/161 → CLAIMABLE_NOT_SATISFIED (SCHEMA_SAFETY_PASS FAILED)", async () => {
    const bundle = buildPlan({ items: bootstrapItems() });
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(result).toMatchObject({ ok: false, code: "CLAIMABLE_NOT_SATISFIED", executionCreated: false });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "SCHEMA_SAFETY_PASS", status: "FAILED", reasonCode: "SCHEMA_SAFETY_PROHIBITED" }),
    ]));
    expect(world.executionStore.snapshot()).toEqual({ executions: [], locks: [] });
  });

  it("mesmo declarando SAFE_AUTO no plano, 160/161 seguem negados no claim agendado", async () => {
    const bundle = buildPlan({
      items: bootstrapItems(),
      declaredClassification: "SAFE_AUTO",
      status: "SCHEDULED",
      scheduledAt: iso(NOW - MIN),
    });
    const world = createWorld({ bundles: [bundle] });
    const result = await claimDbReleaseExecution(claimRequest(bundle), world.depsFor());
    expect(result).toMatchObject({ ok: false, code: "CLAIMABLE_NOT_SATISFIED" });
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("identidade canônica (blob Git, não SHA físico CRLF) das migrations 160/161 é a esperada", () => {
    const listed = execFileSync("git", ["ls-files", "-s", "supabase/migrations/160_db_release_orchestrator_foundation.sql", "supabase/migrations/161_canonical_session_admission.sql"], { cwd: root }).toString("utf8");
    expect(listed).toContain(BLOB_160);
    expect(listed).toContain(BLOB_161);
  });
});
