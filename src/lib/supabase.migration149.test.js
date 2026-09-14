import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/149_maintenance_operation_lifecycle_canceled.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration148 = readFileSync(
  "supabase/migrations/148_maintenance_rpc_guard_device_heartbeat.sql",
  "utf8",
);

const OLD_STATUSES = ["IN_FLIGHT", "COMPLETED", "FAILED", "EXPIRED"];
const NEW_STATUSES = ["IN_FLIGHT", "COMPLETED", "FAILED", "EXPIRED", "CANCELED"];
const TERMINAL_TIMESTAMPS = ["completed_at", "failed_at", "expired_at", "canceled_at"];

const STATUS_CONSTRAINT = "app_maintenance_operations_status_check";
const LIFECYCLE_CONSTRAINT = "app_maintenance_operations_lifecycle_check";
const OPERATION_TYPE_CONSTRAINT = "app_maintenance_operations_operation_type_check";

function extractInList(texto, constraintName) {
  const re = new RegExp(`${constraintName}[\\s\\S]*?\\bin\\s*\\(([^)]*)\\)`, "i");
  const match = texto.match(re);
  expect(match, `lista IN de ${constraintName} não encontrada`).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function extractLifecycleBlock(texto) {
  const re = new RegExp(`add constraint ${LIFECYCLE_CONSTRAINT}[\\s\\S]*?check \\(([\\s\\S]*?)\\);`, "i");
  const match = texto.match(re);
  expect(match, "corpo do novo lifecycle_check não encontrado").toBeTruthy();
  return match[1];
}

function extractStatusBranch(lifecycleBody, status) {
  const re = new RegExp(`status = '${status}'([\\s\\S]*?)(?:\\)\\s*(?:or|$))`, "i");
  const match = lifecycleBody.match(re);
  expect(match, `branch de status = '${status}' não encontrado na lifecycle_check`).toBeTruthy();
  return match[1];
}

describe("migration 149 — existência e transação", () => {
  it("arquivo 149 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^149[_.]/.test(f));
    expect(arquivos).toEqual(["149_maintenance_operation_lifecycle_canceled.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("alvo exato é public.app_maintenance_operations", () => {
    const tabelasAlteradas = [
      ...sqlSemComentarios.matchAll(/alter table public\.(\w+)/gi),
    ].map((m) => m[1]);
    expect(new Set(tabelasAlteradas)).toEqual(new Set(["app_maintenance_operations"]));
  });

});

describe("migration 149 — precheck fail-closed", () => {
  it("possui precheck 149 antes das alterações de schema", () => {
    expect(sql).toMatch(/precheck 149/i);
    const idxPrecheck = sql.search(/precheck 149/i);
    const idxAlter = sql.search(/alter table public\.app_maintenance_operations\s*\n\s*drop constraint/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxAlter).toBeGreaterThan(idxPrecheck);
  });

  it("valida existência da tabela, da coluna status e da constraint de status", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations.*não existe/i);
    expect(sqlSemComentarios).toMatch(/coluna status ausente/i);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`constraint ${STATUS_CONSTRAINT} ausente`, "i"),
    );
  });

  it("valida que canceled_at ainda não existe antes da alteração (guarda de drift)", () => {
    expect(sqlSemComentarios).toMatch(/coluna canceled_at já existe/i);
  });

  it("valida que a definição atual de status_check aceita exatamente os 4 estados antigos", () => {
    expect(sqlSemComentarios).toMatch(/definição atual de app_maintenance_operations_status_check inesperada/i);
    expect(sqlSemComentarios).toContain(
      "''IN_FLIGHT''::text, ''COMPLETED''::text, ''FAILED''::text, ''EXPIRED''::text",
    );
  });

  it("valida que a definição atual de lifecycle_check ainda é o contrato anterior (sem CANCELED)", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(`constraint ${LIFECYCLE_CONSTRAINT} ausente`, "i"),
    );
    expect(sqlSemComentarios).toMatch(/definição atual de app_maintenance_operations_lifecycle_check inesperada/i);
    const idxPrecheckLifecycle = sqlSemComentarios.search(
      /definição atual de app_maintenance_operations_lifecycle_check inesperada/i,
    );
    const blocoPrecheckLifecycle = sqlSemComentarios.slice(
      Math.max(0, idxPrecheckLifecycle - 400),
      idxPrecheckLifecycle,
    );
    expect(blocoPrecheckLifecycle).not.toMatch(/canceled_at/i);
  });

  it("valida que nenhuma row atual tem status fora dos 4 estados antigos", () => {
    expect(sqlSemComentarios).toMatch(
      /select count\(\*\) into v_bad_rows[\s\S]*status not in \('IN_FLIGHT', 'COMPLETED', 'FAILED', 'EXPIRED'\)/i,
    );
    expect(sqlSemComentarios).toMatch(/linha\(s\) com status fora dos 4 estados antigos/i);
  });

  it("usa RAISE EXCEPTION em toda validação de precheck (fail-closed)", () => {
    const blocoPrecheck = sql.match(/precheck 149[\s\S]*?end \$\$;/i)[0];
    const falhas = [...blocoPrecheck.matchAll(/if\s+[\s\S]*?then/gi)];
    expect(falhas.length).toBeGreaterThan(0);
    expect(blocoPrecheck.match(/raise exception/gi).length).toBeGreaterThanOrEqual(6);
  });
});

