import { describe, expect, it } from "vitest";
import {
  ALWAYS_REQUIRED_READINESS_GATES,
  CANONICAL_READINESS_GATES,
  REQUIRED_READINESS_GATES,
} from "../../server/db-release-contract.js";
import {
  assembleCanonicalGates,
  buildReadinessSnapshot,
  computeOverallReadiness,
} from "../../server/db-release-readiness.js";
import {
  CLAIMABLE_GATES,
  POST_CLAIM_GATES,
  READINESS_STAGES,
  SERVER_INJECTABLE_GATES,
  STAGE_PROFILES,
  deriveClaimableGates,
  deriveScheduleWindowGate,
  evaluateStageReadiness,
  stageGateKeys,
  stagePartitionIsComplete,
} from "../../server/db-release-stage-readiness.js";
import { SCHEDULE_CLAIM_WINDOW_MS } from "../../server/db-release-executor-contract.js";
import {
  NOW,
  SEC,
  buildPlan,
  createEvidenceCollector,
  iso,
  publicPlanFrom,
} from "./helpers/db-release-executor-fixtures.js";

const POST_CLAIM = ["LOCK_ACQUIRED", "LOGIN_GATE_CLOSED", "ACTIVE_SESSION_COUNT_ZERO", "IN_FLIGHT_OPERATION_COUNT_ZERO", "WRITE_FENCE_ACTIVE", "BACKUP_VERIFIED"];

function verified(key, overrides = {}) {
  return {
    key,
    status: "VERIFIED",
    reasonCode: "FIXTURE",
    evidenceAt: iso(NOW),
    expiresAt: iso(NOW + 45 * SEC),
    ...overrides,
  };
}

/** Gates canônicos: só o que foi passado existe; o resto vira UNKNOWN. */
function gatesWith(statusByKey, { scheduled = false } = {}) {
  const partial = Object.entries(statusByKey).map(([key, status]) => (
    status === "VERIFIED" ? verified(key) : verified(key, { status, reasonCode: `FIXTURE_${status}` })
  ));
  return assembleCanonicalGates(partial, { scheduled, nowMs: NOW });
}

const CLAIM_ALL_VERIFIED = Object.fromEntries(CLAIMABLE_GATES.map((key) => [key, "VERIFIED"]));

function claimable(overrides = {}, { scheduled = false } = {}) {
  return evaluateStageReadiness({
    stage: "CLAIMABLE",
    gates: gatesWith({ ...CLAIM_ALL_VERIFIED, ...overrides }, { scheduled }),
    scheduled,
  });
}

