import { describe, expect, it } from "vitest";
import {
  HML_VALIDATED_DERIVER_STATUS,
  PROD_BASELINE_EVIDENCE_MAX_AGE_MS,
  PROD_BASELINE_EVIDENCE_SOURCE,
  currentProdBaselineGate,
  evaluateProdBaselineEvidence,
} from "../../server/db-release-environment-evidence.js";
import {
  PERSISTENCE_GAP_KEYS,
  createCatalogProbeAdapter,
  derivePersistenceGaps,
} from "../../server/db-release-write-coverage-probe.js";
import {
  PERSISTENCE_GAPS,
  createDefaultDisabledPorts,
  evaluateLivePipelineEligibility,
} from "../../server/db-release-pipeline-contract.js";
import { collectReadinessEvidence } from "../../server/db-release-readiness-store.js";
import {
  deriveInFlightGate,
  deriveMaintenanceGates,
  deriveUnimplementedGates,
} from "../../server/db-release-readiness.js";
import {
  REQUIRED_PATH_IDS,
  WRITE_FENCE_MANIFEST_HASH,
  WRITE_FENCE_MANIFEST_VERSION,
} from "../../server/db-release-write-fence-manifest.js";
import { KNOWN_PROJECT_REFS } from "../../server/db-backup-contract.js";

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
    evaluatedAt: iso(NOW - 500),
    ...overrides,
  };
}
const probeAdapter = (raw) => createCatalogProbeAdapter({ rpc: async () => ({ ok: true, data: raw }), transport: "SYNTHETIC" });
const evidence = (raw) => probeAdapter(raw).readWriteFenceCoverage();

const maintenance = (extra = {}) => ({
  ok: true,
  phase: "MIGRATING",
  version: 9,
  epoch: 3,
  loginGate: "CLOSED",
  fenceEffectiveAt: iso(NOW - 60_000),
  evaluatedAt: iso(NOW),
  ...extra,
});
const fence = (m) => deriveMaintenanceGates(m, { nowMs: NOW }).find((gate) => gate.key === "WRITE_FENCE_ACTIVE");

describe("WRITE_FENCE_ACTIVE consome o CATALOG_PROBE", () => {
  it("probe completo + fence ativo => VERIFIED", async () => {
    expect(fence(maintenance({ writeFenceCoverage: await evidence(rawProbe()) }))).toMatchObject({ status: "VERIFIED", reasonCode: "WRITE_FENCE_ACTIVE" });
  });

  it("probe completo mas fence INATIVO (NORMAL / sem fence_effective_at) => BLOCKED", async () => {
    const coverage = await evidence(rawProbe());
    expect(fence(maintenance({ phase: "NORMAL", writeFenceCoverage: coverage })).status).toBe("BLOCKED");
    expect(fence(maintenance({ fenceEffectiveAt: null, writeFenceCoverage: coverage })).status).toBe("BLOCKED");
  });

  it("probe incompleto => nunca VERIFIED (BLOCKED/UNKNOWN com o motivo do probe)", async () => {
    const cases = [
      [{ unverifiedPaths: ["RPC:app_criar_pedido/9:GUARD_ABSENT"], verifiedPathCount: REQUIRED_PATH_IDS.length - 1 }, "BLOCKED", "WRITE_FENCE_COVERAGE_INCOMPLETE"],
      [{ directWriteBypasses: [{ table: "tab_impressoras", role: "authenticated", mode: "RLS_POLICY_ALLOWS_WRITE" }] }, "BLOCKED", "WRITE_FENCE_DIRECT_WRITE_BYPASS"],
      [{ missingPaths: ["RPC:pub_criar_pedido_v2/12"], verifiedPathCount: REQUIRED_PATH_IDS.length - 1 }, "UNKNOWN", "WRITE_FENCE_COVERAGE_UNKNOWN"],
      [{ inventoryComplete: false }, "UNKNOWN", "WRITE_FENCE_INVENTORY_INCOMPLETE"],
      [{ manifestHash: "c".repeat(64) }, "UNKNOWN", "WRITE_FENCE_COVERAGE_VERSION_MISMATCH"],
      [{ evaluatedAt: iso(NOW - 3_600_000) }, "UNKNOWN", "WRITE_FENCE_COVERAGE_STALE"],
    ];
    for (const [patch, status, reasonCode] of cases) {
      const gate = fence(maintenance({ writeFenceCoverage: await evidence(rawProbe(patch)) }));
      expect(gate, reasonCode).toMatchObject({ status, reasonCode });
      expect(gate.status).not.toBe("VERIFIED");
    }
  });

  it("probe indisponível => UNKNOWN (não VERIFIED)", async () => {
    const failing = createCatalogProbeAdapter({ rpc: async () => { throw new Error("x"); }, transport: "SYNTHETIC" });
    const gate = fence(maintenance({ writeFenceCoverage: await failing.readWriteFenceCoverage() }));
    expect(gate).toMatchObject({ status: "UNKNOWN", reasonCode: "CATALOG_PROBE_UNAVAILABLE" });
  });
});

