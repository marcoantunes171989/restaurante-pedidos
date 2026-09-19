/* global process */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runDbReleaseExecution } from "../../server/db-release-executor.js";
import {
  APPLY_PRIMITIVE,
  LIVE_BLOCKER_CODES,
  PERSISTENCE_GAPS,
  PORT_DISABLED_CODES,
  PROHIBITED_APPLY_FALLBACKS,
  anyPortIsLive,
  createDefaultDisabledPorts,
  evaluateLivePipelineEligibility,
} from "../../server/db-release-pipeline-contract.js";
import {
  buildCurrentCodeCoverageEvidence,
  buildSyntheticCompleteCoverageEvidence,
} from "../../server/db-release-write-fence-coverage.js";
import {
  SERVER_INJECTABLE_GATES,
  deriveExecutionStageGates,
} from "../../server/db-release-stage-readiness.js";
import { deriveGatesFromEvidence } from "../../server/db-release-readiness.js";
import { createPipelineWorld } from "./helpers/db-release-pipeline-fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(resolve(root, relative), "utf8");
const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);

const NEW_MODULES = [
  "server/db-release-executor.js",
  "server/db-release-pipeline-contract.js",
  "server/db-release-step-store.js",
  "server/db-release-plan-reader.js",
  "server/db-release-write-fence-coverage.js",
];

function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("I2C2 — dependências explícitas (sem fallback live)", () => {
  it("dependência ausente → falha fechada ANTES de qualquer efeito", async () => {
    const world = await createPipelineWorld();
    const good = world.depsFor();
    const cases = {
      planStore: { ...good, planStore: undefined },
      "planStore sem transição": { ...good, planStore: { getPlanRow: good.planStore.getPlanRow, listPlanMigrationRows: good.planStore.listPlanMigrationRows } },
      stepStore: { ...good, stepStore: undefined },
      executionStore: { ...good, executionStore: undefined },
      collectEvidence: { ...good, collectEvidence: undefined },
      clock: { ...good, clock: undefined },
      worker: { ...good, worker: { id: "" } },
      ports: { ...good, ports: undefined },
      "ports.migration": { ...good, ports: { ...good.ports, migration: undefined } },
      "ports.backup incompleto": { ...good, ports: { ...good.ports, backup: { enabled: true, transport: "SYNTHETIC" } } },
      "transport inválido": { ...good, ports: { ...good.ports, smoke: { ...good.ports.smoke, transport: "MAYBE" } } },
      tudo: undefined,
    };
    for (const [label, deps] of Object.entries(cases)) {
      const result = await runDbReleaseExecution(world.request(), deps);
      expect(result, label).toMatchObject({ ok: false, outcome: "DEPENDENCY_MISSING" });
    }
    expect(world.planTransitions).toHaveLength(0);
    expect(world.log).toHaveLength(0);
    expect(world.stepStore.snapshot()).toHaveLength(0);
  });

  it("portas DESABILITADAS por padrão: nada é tocado", async () => {
    const ports = createDefaultDisabledPorts();
    for (const [name, port] of Object.entries(ports)) {
      expect(port.enabled, name).toBe(false);
      expect(port.transport, name).toBe("DISABLED");
      expect(port.disabledCode, name).toBe(PORT_DISABLED_CODES[name]);
    }
    expect(ports.migration.disabledCode).toBe("MIGRATION_EXECUTOR_NOT_ENABLED");
    expect(await ports.migration.applyOneMigration()).toEqual({ ok: false, code: "MIGRATION_EXECUTOR_NOT_ENABLED", disabled: true });
    expect(anyPortIsLive(ports)).toBe(false);

    const world = await createPipelineWorld();
    const result = await runDbReleaseExecution(world.request(), world.depsFor("worker-a", { ports }));
    expect(result).toMatchObject({ ok: false, outcome: "PORT_DISABLED", port: "maintenance" });
    expect(world.planTransitions).toHaveLength(0);
    expect(world.stepStore.snapshot()).toHaveLength(0);
    expect(world.execRecord().status).toBe("REQUESTED");
    expect(world.locks()).toHaveLength(1); // nada foi cancelado nem mutado
  });

  it("basta UMA porta desabilitada (ex.: migration) para bloquear tudo, com o código canônico", async () => {
    const world = await createPipelineWorld();
    const ports = { ...world.ports, migration: createDefaultDisabledPorts().migration };
    const result = await runDbReleaseExecution(world.request(), world.depsFor("worker-a", { ports }));
    expect(result).toMatchObject({ ok: false, outcome: "PORT_DISABLED", code: "MIGRATION_EXECUTOR_NOT_ENABLED", port: "migration" });
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.migration.calls.apply).toBe(0);
    for (const name of ["backup", "smoke", "verifier", "probes", "maintenance"]) {
      const single = { ...world.ports, [name]: createDefaultDisabledPorts()[name] };
      const blocked = await runDbReleaseExecution(world.request(), world.depsFor("worker-a", { ports: single }));
      expect(blocked, name).toMatchObject({ outcome: "PORT_DISABLED", code: PORT_DISABLED_CODES[name] });
    }
  });

  it("política de apply: primitivo dedicado; execute_sql e afins PROIBIDOS (sem fallback)", () => {
    expect(APPLY_PRIMITIVE).toBe("APPLY_MIGRATION_ADAPTER");
    expect(PROHIBITED_APPLY_FALLBACKS).toEqual(["execute_sql", "postgrest_sql", "raw_sql"]);
    expect(createDefaultDisabledPorts().migration.applyPrimitive).toBe(APPLY_PRIMITIVE);
    const ports = createDefaultDisabledPorts();
    expect(Object.keys(ports.migration).filter((name) => /execute|sql|fallback/i.test(name))).toEqual([]);
  });
});

