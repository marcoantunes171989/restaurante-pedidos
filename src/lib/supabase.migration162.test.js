import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  DB_RUNTIME_EVENT_TYPES,
  MAINTENANCE_EVENT_TYPES,
  RUNTIME_MAINTENANCE_EVENT_TYPES,
} from "../../server/db-release-contract.js";
import { KNOWN_PROJECT_REFS } from "../../server/db-backup-contract.js";
import { SCHEMA_SAFETY_VALIDATOR_VERSION, analyzeMigrationSql } from "../../server/db-migration-safety.js";
import {
  RUNTIME_MIGRATION,
  listMigrations,
  parseFunctionDefs,
  readMigration,
  sha256,
  stripComments,
  topLevelStatements,
} from "../../tests/server/helpers/migration-sql.js";

const sql = readMigration(RUNTIME_MIGRATION);
const code = stripComments(sql);
const topLevel = topLevelStatements(sql);
const defs162 = parseFunctionDefs([RUNTIME_MIGRATION]);
const newFunctions = defs162.filter((def) => !/^create\s+or\s+replace/i.test(def.stmt));

const CONTROL_TABLE_RE = /^(app_db_release_|app_maintenance_|app_release_|app_backup_runs|app_schema_validation_results)/;

describe("migration 162 — identidade e escopo", () => {
  it("existe exatamente UMA migration 162 (runtime hardening) e nenhuma 163", () => {
    const files = listMigrations();
    expect(files.filter((name) => /^162_/.test(name))).toEqual([RUNTIME_MIGRATION]);
    expect(files.filter((name) => /^16[3-9]_/.test(name))).toEqual([]);
  });

  it("160/161 continuam com a identidade canônica congelada (sha256 + bytes LF)", () => {
    const m160 = readMigration("160_db_release_orchestrator_foundation.sql");
    const m161 = readMigration("161_canonical_session_admission.sql");
    expect(sha256(m160)).toBe("c9389b97d596c91e8630f6f3bf9f1b753e6f61d2660cafbf8e85aa683b0a4b04");
    expect(Buffer.byteLength(m160, "utf8")).toBe(54689);
    expect(sha256(m161)).toBe("65784f9b247f6e654a5983945a5caebb8ee96f619225db4f7c0a15a1de7f3e30");
    expect(Buffer.byteLength(m161, "utf8")).toBe(28801);
  });

  it("UTF-8 válido, sem NUL e sem CR (identidade canônica é LF)", () => {
    expect(Buffer.from(sql, "utf8").toString("utf8")).toBe(sql);
    expect(sql.includes("\u0000")).toBe(false);
    expect(sql.includes("\r")).toBe(false);
    expect(sql.endsWith("\n")).toBe(true);
  });

  it("é transacional (1 BEGIN / 1 COMMIT), sem ROLLBACK", () => {
    expect(code.match(/^\s*begin\s*;/gim) || []).toHaveLength(1);
    expect(code.match(/^\s*commit\s*;/gim) || []).toHaveLength(1);
    expect(code).not.toMatch(/^\s*rollback\s*;/im);
  });

  it("não referencia URL, host de projeto nem credencial (sem acesso HML/PROD)", () => {
    expect(sql).not.toMatch(/https?:\/\//i);
    expect(sql).not.toMatch(/\.supabase\.(co|com)/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{5,}\./);
    expect(sql).not.toMatch(/\bbearer\s+[a-z0-9._-]{8,}/i);
    expect(sql).not.toMatch(/service_role_key\s*[:=]/i);
    expect(sql).not.toMatch(/(?:apikey|api_key)\s*[:=]\s*'/i);
    expect(sql).not.toMatch(/\bpassword\s*=\s*'/i);
  });

  it("nenhum objeto não-controle é criado/alterado no top-level (só control-plane + triggers/funções)", () => {
    const tableTargets = topLevel
      .map((statement) => statement.match(/^alter\s+table\s+(?:only\s+)?public\.([a-z0-9_]+)/i))
      .filter(Boolean)
      .map((match) => match[1]);
    expect([...new Set(tableTargets)].sort()).toEqual(["app_db_release_executions", "app_maintenance_events"]);
    expect(topLevel.filter((statement) => /^create\s+table/i.test(statement))).toEqual([]);
    expect(topLevel.filter((statement) => /^drop\s+(table|column|schema)/i.test(statement))).toEqual([]);
  });
});

describe("migration 162 — segurança de dados (zero DML de negócio no apply)", () => {
  it("TOP_LEVEL_BUSINESS_DML_COUNT = 0 (nenhum INSERT/UPDATE/DELETE/MERGE/TRUNCATE/COPY top-level)", () => {
    const dml = topLevel.filter((statement) => /^(insert|update|delete|merge|truncate|copy)\b/i.test(statement));
    expect(dml).toEqual([]);
    expect(topLevel.filter((statement) => /^create\s+(?:temp\w*\s+)?table\b[\s\S]*\bas\b\s+select/i.test(statement))).toEqual([]);
    expect(topLevel.filter((statement) => /^select\b[\s\S]*\binto\b/i.test(statement))).toEqual([]);
    expect(topLevel.filter((statement) => /^\s*with\b/i.test(statement))).toEqual([]);
  });

  it("nenhum backfill histórico: sem UPDATE/INSERT/DELETE em tabela de negócio fora de corpos de função", () => {
    const business = topLevel.filter((statement) => /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?tab_/i.test(statement));
    expect(business).toEqual([]);
    expect(topLevel.filter((statement) => /\bset\s+default\b/i.test(statement))).toEqual([]);
  });

  it("analisador pdb-schema-safety-v1 (não enfraquecido): 0 DML, 0 SQL dinâmico, 1 DDL destrutivo (DROP CONSTRAINT do event_type)", () => {
    expect(SCHEMA_SAFETY_VALIDATOR_VERSION).toBe("pdb-schema-safety-v1");
    const result = analyzeMigrationSql({ filename: RUNTIME_MIGRATION, sql });
    expect(result.dmlCount).toBe(0);
    expect(result.dynamicSqlCount).toBe(0);
    expect(result.destructiveDdlCount).toBe(1);
    const destructive = result.findings.filter((finding) => finding.code === "DROP_CONSTRAINT");
    expect(destructive).toHaveLength(1);
    expect(result.classification).not.toBe("SAFE_AUTO");
    expect(result.automaticEligible).toBe(false);
  });

  it("160/161/162 são bootstrap: nenhuma é elegível a auto-apply pelo analisador", () => {
    for (const name of [
      "160_db_release_orchestrator_foundation.sql",
      "161_canonical_session_admission.sql",
      RUNTIME_MIGRATION,
    ]) {
      const result = analyzeMigrationSql({ filename: name, sql: readMigration(name) });
      expect(result.automaticEligible, name).toBe(false);
      expect(result.classification, name).not.toBe("SAFE_AUTO");
    }
  });

  it("funções NOVAS só fazem DML em tabelas de controle (DML de negócio só nas 24 reescritas)", () => {
    for (const def of newFunctions) {
      const body = stripComments(def.body).toLowerCase();
      const targets = [...body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)/g)]
        .map((match) => match[1])
        .filter((table) => !["set", "only"].includes(table));
      for (const table of targets) {
        expect(CONTROL_TABLE_RE.test(table), `${def.name} escreve em ${table}`).toBe(true);
      }
    }
  });
});

describe("migration 162 — persistência de execução", () => {
  const addColumns = (code.match(/alter table public\.app_db_release_executions\s+add column[\s\S]*?;/i) || [""])[0];

  it("persiste as colunas de runtime realmente requeridas (project_ref, lease, lock, mutação, reconciliação)", () => {
    for (const column of [
      "project_ref text null",
      "lease_generation bigint null",
      "lease_expires_at timestamptz null",
      "lock_released_at timestamptz null",
      "mutation_started_at timestamptz null",
      "reconciled_at timestamptz null",
      "reconciled_by uuid null",
      "reconciliation_evidence jsonb null",
    ]) {
      expect(addColumns).toContain(column);
    }
    expect((addColumns.match(/add column/gi) || [])).toHaveLength(8);
  });

  it("não duplica campo existente sob outro nome (executor_id é o worker id; heartbeat/correlation já existiam)", () => {
    expect(code).not.toMatch(/\bworker_id\b\s+(?:text|uuid)/i);
    expect(addColumns).not.toMatch(/executor_id|heartbeat_at|correlation_id|worker/i);
    expect(code).toMatch(/alter column executor_id set not null/i);
    expect(code).toMatch(/alter column heartbeat_at set not null/i);
    expect(code).toMatch(/alter column correlation_id set not null/i);
  });

  it("ownership NOT NULL e SEM DEFAULT que esconda evidência ausente", () => {
    for (const column of ["project_ref", "lease_generation", "lease_expires_at", "correlation_id", "executor_id", "heartbeat_at"]) {
      expect(code).toMatch(new RegExp(`alter column ${column} set not null`, "i"));
      expect(code).not.toMatch(new RegExp(`alter column ${column} set default`, "i"));
    }
    expect(addColumns).not.toMatch(/\bdefault\b/i);
  });

  it("project_ref amarrado ao ambiente com os refs canônicos (nunca trocáveis)", () => {
    expect(KNOWN_PROJECT_REFS).toEqual({ HML: "zzixvyspwszewhxzusot", PROD: "rwnzggjxhxnfrhstbxkm" });
    expect(code).toMatch(new RegExp(`environment = 'HML' and project_ref = '${KNOWN_PROJECT_REFS.HML}'`));
    expect(code).toMatch(new RegExp(`environment = 'PROD' and project_ref = '${KNOWN_PROJECT_REFS.PROD}'`));
    expect(code).toMatch(new RegExp(`when 'HML' then '${KNOWN_PROJECT_REFS.HML}'`));
    expect(code).toMatch(new RegExp(`when 'PROD' then '${KNOWN_PROJECT_REFS.PROD}'`));
  });

  it("lease_generation: >= 1, monotônica por (environment, project_ref) e única", () => {
    expect(code).toMatch(/lease_generation_check\s+check \(lease_generation >= 1\)/i);
    expect(code).toMatch(/target_generation_uidx\s+unique \(environment, project_ref, lease_generation\)/i);
    expect(code).toMatch(/coalesce\(max\(e\.lease_generation\), 0\) \+ 1/i);
    expect(code).toMatch(/lease_window_check\s+check \(lease_expires_at > heartbeat_at\)/i);
  });

  it("unique(plan_id, correlation_id) é enforçado no banco", () => {
    expect(code).toMatch(/plan_correlation_uidx\s+unique \(plan_id, correlation_id\)/i);
  });

  it("índice único PARCIAL por (environment, project_ref) — sem plan_id na chave do lock", () => {
    expect(code).toMatch(
      /create unique index app_db_release_executions_active_target_uidx\s+on public\.app_db_release_executions \(environment, project_ref\)\s+where lock_released_at is null/i,
    );
    const claim = defs162.find((def) => def.name === "app_db_release_claim_execution");
    expect(claim.body).toMatch(/hashtextextended\(\s*'DB_RELEASE:' \|\| p_environment \|\| ':' \|\| p_project_ref/i);
    expect(claim.body).not.toMatch(/hashtextextended\([^)]*p_plan_id/i);
  });

  it("RECOVERY_REQUIRED e FAILED RETÊM o lock: só SUCCEEDED/CANCELED podem ter lock_released_at", () => {
    expect(code).toMatch(/lock_release_check\s+check \(\s*lock_released_at is null\s+or status in \('SUCCEEDED', 'CANCELED'\)\s*\)/i);
    const release = defs162.find((def) => def.name === "app_db_release_release_lock");
    expect(release.body).toMatch(/v_exec\.status not in \('SUCCEEDED', 'CANCELED'\)/);
    expect(release.body).toContain("LOCK_RELEASE_NOT_ALLOWED");
  });

  it("escrita de ownership só via RPC: service_role perde INSERT/UPDATE em app_db_release_executions", () => {
    expect(code).toMatch(/revoke insert, update on table public\.app_db_release_executions from service_role/i);
    expect(code).not.toMatch(/grant [a-z, ]*(insert|update)[a-z, ]* on table public\.app_db_release_executions/i);
  });

  it("evidência de reconciliação: humano + jsonb objeto sem segredos (CHECK)", () => {
    const start = code.indexOf("app_db_release_executions_reconciliation_check");
    expect(start).toBeGreaterThan(0);
    const check = code.slice(start, start + 1500);
    for (const key of ["authorization", "service_role", "password", "secret", "token", "api_key"]) {
      expect(check).toContain(`'${key}'`);
    }
    expect(check).toMatch(/reconciled_by is not null/);
    expect(check).toMatch(/status in \('SUCCEEDED', 'CANCELED'\)/);
  });
});

describe("migration 162 — precheck fail-closed", () => {
  it("o precheck exige EXATAMENTE o contrato de 42 event_types da 160 (mesmo literal do postcheck da 160)", () => {
    const literal = (text) => (text.match(/v_event_type_condef constant text :=\s*'((?:[^']|'')*)'/) || [])[1];
    const m160 = readMigration("160_db_release_orchestrator_foundation.sql");
    const postcheck160 = m160.slice(m160.indexOf("--  POSTCHECK fail-closed"));
    expect(literal(sql)).toBeTruthy();
    expect(literal(sql)).toBe(literal(postcheck160));
    expect((literal(sql).match(/::text/g) || []).length).toBe(42);
  });

  it("precheck: tabela de execuções vazia (sem backfill), colunas de runtime ausentes, funções da 162 ausentes, drift de pré-imagem bloqueia", () => {
    const precheck = sql.slice(sql.indexOf("--  0) PRECHECK"), sql.indexOf("--  1) EVENT_TYPE"));
    expect(precheck).toMatch(/select count\(\*\) into v_count from public\.app_db_release_executions;\s*if v_count <> 0 then\s*raise exception/i);
    expect(precheck).toMatch(/colunas de runtime já existem/);
    expect(precheck).toMatch(/já existe função da migration 162/);
    expect(precheck).toMatch(/md5\(replace\(v_src, E'\\r', ''\)\) is distinct from \(v_target->>'preimage_md5'\)/);
    expect(precheck).toMatch(/deveria ser SECURITY DEFINER/);
  });
});

describe("migration 162 — taxonomia de auditoria (event_type)", () => {
  const constraintBlock = code.slice(code.indexOf("add constraint app_maintenance_events_event_type_check"));
  const values = [...constraintBlock.slice(0, constraintBlock.indexOf("));") + 2).matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);

  it("53 valores = 42 herdados (superset monotônico) + 11 novos; nenhum antigo removido", () => {
    expect(values).toHaveLength(53);
    expect(new Set(values).size).toBe(53);
    expect(values).toEqual(RUNTIME_MAINTENANCE_EVENT_TYPES);
    for (const legacy of MAINTENANCE_EVENT_TYPES) expect(values).toContain(legacy);
    expect(values.slice(0, 42)).toEqual([...MAINTENANCE_EVENT_TYPES]);
    expect(values.slice(42)).toEqual([...DB_RUNTIME_EVENT_TYPES]);
  });

  it("constraint substituída estruturalmente (DROP + ADD do mesmo nome); linhas históricas intocadas", () => {
    expect(code).toMatch(/drop constraint app_maintenance_events_event_type_check/i);
    expect(code).toMatch(/add constraint app_maintenance_events_event_type_check\s+check \(event_type in \(/i);
    expect(topLevel.filter((statement) => /^(update|delete)\b[\s\S]*app_maintenance_events/i.test(statement))).toEqual([]);
  });

  it("não duplica evento com equivalente existente (aborto usa MAINTENANCE_ABORTED)", () => {
    for (const forbidden of ["DB_RELEASE_ABORTED", "DB_EXECUTION_REQUESTED", "DB_LOCK_ACQUIRED_V2"]) {
      expect(values).not.toContain(forbidden);
    }
    expect(values).toContain("MAINTENANCE_ABORTED");
  });
});

describe("migration 162 — ACL / owner / search_path das funções novas", () => {
  const RPCS = [
    "app_db_release_claim_execution",
    "app_db_release_heartbeat_execution",
    "app_db_release_transition_execution",
    "app_db_release_release_lock",
    "app_db_release_flag_stale_execution",
    "app_db_release_reconcile_execution",
    "app_db_release_release_reconciled_lock",
    "app_maintenance_db_orchestration_start",
    "app_maintenance_db_orchestration_transition",
    "app_maintenance_db_orchestration_login_gate",
    "app_maintenance_db_orchestration_abort_to_normal",
    "app_db_release_write_coverage_probe",
  ];

  it("todas as funções novas existem exatamente uma vez", () => {
    for (const rpc of RPCS) expect(newFunctions.filter((def) => def.name === rpc), rpc).toHaveLength(1);
    // 12 RPCs server-only + 11 helpers/guards internos = 23 funções novas (+ 25 CREATE OR REPLACE).
    expect(newFunctions).toHaveLength(23);
    expect(defs162).toHaveLength(48);
  });

  it("RPCs: revoke de public/anon/authenticated/service_role e grant EXECUTE só a service_role", () => {
    for (const rpc of RPCS) {
      expect(code, rpc).toMatch(new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from public, anon, authenticated, service_role;`));
      expect(code, rpc).toMatch(new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\) to service_role;`));
      expect(code, rpc).not.toMatch(new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\) to [^;]*\\b(anon|authenticated|public)\\b`));
    }
  });

  it("helpers internos: nenhum GRANT a nenhum role", () => {
    const internal = newFunctions.map((def) => def.name).filter((name) => !RPCS.includes(name));
    expect(internal.length).toBeGreaterThan(8);
    for (const name of internal) {
      expect(code, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`));
      expect(code, name).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
  });

  it("SECURITY DEFINER com search_path fixo (exceto os 2 helpers SQL puros) e owner postgres", () => {
    for (const def of newFunctions) {
      if (["app_db_release_project_ref_for_internal", "app_db_release_execution_json_internal"].includes(def.name)) {
        expect(def.header, def.name).toMatch(/set search_path = public/i);
        continue;
      }
      expect(def.header, def.name).toMatch(/security definer/i);
      expect(def.header, def.name).toMatch(/set search_path = public/i);
      expect(code, def.name).toMatch(new RegExp(`alter function public\\.${def.name}\\([^)]*\\) owner to postgres;`));
    }
  });

  it("nenhuma função nova concede a anon/authenticated e nenhum credencial é retornada", () => {
    expect(code).not.toMatch(/grant execute on function [^;]*to [^;]*\b(anon|authenticated)\b/i);
    for (const def of newFunctions) expect(stripComments(def.body), def.name).not.toMatch(/service_role_key|current_setting\('request\.jwt/i);
  });
});
