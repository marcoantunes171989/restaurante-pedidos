import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_SAFETY_PARSER_VERSION,
  SCHEMA_SAFETY_VALIDATOR_VERSION,
  analyzeMigrationSet,
  analyzeMigrationSql,
  applyServerMigrationClassifications,
  bindSafetyEvidence,
  isSafetyEvidenceBound,
} from "../../server/db-migration-safety.js";
import { tokenizeSql, splitStatements, significantTokens, utf8ByteLength } from "../../server/db-sql-structure.js";
import { createDbReleasePlan, validateDbReleasePlan } from "../../server/db-release-plan.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const safetySource = readFileSync(resolve(root, "server/db-migration-safety.js"), "utf8");
const structureSource = readFileSync(resolve(root, "server/db-sql-structure.js"), "utf8");
const storeSource = readFileSync(resolve(root, "server/db-migration-safety-store.js"), "utf8");

const BLOB_160 = "7f2784b5720aece674d953b32da351db21085421";
const BLOB_161 = "a83bf385eae5fc088019ad455556fbe4f37e4a9d";

function gitBlob(sha) {
  return execFileSync("git", ["cat-file", "blob", sha], { cwd: root });
}

function analyze(sql, extras = {}) {
  return analyzeMigrationSql({ filename: extras.filename || "x.sql", sql, identity: extras.identity });
}

function codes(result) {
  return result.findings.map((item) => item.code);
}