describe("I2C2 — o repositório NÃO consegue executar release DB real", () => {
  it("composição padrão: LIVE_PIPELINE_ELIGIBLE = false, com TODOS os bloqueios", () => {
    const eligibility = evaluateLivePipelineEligibility({
      ports: createDefaultDisabledPorts(),
      coverageEvidence: buildCurrentCodeCoverageEvidence({ nowMs: NOW }),
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.sort()).toEqual([...LIVE_BLOCKER_CODES].sort());
    expect(eligibility.blockers).toEqual(expect.arrayContaining([
      "REAL_MAINTENANCE_TRANSPORT_MISSING", "REAL_BACKUP_TRANSPORT_MISSING", "REAL_APPLY_TRANSPORT_MISSING",
      "REAL_SMOKE_TRANSPORT_MISSING", "WRITE_FENCE_COVERAGE_INCOMPLETE",
      "HML_VALIDATED_DERIVER_MISSING", "PROD_BASELINE_DERIVER_MISSING", "PERSISTENCE_GAPS_OPEN",
    ]));
  });

  it("lacunas de persistência continuam abertas (I2D): lease, unicidade, audit, RPCs de manutenção DB", () => {
    expect(Object.values(PERSISTENCE_GAPS).every(Boolean)).toBe(true);
    expect(Object.keys(PERSISTENCE_GAPS)).toEqual(expect.arrayContaining([
      "LEASE_GENERATION_NOT_PERSISTED",
      "ACTIVE_EXECUTION_UNIQUENESS_NOT_ENFORCED",
      "PLAN_CORRELATION_UNIQUENESS_NOT_ENFORCED",
      "AUDIT_TAXONOMY_INCOMPLETE",
      "MAINTENANCE_DB_EDGE_RPCS_MISSING",
      "LOGIN_GATE_WRITER_MISSING",
    ]));
  });

  it("mesmo com todos os transportes 'LIVE', cobertura sintética + sem derivadores + lacunas abertas → inelegível", () => {
    const live = Object.fromEntries(Object.keys(createDefaultDisabledPorts()).map((name) => [name, { enabled: true, transport: "LIVE" }]));
    expect(anyPortIsLive(live)).toBe(true);
    const almost = evaluateLivePipelineEligibility({
      ports: live,
      coverageEvidence: buildSyntheticCompleteCoverageEvidence({ nowMs: NOW }),
      trustedDerivers: { HML_VALIDATED: true, PROD_BASELINE_VERIFIED: true },
    });
    expect(almost.eligible).toBe(false);
    expect(almost.blockers).toEqual(["WRITE_FENCE_COVERAGE_INCOMPLETE", "PERSISTENCE_GAPS_OPEN"]);
    // a lógica de elegibilidade só fecha com TUDO real (prova de que não é sempre-false por bug)
    const everything = evaluateLivePipelineEligibility({
      ports: live,
      coverageEvidence: { ...buildSyntheticCompleteCoverageEvidence({ nowMs: NOW }), source: "CATALOG_PROBE" },
      trustedDerivers: { HML_VALIDATED: true, PROD_BASELINE_VERIFIED: true },
      persistenceGaps: {},
    });
    expect(everything).toEqual({ eligible: true, blockers: [] });
  });

  it("pipeline RECUSA rodar com porta LIVE enquanto inelegível (defesa em profundidade)", async () => {
    const world = await createPipelineWorld();
    world.maintenance.transport = "LIVE";
    const result = await runDbReleaseExecution(world.request(), world.depsFor());
    expect(result).toMatchObject({ ok: false, outcome: "LIVE_PIPELINE_NOT_ELIGIBLE" });
    expect(result.blockers).toEqual(expect.arrayContaining([
      "REAL_BACKUP_TRANSPORT_MISSING", "HML_VALIDATED_DERIVER_MISSING", "PERSISTENCE_GAPS_OPEN",
    ]));
    expect(world.planTransitions).toHaveLength(0);
    expect(world.maintenance.calls).toHaveLength(0);
    expect(world.execRecord().status).toBe("REQUESTED");
  });

  it("HML_VALIDATED / PROD_BASELINE_VERIFIED: sem derivador real, só evidência SERVIDOR injetada; nunca do request", () => {
    expect(SERVER_INJECTABLE_GATES).toEqual(["HML_VALIDATED", "PROD_BASELINE_VERIFIED"]);
    const bare = deriveGatesFromEvidence({}, { nowMs: NOW });
    expect(bare.find((gate) => gate.key === "HML_VALIDATED")).toMatchObject({ status: "UNKNOWN", reasonCode: "HML_VALIDATION_UNIMPLEMENTED" });
    expect(bare.find((gate) => gate.key === "PROD_BASELINE_VERIFIED")).toMatchObject({ status: "UNKNOWN", reasonCode: "PROD_BASELINE_UNIMPLEMENTED" });
    // overrides fora da lista injetável são IGNORADOS (não dá para forjar fence/backup por override)
    const forged = ["WRITE_FENCE_ACTIVE", "BACKUP_VERIFIED", "LOGIN_GATE_CLOSED", "LOCK_ACQUIRED"].map((key) => ({
      key, status: "VERIFIED", evidenceAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 30_000).toISOString(),
    }));
    const gates = deriveExecutionStageGates({ plan: null, evidence: {}, gateOverrides: forged, nowMs: NOW });
    for (const key of ["WRITE_FENCE_ACTIVE", "BACKUP_VERIFIED", "LOGIN_GATE_CLOSED", "LOCK_ACQUIRED"]) {
      expect(gates.find((gate) => gate.key === key).status, key).not.toBe("VERIFIED");
    }
  });

  it("um fixture sintético executa a máquina de estados, mas TODAS as portas são SYNTHETIC (nenhuma LIVE)", async () => {
    const world = await createPipelineWorld();
    expect(Object.values(world.ports).every((port) => port.transport === "SYNTHETIC")).toBe(true);
    expect(anyPortIsLive(world.ports)).toBe(false);
    expect((await runDbReleaseExecution(world.request(), world.depsFor())).outcome).toBe("SUCCEEDED");
  });
});

