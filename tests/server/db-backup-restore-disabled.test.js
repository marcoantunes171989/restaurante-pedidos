import { describe, expect, it } from "vitest";
import {
  AUTO_BACKUP_RESTORE_READY,
  CREDENTIAL_AUTHORITIES,
  OPERATION_AUTHORITY,
  RESTORE_ENABLED,
  assertCredentialAuthority,
  credentialRefName,
  describeCredential,
} from "../../server/db-backup-contract.js";
import {
  BACKUP_PROVIDER_METHODS,
  RESTORE_PROVIDER_METHODS,
  createBackupProvider,
  createDisabledRestoreSurface,
  restoreDisabledResult,
} from "../../server/db-backup-provider.js";
import { evaluateL3Evidence } from "../../server/db-backup-verification.js";
import {
  HML_REF,
  NOW,
  PROD_REF,
  QUIESCENCE_AT,
  binding,
  iso,
  pitrEvidence,
} from "./helpers/db-backup-fixtures.js";

describe("db-backup — restore hard-disabled", () => {
  it("flags de contrato: restore desabilitado e AUTO_BACKUP_RESTORE_READY=false", () => {
    expect(RESTORE_ENABLED).toBe(false);
    expect(AUTO_BACKUP_RESTORE_READY).toBe(false);
  });

  it("toda a superfície de restore devolve RESTORE_NOT_ENABLED + RESTORE_REHEARSAL_REQUIRED", async () => {
    const surface = createDisabledRestoreSurface();
    for (const method of RESTORE_PROVIDER_METHODS) {
      const result = await surface[method]({ backupId: "x", target: "PROD", confirm: true });
      expect(result.ok).toBe(false);
      expect(result.failureCode).toBe("RESTORE_NOT_ENABLED");
      expect(result.blockedBy).toContain("RESTORE_REHEARSAL_REQUIRED");
      expect(result.rehearsalRequired).toBe(true);
      expect(result.requiredLevel).toBe("L3");
      expect(result.restoreEnabled).toBe(false);
      expect(result.autoBackupRestoreReady).toBe(false);
    }
  });

  it("status de restore não pode se passar por sucesso", async () => {
    const status = await createDisabledRestoreSurface().getRestoreStatus({ restoreId: "r-1" });
    expect(status.ok).toBe(false);
    expect(status.status).toBe("NOT_ENABLED");
    expect(["SUCCEEDED", "COMPLETED", "RUNNING", "VERIFIED"]).not.toContain(status.status);
    expect(restoreDisabledResult("restore")).toEqual(restoreDisabledResult("restore"));
    expect(Object.isFrozen(restoreDisabledResult())).toBe(true);
  });

  it("implementação de restore injetada é IGNORADA — nunca chamada", async () => {
    let called = 0;
    const spy = async () => {
      called += 1;
      return { ok: true };
    };
    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      impl: { restore: spy, getRestoreStatus: spy, cancelRestore: spy },
    });
    for (const method of RESTORE_PROVIDER_METHODS) {
      const result = await provider[method]({});
      expect(result.failureCode).toBe("RESTORE_NOT_ENABLED");
    }
    expect(called).toBe(0);
  });

  it("mesmo com evidência L3 perfeita, restore segue desabilitado", async () => {
    const l3 = evaluateL3Evidence({
      rehearsalId: "77777777-7777-4777-8777-777777777777",
      isolated: true,
      restoredEnvironment: "REHEARSAL_ISOLATED",
      startedAt: iso(NOW - 600_000),
      completedAt: iso(NOW - 300_000),
      integrityChecks: [{ name: "counts", ok: true }],
      smokeResult: "PASSED",
      measuredRtoMs: 1,
      result: "PASSED",
    });
    expect(l3.claimedPassed).toBe(true);
    expect(l3.autoBackupRestoreReady).toBe(false);
    const provider = createBackupProvider({ environment: "PROD", projectRef: PROD_REF });
    expect((await provider.restore({ l3Evidence: l3 })).failureCode).toBe("RESTORE_NOT_ENABLED");
  });
});

