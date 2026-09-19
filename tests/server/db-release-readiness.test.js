import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_REQUIRED_READINESS_GATES,
  CONDITIONAL_READINESS_GATES,
  REQUIRED_READINESS_GATES,
} from "../../server/db-release-contract.js";
import {
  GATE_FRESHNESS_KIND,
  assembleCanonicalGates,
  buildReadinessSnapshot,
  computeOverallReadiness,
  deriveSessionZeroGate,
  evaluateSnapshotFreshness,
  failClosedSnapshot,
  gateSatisfiesReadiness,
  isBlockingStatus,
  sanitizeReadinessSnapshot,
} from "../../server/db-release-readiness.js";
import { evaluateDbReleaseReadiness } from "../../server/db-release-readiness-store.js";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/db-release-readiness.js"),
  "utf8",
);

const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
const RELEASE_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);

function iso(ms = NOW) {
  return new Date(ms).toISOString();
}

function until(ms = NOW) {
  return new Date(ms + 60_000).toISOString();
}

function verified(key) {
  const kind = GATE_FRESHNESS_KIND[key];
  return {
    key,
    status: "VERIFIED",
    reasonCode: "TEST_VERIFIED",
    message: "evidência explícita de teste",
    evidenceAt: iso(NOW),
    expiresAt: kind === "static_sha" ? null : until(NOW),
  };
}

function allVerified() {
  return REQUIRED_READINESS_GATES.map(verified);
}

function overallFrom(partialGates, extras = {}) {
  const nowMs = extras.nowMs ?? NOW;
  const gates = assembleCanonicalGates(partialGates, {
    scheduled: extras.scheduled === true,
    nowMs,
  });
  const freshness = evaluateSnapshotFreshness({
    evaluatedAt: iso(nowMs),
    nowMs,
    stale: extras.stale === true,
  });
  return {
    ...computeOverallReadiness(gates, { stale: freshness.stale }),
    stale: freshness.stale,
    gates,
  };
}

function gateByKey(gates, key) {
  return gates.find((gate) => gate.key === key);
}

describe("db-release-readiness — contrato canônico", () => {
  it("expõe 16 gates sempre definidos e 1 condicional de schedule", () => {
    expect(REQUIRED_READINESS_GATES).toHaveLength(17);
    expect(ALWAYS_REQUIRED_READINESS_GATES).toHaveLength(16);
    expect(CONDITIONAL_READINESS_GATES).toEqual(["SCHEDULE_WINDOW_VALID"]);
    expect(ALWAYS_REQUIRED_READINESS_GATES).not.toContain("SCHEDULE_WINDOW_VALID");
  });

  it("UNKNOWN, STALE, PENDING, BLOCKED e FAILED bloqueiam", () => {
    expect(isBlockingStatus("UNKNOWN")).toBe(true);
    expect(isBlockingStatus("STALE")).toBe(true);
    expect(isBlockingStatus("PENDING")).toBe(true);
    expect(isBlockingStatus("BLOCKED")).toBe(true);
    expect(isBlockingStatus("FAILED")).toBe(true);
    expect(isBlockingStatus("VERIFIED")).toBe(false);
    expect(gateSatisfiesReadiness({ applicable: true, required: true, status: "UNKNOWN" })).toBe(false);
    expect(gateSatisfiesReadiness({ applicable: true, required: true, status: "VERIFIED" })).toBe(true);
  });
});

