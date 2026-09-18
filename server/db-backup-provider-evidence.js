// ════════════════════════════════════════════════════════════
//  PDB-I2B — Evidência normalizada de provider: PITR e managed daily.
//
//  Puro: sem rede, sem DB, sem mutação de provider, sem restore.
//  Adapters futuros mapeiam a resposta do provider para estes shapes;
//  este módulo só normaliza, avalia frescor e congela recovery point.
//
//  PITR NÃO é "criar backup gerenciado": captureRecoveryPoint congela
//  {recoveryTarget, observedRange, capturedAt, projectRef, metadata}.
//  Resultado máximo: L1. Jamais L2 e jamais BACKUP_VERIFIED sozinho.
//  Managed daily é observabilidade: nunca satisfaz o ponto pré-migration.
// ════════════════════════════════════════════════════════════

import {
  BACKUP_MODE,
  BACKUP_RECOVERY_SCOPE,
  BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS,
  CAPABILITY_UNKNOWN,
  PROJECT_REF_RE,
  PROVIDER_SOURCE_RE,
  VERIFICATION_LEVEL,
  checkBackupIdentity,
  failure,
  isDbEnvironment,
  parseIsoMs,
  toIso,
} from "./db-backup-contract.js";

function triState(value) {
  return value === true || value === false ? value : CAPABILITY_UNKNOWN;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : null;
}

function normalizeEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map((entry) => ({
    backupId: safeId(entry?.backupId),
    status: typeof entry?.status === "string" ? entry.status.toUpperCase().slice(0, 40) : null,
    insertedAt: toIso(parseIsoMs(entry?.insertedAt)),
    physical: triState(entry?.physical),
  }));
}

function normalizeIdentity(input) {
  return {
    environment: isDbEnvironment(input?.environment) ? input.environment : null,
    projectRef: typeof input?.projectRef === "string" && PROJECT_REF_RE.test(input.projectRef)
      ? input.projectRef
      : null,
    providerSource: typeof input?.providerSource === "string" && PROVIDER_SOURCE_RE.test(input.providerSource)
      ? input.providerSource
      : CAPABILITY_UNKNOWN,
    observedAt: toIso(parseIsoMs(input?.observedAt)),
  };
}

// ── PITR ─────────────────────────────────────────────────────
export function normalizePitrEvidence(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...normalizeIdentity(source),
    pitrEnabled: triState(source.pitrEnabled),
    walgEnabled: triState(source.walgEnabled),
    earliestRecoveryAt: toIso(parseIsoMs(source.earliestRecoveryAt)),
    latestRecoveryAt: toIso(parseIsoMs(source.latestRecoveryAt)),
    backups: normalizeEntries(source.backups),
  };
}

/**
 * PITR utilizável somente se:
 *   identidade confere ∧ evidência fresca e observada após a quiescência ∧
 *   pitrEnabled=true ∧ range conhecido ∧ o instante de quiescência está
 *   COBERTO pelo range [earliest, latest].
 * "Latest insuficiente" = latest < quiescenceAt (WAL ainda não cobre o
 * congelamento) — critério de quiescência, não janela arbitrária.
 * Ambíguo ou vencido: não utilizável.
 */
export function evaluatePitrRecoveryPoint(rawEvidence, {
  environment,
  projectRef,
  expectedProjectRef,
  quiescenceAt,
  nowMs = Date.now(),
  maxAgeMs = BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS,
} = {}) {
  const evidence = normalizePitrEvidence(rawEvidence);
  const result = (fields) => ({
    mode: BACKUP_MODE.PITR_RECOVERY_POINT,
    level: null,
    usable: false,
    satisfiesPreMigration: false,
    evidence,
    ...fields,
  });
  const bad = (code, reason) => result(failure(code, reason));

  const expectedIdentity = checkBackupIdentity({ environment, projectRef, expectedProjectRef });
  if (!expectedIdentity.ok) return bad(expectedIdentity.failureCode, expectedIdentity.reason);
  if (evidence.environment !== environment || evidence.projectRef !== projectRef) {
    return bad("BACKUP_PROJECT_MISMATCH", "EVIDENCE_IDENTITY_MISMATCH");
  }

  const quiescenceMs = parseIsoMs(quiescenceAt);
  if (quiescenceMs == null) return bad("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_INVALID");
  if (quiescenceMs > nowMs) return bad("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_IN_FUTURE");

  const observedMs = parseIsoMs(evidence.observedAt);
  if (observedMs == null) return bad("BACKUP_EVIDENCE_STALE", "OBSERVED_AT_MISSING");
  if (observedMs > nowMs) return bad("BACKUP_EVIDENCE_STALE", "OBSERVED_AT_IN_FUTURE");
  if (nowMs - observedMs > maxAgeMs) return bad("BACKUP_EVIDENCE_STALE", "OBSERVATION_EXPIRED");
  if (observedMs < quiescenceMs) return bad("PITR_RECOVERY_POINT_STALE", "OBSERVED_BEFORE_QUIESCENCE");

  if (evidence.pitrEnabled === false || evidence.walgEnabled === false) {
    return bad("PITR_DISABLED", "PITR_NOT_ENABLED");
  }
  if (evidence.pitrEnabled !== true) return bad("BACKUP_CAPABILITY_UNKNOWN", "PITR_ENABLED_UNKNOWN");

  const earliestMs = parseIsoMs(evidence.earliestRecoveryAt);
  const latestMs = parseIsoMs(evidence.latestRecoveryAt);
  if (earliestMs == null || latestMs == null || earliestMs > latestMs || latestMs > observedMs) {
    return bad("PITR_RANGE_UNKNOWN", "RECOVERY_RANGE_MISSING_OR_INCOHERENT");
  }
  if (latestMs < quiescenceMs) return bad("PITR_RECOVERY_POINT_STALE", "LATEST_RECOVERY_BEFORE_QUIESCENCE");
  if (earliestMs > quiescenceMs) return bad("PITR_RECOVERY_POINT_STALE", "RANGE_STARTS_AFTER_QUIESCENCE");

  return result({
    ok: true,
    failureCode: null,
    reason: null,
    usable: true,
    level: VERIFICATION_LEVEL.L1,
  });
}

