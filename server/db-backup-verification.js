// ════════════════════════════════════════════════════════════
//  PDB-I2B — Motor de verificação de backup (L1 / L2 / L3-modelo).
//
//  Puro: sem rede, sem DB, sem processo, sem restore. "Verificado" NUNCA
//  vem de exitCode=0 — só de evidência estrutural, hash, tamanho, formato,
//  identidade, correlação e relação com a quiescência.
//
//  L1 = existência (provider)         → nunca satisfaz BACKUP_VERIFIED.
//  L2 = integridade do artefato lógico → único que satisfaz BACKUP_VERIFIED.
//  L3 = restore rehearsal              → só contrato/estado (não executável).
// ════════════════════════════════════════════════════════════

import {
  AUTO_BACKUP_RESTORE_READY,
  BACKUP_BINDING_FIELDS,
  BACKUP_CONTRACT_VERSION,
  BACKUP_MODE,
  BACKUP_RECOVERY_SCOPE,
  L3_EXECUTABLE,
  PRE_MIGRATION_BACKUP_LEVEL,
  PRE_MIGRATION_BACKUP_MODE,
  SHA256_RE,
  VERIFICATION_LEVEL,
  checkBackupIdentity,
  containsSecretMaterial,
  diffBackupBinding,
  failure,
  isUuid,
  isVerificationLevel,
  parseIsoMs,
  toIso,
  validateBackupBinding,
  verificationLevelRank,
} from "./db-backup-contract.js";
import {
  FORMAT_CHECK_METHODS,
  LOGICAL_ARTIFACT_KINDS,
  LOGICAL_REQUIRED_ARTIFACT_KINDS,
  computeManifestDigest,
  validateManifestStructure,
} from "./db-backup-logical.js";
import { evaluateManagedDailyEvidence, evaluatePitrRecoveryPoint } from "./db-backup-provider-evidence.js";

/** Só LOGICAL_SNAPSHOT verificado em ≥ L2 satisfaz o ponto pré-migration. */
export function satisfiesPreMigrationBackup({ mode, level, verified } = {}) {
  return verified === true
    && mode === PRE_MIGRATION_BACKUP_MODE
    && verificationLevelRank(level) >= verificationLevelRank(PRE_MIGRATION_BACKUP_LEVEL);
}

const FAILURE_PRIORITY = Object.freeze([
  "BACKUP_SECRET_MATERIAL",
  "BACKUP_MANIFEST_INVALID",
  "BACKUP_PROJECT_MISMATCH",
  "BACKUP_CORRELATION_MISMATCH",
  "BACKUP_EVIDENCE_STALE",
  "BACKUP_QUIESCENCE_INVALID",
  "BACKUP_SNAPSHOT_BEFORE_QUIESCENCE",
  "BACKUP_CREATE_FAILED",
  "BACKUP_ARTIFACT_MISSING",
  "BACKUP_HASH_MISMATCH",
  "BACKUP_FORMAT_INVALID",
  "BACKUP_VERIFY_FAILED",
]);