describe("stage readiness — perfis", () => {
  it("expõe os 4 perfis; todos implementados (CLAIMABLE em I2C1, o resto em I2C2)", () => {
    expect(READINESS_STAGES).toEqual(["CLAIMABLE", "READY_TO_QUIESCE", "READY_TO_BACKUP", "READY_TO_MIGRATE"]);
    for (const stage of READINESS_STAGES) expect(STAGE_PROFILES[stage].implemented).toBe(true);
  });

  it("perfis são superconjuntos crescentes; READY_TO_MIGRATE == todas as gates canônicas", () => {
    const sets = READINESS_STAGES.map((stage) => new Set(STAGE_PROFILES[stage].gates));
    for (let index = 1; index < sets.length; index += 1) {
      for (const key of sets[index - 1]) expect(sets[index].has(key)).toBe(true);
      expect(sets[index].size).toBeGreaterThan(sets[index - 1].size);
    }
    expect([...sets[3]].sort()).toEqual([...REQUIRED_READINESS_GATES].sort());
    expect(stageGateKeys("READY_TO_QUIESCE")).toHaveLength(11);
    expect(stageGateKeys("READY_TO_BACKUP")).toHaveLength(15);
    expect(stageGateKeys("READY_TO_MIGRATE")).toHaveLength(16);
    expect(stageGateKeys("READY_TO_MIGRATE", { scheduled: true })).toHaveLength(17);
  });

  it("CLAIMABLE contém só evidência pré-posse e NÃO exige gates pós-claim", () => {
    for (const key of ["GIT_SHA_MATCH", "HML_VALIDATED", "PROD_BASELINE_VERIFIED", "MIGRATION_SET_FROZEN",
      "MIGRATION_IDENTITY_VERIFIED", "SCHEMA_SAFETY_PASS", "NO_DML", "NO_DESTRUCTIVE_DDL", "HUMAN_APPROVAL_VALID"]) {
      expect(CLAIMABLE_GATES).toContain(key);
    }
    for (const key of [...POST_CLAIM, "EXECUTOR_HEALTHY"]) {
      expect(CLAIMABLE_GATES).not.toContain(key);
      expect(stageGateKeys("CLAIMABLE", { scheduled: true })).not.toContain(key);
    }
    expect(STAGE_PROFILES.CLAIMABLE.gates).toBe(CLAIMABLE_GATES);
  });

  it("SCHEDULE_WINDOW_VALID só é exigido quando agendado", () => {
    expect(stageGateKeys("CLAIMABLE", { scheduled: false })).not.toContain("SCHEDULE_WINDOW_VALID");
    expect(stageGateKeys("CLAIMABLE", { scheduled: true })).toContain("SCHEDULE_WINDOW_VALID");
  });

  it("CLAIMABLE ∪ pós-claim particiona exatamente os gates canônicos", () => {
    expect(stagePartitionIsComplete()).toBe(true);
    expect(new Set([...CLAIMABLE_GATES, ...POST_CLAIM_GATES]).size).toBe(CANONICAL_READINESS_GATES.length);
    expect(CLAIMABLE_GATES.filter((key) => POST_CLAIM_GATES.includes(key))).toEqual([]);
  });

  it("perfis reservados são cumulativos e READY_TO_MIGRATE exige BACKUP_VERIFIED", () => {
    expect(STAGE_PROFILES.READY_TO_QUIESCE.gates).toEqual(expect.arrayContaining([...CLAIMABLE_GATES, "LOCK_ACQUIRED", "EXECUTOR_HEALTHY"]));
    expect(STAGE_PROFILES.READY_TO_QUIESCE.gates).not.toContain("BACKUP_VERIFIED");
    expect(STAGE_PROFILES.READY_TO_BACKUP.gates).toEqual(expect.arrayContaining([
      "LOGIN_GATE_CLOSED", "WRITE_FENCE_ACTIVE", "ACTIVE_SESSION_COUNT_ZERO", "IN_FLIGHT_OPERATION_COUNT_ZERO",
    ]));
    expect(STAGE_PROFILES.READY_TO_BACKUP.gates).not.toContain("BACKUP_VERIFIED");
    expect(STAGE_PROFILES.READY_TO_MIGRATE.gates).toContain("BACKUP_VERIFIED");
    // READY_TO_MIGRATE cobre exatamente o conjunto global canônico.
    expect([...STAGE_PROFILES.READY_TO_MIGRATE.gates].sort()).toEqual([...REQUIRED_READINESS_GATES].sort());
    expect(stageGateKeys("READY_TO_MIGRATE", { scheduled: false }).sort())
      .toEqual([...ALWAYS_REQUIRED_READINESS_GATES].sort());
  });
});

