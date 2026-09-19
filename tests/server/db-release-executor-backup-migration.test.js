import { describe, expect, it } from "vitest";
import {
  abortDbReleaseExecution,
  reconcileDbReleaseExecution,
  runDbReleaseExecution,
} from "../../server/db-release-executor.js";
import { STEP_ORDER, migrateStepOrder } from "../../server/db-release-pipeline-contract.js";
import { MIN, OTHER_CORR, buildPlan, createPipelineWorld } from "./helpers/db-release-pipeline-fixtures.js";

const run = (world, deps = world.depsFor()) => runDbReleaseExecution(world.request(), deps);
const has = (world, entry) => world.log.includes(entry);
const abort = (world) => abortDbReleaseExecution(world.request(), world.depsFor());

const THREE_SQL = [
  "comment on table public.pdb_fixture_a is 'a';",
  "comment on table public.pdb_fixture_b is 'b';",
  "comment on table public.pdb_fixture_c is 'c';",
];

function expectStillProtected(world) {
  expect(world.maintenance.state.loginGate).toBe("CLOSED");
  expect(world.maintenance.calls).not.toContain("openLoginGate");
  expect(world.maintenance.calls).not.toContain("completeNormal");
  expect(world.maintenance.calls).not.toContain("abortToNormal");
  expect(world.locks()).toHaveLength(1);
  expect(world.maintenance.state.fenceEffectiveAt).toBeTruthy();
}

