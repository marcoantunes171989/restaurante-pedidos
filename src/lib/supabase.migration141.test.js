import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/141_maintenance_operations.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");

const OPERATION_TYPES = [
  "CHECKOUT",
  "PUBLIC_ORDER",
  "INTERNAL_ORDER",
  "ONBOARDING",
  "FISCAL_RULE_MUTATION",
  "NFCE_EMISSION",
  "USER_ADMIN_MUTATION",
];

const STATUSES = ["IN_FLIGHT", "COMPLETED", "FAILED", "EXPIRED"];

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function extractInList(texto, constraintName) {
  const re = new RegExp(`${constraintName}[\\s\\S]*?\\bin\\s*\\(([^)]*)\\)`, "i");
  const match = texto.match(re);
  expect(match, `lista IN de ${constraintName} não encontrada`).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

describe("migration 141 — existência e transação", () => {
  it("arquivo 141 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^141[_.]/.test(f));
    expect(arquivos).toEqual(["141_maintenance_operations.sql"]);
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

describe("migration 141 — precheck fail-closed", () => {
  it("possui precheck 141 antes da criação da tabela", () => {
    expect(sql).toMatch(/precheck 141/i);
    const idxPrecheck = sql.search(/precheck 141/i);
    const idxCreate = sql.search(/create table public\.app_maintenance_operations/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige app_maintenance_state e app_maintenance_events existentes", () => {
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_state.*não existe|não existe.*app_maintenance_state/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_events.*não existe|não existe.*app_maintenance_events/i,
    );
  });

  it("bloqueia se app_maintenance_operations já existir", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations já existe/i);
  });
});

describe("migration 141 — não altera 140 nem outras tabelas", () => {
  it("não modifica o arquivo da migration 140", () => {
    expect(migration140).toMatch(/create table public\.app_maintenance_state/i);
    expect(migration140).not.toMatch(/app_maintenance_operations/i);
  });

  it("não altera app_maintenance_state nem app_maintenance_events", () => {
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_maintenance_state/i);
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_maintenance_events/i);
    expect(sqlSemComentarios).not.toMatch(/insert into public\.app_maintenance_state/i);
    expect(sqlSemComentarios).not.toMatch(/insert into public\.app_maintenance_events/i);
  });

  it("não cria nova tabela além de app_maintenance_operations", () => {
    const criacoes = [...sqlSemComentarios.matchAll(/create table public\.(\w+)/gi)].map(
      (m) => m[1],
    );
    expect(criacoes).toEqual(["app_maintenance_operations"]);
  });

  it("não toca tabelas de negócio", () => {
    for (const tabela of [
      "tab_pedidos",
      "tab_caixas",
      "tab_impressoras",
      "tab_impressoes_cozinha",
      "app_release_runs",
      "app_release_events",
    ]) {
      expect(sqlSemComentarios).not.toContain(tabela);
    }
  });
});

