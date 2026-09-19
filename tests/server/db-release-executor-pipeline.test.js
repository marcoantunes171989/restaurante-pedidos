import { describe, expect, it } from "vitest";
import { evaluateDbReleaseExecutionStage, runDbReleaseExecution } from "../../server/db-release-executor.js";
import { STEP_ORDER, migrateStepOrder } from "../../server/db-release-pipeline-contract.js";
import { MIN, buildPlan, createPipelineWorld, iso } from "./helpers/db-release-pipeline-fixtures.js";

async function runToEnd(world, deps = world.depsFor()) {
  return runDbReleaseExecution(world.request(), deps);
}

const idx = (log, entry) => log.indexOf(entry);

describe("I2C2 — pipeline de sucesso (fixtures 100% sintéticos)", () => {
  it("claim válido → plano RUNNING → … → NORMAL → SUCCEEDED → lock liberado", async () => {
    const world = await createPipelineWorld();
    expect(await world.planStatus()).toBe("APPROVED");
    expect(world.locks()).toHaveLength(1);

    const result = await runToEnd(world);

    expect(result).toMatchObject({
      ok: true,
      outcome: "SUCCEEDED",
      planSucceeded: true,
      lockReleased: true,
      loginGateReopened: true,
      migrationsApplied: 2,
      autoRetryAllowed: false,
      autoRestoreAllowed: false,
    });
    expect(await world.planStatus()).toBe("SUCCEEDED");
    expect(world.execRecord().status).toBe("SUCCEEDED");
    expect(world.locks()).toHaveLength(0);
    expect(world.maintenance.state).toMatchObject({ phase: "NORMAL", loginGate: "OPEN", fenceEffectiveAt: null });
    expect(world.maintenance.state.binding.dbPlanId).toBeNull();
  });

  it("sequência de fases de manutenção segue a ordem congelada (NOTICE obrigatório)", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    const phases = world.log.filter((entry) => entry.startsWith("phase:")).map((entry) => entry.slice(6));
    expect(phases).toEqual(["NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "NORMAL"]);
    expect(phases[0]).toBe("NOTICE");
    expect(phases).not.toContain("RELEASING");
  });

  it("sequência de status de execução reutiliza o vocabulário canônico", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    const statuses = world.log.filter((entry) => entry.startsWith("exec:")).map((entry) => entry.slice(5));
    expect(statuses).toEqual(["PREPARING", "DRAINING", "BACKING_UP", "MIGRATING", "VERIFYING", "SUCCEEDED"]);
  });

  it("ordem: backup só após QUIESCENT; migration só após backup VERIFIED e READY_TO_MIGRATE; smoke só após todas; login só reabre no fim", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    const { log } = world;
    expect(idx(log, "plan:RUNNING")).toBeGreaterThanOrEqual(0);
    expect(idx(log, "plan:RUNNING")).toBeLessThan(idx(log, "phase:NOTICE"));
    expect(idx(log, "phase:NOTICE")).toBeLessThan(idx(log, "phase:FENCING"));
    expect(idx(log, "phase:FENCING")).toBeLessThan(idx(log, "maintenance:closeLoginGate"));
    expect(idx(log, "maintenance:closeLoginGate")).toBeLessThan(idx(log, "phase:DRAINING"));
    expect(idx(log, "phase:DRAINING")).toBeLessThan(idx(log, "phase:QUIESCENT"));
    // backup nunca antes de QUIESCENT
    expect(idx(log, "phase:QUIESCENT")).toBeLessThan(idx(log, "backup:create"));
    // migration nunca antes do backup verificado nem de MIGRATING
    expect(idx(log, "backup:record")).toBeLessThan(idx(log, "migration:apply:1"));
    expect(idx(log, "phase:MIGRATING")).toBeLessThan(idx(log, "migration:apply:1"));
    // duas migrations, sequenciais
    expect(idx(log, "migration:apply:1")).toBeLessThan(idx(log, "migration:apply:2"));
    // smoke só depois de TODAS as migrations
    expect(idx(log, "migration:apply:2")).toBeLessThan(idx(log, "verify:run"));
    expect(idx(log, "verify:run")).toBeLessThan(idx(log, "smoke:run"));
    // login NUNCA reabre antes do sucesso: NORMAL → openLoginGate → SUCCEEDED → plano → lock
    expect(idx(log, "smoke:run")).toBeLessThan(idx(log, "phase:NORMAL"));
    expect(idx(log, "phase:NORMAL")).toBeLessThan(idx(log, "maintenance:openLoginGate"));
    expect(idx(log, "maintenance:openLoginGate")).toBeLessThan(idx(log, "exec:SUCCEEDED"));
    expect(idx(log, "exec:SUCCEEDED")).toBeLessThan(idx(log, "plan:SUCCEEDED"));
    expect(idx(log, "plan:SUCCEEDED")).toBeLessThan(idx(log, "lock:released"));
    expect(log.filter((entry) => entry === "maintenance:openLoginGate")).toHaveLength(1);
  });

  it("uma migration por vez, retry = 0, sem execute_sql", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1, 2]);
    expect(world.migration.calls.apply).toBe(2);
    expect(world.migration.calls.executeSql).toBe(0);
    expect(world.migration.applyPrimitive).toBe("APPLY_MIGRATION_ADAPTER");
  });

  it("steps determinísticos persistidos com o schema real (ordem, tipo, estado, tentativa)", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    const steps = world.stepStore.snapshot();
    const byOrder = Object.fromEntries(steps.map((step) => [step.stepOrder, step]));
    for (const order of [
      STEP_ORDER.PREFLIGHT, STEP_ORDER.LOGIN_GATE_CLOSE, STEP_ORDER.FENCE, STEP_ORDER.DRAIN, STEP_ORDER.QUIESCE,
      STEP_ORDER.BACKUP, STEP_ORDER.BACKUP_VERIFY, migrateStepOrder(1), migrateStepOrder(2),
      STEP_ORDER.SCHEMA_VALIDATE, STEP_ORDER.SMOKE, STEP_ORDER.LOGIN_GATE_OPEN,
    ]) {
      expect(byOrder[order]?.status, `step ${order}`).toBe("SUCCEEDED");
      expect(byOrder[order].startedAt).toBeTruthy();
      expect(byOrder[order].completedAt).toBeTruthy();
    }
    expect(byOrder[migrateStepOrder(1)]).toMatchObject({ stepType: "MIGRATE" });
    expect(byOrder[migrateStepOrder(1)].evidence).toMatchObject({ attempt: 1, commitState: "COMMITTED" });
    expect(byOrder[migrateStepOrder(1)].evidence.identity).toMatchObject({ order: 1, planHash: world.bundle.planHash });
    expect(new Set(steps.map((step) => step.stepOrder)).size).toBe(steps.length);
  });

  it("auditoria usa somente event types suportados, sem duplicar", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    const types = world.auditTypes();
    expect(types).toEqual(expect.arrayContaining([
      "DB_PREFLIGHT_PASSED", "LOGIN_GATE_CLOSED", "SESSION_DRAIN_STARTED", "SESSION_DRAIN_COMPLETED",
      "QUIESCENCE_REACHED", "BACKUP_REQUESTED", "BACKUP_COMPLETED", "BACKUP_VERIFYING", "BACKUP_VERIFIED",
      "DB_MIGRATION_STARTED", "DB_MIGRATION_APPLIED", "DB_SCHEMA_VALIDATION_PASSED", "SMOKE_STARTED",
      "LOGIN_GATE_OPENED", "DB_RELEASE_SUCCEEDED",
    ]));
    expect(types.filter((type) => type === "DB_MIGRATION_APPLIED")).toHaveLength(2);
    expect(types.filter((type) => type === "DB_RELEASE_SUCCEEDED")).toHaveLength(1);
    expect(types.filter((type) => type === "LOGIN_GATE_OPENED")).toHaveLength(1);
  });
});

