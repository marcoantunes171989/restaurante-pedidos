// ════════════════════════════════════════════════════════════
//  PDB-I2B — Fronteira de serviço de orquestração de backup (SEM executor).
//
//  Responsabilidades: validar identidade, escolher estratégia adaptativa,
//  preparar metadata de runs e o plano do snapshot lógico, capturar
//  evidência PITR normalizada, avaliar verificação e derivar o próximo
//  estado seguro.
//
//  NÃO faz: spawn de binário, chamada de provider, escrita em DB live,
//  restore, início de migration. I2C orquestra a execução real depois.
// ════════════════════════════════════════════════════════════

import {
  AMBIGUOUS_CREATE_POLICY,
  BACKUP_INITIAL_STATE,
  BACKUP_MODE,
  BACKUP_STRATEGY_CLASS,
  BACKUP_RECOVERY_SCOPE,
  STORAGE_OBJECTS_INCLUDED,
  failure,
  isBackupRunMode,
  isBackupStatus,
  parseIsoMs,
  validateBackupBinding,
  validateBackupTransition,
} from "./db-backup-contract.js";
import { selectBackupStrategy } from "./db-backup-strategy.js";
import { buildLogicalSnapshotPlan } from "./db-backup-logical.js";
import { captureRecoveryPoint } from "./db-backup-provider-evidence.js";
import {
  buildIntegrityEvidence,
  verifyLogicalSnapshotL2,
  verifyProviderEvidenceL1,
} from "./db-backup-verification.js";

/**
 * Plano de backup para uma execução: estratégia + metadata de runs + plano
 * lógico. Puro — nenhum efeito colateral.
 */
export function prepareBackupPlan({
  capabilities,
  binding,
  requestedMode = null,
  requireAuthStorageCustomization = false,
  nowMs = Date.now(),
} = {}) {
  const bound = validateBackupBinding(binding);
  if (!bound.ok) return bound;
  if (parseIsoMs(binding.quiescenceAt) > nowMs) {
    return failure("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_IN_FUTURE");
  }

  const strategy = selectBackupStrategy(capabilities, {
    nowMs,
    requestedMode,
    expectedEnvironment: binding.environment,
    expectedProjectRef: binding.projectRef,
  });
  if (!strategy.ok) return { ...strategy, plan: null };
  if (strategy.projectRef !== binding.projectRef) {
    return failure("BACKUP_PROJECT_MISMATCH", "CAPABILITY_PROJECT_REF_DIFFERS");
  }

  const logical = buildLogicalSnapshotPlan({
    ...binding,
    requireAuthStorageCustomization,
  });
  if (!logical.ok) return logical;

  const runs = strategy.runModes.map((mode) => ({
    mode,
    initialStatus: BACKUP_INITIAL_STATE[mode],
    createsProviderResource: mode === BACKUP_MODE.LOGICAL_SNAPSHOT,
    binding: { ...binding },
  }));

  return {
    ok: true,
    failureCode: null,
    reason: null,
    strategyClass: BACKUP_STRATEGY_CLASS,
    strategy,
    scope: BACKUP_RECOVERY_SCOPE,
    storageObjectsIncluded: STORAGE_OBJECTS_INCLUDED,
    runs,
    logicalPlan: logical.plan,
    executionEnabled: false,
    ambiguousCreatePolicy: AMBIGUOUS_CREATE_POLICY,
  };
}

/** Captura PITR normalizada. Sem provider, sem mutação. */
export function capturePitrRecoveryPoint({ binding, providerEvidence, nowMs = Date.now() } = {}) {
  const bound = validateBackupBinding(binding);
  if (!bound.ok) return bound;
  return captureRecoveryPoint({
    quiescenceAt: binding.quiescenceAt,
    providerEvidence,
    environment: binding.environment,
    projectRef: binding.projectRef,
    nowMs,
  });
}

/**
 * Avalia verificação de um run e devolve o evento de estado seguro
 * correspondente. Não persiste: quem persiste é o store.
 */
export function evaluateBackupVerification({
  mode,
  binding,
  manifest,
  observations,
  providerEvidence,
  nowMs = Date.now(),
} = {}) {
  const bound = validateBackupBinding(binding);
  if (!bound.ok) return bound;
  if (mode === BACKUP_MODE.LOGICAL_SNAPSHOT) {
    const verification = verifyLogicalSnapshotL2({ manifest, observations, expected: binding, nowMs });
    const built = buildIntegrityEvidence({ verification, manifest, binding, nowMs });
    if (!built.ok) return built;
    return { ok: true, verification, evidence: built.evidence, event: verification.verified ? "VERIFICATION_PASSED" : "VERIFICATION_FAILED" };
  }
  if (mode === BACKUP_MODE.PITR_RECOVERY_POINT || mode === BACKUP_MODE.MANAGED_DAILY) {
    const verification = verifyProviderEvidenceL1({ mode, evidence: providerEvidence, expected: binding, nowMs });
    const built = buildIntegrityEvidence({ verification, manifest: null, binding, nowMs });
    if (!built.ok) return built;
    return { ok: true, verification, evidence: built.evidence, event: verification.verified ? "VERIFICATION_PASSED" : "VERIFICATION_FAILED" };
  }
  return failure("BACKUP_INPUT_INVALID", "MODE_INVALID");
}

const EVENT_EDGES = Object.freeze({
  START: ["REQUESTED", "RUNNING"],
  COMPLETE: ["RUNNING", "COMPLETED"],
  BEGIN_VERIFY: ["COMPLETED", "VERIFYING"],
  VERIFICATION_PASSED: ["VERIFYING", "VERIFIED"],
  VERIFICATION_FAILED: ["VERIFYING", "FAILED"],
});

/** Próximo estado seguro para um evento. Eventos desconhecidos/ilegais falham fechados. */
export function deriveNextSafeState({ mode, status, event } = {}) {
  if (!isBackupRunMode(mode) || !isBackupStatus(status)) {
    return failure("BACKUP_INPUT_INVALID", "MODE_OR_STATUS_INVALID");
  }
  if (event === "FAIL") {
    const check = validateBackupTransition({ mode, from: status, to: "FAILED" });
    return check.ok ? { ok: true, failureCode: null, reason: null, nextStatus: "FAILED" } : check;
  }
  const edge = EVENT_EDGES[event];
  if (!edge || edge[0] !== status) {
    return failure("BACKUP_STATE_TRANSITION_ILLEGAL", edge ? "EVENT_NOT_VALID_FROM_STATUS" : "EVENT_UNKNOWN");
  }
  const check = validateBackupTransition({ mode, from: edge[0], to: edge[1] });
  return check.ok ? { ok: true, failureCode: null, reason: null, nextStatus: edge[1] } : check;
}

/**
 * Resultado ambíguo de criação: NUNCA retry de mutação. Reconcile read-only
 * primeiro. Contrato/política — nenhuma mutação acontece em I2B.
 */
export function decideAmbiguousCreateOutcome() {
  return {
    ok: false,
    ...AMBIGUOUS_CREATE_POLICY,
    reason: "AMBIGUOUS_CREATE_REQUIRES_READ_ONLY_RECONCILE",
  };
}