describe("migration 149 — alteração da constraint de status", () => {
  it("faz DROP CONSTRAINT + ADD CONSTRAINT preservando o mesmo nome", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(`drop constraint ${STATUS_CONSTRAINT}`, "i"),
    );
    expect(sqlSemComentarios).toMatch(
      new RegExp(`add constraint ${STATUS_CONSTRAINT}`, "i"),
    );
  });

  it("nova allowlist é exatamente IN_FLIGHT, COMPLETED, FAILED, EXPIRED, CANCELED", () => {
    expect(NEW_STATUSES).toHaveLength(5);
    const statuses = extractInList(sqlSemComentarios, `add constraint ${STATUS_CONSTRAINT}`);
    expect(statuses).toEqual(NEW_STATUSES);
  });

  it("CANCELED é o único status novo em relação à migration 141", () => {
    const statusesOriginais = extractInList(migration141, STATUS_CONSTRAINT);
    expect(statusesOriginais).toEqual(OLD_STATUSES);
    const adicionados = NEW_STATUSES.filter((s) => !statusesOriginais.includes(s));
    expect(adicionados).toEqual(["CANCELED"]);
  });

  it("faz exatamente dois pares DROP+ADD CONSTRAINT (status_check e lifecycle_check)", () => {
    const drops = sqlSemComentarios.match(/drop constraint/gi) || [];
    const adds = sqlSemComentarios.match(/add constraint/gi) || [];
    expect(drops).toHaveLength(2);
    expect(adds).toHaveLength(2);
    expect(sqlSemComentarios).toMatch(new RegExp(`drop constraint ${STATUS_CONSTRAINT}`, "i"));
    expect(sqlSemComentarios).toMatch(new RegExp(`drop constraint ${LIFECYCLE_CONSTRAINT}`, "i"));
  });
});

describe("migration 149 — coluna canceled_at", () => {
  it("faz exatamente um ADD COLUMN canceled_at", () => {
    const addColumns = sqlSemComentarios.match(/add\s+column/gi) || [];
    expect(addColumns).toHaveLength(1);
    expect(sqlSemComentarios).toMatch(/add column canceled_at/i);
  });

  it("tipo é timestamptz", () => {
    expect(sqlSemComentarios).toMatch(/add column canceled_at\s+timestamptz/i);
  });

  it("é nullable — não usa NOT NULL", () => {
    const addColumnStmt = sqlSemComentarios.match(/add column canceled_at[^;]*;/i)[0];
    expect(addColumnStmt).toMatch(/add column canceled_at\s+timestamptz\s+null\b/i);
    expect(addColumnStmt).not.toMatch(/not null/i);
  });

  it("não tem DEFAULT", () => {
    const addColumnStmt = sqlSemComentarios.match(/add column canceled_at[^;]*;/i)[0];
    expect(addColumnStmt).not.toMatch(/default/i);
  });

  it("não faz DROP COLUMN nem ALTER COLUMN em nenhuma coluna", () => {
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+column/i);
  });

  it("postcheck valida tipo, nullable e ausência de default de canceled_at", () => {
    expect(sqlSemComentarios).toMatch(/canceled_at ausente após ALTER TABLE/i);
    expect(sqlSemComentarios).toMatch(/canceled_at deveria ser timestamptz/i);
    expect(sqlSemComentarios).toMatch(/canceled_at deveria ser nullable/i);
    expect(sqlSemComentarios).toMatch(/canceled_at não deveria ter DEFAULT/i);
  });
});

