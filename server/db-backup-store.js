// ════════════════════════════════════════════════════════════
//  PDB-I2B — Store de backup runs (espelha app_backup_runs, migration 160).
//
//  Abstração sobre um TRANSPORT injetado. Este módulo não conecta em nada:
//  sem fetch, sem ambiente de processo, sem DB live. Testes usam o
//  transport em memória; o transport de produção (PostgREST) é escopo de I2C.
//
//  Semântica CAS: toda escrita é condicionada a (status, updated_at) lidos
//  antes — escrita concorrente/obsoleta vira BACKUP_CONFLICT.
//  Sem DELETE. Sem ressurreição. VERIFIED só via markVerification.
//
//  Colunas usadas: id, plan_id, execution_id, environment, provider,
//  provider_backup_id, status, started_at, completed_at, verified_at,
//  provider_metadata, integrity_evidence, requested_by, correlation_id,
//  created_at, updated_at. Modo/binding semântico vivem em JSONB (sem
//  migration 162): provider_metadata.{mode, projectRef, targetReleaseSha,
//  quiescenceAt, scope, contractVersion}.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import {
  BACKUP_CONTRACT_VERSION,
  BACKUP_INITIAL_STATE,
  BACKUP_RECOVERY_SCOPE,
  PROVIDER_BY_MODE,
  REQUIRED_LEVEL_FOR_VERIFIED,
  SHA1_RE,
  checkBackupIdentity,
  containsSecretMaterial,
  diffBackupBinding,
  failure,
  isBackupRunMode,
  isBackupStatus,
  isDbEnvironment,
  isUuid,
  modeForProvider,
  parseIsoMs,
  toIso,
  validateBackupBinding,
  validateBackupTransition,
  verificationLevelRank,
} from "./db-backup-contract.js";

const IMMUTABLE_METADATA_KEYS = Object.freeze([
  "mode", "projectRef", "targetReleaseSha", "quiescenceAt", "scope", "contractVersion",
]);

const TIMESTAMP_FOR_STATUS = Object.freeze({
  RUNNING: "started_at",
  COMPLETED: "completed_at",
  VERIFIED: "verified_at",
});

function nextUpdatedAt(previous, nowMs) {
  const prevMs = parseIsoMs(previous);
  return toIso(prevMs != null && prevMs >= nowMs ? prevMs + 1 : nowMs);
}

// ── Row ↔ domínio ────────────────────────────────────────────
/** Resumo read-only usado como evidência do readiness. Nunca expõe metadata bruto. */
export function summarizeBackupRun(row) {
  if (!row || typeof row !== "object") return null;
  const metadata = row.provider_metadata && typeof row.provider_metadata === "object" ? row.provider_metadata : {};
  const integrity = row.integrity_evidence && typeof row.integrity_evidence === "object" ? row.integrity_evidence : null;
  const mode = metadata.mode === modeForProvider(row.provider) ? metadata.mode : null;
  return {
    id: row.id,
    mode,
    status: row.status,
    environment: row.environment,
    projectRef: metadata.projectRef ?? null,
    planId: row.plan_id,
    executionId: row.execution_id ?? null,
    correlationId: row.correlation_id ?? null,
    targetReleaseSha: metadata.targetReleaseSha ?? null,
    quiescenceAt: metadata.quiescenceAt ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    verifiedAt: row.verified_at ?? null,
    failureCode: typeof metadata.failureCode === "string" ? metadata.failureCode : null,
    integrity: integrity
      ? {
        verificationLevel: integrity.verificationLevel ?? null,
        result: integrity.result ?? null,
        mode: integrity.mode ?? null,
        manifestDigest: integrity.manifestDigest ?? null,
        failureCode: integrity.failureCode ?? null,
        binding: integrity.binding ?? null,
      }
      : null,
  };
}

function rowIsWellFormed(row) {
  return Boolean(row)
    && isUuid(row.id)
    && isBackupStatus(row.status)
    && isDbEnvironment(row.environment)
    && modeForProvider(row.provider) != null;
}

