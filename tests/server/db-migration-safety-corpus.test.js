import { describe, expect, it } from "vitest";
import { analyzeMigrationSql } from "../../server/db-migration-safety.js";
import { tokenizeSql, significantTokens } from "../../server/db-sql-structure.js";

function analyze(sql) {
  return analyzeMigrationSql({ filename: "corpus.sql", sql });
}

const CORPUS = [
  {
    name: "comentário com UPDATE",
    sql: "-- UPDATE produtos SET x = 1;\ncomment on table public.t is 'n';",
    classification: "SAFE_AUTO",
    forbid: ["TOP_LEVEL_DML"],
  },
  {
    name: "string com DELETE",
    sql: "comment on column public.t.c is 'DELETE FROM clientes';",
    classification: "SAFE_AUTO",
    forbid: ["TOP_LEVEL_DML"],
  },
  {
    name: "top-level INSERT",
    sql: "insert into public.t (id) values (1);",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "top-level UPDATE",
    sql: "update public.t set id = 1;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "DELETE",
    sql: "delete from public.t where id = 1;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "MERGE",
    sql: "merge into public.t using public.s on t.id = s.id when matched then update set x = s.x;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "TRUNCATE",
    sql: "truncate public.t;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "COPY",
    sql: "copy public.t from 'x.csv';",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "CREATE TABLE AS SELECT",
    sql: "create table public.t as select * from public.s;",
    classification: "PROHIBITED",
    require: ["CREATE_TABLE_AS"],
  },
  {
    name: "SELECT INTO",
    sql: "select * into public.t from public.s;",
    classification: "PROHIBITED",
    require: ["SELECT_INTO"],
  },
  {
    name: "DROP TABLE",
    sql: "drop table if exists public.t;",
    classification: "PROHIBITED",
    require: ["DROP_TABLE"],
  },
  {
    name: "DROP COLUMN",
    sql: "alter table public.t drop column if exists nome;",
    classification: "PROHIBITED",
    require: ["DROP_COLUMN"],
  },
  {
    name: "ALTER TYPE",
    sql: "alter type public.mood rename to mood2;",
    classification: "PROHIBITED",
    require: ["ALTER_TYPE"],
  },
  {
    name: "CASCADE destrutivo",
    sql: "drop table public.t cascade;",
    classification: "PROHIBITED",
    require: ["DROP_TABLE"],
  },
  {
    name: "ADD nullable column",
    sql: "alter table public.t add column nick text;",
    classification: "SAFE_AUTO",
  },
  {
    name: "ADD column with default",
    sql: "alter table public.t add column nick text default 'x';",
    classification: "REVIEW_REQUIRED",
    require: ["ADD_COLUMN_DEFAULT"],
  },
  {
    name: "CREATE INDEX",
    sql: "create index concurrently t_nick_idx on public.t (nick);",
    classification: "REVIEW_REQUIRED",
    require: ["CREATE_INDEX"],
  },
  {
    name: "CREATE FUNCTION with DML body",
    sql: `create function public.f() returns void language plpgsql as $$ begin update t set x = 1; end; $$;`,
    classification: "REVIEW_REQUIRED",
    require: ["FUNCTION_BODY_DML"],
    forbid: ["TOP_LEVEL_DML"],
  },
  {
    name: "CREATE FUNCTION with dynamic EXECUTE",
    sql: `create function public.f() returns void language plpgsql as $$ begin execute 'select 1'; end; $$;`,
    classification: "REVIEW_REQUIRED",
    require: ["FUNCTION_BODY_DYNAMIC_SQL"],
  },
  {
    name: "DO with UPDATE",
    sql: `do $$ begin update public.t set x = 1; end; $$;`,
    classification: "PROHIBITED",
    require: ["DO_DML"],
  },
  {
    name: "DO with dynamic SQL",
    sql: `do $$ begin execute 'delete from t'; end; $$;`,
    classification: "PROHIBITED",
    require: ["DO_DYNAMIC_SQL"],
  },
  {
    name: "CALL custom_proc",
    sql: "call custom_proc();",
    classification: "PROHIBITED",
    require: ["PROCEDURE_INVOCATION"],
  },
  {
    name: "SELECT custom_function",
    sql: "select custom_function();",
    classification: "PROHIBITED",
    require: ["FUNCTION_INVOCATION"],
  },
  {
    name: "dollar-quoted semicolons",
    sql: `create function public.f() returns void language plpgsql as $$ begin perform 1; perform 2; end; $$;`,
    classification: "REVIEW_REQUIRED",
  },
  {
    name: "tagged dollar quote",
    sql: `create function public.f() returns void language plpgsql as $BODY$ begin perform 1; end; $BODY$;`,
    classification: "REVIEW_REQUIRED",
  },
  {
    name: "nested parentheses",
    sql: "create table public.t (id numeric(10, 2), chk boolean check (id > (1 + (2 * 3))));",
    classification: "SAFE_AUTO",
  },
  {
    name: "quoted identifiers",
    sql: `create table public."Order" ("Update" text);`,
    classification: "SAFE_AUTO",
    forbid: ["TOP_LEVEL_DML"],
  },
  {
    name: "multiple statements",
    sql: "comment on table public.t is 'a'; create index t_i on public.t (id);",
    classification: "REVIEW_REQUIRED",
  },
  {
    name: "malformed SQL",
    sql: "create table public.t (id int",
    classification: "PROHIBITED",
    require: ["SQL_UNPARSEABLE_OR_UNCERTAIN"],
  },
  {
    name: "mixed case delete",
    sql: "DeLeTe from public.t;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "multi-line update",
    sql: "update\npublic.t\nset x = 1;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "block comment between tokens",
    sql: "delete /**/ from public.t;",
    classification: "PROHIBITED",
    require: ["TOP_LEVEL_DML"],
  },
  {
    name: "COMMENT ON containing UPDATE",
    sql: "comment on column public.t.x is 'UPDATE ...';",
    classification: "SAFE_AUTO",
    forbid: ["TOP_LEVEL_DML"],
  },
  {
    name: "SQL comment DROP TABLE",
    sql: "-- DROP TABLE public.t;\ncreate table public.n (id int);",
    classification: "SAFE_AUTO",
    forbid: ["DROP_TABLE"],
  },
  {
    name: "DROP CONSTRAINT vs DROP COLUMN",
    sql: "alter table public.t drop constraint t_chk;",
    classification: "PROHIBITED",
    require: ["DROP_CONSTRAINT"],
    forbid: ["DROP_COLUMN"],
  },
  {
    name: "CREATE TABLE with regex check",
    sql: "create table public.t (id text check (id ~ '^[0-9]+$'));",
    classification: "SAFE_AUTO",
    forbid: ["SQL_UNPARSEABLE_OR_UNCERTAIN"],
  },
  {
    name: "DROP FUNCTION review",
    sql: "drop function if exists public.f();",
    classification: "REVIEW_REQUIRED",
    require: ["DROP_OBJECT"],
  },
  {
    name: "DROP VIEW review",
    sql: "drop view if exists public.v;",
    classification: "REVIEW_REQUIRED",
    require: ["DROP_OBJECT"],
  },
];