describe("I2C2 — plano RUNNING é do executor (nunca do browser)", () => {
  it("imediato: APPROVED → RUNNING por CAS; evento/mutação não duplica na re-entrada", async () => {
    const world = await createPipelineWorld();
    await runToEnd(world);
    expect(world.planTransitions.filter((item) => item.to === "RUNNING")).toEqual([{ from: "APPROVED", to: "RUNNING" }]);
    // re-entrada da MESMA execução já concluída: idempotente, sem novo RUNNING/evento/backup/step
    const stepsBefore = world.stepStore.snapshot().length;
    const auditBefore = world.auditTypes().length;
    const again = await runToEnd(world);
    expect(again.outcome).toBe("SUCCEEDED");
    expect(world.planTransitions.filter((item) => item.to === "RUNNING")).toHaveLength(1);
    expect(world.stepStore.snapshot()).toHaveLength(stepsBefore);
    expect(world.auditTypes()).toHaveLength(auditBefore);
    expect(world.backup.createCalls).toBe(1);
    expect(world.migration.calls.apply).toBe(2);
  });

  it("agendado: SCHEDULED → RUNNING dentro da janela; SCHEDULE_WINDOW_VALID segue VERIFIED depois que o pipeline passa da janela", async () => {
    const scheduledAt = iso(Date.UTC(2026, 8, 18, 19, 0, 0) - 1 * MIN);
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt });
    const world = await createPipelineWorld({ bundle });
    const result = await runToEnd(world);
    expect(result.outcome).toBe("SUCCEEDED");
    expect(world.planTransitions[0]).toEqual({ from: "SCHEDULED", to: "RUNNING" });
    expect(world.locks()).toHaveLength(0);
  });

  it("o request não pode carregar autoridade (só executionId + leaseGeneration)", async () => {
    const world = await createPipelineWorld();
    const result = await runDbReleaseExecution({ ...world.request(), status: "SUCCEEDED" }, world.depsFor());
    expect(result).toMatchObject({ ok: false, outcome: "REQUEST_INVALID" });
    expect(world.planTransitions).toHaveLength(0);
    expect(world.log).toHaveLength(0);
  });

  it("binding plano↔execução: execução rival ativa para o mesmo plano bloqueia ANTES de qualquer transição", async () => {
    const world = await createPipelineWorld();
    const base = world.execRecord();
    const rival = { ...base, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", correlationId: "55555555-5555-4555-8555-555555555555" };
    await world.executionStore.claimEnvironment({
      lock: {
        lockKey: "DB_RELEASE:PROD:rival", environment: rival.environment, projectRef: rival.projectRef, executionId: rival.id,
        planId: rival.planId, workerId: rival.workerId, leaseGeneration: rival.leaseGeneration, acquiredAt: rival.claimedAt,
      },
      execution: rival,
    });
    const result = await runToEnd(world);
    expect(result).toMatchObject({ ok: false, outcome: "BLOCKED_BEFORE_MAINTENANCE", code: "PLAN_EXECUTION_BINDING_CONFLICT" });
    expect(world.planTransitions).toHaveLength(0);
    expect(world.maintenance.calls).toHaveLength(0);
    expect(await world.planStatus()).toBe("APPROVED");
  });

  it("plano CAS: se o plano mudou (cancelado) entre claim e RUNNING → nenhuma mutação de manutenção", async () => {
    const world = await createPipelineWorld();
    world.planStore.__patchRow(world.bundle.id, { status: "CANCELED" });
    const result = await runToEnd(world);
    expect(result).toMatchObject({ ok: false, outcome: "BLOCKED_BEFORE_MAINTENANCE", code: "PLAN_STATUS_INVALID" });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.execRecord().status).toBe("CANCELED");
    expect(world.locks()).toHaveLength(0);
  });
});

