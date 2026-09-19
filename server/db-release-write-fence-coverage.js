// ════════════════════════════════════════════════════════════
//  PDB-I2C2 — Contrato de EVIDÊNCIA DE COBERTURA do write fence.
//
//  Problema: WRITE_FENCE_ACTIVE derivado só de `phase ∈ fase-fenced` prova
//  que o fence EXISTE, não que todo caminho de escrita de negócio o respeita.
//  Um caminho público sem guard (ex.: pub_criar_pedido_v2) continuaria
//  gravando durante DRAINING/QUIESCENT/BACKING_UP/MIGRATING.
//
//  Este módulo NÃO reescreve SQL. Define (a) o conjunto de caminhos de
//  escrita que precisam estar cobertos e (b) como avaliar uma evidência de
//  cobertura de forma fail-closed. WRITE_FENCE_ACTIVE só pode ser VERIFIED
//  para release DB quando phase fenced + cobertura COMPLETA.
//
//  Puro: sem rede, sem DB, sem ambiente, sem timer.
// ════════════════════════════════════════════════════════════

import { evaluateCatalogCoverage } from "./db-release-write-coverage-probe.js";

export const WRITE_FENCE_COVERAGE_VERSION = 1;

export const COVERAGE_STATUSES = Object.freeze(["COVERED", "UNCOVERED", "UNKNOWN"]);

/**
 * Origem da evidência. Só CATALOG_PROBE (leitura read-only do catálogo do
 * banco alvo, escopo I2D) é aceita como autoridade LIVE. STATIC_REPO_AUDIT
 * descreve o código do repositório (não o banco vivo). SYNTHETIC_TEST existe
 * apenas para exercitar a máquina de estados em testes.
 */
export const COVERAGE_SOURCES = Object.freeze(["CATALOG_PROBE", "STATIC_REPO_AUDIT", "SYNTHETIC_TEST"]);
export const LIVE_AUTHORITATIVE_COVERAGE_SOURCES = Object.freeze(["CATALOG_PROBE"]);

/** Tipos do Operation Registry (migration 150). Determinam cobertura de in-flight. */
export const REGISTRY_OPERATION_TYPES = Object.freeze([
  "CHECKOUT",
  "PUBLIC_ORDER",
  "INTERNAL_ORDER",
  "ONBOARDING",
  "FISCAL_RULE_MUTATION",
  "NFCE_EMISSION",
  "USER_ADMIN_MUTATION",
]);

/**
 * RPCs de escrita de PEDIDO (público + autenticado). Não passam pelo registry
 * e, na ÚLTIMA definição de cada uma, não chamam app_assert_business_write_allowed.
 * Origem: 134 (pub_criar_pedido_v2) e 132 (as oito app_pedido_* / app_criar_pedido).
 */
export const ORDER_WRITE_RPCS = Object.freeze([
  "pub_criar_pedido_v2",
  "app_criar_pedido",
  "app_pedido_atualizar_status",
  "app_pedido_marcar_setor_pronto",
  "app_pedido_atualizar_itens",
  "app_pedido_atualizar_cliente",
  "app_pedido_transferir_mesa",
  "app_pedido_solicitar_conta_mesa",
  "app_pedido_marcar_pago",
]);

/** Famílias de guard direto (`app_assert_business_write_allowed(NULL, NULL)`). */
export const DIRECT_GUARD_FAMILIES = Object.freeze([
  "MIG143_ADMIN_ALLOWLIST",
  "MIG144_TABLE_TRIGGERS",
  "MIG145_CUPONS",
  "MIG146_PRODUTOS",
  "MIG147_ADMIN_FINAL",
  "MIG148_DEVICE_HEARTBEAT",
]);

export const REQUIRED_WRITE_PATHS = Object.freeze([
  ...REGISTRY_OPERATION_TYPES.map((type) => `OP:${type}`),
  ...ORDER_WRITE_RPCS.map((name) => `RPC:${name}`),
  ...DIRECT_GUARD_FAMILIES.map((name) => `GUARD:${name}`),
]);

const REGISTRY_PATHS = Object.freeze(REGISTRY_OPERATION_TYPES.map((type) => `OP:${type}`));

/**
 * Estado do REPOSITÓRIO atual (auditado neste gate; um teste estático
 * recompara com o SQL das migrations para impedir drift silencioso).
 *   OP:CHECKOUT / OP:ONBOARDING       → integrados (migrations 151/152)
 *   OP:* demais                        → begin_internal nunca chamado
 *   RPC:<9 RPCs de pedido>             → última definição (132/134) sem guard nem registry
 *   GUARD:*                            → assert direto nas migrations 143–148
 */
export const CURRENT_CODE_PATH_STATUS = Object.freeze({
  "OP:CHECKOUT": "COVERED",
  "OP:PUBLIC_ORDER": "UNCOVERED",
  "OP:INTERNAL_ORDER": "UNCOVERED",
  "OP:ONBOARDING": "COVERED",
  "OP:FISCAL_RULE_MUTATION": "UNCOVERED",
  "OP:NFCE_EMISSION": "UNCOVERED",
  "OP:USER_ADMIN_MUTATION": "UNCOVERED",
  ...Object.fromEntries(ORDER_WRITE_RPCS.map((name) => [`RPC:${name}`, "UNCOVERED"])),
  "GUARD:MIG143_ADMIN_ALLOWLIST": "COVERED",
  "GUARD:MIG144_TABLE_TRIGGERS": "COVERED",
  "GUARD:MIG145_CUPONS": "COVERED",
  "GUARD:MIG146_PRODUTOS": "COVERED",
  "GUARD:MIG147_ADMIN_FINAL": "COVERED",
  "GUARD:MIG148_DEVICE_HEARTBEAT": "COVERED",
});

