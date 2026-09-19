// ════════════════════════════════════════════════════════════
//  PDB-I2D1 — Evidência do CATALOG PROBE do write fence.
//
//  O banco (migration 162) expõe `app_db_release_write_coverage_probe()`,
//  uma RPC READ-ONLY (STABLE) que deriva a cobertura do write fence do
//  CATÁLOGO: assinatura, SECURITY DEFINER, owner, search_path, fingerprint
//  do corpo, sentinela do guard ANTES da primeira mutação, triggers de
//  tabela, cobertura do registry, funções escritoras NÃO classificadas e
//  privilégio de escrita direta de anon/authenticated.
//
//  Este módulo é PURO: valida o formato do resultado, compara com o
//  manifesto local (versão + hash) e avalia fail-closed. O adapter só chama
//  uma função `rpc` INJETADA — sem fetch, sem ambiente, sem DB por padrão.
//  Nenhum efeito colateral no import.
// ════════════════════════════════════════════════════════════

import { containsSecretMaterial } from "./db-backup-contract.js";
import {
  REGISTRY_REQUIRED_OPERATION_TYPES,
  REQUIRED_PATH_IDS,
  WRITE_FENCE_MANIFEST_HASH,
  WRITE_FENCE_MANIFEST_VERSION,
} from "./db-release-write-fence-manifest.js";

export const COVERAGE_PROBE_RPC_NAME = "app_db_release_write_coverage_probe";
export const COVERAGE_PROBE_SOURCE = "CATALOG_PROBE";

/** Evidência de cobertura envelhece: nunca fica verde para sempre. */
export const COVERAGE_EVIDENCE_MAX_AGE_MS = 5 * 60_000;
export const COVERAGE_EVIDENCE_MAX_FUTURE_SKEW_MS = 30_000;

/** Chaves de PERSISTENCE_GAPS (pipeline I2C2); `true` = lacuna aberta no banco alvo. */
export const PERSISTENCE_GAP_KEYS = Object.freeze([
  "LEASE_GENERATION_NOT_PERSISTED",
  "ACTIVE_EXECUTION_UNIQUENESS_NOT_ENFORCED",
  "PLAN_CORRELATION_UNIQUENESS_NOT_ENFORCED",
  "AUDIT_TAXONOMY_INCOMPLETE",
  "MAINTENANCE_DB_EDGE_RPCS_MISSING",
  "LOGIN_GATE_WRITER_MISSING",
  "DB_BINDING_RPC_MISSING",
  "REOPEN_GUARD_FOR_DB_BINDING_MISSING",
]);

const SHA256_RE = /^[0-9a-f]{64}$/;

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isCount = (value) => Number.isInteger(value) && value >= 0;

/** Todas as lacunas abertas: estado padrão quando NÃO há prova do banco. */
export function allPersistenceGapsOpen() {
  return Object.fromEntries(PERSISTENCE_GAP_KEYS.map((key) => [key, true]));
}

/**
 * Valida o JSON devolvido pela RPC. Qualquer desvio de formato => inválido
 * (fail-closed); nunca "conserta" nem completa campos ausentes.
 */
export function parseCatalogProbeResult(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errorCode: "CATALOG_PROBE_RESULT_INVALID" };
  }
  const registry = raw.registryCoverage;
  const persistence = raw.persistence;
  const valid =
    typeof raw.manifestVersion === "string"
    && typeof raw.manifestHash === "string" && SHA256_RE.test(raw.manifestHash)
    && typeof raw.inventoryComplete === "boolean"
    && isCount(raw.requiredPathCount)
    && isCount(raw.verifiedPathCount)
    && isStringArray(raw.missingPaths)
    && isStringArray(raw.unverifiedPaths)
    && Array.isArray(raw.directWriteBypasses)
    && raw.directWriteBypasses.every((item) => item
      && typeof item.table === "string" && typeof item.role === "string" && typeof item.mode === "string")
    && registry && typeof registry === "object"
    && isStringArray(registry.required) && isStringArray(registry.verified)
    && typeof registry.complete === "boolean"
    && persistence && typeof persistence === "object"
    && PERSISTENCE_GAP_KEYS.every((key) => typeof persistence[key] === "boolean")
    && typeof raw.evaluatedAt === "string" && Number.isFinite(Date.parse(raw.evaluatedAt));
  if (!valid) return { ok: false, errorCode: "CATALOG_PROBE_RESULT_INVALID" };
  if (containsSecretMaterial(raw)) {
    return { ok: false, errorCode: "CATALOG_PROBE_RESULT_SECRET_MATERIAL" };
  }
  return {
    ok: true,
    evidence: {
      ok: true,
      source: COVERAGE_PROBE_SOURCE,
      manifestVersion: raw.manifestVersion,
      manifestHash: raw.manifestHash,
      inventoryComplete: raw.inventoryComplete,
      requiredPathCount: raw.requiredPathCount,
      verifiedPathCount: raw.verifiedPathCount,
      missingPaths: [...raw.missingPaths],
      unverifiedPaths: [...raw.unverifiedPaths],
      directWriteBypasses: raw.directWriteBypasses.map((item) => ({ table: item.table, role: item.role, mode: item.mode })),
      registryCoverage: {
        required: [...registry.required],
        verified: [...registry.verified],
        complete: registry.complete,
      },
      persistence: Object.fromEntries(PERSISTENCE_GAP_KEYS.map((key) => [key, persistence[key]])),
      evaluatedAt: raw.evaluatedAt,
    },
  };
}

