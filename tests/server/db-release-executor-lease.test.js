import { describe, expect, it } from "vitest";
import { ACCESS_HEARTBEAT_MS } from "../../src/lib/accessControl/constants.js";
import {
  claimDbReleaseExecution,
  collectExecutionOwnershipEvidence,
  flagDbReleaseLeaseLoss,
  heartbeatDbReleaseExecution,
  releaseDbReleaseEnvironmentLock,
} from "../../server/db-release-executor-claim.js";
import {
  CLAIM_OUTCOMES,
  EXECUTOR_HEARTBEAT_INTERVAL_SECONDS,
  EXECUTOR_LEASE_RATIO,
  EXECUTOR_LEASE_RATIONALE,
  EXECUTOR_LEASE_TTL_SECONDS,
  OWNERSHIP_OUTCOMES,
  SCHEDULE_CLAIM_WINDOW_MS,
} from "../../server/db-release-executor-contract.js";
import {
  EXECUTION_EVIDENCE_FRESHNESS_MS,
  buildLease,
  classifyOwnership,
  deriveExecutionGates,
  deriveExecutorHealthyGate,
  deriveLockAcquiredGate,
  isLeaseExpired,
  leaseExpiresAtMs,
} from "../../server/db-release-executor-lease.js";
import {
  HEARTBEAT_INTERVAL_SECONDS,
  MIN_TTL_RATIO,
  SELECTED_ALIVE_TTL_SECONDS,
  isTtlSafeAgainstHeartbeat,
} from "../../server/session-admission-contract.js";
import { RUNTIME_EVIDENCE_FRESHNESS_MS, buildReadinessSnapshot } from "../../server/db-release-readiness.js";
import {
  CORR_1,
  CORR_2,
  NOW,
  PLAN_A,
  PLAN_B,
  PROD_REF,
  SEC,
  buildPlan,
  claimRequest,
  createWorld,
  iso,
} from "./helpers/db-release-executor-fixtures.js";

async function claimed({ worker = "worker-a", bundles = [buildPlan()], storeFaults = {} } = {}) {
  const world = createWorld({ bundles, storeFaults });
  const claim = await claimDbReleaseExecution(claimRequest(bundles[0]), world.depsFor(worker));
  if (!claim.ok) throw new Error(`fixture claim falhou: ${claim.code}`);
  return { world, claim, executionId: claim.execution.executionId, bundle: bundles[0] };
}

const beat = (world, executionId, worker = "worker-a", extra = {}) => heartbeatDbReleaseExecution(
  { executionId, leaseGeneration: 1, ...extra },
  world.depsFor(worker),
);

describe("lease — constantes e fundamentos (nenhum TTL inventado)", () => {
  it("heartbeat 45s / lease 120s / ratio 2.67, ancorados nos precedentes existentes", () => {
    expect(EXECUTOR_HEARTBEAT_INTERVAL_SECONDS).toBe(45);
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBe(120);
    expect(EXECUTOR_LEASE_RATIO).toBeCloseTo(120 / 45, 10);
    expect(EXECUTOR_LEASE_RATIO).toBeCloseTo(2.6667, 3);
    // Precedentes: heartbeat de plataforma/sessão e TTL "vivo" canônico.
    expect(EXECUTOR_HEARTBEAT_INTERVAL_SECONDS).toBe(HEARTBEAT_INTERVAL_SECONDS);
    expect(EXECUTOR_HEARTBEAT_INTERVAL_SECONDS * 1000).toBe(ACCESS_HEARTBEAT_MS);
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBe(SELECTED_ALIVE_TTL_SECONDS);
    // Timeout de recuperação do executor de releases (api/releases-executor: 2 min).
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBe(2 * 60);
    expect(EXECUTION_EVIDENCE_FRESHNESS_MS).toBe(RUNTIME_EVIDENCE_FRESHNESS_MS);
  });

  it("razão tolera 1 heartbeat perdido + jitter e ainda detecta worker morto rapidamente", () => {
    expect(isTtlSafeAgainstHeartbeat(EXECUTOR_LEASE_TTL_SECONDS, EXECUTOR_HEARTBEAT_INTERVAL_SECONDS)).toBe(true);
    expect(EXECUTOR_LEASE_RATIO).toBeGreaterThanOrEqual(MIN_TTL_RATIO);
    // 1 heartbeat perdido (2 × 45 = 90s) ainda é menor que o TTL…
    expect(2 * EXECUTOR_HEARTBEAT_INTERVAL_SECONDS).toBeLessThan(EXECUTOR_LEASE_TTL_SECONDS);
    // …mas não há TTL "gigante": no máximo 3 intervalos.
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBeLessThanOrEqual(3 * EXECUTOR_HEARTBEAT_INTERVAL_SECONDS);
    expect(EXECUTOR_LEASE_RATIONALE).toMatch(/45s/);
    expect(EXECUTOR_LEASE_RATIONALE).toMatch(/120s/);
  });

  it("janela de agenda explícita e curta", () => {
    expect(SCHEDULE_CLAIM_WINDOW_MS).toBe(15 * 60_000);
  });

  it("vocabulário de ownership contém os 5 resultados canônicos", () => {
    expect(OWNERSHIP_OUTCOMES).toEqual(["OWNED", "LOCKED", "STALE", "AMBIGUOUS", "RECONCILIATION_REQUIRED"]);
    for (const outcome of OWNERSHIP_OUTCOMES) expect(CLAIM_OUTCOMES).toContain(outcome);
  });

  it("buildLease: campos conceituais e expiração por relógio do servidor", () => {
    const execution = { id: "e", workerId: "w", leaseGeneration: 1, heartbeatAt: iso(NOW), status: "REQUESTED" };
    expect(buildLease(execution, { nowMs: NOW })).toEqual({
      workerId: "w",
      executionId: "e",
      leaseGeneration: 1,
      heartbeatAt: iso(NOW),
      leaseExpiresAt: iso(NOW + 120 * SEC),
      status: "ACTIVE",
    });
    expect(buildLease(execution, { nowMs: NOW + 120 * SEC }).status).toBe("EXPIRED");
    expect(buildLease({ ...execution, status: "SUCCEEDED" }, { nowMs: NOW }).status).toBe("ENDED");
    expect(buildLease(null, { nowMs: NOW })).toBeNull();
    expect(leaseExpiresAtMs(null)).toBeNull();
    expect(isLeaseExpired(null, NOW)).toBe(true);
    expect(isLeaseExpired(iso(NOW), NOW + 120 * SEC - 1)).toBe(false);
    expect(isLeaseExpired(iso(NOW), NOW + 120 * SEC)).toBe(true);
  });
});

