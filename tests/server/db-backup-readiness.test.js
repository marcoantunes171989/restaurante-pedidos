import { describe, expect, it } from "vitest";
import { RUNTIME_EVIDENCE_FRESHNESS_MS, computeOverallReadiness, deriveBackupGates } from "../../server/db-release-readiness.js";
import { evaluateDbReleaseReadiness } from "../../server/db-release-readiness-store.js";
import { BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS } from "../../server/db-backup-contract.js";
import { createBackupEvidenceAdapter, createBackupStore, createMemoryBackupTransport } from "../../server/db-backup-store.js";
import { evaluateBackupVerification } from "../../server/db-backup.js";
import {
  CORRELATION_ID,
  EXECUTION_ID,
  HML_REF,
  MIN,
  NOW,
  OTHER_CORRELATION_ID,
  PLAN_ID,
  PROD_REF,
  QUIESCENCE_AT,
  QUIESCENCE_MS,
  RELEASE_SHA,
  binding,
  iso,
  pitrEvidence,
  validSnapshot,
} from "./helpers/db-backup-fixtures.js";

const BASE_SHA = "b".repeat(40);

function newCtx() {
  let clock = NOW - 5 * MIN;
  let seq = 0;
  const transport = createMemoryBackupTransport();
  const store = createBackupStore({
    transport,
    now: () => clock,
    idFactory: () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(++seq).padStart(12, "0")}`,
  });
  return { store, transport, tick: () => { clock += 1000; } };
}

const runInput = (overrides = {}) => ({
  mode: "LOGICAL_SNAPSHOT",
  planId: PLAN_ID,
  executionId: EXECUTION_ID,
  environment: "PROD",
  projectRef: PROD_REF,
  correlationId: CORRELATION_ID,
  targetReleaseSha: RELEASE_SHA,
  quiescenceAt: QUIESCENCE_AT,
  ...overrides,
});

async function toVerifying(ctx, input) {
  const created = await ctx.store.createRun(input);
  expect(created.ok).toBe(true);
  const id = created.row.id;
  if (input.mode === "LOGICAL_SNAPSHOT") {
    for (const to of ["RUNNING", "COMPLETED"]) {
      ctx.tick();
      expect((await ctx.store.transitionRun({ id, to })).ok).toBe(true);
    }
  }
  ctx.tick();
  expect((await ctx.store.transitionRun({ id, to: "VERIFYING" })).ok).toBe(true);
  ctx.tick();
  return id;
}

async function verifiedLogical(ctx, overrides = {}) {
  const input = runInput(overrides);
  const id = await toVerifying(ctx, input);
  const snap = validSnapshot({
    bindingOverrides: {
      correlationId: input.correlationId,
      executionId: input.executionId,
      planId: input.planId,
      targetReleaseSha: input.targetReleaseSha,
      quiescenceAt: input.quiescenceAt,
    },
  });
  const evaluation = evaluateBackupVerification({
    mode: "LOGICAL_SNAPSHOT",
    binding: snap.binding,
    manifest: snap.manifest,
    observations: snap.observations,
    nowMs: NOW,
  });
  expect(evaluation.verification.verified).toBe(true);
  const marked = await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence });
  expect(marked.ok).toBe(true);
  return id;
}

const planEvidence = (overrides = {}) => ({
  ok: true,
  id: PLAN_ID,
  status: "APPROVED",
  environment: "PROD",
  targetReleaseSha: RELEASE_SHA,
  baseSha: BASE_SHA,
  planHash: "e".repeat(64),
  approvedAt: iso(NOW),
  approvedBy: "22222222-2222-4222-8222-222222222222",
  migrations: [],
  readinessGeneration: 1,
  evaluatedAt: iso(NOW),
  ...overrides,
});

const maintenance = (overrides = {}) => async () => ({
  ok: true,
  phase: "BACKING_UP",
  version: 9,
  epoch: 1,
  loginGate: "CLOSED",
  fenceEffectiveAt: iso(NOW - 20 * MIN),
  quiescentAt: QUIESCENCE_AT,
  evaluatedAt: iso(NOW),
  ...overrides,
});

const baseAdapters = (extra = {}) => ({
  git: async () => ({ ok: true, releaseSha: RELEASE_SHA, baseSha: BASE_SHA, drift: false, evaluatedAt: iso(NOW) }),
  maintenance: maintenance(),
  sessionZero: async () => ({ ok: true, aliveSessionCount: 0, heartbeatAfterGateCloseCount: 0, evaluatedAt: iso(NOW) }),
  inFlight: async () => ({ ok: true, coverageComplete: false, inFlightCount: 0, evaluatedAt: iso(NOW) }),
  plan: async () => planEvidence(),
  ...extra,
});

const BINDING = { executionId: EXECUTION_ID, correlationId: CORRELATION_ID, quiescenceAt: QUIESCENCE_AT };

async function backupGate(ctx, { backupBinding = BINDING, adapters = {} } = {}) {
  const snapshot = await evaluateDbReleaseReadiness({
    planId: PLAN_ID,
    releaseSha: RELEASE_SHA,
    backupBinding,
    nowMs: NOW,
    adapters: baseAdapters({
      backup: ctx ? createBackupEvidenceAdapter({ store: ctx.store }) : undefined,
      ...adapters,
    }),
  });
  return { snapshot, gate: snapshot.gates.find((g) => g.key === "BACKUP_VERIFIED") };
}

describe("readiness — BACKUP_VERIFIED com evidência explícita", () => {
  it("frescor reutiliza o TTL runtime canônico do readiness (sem janela inventada)", () => {
    expect(BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS).toBe(RUNTIME_EVIDENCE_FRESHNESS_MS);
  });

  it("sem adapter de backup → UNKNOWN BACKUP_EVIDENCE_MISSING (não mais UNIMPLEMENTED)", async () => {
    const { gate } = await backupGate(null);
    expect(gate.status).toBe("UNKNOWN");
    expect(gate.reasonCode).toBe("BACKUP_EVIDENCE_MISSING");
  });

  it("adapter sem runs → UNKNOWN", async () => {
    const { gate } = await backupGate(newCtx());
    expect(gate.status).toBe("UNKNOWN");
    expect(gate.reasonCode).toBe("BACKUP_EVIDENCE_MISSING");
  });

  it("adapter que lança → UNKNOWN BACKUP_STORE_UNAVAILABLE", async () => {
    const { gate } = await backupGate(null, { adapters: { backup: async () => { throw new Error("boom"); } } });
    expect(gate.status).toBe("UNKNOWN");
    expect(gate.reasonCode).toBe("BACKUP_STORE_UNAVAILABLE");
  });

  it("run existe mas sem binding de execução informado → UNKNOWN BACKUP_BINDING_MISSING", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const { gate } = await backupGate(ctx, { backupBinding: null });
    expect(gate.status).toBe("UNKNOWN");
    expect(gate.reasonCode).toBe("BACKUP_BINDING_MISSING");
  });

  it("snapshot lógico VERIFIED em L2 e vinculado → gate VERIFIED com validade do snapshot", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("VERIFIED");
    expect(gate.reasonCode).toBe("BACKUP_VERIFIED_L2");
    expect(gate.freshness).toBe("execution_bound");
    expect(gate.expiresAt).toBe(iso(NOW + RUNTIME_EVIDENCE_FRESHNESS_MS));
  });

  it("BACKUP_VERIFIED sozinho NÃO torna o release DB pronto", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const { snapshot, gate } = await backupGate(ctx);
    expect(gate.status).toBe("VERIFIED");
    expect(snapshot.ready).toBe(false);
    expect(snapshot.overallStatus).not.toBe("READY");
    const others = snapshot.gates.filter((g) => g.key !== "BACKUP_VERIFIED" && g.applicable && g.required);
    expect(others.some((g) => g.status !== "VERIFIED")).toBe(true);
    expect(snapshot.gates.find((g) => g.key === "EXECUTOR_HEALTHY").status).toBe("UNKNOWN");
    // agregação pura: um único gate VERIFIED nunca basta
    expect(computeOverallReadiness(snapshot.gates).ready).toBe(false);
  });

  it("PITR L1 apenas → NÃO verifica (PENDING, insuficiente)", async () => {
    const ctx = newCtx();
    const id = await toVerifying(ctx, runInput({ mode: "PITR_RECOVERY_POINT" }));
    const evaluation = evaluateBackupVerification({
      mode: "PITR_RECOVERY_POINT", binding: binding(), providerEvidence: pitrEvidence(), nowMs: NOW,
    });
    expect((await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence })).ok).toBe(true);
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("PENDING");
    expect(gate.status).not.toBe("VERIFIED");
    expect(gate.reasonCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
  });

  it("managed daily apenas → NÃO verifica", async () => {
    const ctx = newCtx();
    const id = await toVerifying(ctx, runInput({ mode: "MANAGED_DAILY" }));
    const evaluation = evaluateBackupVerification({
      mode: "MANAGED_DAILY",
      binding: binding(),
      providerEvidence: {
        environment: "PROD", projectRef: PROD_REF, observedAt: iso(NOW - 1000),
        backupId: "daily-1", status: "COMPLETED", insertedAt: iso(NOW - 60 * MIN), physical: true,
      },
      nowMs: NOW,
    });
    expect(evaluation.verification.verified).toBe(true);
    await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence });
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("PENDING");
    expect(gate.reasonCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
  });

  it("DUAL: logical L2 basta; PITR é suplemento e uma falha dele não derruba o gate", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const pitrId = await toVerifying(ctx, runInput({ mode: "PITR_RECOVERY_POINT" }));
    await ctx.store.failRun({ id: pitrId, failureCode: "PITR_RECOVERY_POINT_STALE" });
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("VERIFIED");
  });

  it("backup verificado de OUTRA execução/correlação → STALE (não reutilizável)", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx, { correlationId: OTHER_CORRELATION_ID });
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("STALE");
    expect(gate.reasonCode).toBe("BACKUP_EVIDENCE_STALE");
  });

  it("mesma correlação mas execução/plano/sha divergentes → BLOCKED", async () => {
    for (const overrides of [
      { executionId: "99999999-9999-4999-8999-999999999999" },
      { planId: "12121212-1212-4212-8212-121212121212" },
      { targetReleaseSha: "c".repeat(40) },
    ]) {
      const ctx = newCtx();
      await verifiedLogical(ctx, overrides);
      // adapter que (incorretamente) entrega runs de outro plano: o avaliador precisa barrar
      const leaky = async () => {
        const listed = await ctx.store.listRunsForPlan(overrides.planId || PLAN_ID);
        return { ok: true, runs: listed.runs, evaluatedAt: iso(NOW) };
      };
      const { gate } = await backupGate(ctx, { adapters: { backup: leaky } });
      expect(gate.status, JSON.stringify(overrides)).toBe("BLOCKED");
      expect(gate.reasonCode).toBe("BACKUP_CORRELATION_MISMATCH");
    }
  });

  it("run de outro projeto no binding esperado → BLOCKED BACKUP_PROJECT_MISMATCH", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const { gate } = await backupGate(ctx, { backupBinding: { ...BINDING, projectRef: HML_REF } });
    expect(gate.status).toBe("BLOCKED");
    expect(gate.reasonCode).toBe("BACKUP_PROJECT_MISMATCH");
  });

  it("quiescência mudou (binding ou estado de manutenção) → STALE", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const byBinding = await backupGate(ctx, { backupBinding: { ...BINDING, quiescenceAt: iso(QUIESCENCE_MS + 3 * MIN) } });
    expect(byBinding.gate.status).toBe("STALE");
    const byMaintenance = await backupGate(ctx, { adapters: { maintenance: maintenance({ quiescentAt: iso(QUIESCENCE_MS + 3 * MIN) }) } });
    expect(byMaintenance.gate.status).toBe("STALE");
    expect(byMaintenance.gate.reasonCode).toBe("BACKUP_EVIDENCE_STALE");
  });

  it("verificação falhou → FAILED", async () => {
    const ctx = newCtx();
    const id = await toVerifying(ctx, runInput());
    const snap = validSnapshot();
    delete snap.observations.SCHEMA;
    const evaluation = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: snap.binding, manifest: snap.manifest, observations: snap.observations, nowMs: NOW,
    });
    await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence });
    const { gate } = await backupGate(ctx);
    expect(gate.status).toBe("FAILED");
    expect(gate.reasonCode).toBe("BACKUP_ARTIFACT_MISSING");
  });

  it("criação falhou (failRun) → FAILED; em andamento → PENDING", async () => {
    const failedCtx = newCtx();
    const created = await failedCtx.store.createRun(runInput());
    await failedCtx.store.failRun({ id: created.row.id, failureCode: "BACKUP_CREATE_FAILED" });
    expect((await backupGate(failedCtx)).gate).toMatchObject({ status: "FAILED", reasonCode: "BACKUP_CREATE_FAILED" });

    const runningCtx = newCtx();
    await runningCtx.store.createRun(runInput());
    expect((await backupGate(runningCtx)).gate).toMatchObject({ status: "PENDING", reasonCode: "BACKUP_IN_PROGRESS" });
  });

  it("linha VERIFIED sem evidência L2 íntegra (adulterada) → BLOCKED, nunca VERIFIED", async () => {
    const ctx = newCtx();
    const id = await verifiedLogical(ctx);
    const row = ctx.transport.rows.get(id);
    row.integrity_evidence = { ...row.integrity_evidence, verificationLevel: "L1" };
    expect((await backupGate(ctx)).gate).toMatchObject({ status: "BLOCKED", reasonCode: "BACKUP_VERIFY_FAILED" });

    const ctx2 = newCtx();
    const id2 = await verifiedLogical(ctx2);
    ctx2.transport.rows.get(id2).integrity_evidence = null;
    expect((await backupGate(ctx2)).gate.status).toBe("BLOCKED");

    const ctx3 = newCtx();
    const id3 = await verifiedLogical(ctx3);
    const row3 = ctx3.transport.rows.get(id3);
    row3.integrity_evidence = { ...row3.integrity_evidence, binding: { ...row3.integrity_evidence.binding, executionId: "99999999-9999-4999-8999-999999999999" } };
    expect((await backupGate(ctx3)).gate).toMatchObject({ status: "BLOCKED", reasonCode: "BACKUP_CORRELATION_MISMATCH" });
  });

  it("dois runs lógicos para a mesma correlação → BLOCKED ambíguo", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    await ctx.store.createRun(runInput());
    expect((await backupGate(ctx)).gate).toMatchObject({ status: "BLOCKED", reasonCode: "BACKUP_RUN_AMBIGUOUS" });
  });

  it("sem evidência de plano não há binding confiável → não verifica", async () => {
    const ctx = newCtx();
    await verifiedLogical(ctx);
    const snapshot = await evaluateDbReleaseReadiness({
      releaseSha: RELEASE_SHA,
      backupBinding: BINDING,
      nowMs: NOW,
      adapters: baseAdapters({ backup: createBackupEvidenceAdapter({ store: ctx.store }) }),
    });
    expect(snapshot.gates.find((g) => g.key === "BACKUP_VERIFIED").status).toBe("UNKNOWN");
  });

  it("deriveBackupGates é puro e devolve um único gate canônico", () => {
    const gates = deriveBackupGates({ absent: true }, { nowMs: NOW });
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ key: "BACKUP_VERIFIED", status: "UNKNOWN", reasonCode: "BACKUP_EVIDENCE_MISSING" });
  });
});