function base(fields) {
  return {
    complete: false,
    registryComplete: false,
    source: null,
    required: REQUIRED_PATH_IDS.length,
    covered: 0,
    uncovered: [],
    unknown: [],
    missing: [],
    directWriteBypasses: [],
    inventoryComplete: false,
    manifestVersion: null,
    manifestHash: null,
    reasonCode: "WRITE_FENCE_COVERAGE_UNKNOWN",
    evaluatedAt: null,
    ...fields,
  };
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const set = new Set(right);
  return left.every((item) => set.has(item)) && new Set(left).size === left.length;
}

function freshness(evidence, nowMs) {
  if (!Number.isFinite(nowMs)) return "WRITE_FENCE_COVERAGE_CLOCK_MISSING";
  const age = nowMs - Date.parse(evidence.evaluatedAt);
  if (age > COVERAGE_EVIDENCE_MAX_AGE_MS || age < -COVERAGE_EVIDENCE_MAX_FUTURE_SKEW_MS) {
    return "WRITE_FENCE_COVERAGE_STALE";
  }
  return null;
}

/**
 * Avalia a evidência do CATALOG_PROBE (formato v2). Completa somente se:
 *  - forma válida; source CATALOG_PROBE; manifestVersion E manifestHash iguais
 *    ao manifesto local (drift => stale/incompleto);
 *  - evidência FRESCA (relógio obrigatório);
 *  - todos os caminhos requeridos verificados (0 ausentes, 0 não verificados);
 *  - 0 escrita direta de anon/authenticated fora do fence;
 *  - inventário derivado do catálogo completo (0 escritor não classificado);
 *  - cobertura do registry completa para todos os tipos requeridos.
 * `registryComplete` (usado pelo gate de in-flight) exige o mesmo inventário
 * completo: zero linhas + inventário incompleto NÃO prova nada.
 */