// ── Transport em memória (testes / dev) ──────────────────────
/**
 * Transport mínimo:
 *   insert(row)                      → { ok, row } | { ok:false, error }
 *   select({ id?, planId? })         → { ok, rows }
 *   updateWhere({ id, expected:{status, updated_at}, patch }) → { ok, row } | { ok:false, error:"BACKUP_CONFLICT" }
 */
export function createMemoryBackupTransport() {
  const rows = new Map();
  return {
    rows,
    async insert(row) {
      if (rows.has(row.id)) return { ok: false, error: "BACKUP_CONFLICT" };
      rows.set(row.id, structuredClone(row));
      return { ok: true, row: structuredClone(row) };
    },
    async select({ id = null, planId = null } = {}) {
      const all = [...rows.values()].filter((row) => (
        (id == null || row.id === id) && (planId == null || row.plan_id === planId)
      ));
      return { ok: true, rows: all.map((row) => structuredClone(row)) };
    },
    async updateWhere({ id, expected, patch }) {
      const current = rows.get(id);
      if (!current) return { ok: false, error: "BACKUP_NOT_FOUND" };
      if (current.status !== expected?.status || current.updated_at !== expected?.updated_at) {
        return { ok: false, error: "BACKUP_CONFLICT" };
      }
      const updated = { ...current, ...structuredClone(patch) };
      rows.set(id, updated);
      return { ok: true, row: structuredClone(updated) };
    },
  };
}