describe("db-migration-safety — contrato", () => {
  it("expõe versão determinística e parser estrutural", () => {
    expect(SCHEMA_SAFETY_VALIDATOR_VERSION).toBe("pdb-schema-safety-v1");
    expect(SCHEMA_SAFETY_PARSER_VERSION).toBe("pdb-sql-structure-v1");
    expect(structureSource).toContain("tokenizeSql");
    expect(structureSource).toContain("dollar_string");
    expect(safetySource).not.toMatch(/\bfetch\s*\(/);
    expect(safetySource).not.toMatch(/\beval\s*\(/);
    expect(safetySource).not.toMatch(/new Function/);
    expect(safetySource).not.toMatch(/(?:^|\n)\s*process\.env/);
    expect(storeSource).not.toMatch(/\bfetch\s*\(/);
    expect(storeSource).not.toMatch(/\beval\s*\(/);
    expect(storeSource).not.toMatch(/(?:^|\n)\s*process\.env/);
  });

  it("não classifica por regex de substring no SQL cru", () => {
    expect(safetySource).not.toMatch(/sql\.(?:match|search)\(\s*\/(?:insert|update|delete)/i);
  });
});

describe("db-migration-safety — lexical", () => {
  it("não dispara DML em comentário, string ou dollar-quote de definição", () => {
    const result = analyze(`
      -- UPDATE produtos SET preco = 1;
      comment on column x.y is 'UPDATE produtos SET preco = 1';
      create function public.f()
      returns void
      language plpgsql
      as $$
      begin
        UPDATE produtos SET preco = 1;
      end;
      $$;
    `);
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.dmlCount).toBe(0);
    expect(codes(result)).not.toContain("TOP_LEVEL_DML");
    expect(codes(result)).toContain("FUNCTION_BODY_DML");
  });

  it("não interpreta -- DROP TABLE como DROP ativo", () => {
    const result = analyze(`
      -- DROP TABLE public.clientes;
      comment on table public.x is 'DROP TABLE';
    `);
    expect(result.classification).toBe("SAFE_AUTO");
    expect(codes(result)).not.toContain("DROP_TABLE");
  });

  it("dollar-quote com ponto-e-vírgula interno não parte statements", () => {
    const sql = `
      create function public.f() returns void language plpgsql as $$
      begin
        perform 1;
        perform 2;
      end;
      $$;
      comment on function public.f() is 'ok';
    `;
    const split = splitStatements(sql);
    expect(split.ok).toBe(true);
    expect(split.statements).toHaveLength(2);
    const result = analyze(sql);
    expect(result.statementCount).toBe(2);
    expect(result.classification).toBe("REVIEW_REQUIRED");
  });

  it("suporta dollar-quote com tag", () => {
    const result = analyze(`
      create function public.f() returns integer language plpgsql as $function$
      begin
        return 1;
      end;
      $function$;
    `);
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.findings.some((item) => item.code === "CREATE_FUNCTION")).toBe(true);
  });

  it("identificadores citados não viram keyword", () => {
    const result = analyze(`create table public."UPDATE" ("DELETE" text);`);
    expect(result.classification).toBe("SAFE_AUTO");
    expect(codes(result)).not.toContain("TOP_LEVEL_DML");
  });

  it("comentário no meio de keyword NÃO concatena (PostgreSQL)", () => {
    const tokens = significantTokens(tokenizeSql("UP/*x*/DATE t SET x = 1;").tokens);
    expect(tokens.map((token) => token.value)).toEqual(["UP", "DATE", "t", "SET", "x", "=", "1", ";"]);
    const result = analyze("UP/*x*/DATE t SET x = 1;");
    expect(result.classification).toBe("PROHIBITED");
    expect(codes(result)).toContain("SQL_UNPARSEABLE_OR_UNCERTAIN");
    expect(codes(result)).not.toContain("TOP_LEVEL_DML");
  });

  it("UPDATE/*x*/ com keyword completa continua DML", () => {
    const result = analyze("UPDATE/*x*/ public.t SET x = 1;");
    expect(result.classification).toBe("PROHIBITED");
    expect(codes(result)).toContain("TOP_LEVEL_DML");
  });
});

describe("db-migration-safety — DML / DDL", () => {
  it.each([
    ["INSERT INTO t VALUES (1);", "INSERT"],
    ["update t set x = 1;", "UPDATE"],
    ["DELETE FROM t;", "DELETE"],
    ["MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET x = 1;", "MERGE"],
    ["TRUNCATE t;", "TRUNCATE"],
    ["COPY t FROM stdin;", "COPY"],
  ])("%s é PROHIBITED", (sql) => {
    const result = analyze(sql);
    expect(result.classification).toBe("PROHIBITED");
    expect(result.dmlCount).toBeGreaterThan(0);
    expect(codes(result)).toContain("TOP_LEVEL_DML");
  });

  it("CREATE TABLE AS SELECT e SELECT INTO são proibidos", () => {
    expect(analyze("create table t as select 1 as id;").classification).toBe("PROHIBITED");
    expect(codes(analyze("create table t as select 1 as id;"))).toContain("CREATE_TABLE_AS");
    expect(analyze("select * into t from s;").classification).toBe("PROHIBITED");
    expect(codes(analyze("select * into t from s;"))).toContain("SELECT_INTO");
  });

  it("DROP TABLE / COLUMN / ALTER TYPE / CASCADE são proibidos", () => {
    expect(analyze("drop table public.t;").classification).toBe("PROHIBITED");
    expect(analyze("alter table public.t drop column x;").classification).toBe("PROHIBITED");
    expect(codes(analyze("alter table public.t drop constraint t_chk;"))).toContain("DROP_CONSTRAINT");
    expect(codes(analyze("alter table public.t drop constraint t_chk;"))).not.toContain("DROP_COLUMN");
    expect(analyze("alter table public.t alter column x type int;").classification).toBe("PROHIBITED");
    expect(analyze("drop table public.t cascade;").classification).toBe("PROHIBITED");
    expect(analyze("alter type public.mood add value 'x';").classification).toBe("PROHIBITED");
  });

  it("ADD COLUMN anulável é SAFE_AUTO; com default é REVIEW_REQUIRED", () => {
    expect(analyze("alter table public.t add column x text;").classification).toBe("SAFE_AUTO");
    expect(analyze("alter table public.t add column x text default 'a';").classification).toBe("REVIEW_REQUIRED");
    expect(codes(analyze("alter table public.t add column x text default 'a';"))).toContain("ADD_COLUMN_DEFAULT");
  });

  it("CREATE INDEX / GRANT / RLS / constraint são REVIEW_REQUIRED", () => {
    expect(analyze("create index t_idx on public.t (x);").classification).toBe("REVIEW_REQUIRED");
    expect(analyze("create index concurrently t_idx on public.t (x);").classification).toBe("REVIEW_REQUIRED");
    expect(analyze("alter table public.t add constraint t_pk primary key (id);").classification).toBe("REVIEW_REQUIRED");
    expect(analyze("alter table public.t enable row level security;").classification).toBe("REVIEW_REQUIRED");
    expect(analyze("grant select on public.t to service_role;").classification).toBe("REVIEW_REQUIRED");
  });

  it("CREATE TABLE simples é SAFE_AUTO; COMMENT ON também", () => {
    expect(analyze("create table public.t (id uuid primary key, nome text);").classification).toBe("SAFE_AUTO");
    expect(analyze("comment on table public.t is 'hello UPDATE';").classification).toBe("SAFE_AUTO");
  });
});

describe("db-migration-safety — procedural", () => {
  it("DO com UPDATE é PROHIBITED; CREATE FUNCTION com UPDATE é REVIEW_REQUIRED", () => {
    const doSql = `do $$ begin update public.t set x = 1; end; $$;`;
    const fnSql = `
      create function public.f() returns void language plpgsql as $$
      begin
        update public.t set x = 1;
      end;
      $$;
    `;
    expect(analyze(doSql).classification).toBe("PROHIBITED");
    expect(codes(analyze(doSql))).toContain("DO_DML");
    expect(analyze(fnSql).classification).toBe("REVIEW_REQUIRED");
    expect(codes(analyze(fnSql))).toContain("FUNCTION_BODY_DML");
    expect(codes(analyze(fnSql))).not.toContain("TOP_LEVEL_DML");
  });

  it("DO com EXECUTE dinâmico é PROHIBITED; function body dinâmico é REVIEW_REQUIRED", () => {
    const doSql = `do $$ begin execute 'update t set x = 1'; end; $$;`;
    const fnSql = `
      create function public.f() returns void language plpgsql as $$
      begin
        execute 'update t set x = 1';
      end;
      $$;
    `;
    expect(analyze(doSql).classification).toBe("PROHIBITED");
    expect(codes(analyze(doSql))).toContain("DO_DYNAMIC_SQL");
    expect(analyze(fnSql).classification).toBe("REVIEW_REQUIRED");
    expect(codes(analyze(fnSql))).toContain("FUNCTION_BODY_DYNAMIC_SQL");
  });

  it("CALL e SELECT de função customizada são PROHIBITED", () => {
    expect(analyze("call public.custom_proc();").classification).toBe("PROHIBITED");
    expect(codes(analyze("call public.custom_proc();"))).toContain("PROCEDURE_INVOCATION");
    expect(analyze("select public.custom_function();").classification).toBe("PROHIBITED");
    expect(codes(analyze("select public.custom_function();"))).toContain("FUNCTION_INVOCATION");
  });
});

describe("db-migration-safety — multi-statement e identidade", () => {
  it("um statement PROHIBITED domina o arquivo", () => {
    const result = analyze(`
      comment on table public.t is 'ok';
      insert into public.t values (1);
    `);
    expect(result.classification).toBe("PROHIBITED");
    expect(result.statementCount).toBe(2);
    expect(result.safeAutoCount).toBe(1);
    expect(result.prohibitedCount).toBe(1);
  });

  it("BEGIN/COMMIT não são DML", () => {
    const result = analyze(`
      begin;
      comment on table public.t is 'x';
      commit;
    `);
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.dmlCount).toBe(0);
    expect(codes(result)).toContain("TRANSACTION_CONTROL");
  });

  it("malformed SQL é PROHIBITED", () => {
    const result = analyze("select 'unterminated");
    expect(result.classification).toBe("PROHIBITED");
    expect(codes(result)).toContain("SQL_UNPARSEABLE_OR_UNCERTAIN");
    expect(result.passed).toBe(false);
  });

  it("resultado amarra sha256 + validator version", () => {
    const sql = "comment on table public.t is 'x';";
    const sha = crypto.createHash("sha256").update(sql, "utf8").digest("hex");
    const result = analyze(sql, { identity: { sha256: sha, bytes: utf8ByteLength(sql), gitBlob: "a".repeat(40) } });
    expect(result.contentSha256).toBe(sha);
    expect(result.validatorVersion).toBe("pdb-schema-safety-v1");
    expect(result.identity.matched).toBe(true);
    const stale = analyze(sql, { identity: { sha256: "b".repeat(64), bytes: 1 } });
    expect(stale.classification).toBe("PROHIBITED");
    expect(codes(stale)).toContain("IDENTITY_MISMATCH");
  });

  it("analyzeMigrationSet agrega precedência", () => {
    const set = analyzeMigrationSet([
      { filename: "a.sql", sql: "comment on table public.t is 'x';", order: 1 },
      { filename: "b.sql", sql: "create index t_idx on public.t (id);", order: 2 },
    ]);
    expect(set.overallClassification).toBe("REVIEW_REQUIRED");
    expect(set.allSafe).toBe(false);
    expect(set.requiresReview).toBe(true);
    expect(set.hasProhibited).toBe(false);
    expect(set.migrationCount).toBe(2);
    const banned = analyzeMigrationSet([
      { filename: "a.sql", sql: "comment on table public.t is 'x';" },
      { filename: "b.sql", sql: "delete from public.t;" },
    ]);
    expect(banned.overallClassification).toBe("PROHIBITED");
    expect(banned.hasProhibited).toBe(true);
  });
});

describe("db-migration-safety — plan classification authority", () => {
  it("SQL do inventário sobrescreve SAFE_AUTO declarado", () => {
    const classified = applyServerMigrationClassifications([
      {
        order: 1,
        filename: "x.sql",
        gitBlob: "c".repeat(40),
        sha256: "d".repeat(64),
        bytes: 12,
        classification: "SAFE_AUTO",
        sql: "insert into t values (1);",
      },
    ]);
    expect(classified.ok).toBe(true);
    expect(classified.source).toBe("server_analyzer");
    expect(classified.migrations[0].classification).toBe("PROHIBITED");
  });

  it("validateDbReleasePlan usa classificação do analyzer quando há SQL", async () => {
    const plans = new Map();
    const migrations = new Map();
    const store = {
      async readCanonicalMigrationInventory() {
        return {
          ok: true,
          migrations: [{
            order: 1,
            filename: "160.sql",
            gitBlob: "c".repeat(40),
            sha256: crypto.createHash("sha256").update("insert into t values (1);", "utf8").digest("hex"),
            bytes: utf8ByteLength("insert into t values (1);"),
            classification: "SAFE_AUTO",
            sql: "insert into t values (1);",
          }],
        };
      },
      async createPlanRow(row) {
        plans.set(row.id, { ...row });
        return { ok: true, row: { ...row } };
      },
      async getPlanRow(id) {
        const row = plans.get(id);
        return row ? { ok: true, row: { ...row } } : { ok: false, error: "PLAN_NOT_FOUND" };
      },
      async listPlanMigrationRows(id) {
        return { ok: true, rows: [...(migrations.get(id) || [])] };
      },
      async insertPlanMigrationRows(id, rows) {
        migrations.set(id, rows.map((row) => ({ ...row })));
        return { ok: true };
      },
      async transitionPlanRow({ id, patch }) {
        Object.assign(plans.get(id), patch);
        return { ok: true, row: { ...plans.get(id) } };
      },
      async appendPlanEvent() { return { ok: true }; },
    };
    const created = await createDbReleasePlan({
      environment: "HML",
      targetReleaseSha: "a".repeat(40),
      baseSha: "b".repeat(40),
    }, { store, nowMs: Date.UTC(2026, 8, 18) });
    const validated = await validateDbReleasePlan({ id: created.plan.id }, { store, nowMs: Date.UTC(2026, 8, 18, 1) });
    expect(validated.ok).toBe(true);
    expect(validated.plan.migrations[0].classification).toBe("PROHIBITED");
  });
});

describe("db-migration-safety — migrations 160/161 canônicas", () => {
  const sql160 = gitBlob(BLOB_160).toString("utf8");
  const sql161 = gitBlob(BLOB_161).toString("utf8");
  const identity160 = {
    filename: "160_db_release_orchestrator_foundation.sql",
    gitBlob: BLOB_160,
    sha256: crypto.createHash("sha256").update(gitBlob(BLOB_160)).digest("hex"),
    bytes: gitBlob(BLOB_160).length,
    order: 1,
  };
  const identity161 = {
    filename: "161_canonical_session_admission.sql",
    gitBlob: BLOB_161,
    sha256: crypto.createHash("sha256").update(gitBlob(BLOB_161)).digest("hex"),
    bytes: gitBlob(BLOB_161).length,
    order: 2,
  };

  it("analisa blob Git de 160 sem modificar o arquivo", () => {
    const result = analyzeMigrationSql({ filename: identity160.filename, sql: sql160, identity: identity160 });
    expect(result.identity.matched).toBe(true);
    expect(result.validatorVersion).toBe("pdb-schema-safety-v1");
    expect(["SAFE_AUTO", "REVIEW_REQUIRED", "PROHIBITED"]).toContain(result.classification);
    expect(result.statementCount).toBeGreaterThan(0);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("analisa blob Git de 161 sem modificar o arquivo", () => {
    const result = analyzeMigrationSql({ filename: identity161.filename, sql: sql161, identity: identity161 });
    expect(result.identity.matched).toBe(true);
    expect(["SAFE_AUTO", "REVIEW_REQUIRED", "PROHIBITED"]).toContain(result.classification);
    expect(result.statementCount).toBeGreaterThan(0);
  });
});

describe("db-migration-safety — evidence binding", () => {
  it("validator version divergente invalida evidência", () => {
    const analysis = analyzeMigrationSet([{ filename: "a.sql", sql: "comment on table t is 'x';" }]);
    const evidence = bindSafetyEvidence({ analysis, planHash: "a".repeat(64) });
    expect(isSafetyEvidenceBound(evidence, { planHash: "a".repeat(64) }).bound).toBe(true);
    expect(isSafetyEvidenceBound({ ...evidence, validatorVersion: "old" }, { planHash: "a".repeat(64) }).bound).toBe(false);
    expect(isSafetyEvidenceBound(evidence, { planHash: "b".repeat(64) }).reasonCode).toBe("SCHEMA_SAFETY_PLAN_HASH_STALE");
  });
});
