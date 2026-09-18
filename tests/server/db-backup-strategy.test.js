import { describe, expect, it } from "vitest";
import {
  BACKUP_MODES,
  BACKUP_MODE,
  BACKUP_STATES,
  BACKUP_STRATEGY_CLASS,
  BACKUP_STATUSES,
  FAILURE_CODES,
  KNOWN_PROJECT_REFS,
  PROVIDER_CAPABILITIES,
  VERIFICATION_LEVELS,
  checkBackupIdentity,
} from "../../server/db-backup-contract.js";
import { normalizeCapabilities, selectBackupStrategy } from "../../server/db-backup-strategy.js";
import { BACKUP_STATUSES as RELEASE_BACKUP_STATUSES } from "../../server/db-release-contract.js";
import { HML_REF, NOW, PROD_REF, capabilities, iso } from "./helpers/db-backup-fixtures.js";

const select = (caps, options = {}) => selectBackupStrategy(caps, { nowMs: NOW, ...options });

describe("db-backup-contract — constantes canônicas", () => {
  it("modos, níveis e classe de estratégia congelados", () => {
    expect(BACKUP_MODES).toEqual(["MANAGED_DAILY", "PITR_RECOVERY_POINT", "LOGICAL_SNAPSHOT", "DUAL"]);
    expect(VERIFICATION_LEVELS).toEqual(["L1", "L2", "L3"]);
    expect(BACKUP_STRATEGY_CLASS).toBe("ADAPTIVE");
    expect(Object.isFrozen(BACKUP_MODES)).toBe(true);
  });

  it("reutiliza BACKUP_STATUSES do contrato I1A (sem segunda lista)", () => {
    expect(BACKUP_STATES).toBe(RELEASE_BACKUP_STATUSES);
    expect(BACKUP_STATUSES).toBe(RELEASE_BACKUP_STATUSES);
    expect(BACKUP_STATES).toEqual(["REQUESTED", "RUNNING", "COMPLETED", "VERIFYING", "VERIFIED", "FAILED"]);
  });

  it("FAILURE_CODES cobre os códigos exigidos, sem duplicatas", () => {
    for (const code of [
      "BACKUP_CAPABILITY_UNAVAILABLE", "BACKUP_PROJECT_MISMATCH", "BACKUP_STRATEGY_UNAVAILABLE",
      "BACKUP_CREATE_FAILED", "BACKUP_VERIFY_FAILED", "BACKUP_EVIDENCE_MISSING", "BACKUP_EVIDENCE_STALE",
      "BACKUP_ARTIFACT_MISSING", "BACKUP_HASH_MISMATCH", "BACKUP_FORMAT_INVALID", "PITR_DISABLED",
      "PITR_RANGE_UNKNOWN", "PITR_RECOVERY_POINT_STALE", "RESTORE_NOT_ENABLED", "RESTORE_REHEARSAL_REQUIRED",
    ]) {
      expect(FAILURE_CODES).toContain(code);
    }
    expect(new Set(FAILURE_CODES).size).toBe(FAILURE_CODES.length);
  });

  it("HML e PROD têm project refs distintos e distinguíveis", () => {
    expect(KNOWN_PROJECT_REFS.HML).not.toBe(KNOWN_PROJECT_REFS.PROD);
    expect(checkBackupIdentity({ environment: "HML", projectRef: HML_REF }).ok).toBe(true);
    expect(checkBackupIdentity({ environment: "PROD", projectRef: PROD_REF }).ok).toBe(true);
    const crossed = checkBackupIdentity({ environment: "PROD", projectRef: HML_REF });
    expect(crossed.ok).toBe(false);
    expect(crossed.failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(checkBackupIdentity({ environment: "STAGING", projectRef: PROD_REF }).ok).toBe(false);
  });
});

describe("db-backup-strategy — modelo de capabilities", () => {
  it("ausente permanece UNKNOWN (nunca false)", () => {
    const normalized = normalizeCapabilities({ environment: "PROD", projectRef: PROD_REF });
    for (const key of PROVIDER_CAPABILITIES) expect(normalized.capabilities[key]).toBe("UNKNOWN");
    expect(normalized.tools).toEqual({ supabaseCli: "UNKNOWN", pgDump: "UNKNOWN", psql: "UNKNOWN" });
  });

  it("valores não-booleanos (string, número) viram UNKNOWN", () => {
    const normalized = normalizeCapabilities(capabilities({ pitrEnabled: "true", logicalSnapshotSupported: 1 }));
    expect(normalized.capabilities.pitrEnabled).toBe("UNKNOWN");
    expect(normalized.capabilities.logicalSnapshotSupported).toBe("UNKNOWN");
  });

  it("vincula environment/projectRef/observedAt e rejeita formatos inválidos", () => {
    const ok = normalizeCapabilities(capabilities({ postgresVersion: "17.6" }));
    expect(ok).toMatchObject({ environment: "PROD", projectRef: PROD_REF, postgresVersion: "17.6" });
    const bad = normalizeCapabilities({ environment: "DEV", projectRef: "x", postgresVersion: "17; drop" });
    expect(bad.environment).toBeNull();
    expect(bad.projectRef).toBeNull();
    expect(bad.postgresVersion).toBeNull();
  });
});

describe("db-backup-strategy — seletor adaptativo", () => {
  it("logical apenas → LOGICAL_SNAPSHOT", () => {
    const result = select(capabilities());
    expect(result.ok).toBe(true);
    expect(result.mode).toBe(BACKUP_MODE.LOGICAL_SNAPSHOT);
    expect(result.runModes).toEqual(["LOGICAL_SNAPSHOT"]);
    expect(result.supplemental.pitr).toBe("NOT_AVAILABLE");
  });

  it("logical + PITR habilitado com range conhecido → DUAL", () => {
    const result = select(capabilities({ pitrSupported: true, pitrEnabled: true, recoveryPointRangeKnown: true }));
    expect(result.ok).toBe(true);
    expect(result.mode).toBe(BACKUP_MODE.DUAL);
    expect(result.runModes).toEqual(["LOGICAL_SNAPSHOT", "PITR_RECOVERY_POINT"]);
    expect(result.preMigrationCapable).toBe(true);
  });

  it("PITR UNKNOWN não é presumido: continua LOGICAL_SNAPSHOT, nunca DUAL", () => {
    const result = select(capabilities({ pitrSupported: "UNKNOWN", pitrEnabled: undefined }));
    expect(result.mode).toBe(BACKUP_MODE.LOGICAL_SNAPSHOT);
    expect(result.supplemental.pitr).toBe("UNKNOWN");
  });

  it("daily apenas → fail closed (insuficiente)", () => {
    const result = select(capabilities({ logicalSnapshotSupported: false, managedDailySupported: true }));
    expect(result.ok).toBe(false);
    expect(result.mode).toBeNull();
    expect(result.failureCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
    expect(result.preMigrationCapable).toBe(false);
  });

  it("PITR apenas → insuficiente na política atual", () => {
    const result = select(capabilities({
      logicalSnapshotSupported: false,
      managedDailySupported: false,
      pitrSupported: true,
      pitrEnabled: true,
      recoveryPointRangeKnown: true,
    }));
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
  });

  it("nada suportado → BACKUP_STRATEGY_UNAVAILABLE", () => {
    const result = select(capabilities({ logicalSnapshotSupported: false, managedDailySupported: false }));
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("BACKUP_STRATEGY_UNAVAILABLE");
  });

  it("tudo UNKNOWN → fail closed", () => {
    const result = select({ environment: "PROD", projectRef: PROD_REF, observedAt: iso(NOW - 1000) });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("BACKUP_CAPABILITY_UNKNOWN");
    expect(select(null).ok).toBe(false);
    expect(select(undefined).ok).toBe(false);
  });

  it("project mismatch → fail closed", () => {
    const crossed = select(capabilities({ projectRef: HML_REF }));
    expect(crossed.ok).toBe(false);
    expect(crossed.failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    const envMismatch = select(capabilities(), { expectedEnvironment: "HML" });
    expect(envMismatch.failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(select(capabilities({ projectRef: null })).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
  });

  it("observação vencida, futura ou sem observedAt → BACKUP_EVIDENCE_STALE", () => {
    expect(select(capabilities({ observedAt: iso(NOW - 10 * 60_000) })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
    expect(select(capabilities({ observedAt: iso(NOW + 60_000) })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
    expect(select(capabilities({ observedAt: undefined })).failureCode).toBe("BACKUP_EVIDENCE_STALE");
  });

  it("requestedMode MANAGED_DAILY/PITR nunca satisfaz; DUAL sem PITR não faz downgrade silencioso", () => {
    expect(select(capabilities(), { requestedMode: "MANAGED_DAILY" }).failureCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
    expect(select(capabilities(), { requestedMode: "PITR_RECOVERY_POINT" }).failureCode).toBe("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION");
    const dual = select(capabilities(), { requestedMode: "DUAL" });
    expect(dual.ok).toBe(false);
    expect(dual.failureCode).toBe("BACKUP_STRATEGY_UNAVAILABLE");
    expect(dual.mode).toBeNull();
    expect(select(capabilities(), { requestedMode: "NOPE" }).failureCode).toBe("BACKUP_INPUT_INVALID");
  });

  it("LOGICAL_SNAPSHOT explícito é honrado mesmo com PITR disponível (sem upgrade silencioso)", () => {
    const caps = capabilities({ pitrSupported: true, pitrEnabled: true, recoveryPointRangeKnown: true });
    expect(select(caps, { requestedMode: "LOGICAL_SNAPSHOT" }).mode).toBe("LOGICAL_SNAPSHOT");
  });

  it("determinístico: mesma entrada → mesma saída; nenhum resultado é MANAGED_DAILY", () => {
    const caps = capabilities();
    expect(select(caps)).toEqual(select(caps));
    for (const overrides of [{}, { pitrEnabled: true, pitrSupported: true, recoveryPointRangeKnown: true }]) {
      expect(select(capabilities(overrides)).mode).not.toBe("MANAGED_DAILY");
    }
  });
});
