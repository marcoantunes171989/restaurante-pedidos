// ════════════════════════════════════════════════════════════
//  PDB-I2B — Contrato de provider de backup.
//
//  Fábrica de provider com a superfície:
//    getCapabilities · prepareBackup · captureRecoveryPoint ·
//    createLogicalSnapshot · getBackupStatus · verifyBackup · getRecoveryPoint
//  e a superfície de restore SOMENTE como contrato desabilitado:
//    restore · getRestoreStatus · cancelRestore
//
//  Este módulo não faz rede, não spawna processo, não lê ambiente.
//  Implementações injetadas (mocks nos testes, adapters em I2C) recebem
//  apenas o descritor de credencial — nunca o valor. A superfície de
//  restore NÃO é injetável: qualquer implementação de restore fornecida
//  é ignorada e as três funções devolvem sempre RESTORE_NOT_ENABLED.
// ════════════════════════════════════════════════════════════

import {
  AUTO_BACKUP_RESTORE_READY,
  OPERATION_AUTHORITY,
  RESTORE_ENABLED,
  RESTORE_REQUIRES_LEVEL,
  assertCredentialAuthority,
  checkBackupIdentity,
  containsSecretMaterial,
  describeCredential,
  failure,
} from "./db-backup-contract.js";
import { normalizeCapabilities } from "./db-backup-strategy.js";
import { captureRecoveryPoint } from "./db-backup-provider-evidence.js";
import { verifyLogicalSnapshotL2, verifyProviderEvidenceL1 } from "./db-backup-verification.js";
import { buildLogicalSnapshotPlan } from "./db-backup-logical.js";

export const BACKUP_PROVIDER_METHODS = Object.freeze([
  "getCapabilities",
  "prepareBackup",
  "captureRecoveryPoint",
  "createLogicalSnapshot",
  "getBackupStatus",
  "verifyBackup",
  "getRecoveryPoint",
]);

export const RESTORE_PROVIDER_METHODS = Object.freeze(["restore", "getRestoreStatus", "cancelRestore"]);

/** Resposta determinística e única de toda a superfície de restore. */
export function restoreDisabledResult(operation = "restore") {
  return Object.freeze({
    ok: false,
    failureCode: "RESTORE_NOT_ENABLED",
    reason: "RESTORE_HARD_DISABLED_IN_I2B",
    operation,
    blockedBy: Object.freeze(["RESTORE_REHEARSAL_REQUIRED"]),
    rehearsalRequired: true,
    requiredLevel: RESTORE_REQUIRES_LEVEL,
    restoreEnabled: RESTORE_ENABLED,
    autoBackupRestoreReady: AUTO_BACKUP_RESTORE_READY,
    status: "NOT_ENABLED",
  });
}

export function createDisabledRestoreSurface() {
  return Object.freeze({
    async restore() {
      return restoreDisabledResult("restore");
    },
    async getRestoreStatus() {
      return restoreDisabledResult("getRestoreStatus");
    },
    async cancelRestore() {
      return restoreDisabledResult("cancelRestore");
    },
  });
}

function guardResult(result) {
  if (result && typeof result === "object" && containsSecretMaterial(result)) {
    return failure("BACKUP_SECRET_MATERIAL", "PROVIDER_RESULT_UNSAFE");
  }
  return result;
}

/**
 * Cria um provider vinculado a { environment, projectRef }.
 * `impl` só pode fornecer as sete operações de backup; restore é sempre
 * desabilitado. Qualquer identidade observada divergente falha fechada.
 */
export function createBackupProvider({
  environment,
  projectRef,
  expectedProjectRef,
  impl = {},
  credentials = {},
} = {}) {
  const identity = checkBackupIdentity({ environment, projectRef, expectedProjectRef });
  const credentialFor = (authority) => credentials[authority] ?? describeCredential(authority, environment);

  const authorize = (operation) => {
    if (!identity.ok) return failure(identity.failureCode, identity.reason);
    const check = assertCredentialAuthority(
      credentialFor(OPERATION_AUTHORITY[operation]),
      operation,
      { environment },
    );
    return check.ok ? null : check;
  };

  const delegate = (operation, fallback) => async (args = {}) => {
    const denied = authorize(operation);
    if (denied) return denied;
    try {
      const fn = typeof impl?.[operation] === "function" ? impl[operation] : fallback;
      const result = await fn({
        ...args,
        environment,
        projectRef,
        credential: credentialFor(OPERATION_AUTHORITY[operation]),
      });
      if (result?.projectRef != null && result.projectRef !== projectRef) {
        return failure("BACKUP_PROJECT_MISMATCH", "OBSERVED_PROJECT_REF_DIFFERS");
      }
      if (result?.environment != null && result.environment !== environment) {
        return failure("BACKUP_PROJECT_MISMATCH", "OBSERVED_ENVIRONMENT_DIFFERS");
      }
      return guardResult(result);
    } catch {
      return failure("BACKUP_CREATE_FAILED", `${operation.toUpperCase()}_THREW`);
    }
  };

  const provider = {
    environment,
    projectRef,
    identity,
    getCapabilities: delegate("getCapabilities", async () => ({
      ok: true,
      ...normalizeCapabilities({ environment, projectRef }),
    })),
    prepareBackup: delegate("prepareBackup", async (args) => buildLogicalSnapshotPlan({
      ...args,
      environment,
      projectRef,
      expectedProjectRef,
    })),
    captureRecoveryPoint: delegate("captureRecoveryPoint", async (args) => captureRecoveryPoint({
      ...args,
      environment,
      projectRef,
      expectedProjectRef,
    })),
    // Nenhum executor em I2B: sem implementação injetada, não há criação.
    createLogicalSnapshot: delegate("createLogicalSnapshot", async () => failure(
      "BACKUP_EXECUTOR_NOT_ENABLED",
      "NO_EXECUTOR_IN_I2B",
    )),
    getBackupStatus: delegate("getBackupStatus", async () => failure(
      "BACKUP_EVIDENCE_MISSING",
      "NO_STATUS_SOURCE",
    )),
    verifyBackup: delegate("verifyBackup", async (args) => {
      if (args.level === "L2") {
        return verifyLogicalSnapshotL2({ ...args, nowMs: args.nowMs ?? Date.now() });
      }
      return verifyProviderEvidenceL1({ ...args, nowMs: args.nowMs ?? Date.now() });
    }),
    getRecoveryPoint: delegate("getRecoveryPoint", async () => failure(
      "BACKUP_EVIDENCE_MISSING",
      "NO_RECOVERY_POINT_SOURCE",
    )),
    ...createDisabledRestoreSurface(),
  };
  return Object.freeze(provider);
}
