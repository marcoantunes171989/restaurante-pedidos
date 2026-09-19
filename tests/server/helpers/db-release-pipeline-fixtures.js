// Fixtures determinísticos do PDB-I2C2. TUDO é sintético: nenhuma rede, nenhum
// processo, nenhum segredo, nenhum DB. Os "adapters" abaixo são FAKES que
// exercitam a máquina de estados; não existe transporte real em lugar algum.
import {
  buildLogicalSnapshotPlan,
  createManifestSkeleton,
  withArtifactResult,
} from "../../../server/db-backup-logical.js";
import { claimDbReleaseExecution } from "../../../server/db-release-executor-claim.js";
import { createMemoryStepStore } from "../../../server/db-release-step-store.js";
import { isWriteFencePhase } from "../../../server/db-release-readiness.js";
import {
  APPLY_RESULTS,
  MigrationNotCommittedError,
} from "../../../server/db-release-pipeline-contract.js";
import {
  buildCurrentCodeCoverageEvidence,
  buildSyntheticCompleteCoverageEvidence,
} from "../../../server/db-release-write-fence-coverage.js";
import { KIND_CONTENT, sha as sha256hex } from "./db-backup-fixtures.js";
import {
  CORR_1,
  MIN,
  SEC,
  buildPlan,
  claimRequest,
  createWorld,
  iso,
} from "./db-release-executor-fixtures.js";

export { CORR_1, MIN, SEC, buildPlan, claimRequest, iso };
export const OTHER_CORR = "44444444-4444-4444-8444-444444444444";

const SYNTHETIC = "SYNTHETIC";

const HAPPY_EDGES = {
  startNotice: ["NORMAL", "NOTICE"],
  fence: ["NOTICE", "FENCING"],
  startDrain: ["FENCING", "DRAINING"],
  quiesce: ["DRAINING", "QUIESCENT"],
  startBackup: ["QUIESCENT", "BACKING_UP"],
  startMigrating: ["BACKING_UP", "MIGRATING"],
  startSmoke: ["MIGRATING", "SMOKE"],
};

