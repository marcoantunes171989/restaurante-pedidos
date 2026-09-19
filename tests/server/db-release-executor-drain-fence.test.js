import { describe, expect, it } from "vitest";
import {
  abortDbReleaseExecution,
  evaluateDbReleaseExecutionStage,
  runDbReleaseExecution,
} from "../../server/db-release-executor.js";
import {
  DRAIN_TIMEOUT_MAX_MS,
  DRAIN_TIMEOUT_MIN_MS,
  DRAIN_TIMEOUT_MS,
  DRAIN_TIMEOUT_SECONDS,
  resolveDrainTimeoutMs,
} from "../../server/db-release-pipeline-contract.js";
import { MIN, SEC, createPipelineWorld } from "./helpers/db-release-pipeline-fixtures.js";

const run = (world, deps = world.depsFor()) => runDbReleaseExecution(world.request(), deps);
const has = (world, entry) => world.log.includes(entry);
const blockerKeys = (result) => result.blockers.map((item) => item.key);

/** Worker fiel: reinvoca a cada retryAfterMs (cada invocação renova a lease). */
async function pollUntilSettled(world, { maxTicks = 60 } = {}) {
  let result = await run(world);
  for (let tick = 0; tick < maxTicks && result.outcome === "WAITING_DRAIN"; tick += 1) {
    world.clock.advance(result.retryAfterMs);
    result = await run(world);
  }
  return result;
}

function expectProtected(world) {
  expect(world.maintenance.state.loginGate).toBe("CLOSED");
  expect(world.maintenance.calls).not.toContain("openLoginGate");
  expect(world.locks()).toHaveLength(1);
}

describe("I2C2 — drain de sessões canônicas (I1B)", () => {
  it("alive > 0: nunca QUIESCENT, nunca backup; login CLOSED", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 2;
    const result = await run(world);
    expect(result).toMatchObject({ ok: true, outcome: "WAITING_DRAIN", stage: "DRAIN" });
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(blockerKeys(result)).toContain("ACTIVE_SESSION_COUNT_ZERO");
    expect(has(world, "phase:DRAINING")).toBe(true);
    expect(has(world, "phase:QUIESCENT")).toBe(false);
    expect(has(world, "backup:create")).toBe(false);
    expect(world.migration.calls.apply).toBe(0);
    expectProtected(world);
  });

  it("heartbeat após o fechamento do gate > 0: não conta como zero → sem QUIESCENT", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.heartbeatAfterClose = 1;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(blockerKeys(result)).toContain("ACTIVE_SESSION_COUNT_ZERO");
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("prova de sessão VENCIDA: sem QUIESCENT", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.proofAgeMs = 2 * MIN;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "ACTIVE_SESSION_COUNT_ZERO")).toMatchObject({ status: "STALE" });
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("prova de OUTRA geração de manutenção: sem QUIESCENT", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.proofGenerationOffset = 1;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "ACTIVE_SESSION_COUNT_ZERO")).toMatchObject({
      status: "STALE",
      reasonCode: "SESSION_PROOF_GENERATION_MISMATCH",
    });
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("prova indisponível: UNKNOWN bloqueia", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.sessionUnavailable = true;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "ACTIVE_SESSION_COUNT_ZERO").status).toBe("UNKNOWN");
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("re-entrada quando a prova fecha: RETOMA (sem repetir NOTICE/FENCING/DRAINING) e conclui", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    expect((await run(world)).outcome).toBe("WAITING_DRAIN");
    world.clock.advance(20 * SEC);
    world.probes.cfg.alive = 0;
    const result = await run(world);
    expect(result.outcome).toBe("SUCCEEDED");
    const phases = world.log.filter((entry) => entry.startsWith("phase:"));
    expect(phases.filter((entry) => entry === "phase:NOTICE")).toHaveLength(1);
    expect(phases.filter((entry) => entry === "phase:FENCING")).toHaveLength(1);
    expect(phases.filter((entry) => entry === "phase:DRAINING")).toHaveLength(1);
    expect(world.log.filter((entry) => entry === "maintenance:closeLoginGate")).toHaveLength(1);
    expect(world.planTransitions.filter((item) => item.to === "RUNNING")).toHaveLength(1);
    expect(world.auditTypes().filter((type) => type === "SESSION_DRAIN_STARTED")).toHaveLength(1);
    expect(world.auditTypes().filter((type) => type === "LOGIN_GATE_CLOSED")).toHaveLength(1);
  });
});

