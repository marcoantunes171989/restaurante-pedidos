import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_CODE_INVENTORY_COMPLETE,
  CURRENT_CODE_PATH_STATUS,
  DIRECT_GUARD_FAMILIES,
  ORDER_WRITE_RPCS,
  REGISTRY_OPERATION_TYPES,
  REQUIRED_WRITE_PATHS,
  WRITE_FENCE_COVERAGE_VERSION,
  buildCurrentCodeCoverageEvidence,
  buildSyntheticCompleteCoverageEvidence,
  evaluateWriteFenceCoverage,
  isLiveAuthoritativeCoverage,
} from "../../server/db-release-write-fence-coverage.js";
import {
  deriveInFlightGate,
  deriveMaintenanceGates,
  deriveSessionZeroGate,
  derivePlanGates,
} from "../../server/db-release-readiness.js";

import { buildPlan, publicPlanFrom } from "./helpers/db-release-executor-fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const sql = (file) => readFileSync(resolve(migrationsDir, file), "utf8");

const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

/** Última definição de uma função pública (corpo até a próxima `create function`). */
function latestDefinition(name) {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(`, "ig");
  let last = null;
  for (const file of migrationFiles) {
    const text = sql(file);
    let match;
    while ((match = re.exec(text)) !== null) {
      const rest = text.slice(match.index);
      const next = rest.slice(10).search(/\ncreate (?:or replace )?function /i);
      last = { file, body: next === -1 ? rest : rest.slice(0, next + 10) };
    }
  }
  return last;
}

describe("write fence — contrato de cobertura", () => {
  it("caminhos requeridos: 7 tipos de registry + 9 RPCs de pedido + 6 famílias de guard", () => {
    expect(REGISTRY_OPERATION_TYPES).toHaveLength(7);
    expect(ORDER_WRITE_RPCS).toHaveLength(9);
    expect(DIRECT_GUARD_FAMILIES).toHaveLength(6);
    expect(REQUIRED_WRITE_PATHS).toHaveLength(22);
    expect(new Set(REQUIRED_WRITE_PATHS).size).toBe(22);
    expect(Object.keys(CURRENT_CODE_PATH_STATUS).sort()).toEqual([...REQUIRED_WRITE_PATHS].sort());
  });

  it("CÓDIGO ATUAL: cobertura INCOMPLETA — lacunas exatas reportadas", () => {
    const coverage = evaluateWriteFenceCoverage(buildCurrentCodeCoverageEvidence({ nowMs: NOW }));
    expect(coverage.complete).toBe(false);
    expect(coverage.registryComplete).toBe(false);
    expect(coverage.reasonCode).toBe("WRITE_FENCE_COVERAGE_INCOMPLETE");
    expect(coverage.uncovered).toEqual([
      "OP:PUBLIC_ORDER",
      "OP:INTERNAL_ORDER",
      "OP:FISCAL_RULE_MUTATION",
      "OP:NFCE_EMISSION",
      "OP:USER_ADMIN_MUTATION",
      ...ORDER_WRITE_RPCS.map((name) => `RPC:${name}`),
    ]);
    expect(coverage.covered).toBe(8);
    expect(CURRENT_CODE_INVENTORY_COMPLETE).toBe(false);
    expect(isLiveAuthoritativeCoverage(buildCurrentCodeCoverageEvidence({ nowMs: NOW }))).toBe(false);
  });

  it("evidência sintética completa serve à máquina de estados, mas NUNCA é autoridade live", () => {
    const evidence = buildSyntheticCompleteCoverageEvidence({ nowMs: NOW });
    expect(evaluateWriteFenceCoverage(evidence)).toMatchObject({ complete: true, registryComplete: true, source: "SYNTHETIC_TEST" });
    expect(isLiveAuthoritativeCoverage(evidence)).toBe(false);
    expect(isLiveAuthoritativeCoverage({ ...evidence, source: "CATALOG_PROBE" })).toBe(true);
  });

  it("fail-closed: qualquer dúvida torna a cobertura incompleta", () => {
    const good = buildSyntheticCompleteCoverageEvidence({ nowMs: NOW });
    const bads = {
      ausente: undefined,
      "ok=false": { ...good, ok: false, errorCode: "CATALOG_UNAVAILABLE" },
      "versão": { ...good, manifestVersion: WRITE_FENCE_COVERAGE_VERSION + 1 },
      "fonte desconhecida": { ...good, source: "BROWSER" },
      "inventário incompleto": { ...good, inventoryComplete: false },
      "inventário não booleano": { ...good, inventoryComplete: "true" },
      "caminho ausente": { ...good, paths: good.paths.slice(1) },
      "caminho duplicado": { ...good, paths: [...good.paths, { id: good.paths[0].id, status: "COVERED" }] },
      "status desconhecido": { ...good, paths: good.paths.map((item, index) => (index === 3 ? { ...item, status: "MAYBE" } : item)) },
      "status UNKNOWN": { ...good, paths: good.paths.map((item, index) => (index === 3 ? { ...item, status: "UNKNOWN" } : item)) },
      "paths não array": { ...good, paths: "COVERED" },
    };
    for (const [label, evidence] of Object.entries(bads)) {
      expect(evaluateWriteFenceCoverage(evidence).complete, label).toBe(false);
    }
    expect(evaluateWriteFenceCoverage({ ...good, inventoryComplete: false }).reasonCode).toBe("WRITE_FENCE_INVENTORY_INCOMPLETE");
    expect(evaluateWriteFenceCoverage(bads["caminho ausente"]).missing).toHaveLength(1);
  });

  it("todos COVERED mas registry parcial não declara registryComplete (in-flight não é autoritativo)", () => {
    const good = buildSyntheticCompleteCoverageEvidence({ nowMs: NOW });
    const partial = { ...good, paths: good.paths.map((item) => (item.id === "OP:PUBLIC_ORDER" ? { ...item, status: "UNCOVERED" } : item)) };
    expect(evaluateWriteFenceCoverage(partial)).toMatchObject({ complete: false, registryComplete: false });
  });
});

describe("gates derivados — write fence, in-flight, sessão, aprovação", () => {
  const maintenance = (extra = {}) => ({
    ok: true,
    phase: "DRAINING",
    version: 4,
    epoch: 2,
    loginGate: "CLOSED",
    fenceEffectiveAt: iso(NOW - 1000),
    evaluatedAt: iso(NOW),
    ...extra,
  });
  const fence = (m) => deriveMaintenanceGates(m, { nowMs: NOW }).find((gate) => gate.key === "WRITE_FENCE_ACTIVE");

  it("phase fenced SEM evidência de cobertura → UNKNOWN (não VERIFIED)", () => {
    expect(fence(maintenance())).toMatchObject({ status: "UNKNOWN", reasonCode: "WRITE_FENCE_COVERAGE_EVIDENCE_MISSING" });
  });

  it("cobertura do código atual → BLOCKED com lacunas", () => {
    expect(fence(maintenance({ writeFenceCoverage: buildCurrentCodeCoverageEvidence({ nowMs: NOW }) })))
      .toMatchObject({ status: "BLOCKED", reasonCode: "WRITE_FENCE_COVERAGE_INCOMPLETE" });
  });

  it("cobertura completa + phase fenced → VERIFIED", () => {
    expect(fence(maintenance({ writeFenceCoverage: buildSyntheticCompleteCoverageEvidence({ nowMs: NOW }) })).status).toBe("VERIFIED");
  });

  it("cobertura completa mas phase NORMAL / sem fenceEffectiveAt → BLOCKED", () => {
    const coverage = buildSyntheticCompleteCoverageEvidence({ nowMs: NOW });
    expect(fence(maintenance({ phase: "NORMAL", writeFenceCoverage: coverage })).status).toBe("BLOCKED");
    expect(fence(maintenance({ fenceEffectiveAt: null, writeFenceCoverage: coverage })).status).toBe("BLOCKED");
  });

  it("in-flight: zero SÓ é VERIFIED com cobertura completa; contagem >0 bloqueia; ausência é UNKNOWN", () => {
    const base = { ok: true, inFlightCount: 0, evaluatedAt: iso(NOW) };
    expect(deriveInFlightGate({ ...base, coverageComplete: true }, { nowMs: NOW })).toMatchObject({ status: "VERIFIED", reasonCode: "IN_FLIGHT_ZERO_AUTHORITATIVE" });
    expect(deriveInFlightGate({ ...base, coverageComplete: false }, { nowMs: NOW }).status).toBe("UNKNOWN");
    expect(deriveInFlightGate({ ...base }, { nowMs: NOW }).status).toBe("UNKNOWN");
    expect(deriveInFlightGate({ ...base, coverageComplete: true, inFlightCount: 2 }, { nowMs: NOW }).status).toBe("BLOCKED");
    expect(deriveInFlightGate({ ok: true, coverageComplete: true, evaluatedAt: iso(NOW) }, { nowMs: NOW }).status).toBe("UNKNOWN");
    expect(deriveInFlightGate({ ok: false, errorCode: "X" }, { nowMs: NOW }).status).toBe("UNKNOWN");
    expect(deriveInFlightGate({ ...base, coverageComplete: "true" }, { nowMs: NOW }).status).toBe("UNKNOWN");
  });

  it("sessão: prova de outra geração é STALE; sem geração e exigida é UNKNOWN; compatível é VERIFIED", () => {
    const m = maintenance();
    const proof = { ok: true, aliveSessionCount: 0, heartbeatAfterGateCloseCount: 0, evaluatedAt: iso(NOW), maintenanceEpoch: 2, maintenanceGeneration: 4 };
    const derive = (session, extra = {}) => deriveSessionZeroGate(session, { nowMs: NOW, maintenance: m, ...extra });
    expect(derive(proof).status).toBe("VERIFIED");
    expect(derive({ ...proof, maintenanceGeneration: 5 })).toMatchObject({ status: "STALE", reasonCode: "SESSION_PROOF_GENERATION_MISMATCH" });
    expect(derive({ ...proof, maintenanceEpoch: 1 }).status).toBe("STALE");
    const noGeneration = { ok: true, aliveSessionCount: 0, heartbeatAfterGateCloseCount: 0, evaluatedAt: iso(NOW) };
    expect(derive(noGeneration).status).toBe("VERIFIED"); // compat com I1C1 (sem exigência)
    expect(derive(noGeneration, { requireGeneration: true })).toMatchObject({ status: "UNKNOWN", reasonCode: "SESSION_PROOF_GENERATION_MISSING" });
    expect(derive({ ...proof, aliveSessionCount: 1 }).status).toBe("BLOCKED");
  });

  it("aprovação humana continua VÁLIDA com o plano RUNNING (só o executor grava RUNNING); DRAFT/CANCELED não", () => {
    const bundle = buildPlan({ status: "APPROVED" });
    const publicPlan = (status) => ({
      ok: true,
      ...publicPlanFrom(bundle),
      status,
      migrations: bundle.migrationRows.map((row) => ({
        order: row.migration_order, filename: row.filename, gitBlob: row.git_blob, sha256: row.sha256, bytes: row.bytes, classification: row.classification,
      })),
      evaluatedAt: iso(NOW),
    });
    const approval = (status) => derivePlanGates(publicPlan(status), { nowMs: NOW }).find((gate) => gate.key === "HUMAN_APPROVAL_VALID").status;
    expect(approval("APPROVED")).toBe("VERIFIED");
    expect(approval("SCHEDULED")).toBe("VERIFIED");
    expect(approval("RUNNING")).toBe("VERIFIED");
    for (const status of ["DRAFT", "VALIDATED", "CANCELED", "FAILED", "BLOCKED", "SUCCEEDED"]) {
      expect(approval(status), status).not.toBe("VERIFIED");
    }
  });
});

describe("auditoria ESTÁTICA: o manifesto reflete o SQL do repositório (sem drift silencioso)", () => {
  it("as 9 RPCs de pedido: última definição sem guard e sem registry (lacuna real)", () => {
    for (const name of ORDER_WRITE_RPCS) {
      const definition = latestDefinition(name);
      expect(definition, name).not.toBeNull();
      expect(definition.body, `${name} em ${definition.file}`).not.toMatch(/app_assert_business_write_allowed/i);
      expect(definition.body, `${name} em ${definition.file}`).not.toMatch(/app_maintenance_operation_begin_internal/i);
      expect(CURRENT_CODE_PATH_STATUS[`RPC:${name}`]).toBe("UNCOVERED");
    }
    expect(latestDefinition("pub_criar_pedido_v2").file).toBe("134_pub_criar_pedido_v2.sql");
    expect(latestDefinition("app_criar_pedido").file).toBe("132_criar_pedido_autenticado_seguro.sql");
  });

  it("registry: só CHECKOUT e ONBOARDING têm begin_internal; os outros 5 tipos nunca são iniciados", () => {
    const all = migrationFiles.map((file) => sql(file)).join("\n");
    for (const type of REGISTRY_OPERATION_TYPES) {
      const called = new RegExp(`app_maintenance_operation_begin_internal\\(\\s*'${type}'\\s*\\)`, "i").test(all);
      expect(called, type).toBe(CURRENT_CODE_PATH_STATUS[`OP:${type}`] === "COVERED");
    }
  });

  it("famílias de guard 143–148 realmente chamam app_assert_business_write_allowed(NULL, NULL)", () => {
    for (const file of migrationFiles.filter((name) => /^14[3-8]_/.test(name))) {
      expect(sql(file), file).toMatch(/app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)/i);
    }
  });

  it("lacunas de PERSISTÊNCIA/transporte que I2D precisa fechar continuam reais no SQL", () => {
    const m160 = sql("160_db_release_orchestrator_foundation.sql");
    // sem lease_generation persistido
    expect(m160).not.toMatch(/lease_generation/i);
    // sem índice único por ambiente/execução ativa e sem unique(plan_id, correlation_id)
    expect(m160).not.toMatch(/create unique index/i);
    expect(m160).not.toMatch(/unique\s*\(\s*plan_id\s*,\s*correlation_id/i);
    // sem escritor de login_gate (só DEFAULT 'OPEN' e leitura)
    const all = migrationFiles.map((file) => sql(file)).join("\n");
    expect(all).not.toMatch(/login_gate\s*=\s*'/i);
    expect(all).not.toMatch(/set\s+login_gate/i);
    // sem RPC de manutenção para as arestas DB / binding DB / login gate
    expect(all).not.toMatch(/function public\.app_maintenance_orchestration_\w*(backup|migrat|login|db_)/i);
  });
});