describe("I2C2 — backup (L2 lógico, correlacionado)", () => {
  it("backup nasce ligado a execução/plano/correlação/ambiente/projeto/SHA/quiescenceAt", async () => {
    const world = await createPipelineWorld();
    let seen = null;
    const original = world.backup.createBackup.bind(world.backup);
    world.backup.createBackup = async (request) => {
      seen = request;
      return original(request);
    };
    expect((await run(world)).outcome).toBe("SUCCEEDED");
    const quiesce = world.stepStore.snapshot().find((step) => step.stepOrder === STEP_ORDER.QUIESCE);
    expect(seen.mode).toBe("LOGICAL_SNAPSHOT");
    expect(seen.binding).toEqual({
      planId: world.bundle.id,
      executionId: world.executionId,
      correlationId: world.execRecord().correlationId,
      targetReleaseSha: world.bundle.targetSha,
      environment: "PROD",
      projectRef: world.execRecord().projectRef,
      quiescenceAt: quiesce.evidence.quiescenceAt,
    });
    expect(quiesce.evidence.quiescenceAt).toBe(world.maintenance.state.quiescentAt ?? quiesce.evidence.quiescenceAt);
    expect(world.backup.runs).toHaveLength(1);
    expect(world.backup.runs[0].integrity).toMatchObject({ verificationLevel: "L2", result: "VERIFIED", mode: "LOGICAL_SNAPSHOT" });
  });

  it("criação falhou (conhecida): PARA; nenhuma migration; login CLOSED; unwind disponível", async () => {
    const world = await createPipelineWorld({ backupBehavior: "FAIL" });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "BACKUP_CREATE_FAILED", unwindAvailable: true });
    expect(world.migration.calls.apply).toBe(0);
    expect(has(world, "backup:observe")).toBe(false);
    expect(world.execRecord().status).toBe("FAILED");
    expect(world.maintenance.state.phase).toBe("FAILED");
    expect(world.auditTypes()).toContain("BACKUP_FAILED");
    expect(world.backup.createCalls).toBe(1);
    expectStillProtected(world);
  });

  it("resultado AMBÍGUO ou exceção: STOP_AND_RECONCILE, sem retry, sem migration, fase permanece", async () => {
    for (const behavior of ["AMBIGUOUS", "THROW"]) {
      const world = await createPipelineWorld({ backupBehavior: behavior });
      const result = await run(world);
      expect(result, behavior).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "BACKUP_OUTCOME_AMBIGUOUS", requiresReconciliation: true });
      expect(world.migration.calls.apply).toBe(0);
      expect(world.maintenance.state.phase).toBe("BACKING_UP");
      expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
      expect(await world.planStatus()).toBe("RECOVERY_REQUIRED");
      // re-entrada: nunca recria o backup
      expect((await run(world)).outcome).toBe("RECOVERY_REQUIRED");
      expect(world.backup.createCalls).toBe(1);
      // e o unwind é RECUSADO enquanto há backup ambíguo
      expect(await abort(world)).toMatchObject({ ok: false, outcome: "CANCEL_REJECTED", code: "BACKUP_OUTCOME_AMBIGUOUS_RECONCILE_FIRST", recorded: false });
      expectStillProtected(world);
    }
  });

  it("verificação falhou (hash observado ≠ manifest): nenhuma migration", async () => {
    const world = await createPipelineWorld({ backupVariant: "hashMismatch" });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "BACKUP_VERIFY_FAILED" });
    expect(world.migration.calls.apply).toBe(0);
    expect(world.backup.runs).toHaveLength(0);
    expectStillProtected(world);
  });

  it("PITR L1 sozinho é insuficiente; managed daily sozinho também", async () => {
    for (const behavior of ["PITR", "DAILY"]) {
      const world = await createPipelineWorld({ backupBehavior: behavior });
      const result = await run(world);
      expect(result, behavior).toMatchObject({ ok: false, outcome: "FAILED", code: "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION" });
      expect(world.migration.calls.apply).toBe(0);
      expect(world.backup.runs).toHaveLength(0);
      expectStillProtected(world);
    }
  });

  it("L2 com correlação ERRADA (backup de outra execução): não satisfaz", async () => {
    const world = await createPipelineWorld({ backupVariant: "wrongCorrelation" });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "BACKUP_CORRELATION_MISMATCH" });
    expect(world.migration.calls.apply).toBe(0);
    expect(world.backup.runs).toHaveLength(0);
  });

  it("status VERIFIED sem evidência L2 íntegra: o gate BACKUP_VERIFIED bloqueia o READY_TO_MIGRATE", async () => {
    const world = await createPipelineWorld({ backupVariant: "noIntegrity" });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "READY_TO_MIGRATE_NOT_SATISFIED" });
    expect(result.blockers.find((item) => item.key === "BACKUP_VERIFIED")).toMatchObject({ status: "BLOCKED", reasonCode: "BACKUP_VERIFY_FAILED" });
    expect(world.migration.calls.apply).toBe(0);
    expect(world.maintenance.state.phase).toBe("FAILED");
  });

  it("run VERIFIED de OUTRA execução/correlação não é reutilizável (STALE)", async () => {
    const world = await createPipelineWorld();
    const original = world.backup.readEvidence.bind(world.backup);
    world.backup.readEvidence = async (request) => {
      const evidence = await original(request);
      return { ...evidence, runs: evidence.runs.map((run_) => ({ ...run_, correlationId: OTHER_CORR })) };
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "READY_TO_MIGRATE_NOT_SATISFIED" });
    expect(result.blockers.find((item) => item.key === "BACKUP_VERIFIED").status).toBe("STALE");
    expect(world.migration.calls.apply).toBe(0);
  });

  it("defesa em profundidade: quiescência mudou desde o backup → STALE → sem migration", async () => {
    const world = await createPipelineWorld();
    const original = world.backup.recordVerification.bind(world.backup);
    world.backup.recordVerification = async (request) => {
      const recorded = await original(request);
      world.maintenance.state.quiescentAt = new Date(Date.parse(world.maintenance.state.quiescentAt) + MIN).toISOString();
      return recorded;
    };
    const result = await run(world);
    expect(result.code).toBe("READY_TO_MIGRATE_NOT_SATISFIED");
    expect(result.blockers.find((item) => item.key === "BACKUP_VERIFIED").status).toBe("STALE");
    expect(world.migration.calls.apply).toBe(0);
  });
});