describe("migration 149 — lifecycle_check atualizada para CANCELED", () => {
  const lifecycleBody = extractLifecycleBlock(sqlSemComentarios);

  it("adiciona um branch novo para status = 'CANCELED'", () => {
    expect(lifecycleBody).toMatch(/status = 'CANCELED'/i);
  });

  it("CANCELED exige canceled_at IS NOT NULL", () => {
    const branch = extractStatusBranch(lifecycleBody, "CANCELED");
    expect(branch).toMatch(/canceled_at is not null/i);
  });

  it("CANCELED exige exclusividade: completed_at, failed_at e expired_at IS NULL", () => {
    const branch = extractStatusBranch(lifecycleBody, "CANCELED");
    expect(branch).toMatch(/completed_at is null/i);
    expect(branch).toMatch(/failed_at is null/i);
    expect(branch).toMatch(/expired_at is null/i);
  });

  it("COMPLETED exige exclusividade de completed_at (demais terminais NULL, incluindo canceled_at)", () => {
    const branch = extractStatusBranch(lifecycleBody, "COMPLETED");
    expect(branch).toMatch(/completed_at is not null/i);
    expect(branch).toMatch(/failed_at is null/i);
    expect(branch).toMatch(/expired_at is null/i);
    expect(branch).toMatch(/canceled_at is null/i);
  });

  it("FAILED exige exclusividade de failed_at (demais terminais NULL, incluindo canceled_at)", () => {
    const branch = extractStatusBranch(lifecycleBody, "FAILED");
    expect(branch).toMatch(/failed_at is not null/i);
    expect(branch).toMatch(/completed_at is null/i);
    expect(branch).toMatch(/expired_at is null/i);
    expect(branch).toMatch(/canceled_at is null/i);
  });

  it("EXPIRED exige exclusividade de expired_at (demais terminais NULL, incluindo canceled_at)", () => {
    const branch = extractStatusBranch(lifecycleBody, "EXPIRED");
    expect(branch).toMatch(/expired_at is not null/i);
    expect(branch).toMatch(/completed_at is null/i);
    expect(branch).toMatch(/failed_at is null/i);
    expect(branch).toMatch(/canceled_at is null/i);
  });

  it("IN_FLIGHT não aceita nenhum timestamp terminal, incluindo canceled_at", () => {
    const branch = extractStatusBranch(lifecycleBody, "IN_FLIGHT");
    for (const campo of TERMINAL_TIMESTAMPS) {
      expect(branch).toMatch(new RegExp(`${campo} is null`, "i"));
    }
    expect(branch).not.toMatch(/is not null/i);
  });

  it("exclusividade estrutural: cada um dos 5 branches referencia os 4 timestamps terminais", () => {
    for (const status of NEW_STATUSES) {
      const branch = extractStatusBranch(lifecycleBody, status);
      for (const campo of TERMINAL_TIMESTAMPS) {
        expect(
          branch,
          `branch de ${status} deveria referenciar ${campo}`,
        ).toMatch(new RegExp(campo, "i"));
      }
    }
  });

  it("não reaproveita failed_at, completed_at ou expired_at para representar cancelamento", () => {
    const branch = extractStatusBranch(lifecycleBody, "CANCELED");
    expect(branch).not.toMatch(/failed_at is not null/i);
    expect(branch).not.toMatch(/completed_at is not null/i);
    expect(branch).not.toMatch(/expired_at is not null/i);
  });

  it("postcheck valida a definição final literal da lifecycle_check com suporte a CANCELED", () => {
    expect(sqlSemComentarios).toContain(
      "status = ''CANCELED''::text) AND (canceled_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL)",
    );
    expect(sqlSemComentarios).toMatch(/canceled_at não participa da lifecycle_check final/i);
    expect(sqlSemComentarios).toMatch(/CANCELED não é reconhecido pela lifecycle_check final/i);
  });
});