/**
 * Congela o recovery point. Sem mutação de provider, sem restore.
 * Determinístico: capturedAt vem de nowMs injetado.
 */
export function captureRecoveryPoint({
  quiescenceAt,
  providerEvidence,
  environment,
  projectRef,
  expectedProjectRef,
  nowMs = Date.now(),
  maxAgeMs,
} = {}) {
  const evaluation = evaluatePitrRecoveryPoint(providerEvidence, {
    environment,
    projectRef,
    expectedProjectRef,
    quiescenceAt,
    nowMs,
    maxAgeMs,
  });
  if (!evaluation.usable) {
    return failure(evaluation.failureCode, evaluation.reason, { recoveryPoint: null, level: null });
  }
  const ev = evaluation.evidence;
  return {
    ok: true,
    failureCode: null,
    reason: null,
    level: VERIFICATION_LEVEL.L1,
    satisfiesPreMigration: false,
    recoveryPoint: Object.freeze({
      mode: BACKUP_MODE.PITR_RECOVERY_POINT,
      environment,
      projectRef,
      scope: BACKUP_RECOVERY_SCOPE,
      recoveryTarget: toIso(parseIsoMs(quiescenceAt)),
      observedRange: Object.freeze({
        earliestRecoveryAt: ev.earliestRecoveryAt,
        latestRecoveryAt: ev.latestRecoveryAt,
      }),
      capturedAt: toIso(nowMs),
      providerMetadata: Object.freeze({
        providerSource: ev.providerSource,
        pitrEnabled: ev.pitrEnabled,
        walgEnabled: ev.walgEnabled,
        backupEntryCount: ev.backups.length,
        observedAt: ev.observedAt,
      }),
    }),
  };
}

// ── Managed daily (observabilidade) ──────────────────────────
const MANAGED_DAILY_ACCEPTABLE_STATUSES = Object.freeze(["COMPLETED"]);

export function normalizeManagedDailyEvidence(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...normalizeIdentity(source),
    backupId: safeId(source.backupId),
    status: typeof source.status === "string" ? source.status.toUpperCase().slice(0, 40) : null,
    insertedAt: toIso(parseIsoMs(source.insertedAt)),
    physical: triState(source.physical),
  };
}

/**
 * L1 do daily gerenciado: existe backup COMPLETED, identidade confere,
 * observação fresca. NUNCA satisfaz o ponto de backup pré-migration
 * (satisfiesPreMigration é sempre false). Não há método de criação.
 */
export function evaluateManagedDailyEvidence(rawEvidence, {
  environment,
  projectRef,
  expectedProjectRef,
  nowMs = Date.now(),
  maxAgeMs = BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS,
} = {}) {
  const evidence = normalizeManagedDailyEvidence(rawEvidence);
  const result = (fields) => ({
    mode: BACKUP_MODE.MANAGED_DAILY,
    level: null,
    usable: false,
    satisfiesPreMigration: false,
    evidence,
    ...fields,
  });
  const bad = (code, reason) => result(failure(code, reason));

  const expectedIdentity = checkBackupIdentity({ environment, projectRef, expectedProjectRef });
  if (!expectedIdentity.ok) return bad(expectedIdentity.failureCode, expectedIdentity.reason);
  if (evidence.environment !== environment || evidence.projectRef !== projectRef) {
    return bad("BACKUP_PROJECT_MISMATCH", "EVIDENCE_IDENTITY_MISMATCH");
  }
  const observedMs = parseIsoMs(evidence.observedAt);
  if (observedMs == null) return bad("BACKUP_EVIDENCE_STALE", "OBSERVED_AT_MISSING");
  if (observedMs > nowMs) return bad("BACKUP_EVIDENCE_STALE", "OBSERVED_AT_IN_FUTURE");
  if (nowMs - observedMs > maxAgeMs) return bad("BACKUP_EVIDENCE_STALE", "OBSERVATION_EXPIRED");
  if (!evidence.backupId || !evidence.insertedAt) {
    return bad("BACKUP_EVIDENCE_MISSING", "BACKUP_ID_OR_INSERTED_AT_MISSING");
  }
  if (!MANAGED_DAILY_ACCEPTABLE_STATUSES.includes(evidence.status)) {
    return bad("BACKUP_VERIFY_FAILED", "MANAGED_DAILY_STATUS_NOT_ACCEPTABLE");
  }
  if (parseIsoMs(evidence.insertedAt) > observedMs) {
    return bad("BACKUP_EVIDENCE_STALE", "INSERTED_AT_AFTER_OBSERVATION");
  }
  return result({
    ok: true,
    failureCode: null,
    reason: null,
    usable: true,
    level: VERIFICATION_LEVEL.L1,
  });
}