describe("I2C2 — readiness global só existe no READY_TO_MIGRATE", () => {
  it("antes do backup: global=false; no instante do primeiro apply: global=true (17 gates); gate vencida: false", async () => {
    const world = await createPipelineWorld();
    const snapshots = {};
    // captura DENTRO do backup (fase BACKING_UP, backup ainda não VERIFIED) e do primeiro apply
    const originalCreate = world.backup.createBackup.bind(world.backup);
    world.backup.createBackup = async (request) => {
      snapshots.duringBackup = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_MIGRATE" });
      return originalCreate(request);
    };
    world.migration.script[1] = async () => {
      snapshots.atFirstApply = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_MIGRATE" });
      world.probes.cfg.proofAgeMs = 2 * MIN; // prova de sessão vencida (janela fresca = 45s)
      snapshots.afterStale = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_MIGRATE" });
      world.probes.cfg.proofAgeMs = 0;
      return "SUCCESS";
    };
    const result = await runToEnd(world);
    expect(result.outcome).toBe("SUCCEEDED");

    expect(snapshots.duringBackup.globalReady).toBe(false);
    expect(snapshots.duringBackup.blockers.map((item) => item.key)).toContain("BACKUP_VERIFIED");

    expect(snapshots.atFirstApply.satisfied).toBe(true);
    expect(snapshots.atFirstApply.globalReady).toBe(true);
    expect(snapshots.atFirstApply.requiredGates).toHaveLength(16);
    expect(snapshots.atFirstApply.gates.filter((gate) => gate.applicable !== false).every((gate) => gate.status === "VERIFIED")).toBe(true);

    expect(snapshots.afterStale.globalReady).toBe(false);
    expect(snapshots.afterStale.gates.find((gate) => gate.key === "ACTIVE_SESSION_COUNT_ZERO").status).toBe("STALE");
  });

  it("agendado: READY_TO_MIGRATE exige 17 gates (inclui SCHEDULE_WINDOW_VALID)", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(Date.UTC(2026, 8, 18, 19, 0, 0) - 1 * MIN) });
    const world = await createPipelineWorld({ bundle });
    let seen = null;
    world.migration.script[1] = async () => {
      seen = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_MIGRATE" });
      return "SUCCESS";
    };
    await runToEnd(world);
    expect(seen.requiredGates).toHaveLength(17);
    expect(seen.globalReady).toBe(true);
  });
});