describe("stage readiness — CLAIMABLE", () => {
  it("todos os gates CLAIMABLE VERIFIED → claimable=true", () => {
    const stage = claimable();
    expect(stage.satisfied).toBe(true);
    expect(stage.claimable).toBe(true);
    expect(stage.blockers).toEqual([]);
  });

  it("BACKUP_VERIFIED UNKNOWN → continua CLAIMABLE", () => {
    const gates = gatesWith(CLAIM_ALL_VERIFIED);
    expect(gates.find((gate) => gate.key === "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates }).claimable).toBe(true);
  });

  it.each([
    ["LOGIN_GATE_CLOSED", "PENDING"],
    ["ACTIVE_SESSION_COUNT_ZERO", "PENDING"],
    ["IN_FLIGHT_OPERATION_COUNT_ZERO", "PENDING"],
    ["WRITE_FENCE_ACTIVE", "BLOCKED"],
    ["LOCK_ACQUIRED", "UNKNOWN"],
    ["EXECUTOR_HEALTHY", "UNKNOWN"],
    ["BACKUP_VERIFIED", "FAILED"],
  ])("%s=%s (pós-claim) NÃO impede CLAIMABLE", (key, status) => {
    expect(claimable({ [key]: status }).claimable).toBe(true);
  });

  it("um gate CLAIMABLE UNKNOWN → false, apontando o gate", () => {
    const stage = claimable({ SCHEMA_SAFETY_PASS: "UNKNOWN" });
    expect(stage.claimable).toBe(false);
    expect(stage.blockers).toEqual([expect.objectContaining({ key: "SCHEMA_SAFETY_PASS", status: "UNKNOWN" })]);
  });

  it.each(["STALE", "FAILED", "BLOCKED", "PENDING", "UNKNOWN"])("%s num gate CLAIMABLE → false", (status) => {
    expect(claimable({ GIT_SHA_MATCH: status }).claimable).toBe(false);
  });

  it("gate CLAIMABLE ausente → false (fail-closed)", () => {
    const gates = gatesWith(CLAIM_ALL_VERIFIED).filter((gate) => gate.key !== "NO_DML");
    const stage = evaluateStageReadiness({ stage: "CLAIMABLE", gates });
    expect(stage.claimable).toBe(false);
    expect(stage.blockers[0]).toMatchObject({ key: "NO_DML", reasonCode: "MISSING_GATE_EVIDENCE" });
  });

  it("chave duplicada → false", () => {
    const gates = [...gatesWith(CLAIM_ALL_VERIFIED), verified("NO_DML")];
    const stage = evaluateStageReadiness({ stage: "CLAIMABLE", gates });
    expect(stage.claimable).toBe(false);
    expect(stage.blockers[0].reasonCode).toBe("DUPLICATE_GATE_KEY");
  });

  it("aprovação humana STALE → false", () => {
    expect(claimable({ HUMAN_APPROVAL_VALID: "STALE" }).claimable).toBe(false);
  });

  it("agendado com janela inválida → false", () => {
    for (const status of ["FAILED", "PENDING", "STALE", "UNKNOWN"]) {
      expect(claimable({ SCHEDULE_WINDOW_VALID: status }, { scheduled: true }).claimable).toBe(false);
    }
    expect(claimable({}, { scheduled: true }).claimable).toBe(true);
  });

  it("imediato: SCHEDULE_WINDOW_VALID não é aplicável (mesmo FAILED)", () => {
    expect(claimable({ SCHEDULE_WINDOW_VALID: "FAILED" }, { scheduled: false }).claimable).toBe(true);
    expect(claimable({ SCHEDULE_WINDOW_VALID: "PENDING" }, { scheduled: false }).claimable).toBe(true);
  });

  it("estágio desconhecido → não satisfeito", () => {
    const stage = evaluateStageReadiness({ stage: "NOPE", gates: gatesWith(CLAIM_ALL_VERIFIED) });
    expect(stage).toMatchObject({ satisfied: false, claimable: false, reasonCode: "STAGE_UNKNOWN" });
  });

  it("gates não-array → false", () => {
    expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates: null }).claimable).toBe(false);
  });
});

