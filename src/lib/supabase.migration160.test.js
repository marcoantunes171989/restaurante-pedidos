import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BACKUP_STATUSES,
  CONTROL_PLANE_TABLES,
  DB_ENVIRONMENTS,
  DB_MAINTENANCE_EVENT_TYPES,
  DB_PLAN_STATUSES,
  EXECUTION_STATUSES,
  EXECUTION_STEP_STATUSES,
  EXECUTION_STEP_TYPES,
  LEGACY_MAINTENANCE_EVENT_TYPES,
  LEGACY_MAINTENANCE_PHASES,
  LOGIN_GATE_STATES,
  MAINTENANCE_EVENT_TYPES,
  MAINTENANCE_PHASES,
  PLAN_KINDS,
  REQUIRED_READINESS_GATES,
  SCHEMA_CLASSIFICATIONS,
  SCHEMA_VALIDATION_RESULTS,
} from "../../server/db-release-contract.js";

const sqlPath = "supabase/migrations/160_db_release_orchestrator_foundation.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration153 = readFileSync(
  "supabase/migrations/153_maintenance_release_orchestration_core.sql",
  "utf8",
);
const migration159 = readFileSync(
  "supabase/migrations/159_maintenance_abort_reopen_orchestration.sql",
  "utf8",
);

const DML_VERBS = Object.freeze([
  "insert",
  "update",
  "delete",
  "merge",
  "truncate",
  "copy",
]);

function stripDollarQuoted(texto) {
  return texto.replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, "$$ $$");
}

function applyTimeSql(texto) {
  return stripDollarQuoted(texto);
}