describe("heartbeat", () => {
  it("heartbeat fresco estende a lease (relógio do servidor) e só muda heartbeatAt", async () => {
    const { world, executionId } = await claimed();
    const before = world.executionStore.snapshot().executions[0];
    world.clock.advance(60 * SEC);
    const result = await beat(world, executionId);
    expect(result).toMatchObject({ ok: true, outcome: "OWNED", migrationAuthorized: false });
    expect(result.lease).toMatchObject({ status: "ACTIVE", heartbeatAt: iso(NOW + 60 * SEC), leaseExpiresAt: iso(NOW + 180 * SEC) });
    const after = world.executionStore.snapshot().executions[0];
    const { heartbeatAt: beforeBeat, ...beforeRest } = before;
    const { heartbeatAt: afterBeat, ...afterRest } = after;
    expect(afterRest).toEqual(beforeRest);
    expect(beforeBeat).toBe(iso(NOW));
    expect(afterBeat).toBe(iso(NOW + 60 * SEC));
    expect(world.executionStore.counters.heartbeatWrites).toBe(1);
  });

  it("heartbeats sucessivos mantêm a posse viva além do TTL original", async () => {
    const { world, executionId } = await claimed();
    for (let i = 0; i < 6; i += 1) {
      world.clock.advance(45 * SEC);
      expect((await beat(world, executionId)).ok).toBe(true);
    }
    expect(world.clock.ms - NOW).toBe(270 * SEC);
    expect((await beat(world, executionId)).ok).toBe(true);
  });

  it("heartbeat no mesmo milissegundo é monotônico (CAS não regride)", async () => {
    const { world, executionId } = await claimed();
    const first = await beat(world, executionId);
    const second = await beat(world, executionId);
    expect(first.ok && second.ok).toBe(true);
    expect(Date.parse(second.execution.heartbeatAt)).toBeGreaterThan(Date.parse(first.execution.heartbeatAt));
  });

  it("worker errado é negado e nada muda", async () => {
    const { world, executionId } = await claimed({ worker: "worker-a" });
    const before = world.executionStore.snapshot();
    world.clock.advance(30 * SEC);
    const result = await beat(world, executionId, "worker-b");
    expect(result).toMatchObject({ ok: false, outcome: "LOCKED", code: "WORKER_MISMATCH" });
    expect(world.executionStore.snapshot()).toEqual(before);
  });

  it("execução errada/inexistente é negada", async () => {
    const { world } = await claimed();
    const result = await beat(world, "77777777-7777-4777-8777-777777777777");
    expect(result).toMatchObject({ ok: false, code: "EXECUTION_NOT_FOUND" });
    expect((await beat(world, "nao-uuid")).ok).toBe(false);
  });

  it("outra execução (de outro plano) não pode ser batida com a identidade errada", async () => {
    const [planA, planB] = [buildPlan({ id: PLAN_A }), buildPlan({ id: PLAN_B, environment: "HML", sqls: ["comment on table public.pdb_h is 'x';"] })];
    const world = createWorld({ bundles: [planA, planB] });
    const a = await claimDbReleaseExecution(claimRequest(planA, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    const b = await claimDbReleaseExecution(claimRequest(planB, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(a.ok && b.ok).toBe(true);
    expect(await beat(world, b.execution.executionId, "worker-a")).toMatchObject({ ok: false, code: "WORKER_MISMATCH" });
    expect(await beat(world, a.execution.executionId, "worker-b")).toMatchObject({ ok: false, code: "WORKER_MISMATCH" });
  });

  it("geração errada é negada (fencing token)", async () => {
    const { world, executionId } = await claimed();
    const result = await heartbeatDbReleaseExecution({ executionId, leaseGeneration: 2 }, world.depsFor("worker-a"));
    expect(result).toMatchObject({ ok: false, outcome: "STALE", code: "LEASE_GENERATION_MISMATCH" });
    expect((await heartbeatDbReleaseExecution({ executionId, leaseGeneration: 0 }, world.depsFor("worker-a"))).code).toBe("LEASE_GENERATION_MISMATCH");
    expect((await heartbeatDbReleaseExecution({ executionId }, world.depsFor("worker-a"))).code).toBe("LEASE_GENERATION_MISMATCH");
  });

  it.each(["SUCCEEDED", "FAILED", "CANCELED"])("execução terminal %s não revive por heartbeat", async (status) => {
    const { world, executionId } = await claimed();
    world.executionStore.__setStatusForTest(executionId, status);
    const before = world.executionStore.snapshot();
    const result = await beat(world, executionId);
    expect(result).toMatchObject({ ok: false, code: "EXECUTION_TERMINAL" });
    expect(world.executionStore.snapshot()).toEqual(before);
  });

  it("heartbeat não pode mudar plano/SHA/ambiente/status/worker", async () => {
    const { world, executionId } = await claimed();
    const before = world.executionStore.snapshot();
    for (const patch of [
      { planId: PLAN_B },
      { planHash: "0".repeat(64) },
      { targetReleaseSha: "c".repeat(40) },
      { baseSha: "c".repeat(40) },
      { environment: "HML" },
      { projectRef: PROD_REF },
      { status: "MIGRATING" },
      { workerId: "worker-evil" },
      { correlationId: CORR_2 },
    ]) {
      const result = await beat(world, executionId, "worker-a", patch);
      expect(result).toMatchObject({ ok: false, code: "HEARTBEAT_BINDING_MUTATION_REJECTED" });
    }
    expect(world.executionStore.snapshot()).toEqual(before);
    world.clock.advance(10 * SEC);
    const ok = await beat(world, executionId);
    const after = world.executionStore.snapshot().executions[0];
    expect(ok.ok).toBe(true);
    expect(after).toMatchObject({
      planId: PLAN_A,
      planHash: before.executions[0].planHash,
      targetReleaseSha: before.executions[0].targetReleaseSha,
      baseSha: before.executions[0].baseSha,
      environment: "PROD",
      status: "REQUESTED",
      workerId: "worker-a",
    });
  });

  it("dependências/worker inválidos → fail-closed", async () => {
    const { world, executionId } = await claimed();
    expect((await heartbeatDbReleaseExecution({ executionId, leaseGeneration: 1 }, {})).code).toBe("CLAIM_DEPENDENCY_MISSING");
    expect((await beat(world, executionId, "")).code).toBe("WORKER_ID_INVALID");
    const unavailable = await beat(createWorld({ bundles: [buildPlan()], storeFaults: { unavailable: true } }), executionId);
    expect(unavailable.code).toBe("STORE_UNAVAILABLE");
  });
});

describe("lease expirada → ambiguidade, nunca revive nem é roubada", () => {
  it("expirada ANTES de estágio mutante → STALE (reconciliação exigida), sem retry automático", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(EXECUTOR_LEASE_TTL_SECONDS * SEC);
    const result = await beat(world, executionId);
    expect(result).toMatchObject({
      ok: false,
      outcome: "STALE",
      code: "LEASE_EXPIRED",
      reasonCode: "LEASE_EXPIRED_PRE_MUTATION",
      requiresReconciliation: true,
      autoTakeoverAllowed: false,
      autoRetryAllowed: false,
    });
  });

  it.each(["DRAINING", "BACKING_UP", "MIGRATING", "VERIFYING"])("expirada em %s → AMBIGUOUS (RECONCILIATION_REQUIRED)", async (status) => {
    const { world, executionId } = await claimed();
    world.executionStore.__setStatusForTest(executionId, status);
    world.clock.advance(500 * SEC);
    const result = await beat(world, executionId);
    expect(result).toMatchObject({ ok: false, outcome: "AMBIGUOUS", reasonCode: "LEASE_EXPIRED_AFTER_MUTATION", requiresReconciliation: true, autoRetryAllowed: false });
  });

  it("heartbeat do dono depois de expirar NÃO revive a lease", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(300 * SEC);
    const before = world.executionStore.snapshot();
    const result = await beat(world, executionId);
    expect(result.ok).toBe(false);
    expect(world.executionStore.snapshot()).toEqual(before);
    expect(world.executionStore.snapshot().executions[0].heartbeatAt).toBe(iso(NOW));
  });

  it("outro worker NÃO faz takeover de lock expirado (plano diferente)", async () => {
    const other = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_other2 is 'x';"] });
    const first = buildPlan({ id: PLAN_A });
    const world = createWorld({ bundles: [first, other] });
    const a = await claimDbReleaseExecution(claimRequest(first, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    world.clock.advance(400 * SEC);
    const stolen = await claimDbReleaseExecution(claimRequest(other, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(stolen).toMatchObject({
      ok: false,
      outcome: "STALE",
      code: "LEASE_EXPIRED",
      requiresReconciliation: true,
      autoTakeoverAllowed: false,
      executionCreated: false,
      lockAcquired: false,
    });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.locks).toHaveLength(1);
    expect(snapshot.locks[0]).toMatchObject({ executionId: a.execution.executionId, workerId: "worker-a" });
    expect(snapshot.executions).toHaveLength(1);
  });

  it("expirada pós-mutação: outro worker recebe AMBIGUOUS, sem takeover", async () => {
    const other = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_other3 is 'x';"] });
    const first = buildPlan({ id: PLAN_A });
    const world = createWorld({ bundles: [first, other] });
    const a = await claimDbReleaseExecution(claimRequest(first, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    world.executionStore.__setStatusForTest(a.execution.executionId, "MIGRATING");
    world.clock.advance(400 * SEC);
    const other2 = await claimDbReleaseExecution(claimRequest(other, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(other2).toMatchObject({ ok: false, outcome: "AMBIGUOUS", autoTakeoverAllowed: false, autoRetryAllowed: false });
    expect(world.executionStore.snapshot().locks[0].workerId).toBe("worker-a");
  });

  it("mesmo plano, nova correlação, outro worker, lease expirada: ainda negado (sem roubo)", async () => {
    const { world } = await claimed();
    world.clock.advance(400 * SEC);
    const retry = await claimDbReleaseExecution(claimRequest(buildPlan(), { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(retry).toMatchObject({ ok: false, code: "PLAN_EXECUTION_EXISTS" });
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("classifyOwnership: tabela completa de resultados", () => {
    const base = { id: "e", planId: "p", environment: "PROD", projectRef: PROD_REF, workerId: "w", leaseGeneration: 1, status: "REQUESTED", heartbeatAt: iso(NOW) };
    const lock = { executionId: "e", workerId: "w", leaseGeneration: 1, environment: "PROD", projectRef: PROD_REF };
    const at = (ms) => ({ nowMs: NOW + ms * SEC });
    const me = { workerId: "w", leaseGeneration: 1 };
    expect(classifyOwnership({ execution: base, lock, expected: me, ...at(10) }).outcome).toBe("OWNED");
    expect(classifyOwnership({ execution: base, lock, expected: { workerId: "x", leaseGeneration: 1 }, ...at(10) }).outcome).toBe("LOCKED");
    expect(classifyOwnership({ execution: base, lock, expected: { workerId: "w", leaseGeneration: 2 }, ...at(10) }).outcome).toBe("STALE");
    expect(classifyOwnership({ execution: base, lock, expected: me, ...at(130) }).outcome).toBe("STALE");
    expect(classifyOwnership({ execution: { ...base, status: "MIGRATING" }, lock, expected: me, ...at(130) }).outcome).toBe("AMBIGUOUS");
    expect(classifyOwnership({ execution: { ...base, status: "RECOVERY_REQUIRED" }, lock, expected: me, ...at(10) }).outcome).toBe("RECONCILIATION_REQUIRED");
    expect(classifyOwnership({ execution: { ...base, reconciliationRequired: true }, lock, expected: me, ...at(10) }).outcome).toBe("RECONCILIATION_REQUIRED");
    expect(classifyOwnership({ execution: base, lock: null, expected: me, ...at(10) }).outcome).toBe("RECONCILIATION_REQUIRED");
    expect(classifyOwnership({ execution: base, lock: { ...lock, executionId: "z" }, expected: me, ...at(10) }).outcome).toBe("RECONCILIATION_REQUIRED");
    expect(classifyOwnership({ execution: null, lock, ...at(10) }).reasonCode).toBe("LOCK_WITHOUT_EXECUTION");
    expect(classifyOwnership({ execution: { ...base, status: "FAILED" }, lock, expected: me, ...at(10) }).reasonCode).toBe("LOCK_HELD_BY_TERMINAL_EXECUTION");
    for (const nowMs of [10, 130]) {
      const outcome = classifyOwnership({ execution: base, lock, expected: me, ...at(nowMs) });
      expect(outcome.autoTakeoverAllowed).toBe(false);
      expect(outcome.autoRetryAllowed).toBe(false);
    }
  });
});

describe("perda de lease → RECOVERY_REQUIRED (uma vez, com auditoria canônica)", () => {
  it("pré-mutação: marca RECOVERY_REQUIRED, um evento DB_RECOVERY_REQUIRED, sem retry", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(300 * SEC);
    const flagged = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    expect(flagged).toMatchObject({
      ok: true,
      flagged: true,
      outcome: "RECONCILIATION_REQUIRED",
      requiresReconciliation: true,
      autoTakeoverAllowed: false,
      autoRetryAllowed: false,
      auditWritten: true,
    });
    expect(world.executionStore.snapshot().executions[0]).toMatchObject({ status: "RECOVERY_REQUIRED", failureCode: "LEASE_LOST_PRE_MUTATION" });
    expect(world.audit.events).toHaveLength(1);
    expect(world.audit.events[0]).toMatchObject({ eventType: "DB_RECOVERY_REQUIRED", executionId, planId: PLAN_A });
    expect(world.audit.events[0].metadata).toMatchObject({ autoRetry: false, afterMutation: false });
  });

  it("repetir a varredura não duplica evento nem transição", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(300 * SEC);
    await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    const again = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    expect(again).toMatchObject({ ok: true, flagged: false, alreadyFlagged: true, auditWritten: false });
    expect(world.audit.events).toHaveLength(1);
    expect(world.executionStore.counters.transitionWrites).toBe(1);
  });

  it("pós-mutação: AMBIGUOUS com failureCode LEASE_LOST_AFTER_MUTATION", async () => {
    const { world, executionId } = await claimed();
    world.executionStore.__setStatusForTest(executionId, "MIGRATING");
    world.clock.advance(300 * SEC);
    const flagged = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    expect(flagged).toMatchObject({ ok: true, flagged: true, outcome: "AMBIGUOUS", requiresReconciliation: true });
    expect(world.executionStore.snapshot().executions[0]).toMatchObject({ status: "RECOVERY_REQUIRED", failureCode: "LEASE_LOST_AFTER_MUTATION" });
    expect(world.audit.events[0].metadata.afterMutation).toBe(true);
  });

  it("lease válida: nada é marcado e nenhum evento é emitido", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(60 * SEC);
    const result = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    expect(result).toMatchObject({ ok: true, flagged: false, outcome: "OWNED" });
    expect(world.audit.events).toEqual([]);
    expect(world.executionStore.snapshot().executions[0].status).toBe("REQUESTED");
  });

  it("depois de marcado: heartbeat e novo claim ficam bloqueados (ambiguidade bloqueia progresso)", async () => {
    const other = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_other4 is 'x';"] });
    const first = buildPlan({ id: PLAN_A });
    const world = createWorld({ bundles: [first, other] });
    const a = await claimDbReleaseExecution(claimRequest(first, { correlationId: CORR_1 }), world.depsFor("worker-a"));
    world.clock.advance(300 * SEC);
    await flagDbReleaseLeaseLoss({ executionId: a.execution.executionId }, world.depsFor("observer"));
    const heartbeat = await beat(world, a.execution.executionId);
    expect(heartbeat).toMatchObject({ ok: false, outcome: "RECONCILIATION_REQUIRED" });
    const blocked = await claimDbReleaseExecution(claimRequest(other, { correlationId: CORR_2 }), world.depsFor("worker-b"));
    expect(blocked).toMatchObject({ ok: false, outcome: "RECONCILIATION_REQUIRED", executionCreated: false, autoRetryAllowed: false });
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
  });

  it("auditoria só usa tipos do contrato da migration 160; sink ausente/falhando não quebra", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(300 * SEC);
    const failing = { append: async () => { throw new Error("audit down"); } };
    const result = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer", { audit: failing }));
    expect(result).toMatchObject({ ok: true, flagged: true, auditWritten: false });
    const bare = await claimed();
    bare.world.clock.advance(300 * SEC);
    const noSink = await flagDbReleaseLeaseLoss({ executionId: bare.executionId }, bare.world.depsFor("observer", { audit: null }));
    expect(noSink).toMatchObject({ ok: true, flagged: true, auditWritten: false });
  });

  it("execução terminal / inexistente / store indisponível", async () => {
    const { world, executionId } = await claimed();
    world.executionStore.__setStatusForTest(executionId, "SUCCEEDED");
    expect(await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"))).toMatchObject({ ok: true, flagged: false });
    expect((await flagDbReleaseLeaseLoss({ executionId: "77777777-7777-4777-8777-777777777777" }, world.depsFor("observer"))).code).toBe("EXECUTION_NOT_FOUND");
    expect((await flagDbReleaseLeaseLoss({ executionId: "x" }, world.depsFor("observer"))).ok).toBe(false);
    const down = createWorld({ bundles: [buildPlan()], storeFaults: { unavailable: true } });
    expect((await flagDbReleaseLeaseLoss({ executionId }, down.depsFor("observer"))).code).toBe("STORE_UNAVAILABLE");
  });

  it("CAS perdido na marcação → HEARTBEAT_CONFLICT (sem evento)", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(300 * SEC);
    world.executionStore.faults.failTransition = true;
    const result = await flagDbReleaseLeaseLoss({ executionId }, world.depsFor("observer"));
    expect(result.ok).toBe(false);
    expect(world.audit.events).toEqual([]);
  });
});

describe("liberação do lock só pelo dono", () => {
  it("outro worker não libera o lock alheio", async () => {
    const { world, executionId } = await claimed({ worker: "worker-a" });
    world.executionStore.__setStatusForTest(executionId, "SUCCEEDED");
    const result = await releaseDbReleaseEnvironmentLock({ executionId, leaseGeneration: 1 }, world.depsFor("worker-b"));
    expect(result).toMatchObject({ ok: false, code: "WORKER_MISMATCH" });
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
  });

  it("dono não libera lock de execução ativa nem de FAILED/RECOVERY_REQUIRED", async () => {
    for (const status of ["REQUESTED", "MIGRATING", "FAILED", "RECOVERY_REQUIRED"]) {
      const { world, executionId } = await claimed();
      world.executionStore.__setStatusForTest(executionId, status);
      const result = await releaseDbReleaseEnvironmentLock({ executionId, leaseGeneration: 1 }, world.depsFor("worker-a"));
      expect(result).toMatchObject({ ok: false, code: "LOCK_RELEASE_NOT_ALLOWED" });
      expect(world.executionStore.snapshot().locks).toHaveLength(1);
    }
  });

  it("dono libera após SUCCEEDED/CANCELED; geração errada não", async () => {
    const { world, executionId } = await claimed();
    world.executionStore.__setStatusForTest(executionId, "SUCCEEDED");
    expect((await releaseDbReleaseEnvironmentLock({ executionId, leaseGeneration: 2 }, world.depsFor("worker-a"))).code).toBe("LEASE_GENERATION_MISMATCH");
    expect(await releaseDbReleaseEnvironmentLock({ executionId, leaseGeneration: 1 }, world.depsFor("worker-a"))).toMatchObject({ ok: true, lockReleased: true });
    expect(world.executionStore.snapshot().locks).toEqual([]);
    expect((await releaseDbReleaseEnvironmentLock({ executionId, leaseGeneration: 1 }, world.depsFor("worker-a"))).ok).toBe(false);
  });

  it("requests inválidos", async () => {
    const { world } = await claimed();
    expect((await releaseDbReleaseEnvironmentLock({}, world.depsFor())).code).toBe("CLAIM_REQUEST_INVALID");
    expect((await releaseDbReleaseEnvironmentLock({ executionId: "77777777-7777-4777-8777-777777777777", leaseGeneration: 1 }, world.depsFor())).code).toBe("EXECUTION_NOT_FOUND");
  });
});

describe("readiness — LOCK_ACQUIRED / EXECUTOR_HEALTHY", () => {
  function ownershipEvidence(overrides = {}) {
    const execution = {
      id: "e1", planId: PLAN_A, environment: "PROD", projectRef: PROD_REF, workerId: "worker-a",
      leaseGeneration: 1, status: "REQUESTED", heartbeatAt: iso(NOW),
    };
    const lock = {
      lockKey: `DB_RELEASE:PROD:${PROD_REF}`, environment: "PROD", projectRef: PROD_REF, executionId: "e1",
      planId: PLAN_A, workerId: "worker-a", leaseGeneration: 1, acquiredAt: iso(NOW),
    };
    return {
      ok: true,
      evaluatedAt: iso(NOW),
      expected: { executionId: "e1", workerId: "worker-a", leaseGeneration: 1, planId: PLAN_A, environment: "PROD", projectRef: PROD_REF },
      execution,
      lock,
      ...overrides,
    };
  }
  const nowMs = NOW + 10 * SEC;
  const lockGate = (evidence, at = nowMs) => deriveLockAcquiredGate(evidence, { nowMs: at });
  const healthGate = (evidence, at = nowMs) => deriveExecutorHealthyGate(evidence, { nowMs: at });

  it("LOCK_ACQUIRED: dono válido → VERIFIED", () => {
    const gate = lockGate(ownershipEvidence());
    expect(gate).toMatchObject({ key: "LOCK_ACQUIRED", status: "VERIFIED", reasonCode: "LOCK_ACQUIRED" });
    expect(Date.parse(gate.expiresAt)).toBeLessThanOrEqual(nowMs + EXECUTION_EVIDENCE_FRESHNESS_MS);
  });

  it("LOCK_ACQUIRED: lock ausente → PENDING; evidência indisponível/incompleta → UNKNOWN", () => {
    expect(lockGate(ownershipEvidence({ lock: null }))).toMatchObject({ status: "PENDING", reasonCode: "LOCK_NOT_ACQUIRED" });
    expect(lockGate({ ok: false, errorCode: "STORE_UNAVAILABLE" }).status).toBe("UNKNOWN");
    expect(lockGate(null).status).toBe("UNKNOWN");
    expect(lockGate(ownershipEvidence({ expected: null })).status).toBe("UNKNOWN");
  });

  it("LOCK_ACQUIRED: outro dono → BLOCKED (execução ou worker diferentes)", () => {
    const base = ownershipEvidence();
    expect(lockGate(ownershipEvidence({ lock: { ...base.lock, executionId: "e2" } }))).toMatchObject({ status: "BLOCKED", reasonCode: "LOCK_OWNER_MISMATCH" });
    expect(lockGate(ownershipEvidence({ lock: { ...base.lock, workerId: "worker-b" } }))).toMatchObject({ status: "BLOCKED", reasonCode: "LOCK_OWNER_MISMATCH" });
  });

  it("LOCK_ACQUIRED: binding divergente (ambiente/projeto/plano/geração) → BLOCKED", () => {
    const base = ownershipEvidence();
    for (const patch of [{ environment: "HML" }, { projectRef: "z".repeat(20) }, { planId: PLAN_B }, { leaseGeneration: 2 }]) {
      expect(lockGate(ownershipEvidence({ lock: { ...base.lock, ...patch } }))).toMatchObject({ status: "BLOCKED", reasonCode: "LOCK_BINDING_MISMATCH" });
    }
    expect(lockGate(ownershipEvidence({ execution: { ...base.execution, planId: PLAN_B } }))).toMatchObject({ status: "BLOCKED", reasonCode: "EXECUTION_BINDING_MISMATCH" });
    expect(lockGate(ownershipEvidence({ execution: null }))).toMatchObject({ status: "BLOCKED", reasonCode: "LOCK_WITHOUT_EXECUTION" });
  });

  it("LOCK_ACQUIRED: lease expirada → STALE (pré-mutação) / BLOCKED (ambígua)", () => {
    expect(lockGate(ownershipEvidence(), NOW + 200 * SEC)).toMatchObject({ status: "STALE", reasonCode: "LEASE_EXPIRED_PRE_MUTATION" });
    const migrating = ownershipEvidence();
    migrating.execution.status = "MIGRATING";
    expect(lockGate(migrating, NOW + 200 * SEC)).toMatchObject({ status: "BLOCKED", reasonCode: "LEASE_EXPIRED_AFTER_MUTATION" });
    const recovery = ownershipEvidence();
    recovery.execution.status = "RECOVERY_REQUIRED";
    expect(lockGate(recovery).status).toBe("BLOCKED");
  });

  it("EXECUTOR_HEALTHY: heartbeat fresco + dono + geração → VERIFIED", () => {
    expect(healthGate(ownershipEvidence())).toMatchObject({ key: "EXECUTOR_HEALTHY", status: "VERIFIED", reasonCode: "EXECUTOR_HEALTHY" });
  });

  it("EXECUTOR_HEALTHY: heartbeat vencido → STALE; ambíguo → BLOCKED", () => {
    expect(healthGate(ownershipEvidence(), NOW + 121 * SEC)).toMatchObject({ status: "STALE" });
    const running = ownershipEvidence();
    running.execution.status = "BACKING_UP";
    expect(healthGate(running, NOW + 121 * SEC)).toMatchObject({ status: "BLOCKED" });
  });

  it("EXECUTOR_HEALTHY: ownership divergente → BLOCKED; sem execução → PENDING", () => {
    const base = ownershipEvidence();
    expect(healthGate(ownershipEvidence({ execution: { ...base.execution, workerId: "worker-b" } }))).toMatchObject({ status: "BLOCKED", reasonCode: "EXECUTOR_OWNERSHIP_MISMATCH" });
    expect(healthGate(ownershipEvidence({ execution: { ...base.execution, id: "e2" } })).status).toBe("BLOCKED");
    expect(healthGate(ownershipEvidence({ execution: { ...base.execution, leaseGeneration: 2 } }))).toMatchObject({ status: "BLOCKED", reasonCode: "LEASE_GENERATION_MISMATCH" });
    expect(healthGate(ownershipEvidence({ execution: null }))).toMatchObject({ status: "PENDING", reasonCode: "EXECUTOR_NOT_STARTED" });
  });

  it("'processo existe' ≠ saudável: sem heartbeat nunca é VERIFIED", () => {
    const evidence = ownershipEvidence();
    evidence.execution.heartbeatAt = null;
    expect(healthGate(evidence).status).not.toBe("VERIFIED");
    expect(lockGate(evidence).status).not.toBe("VERIFIED");
  });

  it("deriveExecutionGates: ausente → [] (placeholder UNKNOWN permanece)", () => {
    expect(deriveExecutionGates(undefined, { nowMs })).toEqual([]);
    expect(deriveExecutionGates(ownershipEvidence(), { nowMs }).map((gate) => gate.key)).toEqual(["LOCK_ACQUIRED", "EXECUTOR_HEALTHY"]);
  });

  it("integração: claim real → evidência de posse → gates VERIFIED, mas overall ready=false", async () => {
    const { world, executionId } = await claimed();
    world.clock.advance(20 * SEC);
    const evidence = await collectExecutionOwnershipEvidence(
      { executionId, leaseGeneration: 1, planId: PLAN_A, environment: "PROD" },
      world.depsFor("worker-a"),
    );
    expect(evidence).toMatchObject({ ok: true, expected: { workerId: "worker-a", projectRef: PROD_REF } });
    const snapshot = buildReadinessSnapshot({ nowMs: world.clock.ms, evidence: { execution: evidence } });
    const byKey = Object.fromEntries(snapshot.gates.map((gate) => [gate.key, gate]));
    expect(byKey.LOCK_ACQUIRED.status).toBe("VERIFIED");
    expect(byKey.EXECUTOR_HEALTHY.status).toBe("VERIFIED");
    expect(snapshot.ready).toBe(false);
    expect(byKey.BACKUP_VERIFIED.status).not.toBe("VERIFIED");
    expect(byKey.LOGIN_GATE_CLOSED.status).not.toBe("VERIFIED");
  });

  it("integração: worker diferente vê o lock alheio como BLOCKED; lease vencida vira STALE", async () => {
    const { world, executionId } = await claimed({ worker: "worker-a" });
    const intruder = await collectExecutionOwnershipEvidence({ executionId, leaseGeneration: 1, planId: PLAN_A, environment: "PROD" }, world.depsFor("worker-b"));
    const blocked = buildReadinessSnapshot({ nowMs: NOW + 10 * SEC, evidence: { execution: intruder } });
    expect(blocked.gates.find((gate) => gate.key === "LOCK_ACQUIRED").status).toBe("BLOCKED");
    expect(blocked.gates.find((gate) => gate.key === "EXECUTOR_HEALTHY").status).toBe("BLOCKED");
    world.clock.advance(300 * SEC);
    const stale = await collectExecutionOwnershipEvidence({ executionId, leaseGeneration: 1, planId: PLAN_A, environment: "PROD" }, world.depsFor("worker-a"));
    const snapshot = buildReadinessSnapshot({ nowMs: world.clock.ms, evidence: { execution: stale } });
    expect(snapshot.gates.find((gate) => gate.key === "LOCK_ACQUIRED").status).toBe("STALE");
    expect(snapshot.gates.find((gate) => gate.key === "EXECUTOR_HEALTHY").status).toBe("STALE");
    expect(snapshot.ready).toBe(false);
  });

  it("coleta de evidência: falhas viram { ok:false } (→ UNKNOWN)", async () => {
    const { world, executionId } = await claimed();
    expect((await collectExecutionOwnershipEvidence({ executionId: "x" }, world.depsFor())).ok).toBe(false);
    expect((await collectExecutionOwnershipEvidence({ executionId, environment: "NOPE" }, world.depsFor())).ok).toBe(false);
    expect((await collectExecutionOwnershipEvidence({ executionId, environment: "PROD" }, {})).ok).toBe(false);
    const down = createWorld({ bundles: [buildPlan()], storeFaults: { unavailable: true } });
    const failed = await collectExecutionOwnershipEvidence({ executionId, environment: "PROD" }, down.depsFor());
    expect(failed).toMatchObject({ ok: false, errorCode: "STORE_UNAVAILABLE" });
    const snapshot = buildReadinessSnapshot({ nowMs: NOW, evidence: { execution: failed } });
    expect(snapshot.gates.find((gate) => gate.key === "LOCK_ACQUIRED").status).toBe("UNKNOWN");
  });
});