describe("stage readiness — global continua fail-closed", () => {
  it("plano CLAIMABLE enquanto overall ready=false (todos os exemplos pré-execução)", () => {
    const examples = [
      CLAIM_ALL_VERIFIED,
      { ...CLAIM_ALL_VERIFIED, BACKUP_VERIFIED: "UNKNOWN" },
      { ...CLAIM_ALL_VERIFIED, LOGIN_GATE_CLOSED: "PENDING", ACTIVE_SESSION_COUNT_ZERO: "PENDING" },
      { ...CLAIM_ALL_VERIFIED, LOCK_ACQUIRED: "UNKNOWN", EXECUTOR_HEALTHY: "UNKNOWN" },
    ];
    for (const example of examples) {
      const gates = gatesWith(example);
      expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates }).claimable).toBe(true);
      expect(computeOverallReadiness(gates).ready).toBe(false);
    }
  });

  it("global só fica ready com TODOS os gates aplicáveis VERIFIED", () => {
    const all = Object.fromEntries(REQUIRED_READINESS_GATES.map((key) => [key, "VERIFIED"]));
    const gates = gatesWith(all, { scheduled: true });
    expect(computeOverallReadiness(gates).ready).toBe(true);
    const immediate = gatesWith(Object.fromEntries(ALWAYS_REQUIRED_READINESS_GATES.map((key) => [key, "VERIFIED"])));
    expect(computeOverallReadiness(immediate).ready).toBe(true);
  });

  it("CLAIMABLE nunca autoriza MIGRATING; perfis pós-claim nunca são 'claimable'", () => {
    const everything = gatesWith(
      Object.fromEntries(REQUIRED_READINESS_GATES.map((key) => [key, "VERIFIED"])),
      { scheduled: true },
    );
    for (const stage of ["READY_TO_QUIESCE", "READY_TO_BACKUP", "READY_TO_MIGRATE"]) {
      const result = evaluateStageReadiness({ stage, gates: everything, scheduled: true });
      expect(result).toMatchObject({ implemented: true, satisfied: true, claimable: false, reasonCode: "STAGE_SATISFIED" });
    }
    expect(claimable().claimable).toBe(true);
  });

  it("cada perfil pós-claim bloqueia por QUALQUER gate próprio ausente/UNKNOWN/STALE/PENDING/BLOCKED/FAILED", () => {
    const all = Object.fromEntries(REQUIRED_READINESS_GATES.map((key) => [key, "VERIFIED"]));
    for (const stage of ["READY_TO_QUIESCE", "READY_TO_BACKUP", "READY_TO_MIGRATE"]) {
      for (const key of stageGateKeys(stage)) {
        for (const status of ["UNKNOWN", "STALE", "PENDING", "BLOCKED", "FAILED"]) {
          const result = evaluateStageReadiness({ stage, gates: gatesWith({ ...all, [key]: status }), scheduled: false });
          expect(result.satisfied, stage + "/" + key + "/" + status).toBe(false);
          expect(result.blockers.map((item) => item.key)).toContain(key);
        }
        const missing = { ...all };
        delete missing[key];
        expect(evaluateStageReadiness({ stage, gates: gatesWith(missing), scheduled: false }).satisfied).toBe(false);
      }
    }
  });

  it("gates de estágio posterior NÃO bloqueiam estágio anterior (evita o ciclo)", () => {
    const upToQuiesce = Object.fromEntries(stageGateKeys("READY_TO_QUIESCE").map((key) => [key, "VERIFIED"]));
    expect(evaluateStageReadiness({ stage: "READY_TO_QUIESCE", gates: gatesWith(upToQuiesce) }).satisfied).toBe(true);
    expect(evaluateStageReadiness({ stage: "READY_TO_BACKUP", gates: gatesWith(upToQuiesce) }).satisfied).toBe(false);
    const upToBackup = Object.fromEntries(stageGateKeys("READY_TO_BACKUP").map((key) => [key, "VERIFIED"]));
    expect(evaluateStageReadiness({ stage: "READY_TO_BACKUP", gates: gatesWith(upToBackup) }).satisfied).toBe(true);
    expect(evaluateStageReadiness({ stage: "READY_TO_MIGRATE", gates: gatesWith(upToBackup) }).satisfied).toBe(false);
  });

  it("READY_TO_MIGRATE satisfeito ⇔ readiness GLOBAL true (mesma decisão)", () => {
    const all = Object.fromEntries(REQUIRED_READINESS_GATES.map((key) => [key, "VERIFIED"]));
    for (const scheduled of [false, true]) {
      const ok = gatesWith(all, { scheduled });
      expect(evaluateStageReadiness({ stage: "READY_TO_MIGRATE", gates: ok, scheduled }).satisfied).toBe(true);
      expect(computeOverallReadiness(ok).ready).toBe(true);
      const bad = gatesWith({ ...all, BACKUP_VERIFIED: "STALE" }, { scheduled });
      expect(evaluateStageReadiness({ stage: "READY_TO_MIGRATE", gates: bad, scheduled }).satisfied).toBe(false);
      expect(computeOverallReadiness(bad).ready).toBe(false);
    }
  });

  it("nenhuma alteração semântica: buildReadinessSnapshot sem evidência de posse mantém LOCK/EXECUTOR UNKNOWN", () => {
    const snapshot = buildReadinessSnapshot({ nowMs: NOW, evidence: {} });
    const byKey = Object.fromEntries(snapshot.gates.map((gate) => [gate.key, gate]));
    expect(byKey.LOCK_ACQUIRED.status).toBe("UNKNOWN");
    expect(byKey.LOCK_ACQUIRED.reasonCode).toBe("LOCK_UNIMPLEMENTED");
    expect(byKey.EXECUTOR_HEALTHY.status).toBe("UNKNOWN");
    expect(snapshot.ready).toBe(false);
  });
});

