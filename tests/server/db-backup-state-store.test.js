import { describe, expect, it } from "vitest";
import {
  BACKUP_INITIAL_STATE,
  BACKUP_STATES,
  BACKUP_TRANSITIONS,
  validateBackupTransition,
} from "../../server/db-backup-contract.js";
import {
  createBackupEvidenceAdapter,
  createBackupStore,
  createMemoryBackupTransport,
} from "../../server/db-backup-store.js";
import {
  deriveNextSafeState,
  decideAmbiguousCreateOutcome,
  evaluateBackupVerification,
  prepareBackupPlan,
} from "../../server/db-backup.js";
import {
  CORRELATION_ID,
  EXECUTION_ID,
  NOW,
  PLAN_ID,
  PROD_REF,
  QUIESCENCE_AT,
  RELEASE_SHA,
  binding,
  capabilities,
  pitrEvidence,
  validSnapshot,
} from "./helpers/db-backup-fixtures.js";

const LOGICAL_OK = [
  ["REQUESTED", "RUNNING"],
  ["RUNNING", "COMPLETED"],
  ["COMPLETED", "VERIFYING"],
  ["VERIFYING", "VERIFIED"],
  ["REQUESTED", "FAILED"],
  ["RUNNING", "FAILED"],
  ["COMPLETED", "FAILED"],
  ["VERIFYING", "FAILED"],
];

const PITR_OK = [
  ["COMPLETED", "VERIFYING"],
  ["VERIFYING", "VERIFIED"],
  ["COMPLETED", "FAILED"],
  ["VERIFYING", "FAILED"],
];

function legal(mode, from, to) {
  return validateBackupTransition({ mode, from, to });
}

describe("db-backup — state machine", () => {
  it("snapshot lógico: caminho REQUESTED→RUNNING→COMPLETED→VERIFYING→VERIFIED", () => {
    expect(BACKUP_INITIAL_STATE.LOGICAL_SNAPSHOT).toBe("REQUESTED");
    for (const [from, to] of LOGICAL_OK) expect(legal("LOGICAL_SNAPSHOT", from, to).ok).toBe(true);
    expect(BACKUP_TRANSITIONS.LOGICAL_SNAPSHOT).toHaveLength(LOGICAL_OK.length);
  });

  it("PITR não finge criação: nasce COMPLETED e só percorre COMPLETED→VERIFYING→VERIFIED", () => {
    expect(BACKUP_INITIAL_STATE.PITR_RECOVERY_POINT).toBe("COMPLETED");
    for (const [from, to] of PITR_OK) expect(legal("PITR_RECOVERY_POINT", from, to).ok).toBe(true);
    expect(legal("PITR_RECOVERY_POINT", "REQUESTED", "RUNNING").ok).toBe(false);
    expect(legal("PITR_RECOVERY_POINT", "COMPLETED", "RUNNING").ok).toBe(false);
    expect(BACKUP_TRANSITIONS.PITR_RECOVERY_POINT).toHaveLength(PITR_OK.length);
  });

  it("nenhum atalho para VERIFIED e nenhuma ressurreição", () => {
    for (const [from, to] of [
      ["REQUESTED", "VERIFIED"],
      ["RUNNING", "VERIFIED"],
      ["COMPLETED", "VERIFIED"],
      ["FAILED", "VERIFIED"],
      ["VERIFIED", "RUNNING"],
      ["VERIFIED", "REQUESTED"],
      ["VERIFIED", "FAILED"],
      ["FAILED", "RUNNING"],
      ["FAILED", "REQUESTED"],
      ["FAILED", "COMPLETED"],
      ["FAILED", "VERIFYING"],
      ["COMPLETED", "RUNNING"],
      ["RUNNING", "REQUESTED"],
      ["REQUESTED", "COMPLETED"],
    ]) {
      const result = legal("LOGICAL_SNAPSHOT", from, to);
      expect(result.ok, `${from}→${to}`).toBe(false);
      expect(result.failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
    }
    expect(legal("LOGICAL_SNAPSHOT", "FAILED", "VERIFIED").reason).toBe("TERMINAL_STATE");
  });

  it("varredura exaustiva: só as arestas declaradas são legais", () => {
    for (const mode of ["LOGICAL_SNAPSHOT", "PITR_RECOVERY_POINT", "MANAGED_DAILY"]) {
      const declared = new Set(BACKUP_TRANSITIONS[mode].map(([a, b]) => `${a}>${b}`));
      for (const from of BACKUP_STATES) {
        for (const to of BACKUP_STATES) {
          expect(legal(mode, from, to).ok, `${mode} ${from}>${to}`).toBe(declared.has(`${from}>${to}`));
        }
      }
    }
  });

  it("falha a partir de qualquer estado ativo; estados/modos desconhecidos falham fechados", () => {
    for (const from of ["REQUESTED", "RUNNING", "COMPLETED", "VERIFYING"]) {
      expect(legal("LOGICAL_SNAPSHOT", from, "FAILED").ok).toBe(true);
    }
    expect(legal("DUAL", "REQUESTED", "RUNNING").failureCode).toBe("BACKUP_INPUT_INVALID");
    expect(legal("LOGICAL_SNAPSHOT", "NOPE", "RUNNING").failureCode).toBe("BACKUP_INPUT_INVALID");
  });

  it("deriveNextSafeState segue eventos e recusa saltos", () => {
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "REQUESTED", event: "START" }).nextStatus).toBe("RUNNING");
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "RUNNING", event: "COMPLETE" }).nextStatus).toBe("COMPLETED");
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "COMPLETED", event: "BEGIN_VERIFY" }).nextStatus).toBe("VERIFYING");
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "VERIFYING", event: "VERIFICATION_PASSED" }).nextStatus).toBe("VERIFIED");
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "RUNNING", event: "VERIFICATION_PASSED" }).ok).toBe(false);
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "REQUESTED", event: "BEGIN_VERIFY" }).ok).toBe(false);
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "VERIFIED", event: "FAIL" }).ok).toBe(false);
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "FAILED", event: "START" }).ok).toBe(false);
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "RUNNING", event: "FAIL" }).nextStatus).toBe("FAILED");
    expect(deriveNextSafeState({ mode: "PITR_RECOVERY_POINT", status: "COMPLETED", event: "BEGIN_VERIFY" }).nextStatus).toBe("VERIFYING");
    expect(deriveNextSafeState({ mode: "PITR_RECOVERY_POINT", status: "REQUESTED", event: "START" }).ok).toBe(false);
    expect(deriveNextSafeState({ mode: "LOGICAL_SNAPSHOT", status: "RUNNING", event: "???" }).reason).toBe("EVENT_UNKNOWN");
  });

  it("criação ambígua: sem retry de mutação, reconcile read-only primeiro", () => {
    const decision = decideAmbiguousCreateOutcome();
    expect(decision.mutationRetryAllowed).toBe(false);
    expect(decision.requiredFirstAction).toBe("READ_ONLY_RECONCILE");
    expect(decision.failureCode).toBe("BACKUP_OUTCOME_AMBIGUOUS");
  });
});