describe("I2C2 — timeout de drain (limitado, fail-closed)", () => {
  it("constantes: 300s = TTL máx. de operação (180s) + TTL de sessão (120s); política limitada", () => {
    expect(DRAIN_TIMEOUT_SECONDS).toBe(300);
    expect(DRAIN_TIMEOUT_MS).toBe(300_000);
    expect(resolveDrainTimeoutMs({})).toBe(DRAIN_TIMEOUT_MS);
    expect(resolveDrainTimeoutMs({ drainTimeoutMs: 90_000 })).toBe(90_000);
    expect(resolveDrainTimeoutMs({ drainTimeoutMs: DRAIN_TIMEOUT_MIN_MS - 1 })).toBe(DRAIN_TIMEOUT_MS);
    expect(resolveDrainTimeoutMs({ drainTimeoutMs: DRAIN_TIMEOUT_MAX_MS + 1 })).toBe(DRAIN_TIMEOUT_MS);
    expect(resolveDrainTimeoutMs({ drainTimeoutMs: Number.POSITIVE_INFINITY })).toBe(DRAIN_TIMEOUT_MS);
  });

  it("estourou: NÃO segue para backup; FAILED; login CLOSED; fence ativo; lock retido; sem restore", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    const result = await pollUntilSettled(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "DRAIN_TIMEOUT", loginGateReopened: false, unwindAvailable: true });
    expect(has(world, "backup:create")).toBe(false);
    expect(world.migration.calls.apply).toBe(0);
    expect(world.maintenance.state.phase).toBe("FAILED");
    expect(world.execRecord()).toMatchObject({ status: "FAILED", failureCode: "DRAIN_TIMEOUT" });
    expect(await world.planStatus()).toBe("FAILED");
    expectProtected(world);
    expect(world.stepStore.snapshot().find((step) => step.stepType === "DRAIN")).toMatchObject({ status: "FAILED", errorCode: "DRAIN_TIMEOUT" });
    // nova invocação não "continua": execução é terminal
    expect((await run(world)).outcome).toBe("ALREADY_TERMINAL");
  });

  it("worker que some por > TTL da lease (120s) NÃO retoma: LEASE_LOST → RECOVERY_REQUIRED (sem takeover)", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    expect((await run(world)).outcome).toBe("WAITING_DRAIN");
    world.clock.advance(DRAIN_TIMEOUT_MS + 1 * SEC);
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "LEASE_LOST", requiresReconciliation: true, autoTakeoverAllowed: false });
    expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
    expect(has(world, "backup:create")).toBe(false);
    expectProtected(world);
  });

  it("timeout configurável respeitado (90s)", async () => {
    const world = await createPipelineWorld({ policy: { drainTimeoutMs: 90_000 } });
    world.probes.cfg.alive = 1;
    expect((await pollUntilSettled(world)).code).toBe("DRAIN_TIMEOUT");
    expect(world.clock.nowMs() - Date.UTC(2026, 8, 18, 19, 0, 0)).toBeLessThan(DRAIN_TIMEOUT_MS);
  });

  it("depois do timeout, o unwind controlado é o caminho seguro (NORMAL, login OPEN, lock liberado)", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    expect((await pollUntilSettled(world)).code).toBe("DRAIN_TIMEOUT");
    const aborted = await abortDbReleaseExecution(world.request(), world.depsFor());
    expect(aborted).toMatchObject({ ok: true, outcome: "CANCELED", lockReleased: true, migrationMutationOccurred: false });
    expect(world.maintenance.state).toMatchObject({ phase: "NORMAL", loginGate: "OPEN" });
    expect(world.execRecord().status).toBe("CANCELED");
    expect(world.locks()).toHaveLength(0);
    expect(await world.planStatus()).toBe("FAILED");
    expect(has(world, "backup:create")).toBe(false);
  });
});

describe("I2C2 — in-flight autoritativo", () => {
  it("in-flight > 0: sem QUIESCENT", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.inFlight = 3;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "IN_FLIGHT_OPERATION_COUNT_ZERO").status).toBe("BLOCKED");
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("cobertura do registry INCOMPLETA: zero de registry parcial NÃO é zero → sem QUIESCENT", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.inFlight = 0;
    world.probes.cfg.inFlightCoverageComplete = false;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "IN_FLIGHT_OPERATION_COUNT_ZERO")).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "IN_FLIGHT_COVERAGE_INCOMPLETE",
    });
    expect(has(world, "phase:QUIESCENT")).toBe(false);
  });

  it("evidência desconhecida (registry indisponível): sem backup", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.inFlightUnavailable = true;
    const result = await run(world);
    expect(result.outcome).toBe("WAITING_DRAIN");
    expect(result.blockers.find((item) => item.key === "IN_FLIGHT_OPERATION_COUNT_ZERO").status).toBe("UNKNOWN");
    expect(has(world, "backup:create")).toBe(false);
  });

  it("mesmo com o adapter dizendo coverageComplete=true, cobertura de escrita incompleta derruba o zero", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.inFlightCoverageComplete = true;
    // cobertura completa até o fence; depois regride (ex.: novo caminho de escrita sem guard)
    const originalFence = world.maintenance.fence.bind(world.maintenance);
    world.maintenance.fence = async (args) => {
      const fenced = await originalFence(args);
      world.probes.cfg.coverage = "CURRENT_CODE";
      return fenced;
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "WRITE_FENCE_COVERAGE_INCOMPLETE" });
    expect(has(world, "phase:DRAINING")).toBe(false);
  });
});