describe("stage readiness — janela de agenda para plano já RUNNING (I2C2)", () => {
  const running = (scheduledMs) => ({ status: "RUNNING", scheduledAt: iso(scheduledMs) });

  it("o claim dentro da janela mantém a gate VERIFIED mesmo horas depois", () => {
    const scheduledMs = NOW - 60 * 60_000;
    const claimedAtMs = scheduledMs + 5 * 60_000;
    expect(deriveScheduleWindowGate(running(scheduledMs), { nowMs: NOW, claimedAtMs })).toMatchObject({
      status: "VERIFIED",
      reasonCode: "SCHEDULE_CLAIMED_IN_WINDOW",
    });
  });

  it("claim fora da janela, ou sem hora de claim, NÃO verifica", () => {
    const scheduledMs = NOW - 60 * 60_000;
    expect(deriveScheduleWindowGate(running(scheduledMs), { nowMs: NOW, claimedAtMs: scheduledMs - 1 }).status).toBe("BLOCKED");
    expect(deriveScheduleWindowGate(running(scheduledMs), { nowMs: NOW, claimedAtMs: scheduledMs + SCHEDULE_CLAIM_WINDOW_MS }).status).toBe("BLOCKED");
    expect(deriveScheduleWindowGate(running(scheduledMs), { nowMs: NOW }).status).toBe("BLOCKED");
    expect(deriveScheduleWindowGate({ status: "RUNNING", scheduledAt: null }, { nowMs: NOW, claimedAtMs: NOW }).status).toBe("FAILED");
  });
});

describe("stage readiness — janela de agenda (relógio do servidor)", () => {
  const at = (scheduledMs, status = "SCHEDULED") => ({ status, scheduledAt: iso(scheduledMs) });

  it("antes da janela → PENDING SCHEDULE_NOT_DUE", () => {
    expect(deriveScheduleWindowGate(at(NOW + 1), { nowMs: NOW })).toMatchObject({ status: "PENDING", reasonCode: "SCHEDULE_NOT_DUE" });
  });

  it("no instante exato e dentro da janela → VERIFIED", () => {
    expect(deriveScheduleWindowGate(at(NOW), { nowMs: NOW }).status).toBe("VERIFIED");
    expect(deriveScheduleWindowGate(at(NOW - SCHEDULE_CLAIM_WINDOW_MS + 1), { nowMs: NOW }).status).toBe("VERIFIED");
  });

  it("fim da janela (exclusivo) → STALE SCHEDULE_WINDOW_EXPIRED", () => {
    expect(deriveScheduleWindowGate(at(NOW - SCHEDULE_CLAIM_WINDOW_MS), { nowMs: NOW }))
      .toMatchObject({ status: "STALE", reasonCode: "SCHEDULE_WINDOW_EXPIRED" });
  });

  it("agenda ausente/inválida → FAILED; plano não-SCHEDULED → BLOCKED", () => {
    expect(deriveScheduleWindowGate({ status: "SCHEDULED", scheduledAt: null }, { nowMs: NOW }).status).toBe("FAILED");
    expect(deriveScheduleWindowGate({ status: "SCHEDULED", scheduledAt: "ontem" }, { nowMs: NOW }).status).toBe("FAILED");
    expect(deriveScheduleWindowGate({ status: "APPROVED", scheduledAt: iso(NOW) }, { nowMs: NOW }).status).toBe("BLOCKED");
    expect(deriveScheduleWindowGate(null, { nowMs: NOW }).status).toBe("BLOCKED");
  });
});

