import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DB_HAPPY_PATH,
  EXECUTION_STATUSES,
  EXECUTION_STEP_STATUSES,
  EXECUTION_STEP_TYPES,
  MAINTENANCE_EVENT_TYPES,
  MAINTENANCE_PHASES,
} from "../../server/db-release-contract.js";
import { runDbReleaseExecution } from "../../server/db-release-executor.js";
import {
  APPLY_RESULTS,
  EXECUTION_PIPELINE_EDGES,
  MAINTENANCE_PORT_METHODS,
  MIGRATION_ATTEMPTS_PER_STEP,
  MigrationNotCommittedError,
  MUTATION_RETRY_COUNT,
  NOTICE_MIN_MS_MAX,
  SAFE_ABORT_FAILURE_CODES,
  STEP_ORDER,
  classifyApplyOutcome,
  isPipelineExecutionEdge,
  migrateStepOrder,
  resolveNoticeMinMs,
} from "../../server/db-release-pipeline-contract.js";
import {
  createMemoryStepStore,
  evidenceIsPersistable,
  fromStepRow,
  PERSISTED_STEP_COLUMNS,
  toStepRow,
} from "../../server/db-release-step-store.js";
import { readDbReleasePlan } from "../../server/db-release-plan-reader.js";
import { MIN, SEC, buildPlan, createPipelineWorld, iso } from "./helpers/db-release-pipeline-fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(resolve(root, relative), "utf8");