describe("I2C2 — migrations: uma por vez, retry = 0, sem execute_sql", () => {
  it("nunca há apply concorrente", async () => {
    const world = await createPipelineWorld({ bundle: buildPlan({ sqls: THREE_SQL }) });
    let active = 0;
    let maxActive = 0;
    for (const order of [1, 2, 3]) {
      world.migration.script[order] = async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => { setTimeout(resolve, 2); });
        active -= 1;
        return "SUCCESS";
      };
    }
    expect((await run(world)).outcome).toBe("SUCCEEDED");
    expect(maxActive).toBe(1);
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1, 2, 3]);
  });

  it("drift de identidade antes do 1º passo: NENHUM apply", async () => {
    const world = await createPipelineWorld();
    world.migration.drift[1] = { sha256: "f".repeat(64) };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "T_TIME_REVALIDATION_FAILED", reasonCode: "MIGRATION_IDENTITY_DRIFT_1" });
    expect(world.migration.calls.apply).toBe(0);
    expect(world.maintenance.state.phase).toBe("FAILED");
    expectStillProtected(world);
  });

  it("drift no gitBlob/bytes/filename também bloqueia", async () => {
    for (const drift of [{ gitBlob: "e".repeat(40) }, { bytes: 1 }, { filename: "9999_other.sql" }]) {
      const world = await createPipelineWorld();
      world.migration.drift[2] = drift;
      const result = await run(world);
      expect(result.reasonCode, JSON.stringify(drift)).toBe("MIGRATION_IDENTITY_DRIFT_2");
      expect(world.migration.calls.apply).toBe(0);
    }
  });

  it("drift surgido ENTRE passos (1 commitado): para no 2º, RECOVERY_REQUIRED, sem apply do 2º", async () => {
    const world = await createPipelineWorld();
    world.migration.script[1] = async () => {
      world.migration.drift[2] = { sha256: "f".repeat(64) };
      return "SUCCESS";
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "MIGRATION_OUTCOME_AMBIGUOUS", reasonCode: "MIGRATION_IDENTITY_DRIFT_2" });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1]);
    expectStillProtected(world);
  });

  it("plano / target / aprovação alterados no instante T: nenhum apply", async () => {
    const drifts = [
      ["status", { status: "CANCELED" }],
      ["plan_hash", { plan_hash: "0".repeat(64) }],
      ["readiness_generation", { readiness_generation: 99 }],
      ["approved_at", { approved_at: "2026-09-18T18:59:00.000Z" }],
    ];
    for (const [label, patch] of drifts) {
      const world = await createPipelineWorld();
      const original = world.backup.recordVerification.bind(world.backup);
      world.backup.recordVerification = async (request) => {
        world.planStore.__patchRow(world.bundle.id, patch);
        return original(request);
      };
      const result = await run(world);
      expect(result.ok, label).toBe(false);
      expect(world.migration.calls.apply, label).toBe(0);
    }
  });

  it("primeiro OK, segundo FAILED_NOT_COMMITTED: terceiro NUNCA roda; RECOVERY_REQUIRED (parcial); sem restore", async () => {
    const world = await createPipelineWorld({ bundle: buildPlan({ sqls: THREE_SQL }), migrationScript: { 2: "FAILED" } });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "MIGRATION_FAILED_NOT_COMMITTED", migrationsApplied: 1 });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1, 2]);
    expect(await world.planStatus()).toBe("RECOVERY_REQUIRED");
    const steps = Object.fromEntries(world.stepStore.snapshot().map((step) => [step.stepOrder, step]));
    expect(steps[migrateStepOrder(1)].status).toBe("SUCCEEDED");
    expect(steps[migrateStepOrder(2)]).toMatchObject({ status: "FAILED", errorCode: "MIGRATION_FAILED_NOT_COMMITTED" });
    expect(steps[migrateStepOrder(2)].evidence.commitState).toBe("NOT_COMMITTED");
    expect(steps[migrateStepOrder(3)]).toBeUndefined();
    expect(has(world, "smoke:run")).toBe(false);
    expect(world.log.some((entry) => /restore/i.test(entry))).toBe(false);
    expectStillProtected(world);
  });

  it("1ª migration FAILED_NOT_COMMITTED (nada commitado): FAILED, fase segue MIGRATING, login CLOSED, sem unwind", async () => {
    const world = await createPipelineWorld({ migrationScript: { 1: "FAILED" } });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "FAILED", code: "MIGRATION_FAILED_NOT_COMMITTED", unwindAvailable: false });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1]);
    expect(world.maintenance.state.phase).toBe("MIGRATING");
    expect(world.execRecord().status).toBe("FAILED");
    expectStillProtected(world);
    expect(await abort(world)).toMatchObject({ ok: false, outcome: "CANCEL_REJECTED", code: "CANCEL_NOT_ALLOWED_AFTER_MIGRATING_STARTED" });
    expect(world.maintenance.state.phase).toBe("MIGRATING");
  });

  it("erro tipado MigrationNotCommittedError → FAILED_NOT_COMMITTED (≠ ambíguo)", async () => {
    const world = await createPipelineWorld({ migrationScript: { 1: "NOT_COMMITTED_THROW" } });
    const result = await run(world);
    expect(result).toMatchObject({ outcome: "FAILED", code: "MIGRATION_FAILED_NOT_COMMITTED" });
    const step = world.stepStore.snapshot().find((item) => item.stepOrder === migrateStepOrder(1));
    expect(step.evidence).toMatchObject({ commitState: "NOT_COMMITTED", reasonCode: "SQL_SYNTAX" });
  });

  it("1ª migration AMBÍGUA: RECOVERY_REQUIRED; 2ª nunca roda; sem retry; lock retido; login CLOSED", async () => {
    const world = await createPipelineWorld({ migrationScript: { 1: "AMBIGUOUS" } });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "MIGRATION_OUTCOME_AMBIGUOUS", requiresReconciliation: true, resumeAllowed: false });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1]);
    expect(world.execRecord()).toMatchObject({ status: "RECOVERY_REQUIRED", failureCode: "MIGRATION_OUTCOME_AMBIGUOUS" });
    expect(await world.planStatus()).toBe("RECOVERY_REQUIRED");
    expect(world.auditTypes()).toContain("DB_RECOVERY_REQUIRED");
    expectStillProtected(world);
    // re-execuções NÃO retomam nem repetem
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await run(world)).outcome).toBe("RECOVERY_REQUIRED");
    }
    expect(world.migration.calls.apply).toBe(1);
  });

  it("timeout / transporte perdido / retorno irreconhecível → ambíguo (não FAILED)", async () => {
    const cases = [["TIMEOUT", "APPLY_TIMEOUT"], ["THROW", "APPLY_TRANSPORT_ERROR"], ["GARBAGE", "APPLY_RESULT_UNRECOGNIZED"]];
    for (const [mode, reason] of cases) {
      const world = await createPipelineWorld({ migrationScript: { 1: mode } });
      const result = await run(world);
      expect(result, mode).toMatchObject({ outcome: "RECOVERY_REQUIRED", code: "MIGRATION_OUTCOME_AMBIGUOUS", reasonCode: reason });
      expect(world.migration.calls.apply, mode).toBe(1);
      expect(world.migration.calls.executeSql, mode).toBe(0);
      expectStillProtected(world);
    }
  });

  it("crash APÓS gravar a intenção (step RUNNING sem resultado): re-entrada trata como AMBÍGUO e NÃO reinvoca", async () => {
    const world = await createPipelineWorld();
    const original = world.stepStore.finishStep.bind(world.stepStore);
    world.stepStore.finishStep = async (args) => {
      if (args.stepOrder === migrateStepOrder(1)) throw new Error("PROCESS_CRASH");
      return original(args);
    };
    await expect(run(world)).rejects.toThrow("PROCESS_CRASH");
    world.stepStore.finishStep = original;
    expect(world.stepStore.snapshot().find((step) => step.stepOrder === migrateStepOrder(1)).status).toBe("RUNNING");

    const resumed = await run(world);
    expect(resumed).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "MIGRATION_OUTCOME_AMBIGUOUS", reasonCode: "MIGRATION_INTENT_WITHOUT_RESULT" });
    expect(world.migration.calls.apply).toBe(1);
    expect(has(world, "migration:apply:2")).toBe(false);
  });

  it("resultado não persistível após o apply: não avança (ambíguo)", async () => {
    const world = await createPipelineWorld();
    world.migration.script[1] = async () => {
      world.stepStore.faults.failFinish = true;
      return "SUCCESS";
    };
    const result = await run(world);
    expect(result).toMatchObject({ outcome: "RECOVERY_REQUIRED", reasonCode: "STEP_RESULT_NOT_PERSISTED" });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1]);
  });

  it("migration desconhecida do plano nunca é aplicada: conjunto não-SAFE_AUTO bloqueia antes de tudo", async () => {
    const bundle = buildPlan({ declaredClassification: "REVIEW_REQUIRED" });
    const world = await createPipelineWorld({ bundle });
    const result = await run(world);
    expect(result).toMatchObject({ outcome: "BLOCKED_BEFORE_MAINTENANCE" });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.migration.calls.apply).toBe(0);
  });

  it("reconciliação é SOMENTE leitura: não muda estado, não retoma, não reinvoca", async () => {
    const world = await createPipelineWorld({ bundle: buildPlan({ sqls: THREE_SQL }), migrationScript: { 2: "AMBIGUOUS" } });
    await run(world);
    world.migration.__commitSilently(2); // o commit aconteceu, mas ninguém viu
    const before = JSON.stringify({ steps: world.stepStore.snapshot(), exec: world.execRecord(), plan: await world.planStatus(), phase: world.maintenance.state.phase });
    const report = await reconcileDbReleaseExecution({ executionId: world.executionId }, world.depsFor());
    expect(report).toMatchObject({ ok: true, readOnly: true, mutated: false, resumeAllowed: false, autoRetryAllowed: false });
    expect(report.perStep.map((item) => [item.order, item.commitState])).toEqual([[1, "COMMITTED"], [2, "COMMITTED"]]);
    expect(report.outcome).toBe("ALL_COMMITTED");
    const after = JSON.stringify({ steps: world.stepStore.snapshot(), exec: world.execRecord(), plan: await world.planStatus(), phase: world.maintenance.state.phase });
    expect(after).toBe(before);
    expect(world.migration.calls.apply).toBe(2);
  });
});

