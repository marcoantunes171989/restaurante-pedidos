import { describe, expect, it } from "vitest";
import {
  captureRecoveryPoint,
  evaluateManagedDailyEvidence,
  evaluatePitrRecoveryPoint,
  normalizePitrEvidence,
} from "../../server/db-backup-provider-evidence.js";
import { verifyProviderEvidenceL1, satisfiesPreMigrationBackup } from "../../server/db-backup-verification.js";
import { capturePitrRecoveryPoint } from "../../server/db-backup.js";
import {
  HML_REF,
  MIN,
  NOW,
  PROD_REF,
  QUIESCENCE_AT,
  QUIESCENCE_MS,
  binding,
  iso,
  pitrEvidence,
} from "./helpers/db-backup-fixtures.js";

const evaluate = (evidence, options = {}) => evaluatePitrRecoveryPoint(evidence, {
  environment: "PROD",
  projectRef: PROD_REF,
  quiescenceAt: QUIESCENCE_AT,
  nowMs: NOW,
  ...options,
});

describe("db-backup-provider-evidence — PITR", () => {
  it("normaliza sem rede: ausente → UNKNOWN, timestamps inválidos → null", () => {
    const normalized = normalizePitrEvidence({ pitrEnabled: "yes", earliestRecoveryAt: "lixo" });
    expect(normalized.pitrEnabled).toBe("UNKNOWN");
    expect(normalized.walgEnabled).toBe("UNKNOWN");
    expect(normalized.earliestRecoveryAt).toBeNull();
    expect(normalized.backups).toEqual([]);
  });

  it("PITR desabilitado → não utilizável (PITR_DISABLED)", () => {
    const result = evaluate(pitrEvidence({ pitrEnabled: false }));
    expect(result.usable).toBe(false);
    expect(result.failureCode).toBe("PITR_DISABLED");
    expect(evaluate(pitrEvidence({ walgEnabled: false })).failureCode).toBe("PITR_DISABLED");
  });

  it("pitrEnabled UNKNOWN → fail closed", () => {
    const result = evaluate(pitrEvidence({ pitrEnabled: undefined }));
    expect(result.usable).toBe(false);
    expect(result.failureCode).toBe("BACKUP_CAPABILITY_UNKNOWN");
  });

  it("range ausente ou incoerente → PITR_RANGE_UNKNOWN", () => {
    expect(evaluate(pitrEvidence({ earliestRecoveryAt: undefined })).failureCode).toBe("PITR_RANGE_UNKNOWN");
    expect(evaluate(pitrEvidence({ latestRecoveryAt: undefined })).failureCode).toBe("PITR_RANGE_UNKNOWN");
    expect(evaluate(pitrEvidence({
      earliestRecoveryAt: iso(NOW - MIN),
      latestRecoveryAt: iso(NOW - 2 * MIN),
    })).failureCode).toBe("PITR_RANGE_UNKNOWN");
    expect(evaluate(pitrEvidence({ latestRecoveryAt: iso(NOW + MIN) })).failureCode).toBe("PITR_RANGE_UNKNOWN");
  });

  it("latest recovery point anterior à quiescência → PITR_RECOVERY_POINT_STALE", () => {
    const result = evaluate(pitrEvidence({ latestRecoveryAt: iso(QUIESCENCE_MS - MIN) }));
    expect(result.usable).toBe(false);
    expect(result.failureCode).toBe("PITR_RECOVERY_POINT_STALE");
    expect(result.reason).toBe("LATEST_RECOVERY_BEFORE_QUIESCENCE");
  });

  it("range que começa depois da quiescência não cobre o alvo → stale", () => {
    const result = evaluate(pitrEvidence({ earliestRecoveryAt: iso(QUIESCENCE_MS + MIN) }));
    expect(result.failureCode).toBe("PITR_RECOVERY_POINT_STALE");
  });

  it("evidência observada antes da quiescência não é aceita", () => {
    const result = evaluate(pitrEvidence({ observedAt: iso(QUIESCENCE_MS - 10_000) }), { nowMs: QUIESCENCE_MS });
    expect(result.usable).toBe(false);
    expect(result.failureCode).toBe("PITR_RECOVERY_POINT_STALE");
  });

  it("observação vencida ou futura → BACKUP_EVIDENCE_STALE", () => {
    expect(evaluate(pitrEvidence({ observedAt: iso(NOW - 10 * MIN) })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
    expect(evaluate(pitrEvidence({ observedAt: iso(NOW + MIN) })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
    expect(evaluate(pitrEvidence({ observedAt: undefined })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
  });

  it("project/environment mismatch → falha", () => {
    expect(evaluate(pitrEvidence({ projectRef: HML_REF })).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(evaluate(pitrEvidence({ environment: "HML" })).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(evaluate(pitrEvidence(), { projectRef: HML_REF }).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
  });

  it("quiescência inválida ou futura → BACKUP_QUIESCENCE_INVALID", () => {
    expect(evaluate(pitrEvidence(), { quiescenceAt: "x" }).failureCode).toBe("BACKUP_QUIESCENCE_INVALID");
    expect(evaluate(pitrEvidence(), { quiescenceAt: iso(NOW + MIN) }).failureCode).toBe("BACKUP_QUIESCENCE_INVALID");
  });

  it("ponto fresco e válido → L1 utilizável", () => {
    const result = evaluate(pitrEvidence());
    expect(result.usable).toBe(true);
    expect(result.level).toBe("L1");
    expect(result.satisfiesPreMigration).toBe(false);
  });

  it("captureRecoveryPoint congela alvo/range/capturedAt/projeto sem mutar provider", () => {
    const result = captureRecoveryPoint({
      quiescenceAt: QUIESCENCE_AT,
      providerEvidence: pitrEvidence(),
      environment: "PROD",
      projectRef: PROD_REF,
      nowMs: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe("L1");
    expect(result.recoveryPoint).toMatchObject({
      mode: "PITR_RECOVERY_POINT",
      scope: "DATABASE_RECOVERY",
      environment: "PROD",
      projectRef: PROD_REF,
      recoveryTarget: QUIESCENCE_AT,
      capturedAt: iso(NOW),
    });
    expect(result.recoveryPoint.observedRange.latestRecoveryAt).toBe(pitrEvidence().latestRecoveryAt);
    expect(result.recoveryPoint.providerMetadata.backupEntryCount).toBe(1);
    expect(Object.isFrozen(result.recoveryPoint)).toBe(true);
    // determinístico
    expect(captureRecoveryPoint({
      quiescenceAt: QUIESCENCE_AT, providerEvidence: pitrEvidence(), environment: "PROD", projectRef: PROD_REF, nowMs: NOW,
    })).toEqual(result);
  });

  it("captureRecoveryPoint falha fechado em qualquer evidência inutilizável", () => {
    const result = captureRecoveryPoint({
      quiescenceAt: QUIESCENCE_AT,
      providerEvidence: pitrEvidence({ pitrEnabled: false }),
      environment: "PROD",
      projectRef: PROD_REF,
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.recoveryPoint).toBeNull();
    expect(result.failureCode).toBe("PITR_DISABLED");
  });

  it("serviço captura via binding e rejeita binding inválido", () => {
    expect(capturePitrRecoveryPoint({ binding: binding(), providerEvidence: pitrEvidence(), nowMs: NOW }).ok).toBe(true);
    expect(capturePitrRecoveryPoint({ binding: binding({ projectRef: HML_REF }), providerEvidence: pitrEvidence(), nowMs: NOW }).failureCode)
      .toBe("BACKUP_PROJECT_MISMATCH");
    expect(capturePitrRecoveryPoint({ binding: null, providerEvidence: pitrEvidence(), nowMs: NOW }).ok).toBe(false);
  });
});

describe("db-backup — L1 nunca vira BACKUP_VERIFIED sozinho", () => {
  it("PITR verificado em L1 não satisfaz o backup pré-migration", () => {
    const verification = verifyProviderEvidenceL1({
      mode: "PITR_RECOVERY_POINT",
      evidence: pitrEvidence(),
      expected: binding(),
      nowMs: NOW,
    });
    expect(verification.verified).toBe(true);
    expect(verification.level).toBe("L1");
    expect(verification.satisfiesPreMigration).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: verification.mode, level: verification.level, verified: verification.verified })).toBe(false);
  });

  it("L1 de PITR inválido falha com o código tipado", () => {
    const verification = verifyProviderEvidenceL1({
      mode: "PITR_RECOVERY_POINT",
      evidence: pitrEvidence({ latestRecoveryAt: iso(QUIESCENCE_MS - MIN) }),
      expected: binding(),
      nowMs: NOW,
    });
    expect(verification.verified).toBe(false);
    expect(verification.failureCode).toBe("PITR_RECOVERY_POINT_STALE");
  });

  it("modo DUAL/LOGICAL não é verificável em L1", () => {
    expect(verifyProviderEvidenceL1({ mode: "LOGICAL_SNAPSHOT", evidence: {}, expected: binding(), nowMs: NOW }).verified).toBe(false);
    expect(verifyProviderEvidenceL1({ mode: "DUAL", evidence: {}, expected: binding(), nowMs: NOW }).failureCode).toBe("BACKUP_INPUT_INVALID");
  });
});

describe("db-backup-provider-evidence — managed daily (observabilidade)", () => {
  const daily = (overrides = {}) => ({
    environment: "PROD",
    projectRef: PROD_REF,
    observedAt: iso(NOW - 5_000),
    backupId: "daily-1",
    status: "completed",
    insertedAt: iso(NOW - 60 * MIN),
    physical: true,
    ...overrides,
  });
  const evaluateDaily = (evidence, options = {}) => evaluateManagedDailyEvidence(evidence, {
    environment: "PROD",
    projectRef: PROD_REF,
    nowMs: NOW,
    ...options,
  });

  it("evidência válida é L1 mas NUNCA satisfaz o ponto pré-migration", () => {
    const result = evaluateDaily(daily());
    expect(result.usable).toBe(true);
    expect(result.level).toBe("L1");
    expect(result.satisfiesPreMigration).toBe(false);
    const verification = verifyProviderEvidenceL1({ mode: "MANAGED_DAILY", evidence: daily(), expected: binding(), nowMs: NOW });
    expect(verification.verified).toBe(true);
    expect(verification.satisfiesPreMigration).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: "MANAGED_DAILY", level: "L1", verified: true })).toBe(false);
  });

  it("status não aceitável, sem id ou de outro projeto → falha", () => {
    expect(evaluateDaily(daily({ status: "FAILED" })).failureCode).toBe("BACKUP_VERIFY_FAILED");
    expect(evaluateDaily(daily({ backupId: undefined })).failureCode).toBe("BACKUP_EVIDENCE_MISSING");
    expect(evaluateDaily(daily({ projectRef: HML_REF })).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(evaluateDaily(daily({ observedAt: iso(NOW - 10 * MIN) })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
  });
});