describe("db-release-readiness — agregação", () => {
  it("todos os gates aplicáveis VERIFIED → ready=true", () => {
    const result = overallFrom(allVerified(), { scheduled: false });
    expect(result.ready).toBe(true);
    expect(result.overallStatus).toBe("READY");
    expect(gateByKey(result.gates, "SCHEDULE_WINDOW_VALID").applicable).toBe(false);
    expect(result.gates).toHaveLength(17);
  });

  it("scheduled com janela VERIFIED também pode ficar ready", () => {
    const result = overallFrom(allVerified(), { scheduled: true });
    expect(gateByKey(result.gates, "SCHEDULE_WINDOW_VALID").applicable).toBe(true);
    expect(gateByKey(result.gates, "SCHEDULE_WINDOW_VALID").status).toBe("VERIFIED");
    expect(result.ready).toBe(true);
  });

  it("um UNKNOWN → ready=false", () => {
    const gates = allVerified().map((gate) => (
      gate.key === "BACKUP_VERIFIED"
        ? { ...gate, status: "UNKNOWN", reasonCode: "BACKUP_EVIDENCE_UNIMPLEMENTED", expiresAt: until(NOW) }
        : gate
    ));
    const result = overallFrom(gates);
    expect(result.ready).toBe(false);
    expect(result.overallStatus).toBe("UNKNOWN");
  });

  it("um PENDING → ready=false", () => {
    const gates = allVerified().map((gate) => (
      gate.key === "HUMAN_APPROVAL_VALID"
        ? { ...gate, status: "PENDING", reasonCode: "HUMAN_APPROVAL_PENDING", expiresAt: until(NOW) }
        : gate
    ));
    expect(overallFrom(gates).ready).toBe(false);
    expect(overallFrom(gates).overallStatus).toBe("PENDING");
  });

  it("um BLOCKED → ready=false", () => {
    const gates = allVerified().map((gate) => (
      gate.key === "LOGIN_GATE_CLOSED"
        ? { ...gate, status: "BLOCKED", reasonCode: "LOGIN_GATE_OPEN", expiresAt: until(NOW) }
        : gate
    ));
    expect(overallFrom(gates).ready).toBe(false);
    expect(overallFrom(gates).overallStatus).toBe("BLOCKED");
  });

  it("um FAILED → ready=false", () => {
    const gates = allVerified().map((gate) => (
      gate.key === "GIT_SHA_MATCH"
        ? { ...gate, status: "FAILED", reasonCode: "GIT_LOOKUP_FAILED", expiresAt: until(NOW) }
        : gate
    ));
    expect(overallFrom(gates).ready).toBe(false);
    expect(overallFrom(gates).overallStatus).toBe("FAILED");
  });

  it("um STALE → ready=false", () => {
    const gates = allVerified().map((gate) => (
      gate.key === "ACTIVE_SESSION_COUNT_ZERO"
        ? { ...gate, status: "STALE", reasonCode: "EVIDENCE_STALE", expiresAt: until(NOW) }
        : gate
    ));
    expect(overallFrom(gates).ready).toBe(false);
    expect(overallFrom(gates).overallStatus).toBe("STALE");
  });

  it("snapshot stale → ready=false mesmo com gates VERIFIED", () => {
    const result = overallFrom(allVerified(), { stale: true });
    expect(result.stale).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.overallStatus).toBe("STALE");
  });

  it("gate condicional não aplicável não bloqueia", () => {
    const withoutSchedule = allVerified().filter((gate) => gate.key !== "SCHEDULE_WINDOW_VALID");
    const result = overallFrom(withoutSchedule, { scheduled: false });
    expect(gateByKey(result.gates, "SCHEDULE_WINDOW_VALID").applicable).toBe(false);
    expect(result.ready).toBe(true);
  });

  it("gate ausente não desaparece — entra como UNKNOWN e bloqueia", () => {
    const missingBackup = allVerified().filter((gate) => gate.key !== "BACKUP_VERIFIED");
    const result = overallFrom(missingBackup);
    const backup = gateByKey(result.gates, "BACKUP_VERIFIED");
    expect(result.gates).toHaveLength(17);
    expect(backup).toBeTruthy();
    expect(backup.applicable).toBe(true);
    expect(backup.status).toBe("UNKNOWN");
    expect(backup.reasonCode).toBe("MISSING_GATE_EVIDENCE");
    expect(result.ready).toBe(false);
  });

  it("chave duplicada falha fechada", () => {
    const duplicated = [verified("GIT_SHA_MATCH"), { ...verified("GIT_SHA_MATCH"), reasonCode: "OTHER" }, ...allVerified().slice(1)];
    const result = overallFrom(duplicated);
    expect(gateByKey(result.gates, "GIT_SHA_MATCH").status).toBe("FAILED");
    expect(gateByKey(result.gates, "GIT_SHA_MATCH").reasonCode).toBe("DUPLICATE_GATE_KEY");
    expect(result.ready).toBe(false);
  });

  it("falha de provider desconhecido é fail-closed", () => {
    const snapshot = failClosedSnapshot({
      nowMs: NOW,
      releaseSha: RELEASE_SHA,
      baseSha: BASE_SHA,
      reasonCode: "GITHUB_UNAVAILABLE",
    });
    expect(snapshot.ready).toBe(false);
    expect(snapshot.overallStatus).toBe("UNKNOWN");
    expect(snapshot.gates.every((gate) => gate.status !== "VERIFIED" || gate.applicable === false)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/token|password|service.role|authorization/i);
  });
});