describe("coletor de readiness com adapter coverageProbe", () => {
  const adapters = (extra = {}) => ({
    git: async () => ({ ok: false, errorCode: "GITHUB_UNAVAILABLE" }),
    maintenance: async () => maintenance(),
    sessionZero: async () => ({ ok: false, unavailable: true }),
    inFlight: async () => ({ ok: true, coverageComplete: false, inFlightCount: 0, evaluatedAt: iso(NOW) }),
    ...extra,
  });

  it("sem adapter: mantém a cobertura estática do repositório (incompleta) e in-flight sem cobertura autoritativa", async () => {
    const collected = await collectReadinessEvidence({ nowMs: NOW, adapters: adapters({ maintenance: async () => maintenance({ writeFenceCoverage: undefined }) }) });
    expect(collected.inFlight.coverageComplete).toBe(false);
    expect(deriveInFlightGate(collected.inFlight, { nowMs: NOW }).status).toBe("UNKNOWN");
  });

  it("probe completo: WRITE_FENCE_ACTIVE VERIFIED e zero in-flight VERIFIED (registry + inventário autoritativos)", async () => {
    const collected = await collectReadinessEvidence({ nowMs: NOW, adapters: adapters({ coverageProbe: () => evidence(rawProbe()) }) });
    expect(fence(collected.maintenance).status).toBe("VERIFIED");
    expect(collected.inFlight.coverageComplete).toBe(true);
    expect(deriveInFlightGate(collected.inFlight, { nowMs: NOW })).toMatchObject({ status: "VERIFIED", reasonCode: "IN_FLIGHT_ZERO_AUTHORITATIVE" });
  });

  it("zero linhas + inventário/registry INCOMPLETO => IN_FLIGHT_OPERATION_COUNT_ZERO NÃO verifica", async () => {
    for (const patch of [
      { inventoryComplete: false },
      { registryCoverage: { required: ["CHECKOUT", "ONBOARDING"], verified: ["CHECKOUT"], complete: false } },
      { unverifiedPaths: ["RPC:app_checkout_commit/2:BODY_DRIFT"], verifiedPathCount: REQUIRED_PATH_IDS.length - 1 },
    ]) {
      const collected = await collectReadinessEvidence({ nowMs: NOW, adapters: adapters({ coverageProbe: () => evidence(rawProbe(patch)) }) });
      expect(collected.inFlight.inFlightCount).toBe(0);
      expect(collected.inFlight.coverageComplete).toBe(false);
      expect(deriveInFlightGate(collected.inFlight, { nowMs: NOW }).status).toBe("UNKNOWN");
    }
  });

  it("contagem > 0 continua BLOCKED mesmo com probe completo", async () => {
    const collected = await collectReadinessEvidence({
      nowMs: NOW,
      adapters: adapters({
        coverageProbe: () => evidence(rawProbe()),
        inFlight: async () => ({ ok: true, coverageComplete: false, inFlightCount: 2, evaluatedAt: iso(NOW) }),
      }),
    });
    expect(deriveInFlightGate(collected.inFlight, { nowMs: NOW }).status).toBe("BLOCKED");
  });

  it("adapter que lança => cobertura incompleta (fail-closed), sem derrubar o coletor", async () => {
    const collected = await collectReadinessEvidence({ nowMs: NOW, adapters: adapters({ coverageProbe: async () => { throw new Error("boom"); } }) });
    expect(fence(collected.maintenance).status).toBe("UNKNOWN");
    expect(collected.inFlight.coverageComplete).toBe(false);
  });
});

