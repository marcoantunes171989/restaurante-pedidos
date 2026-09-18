import { describe, expect, it } from "vitest";
import {
  ALWAYS_REQUIRED_READINESS_GATES,
} from "../../server/db-release-contract.js";
import {
  RUNTIME_EVIDENCE_FRESHNESS_MS,
  buildReadinessSnapshot,
  derivePlanGates,
} from "../../server/db-release-readiness.js";
import { evaluateDbReleaseReadiness } from "../../server/db-release-readiness-store.js";
import { computePlanHash } from "../../server/db-release-plan-hash.js";

const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
const TARGET = "a".repeat(40);
const BASE = "b".repeat(40);
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const MIGRATIONS = [
  {
    order: 1,
    filename: "160_db_release_orchestrator_foundation.sql",
    gitBlob: "c".repeat(40),
    sha256: "d".repeat(64),
    bytes: 42,
    classification: "REVIEW_REQUIRED",
  },
];
const PLAN_HASH = computePlanHash({
  environment: "HML",
  targetReleaseSha: TARGET,
  baseSha: BASE,
  migrations: MIGRATIONS,
});

function iso(ms = NOW) {
  return new Date(ms).toISOString();
}

function until(ms = NOW) {
  return new Date(ms + RUNTIME_EVIDENCE_FRESHNESS_MS).toISOString();
}

function gateByKey(gates, key) {
  return gates.find((gate) => gate.key === key);
}

function planEvidence(status, extras = {}) {
  return {
    ok: true,
    id: "44444444-4444-4444-8444-444444444444",
    status,
    environment: "HML",
    targetReleaseSha: TARGET,
    baseSha: BASE,
    planHash: PLAN_HASH,
    approvedAt: extras.approvedAt || null,
    approvedBy: extras.approvedBy || null,
    scheduledAt: extras.scheduledAt || null,
    readinessGeneration: extras.readinessGeneration || 1,
    migrations: extras.migrations || MIGRATIONS,
    evaluatedAt: iso(NOW),
  };
}

const healthyAdapters = {
  git: async () => ({ ok: true, releaseSha: TARGET, baseSha: BASE, drift: false, evaluatedAt: iso(NOW) }),
  maintenance: async () => ({
    ok: true,
    phase: "QUIESCENT",
    version: 4,
    epoch: 1,
    loginGate: "CLOSED",
    fenceEffectiveAt: iso(NOW - 1000),
    evaluatedAt: iso(NOW),
  }),
  sessionZero: async () => ({
    ok: true,
    aliveSessionCount: 0,
    heartbeatAfterGateCloseCount: 0,
    evaluatedAt: iso(NOW),
  }),
  inFlight: async () => ({ ok: true, coverageComplete: false, inFlightCount: 0, evaluatedAt: iso(NOW) }),
};

describe("db-release-plan — integração de readiness", () => {
  it("DRAFT não congela migrations", () => {
    const gates = derivePlanGates(planEvidence("DRAFT", { migrations: [] }), { nowMs: NOW });
    expect(gateByKey(gates, "MIGRATION_SET_FROZEN").status).toBe("PENDING");
    expect(gateByKey(gates, "MIGRATION_IDENTITY_VERIFIED").status).toBe("PENDING");
    expect(gateByKey(gates, "HUMAN_APPROVAL_VALID").status).toBe("PENDING");
  });

  it("VALIDATED congela identidade e não aprova", () => {
    const snapshot = buildReadinessSnapshot({
      nowMs: NOW,
      releaseSha: TARGET,
      baseSha: BASE,
      planId: "44444444-4444-4444-8444-444444444444",
      evidence: { plan: planEvidence("VALIDATED") },
    });
    expect(gateByKey(snapshot.gates, "MIGRATION_SET_FROZEN").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "MIGRATION_IDENTITY_VERIFIED").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "HUMAN_APPROVAL_VALID").status).toBe("PENDING");
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(snapshot.ready).toBe(false);
  });

  it("APPROVED verifica aprovação humana e continua not-ready", () => {
    const snapshot = buildReadinessSnapshot({
      nowMs: NOW,
      releaseSha: TARGET,
      baseSha: BASE,
      planId: "44444444-4444-4444-8444-444444444444",
      evidence: {
        plan: planEvidence("APPROVED", {
          approvedAt: iso(NOW),
          approvedBy: ACTOR_ID,
        }),
      },
    });
    expect(gateByKey(snapshot.gates, "HUMAN_APPROVAL_VALID").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "HUMAN_APPROVAL_VALID").expiresAt).toBe(until(NOW));
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "PROD_BASELINE_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "EXECUTOR_HEALTHY").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "LOCK_ACQUIRED").status).toBe("UNKNOWN");
    expect(snapshot.ready).toBe(false);
    expect(snapshot.overallStatus).not.toBe("READY");
  });

  it("SCHEDULED torna a janela aplicável sem ficar ready", () => {
    const snapshot = buildReadinessSnapshot({
      nowMs: NOW,
      releaseSha: TARGET,
      baseSha: BASE,
      scheduled: true,
      evidence: {
        plan: planEvidence("SCHEDULED", {
          approvedAt: iso(NOW),
          approvedBy: ACTOR_ID,
          scheduledAt: iso(NOW + 120_000),
        }),
      },
    });
    const window = gateByKey(snapshot.gates, "SCHEDULE_WINDOW_VALID");
    expect(window.applicable).toBe(true);
    expect(window.status).toBe("PENDING");
    expect(window.reasonCode).toBe("SCHEDULE_INTENT_RECORDED");
    expect(snapshot.ready).toBe(false);
  });

  it("APPROVED PLAN != DB_RELEASE_READY mesmo com adapters saudáveis", async () => {
    const snapshot = await evaluateDbReleaseReadiness({
      nowMs: NOW,
      releaseSha: TARGET,
      planId: "44444444-4444-4444-8444-444444444444",
      adapters: {
        ...healthyAdapters,
        plan: async () => planEvidence("APPROVED", {
          approvedAt: iso(NOW),
          approvedBy: ACTOR_ID,
        }),
      },
    });
    expect(gateByKey(snapshot.gates, "MIGRATION_SET_FROZEN").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "HUMAN_APPROVAL_VALID").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "PROD_BASELINE_VERIFIED").status).toBe("UNKNOWN");
    expect(ALWAYS_REQUIRED_READINESS_GATES.every((key) => (
      snapshot.gates.some((gate) => gate.key === key && gate.applicable === true)
    ))).toBe(true);
    expect(snapshot.ready).toBe(false);
    expect(snapshot.overallStatus).not.toBe("READY");
  });
});