describe("db-release-readiness — estado atual de desenvolvimento", () => {
  it("sem evidência de PROD/backup/schema/executor o snapshot não fica ready", () => {
    const snapshot = buildReadinessSnapshot({
      nowMs: NOW,
      releaseSha: RELEASE_SHA,
      baseSha: BASE_SHA,
    });
    expect(snapshot.ready).toBe(false);
    expect(snapshot.stale).toBe(false);
    expect(gateByKey(snapshot.gates, "PROD_BASELINE_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "NO_DML").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "NO_DESTRUCTIVE_DDL").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "EXECUTOR_HEALTHY").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "LOCK_ACQUIRED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "HUMAN_APPROVAL_VALID").status).toBe("PENDING");
    expect(snapshot.gates).toHaveLength(17);
  });

  it("evaluateDbReleaseReadiness com adapters atuais também permanece not-ready", async () => {
    const snapshot = await evaluateDbReleaseReadiness({
      nowMs: NOW,
      releaseSha: RELEASE_SHA,
      adapters: {
        git: async () => ({ ok: true, releaseSha: RELEASE_SHA, baseSha: BASE_SHA, drift: false, evaluatedAt: iso(NOW) }),
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
      },
    });
    expect(snapshot.ready).toBe(false);
    expect(gateByKey(snapshot.gates, "GIT_SHA_MATCH").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "LOGIN_GATE_CLOSED").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "ACTIVE_SESSION_COUNT_ZERO").status).toBe("VERIFIED");
    // PDB-I2C2: phase fenced sozinha NÃO basta — sem evidência de cobertura fica UNKNOWN.
    expect(gateByKey(snapshot.gates, "WRITE_FENCE_ACTIVE")).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "WRITE_FENCE_COVERAGE_EVIDENCE_MISSING",
    });
    expect(gateByKey(snapshot.gates, "IN_FLIGHT_OPERATION_COUNT_ZERO").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "PROD_BASELINE_VERIFIED").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "LOCK_ACQUIRED").status).toBe("UNKNOWN");
  });
});

describe("db-release-readiness — evidência de session-zero", () => {
  it("alive=0 e heartbeatAfterClose=0 pode verificar o gate", () => {
    const gate = deriveSessionZeroGate({
      ok: true,
      aliveSessionCount: 0,
      heartbeatAfterGateCloseCount: 0,
      evaluatedAt: iso(NOW),
    }, { nowMs: NOW });
    expect(gate.status).toBe("VERIFIED");
    expect(gate.reasonCode).toBe("ACTIVE_SESSION_COUNT_ZERO");
  });

  it("alive>0 bloqueia", () => {
    const gate = deriveSessionZeroGate({
      ok: true,
      aliveSessionCount: 2,
      heartbeatAfterGateCloseCount: 0,
      evaluatedAt: iso(NOW),
    }, { nowMs: NOW });
    expect(gate.status).toBe("BLOCKED");
    expect(gate.reasonCode).toBe("ALIVE_SESSIONS_PRESENT");
  });

  it("heartbeatAfterClose>0 bloqueia", () => {
    const gate = deriveSessionZeroGate({
      ok: true,
      aliveSessionCount: 0,
      heartbeatAfterGateCloseCount: 1,
      evaluatedAt: iso(NOW),
    }, { nowMs: NOW });
    expect(gate.status).toBe("BLOCKED");
    expect(gate.reasonCode).toBe("HEARTBEAT_AFTER_GATE_CLOSE");
  });

  it("prova indisponível → UNKNOWN", () => {
    const gate = deriveSessionZeroGate({
      ok: false,
      unavailable: true,
      errorCode: "SESSION_ZERO_PROOF_UNAVAILABLE",
    }, { nowMs: NOW });
    expect(gate.status).toBe("UNKNOWN");
    expect(gate.reasonCode).toBe("SESSION_ZERO_PROOF_UNAVAILABLE");
  });
});

describe("db-release-readiness — adapter throw é fail-closed", () => {
  it("provider que lança não vira ready=true", async () => {
    const snapshot = await evaluateDbReleaseReadiness({
      nowMs: NOW,
      adapters: {
        git: async () => {
          throw new Error("github down");
        },
        maintenance: async () => {
          throw new Error("maintenance down");
        },
        sessionZero: async () => {
          throw new Error("proof down");
        },
        inFlight: async () => {
          throw new Error("ops down");
        },
      },
    });
    expect(snapshot.ready).toBe(false);
    expect(gateByKey(snapshot.gates, "GIT_SHA_MATCH").status).toBe("UNKNOWN");
    expect(gateByKey(snapshot.gates, "ACTIVE_SESSION_COUNT_ZERO").status).toBe("UNKNOWN");
    expect(JSON.stringify(snapshot)).not.toContain("github down");
    expect(JSON.stringify(snapshot)).not.toContain("stack");
  });
});

describe("db-release-readiness — sanitização e pureza", () => {
  it("remove tokens, chaves e headers da evidência", () => {
    const sanitized = sanitizeReadinessSnapshot({
      ready: false,
      overallStatus: "UNKNOWN",
      authorization: "Bearer secret",
      serviceRoleKey: "sr-secret",
      token: "abc",
      gates: [],
    });
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("sr-secret");
    expect(serialized).not.toMatch(/"token"/);
  });

  it("módulo puro não acessa rede, DB nem segredo", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(source).not.toMatch(/GITHUB_READ_TOKEN/);
    expect(source).not.toMatch(/createClient\s*\(/);
    expect(source).not.toMatch(/apply_migration/);
  });
});
