import { describe, expect, it } from "vitest";
import { requestImmediateDbReleaseExecution, claimDbReleaseExecution } from "../../server/db-release-executor-claim.js";
import { deriveScheduledAttemptCorrelationId } from "../../server/db-release-executor-contract.js";
import { SCHEDULER_OUTCOMES, runDbReleaseSchedulerIteration } from "../../server/db-release-scheduler.js";
import {
  CORR_1,
  MIN,
  NOW,
  PLAN_A,
  PLAN_B,
  SEC,
  buildPlan,
  claimRequest,
  createWorld,
  iso,
  publicPlanFrom,
} from "./helpers/db-release-executor-fixtures.js";
import { isUuid } from "../../server/db-backup-contract.js";

function dueBundle(overrides = {}) {
  return buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW - 2 * MIN), ...overrides });
}

function sourceFor(bundle) {
  const calls = { count: 0, nowIso: [] };
  return {
    calls,
    async findDueScheduledPlan({ nowIso }) {
      calls.count += 1;
      calls.nowIso.push(nowIso);
      return { ok: true, plan: bundle ? publicPlanFrom(bundle) : null };
    },
  };
}

function schedulerDeps(world, bundle, workerId = "sched-1", extra = {}) {
  return { ...world.depsFor(workerId), planSource: sourceFor(bundle), ...extra };
}

describe("scheduler — uma iteração, sem cron/timer", () => {
  it("plano agendado devido → CLAIMED pelo claim service (execução REQUESTED, lock, sem mutação)", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const deps = schedulerDeps(world, bundle);
    const result = await runDbReleaseSchedulerIteration(deps);
    expect(result).toMatchObject({
      ok: true,
      outcome: "CLAIMED",
      planId: PLAN_A,
      backupTriggered: false,
      maintenanceStarted: false,
      migrationApplied: false,
    });
    expect(result.claim).toMatchObject({ ok: true, outcome: "OWNED", migrationAuthorized: false, globalReady: false });
    expect(result.claim.execution.status).toBe("REQUESTED");
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(deps.planSource.calls.count).toBe(1);
    expect(deps.planSource.calls.nowIso[0]).toBe(iso(NOW));
  });

  it("nada devido → NO_DUE_PLAN, sem tocar em store/lock/coletor", async () => {
    const world = createWorld({ bundles: [buildPlan()] });
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, null));
    expect(result).toMatchObject({ ok: true, outcome: "NO_DUE_PLAN" });
    expect(world.executionStore.snapshot()).toEqual({ executions: [], locks: [] });
    expect(world.collectEvidence.calls.count).toBe(0);
  });

  it("re-invocação para o mesmo plano devido: ALREADY_CLAIMED, sem duplicar execução/lock/evento", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const first = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-1"));
    const again = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-1"));
    const otherWorker = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-2"));
    expect(first.outcome).toBe("CLAIMED");
    expect(again).toMatchObject({ ok: true, outcome: "ALREADY_CLAIMED", correlationId: first.correlationId });
    expect(otherWorker).toMatchObject({ ok: true, outcome: "ALREADY_CLAIMED", correlationId: first.correlationId });
    const snapshot = world.executionStore.snapshot();
    expect(snapshot.executions).toHaveLength(1);
    expect(snapshot.locks).toHaveLength(1);
    expect(snapshot.executions[0].workerId).toBe("sched-1");
    expect(world.executionStore.counters.claimWrites).toBe(1);
    expect(world.audit.events).toEqual([]);
  });

  it("invocações concorrentes do scheduler: exatamente uma vence", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const results = await Promise.all([
      runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-1")),
      runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-2")),
      runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-3")),
    ]);
    expect(results.filter((item) => item.outcome === "CLAIMED")).toHaveLength(1);
    expect(results.filter((item) => item.outcome === "ALREADY_CLAIMED")).toHaveLength(2);
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("antes da janela → NOT_DUE; janela expirada → SCHEDULE_WINDOW_EXPIRED; agenda inválida → SCHEDULE_INVALID (nenhum claim tentado)", async () => {
    for (const [scheduledAt, outcome] of [
      [iso(NOW + MIN), "NOT_DUE"],
      [iso(NOW - 16 * MIN), "SCHEDULE_WINDOW_EXPIRED"],
      [null, "SCHEDULE_INVALID"],
    ]) {
      const bundle = dueBundle({ scheduledAt });
      const world = createWorld({ bundles: [bundle] });
      const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
      expect(result).toMatchObject({ ok: false, outcome });
      expect(world.collectEvidence.calls.count).toBe(0);
      expect(world.executionStore.snapshot()).toEqual({ executions: [], locks: [] });
    }
  });

  it("relógio do servidor decide: o mesmo plano vira devido quando T avança", async () => {
    const bundle = dueBundle({ scheduledAt: iso(NOW + 30 * SEC) });
    const world = createWorld({ bundles: [bundle] });
    expect((await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle))).outcome).toBe("NOT_DUE");
    world.clock.advance(30 * SEC);
    expect((await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle))).outcome).toBe("CLAIMED");
  });

  it("uma única tentativa de claim por iteração, mesmo se negada (sem retry)", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle], collectorOptions: { hml: "UNKNOWN" } });
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(result).toMatchObject({ ok: false, outcome: "CLAIM_DENIED", code: "CLAIMABLE_NOT_SATISFIED" });
    expect(world.collectEvidence.calls.count).toBe(1);
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("revalida no instante T: plano mudou entre a listagem e o claim (drift) → negado", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    world.planStore.__patchRow(PLAN_A, { readiness_generation: 99 });
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(result).toMatchObject({ ok: false, outcome: "CLAIM_DENIED", code: "APPROVAL_STALE" });
    const cancelled = createWorld({ bundles: [bundle] });
    cancelled.planStore.__patchRow(PLAN_A, { status: "CANCELED" });
    expect((await runDbReleaseSchedulerIteration(schedulerDeps(cancelled, bundle))).code).toBe("PLAN_STATUS_INVALID");
  });

  it("ambiente ocupado por outra execução: CLAIM_BLOCKED, sem roubar o lock", async () => {
    const running = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_running is 'x';"] });
    const bundle = dueBundle();
    const world = createWorld({ bundles: [running, bundle] });
    const held = await claimDbReleaseExecution(claimRequest(running, { correlationId: CORR_1 }), world.depsFor("worker-x"));
    expect(held.ok).toBe(true);
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(result).toMatchObject({ ok: false, outcome: "CLAIM_BLOCKED", code: "LOCK_UNAVAILABLE" });
    expect(world.executionStore.snapshot().locks[0].workerId).toBe("worker-x");
  });

  it("lease do dono anterior expirou: CLAIM_BLOCKED (STALE), nunca takeover", async () => {
    const running = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_running2 is 'x';"] });
    const bundle = dueBundle();
    const world = createWorld({ bundles: [running, bundle] });
    await claimDbReleaseExecution(claimRequest(running, { correlationId: CORR_1 }), world.depsFor("worker-x"));
    world.clock.advance(10 * MIN);
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(result).toMatchObject({ ok: false, outcome: "CLAIM_BLOCKED" });
    expect(result.claim).toMatchObject({ outcome: "STALE", autoTakeoverAllowed: false });
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });

  it("fonte indisponível / dependências ausentes → fail-closed", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const broken = { findDueScheduledPlan: async () => { throw new Error("db down"); } };
    expect(await runDbReleaseSchedulerIteration({ ...world.depsFor(), planSource: broken })).toMatchObject({ ok: false, outcome: "SOURCE_UNAVAILABLE" });
    const notOk = { findDueScheduledPlan: async () => ({ ok: false }) };
    expect((await runDbReleaseSchedulerIteration({ ...world.depsFor(), planSource: notOk })).outcome).toBe("SOURCE_UNAVAILABLE");
    expect((await runDbReleaseSchedulerIteration({})).outcome).toBe("DEPENDENCY_MISSING");
    expect((await runDbReleaseSchedulerIteration({ ...world.depsFor(), planSource: sourceFor(bundle), clock: { nowMs: () => NaN } })).outcome).toBe("DEPENDENCY_MISSING");
    expect(world.executionStore.snapshot().executions).toEqual([]);
  });

  it("vocabulário de resultados do scheduler é fechado", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const result = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(SCHEDULER_OUTCOMES).toContain(result.outcome);
  });
});