describe("db-backup-provider — superfície e identidade", () => {
  it("expõe todas as operações do contrato", () => {
    const provider = createBackupProvider({ environment: "PROD", projectRef: PROD_REF });
    for (const method of [...BACKUP_PROVIDER_METHODS, ...RESTORE_PROVIDER_METHODS]) {
      expect(typeof provider[method]).toBe("function");
    }
    expect(Object.isFrozen(provider)).toBe(true);
  });

  it("createLogicalSnapshot sem executor injetado não cria nada", async () => {
    const provider = createBackupProvider({ environment: "PROD", projectRef: PROD_REF });
    const result = await provider.createLogicalSnapshot({ plan: {} });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("BACKUP_EXECUTOR_NOT_ENABLED");
  });

  it("identidade divergente na configuração falha fechada em TODAS as operações", async () => {
    const provider = createBackupProvider({ environment: "PROD", projectRef: HML_REF });
    expect(provider.identity.ok).toBe(false);
    for (const method of BACKUP_PROVIDER_METHODS) {
      const result = await provider[method]({});
      expect(result.ok).toBe(false);
      expect(result.failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    }
  });

  it("projectRef/ambiente observados pela implementação divergentes → BACKUP_PROJECT_MISMATCH", async () => {
    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      impl: {
        getCapabilities: async () => ({ ok: true, projectRef: HML_REF }),
        getBackupStatus: async () => ({ ok: true, environment: "HML" }),
      },
    });
    expect((await provider.getCapabilities()).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect((await provider.getBackupStatus()).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
  });

  it("implementação recebe só o descritor (nome de referência), nunca valor", async () => {
    let received = null;
    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      impl: {
        createLogicalSnapshot: async (args) => {
          received = args;
          return { ok: true };
        },
      },
    });
    await provider.createLogicalSnapshot({ plan: { id: "p" } });
    expect(received.credential).toMatchObject({
      authority: "BACKUP_CREATE",
      environment: "PROD",
      refName: "PDB_PROD_BACKUP_CREATE_CREDENTIAL",
      browserAllowed: false,
      valueIncluded: false,
    });
    expect(received.projectRef).toBe(PROD_REF);
  });

  it("resultado do provider com segredo é bloqueado", async () => {
    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      impl: { getBackupStatus: async () => ({ ok: true, dsn: "postgres://u:p4ss@h/db" }) },
    });
    expect((await provider.getBackupStatus()).failureCode).toBe("BACKUP_SECRET_MATERIAL");
  });

  it("captureRecoveryPoint/verifyBackup do provider usam a lógica pura", async () => {
    const provider = createBackupProvider({ environment: "PROD", projectRef: PROD_REF });
    const captured = await provider.captureRecoveryPoint({
      quiescenceAt: QUIESCENCE_AT, providerEvidence: pitrEvidence(), nowMs: NOW,
    });
    expect(captured.ok).toBe(true);
    const verified = await provider.verifyBackup({
      mode: "PITR_RECOVERY_POINT", evidence: pitrEvidence(), expected: binding(), nowMs: NOW,
    });
    expect(verified.level).toBe("L1");
    expect(verified.satisfiesPreMigration).toBe(false);
    const caps = await provider.getCapabilities();
    expect(caps.capabilities.logicalSnapshotSupported).toBe("UNKNOWN");
  });
});

describe("db-backup — descritores de credencial", () => {
  it("três autoridades separadas; cada operação pertence a exatamente uma", () => {
    expect(CREDENTIAL_AUTHORITIES).toEqual(["BACKUP_READ", "BACKUP_CREATE", "RESTORE"]);
    expect(OPERATION_AUTHORITY.restore).toBe("RESTORE");
    expect(OPERATION_AUTHORITY.createLogicalSnapshot).toBe("BACKUP_CREATE");
    expect(OPERATION_AUTHORITY.getBackupStatus).toBe("BACKUP_READ");
  });

  it("nomes de referência: 6 distintos (3 autoridades × HML/PROD), explicitamente por ambiente", () => {
    const names = [];
    for (const env of ["HML", "PROD"]) {
      for (const authority of CREDENTIAL_AUTHORITIES) names.push(credentialRefName(authority, env));
    }
    expect(new Set(names).size).toBe(6);
    expect(names.every((n) => /^PDB_(HML|PROD)_(BACKUP_READ|BACKUP_CREATE|RESTORE)_CREDENTIAL$/.test(n))).toBe(true);
    expect(credentialRefName("RESTORE", "STAGING")).toBeNull();
    expect(credentialRefName("ADMIN", "PROD")).toBeNull();
  });

  it("BACKUP_READ ≠ RESTORE e BACKUP_CREATE não implica RESTORE", () => {
    const read = describeCredential("BACKUP_READ", "PROD");
    const create = describeCredential("BACKUP_CREATE", "PROD");
    expect(assertCredentialAuthority(read, "restore").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    expect(assertCredentialAuthority(create, "restore").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    expect(assertCredentialAuthority(read, "createLogicalSnapshot").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    expect(assertCredentialAuthority(create, "getBackupStatus").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    expect(assertCredentialAuthority(read, "getBackupStatus").ok).toBe(true);
    expect(assertCredentialAuthority(create, "createLogicalSnapshot").ok).toBe(true);
    expect(assertCredentialAuthority(describeCredential("RESTORE", "PROD"), "restore").ok).toBe(true);
  });

  it("credenciais HML e PROD são distintas e amarradas ao ambiente", () => {
    const hml = describeCredential("BACKUP_READ", "HML");
    const prod = describeCredential("BACKUP_READ", "PROD");
    expect(hml.refName).not.toBe(prod.refName);
    expect(hml.projectRef).toBe(HML_REF);
    expect(prod.projectRef).toBe(PROD_REF);
    expect(assertCredentialAuthority(hml, "getBackupStatus", { environment: "PROD" }).failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
  });

  it("descritor nunca permite browser e nunca contém valor", () => {
    for (const authority of CREDENTIAL_AUTHORITIES) {
      const d = describeCredential(authority, "PROD");
      expect(d.browserAllowed).toBe(false);
      expect(d.serverOnly).toBe(true);
      expect(d.valueIncluded).toBe(false);
      expect(Object.keys(d).sort()).toEqual(
        ["authority", "browserAllowed", "environment", "projectRef", "refName", "serverOnly", "valueIncluded"],
      );
      expect(Object.isFrozen(d)).toBe(true);
    }
    const exposed = { ...describeCredential("BACKUP_READ", "PROD"), browserAllowed: true };
    expect(assertCredentialAuthority(exposed, "getBackupStatus").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    const forged = { ...describeCredential("BACKUP_READ", "PROD"), refName: "PDB_PROD_RESTORE_CREDENTIAL" };
    expect(assertCredentialAuthority(forged, "getBackupStatus").failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
  });

  it("provider recusa credencial de autoridade errada injetada", async () => {
    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      credentials: { BACKUP_CREATE: describeCredential("RESTORE", "PROD") },
      impl: { createLogicalSnapshot: async () => ({ ok: true }) },
    });
    expect((await provider.createLogicalSnapshot({})).failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
  });
});