describe("I2C2 — sem efeitos colaterais nos módulos novos", () => {
  it.each(NEW_MODULES)("%s: sem rede, processo, ambiente, timers, provider, DB ou segredo", (file) => {
    // O step-store ESPELHA a lista de chaves proibidas do CHECK da migration 160 (são
    // nomes de chaves a rejeitar, não credenciais): é removida antes da varredura de segredos.
    const source = code(read(file)).replace(/FORBIDDEN_EVIDENCE_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/, "");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/child_process|spawn\s*\(|execFile|execSync|\bexec\s*\(/);
    expect(source).not.toMatch(/\bprocess\b/);
    expect(source).not.toMatch(/setInterval|setTimeout|setImmediate|cron|schedule\(/i);
    expect(source).not.toMatch(/node:(http|https|net|dns|tls|dgram|worker_threads|fs)\b/);
    expect(source).not.toMatch(/@supabase|createClient|supabase\.co|api\.supabase|rest\/v1|XMLHttpRequest|WebSocket/i);
    expect(source).not.toMatch(/\beval\s*\(|new Function/);
    expect(source).not.toMatch(/service_role_key|SUPABASE_SERVICE|GITHUB_.*TOKEN|Bearer\s|sbp_[A-Za-z0-9]|postgres(ql)?:\/\/|eyJ[A-Za-z0-9_-]{10,}/i);
    expect(source).not.toMatch(/pg_dump|supabase\s+(db|link|login)|apply_migration(?!_adapter)|applyMigrationRpc/i);
    expect(source).not.toMatch(/\bpsql\b/);
  });

  it("executor: nenhum caminho de execute_sql/apply_migration/restore/SQL genérico", () => {
    const source = code(read("server/db-release-executor.js"));
    expect(source).not.toMatch(/execute_sql|executeSql|postgrest_sql|raw_sql/i);
    expect(source).not.toMatch(/\brestore\w*\s*\(/i);
    expect(source).not.toMatch(/db-backup-provider|RESTORE_PROVIDER|RESTORE_ENABLED/);
    expect(source).not.toMatch(/retryCount|maxRetries|attempts\s*<|while\s*\(\s*true/);
    // exatamente UM ponto de apply, dentro de try/catch dedicado
    expect(source.match(/\.applyOneMigration\(/g) ?? []).toHaveLength(1);
    expect(source.match(/\.createBackup\(/g) ?? []).toHaveLength(1);
    expect(source.match(/ports\.smoke\.run\(/g) ?? []).toHaveLength(1);
  });

  it("os únicos literais de execute_sql estão na lista PROIBIDA do contrato (nunca como chamada)", () => {
    const source = code(read("server/db-release-pipeline-contract.js"));
    const hits = source.match(/execute_sql/g) ?? [];
    expect(hits).toHaveLength(1);
    expect(source).toMatch(/PROHIBITED_APPLY_FALLBACKS\s*=\s*Object\.freeze\(\[\s*"execute_sql"/);
  });

  it("nada de cancelamento de migration em andamento na superfície pública", () => {
    const exported = [...code(read("server/db-release-executor.js")).matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual([
      "EXECUTOR_PIPELINE_STAGES", "abortDbReleaseExecution", "evaluateDbReleaseExecutionStage",
      "reconcileDbReleaseExecution", "runDbReleaseExecution",
    ]);
    expect(exported.filter((name) => /cancel|kill|terminate/i.test(name))).toEqual([]);
  });
});

/** Fecho transitivo dos imports relativos de um módulo. */
function importClosure(entry) {
  const seen = new Set();
  const builtins = new Set();
  const queue = [resolve(root, entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const target = match[1];
      if (target.startsWith("node:")) builtins.add(target);
      else if (target.startsWith(".")) queue.push(resolve(dirname(file), target));
    }
  }
  return { files: [...seen].map((file) => file.slice(root.length + 1).replaceAll("\\", "/")), builtins: [...builtins] };
}

describe("I2C2 — sem fallback live transitivo (fecho de imports)", () => {
  const FORBIDDEN = [
    /server\/release-store\.js$/,
    /server\/release-core\.js$/,
    /server\/db-release-plan\.js$/,
    /server\/db-release-plan-store\.js$/,
    /server\/db-release-readiness-store\.js$/,
    /server\/maintenance-store\.js$/,
    /server\/db-backup-store\.js$/,
    /server\/db-backup-provider\.js$/,
    /server\/db-migration-safety-store\.js$/,
    /server\/db-release-scheduler\.js$/,
  ];

  it.each(["server/db-release-executor.js", "server/db-release-executor-claim.js"])(
    "%s não carrega, nem transitivamente, nenhum store/transport live",
    (entry) => {
      const closure = importClosure(entry);
      for (const file of closure.files) {
        for (const pattern of FORBIDDEN) expect(file, `${entry} → ${file}`).not.toMatch(pattern);
      }
      expect(closure.builtins.every((name) => name === "node:crypto")).toBe(true);
      // só server/* e as constantes de acesso do frontend (puras)
      for (const file of closure.files) {
        expect(file, file).toMatch(/^(server\/|src\/lib\/accessControl\/)/);
      }
    },
  );

  it("importar o executor não faz fetch, spawn nem lê segredo de ambiente", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("fetch proibido no import"); });
    vi.stubGlobal("fetch", fetchSpy);
    const touched = [];
    const realEnv = process.env;
    process.env = new Proxy(realEnv, {
      get(target, key) {
        if (typeof key === "string" && /SUPABASE|GITHUB|SERVICE|TOKEN|SECRET|PASSWORD|API_KEY|DATABASE/i.test(key)) touched.push(key);
        return target[key];
      },
    });
    try {
      vi.resetModules();
      await import("../../server/db-release-executor.js");
      await import("../../server/db-release-pipeline-contract.js");
      await import("../../server/db-release-step-store.js");
      await import("../../server/db-release-plan-reader.js");
      await import("../../server/db-release-write-fence-coverage.js");
    } finally {
      process.env = realEnv;
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(touched).toEqual([]);
  });

  it("o leitor de plano não tem store default: sem porta → falha fechada", async () => {
    const { readDbReleasePlan } = await import("../../server/db-release-plan-reader.js");
    expect(await readDbReleasePlan("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {})).toMatchObject({ ok: false, error: "PLAN_STORE_REQUIRED" });
    expect(await readDbReleasePlan("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { store: { getPlanRow: () => {} } })).toMatchObject({ ok: false });
  });
});

describe("I2C2 — superfície do repositório inalterada", () => {
  it("nenhum endpoint/função Vercel novo (baseline: 11 funções em api/)", () => {
    const files = readdirSync(resolve(root, "api")).filter((name) => name.endsWith(".js")).sort();
    expect(files).toEqual([
      "access-event.js", "ambientes.js", "auth-health.js", "copiloto-ia.js", "gerenciar-usuario-auth.js",
      "landing-analytics.js", "login-banco.js", "maintenance.js", "releases-executor.js", "releases.js", "session-meta.js",
    ]);
  });

  it("nenhuma API expõe execução/pipeline/scheduler/execute-now", () => {
    for (const file of readdirSync(resolve(root, "api")).filter((name) => name.endsWith(".js"))) {
      const source = read(`api/${file}`);
      expect(source, file).not.toMatch(/db-release-executor|db-release-pipeline|db-release-step-store|db-release-scheduler|db-release-execution-store|db-release-stage-readiness|db-release-write-fence/);
      expect(source, file).not.toMatch(/execute-now|execute_now|db-execute|db-release-run/i);
    }
  });

  it("nenhum cron / workflow agendado / timer daemon do orquestrador", () => {
    if (existsSync(resolve(root, "vercel.json"))) expect(read("vercel.json")).not.toMatch(/"crons"/);
    const workflowDir = resolve(root, ".github/workflows");
    const workflows = existsSync(workflowDir) ? readdirSync(workflowDir) : [];
    for (const file of workflows) {
      const text = read(`.github/workflows/${file}`);
      expect(text, file).not.toMatch(/db-release-(scheduler|executor|pipeline)/);
    }
    for (const file of readdirSync(resolve(root, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${file}`), file).not.toMatch(/cron\.schedule\s*\(.*db_release/i);
    }
  });

  it("existe exatamente uma migration 162 (I2D1) e nenhuma 163; 160/161 seguem com o blob Git canônico", () => {
    const migrations = readdirSync(resolve(root, "supabase/migrations"));
    expect(migrations.filter((name) => /^162_/.test(name))).toEqual(["162_db_release_runtime_hardening.sql"]);
    expect(migrations.filter((name) => /^163_/.test(name))).toEqual([]);
    const listed = execFileSync("git", [
      "ls-files", "-s",
      "supabase/migrations/160_db_release_orchestrator_foundation.sql",
      "supabase/migrations/161_canonical_session_admission.sql",
    ], { cwd: root }).toString("utf8");
    expect(listed).toContain("7f2784b5720aece674d953b32da351db21085421");
    expect(listed).toContain("a83bf385eae5fc088019ad455556fbe4f37e4a9d");
  });

  it("UI de ambientes/manutenção/login não referencia o executor/pipeline", () => {
    for (const file of ["src/components/AmbientesAdmin.jsx", "src/components/MaintenanceAdmin.jsx", "src/components/LoginPage.jsx"]) {
      if (!existsSync(resolve(root, file))) continue;
      expect(read(file), file).not.toMatch(/db-release-(executor|pipeline|scheduler|execution-store|step-store)/);
    }
  });
});