export function evaluateCatalogCoverage(evidence, { nowMs } = {}) {
  if (!evidence || typeof evidence !== "object" || evidence.ok !== true) {
    return base({ reasonCode: evidence?.errorCode || "WRITE_FENCE_COVERAGE_EVIDENCE_MISSING" });
  }
  if (evidence.source !== COVERAGE_PROBE_SOURCE) {
    return base({ reasonCode: "WRITE_FENCE_COVERAGE_SOURCE_UNKNOWN" });
  }
  const parsed = parseCatalogProbeResult(evidence);
  if (!parsed.ok) return base({ source: evidence.source, reasonCode: "WRITE_FENCE_COVERAGE_PROBE_INVALID" });
  const probe = parsed.evidence;
  const common = {
    source: probe.source,
    manifestVersion: probe.manifestVersion,
    manifestHash: probe.manifestHash,
    evaluatedAt: probe.evaluatedAt,
  };

  if (
    probe.manifestVersion !== WRITE_FENCE_MANIFEST_VERSION
    || probe.manifestHash !== WRITE_FENCE_MANIFEST_HASH
    || probe.requiredPathCount !== REQUIRED_PATH_IDS.length
  ) {
    return base({ ...common, reasonCode: "WRITE_FENCE_COVERAGE_VERSION_MISMATCH" });
  }
  const stale = freshness(probe, nowMs);
  if (stale) return base({ ...common, reasonCode: stale });

  const bypassLabels = probe.directWriteBypasses.map((item) => `DIRECT_WRITE:${item.table}:${item.role}:${item.mode}`);
  const uncovered = [...probe.unverifiedPaths, ...bypassLabels];
  const registryRequiredOk = sameSet(probe.registryCoverage.required, [...REGISTRY_REQUIRED_OPERATION_TYPES]);
  const registryOk = registryRequiredOk
    && probe.registryCoverage.complete === true
    && sameSet(probe.registryCoverage.verified, probe.registryCoverage.required);
  const allVerified = probe.verifiedPathCount === probe.requiredPathCount
    && probe.missingPaths.length === 0
    && probe.unverifiedPaths.length === 0;

  let reasonCode = "WRITE_FENCE_COVERAGE_COMPLETE";
  if (bypassLabels.length > 0) reasonCode = "WRITE_FENCE_DIRECT_WRITE_BYPASS";
  else if (probe.unverifiedPaths.length > 0) reasonCode = "WRITE_FENCE_COVERAGE_INCOMPLETE";
  else if (probe.missingPaths.length > 0 || !allVerified) reasonCode = "WRITE_FENCE_COVERAGE_UNKNOWN";
  else if (!probe.inventoryComplete) reasonCode = "WRITE_FENCE_INVENTORY_INCOMPLETE";
  else if (!registryOk) reasonCode = "WRITE_FENCE_REGISTRY_INCOMPLETE";

  const complete = reasonCode === "WRITE_FENCE_COVERAGE_COMPLETE";
  return {
    ...base(common),
    complete,
    registryComplete: registryOk && probe.inventoryComplete && allVerified,
    covered: probe.verifiedPathCount,
    uncovered,
    missing: [...probe.missingPaths],
    directWriteBypasses: probe.directWriteBypasses,
    inventoryComplete: probe.inventoryComplete,
    reasonCode,
  };
}

/**
 * Lacunas de persistência DERIVADAS do catálogo real (não do repositório).
 * Sem evidência válida/fresca do banco alvo => todas abertas (fail-closed).
 */
export function derivePersistenceGaps(evidence, { nowMs } = {}) {
  if (!evidence || evidence.ok !== true || evidence.source !== COVERAGE_PROBE_SOURCE) return allPersistenceGapsOpen();
  const parsed = parseCatalogProbeResult(evidence);
  if (!parsed.ok) return allPersistenceGapsOpen();
  if (parsed.evidence.manifestVersion !== WRITE_FENCE_MANIFEST_VERSION
    || parsed.evidence.manifestHash !== WRITE_FENCE_MANIFEST_HASH) {
    return allPersistenceGapsOpen();
  }
  if (freshness(parsed.evidence, nowMs)) return allPersistenceGapsOpen();
  return { ...parsed.evidence.persistence };
}

// ── adapter (porta `probes.readWriteFenceCoverage`) ───────────
/** Padrão do repositório: nada é alcançável. */
export function createDisabledCatalogProbe() {
  return Object.freeze({
    enabled: false,
    transport: "DISABLED",
    disabledCode: "CATALOG_PROBE_NOT_ENABLED",
    readWriteFenceCoverage: async () => ({ ok: false, errorCode: "CATALOG_PROBE_NOT_ENABLED" }),
  });
}

/**
 * Adapter que chama UMA função injetada: `rpc(name, args)` =>
 * `{ ok, data }`. Sem fetch/ambiente aqui. `transport` é obrigatório e
 * explícito (SYNTHETIC em testes; LIVE só em I2D2 com autorização).
 */
export function createCatalogProbeAdapter({ rpc, transport } = {}) {
  if (typeof rpc !== "function") throw new TypeError("createCatalogProbeAdapter: rpc injetado é obrigatório.");
  if (transport !== "SYNTHETIC" && transport !== "LIVE") {
    throw new TypeError("createCatalogProbeAdapter: transport explícito (SYNTHETIC|LIVE) é obrigatório.");
  }
  return Object.freeze({
    enabled: true,
    transport,
    readWriteFenceCoverage: async () => {
      let response;
      try {
        response = await rpc(COVERAGE_PROBE_RPC_NAME, {});
      } catch {
        return { ok: false, errorCode: "CATALOG_PROBE_UNAVAILABLE" };
      }
      if (!response || response.ok !== true) return { ok: false, errorCode: "CATALOG_PROBE_UNAVAILABLE" };
      const parsed = parseCatalogProbeResult(response.data);
      return parsed.ok ? parsed.evidence : { ok: false, errorCode: parsed.errorCode };
    },
  });
}