function newStore(startMs = NOW) {
  let clock = startMs;
  let seq = 0;
  const transport = createMemoryBackupTransport();
  const store = createBackupStore({
    transport,
    now: () => clock,
    idFactory: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++seq).padStart(12, "0")}`,
  });
  return { store, transport, tick: (ms = 1000) => { clock += ms; return clock; } };
}

const logicalInput = (overrides = {}) => ({
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

async function driveToVerifying(ctx, input = logicalInput()) {
  const created = await ctx.store.createRun(input);
  expect(created.ok).toBe(true);
  const id = created.row.id;
  ctx.tick();
  expect((await ctx.store.transitionRun({ id, to: "RUNNING" })).ok).toBe(true);
  ctx.tick();
  expect((await ctx.store.transitionRun({ id, to: "COMPLETED" })).ok).toBe(true);
  ctx.tick();
  expect((await ctx.store.transitionRun({ id, to: "VERIFYING" })).ok).toBe(true);
  ctx.tick();
  return id;
}

describe("db-backup-store — runs em memória (sem DB live)", () => {
  it("createRun espelha app_backup_runs e guarda semântica em JSONB", async () => {
    const ctx = newStore();
    const created = await ctx.store.createRun(logicalInput());
    expect(created.ok).toBe(true);
    expect(created.row).toMatchObject({
      plan_id: PLAN_ID,
      execution_id: EXECUTION_ID,
      environment: "PROD",
      provider: "PDB_LOGICAL_SNAPSHOT",
      status: "REQUESTED",
      correlation_id: CORRELATION_ID,
      integrity_evidence: null,
    });
    expect(created.row.provider).toMatch(/^[A-Z][A-Z0-9_]{1,63}$/);
    expect(created.row.provider_metadata).toMatchObject({
      mode: "LOGICAL_SNAPSHOT",
      projectRef: PROD_REF,
      scope: "DATABASE_RECOVERY",
      targetReleaseSha: RELEASE_SHA,
    });
    expect(created.run.mode).toBe("LOGICAL_SNAPSHOT");
  });

  it("createRun rejeita modo/identidade/binding inválidos e segredo", async () => {
    const { store } = newStore();
    expect((await store.createRun(logicalInput({ mode: "DUAL" }))).failureCode).toBe("BACKUP_INPUT_INVALID");
    expect((await store.createRun(logicalInput({ projectRef: "zzixvyspwszewhxzusot" }))).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect((await store.createRun(logicalInput({ correlationId: "x" }))).failureCode).toBe("BACKUP_INPUT_INVALID");
    expect((await store.createRun(logicalInput({ targetReleaseSha: "z" }))).failureCode).toBe("BACKUP_INPUT_INVALID");
    expect((await store.createRun(logicalInput({ quiescenceAt: "x" }))).failureCode).toBe("BACKUP_QUIESCENCE_INVALID");
    const secret = await store.createRun(logicalInput({ providerMetadata: { note: "postgres://u:p4ss@h/db" } }));
    expect(secret.failureCode).toBe("BACKUP_SECRET_MATERIAL");
    const secretKey = await store.createRun(logicalInput({ providerMetadata: { token: "x" } }));
    expect(secretKey.failureCode).toBe("BACKUP_SECRET_MATERIAL");
  });

  it("run PITR nasce COMPLETED (sem RUNNING inventado)", async () => {
    const { store } = newStore();
    const created = await store.createRun(logicalInput({ mode: "PITR_RECOVERY_POINT" }));
    expect(created.row.status).toBe("COMPLETED");
    expect(created.row.provider).toBe("SUPABASE_PITR");
    expect(created.row.completed_at).not.toBeNull();
    expect((await store.transitionRun({ id: created.row.id, to: "RUNNING" })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
  });

  it("transições legais com timestamps; ilegais rejeitadas sem mutar", async () => {
    const ctx = newStore();
    const { row } = await ctx.store.createRun(logicalInput());
    ctx.tick();
    const running = await ctx.store.transitionRun({ id: row.id, to: "RUNNING" });
    expect(running.row.started_at).not.toBeNull();
    const skip = await ctx.store.transitionRun({ id: row.id, to: "VERIFYING" });
    expect(skip.failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
    expect((await ctx.store.getRun(row.id)).row.status).toBe("RUNNING");
  });

  it("VERIFIED/FAILED nunca por transitionRun genérico", async () => {
    const ctx = newStore();
    const id = await driveToVerifying(ctx);
    expect((await ctx.store.transitionRun({ id, to: "VERIFIED" })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
    expect((await ctx.store.transitionRun({ id, to: "FAILED" })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
  });

  it("CAS: expectedUpdatedAt obsoleto e escrita concorrente → BACKUP_CONFLICT", async () => {
    const ctx = newStore();
    const { row } = await ctx.store.createRun(logicalInput());
    ctx.tick();
    const stale = await ctx.store.transitionRun({ id: row.id, to: "RUNNING", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" });
    expect(stale.failureCode).toBe("BACKUP_CONFLICT");
    expect((await ctx.store.getRun(row.id)).row.status).toBe("REQUESTED");

    // duas transições concorrentes sobre a mesma leitura: só uma vence
    const [a, b] = await Promise.all([
      ctx.store.transitionRun({ id: row.id, to: "RUNNING" }),
      ctx.store.transitionRun({ id: row.id, to: "RUNNING" }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("attachProviderMetadata faz merge, protege identidade e bloqueia terminal", async () => {
    const ctx = newStore();
    const { row } = await ctx.store.createRun(logicalInput());
    ctx.tick();
    const attached = await ctx.store.attachProviderMetadata({ id: row.id, metadata: { toolVersion: "1.2" }, providerBackupId: "artifact-set-1" });
    expect(attached.row.provider_metadata).toMatchObject({ toolVersion: "1.2", projectRef: PROD_REF, mode: "LOGICAL_SNAPSHOT" });
    expect(attached.row.provider_backup_id).toBe("artifact-set-1");
    expect((await ctx.store.attachProviderMetadata({ id: row.id, metadata: { projectRef: "abcdefghijklmnopqrst" } })).failureCode).toBe("BACKUP_INPUT_INVALID");
    expect((await ctx.store.attachProviderMetadata({ id: row.id, metadata: { password: "x" } })).failureCode).toBe("BACKUP_SECRET_MATERIAL");
    await ctx.store.failRun({ id: row.id });
    expect((await ctx.store.attachProviderMetadata({ id: row.id, metadata: { a: 1 } })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
  });

  it("attachIntegrityEvidence só em COMPLETED/VERIFYING e sem segredo", async () => {
    const ctx = newStore();
    const { row } = await ctx.store.createRun(logicalInput());
    expect((await ctx.store.attachIntegrityEvidence({ id: row.id, evidence: { a: 1 } })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
    const id = await driveToVerifying(ctx);
    expect((await ctx.store.attachIntegrityEvidence({ id, evidence: { a: 1 } })).ok).toBe(true);
    expect((await ctx.store.attachIntegrityEvidence({ id, evidence: { authorization: "Bearer abcdefgh12345" } })).failureCode).toBe("BACKUP_SECRET_MATERIAL");
  });

  it("markVerification: L2 verificado + binding correto → VERIFIED", async () => {
    const ctx = newStore();
    const id = await driveToVerifying(ctx);
    const snap = validSnapshot();
    const evaluation = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT",
      binding: snap.binding,
      manifest: snap.manifest,
      observations: snap.observations,
      nowMs: NOW,
    });
    expect(evaluation.event).toBe("VERIFICATION_PASSED");
    const marked = await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence });
    expect(marked.ok).toBe(true);
    expect(marked.row.status).toBe("VERIFIED");
    expect(marked.row.verified_at).not.toBeNull();
    expect(marked.run.integrity).toMatchObject({ verificationLevel: "L2", result: "VERIFIED" });
    // terminal: sem ressurreição
    expect((await ctx.store.transitionRun({ id, to: "RUNNING" })).ok).toBe(false);
    expect((await ctx.store.failRun({ id })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");
  });

  it("markVerification: evidência de outra correlação ou L1 para lógico → recusada", async () => {
    const ctx = newStore();
    const id = await driveToVerifying(ctx);
    const snap = validSnapshot({ bindingOverrides: { correlationId: "44444444-4444-4444-8444-444444444444" } });
    const foreign = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: snap.binding, manifest: snap.manifest, observations: snap.observations, nowMs: NOW,
    });
    const rejected = await ctx.store.markVerification({ id, verification: foreign.verification, evidence: foreign.evidence });
    expect(rejected.failureCode).toBe("BACKUP_CORRELATION_MISMATCH");

    const l1 = {
      level: "L1", mode: "LOGICAL_SNAPSHOT", verified: true,
    };
    const good = validSnapshot();
    const evidence = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: good.binding, manifest: good.manifest, observations: good.observations, nowMs: NOW,
    }).evidence;
    const weak = await ctx.store.markVerification({
      id,
      verification: l1,
      evidence: { ...evidence, verificationLevel: "L1" },
    });
    expect(weak.failureCode).toBe("BACKUP_VERIFY_FAILED");
    expect((await ctx.store.getRun(id)).row.status).toBe("VERIFYING");
  });

  it("markVerification: só a partir de VERIFYING; falha de verificação → FAILED terminal", async () => {
    const ctx = newStore();
    const created = await ctx.store.createRun(logicalInput());
    const snap = validSnapshot();
    const evaluation = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: snap.binding, manifest: snap.manifest, observations: snap.observations, nowMs: NOW,
    });
    expect((await ctx.store.markVerification({
      id: created.row.id, verification: evaluation.verification, evidence: evaluation.evidence,
    })).failureCode).toBe("BACKUP_STATE_TRANSITION_ILLEGAL");

    const id = await driveToVerifying(ctx, logicalInput({ correlationId: "88888888-8888-4888-8888-888888888888" }));
    const broken = validSnapshot({ bindingOverrides: { correlationId: "88888888-8888-4888-8888-888888888888" } });
    delete broken.observations.DATA;
    const failing = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: broken.binding, manifest: broken.manifest, observations: broken.observations, nowMs: NOW,
    });
    expect(failing.event).toBe("VERIFICATION_FAILED");
    const failed = await ctx.store.markVerification({ id, verification: failing.verification, evidence: failing.evidence });
    expect(failed.row.status).toBe("FAILED");
    expect(failed.run.failureCode).toBe("BACKUP_ARTIFACT_MISSING");
    expect((await ctx.store.transitionRun({ id, to: "RUNNING" })).ok).toBe(false);
  });

  it("PITR: COMPLETED→VERIFYING→VERIFIED em L1 (mas nunca vira backup pré-migration)", async () => {
    const ctx = newStore();
    const created = await ctx.store.createRun(logicalInput({ mode: "PITR_RECOVERY_POINT" }));
    const id = created.row.id;
    ctx.tick();
    expect((await ctx.store.transitionRun({ id, to: "VERIFYING" })).ok).toBe(true);
    const evaluation = evaluateBackupVerification({
      mode: "PITR_RECOVERY_POINT", binding: binding(), providerEvidence: pitrEvidence(), nowMs: NOW,
    });
    expect(evaluation.verification.level).toBe("L1");
    const marked = await ctx.store.markVerification({ id, verification: evaluation.verification, evidence: evaluation.evidence });
    expect(marked.ok).toBe(true);
    expect(marked.run.mode).toBe("PITR_RECOVERY_POINT");
    expect(marked.run.integrity.verificationLevel).toBe("L1");
  });

  it("transport ausente ou que lança → BACKUP_STORE_UNAVAILABLE (fail closed)", async () => {
    const noTransport = createBackupStore({});
    expect((await noTransport.createRun(logicalInput())).failureCode).toBe("BACKUP_STORE_UNAVAILABLE");
    const broken = createBackupStore({
      transport: {
        insert: async () => { throw new Error("boom"); },
        select: async () => { throw new Error("boom"); },
        updateWhere: async () => { throw new Error("boom"); },
      },
    });
    expect((await broken.createRun(logicalInput())).failureCode).toBe("BACKUP_STORE_UNAVAILABLE");
    expect((await broken.getRun("11111111-1111-4111-8111-111111111111")).failureCode).toBe("BACKUP_STORE_UNAVAILABLE");
  });

  it("adapter de evidência é read-only: só usa listRunsForPlan", async () => {
    const calls = [];
    const readOnlyStore = {
      async listRunsForPlan(planId) {
        calls.push(planId);
        return { ok: true, runs: [] };
      },
      createRun: () => { throw new Error("write attempted"); },
      transitionRun: () => { throw new Error("write attempted"); },
      markVerification: () => { throw new Error("write attempted"); },
    };
    const read = createBackupEvidenceAdapter({ store: readOnlyStore });
    const evidence = await read({ plan: { id: PLAN_ID }, nowMs: NOW });
    expect(evidence).toMatchObject({ ok: true, runs: [] });
    expect(calls).toEqual([PLAN_ID]);
    expect((await createBackupEvidenceAdapter({ store: null })({ plan: { id: PLAN_ID }, nowMs: NOW })).ok).toBe(false);
    expect((await read({ plan: null, nowMs: NOW })).errorCode).toBe("BACKUP_EVIDENCE_MISSING");
  });
});

describe("db-backup — serviço de planejamento (sem executor)", () => {
  it("prepareBackupPlan: logical apenas → 1 run REQUESTED e plano sem execução", () => {
    const plan = prepareBackupPlan({ capabilities: capabilities(), binding: binding(), nowMs: NOW });
    expect(plan.ok).toBe(true);
    expect(plan.strategy.mode).toBe("LOGICAL_SNAPSHOT");
    expect(plan.runs).toEqual([expect.objectContaining({ mode: "LOGICAL_SNAPSHOT", initialStatus: "REQUESTED", createsProviderResource: true })]);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.logicalPlan.executionEnabled).toBe(false);
    expect(plan.storageObjectsIncluded).toBe(false);
    expect(plan.ambiguousCreatePolicy.mutationRetryAllowed).toBe(false);
  });

  it("prepareBackupPlan: DUAL → run PITR COMPLETED sem criar recurso no provider", () => {
    const plan = prepareBackupPlan({
      capabilities: capabilities({ pitrSupported: true, pitrEnabled: true, recoveryPointRangeKnown: true }),
      binding: binding(),
      nowMs: NOW,
    });
    expect(plan.strategy.mode).toBe("DUAL");
    expect(plan.runs.map((r) => [r.mode, r.initialStatus, r.createsProviderResource])).toEqual([
      ["LOGICAL_SNAPSHOT", "REQUESTED", true],
      ["PITR_RECOVERY_POINT", "COMPLETED", false],
    ]);
  });

  it("prepareBackupPlan falha fechado: daily-only, projeto errado, binding inválido, quiescência futura", () => {
    expect(prepareBackupPlan({
      capabilities: capabilities({ logicalSnapshotSupported: false }), binding: binding(), nowMs: NOW,
    }).ok).toBe(false);
    expect(prepareBackupPlan({
      capabilities: capabilities({ projectRef: "zzixvyspwszewhxzusot" }), binding: binding(), nowMs: NOW,
    }).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(prepareBackupPlan({ capabilities: capabilities(), binding: null, nowMs: NOW }).failureCode).toBe("BACKUP_BINDING_MISSING");
    expect(prepareBackupPlan({
      capabilities: capabilities(), binding: binding({ quiescenceAt: new Date(NOW + 60_000).toISOString() }), nowMs: NOW,
    }).failureCode).toBe("BACKUP_QUIESCENCE_INVALID");
  });
});