function extractInList(texto, constraintName) {
  const re = new RegExp(`${constraintName}[\\s\\S]*?\\bin\\s*\\(([^)]*)\\)`, "i");
  const match = texto.match(re);
  expect(match, `lista IN de ${constraintName} não encontrada`).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function extractCreateTable(texto, tableName) {
  const re = new RegExp(
    `create table public\\.${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `CREATE TABLE ${tableName} não encontrado`).toBeTruthy();
  return match[1];
}

function splitTopLevel(body) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function extractColumnNames(tableBody) {
  return splitTopLevel(tableBody)
    .filter((part) => !/^constraint\b/i.test(part))
    .map((part) => part.split(/\s+/)[0].replace(/"/g, ""));
}

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function nomesCreateFunction(texto) {
  return [...texto.matchAll(/create\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]);
}

function nomesCreateOrReplace(texto) {
  return [...texto.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map(
    (m) => m[1],
  );
}

const applySql = applyTimeSql(sqlSemComentarios);
const corpoGuard = corpoDaFuncao(sqlSemComentarios, "app_maintenance_orchestration_binding_guard");
const corpoAssert = corpoDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed");

describe("migration 160 — existência e transação", () => {
  it("existe exatamente uma migration 160", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^160[_.]/.test(f));
    expect(arquivos).toEqual(["160_db_release_orchestrator_foundation.sql"]);
  });

  it("é transacional (BEGIN/COMMIT), sem ROLLBACK executável", () => {
    expect(sqlSemComentarios).toMatch(/^\s*begin\s*;/im);
    expect(sqlSemComentarios).toMatch(/^\s*commit\s*;/im);
    expect(sqlSemComentarios).not.toMatch(/^\s*rollback\s*;/im);
    const begins = sqlSemComentarios.match(/^\s*begin\s*;/gim) || [];
    const commits = sqlSemComentarios.match(/^\s*commit\s*;/gim) || [];
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });
});

describe("migration 160 — DDL-only / DML proibido", () => {
  it("não contém DML de negócio no SQL de apply", () => {
    expect(applySql).not.toMatch(/\binsert\s+into\b/i);
    expect(applySql).not.toMatch(/\bupdate\s+(?:only\s+)?public\./i);
    expect(applySql).not.toMatch(/\bdelete\s+from\b/i);
    expect(applySql).not.toMatch(/\bmerge\s+into\b/i);
    expect(applySql).not.toMatch(/\btruncate\s+(?:table\b)?/i);
    expect(applySql).not.toMatch(/(?:^|;)\s*copy\s+/im);
    expect(DML_VERBS).toEqual(["insert", "update", "delete", "merge", "truncate", "copy"]);
  });

  it("não contém CTAS, SELECT INTO, COPY nem backfill", () => {
    expect(applySql).not.toMatch(/create\s+table\s+[\s\S]*\bas\s+select\b/i);
    expect(applySql).not.toMatch(/\bselect\s+into\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bcopy\s+/i);
    expect(sql).not.toMatch(/\bbackfill\b/i);
  });

  it("não insere plano, execution, backup nem evento", () => {
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_db_release_/i);
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_backup_runs/i);
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_schema_validation_results/i);
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_maintenance_/i);
    expect(applySql).not.toMatch(/update\s+public\.app_maintenance_state/i);
  });
});

describe("migration 160 — phases BACKING_UP / MIGRATING / RELEASING", () => {
  it("estende phase para 13 valores sem remover as 11 legadas", () => {
    const addIdx = sqlSemComentarios.search(/add constraint app_maintenance_state_phase_check/i);
    expect(addIdx).toBeGreaterThan(-1);
    const addFases = extractInList(
      sqlSemComentarios.slice(addIdx),
      "app_maintenance_state_phase_check",
    );
    expect(addFases).toEqual([...MAINTENANCE_PHASES]);
    for (const phase of LEGACY_MAINTENANCE_PHASES) {
      expect(addFases).toContain(phase);
    }
    expect(addFases).toContain("BACKING_UP");
    expect(addFases).toContain("MIGRATING");
    expect(addFases).toContain("RELEASING");
    expect(addFases).toHaveLength(13);
  });

  it("não reutiliza RELEASING como MIGRATING", () => {
    expect(sql).toMatch(/RELEASING continua significando APP RELEASE/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_maintenance_orchestration_transition_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(/\('QUIESCENT'\s*,\s*'BACKING_UP'\)/);
    expect(sqlSemComentarios).not.toMatch(/\('BACKING_UP'\s*,\s*'MIGRATING'\)/);
    expect(sqlSemComentarios).not.toMatch(/\('MIGRATING'\s*,\s*'SMOKE'\)/);
  });
});

describe("migration 160 — login gate e plan kind", () => {
  it("modela login_gate OPEN/CLOSED com DEFAULT OPEN", () => {
    expect(sqlSemComentarios).toMatch(
      /add column login_gate text not null default 'OPEN'/i,
    );
    const estados = extractInList(sqlSemComentarios, "app_maintenance_state_login_gate_check");
    expect(estados).toEqual([...LOGIN_GATE_STATES]);
  });

  it("modela plan_kind APP_RELEASE/DB_MIGRATION nullable", () => {
    expect(sqlSemComentarios).toMatch(/add column plan_kind text null/i);
    const kinds = extractInList(sqlSemComentarios, "app_maintenance_state_plan_kind_check");
    expect(kinds).toEqual([...PLAN_KINDS]);
  });

  it("adiciona db_plan_id com ON DELETE SET NULL", () => {
    expect(sqlSemComentarios).toMatch(
      /add column db_plan_id uuid null\s+references public\.app_db_release_plans\s*\(\s*id\s*\)\s*on delete set null/i,
    );
  });

  it("preserva unbound legado e impede coexistência APP+DB", () => {
    const binding = sqlSemComentarios.match(
      /app_maintenance_state_binding_kind_check[\s\S]*?check\s*\(([\s\S]*?)\)\s*;/i,
    );
    expect(binding, "binding_kind_check não encontrado").toBeTruthy();
    const def = binding[1];
    expect(def).toMatch(/plan_kind is null/i);
    expect(def).toMatch(/release_id is null/i);
    expect(def).toMatch(/db_plan_id is null/i);
    expect(def).toMatch(/plan_kind = 'APP_RELEASE'/i);
    expect(def).toMatch(/plan_kind = 'DB_MIGRATION'/i);
    expect(def).toMatch(/release_id is not null/i);
    expect(def).toMatch(/db_plan_id is not null/i);
    expect(def).toMatch(/release_id is null/i);
  });
});

describe("migration 160 — data model", () => {
  it("cria as 6 tabelas de control plane sem IF NOT EXISTS", () => {
    expect(CONTROL_PLANE_TABLES).toEqual([
      "app_db_release_plans",
      "app_db_release_plan_migrations",
      "app_db_release_executions",
      "app_db_release_execution_steps",
      "app_backup_runs",
      "app_schema_validation_results",
    ]);
    for (const table of CONTROL_PLANE_TABLES) {
      expect(sqlSemComentarios).toMatch(new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create table if not exists public\\.${table}`, "i"),
      );
    }
  });

  it("app_db_release_plans tem colunas e statuses do contrato", () => {
    const body = extractCreateTable(sqlSemComentarios, "app_db_release_plans");
    const cols = extractColumnNames(body);
    for (const col of [
      "id",
      "environment",
      "target_release_sha",
      "base_sha",
      "plan_hash",
      "status",
      "scheduled_at",
      "created_at",
      "updated_at",
      "created_by",
      "approved_at",
      "approved_by",
      "readiness_generation",
      "migration_count",
    ]) {
      expect(cols).toContain(col);
    }
    expect(extractInList(body, "app_db_release_plans_status_check")).toEqual([...DB_PLAN_STATUSES]);
    expect(extractInList(body, "app_db_release_plans_environment_check")).toEqual([
      ...DB_ENVIRONMENTS,
    ]);
    expect(body).toMatch(/target_release_sha ~ '\^\[0-9a-f\]\{40\}\$'/);
    expect(body).toMatch(/plan_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  });

  it("app_db_release_plan_migrations modela identidade além do filename", () => {
    const body = extractCreateTable(sqlSemComentarios, "app_db_release_plan_migrations");
    const cols = extractColumnNames(body);
    for (const col of [
      "id",
      "plan_id",
      "migration_order",
      "filename",
      "git_blob",
      "sha256",
      "bytes",
      "classification",
      "created_at",
    ]) {
      expect(cols).toContain(col);
    }
    expect(body).toMatch(/migration_order > 0/);
    expect(body).toMatch(/bytes >= 0/);
    expect(body).toMatch(/sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(body).toMatch(/git_blob is null or git_blob ~ '\^\[0-9a-f\]\{40\}\$'/);
    expect(body).toMatch(/unique\s*\(\s*plan_id,\s*migration_order\s*\)/i);
    expect(body).toMatch(/unique\s*\(\s*plan_id,\s*filename\s*\)/i);
    expect(extractInList(body, "app_db_release_plan_migrations_classification_check")).toEqual([
      ...SCHEMA_CLASSIFICATIONS,
    ]);
  });

  it("app_db_release_executions e steps cobrem o execution model", () => {
    const execBody = extractCreateTable(sqlSemComentarios, "app_db_release_executions");
    const execCols = extractColumnNames(execBody);
    for (const col of [
      "id",
      "plan_id",
      "environment",
      "status",
      "correlation_id",
      "executor_id",
      "started_at",
      "completed_at",
      "heartbeat_at",
      "failure_code",
      "failure_message",
      "created_at",
    ]) {
      expect(execCols).toContain(col);
    }
    expect(extractInList(execBody, "app_db_release_executions_status_check")).toEqual([
      ...EXECUTION_STATUSES,
    ]);

    const stepBody = extractCreateTable(sqlSemComentarios, "app_db_release_execution_steps");
    const stepCols = extractColumnNames(stepBody);
    for (const col of [
      "id",
      "execution_id",
      "step_order",
      "step_type",
      "status",
      "started_at",
      "completed_at",
      "evidence",
      "error_code",
      "error_message",
      "created_at",
    ]) {
      expect(stepCols).toContain(col);
    }
    expect(extractInList(stepBody, "app_db_release_execution_steps_type_check")).toEqual([
      ...EXECUTION_STEP_TYPES,
    ]);
    expect(extractInList(stepBody, "app_db_release_execution_steps_status_check")).toEqual([
      ...EXECUTION_STEP_STATUSES,
    ]);
    expect(stepBody).toMatch(/evidence jsonb/i);
    expect(stepBody).toMatch(/not \(evidence \? 'authorization'\)/i);
  });

  it("app_backup_runs modela estados sem provider real", () => {
    const body = extractCreateTable(sqlSemComentarios, "app_backup_runs");
    const cols = extractColumnNames(body);
    for (const col of [
      "id",
      "plan_id",
      "execution_id",
      "environment",
      "provider",
      "provider_backup_id",
      "status",
      "started_at",
      "completed_at",
      "verified_at",
      "provider_metadata",
      "integrity_evidence",
      "requested_by",
      "correlation_id",
      "created_at",
      "updated_at",
    ]) {
      expect(cols).toContain(col);
    }
    expect(extractInList(body, "app_backup_runs_status_check")).toEqual([...BACKUP_STATUSES]);
    expect(sqlSemComentarios).not.toMatch(/create(?:\s+or\s+replace)?\s+function[\s\S]*createBackup/i);
    expect(sqlSemComentarios).not.toMatch(/\bpg_dump\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(/createBackup\s*\(/i);
  });

  it("app_schema_validation_results cobre classification e result", () => {
    const body = extractCreateTable(sqlSemComentarios, "app_schema_validation_results");
    const cols = extractColumnNames(body);
    for (const col of [
      "id",
      "plan_id",
      "plan_migration_id",
      "filename",
      "sha256",
      "classification",
      "validator_version",
      "result",
      "findings",
      "validated_at",
      "created_at",
    ]) {
      expect(cols).toContain(col);
    }
    expect(extractInList(body, "app_schema_validation_results_classification_check")).toEqual([
      ...SCHEMA_CLASSIFICATIONS,
    ]);
    expect(extractInList(body, "app_schema_validation_results_result_check")).toEqual([
      ...SCHEMA_VALIDATION_RESULTS,
    ]);
  });

  it("não cria session registry canônico nem altera tab_user_sessions", () => {
    expect(sqlSemComentarios).not.toMatch(/create table public\.app_user_sessions/i);
    expect(sqlSemComentarios).not.toMatch(/create table public\.app_canonical_sessions/i);
    expect(sqlSemComentarios).not.toMatch(/\btab_user_sessions\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bheartbeat\b/i);
  });
});

describe("migration 160 — event types", () => {
  it("amplia event_type 18 -> 42 sem remover valores antigos", () => {
    const addBlock = sqlSemComentarios.match(
      /add constraint app_maintenance_events_event_type_check\s+check \(event_type in \(([\s\S]*?)\)\)/i,
    );
    expect(addBlock, "novo CHECK de event_type não encontrado").toBeTruthy();
    const valores = [...addBlock[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(valores).toEqual([...MAINTENANCE_EVENT_TYPES]);
    expect(valores).toHaveLength(42);
    for (const tipo of LEGACY_MAINTENANCE_EVENT_TYPES) {
      expect(valores).toContain(tipo);
    }
    for (const tipo of DB_MAINTENANCE_EVENT_TYPES) {
      expect(valores).toContain(tipo);
    }
  });

  it("não cria eventos neste gate", () => {
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
    expect(applySql).not.toMatch(/insert\s+into\s+public\.app_release_events/i);
  });
});

describe("migration 160 — RLS / browser mutation", () => {
  it("habilita RLS e zero policies em todas as tabelas novas", () => {
    for (const table of CONTROL_PLANE_TABLES) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
    expect(sqlSemComentarios).not.toMatch(/create policy/i);
  });

  it("revoga PUBLIC/anon/authenticated e não concede escrita ao browser", () => {
    for (const table of CONTROL_PLANE_TABLES) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`revoke all on table public\\.${table} from public`, "i"),
      );
      expect(sqlSemComentarios).toMatch(
        new RegExp(`revoke all on table public\\.${table} from anon`, "i"),
      );
      expect(sqlSemComentarios).toMatch(
        new RegExp(`revoke all on table public\\.${table} from authenticated`, "i"),
      );
    }
    const grants = grantsDe(sqlSemComentarios);
    for (const grant of grants) {
      expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });

  it("não expõe service role key nem token", () => {
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
  });
});

describe("migration 160 — helpers que precisam conhecer os novos valores", () => {
  it("substitui somente binding_guard e write_assert; não cria RPC nova", () => {
    expect(nomesCreateOrReplace(sqlSemComentarios).sort()).toEqual([
      "app_assert_business_write_allowed",
      "app_maintenance_orchestration_binding_guard",
    ]);
    expect(nomesCreateFunction(sqlSemComentarios)).toEqual([]);
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_maintenance_orchestration_(backup|migrate|db_start)/i,
    );
  });

  it("binding_guard preserva APP bind, reopen clear e adiciona DB bind", () => {
    expect(sql).toMatch(/FUTURE B17 REOPEN CLEAR/);
    expect(corpoGuard).toMatch(/APP_RELEASE/);
    expect(corpoGuard).toMatch(/DB_MIGRATION/);
    expect(corpoGuard).toMatch(/Binding APP e DB não podem coexistir/);
    expect(corpoGuard).toMatch(/SMOKE/);
    expect(corpoGuard).toMatch(/NORMAL/);
  });

  it("write_assert reconhece BACKING_UP/MIGRATING como fence e preserva RELEASING", () => {
    expect(corpoAssert).toMatch(/'BACKING_UP'/);
    expect(corpoAssert).toMatch(/'MIGRATING'/);
    expect(corpoAssert).toMatch(/'RELEASING'/);
    expect(corpoAssert).toMatch(/'NORMAL'/);
    expect(corpoAssert).toMatch(/MAINTENANCE_FENCE_ACTIVE/);
  });

  it("não altera transition_internal nem as 16 edges APP", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_maintenance_orchestration_transition_internal/i,
    );
    expect(migration153).toMatch(/'QUIESCENT'\s*,\s*'RELEASING'/);
    expect(migration159).toMatch(/MAINTENANCE_REOPENED/);
  });
});