/** Manutenção FAKE: máquina de estados com CAS por version e log de chamadas. */
export function createFakeMaintenance({ clock, log, faults = {} }) {
  const state = {
    phase: "NORMAL",
    version: 1,
    epoch: 0,
    loginGate: "OPEN",
    fenceEffectiveAt: null,
    noticeStartedAt: null,
    drainStartedAt: null,
    quiescentAt: null,
    binding: { releaseId: null, targetSha: null, planKind: null, dbPlanId: null },
  };
  const activeFaults = { ...faults };
  const calls = [];

  const bump = (phase) => {
    if (phase) {
      state.phase = phase;
      log.push(`phase:${phase}`);
    }
    state.version += 1;
  };
  const gate = (name, expectedVersion) => {
    calls.push(name);
    log.push(`maintenance:${name}`);
    if (activeFaults.throwOn === name) throw new Error("MAINTENANCE_TRANSPORT_DROPPED");
    if (activeFaults.failOn === name) return { ok: false, code: "MAINTENANCE_REJECTED" };
    if (expectedVersion !== state.version) return { ok: false, code: "VERSION_CONFLICT" };
    return null;
  };
  const edge = (name, expectedVersion) => {
    const blocked = gate(name, expectedVersion);
    if (blocked) return blocked;
    const [from] = HAPPY_EDGES[name];
    if (state.phase !== from) return { ok: false, code: "STATE_CONFLICT" };
    return null;
  };

  const port = {
    enabled: true,
    transport: SYNTHETIC,
    calls,
    state,
    faults: activeFaults,
    async readState() {
      if (activeFaults.unavailable) return { ok: false, errorCode: "MAINTENANCE_STATE_UNAVAILABLE" };
      return { ok: true, ...structuredClone(state), evaluatedAt: iso(clock.nowMs()) };
    },
    async startNotice({ expectedVersion, binding }) {
      const blocked = edge("startNotice", expectedVersion);
      if (blocked) return blocked;
      state.binding = { releaseId: null, targetSha: binding.targetSha, planKind: binding.planKind, dbPlanId: binding.dbPlanId };
      state.noticeStartedAt = iso(clock.nowMs());
      bump("NOTICE");
      return { ok: true };
    },
    async fence({ expectedVersion }) {
      const blocked = edge("fence", expectedVersion);
      if (blocked) return blocked;
      state.epoch += 1;
      state.fenceEffectiveAt = activeFaults.fenceNotEffective ? null : iso(clock.nowMs());
      bump("FENCING");
      return { ok: true };
    },
    async closeLoginGate({ expectedVersion }) {
      const blocked = gate("closeLoginGate", expectedVersion);
      if (blocked) return blocked;
      if (!isWriteFencePhase(state.phase)) return { ok: false, code: "STATE_CONFLICT" };
      if (!activeFaults.loginGateStaysOpen) state.loginGate = "CLOSED";
      state.version += 1;
      return { ok: true };
    },
    async startDrain({ expectedVersion }) {
      const blocked = edge("startDrain", expectedVersion);
      if (blocked) return blocked;
      state.drainStartedAt = iso(clock.nowMs());
      bump("DRAINING");
      return { ok: true };
    },
    async quiesce({ expectedVersion }) {
      const blocked = edge("quiesce", expectedVersion);
      if (blocked) return blocked;
      state.quiescentAt = iso(clock.nowMs());
      bump("QUIESCENT");
      return { ok: true };
    },
    async startBackup({ expectedVersion }) {
      const blocked = edge("startBackup", expectedVersion);
      if (blocked) return blocked;
      bump("BACKING_UP");
      return { ok: true };
    },
    async startMigrating({ expectedVersion }) {
      const blocked = edge("startMigrating", expectedVersion);
      if (blocked) return blocked;
      bump("MIGRATING");
      return { ok: true };
    },
    async startSmoke({ expectedVersion }) {
      const blocked = edge("startSmoke", expectedVersion);
      if (blocked) return blocked;
      bump("SMOKE");
      return { ok: true };
    },
    async completeNormal({ expectedVersion }) {
      const blocked = gate("completeNormal", expectedVersion);
      if (blocked) return blocked;
      if (state.phase !== "SMOKE") return { ok: false, code: "STATE_CONFLICT" };
      state.binding = { releaseId: null, targetSha: null, planKind: null, dbPlanId: null };
      state.fenceEffectiveAt = null;
      state.noticeStartedAt = null;
      state.drainStartedAt = null;
      state.quiescentAt = null;
      bump("NORMAL");
      return { ok: true };
    },
    async openLoginGate({ expectedVersion }) {
      const blocked = gate("openLoginGate", expectedVersion);
      if (blocked) return blocked;
      if (state.phase !== "NORMAL") return { ok: false, code: "STATE_CONFLICT" };
      if (!activeFaults.loginGateStaysClosed) state.loginGate = "OPEN";
      state.version += 1;
      return { ok: true };
    },
    async markFailed({ expectedVersion }) {
      const blocked = gate("markFailed", expectedVersion);
      if (blocked) return blocked;
      if (!isWriteFencePhase(state.phase)) return { ok: false, code: "STATE_CONFLICT" };
      bump("FAILED");
      return { ok: true };
    },
    async abortToNormal({ expectedVersion }) {
      const blocked = gate("abortToNormal", expectedVersion);
      if (blocked) return blocked;
      if (state.phase === "MIGRATING" || state.phase === "SMOKE") return { ok: false, code: "STATE_CONFLICT" };
      state.binding = { releaseId: null, targetSha: null, planKind: null, dbPlanId: null };
      state.fenceEffectiveAt = null;
      state.noticeStartedAt = null;
      state.drainStartedAt = null;
      state.quiescentAt = null;
      state.epoch += 1;
      bump("NORMAL");
      return { ok: true };
    },
  };
  return port;
}