describe("I2C2 — verificação pós-migration e SMOKE", () => {
  it("verificação falha DEPOIS do commit: RECOVERY_REQUIRED; sem smoke; sem restore; login CLOSED", async () => {
    const world = await createPipelineWorld({ verifierOk: false });
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "POST_MIGRATION_VERIFICATION_FAILED" });
    expect(world.migration.calls.apply).toBe(2);
    expect(world.smoke.calls).toBe(0);
    expect(world.auditTypes()).toContain("DB_SCHEMA_VALIDATION_FAILED");
    expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
    expect(world.log.some((entry) => /restore/i.test(entry))).toBe(false);
    expectStillProtected(world);
  });

  it("adapter diz ok mas checa resíduo = false: também falha", async () => {
    const world = await createPipelineWorld();
    world.verifier.checks.noResidue = false;
    const result = await run(world);
    expect(result.code).toBe("POST_MIGRATION_VERIFICATION_FAILED");
    expect(world.smoke.calls).toBe(0);
  });

  it("SMOKE PASS: normalização completa", async () => {
    const world = await createPipelineWorld({ smokeResult: "PASS" });
    const result = await run(world);
    expect(result).toMatchObject({ ok: true, outcome: "SUCCEEDED", loginGateReopened: true });
    expect(world.smoke.calls).toBe(1);
  });

  it("SMOKE FAIL após migration commitada: RECOVERY_REQUIRED; nada reaberto; sem restore automático", async () => {
    for (const smokeResult of ["FAIL", "THROW"]) {
      const world = await createPipelineWorld({ smokeResult });
      const result = await run(world);
      expect(result, smokeResult).toMatchObject({ ok: false, outcome: "RECOVERY_REQUIRED", code: "SMOKE_FAILED_AFTER_COMMIT", autoRestoreAllowed: false });
      expect(world.maintenance.state.phase).toBe("SMOKE");
      expect(await world.planStatus()).toBe("RECOVERY_REQUIRED");
      expect(world.log.some((entry) => /restore/i.test(entry))).toBe(false);
      expect(world.smoke.calls).toBe(1);
      expectStillProtected(world);
      // re-entrada não roda smoke de novo nem reabre
      expect((await run(world)).outcome).toBe("RECOVERY_REQUIRED");
      expect(world.smoke.calls).toBe(1);
    }
  });

  it("SMOKE que ecoa OUTRA execução não conta como PASS", async () => {
    const world = await createPipelineWorld();
    world.smoke.run = async () => ({ result: "PASS", executionId: "99999999-9999-4999-8999-999999999999" });
    expect((await run(world)).code).toBe("SMOKE_FAILED_AFTER_COMMIT");
  });
});

