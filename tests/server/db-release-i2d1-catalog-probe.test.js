import { describe, expect, it } from "vitest";
import {
  COVERAGE_EVIDENCE_MAX_AGE_MS,
  COVERAGE_PROBE_RPC_NAME,
  PERSISTENCE_GAP_KEYS,
  allPersistenceGapsOpen,
  createCatalogProbeAdapter,
  createDisabledCatalogProbe,
  derivePersistenceGaps,
  evaluateCatalogCoverage,
  parseCatalogProbeResult,
} from "../../server/db-release-write-coverage-probe.js";
import {
  evaluateWriteFenceCoverage,
  isLiveAuthoritativeCoverage,
} from "../../server/db-release-write-fence-coverage.js";
import { PERSISTENCE_GAPS } from "../../server/db-release-pipeline-contract.js";
import {
  REQUIRED_PATH_IDS,
  WRITE_FENCE_MANIFEST_HASH,
  WRITE_FENCE_MANIFEST_VERSION,
} from "../../server/db-release-write-fence-manifest.js";
import { RUNTIME_MIGRATION, functionBodyIn, readMigration, stripComments } from "./helpers/migration-sql.js";

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

function rawProbe(overrides = {}) {
  return {
    manifestVersion: WRITE_FENCE_MANIFEST_VERSION,
    manifestHash: WRITE_FENCE_MANIFEST_HASH,
    inventoryComplete: true,
    requiredPathCount: REQUIRED_PATH_IDS.length,
    verifiedPathCount: REQUIRED_PATH_IDS.length,
    missingPaths: [],
    unverifiedPaths: [],
    directWriteBypasses: [],
    registryCoverage: { required: ["CHECKOUT", "ONBOARDING"], verified: ["CHECKOUT", "ONBOARDING"], complete: true },
    persistence: Object.fromEntries(PERSISTENCE_GAP_KEYS.map((key) => [key, false])),
    evaluatedAt: iso(NOW - 1000),
    ...overrides,
  };
}

async function evidenceOf(raw) {
  const adapter = createCatalogProbeAdapter({ rpc: async () => ({ ok: true, data: raw }), transport: "SYNTHETIC" });
  return adapter.readWriteFenceCoverage();
}

async function evaluate(overrides = {}, options = { nowMs: NOW }) {
  return evaluateWriteFenceCoverage(await evidenceOf(rawProbe(overrides)), options);
}