describe("stage readiness — deriveClaimableGates (T-time, servidor)", () => {
  async function gatesFor(bundle, { intent = "IMMEDIATE", collectorOptions = {}, plan = publicPlanFrom(bundle) } = {}) {
    const full = { ...plan, migrations: bundle.migrationRows.map((row) => ({
      order: row.migration_order,
      filename: row.filename,
      gitBlob: row.git_blob,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    })) };
    const collector = createEvidenceCollector({ bundles: [bundle], ...collectorOptions });
    const collected = await collector({ plan: full, nowMs: NOW });
    return deriveClaimableGates({
      plan: full,
      evidence: collected.evidence,
      gateOverrides: collected.gateOverrides,
      intent,
      nowMs: NOW,
    });
  }

  it("plano APPROVED + evidência servidor → CLAIMABLE mas overall ready=false", async () => {
    const gates = await gatesFor(buildPlan());
    const stage = evaluateStageReadiness({ stage: "CLAIMABLE", gates });
    expect(stage.claimable).toBe(true);
    expect(computeOverallReadiness(gates).ready).toBe(false);
    const status = Object.fromEntries(gates.map((gate) => [gate.key, gate.status]));
    expect(status.BACKUP_VERIFIED).toBe("UNKNOWN");
    expect(status.LOCK_ACQUIRED).toBe("UNKNOWN");
    expect(status.LOGIN_GATE_CLOSED).toBe("UNKNOWN");
  });

  it("agendado dentro da janela → SCHEDULE_WINDOW_VALID VERIFIED e CLAIMABLE", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW - 60 * SEC) });
    const gates = await gatesFor(bundle, { intent: "SCHEDULED" });
    expect(gates.find((gate) => gate.key === "SCHEDULE_WINDOW_VALID")).toMatchObject({ status: "VERIFIED", applicable: true });
    expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates, scheduled: true }).claimable).toBe(true);
  });

  it("agendado antes da janela → não claimable", async () => {
    const bundle = buildPlan({ status: "SCHEDULED", scheduledAt: iso(NOW + 60 * SEC) });
    const gates = await gatesFor(bundle, { intent: "SCHEDULED" });
    expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates, scheduled: true }).claimable).toBe(false);
  });

  it("aprovação humana ausente → HUMAN_APPROVAL_VALID não VERIFIED → não claimable", async () => {
    const bundle = buildPlan();
    const plan = { ...publicPlanFrom(bundle), approvedBy: null };
    const gates = await gatesFor(bundle, { plan });
    expect(gates.find((gate) => gate.key === "HUMAN_APPROVAL_VALID").status).not.toBe("VERIFIED");
    expect(evaluateStageReadiness({ stage: "CLAIMABLE", gates }).claimable).toBe(false);
  });

  it("HML_VALIDATED / PROD_BASELINE_VERIFIED sem evidência servidor → UNKNOWN → não claimable", async () => {
    const gates = await gatesFor(buildPlan(), { collectorOptions: { hml: false, baseline: false } });
    const stage = evaluateStageReadiness({ stage: "CLAIMABLE", gates });
    expect(stage.claimable).toBe(false);
    expect(stage.blockers.map((item) => item.key)).toEqual(expect.arrayContaining(["HML_VALIDATED", "PROD_BASELINE_VERIFIED"]));
  });

  it("override vencido (STALE) → não claimable", async () => {
    const bundle = buildPlan();
    const plan = publicPlanFrom(bundle);
    const full = { ...plan, migrations: [] };
    const gates = deriveClaimableGates({
      plan: full,
      evidence: {},
      gateOverrides: [{ key: "HML_VALIDATED", status: "VERIFIED", reasonCode: "X", evidenceAt: iso(NOW), expiresAt: iso(NOW - 1) }],
      intent: "IMMEDIATE",
      nowMs: NOW,
    });
    expect(gates.find((gate) => gate.key === "HML_VALIDATED").status).toBe("STALE");
  });

  it("overrides só valem para gates injetáveis pelo servidor (nunca BACKUP_VERIFIED etc.)", async () => {
    expect(SERVER_INJECTABLE_GATES).toEqual(["HML_VALIDATED", "PROD_BASELINE_VERIFIED"]);
    const bundle = buildPlan();
    const plan = { ...publicPlanFrom(bundle), migrations: [] };
    const gates = deriveClaimableGates({
      plan,
      evidence: {},
      gateOverrides: ["BACKUP_VERIFIED", "LOCK_ACQUIRED", "SCHEMA_SAFETY_PASS", "GIT_SHA_MATCH"].map((key) => ({
        key, status: "VERIFIED", evidenceAt: iso(NOW), expiresAt: iso(NOW + 45 * SEC),
      })),
      intent: "IMMEDIATE",
      nowMs: NOW,
    });
    const status = Object.fromEntries(gates.map((gate) => [gate.key, gate.status]));
    expect(status.BACKUP_VERIFIED).toBe("UNKNOWN");
    expect(status.LOCK_ACQUIRED).toBe("UNKNOWN");
    expect(status.SCHEMA_SAFETY_PASS).not.toBe("VERIFIED");
    expect(status.GIT_SHA_MATCH).not.toBe("VERIFIED");
  });

  it("evidence.execution é ignorada antes do claim (LOCK_ACQUIRED nunca vem de fora)", async () => {
    const bundle = buildPlan();
    const plan = { ...publicPlanFrom(bundle), migrations: [] };
    const gates = deriveClaimableGates({
      plan,
      evidence: { execution: { ok: true } },
      gateOverrides: [],
      intent: "IMMEDIATE",
      nowMs: NOW,
    });
    expect(gates.find((gate) => gate.key === "LOCK_ACQUIRED").reasonCode).toBe("LOCK_UNIMPLEMENTED");
  });
});