describe("I2C2 — lease do executor durante o pipeline", () => {
  it("lease já vencida antes de qualquer mutação: NENHUM progresso, sem takeover", async () => {
    const world = await createPipelineWorld();
    world.clock.advance(3 * MIN);
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "LEASE_LOST", code: "LEASE_LOST_PRE_MUTATION", requiresReconciliation: true });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.planTransitions).toHaveLength(0);
    expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
    expect(world.locks()).toHaveLength(1);
  });

  it("outro worker não assume (nem com lease vencida)", async () => {
    const world = await createPipelineWorld();
    world.clock.advance(3 * MIN);
    const result = await run(world, world.depsFor("worker-b"));
    expect(result).toMatchObject({ ok: false, outcome: "OWNERSHIP_MISMATCH", autoTakeoverAllowed: false });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.execRecord().workerId).toBe("worker-a");
  });

  it("lease perdida durante o BACKUP (antes de MIGRATING): progresso para, sem migration", async () => {
    const world = await createPipelineWorld();
    const original = world.backup.createBackup.bind(world.backup);
    world.backup.createBackup = async (request) => {
      const created = await original(request);
      world.clock.advance(3 * MIN); // backup demorou mais que a lease e ninguém deu heartbeat
      return created;
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "LEASE_LOST", requiresReconciliation: true });
    expect(world.migration.calls.apply).toBe(0);
    expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
    expectStillProtected(world);
  });

  it("heartbeat injetado permite backup longo sem perder a lease", async () => {
    const world = await createPipelineWorld();
    const original = world.backup.createBackup.bind(world.backup);
    world.backup.createBackup = async (request) => {
      world.clock.advance(100 * 1000);
      await request.heartbeat();
      world.clock.advance(100 * 1000);
      await request.heartbeat();
      return original(request);
    };
    expect((await run(world)).outcome).toBe("SUCCEEDED");
  });

  it("lease perdida DURANTE a migration (resultado conhecido): registra o fato, NÃO avança, RECOVERY_REQUIRED", async () => {
    const world = await createPipelineWorld();
    world.migration.script[1] = async () => {
      world.clock.advance(3 * MIN);
      return "SUCCESS";
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "LEASE_LOST", code: "LEASE_LOST_AFTER_MUTATION", afterMutation: true, migrationsApplied: 1 });
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1]);
    expect(world.stepStore.snapshot().find((step) => step.stepOrder === migrateStepOrder(1)).status).toBe("SUCCEEDED");
    expect(world.execRecord().status).toBe("RECOVERY_REQUIRED");
    expect(await world.planStatus()).toBe("RECOVERY_REQUIRED");
    expectStillProtected(world);
  });

  it("lease perdida APÓS o commit e antes do smoke: RECOVERY_REQUIRED, smoke não roda, login não reabre", async () => {
    const world = await createPipelineWorld();
    world.verifier.verifyPostMigration = async () => {
      world.clock.advance(3 * MIN);
      return { ok: true, checks: { migrationHistory: true, schemaEvidence: true, noResidue: true } };
    };
    const result = await run(world);
    expect(result).toMatchObject({ ok: false, outcome: "LEASE_LOST", afterMutation: true });
    expect(world.smoke.calls).toBe(0);
    expect(world.migration.calls.apply).toBe(2);
    expectStillProtected(world);
  });
});