describe("HML_VALIDATED e PROD_BASELINE_VERIFIED", () => {
  const prodEvidence = (overrides = {}) => ({
    ok: true,
    source: PROD_BASELINE_EVIDENCE_SOURCE,
    environment: "PROD",
    projectRef: KNOWN_PROJECT_REFS.PROD,
    readOnly: true,
    approvalRef: "AUTH-2026-09-19-0001",
    baseSha: "a".repeat(40),
    schemaFingerprintSha256: "b".repeat(64),
    evaluatedAt: iso(NOW - 1000),
    ...overrides,
  });

  it("HML_VALIDATED: nenhuma fonte autoritativa existe no repositório — deriver real NÃO resolvido; gate segue UNKNOWN", () => {
    expect(HML_VALIDATED_DERIVER_STATUS).toMatchObject({ resolved: false, reasonCode: "NO_AUTHORITATIVE_HML_VALIDATION_SOURCE" });
    const gates = deriveUnimplementedGates();
    expect(gates.find((gate) => gate.key === "HML_VALIDATED")).toMatchObject({ status: "UNKNOWN", reasonCode: "HML_VALIDATION_UNIMPLEMENTED" });
    expect(gates.find((gate) => gate.key === "PROD_BASELINE_VERIFIED")).toMatchObject({ status: "UNKNOWN" });
  });

  it("valor ATUAL da baseline PROD = UNKNOWN (sem evidência autorizada)", () => {
    expect(currentProdBaselineGate()).toMatchObject({ key: "PROD_BASELINE_VERIFIED", status: "UNKNOWN", reasonCode: "PROD_BASELINE_EVIDENCE_ABSENT" });
    expect(evaluateProdBaselineEvidence(undefined, { nowMs: NOW }).status).toBe("UNKNOWN");
    expect(evaluateProdBaselineEvidence({ ok: false, errorCode: "X" }, { nowMs: NOW })).toMatchObject({ status: "UNKNOWN", reasonCode: "X" });
  });

  it("contrato futuro: só evidência READ-ONLY, autorizada, do projeto PROD, fresca e ligada ao base SHA verifica", () => {
    expect(evaluateProdBaselineEvidence(prodEvidence(), { nowMs: NOW, expectedBaseSha: "a".repeat(40) })).toMatchObject({ status: "VERIFIED" });
    const bad = (overrides, code, status = "BLOCKED", options = {}) =>
      expect(evaluateProdBaselineEvidence(prodEvidence(overrides), { nowMs: NOW, ...options })).toMatchObject({ status, reasonCode: code });
    bad({ source: "OUTRA" }, "PROD_BASELINE_SOURCE_INVALID");
    bad({ environment: "HML" }, "PROD_BASELINE_ENVIRONMENT_MISMATCH");
    bad({ projectRef: KNOWN_PROJECT_REFS.HML }, "PROD_BASELINE_ENVIRONMENT_MISMATCH");
    bad({ readOnly: false }, "PROD_BASELINE_NOT_READ_ONLY");
    bad({ approvalRef: "" }, "PROD_BASELINE_AUTHORIZATION_MISSING");
    bad({ token: "x" }, "PROD_BASELINE_SECRET_MATERIAL");
    bad({ baseSha: "z" }, "PROD_BASELINE_IDENTITY_INVALID");
    bad({}, "PROD_BASELINE_BASE_SHA_MISMATCH", "BLOCKED", { expectedBaseSha: "c".repeat(40) });
    bad({ evaluatedAt: iso(NOW - PROD_BASELINE_EVIDENCE_MAX_AGE_MS - 1) }, "PROD_BASELINE_EVIDENCE_STALE", "STALE");
  });
});

describe("LIVE_PIPELINE_ELIGIBLE permanece FALSO após o I2D1", () => {
  it("estado do repositório (portas DISABLED, sem derivers, lacunas abertas) => inelegível com todos os bloqueios", () => {
    const eligibility = evaluateLivePipelineEligibility({ ports: createDefaultDisabledPorts(), coverageEvidence: null, trustedDerivers: {}, nowMs: NOW });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers).toEqual(expect.arrayContaining([
      "REAL_MAINTENANCE_TRANSPORT_MISSING",
      "REAL_BACKUP_TRANSPORT_MISSING",
      "REAL_APPLY_TRANSPORT_MISSING",
      "WRITE_FENCE_COVERAGE_INCOMPLETE",
      "HML_VALIDATED_DERIVER_MISSING",
      "PROD_BASELINE_DERIVER_MISSING",
      "PERSISTENCE_GAPS_OPEN",
    ]));
    expect(Object.values(PERSISTENCE_GAPS).every(Boolean)).toBe(true);
  });

  it("mesmo com probe completo E lacunas derivadas do banco fechadas, faltam transportes LIVE, HML e baseline PROD", async () => {
    const coverageEvidence = await evidence(rawProbe());
    const persistenceGaps = derivePersistenceGaps(coverageEvidence, { nowMs: NOW });
    expect(Object.values(persistenceGaps).some(Boolean)).toBe(false);
    const eligibility = evaluateLivePipelineEligibility({ ports: createDefaultDisabledPorts(), coverageEvidence, persistenceGaps, trustedDerivers: {}, nowMs: NOW });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers).not.toContain("WRITE_FENCE_COVERAGE_INCOMPLETE");
    expect(eligibility.blockers).not.toContain("PERSISTENCE_GAPS_OPEN");
    expect(eligibility.blockers).toEqual(expect.arrayContaining(["REAL_APPLY_TRANSPORT_MISSING", "HML_VALIDATED_DERIVER_MISSING", "PROD_BASELINE_DERIVER_MISSING"]));
  });

  it("baseline PROD ausente => readiness geral segue falsa; evidência v2 sem relógio nunca é autoritativa", async () => {
    const coverageEvidence = await evidence(rawProbe());
    const withoutClock = evaluateLivePipelineEligibility({ ports: {}, coverageEvidence, trustedDerivers: { HML_VALIDATED: true, PROD_BASELINE_VERIFIED: false } });
    expect(withoutClock.blockers).toContain("WRITE_FENCE_COVERAGE_INCOMPLETE");
    expect(withoutClock.blockers).toContain("PROD_BASELINE_DERIVER_MISSING");
    expect(withoutClock.eligible).toBe(false);
  });
});