describe("db-migration-safety — corpus adversarial", () => {
  it.each(CORPUS)("$name", (item) => {
    const result = analyze(item.sql);
    expect(result.classification).toBe(item.classification);
    const codes = result.findings.map((finding) => finding.code);
    for (const code of item.require || []) {
      expect(codes).toContain(code);
    }
    for (const code of item.forbid || []) {
      expect(codes).not.toContain(code);
    }
  });

  it("UP/*x*/DATE não é UPDATE por concatenação", () => {
    const tokens = significantTokens(tokenizeSql("UP/*x*/DATE t SET x = 1;").tokens);
    expect(tokens[0].value).toBe("UP");
    expect(tokens[1].value).toBe("DATE");
    const result = analyze("UP/*x*/DATE t SET x = 1;");
    expect(result.classification).toBe("PROHIBITED");
    expect(result.findings.map((item) => item.code)).not.toContain("TOP_LEVEL_DML");
  });

  it("DE/**/LETE não é DELETE por concatenação", () => {
    const result = analyze("DE/**/LETE from public.t;");
    expect(result.classification).toBe("PROHIBITED");
    expect(result.findings.map((item) => item.code)).not.toContain("TOP_LEVEL_DML");
  });

  it("input patológico de comentário aninhado falha fechado", () => {
    const sql = `${"/*".repeat(40)}x${"*/".repeat(40)}`;
    const result = analyze(sql);
    expect(result.classification).toBe("PROHIBITED");
  });
});