describe("scheduler — imediato e agendado convergem no claim", () => {
  it("execução imediata e agendada disputam o MESMO lock de ambiente", async () => {
    const immediate = buildPlan({ id: PLAN_B, sqls: ["comment on table public.pdb_imm is 'x';"] });
    const scheduled = dueBundle();
    const world = createWorld({ bundles: [immediate, scheduled] });
    const [imm, sched] = await Promise.all([
      requestImmediateDbReleaseExecution((({ intent, ...rest }) => { void intent; return rest; })(claimRequest(immediate, { correlationId: CORR_1 })), world.depsFor("api-1")),
      runDbReleaseSchedulerIteration(schedulerDeps(world, scheduled, "sched-1")),
    ]);
    expect([imm.ok, sched.ok].filter(Boolean)).toHaveLength(1);
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
    expect(world.executionStore.snapshot().locks).toHaveLength(1);
  });
});

describe("scheduler — correlação determinística por tentativa", () => {
  const base = { planId: PLAN_A, planHash: "a".repeat(64), scheduledAt: iso(NOW), readinessGeneration: 3 };

  it("mesma tentativa → mesma correlação (UUID v5-like válido)", () => {
    const one = deriveScheduledAttemptCorrelationId(base);
    expect(one).toBe(deriveScheduledAttemptCorrelationId(base));
    expect(isUuid(one)).toBe(true);
    expect(one[14]).toBe("5");
  });

  it("nova tentativa/geração/agenda/hash/plano → correlação nova", () => {
    const one = deriveScheduledAttemptCorrelationId(base);
    const others = [
      deriveScheduledAttemptCorrelationId({ ...base, attempt: 2 }),
      deriveScheduledAttemptCorrelationId({ ...base, readinessGeneration: 4 }),
      deriveScheduledAttemptCorrelationId({ ...base, scheduledAt: iso(NOW + MIN) }),
      deriveScheduledAttemptCorrelationId({ ...base, planHash: "b".repeat(64) }),
      deriveScheduledAttemptCorrelationId({ ...base, planId: PLAN_B }),
    ];
    for (const other of others) expect(other).not.toBe(one);
    expect(new Set(others).size).toBe(others.length);
  });

  it("nova tentativa agendada (attempt=2) só passa quando o ciclo de vida permite", async () => {
    const bundle = dueBundle();
    const world = createWorld({ bundles: [bundle] });
    const first = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle));
    expect(first.outcome).toBe("CLAIMED");
    const retry = await runDbReleaseSchedulerIteration(schedulerDeps(world, bundle, "sched-1", { attempt: 2 }));
    expect(retry).toMatchObject({ ok: false, outcome: "CLAIM_DENIED", code: "PLAN_EXECUTION_EXISTS" });
    expect(retry.correlationId).not.toBe(first.correlationId);
    expect(world.executionStore.snapshot().executions).toHaveLength(1);
  });
});
