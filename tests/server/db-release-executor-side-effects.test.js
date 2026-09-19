import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(resolve(root, relative), "utf8");

const NEW_MODULES = [
  "server/db-release-executor-contract.js",
  "server/db-release-executor-lease.js",
  "server/db-release-execution-store.js",
  "server/db-release-stage-readiness.js",
  "server/db-release-executor-claim.js",
  "server/db-release-scheduler.js",
];

/** Remove comentários para não confundir prosa com código. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("I2C1 — sem efeitos colaterais nos módulos novos", () => {
  it.each(NEW_MODULES)("%s: sem rede, processo, ambiente, timers, provider ou segredo", (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/child_process|spawn\s*\(|execFile|execSync|exec\s*\(/);
    expect(source).not.toMatch(/process\s*\.\s*(env|argv|exit|cwd)/);
    expect(source).not.toMatch(/\bprocess\b/);
    expect(source).not.toMatch(/setInterval|setTimeout|setImmediate|cron|schedule\(/i);
    expect(source).not.toMatch(/node:(http|https|net|dns|tls|dgram|worker_threads|fs)\b/);
    expect(source).not.toMatch(/@supabase|createClient|supabase\.co|api\.supabase|rest\/v1|XMLHttpRequest|WebSocket/i);
    expect(source).not.toMatch(/\beval\s*\(|new Function/);
    expect(source).not.toMatch(/service_role_key|SUPABASE_SERVICE|GITHUB_.*TOKEN|Bearer\s/i);
    expect(source).not.toMatch(/(^|[^.\w])(app_maintenance_|app_login_gate|app_backup_runs)/);
  });

  it("nenhum módulo novo importa store/rede live (release-store, plan-store, readiness-store, backup-provider)", () => {
    for (const file of NEW_MODULES) {
      const imports = [...read(file).matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      for (const target of imports) {
        expect(target).not.toMatch(/release-store|plan-store|readiness-store|maintenance-store|backup-provider|backup-store|backup-logical/);
      }
    }
  });

  it("scheduler é uma única iteração: sem loop infinito, sem timer, sem cron", () => {
    const source = code(read("server/db-release-scheduler.js"));
    expect(source).not.toMatch(/while\s*\(\s*true|for\s*\(\s*;\s*;\s*\)/);
    expect(source).not.toMatch(/setInterval|setTimeout/);
    expect(source.match(/claimDbReleaseExecution\(/g) ?? []).toHaveLength(1);
  });

  it("claim não toca login gate, write fence, manutenção, backup ou migration", () => {
    const source = code(read("server/db-release-executor-claim.js"));
    expect(source).not.toMatch(/loginGate|login_gate|writeFence|write_fence|transitionMaintenance|maintenance-store/);
    // Só o helper puro de identidade de projeto do backup-contract é permitido.
    expect(source).not.toMatch(/(create|trigger|start|run|prepare|request)Backup|BackupProvider|BackupRun|backupTrigger/i);
    expect(source).not.toMatch(/db-backup(?!-contract)/);
    expect(source).not.toMatch(/apply_migration|applyMigration|restore/i);
  });

  it("resultados são sempre sem segredo e sem autorização de migration", () => {
    const source = read("server/db-release-executor-claim.js");
    expect(source).toContain("migrationAuthorized: false");
    expect(source).not.toMatch(/migrationAuthorized:\s*true/);
  });
});

describe("I2C1 — superfície do repositório inalterada", () => {
  it("nenhum endpoint/função Vercel novo (baseline: 11 funções em api/)", () => {
    const files = readdirSync(resolve(root, "api")).filter((name) => name.endsWith(".js")).sort();
    expect(files).toEqual([
      "access-event.js", "ambientes.js", "auth-health.js", "copiloto-ia.js", "gerenciar-usuario-auth.js",
      "landing-analytics.js", "login-banco.js", "maintenance.js", "releases-executor.js", "releases.js", "session-meta.js",
    ]);
  });

  it("nenhuma API expõe execução/claim/scheduler", () => {
    for (const file of readdirSync(resolve(root, "api")).filter((name) => name.endsWith(".js"))) {
      const source = read(`api/${file}`);
      expect(source).not.toMatch(/db-release-executor|db-release-scheduler|db-release-execution-store|db-release-stage-readiness/);
    }
  });

  it("nenhum cron novo: vercel.json sem crons e sem workflow agendado do orquestrador", () => {
    if (existsSync(resolve(root, "vercel.json"))) {
      expect(read("vercel.json")).not.toMatch(/"crons"/);
    }
    const workflows = existsSync(resolve(root, ".github/workflows"))
      ? readdirSync(resolve(root, ".github/workflows"))
      : [];
    for (const file of workflows) {
      expect(read(`.github/workflows/${file}`)).not.toMatch(/db-release-scheduler|db-release-executor/);
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

  it("UI de ambientes/manutenção/login não referencia o executor", () => {
    for (const file of ["src/components/AmbientesAdmin.jsx", "src/components/MaintenanceAdmin.jsx", "src/components/LoginPage.jsx"]) {
      if (!existsSync(resolve(root, file))) continue;
      expect(read(file)).not.toMatch(/db-release-executor|db-release-scheduler|db-release-execution-store/);
    }
  });
});