describe("contrato do pipeline — nenhum vocabulário novo", () => {
  it("status de execução do pipeline ⊂ vocabulário da migration 160; fases ⊂ 13 fases; steps ⊂ 12 tipos", () => {
    for (const [from, to] of EXECUTION_PIPELINE_EDGES) {
      expect(EXECUTION_STATUSES).toContain(from);
      expect(EXECUTION_STATUSES).toContain(to);
    }
    for (const type of Object.keys(STEP_ORDER)) expect(EXECUTION_STEP_TYPES).toContain(type);
    expect(EXECUTION_STEP_TYPES).toContain("MIGRATE");
    expect(MAINTENANCE_PHASES).toHaveLength(13);
    // a sequência DB congelada é exatamente a do executor (RELEASING fora)
    expect(DB_HAPPY_PATH.map(([, to]) => to)).toEqual(["NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "NORMAL"]);
  });

  it("progressão feliz: REQUESTED→PREPARING→DRAINING→BACKING_UP→MIGRATING→VERIFYING→SUCCEEDED; nada pula etapa nem sai de terminal", () => {
    const chain = ["REQUESTED", "PREPARING", "DRAINING", "BACKING_UP", "MIGRATING", "VERIFYING", "SUCCEEDED"];
    for (let i = 0; i < chain.length - 1; i += 1) expect(isPipelineExecutionEdge(chain[i], chain[i + 1])).toBe(true);
    expect(isPipelineExecutionEdge("REQUESTED", "MIGRATING")).toBe(false);
    expect(isPipelineExecutionEdge("DRAINING", "MIGRATING")).toBe(false);
    expect(isPipelineExecutionEdge("BACKING_UP", "SUCCEEDED")).toBe(false);
    for (const terminal of ["SUCCEEDED", "CANCELED"]) {
      expect(EXECUTION_PIPELINE_EDGES.filter(([from]) => from === terminal)).toEqual([]);
    }
    // MIGRATING não tem saída de cancelamento
    expect(isPipelineExecutionEdge("MIGRATING", "CANCELED")).toBe(false);
    expect(isPipelineExecutionEdge("VERIFYING", "CANCELED")).toBe(false);
    expect(isPipelineExecutionEdge("RECOVERY_REQUIRED", "CANCELED")).toBe(false);
  });

  it("ordens de step são únicas e determinísticas; migrations em 101.. sem colidir", () => {
    const orders = Object.values(STEP_ORDER);
    expect(new Set(orders).size).toBe(orders.length);
    expect(migrateStepOrder(1)).toBe(101);
    expect(migrateStepOrder(500)).toBe(600);
    expect(migrateStepOrder(0)).toBeNull();
    expect(migrateStepOrder(501)).toBeNull();
    expect(migrateStepOrder(1.5)).toBeNull();
    expect(orders.filter((order) => order >= 100 && order <= 600)).toEqual([]);
  });

  it("todo evento de auditoria emitido pelo executor existe no CHECK da migration 160 (sem inventar)", () => {
    const source = read("server/db-release-executor.js");
    const emitted = [...source.matchAll(/emit\(ctx,\s*"([A-Z_]+)"/g)].map((match) => match[1]);
    expect(emitted.length).toBeGreaterThan(10);
    for (const type of new Set(emitted)) expect(MAINTENANCE_EVENT_TYPES, type).toContain(type);
    const sqlText = read("supabase/migrations/160_db_release_orchestrator_foundation.sql");
    for (const type of new Set(emitted)) {
      // ou está no superset de 42 da 160, ou é legado herdado (140/153/159), já dentro desse superset
      expect(sqlText, type).toContain(`'${type}'`);
    }
  });

  it("AUDIT_TAXONOMY_GAP: eventos úteis que NÃO existem no SQL (não foram inventados)", () => {
    const wanted = [
      "DB_PLAN_RUNNING", "DB_EXECUTION_CLAIMED", "DB_LOCK_ACQUIRED", "DB_LOCK_RELEASED", "WRITE_FENCE_VERIFIED",
      "DB_MIGRATION_FAILED", "DB_MIGRATION_AMBIGUOUS", "DB_SMOKE_PASSED", "DB_SMOKE_FAILED", "DB_RELEASE_ABORTED", "DB_RELEASE_CANCELED",
    ];
    for (const type of wanted) expect(MAINTENANCE_EVENT_TYPES, type).not.toContain(type);
    const source = read("server/db-release-executor.js");
    for (const type of wanted) expect(source, type).not.toContain(`"${type}"`);
  });

  it("portas de manutenção: nenhuma operação genérica de 'cancelar migration'; login/fence/edges são métodos distintos", () => {
    expect(MAINTENANCE_PORT_METHODS).toEqual(expect.arrayContaining([
      "startNotice", "fence", "closeLoginGate", "startDrain", "quiesce", "startBackup", "startMigrating", "startSmoke", "completeNormal", "openLoginGate",
    ]));
    expect(MAINTENANCE_PORT_METHODS.filter((name) => /cancel|kill|terminate/i.test(name))).toEqual([]);
  });
});

describe("modelo de resultado do apply", () => {
  it("três resultados distintos; nada é 'sucesso' sem SUCCESS_COMMITTED", () => {
    expect(Object.values(APPLY_RESULTS)).toEqual(["SUCCESS_COMMITTED", "FAILED_NOT_COMMITTED", "AMBIGUOUS_UNKNOWN_COMMIT"]);
    expect(MUTATION_RETRY_COUNT).toBe(0);
    expect(MIGRATION_ATTEMPTS_PER_STEP).toBe(1);
  });

  it("classificação: retorno válido preservado; erro tipado ≠ erro genérico ≠ timeout; lixo é ambíguo", () => {
    expect(classifyApplyOutcome({ result: "SUCCESS_COMMITTED" })).toMatchObject({ result: "SUCCESS_COMMITTED" });
    expect(classifyApplyOutcome({ result: "FAILED_NOT_COMMITTED", reasonCode: "X" })).toEqual({ result: "FAILED_NOT_COMMITTED", reasonCode: "X" });
    expect(classifyApplyOutcome({ result: "AMBIGUOUS_UNKNOWN_COMMIT" }).result).toBe("AMBIGUOUS_UNKNOWN_COMMIT");
    expect(classifyApplyOutcome(null, new MigrationNotCommittedError("boom", { code: "SQL_SYNTAX" }))).toEqual({ result: "FAILED_NOT_COMMITTED", reasonCode: "SQL_SYNTAX" });
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    expect(classifyApplyOutcome(null, timeout)).toEqual({ result: "AMBIGUOUS_UNKNOWN_COMMIT", reasonCode: "APPLY_TIMEOUT" });
    expect(classifyApplyOutcome(null, Object.assign(new Error("t"), { code: "ETIMEDOUT" })).reasonCode).toBe("APPLY_TIMEOUT");
    expect(classifyApplyOutcome(null, new Error("reset")).reasonCode).toBe("APPLY_TRANSPORT_ERROR");
    for (const garbage of [undefined, null, {}, { result: "OK" }, "SUCCESS_COMMITTED", 1, { ok: true }]) {
      expect(classifyApplyOutcome(garbage).result, JSON.stringify(garbage)).toBe("AMBIGUOUS_UNKNOWN_COMMIT");
    }
    // exceção com notCommitted=false/ausente NUNCA vira FAILED_NOT_COMMITTED
    expect(classifyApplyOutcome(null, Object.assign(new Error("x"), { notCommitted: false })).result).toBe("AMBIGUOUS_UNKNOWN_COMMIT");
  });

  it("falhas com unwind seguro não incluem nenhuma falha de migration/ambiguidade", () => {
    for (const code of SAFE_ABORT_FAILURE_CODES) {
      expect(code).not.toMatch(/MIGRATION_(OUTCOME|FAILED)|AMBIGUOUS|LEASE_LOST|SMOKE|POST_MIGRATION/);
    }
    expect(SAFE_ABORT_FAILURE_CODES).not.toContain("BACKUP_OUTCOME_AMBIGUOUS");
  });
});

describe("step store (espelha app_db_release_execution_steps)", () => {
  it("colunas persistidas = schema da migration 160; nenhuma coluna inventada", () => {
    const sql = read("supabase/migrations/160_db_release_orchestrator_foundation.sql");
    const block = sql.slice(sql.indexOf("create table public.app_db_release_execution_steps"), sql.indexOf("alter table public.app_db_release_execution_steps enable"));
    for (const column of PERSISTED_STEP_COLUMNS) expect(block, column).toContain(column);
    expect(PERSISTED_STEP_COLUMNS).toHaveLength(11);
    expect(block).not.toMatch(/\b(attempts?|attempt_count|lease_generation|commit_state|retry|retry_count)\b/i);
    const step = { id: "1", executionId: "e", stepOrder: 5, stepType: "QUIESCE", status: "SUCCEEDED", startedAt: "a", completedAt: "b", evidence: { x: 1 }, errorCode: null, errorMessage: null, createdAt: "a" };
    expect(fromStepRow(toStepRow(step))).toEqual(step);
    expect(Object.keys(toStepRow(step)).sort()).toEqual([...PERSISTED_STEP_COLUMNS].sort());
  });

  it("evidência: sem chaves secretas (top-level) nem material secreto", () => {
    expect(evidenceIsPersistable({ ok: 1 })).toBe(true);
    expect(evidenceIsPersistable(null)).toBe(true);
    for (const key of ["authorization", "Authorization", "service_role", "service_role_key", "password", "secret", "token", "api_key"]) {
      expect(evidenceIsPersistable({ [key]: "x" }), key).toBe(false);
    }
    expect(evidenceIsPersistable([1])).toBe(false);
    expect(evidenceIsPersistable("x")).toBe(false);
  });

  it("beginStep é INSERT-IF-ABSENT; finishStep é CAS; ordem inválida/tipo inválido/evidência insegura recusados", async () => {
    const store = createMemoryStepStore();
    const args = { executionId: "e1", stepOrder: 101, stepType: "MIGRATE", startedAt: iso(0), evidence: { attempt: 1 } };
    const first = await store.beginStep(args);
    expect(first).toMatchObject({ ok: true, created: true, step: { status: "RUNNING" } });
    const again = await store.beginStep({ ...args, evidence: { attempt: 99 } });
    expect(again).toMatchObject({ ok: true, created: false });
    expect(again.step.evidence.attempt).toBe(1);
    expect(store.counters.begins).toBe(1);
    expect(await store.beginStep({ ...args, stepOrder: 0 })).toMatchObject({ ok: false, code: "STEP_ORDER_INVALID" });
    expect(await store.beginStep({ ...args, stepOrder: 2, stepType: "NOPE" })).toMatchObject({ ok: false, code: "STEP_TYPE_INVALID" });
    expect(await store.beginStep({ ...args, stepOrder: 3, evidence: { token: "x" } })).toMatchObject({ ok: false, code: "STEP_EVIDENCE_UNSAFE" });

    expect(await store.finishStep({ executionId: "e1", stepOrder: 101, status: "RUNNING" })).toMatchObject({ ok: false, code: "STEP_STATUS_INVALID" });
    const done = await store.finishStep({ executionId: "e1", stepOrder: 101, status: "SUCCEEDED", completedAt: iso(1), evidence: { commitState: "COMMITTED" } });
    expect(done).toMatchObject({ ok: true, step: { status: "SUCCEEDED" } });
    expect(done.step.evidence).toEqual({ attempt: 1, commitState: "COMMITTED" });
    // CAS: segunda finalização (obsoleta) vira conflito e NÃO sobrescreve
    expect(await store.finishStep({ executionId: "e1", stepOrder: 101, status: "FAILED" })).toMatchObject({ ok: false, code: "STEP_CONFLICT" });
    expect((await store.getStep({ executionId: "e1", stepOrder: 101 })).step.status).toBe("SUCCEEDED");
    expect(EXECUTION_STEP_STATUSES).toContain("SUCCEEDED");
  });

  it("indisponível: nada é escrito", async () => {
    const store = createMemoryStepStore({ faults: { unavailable: true } });
    expect(await store.beginStep({ executionId: "e", stepOrder: 1, stepType: "PREFLIGHT" })).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    expect(store.snapshot()).toEqual([]);
  });
});

describe("leitor de plano puro", () => {
  it("lê plano + migrations ordenadas pela porta explícita", async () => {
    const bundle = buildPlan();
    const world = await createPipelineWorld({ bundle, claim: false });
    const loaded = await readDbReleasePlan(bundle.id, { store: world.planStore });
    expect(loaded.ok).toBe(true);
    expect(loaded.plan).toMatchObject({ id: bundle.id, planHash: bundle.planHash, status: "APPROVED", environment: "PROD" });
    expect(loaded.plan.migrations.map((item) => item.order)).toEqual([1, 2]);
    expect(await readDbReleasePlan("not-a-uuid", { store: world.planStore })).toMatchObject({ ok: false, error: "PLAN_ID_INVALID" });
    expect(await readDbReleasePlan("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { store: world.planStore })).toMatchObject({ ok: false, error: "PLAN_NOT_FOUND" });
  });
});

describe("NOTICE: política de espera mínima (configurável, padrão sem imposição)", () => {
  it("resolveNoticeMinMs é limitada", () => {
    expect(resolveNoticeMinMs({})).toBe(0);
    expect(resolveNoticeMinMs({ noticeMinMs: 5 * MIN })).toBe(5 * MIN);
    expect(resolveNoticeMinMs({ noticeMinMs: -1 })).toBe(0);
    expect(resolveNoticeMinMs({ noticeMinMs: NOTICE_MIN_MS_MAX + 1 })).toBe(0);
    expect(resolveNoticeMinMs({ noticeMinMs: Number.NaN })).toBe(0);
  });

  it("com mínimo configurado: espera em NOTICE (login ainda ABERTO, nada fenced) e depois segue", async () => {
    const world = await createPipelineWorld({ policy: { noticeMinMs: 2 * MIN } });
    const waiting = await runDbReleaseExecution(world.request(), world.depsFor());
    expect(waiting).toMatchObject({ ok: true, outcome: "WAITING_NOTICE", stage: "NOTICE" });
    expect(world.maintenance.state).toMatchObject({ phase: "NOTICE", loginGate: "OPEN", fenceEffectiveAt: null });
    expect(world.log).not.toContain("phase:FENCING");
    world.clock.advance(60 * SEC);
    expect((await runDbReleaseExecution(world.request(), world.depsFor())).outcome).toBe("WAITING_NOTICE");
    world.clock.advance(61 * SEC);
    expect((await runDbReleaseExecution(world.request(), world.depsFor())).outcome).toBe("SUCCEEDED");
    expect(world.log.filter((entry) => entry === "phase:NOTICE")).toHaveLength(1);
  });
});

describe("pipeline independe do ambiente (HML sintético, sem acesso a HML)", () => {
  it("plano HML sintético percorre a mesma máquina de estados", async () => {
    const bundle = buildPlan({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", environment: "HML" });
    const world = await createPipelineWorld({ bundle });
    expect(world.execRecord().projectRef).toMatch(/^[a-z]{20}$/);
    expect((await runDbReleaseExecution(world.request(), world.depsFor())).outcome).toBe("SUCCEEDED");
  });
});