describe("I2C2 — write fence: evidência + cobertura", () => {
  it("fence pedido mas NÃO efetivo: não passa de FENCING (sem DRAINING/QUIESCENT); login CLOSED", async () => {
    const world = await createPipelineWorld({ maintenanceFaults: { fenceNotEffective: true } });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "WRITE_FENCE_NOT_VERIFIED" });
    expect(has(world, "phase:DRAINING")).toBe(false);
    expect(has(world, "phase:QUIESCENT")).toBe(false);
    expect(has(world, "backup:create")).toBe(false);
    expectProtected(world);
  });

  it("cobertura incompleta desde o início: bloqueia ANTES de causar indisponibilidade", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.coverage = "CURRENT_CODE";
    const result = await run(world);
    expect(result).toMatchObject({
      ok: false,
      outcome: "BLOCKED_BEFORE_MAINTENANCE",
      code: "WRITE_FENCE_COVERAGE_INCOMPLETE",
      maintenanceMutated: false,
    });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.maintenance.state).toMatchObject({ phase: "NORMAL", loginGate: "OPEN" });
    expect(world.execRecord().status).toBe("CANCELED");
    expect(world.locks()).toHaveLength(0);
    expect(await world.planStatus()).toBe("APPROVED");
  });

  it("login gate que não fecha: FAILED sem seguir para drain", async () => {
    const world = await createPipelineWorld({ maintenanceFaults: { loginGateStaysOpen: true } });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "LOGIN_GATE_CLOSE_FAILED" });
    expect(has(world, "phase:DRAINING")).toBe(false);
  });

  it("login fecha DEPOIS do fence e antes do drain, e segue CLOSED em toda falha", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    await run(world);
    const { log } = world;
    expect(log.indexOf("phase:FENCING")).toBeLessThan(log.indexOf("maintenance:closeLoginGate"));
    expect(log.indexOf("maintenance:closeLoginGate")).toBeLessThan(log.indexOf("phase:DRAINING"));
    expect(world.maintenance.state.loginGate).toBe("CLOSED");
  });

  it("READY_TO_BACKUP: cobertura incompleta bloqueia; cobertura completa sintética libera", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1; // para em DRAINING, com fence ativo
    await run(world);

    world.probes.cfg.alive = 0;
    const complete = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_BACKUP" });
    expect(complete.satisfied).toBe(true);
    expect(complete.globalReady).toBe(false); // BACKUP_VERIFIED ainda não existe
    expect(complete.requiredGates).toHaveLength(15);

    world.probes.cfg.coverage = "CURRENT_CODE";
    const incomplete = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_BACKUP" });
    expect(incomplete.satisfied).toBe(false);
    expect(incomplete.blockers.map((item) => item.key)).toEqual(expect.arrayContaining(["WRITE_FENCE_ACTIVE", "IN_FLIGHT_OPERATION_COUNT_ZERO"]));
    expect(incomplete.blockers.find((item) => item.key === "WRITE_FENCE_ACTIVE").reasonCode).toBe("WRITE_FENCE_COVERAGE_INCOMPLETE");
  });

  it("READY_TO_BACKUP NÃO exige BACKUP_VERIFIED; READY_TO_QUIESCE não exige fence/sessões", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    await run(world);
    const quiesce = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_QUIESCE" });
    expect(quiesce.requiredGates).toHaveLength(11);
    expect(quiesce.requiredGates).not.toContain("WRITE_FENCE_ACTIVE");
    expect(quiesce.requiredGates).not.toContain("BACKUP_VERIFIED");
    const backup = await evaluateDbReleaseExecutionStage(world.request(), world.depsFor(), { stage: "READY_TO_BACKUP" });
    expect(backup.requiredGates).not.toContain("BACKUP_VERIFIED");
  });
});