/**
 * Não existe inventário derivado do catálogo de TODAS as RPCs/tabelas de
 * escrita de negócio. A lista acima é o conjunto CONHECIDO. Enquanto um
 * CATALOG_PROBE não provar `inventoryComplete`, a cobertura nunca é completa.
 */
export const CURRENT_CODE_INVENTORY_COMPLETE = false;

/** Evidência do estado do REPOSITÓRIO (não do banco vivo). */
export function buildCurrentCodeCoverageEvidence({ nowMs } = {}) {
  return {
    ok: true,
    manifestVersion: WRITE_FENCE_COVERAGE_VERSION,
    source: "STATIC_REPO_AUDIT",
    inventoryComplete: CURRENT_CODE_INVENTORY_COMPLETE,
    evaluatedAt: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    paths: REQUIRED_WRITE_PATHS.map((id) => ({ id, status: CURRENT_CODE_PATH_STATUS[id] ?? "UNKNOWN" })),
  };
}

/** Evidência 100% coberta — SOMENTE para testes da máquina de estados. */
export function buildSyntheticCompleteCoverageEvidence({ nowMs } = {}) {
  return {
    ok: true,
    manifestVersion: WRITE_FENCE_COVERAGE_VERSION,
    source: "SYNTHETIC_TEST",
    inventoryComplete: true,
    evaluatedAt: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    paths: REQUIRED_WRITE_PATHS.map((id) => ({ id, status: "COVERED" })),
  };
}

function result(fields) {
  return {
    complete: false,
    registryComplete: false,
    source: null,
    required: REQUIRED_WRITE_PATHS.length,
    covered: 0,
    uncovered: [],
    unknown: [],
    missing: [],
    reasonCode: "WRITE_FENCE_COVERAGE_UNKNOWN",
    ...fields,
  };
}

/**
 * Avalia evidência de cobertura. Completa somente se:
 *   ok === true, manifestVersion atual, source conhecida,
 *   inventoryComplete === true, e TODO caminho requerido COVERED (sem
 *   duplicatas, sem caminho requerido ausente). Qualquer dúvida → incompleta.
 */
export function evaluateWriteFenceCoverage(evidence, options = {}) {
  // PDB-I2D1 — evidência do CATALOG_PROBE (manifestVersion textual, WFC-2): manifesto
  // + hash + frescor + bypass direto + inventário derivado do catálogo.
  // O formato v1 (manifestVersion numérico) segue inalterado abaixo.
  if (typeof evidence?.manifestVersion === "string") return evaluateCatalogCoverage(evidence, options);
  if (!evidence || typeof evidence !== "object" || evidence.ok !== true) {
    return result({ reasonCode: evidence?.errorCode || "WRITE_FENCE_COVERAGE_EVIDENCE_MISSING" });
  }
  if (evidence.manifestVersion !== WRITE_FENCE_COVERAGE_VERSION) {
    return result({ reasonCode: "WRITE_FENCE_COVERAGE_VERSION_MISMATCH" });
  }
  if (!COVERAGE_SOURCES.includes(evidence.source)) {
    return result({ reasonCode: "WRITE_FENCE_COVERAGE_SOURCE_UNKNOWN" });
  }
  const paths = Array.isArray(evidence.paths) ? evidence.paths : [];
  const byId = new Map();
  const duplicated = new Set();
  for (const item of paths) {
    if (!item || typeof item.id !== "string") continue;
    if (byId.has(item.id)) duplicated.add(item.id);
    else byId.set(item.id, item.status);
  }
  const uncovered = [];
  const unknown = [];
  const missing = [];
  let covered = 0;
  for (const id of REQUIRED_WRITE_PATHS) {
    if (duplicated.has(id)) {
      unknown.push(id);
      continue;
    }
    if (!byId.has(id)) {
      missing.push(id);
      continue;
    }
    const status = byId.get(id);
    if (status === "COVERED") covered += 1;
    else if (status === "UNCOVERED") uncovered.push(id);
    else unknown.push(id);
  }
  const registryComplete = REGISTRY_PATHS.every((id) => byId.get(id) === "COVERED" && !duplicated.has(id));
  const allCovered = covered === REQUIRED_WRITE_PATHS.length;
  const inventoryComplete = evidence.inventoryComplete === true;
  const complete = allCovered && inventoryComplete;
  let reasonCode = "WRITE_FENCE_COVERAGE_COMPLETE";
  if (uncovered.length > 0) reasonCode = "WRITE_FENCE_COVERAGE_INCOMPLETE";
  else if (unknown.length > 0 || missing.length > 0) reasonCode = "WRITE_FENCE_COVERAGE_UNKNOWN";
  else if (!inventoryComplete) reasonCode = "WRITE_FENCE_INVENTORY_INCOMPLETE";
  return {
    complete,
    registryComplete: registryComplete && inventoryComplete,
    source: evidence.source,
    required: REQUIRED_WRITE_PATHS.length,
    covered,
    uncovered,
    unknown,
    missing,
    reasonCode,
    evaluatedAt: evidence.evaluatedAt ?? null,
  };
}

/** Só uma fonte autoritativa live (CATALOG_PROBE) libera pipeline LIVE. */
export function isLiveAuthoritativeCoverage(evidence, options = {}) {
  return LIVE_AUTHORITATIVE_COVERAGE_SOURCES.includes(evidence?.source)
    && evaluateWriteFenceCoverage(evidence, options).complete === true;
}