describe("migration 149 — postcheck fail-closed", () => {
  it("possui postcheck 149 antes do COMMIT", () => {
    expect(sql).toMatch(/postcheck 149/i);
    const idxPostcheck = sql.search(/postcheck 149/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("valida constraint de status count=1, nome preservado e CANCELED presente", () => {
    expect(sqlSemComentarios).toMatch(/v_status_check_count <> 1/i);
    expect(sqlSemComentarios).toMatch(/CANCELED ausente na allowlist final/i);
  });

  it("valida constraint de lifecycle count=1, nome preservado", () => {
    expect(sqlSemComentarios).toMatch(/v_lifecycle_check_count <> 1/i);
  });

  it("valida presença de IN_FLIGHT, COMPLETED, FAILED e EXPIRED na allowlist final", () => {
    for (const status of OLD_STATUSES) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`${status} ausente na allowlist final`, "i"),
      );
    }
  });

  it("valida exatamente 5 valores permitidos (definição literal final do status_check)", () => {
    expect(sqlSemComentarios).toContain(
      "''IN_FLIGHT''::text, ''COMPLETED''::text, ''FAILED''::text, ''EXPIRED''::text, ''CANCELED''::text",
    );
  });

  it("valida que operation_type constraint não foi alterada", () => {
    const tiposOriginais = extractInList(migration141, OPERATION_TYPE_CONSTRAINT);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`${OPERATION_TYPE_CONSTRAINT} foi alterada`, "i"),
    );
    for (const tipo of tiposOriginais) {
      expect(sqlSemComentarios).toContain(`''${tipo}''::text`);
    }
  });

  it("valida que status_check e lifecycle_check permanecem constraints distintas", () => {
    expect(sqlSemComentarios).toMatch(
      /status_check e lifecycle_check não deveriam ser a mesma constraint/i,
    );
  });

  it("valida presença das demais constraints (epoch, operation_key, failure_code, timestamps, pkey)", () => {
    for (const constraint of [
      "app_maintenance_operations_epoch_check",
      "app_maintenance_operations_operation_key_check",
      "app_maintenance_operations_failure_code_check",
      "app_maintenance_operations_expires_after_started_check",
      "app_maintenance_operations_heartbeat_after_started_check",
      "app_maintenance_operations_pkey",
    ]) {
      expect(sqlSemComentarios).toContain(constraint);
    }
  });

  it("valida número total de constraints inalterado (9)", () => {
    expect(sqlSemComentarios).toMatch(/esperado 9, encontrado/i);
  });

  it("valida índices intactos em nome e quantidade (5) — nenhum índice novo", () => {
    for (const indice of [
      "app_maintenance_operations_pkey",
      "app_maintenance_operations_in_flight_expires_idx",
      "app_maintenance_operations_epoch_status_idx",
      "app_maintenance_operations_type_status_idx",
      "app_maintenance_operations_operation_key_in_flight_uidx",
    ]) {
      expect(sqlSemComentarios).toContain(indice);
    }
    expect(sqlSemComentarios).toMatch(/v_index_count <> 5/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
  });

  it("valida ausência de função e trigger criadas", () => {
    expect(sqlSemComentarios).toMatch(/to_regprocedure\('public\.app_maintenance_operation_begin\(\)'\)/i);
    expect(sqlSemComentarios).toMatch(/to_regprocedure\('public\.app_maintenance_operation_finish\(\)'\)/i);
    expect(sqlSemComentarios).toMatch(/to_regprocedure\('public\.app_maintenance_operation_cancel\(\)'\)/i);
    expect(sqlSemComentarios).toMatch(/pg_trigger[\s\S]*?not tgisinternal/i);
  });
});

