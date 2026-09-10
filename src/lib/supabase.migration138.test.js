import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/138_release_control_plane.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration137 = readFileSync("supabase/migrations/137_hardening_tab_impressoras.sql", "utf8");

const ACTIVE_STATES = [
  "REQUESTED",
  "SCHEDULED",
  "WAITING",
  "VALIDATING",
  "DISPATCHED",
  "RUNNING",
];

const TERMINAL_STATES = ["SUCCEEDED", "FAILED", "BLOCKED", "CANCELED"];

describe("migration 138 — existência e transação", () => {
  it("arquivo 138 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^138[_.]/.test(f));
    expect(arquivos).toEqual(["138_release_control_plane.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });
});

describe("migration 138 — tabela app_release_runs", () => {
  it("cria public.app_release_runs", () => {
    expect(sqlSemComentarios).toMatch(/create table public\.app_release_runs\s*\(/i);
  });

  it("habilita RLS", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_release_runs enable row level security/i,
    );
  });

  it("não cria policies para anon/authenticated", () => {
    expect(sqlSemComentarios).not.toMatch(/create policy/i);
  });
});

describe("migration 138 — ACL service_role only", () => {
  it("faz REVOKE ALL de PUBLIC", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_release_runs from public/i,
    );
  });

  it("faz REVOKE ALL de anon", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_release_runs from anon/i,
    );
  });

  it("faz REVOKE ALL de authenticated", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_release_runs from authenticated/i,
    );
  });

  it("concede SELECT, INSERT, UPDATE, DELETE somente a service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /grant select, insert, update, delete on table public\.app_release_runs to service_role/i,
    );
  });

  it("nenhum GRANT para anon/authenticated/PUBLIC", () => {
    const grants = sqlSemComentarios.match(/\bgrant\b[^;]*;/gi) || [];
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });
});

describe("migration 138 — checks de mode, status e SHA", () => {
  it("restringe mode a immediate/scheduled", () => {
    expect(sqlSemComentarios).toMatch(/app_release_runs_mode_check/i);
    expect(sqlSemComentarios).toMatch(/mode in \('immediate',\s*'scheduled'\)/i);
  });

  it("restringe status à máquina de estados", () => {
    expect(sqlSemComentarios).toMatch(/app_release_runs_status_check/i);
    for (const status of [...ACTIVE_STATES, ...TERMINAL_STATES]) {
      expect(sqlSemComentarios).toContain(`'${status}'`);
    }
  });

  it("exige SHA hexadecimal lowercase de 40 caracteres e base ≠ target", () => {
    expect(sqlSemComentarios).toMatch(/base_sha ~ '\^\[0-9a-f\]\{40\}\$'/);
    expect(sqlSemComentarios).toMatch(/target_sha ~ '\^\[0-9a-f\]\{40\}\$'/);
    expect(sqlSemComentarios).toMatch(/base_sha <> target_sha/);
  });
});

describe("migration 138 — single-active unique partial index", () => {
  it("cria índice UNIQUE parcial com nome claro", () => {
    expect(sqlSemComentarios).toMatch(
      /create unique index app_release_runs_single_active_uidx/i,
    );
    expect(sqlSemComentarios).toMatch(/on public\.app_release_runs \(\(true\)\)/i);
    for (const status of ACTIVE_STATES) {
      expect(sqlSemComentarios).toContain(`'${status}'`);
    }
  });
});

describe("migration 138 — índices de consulta", () => {
  it("indexa created_at DESC, status e ids de run quando não nulos", () => {
    expect(sqlSemComentarios).toMatch(/\(created_at desc\)/i);
    expect(sqlSemComentarios).toMatch(/app_release_runs_status_idx/i);
    expect(sqlSemComentarios).toMatch(/workflow_run_id is not null/i);
    expect(sqlSemComentarios).toMatch(/github_run_id is not null/i);
  });
});

describe("migration 138 — postchecks fail-closed", () => {
  it("possui precheck e postcheck 138", () => {
    expect(sql).toMatch(/precheck 138/i);
    expect(sql).toMatch(/postcheck 138/i);
  });

  it("valida tabela, RLS, ACL e índice single-active antes do COMMIT", () => {
    const idxPostcheck = sql.search(/postcheck 138/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sql).toContain("has_table_privilege(");
    expect(sql).toContain("aclexplode(");
    expect(sql).toContain("app_release_runs_single_active_uidx");
  });
});

describe("migration 138 — proibições de escopo", () => {
  it("não contém token/secreto hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });

  it("não altera outras tabelas", () => {
    expect(sqlSemComentarios).not.toMatch(/alter table public\.(?!app_release_runs\b)/i);
    expect(sqlSemComentarios).not.toMatch(/create table public\.(?!app_release_runs\b)/i);
    expect(sqlSemComentarios).not.toContain("tab_impressoras");
  });

  it("não altera default privileges", () => {
    expect(sqlSemComentarios.toLowerCase()).not.toMatch(/alter\s+default\s+privileges/);
  });

  it("não toca a migration 137", () => {
    expect(migration137).toContain("tab_impressoras");
    expect(sql).not.toContain("tab_impressoras_all");
    expect(sql).not.toContain("137_hardening_tab_impressoras");
  });
});