describe("I2C2 — cancelamento / unwind controlado", () => {
  it("antes de qualquer manutenção: cancela e libera o lock; plano continua reivindicável", async () => {
    const world = await createPipelineWorld();
    const result = await abort(world);
    expect(result).toMatchObject({ ok: true, outcome: "CANCELED", lockReleased: true, migrationMutationOccurred: false });
    expect(world.execRecord().status).toBe("CANCELED");
    expect(await world.planStatus()).toBe("APPROVED");
    expect(world.locks()).toHaveLength(0);
    expect(world.maintenance.calls).toEqual([]);
  });

  it("durante DRAINING (pré-mutação, provado não-mutante): unwind volta a NORMAL, login OPEN, fence off, lock liberado", async () => {
    const world = await createPipelineWorld();
    world.probes.cfg.alive = 1;
    await run(world);
    expect(world.maintenance.state.loginGate).toBe("CLOSED");
    const result = await abort(world);
    expect(result).toMatchObject({ ok: true, outcome: "CANCELED", lockReleased: true, loginGateReopened: true, maintenanceReturnedToNormal: true });
    expect(world.maintenance.state).toMatchObject({ phase: "NORMAL", loginGate: "OPEN", fenceEffectiveAt: null });
    expect(world.maintenance.state.binding.dbPlanId).toBeNull();
    expect(world.execRecord()).toMatchObject({ status: "CANCELED", failureCode: "ABORTED_BEFORE_MUTATION" });
    expect(await world.planStatus()).toBe("FAILED");
    expect(world.locks()).toHaveLength(0);
    expect(world.backup.createCalls).toBe(0);
    expect(world.migration.calls.apply).toBe(0);
    expect(world.auditTypes()).toEqual(expect.arrayContaining(["LOGIN_GATE_OPENED", "MAINTENANCE_ABORTED"]));
    // idempotente
    expect(await abort(world)).toMatchObject({ ok: true, alreadyCanceled: true });
    expect(world.auditTypes().filter((type) => type === "MAINTENANCE_ABORTED")).toHaveLength(1);
  });

  it("após falha determinística de backup o unwind é permitido (nada mutou o schema)", async () => {
    const world = await createPipelineWorld({ backupBehavior: "FAIL" });
    await run(world);
    const result = await abort(world);
    expect(result).toMatchObject({ ok: true, outcome: "CANCELED", lockReleased: true });
    expect(world.maintenance.state).toMatchObject({ phase: "NORMAL", loginGate: "OPEN" });
    expect(world.migration.calls.apply).toBe(0);
  });

  it("DURANTE MIGRATING o cancelamento é recusado e não interrompe o apply em curso", async () => {
    const world = await createPipelineWorld();
    let rejection = null;
    world.migration.script[1] = async () => {
      rejection = await abort(world);
      return "SUCCESS";
    };
    const result = await run(world);
    expect(rejection).toMatchObject({ ok: false, outcome: "CANCEL_REJECTED", code: "CANCEL_NOT_ALLOWED_AFTER_MIGRATING_STARTED", recorded: false, mutated: false });
    expect(result.outcome).toBe("SUCCEEDED");
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1, 2]);
    expect(world.maintenance.calls).not.toContain("abortToNormal");
  });

  it("não existe API de cancelar migration em andamento", async () => {
    const world = await createPipelineWorld();
    const executor = await import("../../server/db-release-executor.js");
    expect(Object.keys(executor).filter((name) => /cancel.*migration|kill|terminate/i.test(name))).toEqual([]);
    expect(Object.keys(world.migration).filter((name) => /cancel|kill|abort|terminate/i.test(name))).toEqual([]);
  });

  it("após possível commit (ambíguo) o cancelamento exige reconciliação", async () => {
    const world = await createPipelineWorld({ migrationScript: { 1: "AMBIGUOUS" } });
    await run(world);
    expect(await abort(world)).toMatchObject({ ok: false, outcome: "CANCEL_REJECTED", requiresReconciliation: true });
    expect(world.maintenance.calls).not.toContain("abortToNormal");
    expectStillProtected(world);
  });

  it("worker/geração errados não cancelam", async () => {
    const world = await createPipelineWorld();
    expect(await abortDbReleaseExecution(world.request(), world.depsFor("worker-b"))).toMatchObject({ ok: false, outcome: "OWNERSHIP_MISMATCH" });
    expect(world.execRecord().status).toBe("REQUESTED");
  });
});