describe("migration 141 — schema da tabela", () => {
  it("cria public.app_maintenance_operations sem IF NOT EXISTS", () => {
    expect(sqlSemComentarios).toMatch(/create table public\.app_maintenance_operations\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(
      /create table if not exists public\.app_maintenance_operations/i,
    );
  });

  it("contém as colunas obrigatórias", () => {
    for (const coluna of [
      "id uuid primary key",
      "operation_type text not null",
      "status text not null",
      "maintenance_epoch integer not null",
      "operation_key text null",
      "started_at timestamptz not null default now()",
      "heartbeat_at timestamptz not null default now()",
      "expires_at timestamptz not null",
      "completed_at timestamptz null",
      "failed_at timestamptz null",
      "expired_at timestamptz null",
      "failure_code text null",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(sqlSemComentarios.replace(/\s+/g, " ")).toContain(coluna);
    }
  });

  it("status tem default IN_FLIGHT", () => {
    expect(sqlSemComentarios).toMatch(/status text not null default 'IN_FLIGHT'/i);
  });

  it("maintenance_epoch NÃO tem default", () => {
    const trecho = sqlSemComentarios.match(/maintenance_epoch integer not null[^,]*/i)[0];
    expect(trecho.toLowerCase()).not.toContain("default");
  });

  it("não cria FK para app_maintenance_state", () => {
    expect(sqlSemComentarios).not.toMatch(/references public\.app_maintenance_state/i);
  });

  it("não armazena segredos/credenciais/payload bruto", () => {
    const corpoTabela = sqlSemComentarios.match(
      /create table public\.app_maintenance_operations\s*\(([\s\S]*?)\n\);/i,
    )[1];
    for (const termo of [
      "senha",
      "password",
      "token",
      "cookie",
      "service_role_key",
      "bearer",
      "payload",
      "credential",
      "secret",
      "segredo",
      "metadata jsonb",
    ]) {
      expect(corpoTabela.toLowerCase()).not.toContain(termo);
    }
  });
});

describe("migration 141 — enums discretos", () => {
  it("restringe operation_type exatamente aos 7 tipos", () => {
    expect(OPERATION_TYPES).toHaveLength(7);
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_operation_type_check/i);
    const tipos = extractInList(
      sqlSemComentarios,
      "app_maintenance_operations_operation_type_check",
    );
    expect(tipos).toEqual(OPERATION_TYPES);
  });

  it("restringe status exatamente aos 4 estados", () => {
    expect(STATUSES).toHaveLength(4);
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_status_check/i);
    const statuses = extractInList(sqlSemComentarios, "app_maintenance_operations_status_check");
    expect(statuses).toEqual(STATUSES);
  });
});

describe("migration 141 — constraints de epoch, chave e falha", () => {
  it("exige maintenance_epoch >= 0", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_epoch_check/i);
    expect(sqlSemComentarios).toMatch(/maintenance_epoch >= 0/i);
  });

  it("operation_key: null OU trim não vazio e <= 200 caracteres", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_operation_key_check/i);
    expect(sqlSemComentarios).toMatch(/length\(operation_key\) <= 200/i);
    expect(sqlSemComentarios).toMatch(/length\(btrim\(operation_key\)\) > 0/i);
  });

  it("failure_code: null OU trim não vazio e tamanho limitado", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_failure_code_check/i);
    expect(sqlSemComentarios).toMatch(/length\(failure_code\) <= 200/i);
    expect(sqlSemComentarios).toMatch(/length\(btrim\(failure_code\)\) > 0/i);
  });

  it("não exige failure_code para FAILED", () => {
    expect(sqlSemComentarios).not.toMatch(
      /status\s*=\s*'FAILED'[\s\S]{0,60}failure_code is not null/i,
    );
  });
});

describe("migration 141 — lifecycle temporal", () => {
  it("exige expires_at > started_at", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_expires_after_started_check/i);
    expect(sqlSemComentarios).toMatch(/expires_at > started_at/i);
  });

  it("exige heartbeat_at >= started_at", () => {
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_operations_heartbeat_after_started_check/i,
    );
    expect(sqlSemComentarios).toMatch(/heartbeat_at >= started_at/i);
  });

  it("não usa now() em CHECK constraint", () => {
    const checks = sqlSemComentarios.match(/check\s*\([\s\S]*?\)(?=,|\n\);)/gi) || [];
    for (const check of checks) {
      expect(check.toLowerCase()).not.toContain("now()");
    }
  });

  it("exige coerência terminal por status (IN_FLIGHT/COMPLETED/FAILED/EXPIRED)", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations_lifecycle_check/i);
    const bloco = sqlSemComentarios.match(
      /app_maintenance_operations_lifecycle_check\s*check\s*\(([\s\S]*?)\)\n\);/i,
    );
    expect(bloco).toBeTruthy();
    const corpo = bloco[1];

    expect(corpo).toMatch(
      /status = 'IN_FLIGHT'[\s\S]*?completed_at is null and failed_at is null and expired_at is null/i,
    );
    expect(corpo).toMatch(
      /status = 'COMPLETED'[\s\S]*?completed_at is not null and failed_at is null and expired_at is null/i,
    );
    expect(corpo).toMatch(
      /status = 'FAILED'[\s\S]*?failed_at is not null and completed_at is null and expired_at is null/i,
    );
    expect(corpo).toMatch(
      /status = 'EXPIRED'[\s\S]*?expired_at is not null and completed_at is null and failed_at is null/i,
    );
  });
});