function firstFailureCode(failures) {
  for (const code of FAILURE_PRIORITY) {
    if (failures.some((item) => item.code === code)) return code;
  }
  return failures[0]?.code ?? null;
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * L2 do snapshot lógico.
 *
 * manifest     — produzido pelo executor (esperado: size/sha256 no momento da criação).
 * observations — { [kind]: { exists, size, sha256, formatCheck:{method, ok} } }
 *                relidos do artefato armazenado pelo verificador (hash OBSERVADO).
 * expected     — binding confiável vindo do plano/execução (NÃO do manifest):
 *                { planId, executionId, correlationId, targetReleaseSha,
 *                  environment, projectRef, quiescenceAt,
 *                  requireAuthStorageCustomization?, migrationStartedAt? }
 */
export function verifyLogicalSnapshotL2({
  manifest,
  observations = {},
  expected = {},
  nowMs = Date.now(),
} = {}) {
  const failures = [];
  const add = (code, detail, kind = null) => failures.push({ code, detail, kind });

  // 1) estrutura do manifest
  for (const problem of validateManifestStructure(manifest)) add(problem.code, problem.detail);
  const structurallyValid = failures.length === 0;

  // 2) binding esperado bem formado (sem ele, nada pode ser afirmado)
  const expectedBinding = validateBackupBinding(expected);
  if (!expectedBinding.ok) add(expectedBinding.failureCode, `EXPECTED_${expectedBinding.reason}`);

  if (manifest && typeof manifest === "object") {
    // 3) identidade
    if (manifest.environment !== expected.environment) add("BACKUP_PROJECT_MISMATCH", "ENVIRONMENT_MISMATCH");
    if (manifest.projectRef !== expected.projectRef) add("BACKUP_PROJECT_MISMATCH", "PROJECT_REF_MISMATCH");
    const manifestIdentity = checkBackupIdentity({
      environment: manifest.environment,
      projectRef: manifest.projectRef,
    });
    if (!manifestIdentity.ok) add("BACKUP_PROJECT_MISMATCH", `MANIFEST_${manifestIdentity.reason}`);

    // 4) binding de execução/correlação
    if (manifest.correlationId !== expected.correlationId) add("BACKUP_CORRELATION_MISMATCH", "CORRELATION_ID");
    if (manifest.planId !== expected.planId) add("BACKUP_CORRELATION_MISMATCH", "PLAN_ID");
    if (manifest.executionId !== expected.executionId) add("BACKUP_CORRELATION_MISMATCH", "EXECUTION_ID");
    if (manifest.targetReleaseSha !== expected.targetReleaseSha) {
      add("BACKUP_CORRELATION_MISMATCH", "TARGET_RELEASE_SHA");
    }

    // 5) quiescência e ordem temporal
    const expectedQuiescence = parseIsoMs(expected.quiescenceAt);
    const manifestQuiescence = parseIsoMs(manifest.quiescenceAt);
    const startedMs = parseIsoMs(manifest.snapshotStartedAt);
    const completedMs = parseIsoMs(manifest.snapshotCompletedAt);
    if (expectedQuiescence != null && manifestQuiescence != null && expectedQuiescence !== manifestQuiescence) {
      add("BACKUP_EVIDENCE_STALE", "QUIESCENCE_GENERATION_CHANGED");
    }
    if (expectedQuiescence != null && startedMs != null && startedMs < expectedQuiescence) {
      add("BACKUP_SNAPSHOT_BEFORE_QUIESCENCE", "SNAPSHOT_STARTED_BEFORE_QUIESCENCE");
    }
    if (startedMs != null && completedMs != null && completedMs < startedMs) {
      add("BACKUP_MANIFEST_INVALID", "COMPLETED_BEFORE_STARTED");
    }
    if (completedMs != null && completedMs > nowMs) add("BACKUP_MANIFEST_INVALID", "COMPLETED_IN_FUTURE");
    const migrationStartedMs = parseIsoMs(expected.migrationStartedAt);
    if (expected.migrationStartedAt != null) {
      if (migrationStartedMs == null) add("BACKUP_QUIESCENCE_INVALID", "MIGRATION_STARTED_AT_INVALID");
      else if (completedMs != null && completedMs > migrationStartedMs) {
        add("BACKUP_EVIDENCE_STALE", "SNAPSHOT_COMPLETED_AFTER_MIGRATION_START");
      }
    }

    // 6) conjunto de artefatos exigidos (derivado do esperado, não do manifest)
    const requiredKinds = expected.requireAuthStorageCustomization === true
      ? [...LOGICAL_REQUIRED_ARTIFACT_KINDS, "AUTH_STORAGE_CUSTOMIZATION"]
      : [...LOGICAL_REQUIRED_ARTIFACT_KINDS];
    const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
    const byKind = new Map(artifacts.filter((a) => LOGICAL_ARTIFACT_KINDS.includes(a?.kind)).map((a) => [a.kind, a]));

    for (const kind of requiredKinds) {
      if (!byKind.has(kind)) add("BACKUP_ARTIFACT_MISSING", "REQUIRED_ARTIFACT_ABSENT_FROM_MANIFEST", kind);
    }

    // 7) cada artefato presente
    for (const [kind, artifact] of byKind) {
      const observed = observations?.[kind];
      if (artifact.status === "FAILED") {
        add("BACKUP_CREATE_FAILED", "ARTIFACT_STATUS_FAILED", kind);
        continue;
      }
      if (artifact.status !== "COMPLETE") {
        add("BACKUP_ARTIFACT_MISSING", "ARTIFACT_NOT_COMPLETE", kind);
        continue;
      }
      if (requiredKinds.includes(kind) && artifact.required !== true) {
        add("BACKUP_MANIFEST_INVALID", "REQUIRED_FLAG_DOWNGRADED", kind);
      }
      if (!observed || observed.exists !== true) {
        add("BACKUP_ARTIFACT_MISSING", "ARTIFACT_NOT_FOUND", kind);
        continue;
      }
      if (!isPositiveInt(artifact.size) || !isPositiveInt(observed.size)) {
        add("BACKUP_ARTIFACT_MISSING", "ARTIFACT_EMPTY_OR_SIZE_INVALID", kind);
      } else if (artifact.size !== observed.size) {
        add("BACKUP_VERIFY_FAILED", "SIZE_MISMATCH", kind);
      }
      if (!SHA256_RE.test(artifact.sha256 || "") || !SHA256_RE.test(observed.sha256 || "")) {
        add("BACKUP_HASH_MISMATCH", "HASH_FORMAT_INVALID", kind);
      } else if (artifact.sha256 !== observed.sha256) {
        add("BACKUP_HASH_MISMATCH", "SHA256_DIFFERS", kind);
      }
      const check = observed.formatCheck;
      if (!check || check.ok !== true || !FORMAT_CHECK_METHODS.includes(check.method)) {
        add("BACKUP_FORMAT_INVALID", "FORMAT_CHECK_NOT_SUCCESSFUL", kind);
      }
      const createdMs = parseIsoMs(artifact.createdAt);
      if (createdMs == null) {
        add("BACKUP_MANIFEST_INVALID", "ARTIFACT_CREATED_AT_INVALID", kind);
      } else {
        if (expectedQuiescence != null && createdMs < expectedQuiescence) {
          add("BACKUP_SNAPSHOT_BEFORE_QUIESCENCE", "ARTIFACT_CREATED_BEFORE_QUIESCENCE", kind);
        }
        if (completedMs != null && createdMs > completedMs) {
          add("BACKUP_MANIFEST_INVALID", "ARTIFACT_CREATED_AFTER_SNAPSHOT_COMPLETED", kind);
        }
      }
    }
  }

  const verified = failures.length === 0;
  const checkedAt = toIso(nowMs);
  return {
    level: VERIFICATION_LEVEL.L2,
    mode: BACKUP_MODE.LOGICAL_SNAPSHOT,
    verified,
    ok: verified,
    failureCode: verified ? null : firstFailureCode(failures),
    reason: verified ? null : failures[0]?.detail ?? null,
    failures,
    structurallyValid,
    checkedAt,
    manifestDigest: structurallyValid ? computeManifestDigest(manifest) : null,
    satisfiesPreMigration: verified,
  };
}

/** Evidência persistível em app_backup_runs.integrity_evidence (sem segredo). */
export function buildIntegrityEvidence({ verification, manifest, binding, nowMs = Date.now() } = {}) {
  if (!verification || !isVerificationLevel(verification.level)) {
    return failure("BACKUP_INPUT_INVALID", "VERIFICATION_MISSING");
  }
  const evidence = {
    contractVersion: BACKUP_CONTRACT_VERSION,
    mode: verification.mode,
    scope: BACKUP_RECOVERY_SCOPE,
    verificationLevel: verification.level,
    result: verification.verified === true ? "VERIFIED" : "FAILED",
    verifiedAt: toIso(parseIsoMs(verification.checkedAt) ?? nowMs),
    failureCodes: (verification.failures || []).map((item) => item.code).filter(Boolean).slice(0, 32),
    failureCode: verification.failureCode ?? null,
    manifestDigest: verification.manifestDigest ?? null,
    manifestVersion: manifest?.manifestVersion ?? null,
    artifactCount: Array.isArray(manifest?.artifacts) ? manifest.artifacts.length : 0,
    artifacts: Array.isArray(manifest?.artifacts)
      ? manifest.artifacts.map((artifact) => ({
        kind: artifact.kind,
        filename: artifact.filename,
        size: artifact.size ?? null,
        sha256: artifact.sha256 ?? null,
      }))
      : [],
    binding: Object.fromEntries(BACKUP_BINDING_FIELDS.map((field) => [field, binding?.[field] ?? null])),
    ...(verification.recoveryPoint ? { recoveryPoint: verification.recoveryPoint } : {}),
  };
  if (containsSecretMaterial(evidence)) return failure("BACKUP_SECRET_MATERIAL", "INTEGRITY_EVIDENCE_UNSAFE");
  return { ok: true, failureCode: null, reason: null, evidence };
}

/**
 * L1 para evidência de provider (PITR / managed daily).
 * Resultado máximo: L1. satisfiesPreMigration é SEMPRE false.
 */
export function verifyProviderEvidenceL1({ mode, evidence, expected = {}, nowMs = Date.now() } = {}) {
  let evaluation;
  if (mode === BACKUP_MODE.PITR_RECOVERY_POINT) {
    evaluation = evaluatePitrRecoveryPoint(evidence, {
      environment: expected.environment,
      projectRef: expected.projectRef,
      quiescenceAt: expected.quiescenceAt,
      nowMs,
    });
  } else if (mode === BACKUP_MODE.MANAGED_DAILY) {
    evaluation = evaluateManagedDailyEvidence(evidence, {
      environment: expected.environment,
      projectRef: expected.projectRef,
      nowMs,
    });
  } else {
    return { level: VERIFICATION_LEVEL.L1, mode: mode ?? null, verified: false, satisfiesPreMigration: false, ...failure("BACKUP_INPUT_INVALID", "L1_MODE_INVALID") };
  }
  const verified = evaluation.usable === true;
  return {
    level: VERIFICATION_LEVEL.L1,
    mode,
    verified,
    ok: verified,
    failureCode: verified ? null : evaluation.failureCode,
    reason: verified ? null : evaluation.reason,
    failures: verified ? [] : [{ code: evaluation.failureCode, detail: evaluation.reason, kind: null }],
    checkedAt: toIso(nowMs),
    manifestDigest: null,
    satisfiesPreMigration: false,
  };
}

// ── L3: somente contrato/estado ──────────────────────────────
export const L3_RESULTS = Object.freeze(["PASSED", "FAILED", "NOT_RUN"]);

/**
 * Valida a FORMA de uma evidência L3. Nada é executado. Mesmo uma evidência
 * L3 estruturalmente perfeita não habilita restore nem AUTO_BACKUP_RESTORE_READY.
 */
export function evaluateL3Evidence(raw) {
  const problems = [];
  const item = raw && typeof raw === "object" ? raw : {};
  if (!isUuid(item.rehearsalId)) problems.push("REHEARSAL_ID");
  if (item.isolated !== true || typeof item.restoredEnvironment !== "string" || !item.restoredEnvironment) {
    problems.push("RESTORED_ENVIRONMENT_NOT_ISOLATED");
  }
  const started = parseIsoMs(item.startedAt);
  const completed = parseIsoMs(item.completedAt);
  if (started == null || completed == null || completed < started) problems.push("TIMESTAMPS");
  if (!Array.isArray(item.integrityChecks) || item.integrityChecks.length === 0
    || item.integrityChecks.some((check) => !check || typeof check.name !== "string" || typeof check.ok !== "boolean")) {
    problems.push("INTEGRITY_CHECKS");
  }
  if (!["PASSED", "FAILED"].includes(item.smokeResult)) problems.push("SMOKE_RESULT");
  if (!Number.isFinite(item.measuredRtoMs) || item.measuredRtoMs < 0) problems.push("MEASURED_RTO");
  if (!L3_RESULTS.includes(item.result)) problems.push("RESULT");
  const structurallyValid = problems.length === 0;
  return {
    level: VERIFICATION_LEVEL.L3,
    structurallyValid,
    problems,
    claimedPassed: structurallyValid
      && item.result === "PASSED"
      && item.smokeResult === "PASSED"
      && item.integrityChecks.every((check) => check.ok === true),
    executedByThisModule: false,
    executable: L3_EXECUTABLE,
    autoBackupRestoreReady: AUTO_BACKUP_RESTORE_READY,
  };
}

// ── Avaliação de evidência para o gate BACKUP_VERIFIED ───────
function gateResult(status, reasonCode, message) {
  return { status, reasonCode, message };
}

function integrityMatchesBinding(integrity, expected) {
  return diffBackupBinding(integrity?.binding, expected).length === 0;
}

/**
 * Avalia a evidência de runs contra o binding ESPERADO (plano/execução) e
 * devolve { status, reasonCode, message } para o gate BACKUP_VERIFIED.
 *
 *  · sem evidência                    → UNKNOWN
 *  · só PITR L1 / só daily            → PENDING (insuficiente; nunca VERIFIED)
 *  · run lógico de outra correlação   → STALE (não reutilizável)
 *  · mismatch de identidade/binding   → BLOCKED
 *  · quiescência diferente            → STALE
 *  · FAILED                           → FAILED
 *  · VERIFIED com L2 + binding íntegro→ VERIFIED (PITR em DUAL é suplemento)
 */
export function evaluateBackupEvidenceForReadiness(backup, expected) {
  if (!backup || backup.absent === true) {
    return gateResult("UNKNOWN", "BACKUP_EVIDENCE_MISSING", "Nenhuma evidência de backup disponível.");
  }
  if (backup.ok !== true) {
    return gateResult("UNKNOWN", backup.errorCode || "BACKUP_STORE_UNAVAILABLE", "Evidência de backup indisponível.");
  }
  const binding = validateBackupBinding(expected);
  if (!binding.ok) {
    if (binding.failureCode === "BACKUP_PROJECT_MISMATCH") {
      return gateResult("BLOCKED", binding.failureCode, "Binding de backup aponta para ambiente/projeto divergente.");
    }
    return gateResult("UNKNOWN", binding.failureCode, "Binding de execução ausente ou inválido para avaliar backup.");
  }
  const runs = Array.isArray(backup.runs) ? backup.runs : [];
  if (runs.length === 0) {
    return gateResult("UNKNOWN", "BACKUP_EVIDENCE_MISSING", "Nenhum run de backup para este plano.");
  }

  const logical = runs.filter((run) => run?.mode === PRE_MIGRATION_BACKUP_MODE);
  if (logical.length === 0) {
    return gateResult(
      "PENDING",
      "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION",
      "Somente PITR/daily: L1 não satisfaz o backup pré-migration; snapshot lógico L2 é obrigatório.",
    );
  }

  const sameCorrelation = logical.filter((run) => run.correlationId === expected.correlationId);
  if (sameCorrelation.length === 0) {
    return gateResult(
      "STALE",
      "BACKUP_EVIDENCE_STALE",
      "Snapshot lógico pertence a outra execução/correlação — não reutilizável.",
    );
  }
  if (sameCorrelation.length > 1) {
    return gateResult("BLOCKED", "BACKUP_RUN_AMBIGUOUS", "Mais de um run lógico para a mesma correlação.");
  }
  const run = sameCorrelation[0];

  const diff = diffBackupBinding(run, expected);
  if (diff.includes("environment") || diff.includes("projectRef")) {
    return gateResult("BLOCKED", "BACKUP_PROJECT_MISMATCH", "Run de backup vinculado a outro ambiente/projeto.");
  }
  if (diff.length === 1 && diff[0] === "quiescenceAt") {
    return gateResult("STALE", "BACKUP_EVIDENCE_STALE", "Quiescência mudou desde o backup — evidência vencida.");
  }
  if (diff.length > 0) {
    return gateResult("BLOCKED", "BACKUP_CORRELATION_MISMATCH", "Run de backup não vinculado ao plano/execução esperados.");
  }

  if (run.status === "FAILED") {
    const code = run.failureCode || run.integrity?.failureCode || "BACKUP_CREATE_FAILED";
    return gateResult("FAILED", code, "Backup lógico falhou.");
  }
  if (run.status !== "VERIFIED") {
    return gateResult("PENDING", "BACKUP_IN_PROGRESS", "Snapshot lógico ainda não chegou a VERIFIED (L2).");
  }

  const integrity = run.integrity;
  if (!integrity
    || integrity.verificationLevel !== PRE_MIGRATION_BACKUP_LEVEL
    || integrity.result !== "VERIFIED"
    || integrity.mode !== PRE_MIGRATION_BACKUP_MODE
    || typeof integrity.manifestDigest !== "string"
    || !SHA256_RE.test(integrity.manifestDigest)) {
    return gateResult("BLOCKED", "BACKUP_VERIFY_FAILED", "Run VERIFIED sem evidência L2 íntegra.");
  }
  if (!integrityMatchesBinding(integrity, expected)) {
    return gateResult("BLOCKED", "BACKUP_CORRELATION_MISMATCH", "Evidência L2 não vinculada ao binding esperado.");
  }

  const pitr = runs.find((item) => item?.mode === BACKUP_MODE.PITR_RECOVERY_POINT
    && item.correlationId === expected.correlationId);
  const supplement = pitr?.status === "VERIFIED" ? " PITR L1 suplementar registrado." : "";
  return gateResult("VERIFIED", "BACKUP_VERIFIED_L2", `Snapshot lógico verificado em L2 e vinculado à execução.${supplement}`);
}