describe("migration 160 — contrato server-side casa com a migration", () => {
  it("constants do módulo batem com constraints SQL", () => {
    expect(REQUIRED_READINESS_GATES).toHaveLength(7);
    expect(PLAN_KINDS).toEqual(["APP_RELEASE", "DB_MIGRATION"]);
    expect(LOGIN_GATE_STATES).toEqual(["OPEN", "CLOSED"]);
    expect(MAINTENANCE_PHASES).toHaveLength(13);
    expect(MAINTENANCE_EVENT_TYPES).toHaveLength(42);
  });

  it("não toca UI, readiness API, apply_migration nem PROD URLs novas", () => {
    expect(sqlSemComentarios).not.toMatch(/\/readiness/i);
    expect(sqlSemComentarios).not.toMatch(/apply_migration/i);
    expect(sqlSemComentarios).not.toMatch(/AmbientesAdmin/i);
    expect(sqlSemComentarios).not.toMatch(/MaintenanceAdmin/i);
    expect(sqlSemComentarios).not.toMatch(/LoginPage/i);
    expect(sql).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
    expect(sql).not.toMatch(/zzixvyspwszewhxzusot/);
  });

  it("precheck e postcheck 160 existem antes do COMMIT", () => {
    expect(sql).toMatch(/precheck 160/i);
    expect(sql).toMatch(/postcheck 160/i);
    const idxPostcheck = sql.search(/postcheck 160/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });
});