describe("migration 141 — índices de drain", () => {
  it("cria índice parcial IN_FLIGHT + expires_at", () => {
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_operations_in_flight_expires_idx\s+on public\.app_maintenance_operations\s*\(\s*expires_at\s*\)\s*where status = 'IN_FLIGHT'/i,
    );
  });

  it("cria índice de epoch + status", () => {
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_operations_epoch_status_idx\s+on public\.app_maintenance_operations\s*\(\s*maintenance_epoch,\s*status\s*\)/i,
    );
  });

  it("cria índice de operation_type + status", () => {
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_operations_type_status_idx\s+on public\.app_maintenance_operations\s*\(\s*operation_type,\s*status\s*\)/i,
    );
  });

  it("cria índice único parcial de operation_key para IN_FLIGHT", () => {
    expect(sqlSemComentarios).toMatch(
      /create unique index app_maintenance_operations_operation_key_in_flight_uidx\s+on public\.app_maintenance_operations\s*\(\s*operation_key\s*\)\s*where status = 'IN_FLIGHT' and operation_key is not null/i,
    );
  });
});

describe("migration 141 — segurança", () => {
  it("habilita RLS e não cria policies", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_maintenance_operations enable row level security/i,
    );
    expect(sqlSemComentarios).not.toMatch(/create policy/i);
  });

  it("faz REVOKE ALL de PUBLIC, anon, authenticated e service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_operations from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_operations from anon/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_operations from authenticated/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_operations from service_role/i,
    );
  });

  it("concede somente SELECT, INSERT, UPDATE a service_role (sem DELETE/TRUNCATE/REFERENCES/TRIGGER)", () => {
    expect(sqlSemComentarios).toMatch(
      /grant select, insert, update on table public\.app_maintenance_operations to service_role/i,
    );
    const grants = grantsDe(sqlSemComentarios).filter((grant) =>
      /app_maintenance_operations\b/i.test(grant),
    );
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant).not.toMatch(/\bdelete\b/i);
      expect(grant).not.toMatch(/\btruncate\b/i);
      expect(grant).not.toMatch(/\breferences\b/i);
      expect(grant).not.toMatch(/\btrigger\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });

  it("não cria view nem RPC pública", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(or\s+replace\s+)?view/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
  });

  it("não cria trigger", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
  });

  it("não faz INSERT de seed/teste", () => {
    expect(sqlSemComentarios).not.toMatch(/insert into public\.app_maintenance_operations/i);
  });
});

describe("migration 141 — postchecks fail-closed", () => {
  it("possui postcheck 141 antes do COMMIT", () => {
    expect(sql).toMatch(/postcheck 141/i);
    const idxPostcheck = sql.search(/postcheck 141/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("valida RLS, policy_count=0, grants e índices via catálogo", () => {
    expect(sql).toContain("has_table_privilege(");
    expect(sql).toContain("aclexplode(");
    expect(sql).toContain("relrowsecurity");
    expect(sql).toMatch(/policy_count=0/i);
    expect(sql).toContain("pg_index");
  });
});

describe("migration 141 — proibições de escopo", () => {
  it("não altera tabelas fora do escopo permitido", () => {
    expect(sqlSemComentarios).not.toMatch(
      /alter table public\.(?!app_maintenance_operations\b)/i,
    );
    expect(sqlSemComentarios.toLowerCase()).not.toMatch(/alter\s+default\s+privileges/);
  });

  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });
});