describe("migration 149 — proibições explícitas de escopo", () => {
  it("não cria/derruba função", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+function/i);
  });

  it("não cria/derruba trigger", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+trigger/i);
  });

  it("não cria/derruba índice", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+index/i);
  });

  it("não faz INSERT, UPDATE, DELETE ou TRUNCATE em dados", () => {
    expect(sqlSemComentarios).not.toMatch(/^\s*insert\s+into\s+public\./im);
    expect(sqlSemComentarios).not.toMatch(/^\s*update\s+public\./im);
    expect(sqlSemComentarios).not.toMatch(/^\s*delete\s+from\s+public\./im);
    expect(sqlSemComentarios).not.toMatch(/truncate/i);
  });

  it("não faz GRANT, REVOKE ou ALTER OWNER", () => {
    expect(sqlSemComentarios).not.toMatch(/\bgrant\b/i);
    expect(sqlSemComentarios).not.toMatch(/\brevoke\b/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+owner/i);
  });

  it("não habilita/desabilita RLS nem toca ACL", () => {
    expect(sqlSemComentarios).not.toMatch(/enable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/disable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/\bacl\b/i);
  });

  it("não altera app_maintenance_state nem app_assert_business_write_allowed", () => {
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_state/i);
    expect(sqlSemComentarios).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não toca tabelas/funções de fluxo de negócio (onboarding/checkout/pedidos/fiscal/user-admin/heartbeat)", () => {
    for (const nome of [
      "tab_pedidos",
      "tab_caixas",
      "tab_dispositivos",
      "app_dispositivo_registrar",
      "app_sessao_heartbeat",
      "app_maintenance_rpc_guard_allowlist",
      "loja_fiscal_regra",
      "app_release_runs",
      "app_release_events",
    ]) {
      expect(sqlSemComentarios).not.toContain(nome);
    }
  });

  it("não implementa begin_internal, finish_internal ou cancel_internal", () => {
    expect(sqlSemComentarios).not.toMatch(/begin_internal/i);
    expect(sqlSemComentarios).not.toMatch(/finish_internal/i);
    expect(sqlSemComentarios).not.toMatch(/cancel_internal/i);
  });

  it("não modifica as migrations 141, 142 ou 148 (arquivos preservados)", () => {
    // migration142 já referencia 'CANCELED' como valor de app_maintenance_state.phase
    // (enum distinto de app_maintenance_operations.status) — não é sinal de alteração.
    expect(migration141).toMatch(/create table public\.app_maintenance_operations/i);
    expect(migration141).toMatch(
      /app_maintenance_operations_status_check\s*\n\s*check \(status in \(\s*\n\s*'IN_FLIGHT',\s*\n\s*'COMPLETED',\s*\n\s*'FAILED',\s*\n\s*'EXPIRED'\s*\n\s*\)\)/,
    );
    expect(migration142).toMatch(/create function public\.app_assert_business_write_allowed/i);
    expect(migration148).toMatch(/app_dispositivo_registrar/i);
    const arquivos141 = readdirSync("supabase/migrations").filter((f) => /^141[_.]/.test(f));
    const arquivos142 = readdirSync("supabase/migrations").filter((f) => /^142[_.]/.test(f));
    const arquivos148 = readdirSync("supabase/migrations").filter((f) => /^148[_.]/.test(f));
    expect(arquivos141).toEqual(["141_maintenance_operations.sql"]);
    expect(arquivos142).toEqual(["142_maintenance_write_assert.sql"]);
    expect(arquivos148).toEqual(["148_maintenance_rpc_guard_device_heartbeat.sql"]);
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

describe("migration 149 — semântica do status terminal CANCELED", () => {
  it("CANCELED é distinto e mutuamente exclusivo de FAILED, EXPIRED e COMPLETED na allowlist", () => {
    const statuses = extractInList(sqlSemComentarios, `add constraint ${STATUS_CONSTRAINT}`);
    const distintos = new Set(statuses);
    expect(distintos.size).toBe(statuses.length);
    expect(distintos.has("CANCELED")).toBe(true);
    expect(distintos.has("FAILED")).toBe(true);
    expect(distintos.has("EXPIRED")).toBe(true);
    expect(distintos.has("COMPLETED")).toBe(true);
  });

  it("CANCELED agora é um estado terminal utilizável (lifecycle_check foi ampliada)", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(`drop constraint ${LIFECYCLE_CONSTRAINT}`, "i"),
    );
    expect(sqlSemComentarios).toMatch(
      new RegExp(`add constraint ${LIFECYCLE_CONSTRAINT}[\\s\\S]*?status = 'CANCELED'`, "i"),
    );
  });
});