/** Probes FAKE (somente leitura). cfg mutável entre chamadas do pipeline. */
export function createFakeProbes({ clock, maintenance }) {
  const cfg = {
    alive: 0,
    heartbeatAfterClose: 0,
    inFlight: 0,
    inFlightCoverageComplete: true,
    sessionUnavailable: false,
    inFlightUnavailable: false,
    proofGenerationOffset: 0,
    proofAgeMs: 0,
    coverage: "COMPLETE",
    coverageEvidence: null,
  };
  return {
    enabled: true,
    transport: SYNTHETIC,
    cfg,
    async readSessionZeroProof() {
      if (cfg.sessionUnavailable) return { ok: false, unavailable: true, errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE" };
      const at = clock.nowMs();
      return {
        ok: true,
        unavailable: false,
        aliveSessionCount: cfg.alive,
        staleSessionCount: 0,
        heartbeatAfterGateCloseCount: cfg.heartbeatAfterClose,
        evaluatedAt: iso(at - cfg.proofAgeMs),
        maintenanceEpoch: maintenance.state.epoch,
        maintenanceGeneration: maintenance.state.version + cfg.proofGenerationOffset,
      };
    },
    async readInFlight() {
      if (cfg.inFlightUnavailable) return { ok: false, errorCode: "IN_FLIGHT_REGISTRY_UNAVAILABLE" };
      return {
        ok: true,
        coverageComplete: cfg.inFlightCoverageComplete,
        inFlightCount: cfg.inFlight,
        evaluatedAt: iso(clock.nowMs()),
      };
    },
    async readWriteFenceCoverage() {
      if (cfg.coverageEvidence) return cfg.coverageEvidence;
      const at = clock.nowMs();
      return cfg.coverage === "COMPLETE"
        ? buildSyntheticCompleteCoverageEvidence({ nowMs: at })
        : buildCurrentCodeCoverageEvidence({ nowMs: at });
    },
  };
}

/** Backup FAKE. behavior: OK | FAIL | AMBIGUOUS | THROW | PITR | DAILY. */
export function createFakeBackup({ clock, log, behavior = "OK", variant = "valid" }) {
  const runs = [];
  const port = {
    enabled: true,
    transport: SYNTHETIC,
    behavior,
    variant,
    runs,
    createCalls: 0,
    async createBackup({ binding, mode }) {
      port.createCalls += 1;
      log.push("backup:create");
      if (port.behavior === "THROW") throw new Error("BACKUP_CONNECTION_LOST");
      if (port.behavior === "AMBIGUOUS") return { outcome: "AMBIGUOUS", mode };
      if (port.behavior === "FAIL") return { outcome: "FAILED", mode, failureCode: "BACKUP_TOOL_EXIT" };
      if (port.behavior === "PITR") return { outcome: "CREATED", mode: "PITR_RECOVERY_POINT", manifest: null };
      if (port.behavior === "DAILY") return { outcome: "CREATED", mode: "MANAGED_DAILY", manifest: null };
      const claimed = port.variant === "wrongCorrelation" ? { ...binding, correlationId: OTHER_CORR } : binding;
      const planned = buildLogicalSnapshotPlan({ ...claimed, requireAuthStorageCustomization: false });
      if (!planned.ok) throw new Error(`fixture backup plan failed: ${planned.failureCode}`);
      let manifest = createManifestSkeleton(planned.plan);
      const startedAt = iso(clock.nowMs());
      clock.advance(1 * SEC);
      for (const artifact of manifest.artifacts) {
        const content = KIND_CONTENT[artifact.kind];
        manifest = withArtifactResult(manifest, artifact.kind, {
          size: content.length,
          sha256: sha256hex(content),
          createdAt: iso(clock.nowMs()),
          toolVersion: "fixture-1.0",
          postgresVersion: "17.6",
          status: "COMPLETE",
        });
      }
      clock.advance(1 * SEC);
      manifest = { ...manifest, snapshotStartedAt: startedAt, snapshotCompletedAt: iso(clock.nowMs()) };
      return { outcome: "CREATED", mode: "LOGICAL_SNAPSHOT", manifest };
    },
    async observeArtifacts({ manifest }) {
      log.push("backup:observe");
      const observations = {};
      for (const artifact of manifest?.artifacts ?? []) {
        const content = KIND_CONTENT[artifact.kind];
        observations[artifact.kind] = {
          exists: true,
          size: content.length,
          sha256: port.variant === "hashMismatch" ? sha256hex(`${content}tampered`) : sha256hex(content),
          formatCheck: { method: "SQL_TERMINATOR", ok: true },
        };
      }
      return observations;
    },
    async recordVerification({ binding, verification, evidence }) {
      log.push("backup:record");
      runs.push({
        mode: "LOGICAL_SNAPSHOT",
        status: "VERIFIED",
        correlationId: binding.correlationId,
        planId: binding.planId,
        executionId: binding.executionId,
        targetReleaseSha: binding.targetReleaseSha,
        environment: binding.environment,
        projectRef: binding.projectRef,
        quiescenceAt: binding.quiescenceAt,
        integrity: port.variant === "noIntegrity" ? null : evidence,
        verificationLevel: verification.level,
      });
      return { ok: true };
    },
    async readEvidence() {
      return { ok: true, evaluatedAt: iso(clock.nowMs()), runs: structuredClone(runs) };
    },
  };
  return port;
}

/** Migration FAKE. script[order]: SUCCESS | FAILED | AMBIGUOUS | THROW | TIMEOUT | NOT_COMMITTED_THROW | fn. */
export function createFakeMigration({ bundle, log, clock, script = {} }) {
  const commits = new Map();
  const port = {
    enabled: true,
    transport: SYNTHETIC,
    applyPrimitive: "APPLY_MIGRATION_ADAPTER",
    script,
    drift: {},
    applyCalls: [],
    calls: { describe: 0, apply: 0, readCommitState: 0, executeSql: 0 },
    async describeMigration({ order }) {
      port.calls.describe += 1;
      const item = bundle.items[order - 1];
      if (!item) return { ok: false };
      const base = { ok: true, filename: item.filename, gitBlob: item.gitBlob, sha256: item.sha256, bytes: item.bytes };
      return port.drift[order] ? { ...base, ...port.drift[order] } : base;
    },
    async applyOneMigration(request) {
      const order = request.migration.order;
      port.calls.apply += 1;
      port.applyCalls.push({ order, idempotencyKey: request.idempotencyKey });
      log.push(`migration:apply:${order}`);
      const mode = typeof port.script[order] === "function" ? await port.script[order](request) : (port.script[order] ?? "SUCCESS");
      if (mode === "THROW") throw new Error("APPLY_TRANSPORT_LOST");
      if (mode === "TIMEOUT") {
        const error = new Error("APPLY_TIMEOUT");
        error.name = "TimeoutError";
        throw error;
      }
      if (mode === "NOT_COMMITTED_THROW") throw new MigrationNotCommittedError("SYNTAX_ERROR", { code: "SQL_SYNTAX" });
      if (mode === "FAILED") return { result: APPLY_RESULTS.FAILED_NOT_COMMITTED, reasonCode: "SQL_ERROR" };
      if (mode === "AMBIGUOUS") return { result: APPLY_RESULTS.AMBIGUOUS_UNKNOWN_COMMIT, reasonCode: "CONNECTION_RESET" };
      if (mode === "GARBAGE") return { status: "ok" };
      commits.set(order, true);
      return { result: APPLY_RESULTS.SUCCESS_COMMITTED };
    },
    async readCommitState({ order }) {
      port.calls.readCommitState += 1;
      return { ok: true, commitState: commits.get(order) ? "COMMITTED" : "NOT_COMMITTED" };
    },
    /** Simula um commit que o pipeline NÃO viu (resultado perdido). */
    __commitSilently(order) {
      commits.set(order, true);
    },
  };
  void clock;
  return port;
}

export function createFakeSmoke({ log, result = "PASS" }) {
  const port = {
    enabled: true,
    transport: SYNTHETIC,
    result,
    calls: 0,
    async run({ executionId }) {
      port.calls += 1;
      log.push("smoke:run");
      if (port.result === "THROW") throw new Error("SMOKE_NETWORK");
      return { result: port.result, executionId };
    },
  };
  return port;
}

export function createFakeVerifier({ log, ok = true, checks = {} }) {
  const port = {
    enabled: true,
    transport: SYNTHETIC,
    ok,
    checks,
    calls: 0,
    async verifyPostMigration() {
      port.calls += 1;
      log.push("verify:run");
      return {
        ok: port.ok,
        checks: { migrationHistory: true, schemaEvidence: true, noResidue: true, ...port.checks },
      };
    },
  };
  return port;
}

/** Mundo completo: stores I2C1 + steps + fakes + claim válido feito. */
export async function createPipelineWorld({
  bundle = buildPlan({ status: "APPROVED" }),
  worker = "worker-a",
  maintenanceFaults = {},
  backupBehavior = "OK",
  backupVariant = "valid",
  migrationScript = {},
  smokeResult = "PASS",
  verifierOk = true,
  policy = {},
  collectorOptions = {},
  claim = true,
} = {}) {
  const world = createWorld({ bundles: [bundle], collectorOptions });
  const log = [];
  const clock = world.clock;

  // plan store ganha CAS de transição (o I2C1 só tinha leitura).
  const planTransitions = [];
  world.planStore.transitionPlanRow = async ({ id, fromStatus, expectedUpdatedAt, expectedPlanHash, patch }) => {
    const current = await world.planStore.getPlanRow(id);
    if (!current.ok) return { ok: false, error: "PLAN_CONFLICT" };
    const { row } = current;
    if (row.status !== fromStatus
      || (expectedUpdatedAt && row.updated_at !== expectedUpdatedAt)
      || (expectedPlanHash && row.plan_hash !== expectedPlanHash)) {
      return { ok: false, error: "PLAN_CONFLICT" };
    }
    world.planStore.__patchRow(id, patch);
    planTransitions.push({ from: fromStatus, to: patch.status });
    log.push(`plan:${patch.status}`);
    return { ok: true, row: (await world.planStore.getPlanRow(id)).row };
  };

  const execOriginal = world.executionStore.conditionalTransition.bind(world.executionStore);
  world.executionStore.conditionalTransition = async (args) => {
    const result = await execOriginal(args);
    if (result.ok && args.patch?.status) log.push(`exec:${args.patch.status}`);
    return result;
  };
  const releaseOriginal = world.executionStore.releaseLock.bind(world.executionStore);
  world.executionStore.releaseLock = async (args) => {
    const result = await releaseOriginal(args);
    if (result.ok) log.push("lock:released");
    return result;
  };

  const stepStore = createMemoryStepStore();
  const maintenance = createFakeMaintenance({ clock, log, faults: maintenanceFaults });
  const probes = createFakeProbes({ clock, maintenance });
  const backup = createFakeBackup({ clock, log, behavior: backupBehavior, variant: backupVariant });
  const migration = createFakeMigration({ bundle, log, clock, script: migrationScript });
  const smoke = createFakeSmoke({ log, result: smokeResult });
  const verifier = createFakeVerifier({ log, ok: verifierOk });
  const ports = { maintenance, probes, backup, migration, smoke, verifier };

  const depsFor = (workerId = worker, extra = {}) => ({
    executionStore: world.executionStore,
    planStore: world.planStore,
    stepStore,
    collectEvidence: world.collectEvidence,
    clock,
    audit: world.audit,
    worker: { id: workerId },
    ports,
    policy,
    ...extra,
  });

  const pipeline = {
    ...world,
    bundle,
    log,
    stepStore,
    maintenance,
    probes,
    backup,
    migration,
    smoke,
    verifier,
    ports,
    planTransitions,
    depsFor,
    execution: null,
    leaseGeneration: null,
    executionId: null,
    request() {
      return { executionId: pipeline.executionId, leaseGeneration: pipeline.leaseGeneration };
    },
    execRecord() {
      return world.executionStore.snapshot().executions.find((item) => item.id === pipeline.executionId);
    },
    planStatus() {
      return world.planStore.getPlanRow(bundle.id).then((read) => read.row.status);
    },
    locks() {
      return world.executionStore.snapshot().locks;
    },
    auditTypes() {
      return world.audit.events.map((event) => event.eventType);
    },
  };

  if (claim) {
    const claimed = await claimDbReleaseExecution(
      claimRequest(bundle, { correlationId: CORR_1 }),
      world.depsFor(worker),
    );
    if (!claimed.ok) throw new Error(`fixture claim falhou: ${claimed.code}`);
    pipeline.execution = claimed.execution;
    pipeline.executionId = claimed.execution.executionId;
    pipeline.leaseGeneration = claimed.execution.leaseGeneration;
  }
  return pipeline;
}
