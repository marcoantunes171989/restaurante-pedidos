import { describe, expect, it } from "vitest";
import {
  SCHEMA_SAFETY_VALIDATOR_VERSION,
  analyzeMigrationSet,
  bindSafetyEvidence,
} from "../../server/db-migration-safety.js";
import { createMemorySafetyStore, toValidationResultRow } from "../../server/db-migration-safety-store.js";
import { buildReadinessSnapshot, deriveSchemaSafetyGates } from "../../server/db-release-readiness.js";
import { evaluateDbReleaseReadiness } from "../../server/db-release-readiness-store.js";

const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);

function iso(ms = NOW) {
  return new Date(ms).toISOString();
}

function gateByKey(gates, key) {
  return gates.find((gate) => gate.key === key);
}

function evidenceFromSql(sql, extras = {}) {
  const analysis = analyzeMigrationSet([{ filename: "a.sql", sql, order: 1, ...extras.identity }]);
  return bindSafetyEvidence({
    analysis,
    planHash: extras.planHash || null,
    evaluatedAt: iso(NOW),
  });
}

describe("db-migration-safety — readiness gates", () => {
  it("SAFE_AUTO verifica os três gates estáticos sem tornar overall ready", () => {
    const schemaSafety = evidenceFromSql("comment on table public.t is 'x';");
    const snapshot = buildReadinessSnapshot({
      nowMs: NOW,
      evidence: { schemaSafety },
    });
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "NO_DML").status).toBe("VERIFIED");
    expect(gateByKey(snapshot.gates, "NO_DESTRUCTIVE_DDL").status).toBe("VERIFIED");
    expect(snapshot.ready).toBe(false);
    expect(gateByKey(snapshot.gates, "BACKUP_VERIFIED").status).toBe("UNKNOWN");
  });

  it("REVIEW_REQUIRED não verifica SCHEMA_SAFETY_PASS automaticamente", () => {
    const schemaSafety = evidenceFromSql("create index t_idx on public.t (id);");
    const gates = deriveSchemaSafetyGates(schemaSafety, { nowMs: NOW });
    expect(gateByKey(gates, "SCHEMA_SAFETY_PASS").status).toBe("PENDING");
    expect(gateByKey(gates, "SCHEMA_SAFETY_PASS").reasonCode).toBe("SCHEMA_REVIEW_REQUIRED");
    expect(gateByKey(gates, "NO_DML").status).toBe("VERIFIED");
    expect(gateByKey(gates, "NO_DESTRUCTIVE_DDL").status).toBe("VERIFIED");
  });

  it("PROHIBITED falha SCHEMA_SAFETY_PASS e NO_DML quando há DML", () => {
    const schemaSafety = evidenceFromSql("insert into public.t values (1);");
    const gates = deriveSchemaSafetyGates(schemaSafety, { nowMs: NOW });
    expect(gateByKey(gates, "SCHEMA_SAFETY_PASS").status).toBe("FAILED");
    expect(gateByKey(gates, "NO_DML").status).toBe("FAILED");
  });

  it("evidência ausente permanece UNKNOWN; stale por versão", () => {
    expect(deriveSchemaSafetyGates({ absent: true }, { nowMs: NOW })).toEqual([]);
    const stale = deriveSchemaSafetyGates({
      ok: true,
      validatorVersion: "old",
      overallClassification: "SAFE_AUTO",
      allSafe: true,
      dmlCount: 0,
      destructiveDdlCount: 0,
    }, { nowMs: NOW });
    expect(gateByKey(stale, "SCHEMA_SAFETY_PASS").status).toBe("STALE");
  });

  it("store em memória persiste o contrato de app_schema_validation_results", async () => {
    const analysis = analyzeMigrationSet([{ filename: "a.sql", sql: "comment on table public.t is 'x';" }]);
    const store = createMemorySafetyStore();
    const row = toValidationResultRow(analysis.results[0], {
      planId: "44444444-4444-4444-8444-444444444444",
      validatedAt: iso(NOW),
    });
    expect(row.validator_version).toBe(SCHEMA_SAFETY_VALIDATOR_VERSION);
    expect(row.result).toBe("PASS");
    expect(row.classification).toBe("SAFE_AUTO");
    const inserted = await store.insertValidationResults([row]);
    expect(inserted.ok).toBe(true);
    const listed = await store.listValidationResults({ planId: row.plan_id });
    expect(listed.rows).toHaveLength(1);
  });

  it("adapter schemaSafety no evaluateDbReleaseReadiness não deixa ready=true sozinho", async () => {
    const snapshot = await evaluateDbReleaseReadiness({
      nowMs: NOW,
      adapters: {
        git: async () => ({ ok: true, releaseSha: "a".repeat(40), baseSha: "b".repeat(40), drift: false, evaluatedAt: iso(NOW) }),
        schemaSafety: async () => evidenceFromSql("comment on table public.t is 'x';"),
      },
    });
    expect(gateByKey(snapshot.gates, "SCHEMA_SAFETY_PASS").status).toBe("VERIFIED");
    expect(snapshot.ready).toBe(false);
  });
});
