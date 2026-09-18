// ════════════════════════════════════════════════════════════
//  PDB-I2B — Modelo de capabilities + seletor adaptativo de estratégia.
//
//  Puro e determinístico: sem rede, sem DB, sem ambiente de processo.
//  UNKNOWN permanece UNKNOWN — ausência de evidência nunca vira false.
// ════════════════════════════════════════════════════════════

import {
  BACKUP_MODE,
  BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS,
  BACKUP_TOOLS,
  CAPABILITY_UNKNOWN,
  PROJECT_REF_RE,
  PROVIDER_CAPABILITIES,
  PROVIDER_SOURCE_RE,
  checkBackupIdentity,
  failure,
  isBackupMode,
  isDbEnvironment,
  parseIsoMs,
  toIso,
} from "./db-backup-contract.js";

const POSTGRES_VERSION_RE = /^\d{1,3}(\.\d{1,3}){0,2}$/;

function triState(value) {
  return value === true || value === false ? value : CAPABILITY_UNKNOWN;
}

/**
 * Normaliza capabilities observadas. Nenhuma rede. Campos ausentes ou de tipo
 * errado viram UNKNOWN (nunca false). environment/projectRef ficam vinculados.
 */
export function normalizeCapabilities(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const capabilities = {};
  for (const key of PROVIDER_CAPABILITIES) {
    capabilities[key] = triState(source[key]);
  }
  const tools = {};
  for (const key of BACKUP_TOOLS) {
    tools[key] = triState(source.tools?.[key]);
  }
  const observedMs = parseIsoMs(source.observedAt);
  return {
    environment: isDbEnvironment(source.environment) ? source.environment : null,
    projectRef: typeof source.projectRef === "string" && PROJECT_REF_RE.test(source.projectRef)
      ? source.projectRef
      : null,
    postgresVersion: typeof source.postgresVersion === "string" && POSTGRES_VERSION_RE.test(source.postgresVersion)
      ? source.postgresVersion
      : null,
    providerSource: typeof source.providerSource === "string" && PROVIDER_SOURCE_RE.test(source.providerSource)
      ? source.providerSource
      : CAPABILITY_UNKNOWN,
    observedAt: toIso(observedMs),
    capabilities,
    tools,
  };
}

export function evaluateCapabilityFreshness(
  normalized,
  { nowMs = Date.now(), maxAgeMs = BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS } = {},
) {
  const observedMs = parseIsoMs(normalized?.observedAt);
  if (observedMs == null) return { stale: true, reason: "OBSERVED_AT_MISSING" };
  if (observedMs > nowMs) return { stale: true, reason: "OBSERVED_AT_IN_FUTURE" };
  if (nowMs - observedMs > maxAgeMs) return { stale: true, reason: "OBSERVATION_EXPIRED" };
  return { stale: false, reason: null };
}

/** PITR utilizável em nível de capability (o ponto concreto é avaliado em provider-evidence). */
export function isPitrUsableCapability(caps) {
  return caps?.pitrSupported === true
    && caps?.pitrEnabled === true
    && caps?.recoveryPointRangeKnown === true;
}

function pitrStatus(caps) {
  if (isPitrUsableCapability(caps)) return "USABLE";
  if (caps.pitrEnabled === false || caps.pitrSupported === false) return "NOT_AVAILABLE";
  return "UNKNOWN";
}

/**
 * Seleção adaptativa:
 *   logical indisponível/UNKNOWN → fail closed (PITR-only e daily-only NÃO bastam);
 *   logical + PITR utilizável    → DUAL;
 *   logical sem PITR utilizável  → LOGICAL_SNAPSHOT (PITR opcional, nunca presumido).
 *
 * requestedMode:
 *   null                → adaptativo;
 *   DUAL                → falha fechada se PITR não utilizável (sem downgrade silencioso);
 *   LOGICAL_SNAPSHOT    → honrado (sem upgrade silencioso);
 *   MANAGED_DAILY/PITR  → nunca satisfazem o ponto pré-migration → fail closed.
 */
export function selectBackupStrategy(rawCapabilities, {
  nowMs = Date.now(),
  requestedMode = null,
  expectedEnvironment = null,
  expectedProjectRef = null,
  maxAgeMs = BACKUP_RUNTIME_EVIDENCE_FRESHNESS_MS,
} = {}) {
  const normalized = normalizeCapabilities(rawCapabilities);
  const caps = normalized.capabilities;
  const base = {
    strategyClass: "ADAPTIVE",
    environment: normalized.environment,
    projectRef: normalized.projectRef,
    capabilities: normalized,
    mode: null,
    runModes: [],
    preMigrationCapable: false,
    supplemental: {
      pitr: pitrStatus(caps),
      managedDaily: caps.managedDailySupported,
      physicalBackup: caps.physicalBackupSupported,
    },
  };
  const fail = (failureCode, reason) => ({ ...base, ...failure(failureCode, reason) });

  if (requestedMode != null && !isBackupMode(requestedMode)) {
    return fail("BACKUP_INPUT_INVALID", "REQUESTED_MODE_INVALID");
  }
  if (requestedMode === BACKUP_MODE.MANAGED_DAILY || requestedMode === BACKUP_MODE.PITR_RECOVERY_POINT) {
    return fail("BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION", `${requestedMode}_ALONE_INSUFFICIENT`);
  }

  const identity = checkBackupIdentity({
    environment: normalized.environment,
    projectRef: normalized.projectRef,
    expectedProjectRef: expectedProjectRef ?? undefined,
  });
  if (!identity.ok) return fail(identity.failureCode, identity.reason);
  if (expectedEnvironment != null && expectedEnvironment !== normalized.environment) {
    return fail("BACKUP_PROJECT_MISMATCH", "ENVIRONMENT_MISMATCH");
  }

  const freshness = evaluateCapabilityFreshness(normalized, { nowMs, maxAgeMs });
  if (freshness.stale) return fail("BACKUP_EVIDENCE_STALE", freshness.reason);

  if (caps.logicalSnapshotSupported === CAPABILITY_UNKNOWN) {
    return fail("BACKUP_CAPABILITY_UNKNOWN", "LOGICAL_SNAPSHOT_UNKNOWN");
  }
  if (caps.logicalSnapshotSupported !== true) {
    const onlyWeak = caps.pitrEnabled === true || caps.managedDailySupported === true;
    return fail(
      onlyWeak ? "BACKUP_INSUFFICIENT_FOR_PRE_MIGRATION" : "BACKUP_STRATEGY_UNAVAILABLE",
      onlyWeak ? "PITR_OR_DAILY_ONLY_INSUFFICIENT" : "LOGICAL_SNAPSHOT_UNSUPPORTED",
    );
  }

  const pitrUsable = isPitrUsableCapability(caps);
  if (requestedMode === BACKUP_MODE.DUAL && !pitrUsable) {
    return fail("BACKUP_STRATEGY_UNAVAILABLE", "DUAL_REQUESTED_BUT_PITR_NOT_USABLE");
  }
  const dual = pitrUsable && requestedMode !== BACKUP_MODE.LOGICAL_SNAPSHOT;
  return {
    ...base,
    ok: true,
    failureCode: null,
    reason: null,
    mode: dual ? BACKUP_MODE.DUAL : BACKUP_MODE.LOGICAL_SNAPSHOT,
    runModes: dual
      ? [BACKUP_MODE.LOGICAL_SNAPSHOT, BACKUP_MODE.PITR_RECOVERY_POINT]
      : [BACKUP_MODE.LOGICAL_SNAPSHOT],
    preMigrationCapable: true,
  };
}