// ── Store ────────────────────────────────────────────────────
export function createBackupStore({
  transport,
  now = () => Date.now(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const hasTransport = transport
    && typeof transport.insert === "function"
    && typeof transport.select === "function"
    && typeof transport.updateWhere === "function";

  const unavailable = () => failure("BACKUP_STORE_UNAVAILABLE", "TRANSPORT_MISSING");

  async function safe(call) {
    try {
      return await call();
    } catch {
      return failure("BACKUP_STORE_UNAVAILABLE", "TRANSPORT_THREW");
    }
  }

  async function load(id) {
    if (!isUuid(id)) return failure("BACKUP_INPUT_INVALID", "RUN_ID_INVALID");
    const result = await safe(() => transport.select({ id }));
    if (!result.ok) return result.failureCode ? result : failure("BACKUP_STORE_UNAVAILABLE", result.error || null);
    if (!Array.isArray(result.rows) || result.rows.length !== 1) return failure("BACKUP_NOT_FOUND", "RUN_NOT_FOUND");
    const row = result.rows[0];
    if (!rowIsWellFormed(row)) return failure("BACKUP_STORE_UNAVAILABLE", "ROW_MALFORMED");
    return { ok: true, row };
  }

  async function cas(row, patch) {
    const result = await safe(() => transport.updateWhere({
      id: row.id,
      expected: { status: row.status, updated_at: row.updated_at },
      patch: { ...patch, updated_at: nextUpdatedAt(row.updated_at, now()) },
    }));
    if (result.ok) return { ok: true, row: result.row, run: summarizeBackupRun(result.row) };
    if (result.failureCode) return result;
    if (result.error === "BACKUP_CONFLICT") return failure("BACKUP_CONFLICT", "STALE_WRITE");
    if (result.error === "BACKUP_NOT_FOUND") return failure("BACKUP_NOT_FOUND", "RUN_NOT_FOUND");
    return failure("BACKUP_STORE_UNAVAILABLE", result.error || null);
  }

  function expectedMatches(row, expectedUpdatedAt) {
    return expectedUpdatedAt == null || parseIsoMs(expectedUpdatedAt) === parseIsoMs(row.updated_at);
  }

  return {
    async createRun(input = {}) {
      if (!hasTransport) return unavailable();
      const {
        mode, planId, executionId = null, environment, projectRef, correlationId,
        targetReleaseSha, quiescenceAt, requestedBy = null, providerBackupId = null,
        providerMetadata = {},
      } = input;
      if (!isBackupRunMode(mode)) return failure("BACKUP_INPUT_INVALID", "MODE_INVALID");
      const identity = checkBackupIdentity({ environment, projectRef });
      if (!identity.ok) return failure(identity.failureCode, identity.reason);
      if (!isUuid(planId)) return failure("BACKUP_INPUT_INVALID", "PLAN_ID_INVALID");
      if (executionId != null && !isUuid(executionId)) return failure("BACKUP_INPUT_INVALID", "EXECUTION_ID_INVALID");
      if (!isUuid(correlationId)) return failure("BACKUP_INPUT_INVALID", "CORRELATION_ID_INVALID");
      if (requestedBy != null && !isUuid(requestedBy)) return failure("BACKUP_INPUT_INVALID", "REQUESTED_BY_INVALID");
      if (!SHA1_RE.test(targetReleaseSha || "")) return failure("BACKUP_INPUT_INVALID", "TARGET_RELEASE_SHA_INVALID");
      if (parseIsoMs(quiescenceAt) == null) return failure("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_INVALID");
      if (providerMetadata == null || typeof providerMetadata !== "object" || Array.isArray(providerMetadata)) {
        return failure("BACKUP_INPUT_INVALID", "PROVIDER_METADATA_INVALID");
      }
      const metadata = {
        ...providerMetadata,
        contractVersion: BACKUP_CONTRACT_VERSION,
        mode,
        scope: BACKUP_RECOVERY_SCOPE,
        projectRef,
        targetReleaseSha,
        quiescenceAt: toIso(parseIsoMs(quiescenceAt)),
      };
      if (containsSecretMaterial(metadata) || containsSecretMaterial(providerBackupId)) {
        return failure("BACKUP_SECRET_MATERIAL", "PROVIDER_METADATA_UNSAFE");
      }
      const createdAt = toIso(now());
      const initial = BACKUP_INITIAL_STATE[mode];
      const row = {
        id: idFactory(),
        plan_id: planId,
        execution_id: executionId,
        environment,
        provider: PROVIDER_BY_MODE[mode],
        provider_backup_id: providerBackupId ?? null,
        status: initial,
        started_at: null,
        completed_at: initial === "COMPLETED" ? createdAt : null,
        verified_at: null,
        provider_metadata: metadata,
        integrity_evidence: null,
        requested_by: requestedBy,
        correlation_id: correlationId,
        created_at: createdAt,
        updated_at: createdAt,
      };
      const result = await safe(() => transport.insert(row));
      if (!result.ok) {
        if (result.failureCode) return result;
        return result.error === "BACKUP_CONFLICT"
          ? failure("BACKUP_CONFLICT", "RUN_ALREADY_EXISTS")
          : failure("BACKUP_STORE_UNAVAILABLE", result.error || null);
      }
      return { ok: true, row: result.row, run: summarizeBackupRun(result.row) };
    },

    async getRun(id) {
      if (!hasTransport) return unavailable();
      const loaded = await load(id);
      return loaded.ok ? { ok: true, row: loaded.row, run: summarizeBackupRun(loaded.row) } : loaded;
    },

    async listRunsForPlan(planId) {
      if (!hasTransport) return unavailable();
      if (!isUuid(planId)) return failure("BACKUP_INPUT_INVALID", "PLAN_ID_INVALID");
      const result = await safe(() => transport.select({ planId }));
      if (!result.ok || !Array.isArray(result.rows)) {
        return result.failureCode ? result : failure("BACKUP_STORE_UNAVAILABLE", result.error || null);
      }
      const rows = result.rows.filter(rowIsWellFormed);
      if (rows.length !== result.rows.length) return failure("BACKUP_STORE_UNAVAILABLE", "ROW_MALFORMED");
      return { ok: true, runs: rows.map(summarizeBackupRun) };
    },

    /** Transição de estado. VERIFIED e FAILED têm caminhos próprios (markVerification/failRun). */
    async transitionRun({ id, to, expectedUpdatedAt = null } = {}) {
      if (!hasTransport) return unavailable();
      const loaded = await load(id);
      if (!loaded.ok) return loaded;
      const { row } = loaded;
      if (to === "VERIFIED" || to === "FAILED") {
        return failure("BACKUP_STATE_TRANSITION_ILLEGAL", "USE_DEDICATED_PATH");
      }
      const mode = modeForProvider(row.provider);
      const check = validateBackupTransition({ mode, from: row.status, to });
      if (!check.ok) return check;
      if (!expectedMatches(row, expectedUpdatedAt)) return failure("BACKUP_CONFLICT", "STALE_EXPECTED_UPDATED_AT");
      const patch = { status: to };
      const stamp = TIMESTAMP_FOR_STATUS[to];
      if (stamp) patch[stamp] = toIso(now());
      return cas(row, patch);
    },

    /** Anexa metadata do provider (merge). Campos de identidade/binding são imutáveis. */
    async attachProviderMetadata({ id, metadata, providerBackupId, expectedUpdatedAt = null } = {}) {
      if (!hasTransport) return unavailable();
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return failure("BACKUP_INPUT_INVALID", "METADATA_INVALID");
      }
      if (IMMUTABLE_METADATA_KEYS.some((key) => key in metadata)) {
        return failure("BACKUP_INPUT_INVALID", "IMMUTABLE_METADATA_KEY");
      }
      if (containsSecretMaterial(metadata) || containsSecretMaterial(providerBackupId)) {
        return failure("BACKUP_SECRET_MATERIAL", "PROVIDER_METADATA_UNSAFE");
      }
      const loaded = await load(id);
      if (!loaded.ok) return loaded;
      const { row } = loaded;
      if (row.status === "VERIFIED" || row.status === "FAILED") {
        return failure("BACKUP_STATE_TRANSITION_ILLEGAL", "TERMINAL_STATE");
      }
      if (!expectedMatches(row, expectedUpdatedAt)) return failure("BACKUP_CONFLICT", "STALE_EXPECTED_UPDATED_AT");
      const patch = { provider_metadata: { ...row.provider_metadata, ...metadata } };
      if (providerBackupId != null) patch.provider_backup_id = providerBackupId;
      return cas(row, patch);
    },

    /** Anexa evidência de integridade (sem mudar status). Só COMPLETED/VERIFYING. */
    async attachIntegrityEvidence({ id, evidence, expectedUpdatedAt = null } = {}) {
      if (!hasTransport) return unavailable();
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
        return failure("BACKUP_INPUT_INVALID", "EVIDENCE_INVALID");
      }
      if (containsSecretMaterial(evidence)) return failure("BACKUP_SECRET_MATERIAL", "INTEGRITY_EVIDENCE_UNSAFE");
      const loaded = await load(id);
      if (!loaded.ok) return loaded;
      const { row } = loaded;
      if (row.status !== "COMPLETED" && row.status !== "VERIFYING") {
        return failure("BACKUP_STATE_TRANSITION_ILLEGAL", "EVIDENCE_REQUIRES_COMPLETED_OR_VERIFYING");
      }
      if (!expectedMatches(row, expectedUpdatedAt)) return failure("BACKUP_CONFLICT", "STALE_EXPECTED_UPDATED_AT");
      return cas(row, { integrity_evidence: evidence });
    },

    /**
     * Único caminho para VERIFIED/FAILED-por-verificação. Exige status VERIFYING,
     * evidência do nível exigido para o modo e binding idêntico ao do run.
     */
    async markVerification({ id, verification, evidence, expectedUpdatedAt = null } = {}) {
      if (!hasTransport) return unavailable();
      if (!verification || typeof verification !== "object") {
        return failure("BACKUP_INPUT_INVALID", "VERIFICATION_MISSING");
      }
      if (!evidence || typeof evidence !== "object" || containsSecretMaterial(evidence)) {
        return failure("BACKUP_INPUT_INVALID", "EVIDENCE_INVALID_OR_UNSAFE");
      }
      const loaded = await load(id);
      if (!loaded.ok) return loaded;
      const { row } = loaded;
      const mode = modeForProvider(row.provider);
      if (row.status !== "VERIFYING") {
        return failure("BACKUP_STATE_TRANSITION_ILLEGAL", "VERIFICATION_REQUIRES_VERIFYING");
      }
      if (!expectedMatches(row, expectedUpdatedAt)) return failure("BACKUP_CONFLICT", "STALE_EXPECTED_UPDATED_AT");

      const summary = summarizeBackupRun(row);
      const boundary = validateBackupBinding(summary);
      if (!boundary.ok) return failure(boundary.failureCode, `RUN_${boundary.reason}`);
      if (evidence.mode !== mode || diffBackupBinding(evidence.binding, summary).length > 0) {
        return failure("BACKUP_CORRELATION_MISMATCH", "EVIDENCE_NOT_BOUND_TO_RUN");
      }

      if (verification.verified === true) {
        const required = REQUIRED_LEVEL_FOR_VERIFIED[mode];
        if (evidence.result !== "VERIFIED"
          || evidence.verificationLevel !== verification.level
          || verificationLevelRank(verification.level) < verificationLevelRank(required)) {
          return failure("BACKUP_VERIFY_FAILED", "LEVEL_OR_RESULT_INSUFFICIENT_FOR_VERIFIED");
        }
        const check = validateBackupTransition({ mode, from: "VERIFYING", to: "VERIFIED" });
        if (!check.ok) return check;
        return cas(row, {
          status: "VERIFIED",
          verified_at: toIso(now()),
          integrity_evidence: evidence,
        });
      }
      const check = validateBackupTransition({ mode, from: "VERIFYING", to: "FAILED" });
      if (!check.ok) return check;
      return cas(row, {
        status: "FAILED",
        integrity_evidence: { ...evidence, result: "FAILED" },
        provider_metadata: {
          ...row.provider_metadata,
          failureCode: verification.failureCode || "BACKUP_VERIFY_FAILED",
        },
      });
    },

    /** Falha explícita de qualquer estado ativo. Terminal. */
    async failRun({ id, failureCode = "BACKUP_CREATE_FAILED", expectedUpdatedAt = null } = {}) {
      if (!hasTransport) return unavailable();
      const loaded = await load(id);
      if (!loaded.ok) return loaded;
      const { row } = loaded;
      const check = validateBackupTransition({ mode: modeForProvider(row.provider), from: row.status, to: "FAILED" });
      if (!check.ok) return check;
      if (!expectedMatches(row, expectedUpdatedAt)) return failure("BACKUP_CONFLICT", "STALE_EXPECTED_UPDATED_AT");
      return cas(row, {
        status: "FAILED",
        provider_metadata: { ...row.provider_metadata, failureCode },
      });
    },
  };
}

/**
 * Adapter READ-ONLY de evidência de backup para o readiness. Usa somente
 * leituras do store (listRunsForPlan). Nenhuma escrita, nenhum provider.
 */
export function createBackupEvidenceAdapter({ store } = {}) {
  return async function readBackupEvidence({ plan, nowMs = Date.now() } = {}) {
    const evaluatedAt = toIso(nowMs);
    if (!store || typeof store.listRunsForPlan !== "function") {
      return { ok: false, errorCode: "BACKUP_STORE_UNAVAILABLE", evaluatedAt };
    }
    if (!plan?.id) {
      return { ok: false, errorCode: "BACKUP_EVIDENCE_MISSING", evaluatedAt };
    }
    const result = await store.listRunsForPlan(plan.id);
    if (!result.ok) {
      return { ok: false, errorCode: result.failureCode || "BACKUP_STORE_UNAVAILABLE", evaluatedAt };
    }
    return { ok: true, runs: result.runs, evaluatedAt };
  };
}