describe("evidência do catálogo — cobertura COMPLETA só com tudo verificado", () => {
  it("todos os caminhos presentes, sem bypass, inventário e registry completos => completa", async () => {
    const result = await evaluate();
    expect(result).toMatchObject({
      complete: true,
      registryComplete: true,
      source: "CATALOG_PROBE",
      required: REQUIRED_PATH_IDS.length,
      covered: REQUIRED_PATH_IDS.length,
      reasonCode: "WRITE_FENCE_COVERAGE_COMPLETE",
      manifestHash: WRITE_FENCE_MANIFEST_HASH,
    });
    expect(result.uncovered).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(isLiveAuthoritativeCoverage(await evidenceOf(rawProbe()), { nowMs: NOW })).toBe(true);
  });

  it("uma função ausente => incompleta", async () => {
    const result = await evaluate({ verifiedPathCount: REQUIRED_PATH_IDS.length - 1, missingPaths: ["RPC:pub_criar_pedido_v2/12"] });
    expect(result.complete).toBe(false);
    expect(result.registryComplete).toBe(false);
    expect(result.missing).toEqual(["RPC:pub_criar_pedido_v2/12"]);
    expect(result.reasonCode).toBe("WRITE_FENCE_COVERAGE_UNKNOWN");
  });

  it("guard ausente / guard depois da mutação / corpo divergente => incompleta (BLOCKED)", async () => {
    for (const reason of ["GUARD_ABSENT", "GUARD_AFTER_MUTATION", "BODY_DRIFT", "NOT_SECURITY_DEFINER", "OWNER_DRIFT", "SEARCH_PATH_MISSING"]) {
      const result = await evaluate({
        verifiedPathCount: REQUIRED_PATH_IDS.length - 1,
        unverifiedPaths: [`RPC:app_criar_pedido/9:${reason}`],
      });
      expect(result.complete, reason).toBe(false);
      expect(result.reasonCode, reason).toBe("WRITE_FENCE_COVERAGE_INCOMPLETE");
      expect(result.uncovered, reason).toEqual([`RPC:app_criar_pedido/9:${reason}`]);
    }
  });

  it("drift de assinatura (sobrecarga extra ou função com outra assinatura) => incompleta", async () => {
    const overload = await evaluate({ verifiedPathCount: REQUIRED_PATH_IDS.length - 1, unverifiedPaths: ["RPC:cupom_consumir/8:OVERLOAD_DRIFT"] });
    expect(overload.complete).toBe(false);
    const missing = await evaluate({ verifiedPathCount: REQUIRED_PATH_IDS.length - 1, missingPaths: ["RPC:app_criar_pedido/9"] });
    expect(missing.complete).toBe(false);
  });

  it("escrita DIRETA de anon/authenticated fora do fence => incompleta, mesmo com todos os caminhos verificados", async () => {
    const result = await evaluate({ directWriteBypasses: [{ table: "loja_fiscal_regra", role: "authenticated", mode: "RLS_POLICY_ALLOWS_WRITE" }] });
    expect(result.complete).toBe(false);
    expect(result.reasonCode).toBe("WRITE_FENCE_DIRECT_WRITE_BYPASS");
    expect(result.uncovered).toEqual(["DIRECT_WRITE:loja_fiscal_regra:authenticated:RLS_POLICY_ALLOWS_WRITE"]);
    expect(result.directWriteBypasses).toHaveLength(1);
    const truncate = await evaluate({ directWriteBypasses: [{ table: "tab_pedidos", role: "anon", mode: "TRUNCATE_PRIVILEGE" }] });
    expect(truncate.complete).toBe(false);
  });

  it("caminho exigido pelo registry sem cobertura de registry => incompleta e registry não autoritativo", async () => {
    const result = await evaluate({ registryCoverage: { required: ["CHECKOUT", "ONBOARDING"], verified: ["CHECKOUT"], complete: false } });
    expect(result.complete).toBe(false);
    expect(result.registryComplete).toBe(false);
    expect(result.reasonCode).toBe("WRITE_FENCE_REGISTRY_INCOMPLETE");
    const wrongTypes = await evaluate({ registryCoverage: { required: ["CHECKOUT"], verified: ["CHECKOUT"], complete: true } });
    expect(wrongTypes.complete).toBe(false);
  });

  it("inventário derivado do catálogo INCOMPLETO (escritor não classificado) => incompleta e registry não autoritativo", async () => {
    const result = await evaluate({
      inventoryComplete: false,
      unverifiedPaths: [],
    });
    expect(result.complete).toBe(false);
    expect(result.registryComplete).toBe(false);
    expect(result.reasonCode).toBe("WRITE_FENCE_INVENTORY_INCOMPLETE");
    const writer = await evaluate({ inventoryComplete: false, unverifiedPaths: ["UNCLASSIFIED_WRITER:app_nova_rpc(p_x bigint)"] });
    expect(writer.complete).toBe(false);
    expect(writer.uncovered).toEqual(["UNCLASSIFIED_WRITER:app_nova_rpc(p_x bigint)"]);
  });

  it("manifesto divergente (versão ou hash) => STALE/incompleta; nunca fica verde para sempre", async () => {
    for (const patch of [
      { manifestVersion: "WFC-1" },
      { manifestVersion: "WFC-3" },
      { manifestHash: "a".repeat(64) },
      { requiredPathCount: REQUIRED_PATH_IDS.length + 1, verifiedPathCount: REQUIRED_PATH_IDS.length + 1 },
    ]) {
      const result = await evaluate(patch);
      expect(result.complete).toBe(false);
      expect(result.reasonCode).toBe("WRITE_FENCE_COVERAGE_VERSION_MISMATCH");
    }
  });

  it("frescor: evidência velha, no futuro ou sem relógio => incompleta", async () => {
    expect((await evaluate({ evaluatedAt: iso(NOW - COVERAGE_EVIDENCE_MAX_AGE_MS - 1) })).reasonCode).toBe("WRITE_FENCE_COVERAGE_STALE");
    expect((await evaluate({ evaluatedAt: iso(NOW + 60_000) })).reasonCode).toBe("WRITE_FENCE_COVERAGE_STALE");
    expect((await evaluate({}, {})).reasonCode).toBe("WRITE_FENCE_COVERAGE_CLOCK_MISSING");
    expect((await evaluate({ evaluatedAt: iso(NOW - COVERAGE_EVIDENCE_MAX_AGE_MS + 1000) })).complete).toBe(true);
  });

  it("evidência malformada, com segredo ou de outra fonte é rejeitada (fail-closed)", async () => {
    expect(await evidenceOf({ ...rawProbe(), inventoryComplete: "true" })).toMatchObject({ ok: false, errorCode: "CATALOG_PROBE_RESULT_INVALID" });
    expect(await evidenceOf(null)).toMatchObject({ ok: false });
    expect(await evidenceOf({ ...rawProbe(), persistence: { LEASE_GENERATION_NOT_PERSISTED: false } })).toMatchObject({ ok: false });
    // chave com nome de segredo no resultado => rejeitado (não é ignorado)
    expect(await evidenceOf({ ...rawProbe(), service_role_key: "x" })).toMatchObject({ ok: false, errorCode: "CATALOG_PROBE_RESULT_SECRET_MATERIAL" });
    // chave extra inofensiva não passa para a evidência
    const extra = await evidenceOf({ ...rawProbe(), debug: "x" });
    expect(extra.ok).toBe(true);
    expect(Object.keys(extra)).not.toContain("debug");
    const leaked = await evidenceOf({ ...rawProbe(), unverifiedPaths: ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"] });
    expect(leaked).toMatchObject({ ok: false, errorCode: "CATALOG_PROBE_RESULT_SECRET_MATERIAL" });
    const good = await evidenceOf(rawProbe());
    expect(evaluateCatalogCoverage({ ...good, source: "STATIC_REPO_AUDIT" }, { nowMs: NOW }).reasonCode).toBe("WRITE_FENCE_COVERAGE_SOURCE_UNKNOWN");
    expect(evaluateCatalogCoverage({ ok: false, errorCode: "CATALOG_PROBE_UNAVAILABLE" }, { nowMs: NOW }).reasonCode).toBe("CATALOG_PROBE_UNAVAILABLE");
    expect(parseCatalogProbeResult(rawProbe()).ok).toBe(true);
  });

  it("formato v1 (I2C2, manifestVersion numérico) segue no caminho antigo, inalterado", () => {
    const v1 = { ok: true, manifestVersion: 1, source: "SYNTHETIC_TEST", inventoryComplete: true, paths: [] };
    expect(evaluateWriteFenceCoverage(v1).complete).toBe(false);
    expect(evaluateWriteFenceCoverage(v1).reasonCode).toBe("WRITE_FENCE_COVERAGE_UNKNOWN");
  });
});

describe("lacunas de persistência derivadas do CATÁLOGO real (não do repositório)", () => {
  it("chaves == PERSISTENCE_GAPS do pipeline I2C2 (8)", () => {
    expect([...PERSISTENCE_GAP_KEYS].sort()).toEqual(Object.keys(PERSISTENCE_GAPS).sort());
    expect(PERSISTENCE_GAP_KEYS).toHaveLength(8);
  });

  it("probe válido e fresco => lacunas conforme o banco; ausente/inválido/velho/manifesto errado => todas abertas", async () => {
    const closed = await evidenceOf(rawProbe());
    expect(Object.values(derivePersistenceGaps(closed, { nowMs: NOW })).some(Boolean)).toBe(false);
    const partial = await evidenceOf(rawProbe({ persistence: { ...rawProbe().persistence, LOGIN_GATE_WRITER_MISSING: true } }));
    expect(derivePersistenceGaps(partial, { nowMs: NOW }).LOGIN_GATE_WRITER_MISSING).toBe(true);
    expect(derivePersistenceGaps(null, { nowMs: NOW })).toEqual(allPersistenceGapsOpen());
    expect(derivePersistenceGaps({ ok: false }, { nowMs: NOW })).toEqual(allPersistenceGapsOpen());
    expect(derivePersistenceGaps(closed, {})).toEqual(allPersistenceGapsOpen());
    expect(derivePersistenceGaps(await evidenceOf(rawProbe({ evaluatedAt: iso(NOW - 3_600_000) })), { nowMs: NOW })).toEqual(allPersistenceGapsOpen());
    expect(derivePersistenceGaps(await evidenceOf(rawProbe({ manifestHash: "b".repeat(64) })), { nowMs: NOW })).toEqual(allPersistenceGapsOpen());
  });
});

describe("adapter do probe — sem efeito no import, desabilitado por padrão, sem fallback live", () => {
  it("padrão DISABLED: nada é alcançável", async () => {
    const disabled = createDisabledCatalogProbe();
    expect(disabled).toMatchObject({ enabled: false, transport: "DISABLED" });
    expect(await disabled.readWriteFenceCoverage()).toEqual({ ok: false, errorCode: "CATALOG_PROBE_NOT_ENABLED" });
  });

  it("exige rpc injetado e transport explícito (SYNTHETIC|LIVE); chama SOMENTE a RPC do probe com args vazios", async () => {
    expect(() => createCatalogProbeAdapter({})).toThrow(TypeError);
    expect(() => createCatalogProbeAdapter({ rpc: async () => ({}) })).toThrow(/transport/);
    expect(() => createCatalogProbeAdapter({ rpc: async () => ({}), transport: "DISABLED" })).toThrow(TypeError);
    const calls = [];
    const adapter = createCatalogProbeAdapter({
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { ok: true, data: rawProbe() };
      },
      transport: "SYNTHETIC",
    });
    await adapter.readWriteFenceCoverage();
    expect(calls).toEqual([[COVERAGE_PROBE_RPC_NAME, {}]]);
  });

  it("falha do transporte => indisponível (nunca completa)", async () => {
    const boom = createCatalogProbeAdapter({ rpc: async () => { throw new Error("rede"); }, transport: "SYNTHETIC" });
    expect(await boom.readWriteFenceCoverage()).toEqual({ ok: false, errorCode: "CATALOG_PROBE_UNAVAILABLE" });
    const notOk = createCatalogProbeAdapter({ rpc: async () => ({ ok: false }), transport: "SYNTHETIC" });
    expect(await notOk.readWriteFenceCoverage()).toEqual({ ok: false, errorCode: "CATALOG_PROBE_UNAVAILABLE" });
    expect(evaluateWriteFenceCoverage(await boom.readWriteFenceCoverage(), { nowMs: NOW }).complete).toBe(false);
  });
});

describe("probe SQL (migration 162) — read-only, catálogo, sem string-substring como única autoridade", () => {
  const sql = readMigration(RUNTIME_MIGRATION);
  const body = stripComments(functionBodyIn(sql, "app_db_release_write_coverage_probe"));
  const header = sql.slice(sql.indexOf("create function public.app_db_release_write_coverage_probe()"), sql.indexOf("create function public.app_db_release_write_coverage_probe()") + 260);

  it("é STABLE SECURITY DEFINER (o Postgres proíbe DML em função não-volátil) e sem DML/DDL/SQL dinâmico no corpo", () => {
    expect(header).toMatch(/\bstable\b/i);
    expect(header).toMatch(/security definer/i);
    expect(header).toMatch(/set search_path = public/i);
    const withoutManifest = body.replace(/\$manifest\$[\s\S]*?\$manifest\$/g, "");
    // nenhum comando de escrita/DDL no INÍCIO de statement (literais como 'TRUNCATE' em has_table_privilege não contam)
    expect(withoutManifest).not.toMatch(/(^|;)\s*(insert\s+into|update\s+\S+\s+set|delete\s+from|truncate\b|create\b|alter\b|drop\b|grant\b|revoke\b|copy\b|do\b)/im);
    expect(withoutManifest).not.toMatch(/\bexecute\s+(format|'|\$)/i);
    expect(withoutManifest).not.toMatch(/set_config|pg_advisory|nextval|pg_sleep/i);
  });

  it("deriva a evidência do catálogo: pg_proc, pg_trigger, pg_class, pg_policy, privilégios, aclexplode não é necessário", () => {
    for (const source of ["from pg_proc", "from pg_trigger", "from pg_class", "from pg_policy", "has_table_privilege", "has_any_column_privilege", "has_function_privilege", "pg_get_function_identity_arguments", "to_regprocedure", "pg_get_constraintdef", "pg_roles"]) {
      expect(body, source).toContain(source);
    }
  });

  it("verifica identidade de função, guard, registry, privilégio direto e drift do manifesto", () => {
    for (const reason of ["NOT_SECURITY_DEFINER", "OWNER_DRIFT", "SEARCH_PATH_MISSING", "OVERLOAD_DRIFT", "BODY_DRIFT", "GUARD_ABSENT", "GUARD_AFTER_MUTATION", "TRIGGER_ABSENT", "TRIGGER_FUNCTION_DRIFT", "TRIGGER_NOT_BEFORE_STATEMENT_IUD", "UNCLASSIFIED_WRITER", "TRUNCATE_PRIVILEGE", "RLS_POLICY_ALLOWS_WRITE", "NO_RLS"]) {
      expect(body, reason).toContain(reason);
    }
    // fingerprint md5 (não só substring) + posição do guard antes da primeira mutação
    expect(body).toMatch(/md5\(replace\(v_src, E'\\r', ''\)\) is distinct from \(v_entry ->> 'md5'\)/);
    expect(body).toMatch(/v_prefix := split_part\(v_norm, v_guard_stmt, 1\)/);
    expect(body).toMatch(/v_prefix ~ v_dml_first_re/);
  });

  it("resultado: campos do contrato (manifestVersion, inventoryComplete, requiredPathCount, verifiedPathCount, missingPaths, unverifiedPaths, directWriteBypasses, registryCoverage, evaluatedAt) + hash + persistência", () => {
    const result = body.slice(body.lastIndexOf("return jsonb_build_object"));
    for (const key of ["manifestVersion", "manifestHash", "inventoryComplete", "requiredPathCount", "verifiedPathCount", "missingPaths", "unverifiedPaths", "directWriteBypasses", "registryCoverage", "persistence", "evaluatedAt"]) {
      expect(result, key).toContain(`'${key}'`);
    }
    for (const key of PERSISTENCE_GAP_KEYS) expect(body, key).toContain(`'${key}'`);
    // sem segredo no retorno
    expect(result).not.toMatch(/prosrc|proacl|current_setting|jwt|secret|token|password/i);
  });

  it("hash do manifesto no SQL == hash do JS (mesma linha canônica e ordem C)", () => {
    expect(body).toMatch(/concat_ws\(\s*'\|',\s*e ->> 'id',\s*e ->> 'kind',\s*coalesce\(e ->> 'name', e ->> 'table'\),\s*coalesce\(e ->> 'signature', ''\),\s*coalesce\(e ->> 'trigger', ''\),\s*coalesce\(e ->> 'md5', ''\)\s*\)/);
    expect(body).toContain('order by x.id collate "C"');
    expect(body).toMatch(/sha256\(convert_to\(/);
  });

  it("escritor executável por anon/authenticated e não classificado => inventário incompleto; exclusões só as declaradas", () => {
    expect(body).toMatch(/has_function_privilege\('anon', p\.oid, 'EXECUTE'\)\s*or has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\)/i);
    expect(body).toMatch(/v_inventory_complete := false/);
    expect(body).toContain("excludedTables");
    expect(body).toContain("excludedWriters");
  });

  it("acesso: só service_role executa o probe", () => {
    const code = stripComments(sql);
    expect(code).toMatch(/grant execute on function public\.app_db_release_write_coverage_probe\(\) to service_role;/);
    expect(code).toMatch(/revoke all on function public\.app_db_release_write_coverage_probe\(\) from public, anon, authenticated, service_role;/);
  });
});