describe("I2C2 — re-entrada idempotente (retomar/reconciliar, nunca recomeçar)", () => {
  it("crash depois do backup criado: retoma SEM recriar backup, SEM novo RUNNING, SEM step/evento duplicado", async () => {
    const world = await createPipelineWorld();
    const original = world.stepStore.beginStep.bind(world.stepStore);
    let crashed = false;
    world.stepStore.beginStep = async (args) => {
      if (args.stepOrder === STEP_ORDER.BACKUP_VERIFY && !crashed) {
        crashed = true;
        throw new Error("PROCESS_CRASH");
      }
      return original(args);
    };
    await expect(run(world)).rejects.toThrow("PROCESS_CRASH");
    const result = await run(world);
    expect(result.outcome).toBe("SUCCEEDED");
    expect(world.backup.createCalls).toBe(1);
    expect(world.backup.runs).toHaveLength(1);
    expect(world.planTransitions.filter((item) => item.to === "RUNNING")).toHaveLength(1);
    const orders = world.stepStore.snapshot().map((step) => step.stepOrder);
    expect(new Set(orders).size).toBe(orders.length);
    const types = world.auditTypes();
    for (const type of ["DB_PREFLIGHT_PASSED", "BACKUP_REQUESTED", "BACKUP_COMPLETED", "SESSION_DRAIN_STARTED", "LOGIN_GATE_CLOSED"]) {
      expect(types.filter((item) => item === type), type).toHaveLength(1);
    }
  });

  it("crash entre migrations (1 commitada): retoma na 2ª, sem reaplicar a 1ª", async () => {
    const world = await createPipelineWorld();
    const original = world.stepStore.beginStep.bind(world.stepStore);
    let crashed = false;
    world.stepStore.beginStep = async (args) => {
      if (args.stepOrder === migrateStepOrder(2) && !crashed) {
        crashed = true;
        throw new Error("PROCESS_CRASH");
      }
      return original(args);
    };
    await expect(run(world)).rejects.toThrow("PROCESS_CRASH");
    const result = await run(world);
    expect(result.outcome).toBe("SUCCEEDED");
    expect(world.migration.applyCalls.map((call) => call.order)).toEqual([1, 2]);
    expect(world.auditTypes().filter((type) => type === "DB_MIGRATION_APPLIED")).toHaveLength(2);
  });

  it("crash depois de EXECUTION=SUCCEEDED e antes do plano: retoma só a finalização (sem duplicar evento)", async () => {
    const world = await createPipelineWorld();
    const original = world.planStore.transitionPlanRow.bind(world.planStore);
    let crashed = false;
    world.planStore.transitionPlanRow = async (args) => {
      if (args.patch.status === "SUCCEEDED" && !crashed) {
        crashed = true;
        throw new Error("PROCESS_CRASH");
      }
      return original(args);
    };
    await expect(run(world)).rejects.toThrow("PROCESS_CRASH");
    expect(world.execRecord().status).toBe("SUCCEEDED");
    expect(await world.planStatus()).toBe("RUNNING");
    expect(world.locks()).toHaveLength(1); // lock só sai depois da normalização durável
    const result = await run(world);
    expect(result).toMatchObject({ ok: true, outcome: "SUCCEEDED", lockReleased: true });
    expect(await world.planStatus()).toBe("SUCCEEDED");
    expect(world.locks()).toHaveLength(0);
    expect(world.auditTypes().filter((type) => type === "DB_RELEASE_SUCCEEDED")).toHaveLength(1);
    expect(world.log.filter((entry) => entry === "maintenance:openLoginGate")).toHaveLength(1);
  });

  it("login que não reabre: NORMALIZATION_PENDING, lock RETIDO, execução ainda não SUCCEEDED; depois retoma", async () => {
    const world = await createPipelineWorld({ maintenanceFaults: { loginGateStaysClosed: true } });
    const pending = await run(world);
    expect(pending).toMatchObject({ ok: false, outcome: "NORMALIZATION_PENDING", code: "LOGIN_GATE_OPEN_NOT_CONFIRMED" });
    expect(world.execRecord().status).toBe("VERIFYING");
    expect(await world.planStatus()).toBe("RUNNING");
    expect(world.locks()).toHaveLength(1);
    expect(world.maintenance.state.phase).toBe("NORMAL");
    world.maintenance.faults.loginGateStaysClosed = false;
    const done = await run(world);
    expect(done.outcome).toBe("SUCCEEDED");
    expect(world.locks()).toHaveLength(0);
    expect(world.migration.calls.apply).toBe(2);
  });
});
