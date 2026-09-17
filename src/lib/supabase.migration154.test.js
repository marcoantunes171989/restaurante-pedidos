import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/154_maintenance_fence_drain_quiescence.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration150 = readFileSync(
  "supabase/migrations/150_maintenance_operation_registry_core.sql",
  "utf8",
);
const migration152 = readFileSync(
  "supabase/migrations/152_checkout_operation_registry_integration.sql",
  "utf8",
);
const migration153 = readFileSync(
  "supabase/migrations/153_maintenance_release_orchestration_core.sql",
  "utf8",
);

const EVENT_TYPES_17 = [
  "NOTICE_STARTED",
  "NOTICE_TICK",
  "FENCE_STARTED",
  "DRAIN_STARTED",
  "OPERATION_BEGUN",
  "OPERATION_DRAINED",
  "OPERATION_EXPIRED",
  "QUIESCENCE_REACHED",
  "QUIESCENCE_PROBE_PASSED",
  "RELEASE_STARTED",
  "SMOKE_STARTED",
  "RECOVERY_STARTED",
  "MAINTENANCE_COMPLETED",
  "MAINTENANCE_ABORTED",
  "MAINTENANCE_FAILED",
  "MAINTENANCE_CANCELED",
  "ORCHESTRATION_STARTED",
];

const NEW_PUBLIC_RPCS = [
  "app_maintenance_orchestration_fence",
  "app_maintenance_orchestration_drain_start",
  "app_maintenance_orchestration_quiesce",
  "app_maintenance_orchestration_quiescence_probe",
  "app_maintenance_orchestration_release_start",
];

const NEW_PRIVATE_FNS = [
  "app_maintenance_cutover_barrier_internal",
  "app_maintenance_drain_in_flight_count_internal",
  "app_maintenance_operation_expire_internal",
];

const REPLACED_FNS = [
  "app_assert_business_write_allowed",
  "app_maintenance_operation_begin_internal",
  "app_checkout_begin",
];

const TRANSITION_FN = "app_maintenance_orchestration_transition_internal";
const PUBLIC_SIG = "integer, uuid, text, text, jsonb";
const B14_B19_FNS = [
  "app_maintenance_orchestration_notice",
  "app_maintenance_orchestration_notice_tick",
  "app_maintenance_orchestration_smoke",
  "app_maintenance_orchestration_recover",
  "app_maintenance_orchestration_success",
  "app_maintenance_orchestration_abort",
  "app_maintenance_orchestration_reopen",
  "app_maintenance_orchestration_rehearsal",
  "app_maintenance_orchestration_readiness",
];

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function cabecaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}[\\s\\S]*?as \\$\\$`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `cabeçalho de ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[0];
}

function assinaturaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `assinatura de ${nomeFuncao} não encontrada`).toBeTruthy();
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

const corpoBarrier = corpoDaFuncao(sqlSemComentarios, "app_maintenance_cutover_barrier_internal");
const corpoCount = corpoDaFuncao(sqlSemComentarios, "app_maintenance_drain_in_flight_count_internal");
const corpoExpire = corpoDaFuncao(sqlSemComentarios, "app_maintenance_operation_expire_internal");
const corpoAssert = corpoDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed");
const corpoBegin = corpoDaFuncao(sqlSemComentarios, "app_maintenance_operation_begin_internal");
const corpoCheckout = corpoDaFuncao(sqlSemComentarios, "app_checkout_begin");
const corpoFence = corpoDaFuncao(sqlSemComentarios, "app_maintenance_orchestration_fence");
const corpoDrainStart = corpoDaFuncao(sqlSemComentarios, "app_maintenance_orchestration_drain_start");
const corpoQuiesce = corpoDaFuncao(sqlSemComentarios, "app_maintenance_orchestration_quiesce");
const corpoProbe = corpoDaFuncao(sqlSemComentarios, "app_maintenance_orchestration_quiescence_probe");
const corpoReleaseStart = corpoDaFuncao(
  sqlSemComentarios,
  "app_maintenance_orchestration_release_start",
);

const statementsBegin = (sqlSemComentarios.match(/^\s*begin\s*;/gim) || []).length;
const statementsCommit = (sqlSemComentarios.match(/^\s*commit\s*;/gim) || []).length;
const statementsRollback = (sqlSemComentarios.match(/^\s*rollback\s*;/gim) || []).length;

describe("migration 154 — existência e transação", () => {
  it("arquivo 154 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^154[_.]/.test(f));
    expect(arquivos).toEqual(["154_maintenance_fence_drain_quiescence.sql"]);
  });

  it("é transacional com exatamente 1 BEGIN e 1 COMMIT", () => {
    expect(statementsBegin).toBe(1);
    expect(statementsCommit).toBe(1);
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável e ROLLBACK_COUNT = 0", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
    expect(statementsRollback).toBe(0);
  });

  it("não modifica migrations 140–153 (arquivos preservados)", () => {
    for (let n = 140; n <= 153; n += 1) {
      const arquivos = readdirSync("supabase/migrations").filter((f) =>
        new RegExp(`^${n}[_.]`).test(f),
      );
      expect(arquivos.length, `migration ${n} deveria ter exatamente 1 arquivo`).toBe(1);
    }
    expect(migration142).toMatch(/create function public\.app_assert_business_write_allowed/i);
    expect(migration150).toMatch(
      /create function public\.app_maintenance_operation_begin_internal/i,
    );
    expect(migration152).toMatch(/create function public\.app_checkout_begin/i);
    expect(migration153).toMatch(
      /create function public\.app_maintenance_orchestration_transition_internal/i,
    );
    expect(migration153).not.toMatch(/app_maintenance_cutover_barrier_internal/i);
  });
});

describe("migration 154 — zero mudança estrutural", () => {
  it("zero CREATE TABLE", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
  });

  it("zero DROP TABLE", () => {
    expect(sqlSemComentarios).not.toMatch(/drop\s+table/i);
  });

  it("zero ALTER ADD/DROP COLUMN", () => {
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
  });

  it("zero index", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+index/i);
  });

  it("zero constraint", () => {
    expect(sqlSemComentarios).not.toMatch(/add\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+constraint/i);
  });

  it("zero policy", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+policy/i);
  });

  it("zero TABLE ACL change", () => {
    expect(sqlSemComentarios).not.toMatch(/revoke\s+\w+\s+on\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/grant\s+\w+\s+on\s+table/i);
  });

  it("event check de 17 valores permanece intacto (não alterado nesta migration)", () => {
    expect(sqlSemComentarios).not.toMatch(/drop constraint app_maintenance_events_event_type_check/i);
    expect(sqlSemComentarios).not.toMatch(/add constraint app_maintenance_events_event_type_check/i);
    expect(EVENT_TYPES_17).toHaveLength(17);
    const constante = sqlSemComentarios.match(
      /v_event_type_condef constant text :=\s*'([^']*(?:''[^']*)*)'/i,
    );
    expect(constante, "constante do CHECK de 17 valores não encontrada").toBeTruthy();
    for (const tipo of EVENT_TYPES_17) {
      expect(constante[1]).toContain(tipo);
    }
    expect(migration140).toMatch(/constraint app_maintenance_events_event_type_check/i);
  });

  it("não altera app_release_runs (sem UPDATE/INSERT/DDL)", () => {
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_release_runs/i);
  });
});

describe("migration 154 — topologia exata de funções", () => {
  it("cria exatamente 5 RPCs públicas novas", () => {
    const criadas = nomesCreateFunction(sqlSemComentarios);
    const publicas = criadas.filter((n) => NEW_PUBLIC_RPCS.includes(n));
    expect(publicas).toEqual(NEW_PUBLIC_RPCS);
    expect(publicas).toHaveLength(5);
  });

  it("cria exatamente 3 helpers privadas novas", () => {
    const criadas = nomesCreateFunction(sqlSemComentarios);
    const privadas = criadas.filter((n) => NEW_PRIVATE_FNS.includes(n));
    expect(new Set(privadas)).toEqual(new Set(NEW_PRIVATE_FNS));
    expect(privadas).toHaveLength(3);
  });

  it("faz exatamente 3 CREATE OR REPLACE de funções existentes", () => {
    const replaced = nomesCreateOrReplace(sqlSemComentarios);
    expect(replaced).toEqual(REPLACED_FNS);
    expect(replaced).toHaveLength(3);
  });

  it("não cria pública genérica (advance/next/set_state/transition)", () => {
    const todas = [...nomesCreateFunction(sqlSemComentarios), ...nomesCreateOrReplace(sqlSemComentarios)];
    for (const proibido of ["advance", "next", "set_state"]) {
      expect(todas.some((nome) => nome.toLowerCase().includes(proibido))).toBe(false);
    }
    expect(todas).not.toContain("app_maintenance_orchestration_transition");
    for (const fn of NEW_PUBLIC_RPCS) {
      expect(assinaturaDaFuncao(sqlSemComentarios, fn)).not.toMatch(/p_to_phase/i);
    }
  });

  it("não cria funções B14–B19", () => {
    const todas = [...nomesCreateFunction(sqlSemComentarios), ...nomesCreateOrReplace(sqlSemComentarios)];
    for (const fn of B14_B19_FNS) {
      expect(todas).not.toContain(fn);
      expect(sqlSemComentarios).not.toMatch(new RegExp(`function\\s+public\\.${fn}\\s*\\(`, "i"));
    }
  });
});

describe("migration 154 — cutover barrier", () => {
  it("usa advisory key fixa (154, 1) e não deixa a chave caller-controlled", () => {
    expect(corpoBarrier).toMatch(/pg_advisory_xact_lock\(\s*154\s*,\s*1\s*\)/i);
    expect(corpoBarrier).toMatch(/pg_advisory_xact_lock_shared\(\s*154\s*,\s*1\s*\)/i);
    expect(corpoBarrier).not.toMatch(/pg_advisory_lock\s*\(/i);
    expect(corpoBarrier).not.toMatch(/pg_advisory_unlock/i);
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_cutover_barrier_internal")).toMatch(
      /p_exclusive\s+boolean/i,
    );
    expect(corpoBarrier).not.toMatch(/pg_advisory_xact_lock\(\s*p_/i);
  });

  it("exclusive usa lock exclusivo; shared usa lock_shared", () => {
    const idxExclusive = corpoBarrier.search(/p_exclusive is true/i);
    const idxExclusiveLock = corpoBarrier.search(/pg_advisory_xact_lock\(\s*154\s*,\s*1\s*\)/i);
    const idxShared = corpoBarrier.search(/p_exclusive is false/i);
    const idxSharedLock = corpoBarrier.search(/pg_advisory_xact_lock_shared\(\s*154\s*,\s*1\s*\)/i);
    expect(idxExclusive).toBeGreaterThan(-1);
    expect(idxExclusiveLock).toBeGreaterThan(idxExclusive);
    expect(idxShared).toBeGreaterThan(-1);
    expect(idxSharedLock).toBeGreaterThan(idxShared);
  });
});

describe("migration 154 — begin_internal shared-first", () => {
  it("begin shared ANTES do assert/epoch/insert", () => {
    const idxBarrier = corpoBegin.search(
      /app_maintenance_cutover_barrier_internal\(\s*false\s*\)/i,
    );
    const idxAssert = corpoBegin.search(/app_assert_business_write_allowed/i);
    const idxEpoch = corpoBegin.search(/select\s+s\.epoch\s+into\s+v_epoch/i);
    const idxInsert = corpoBegin.search(/insert\s+into\s+public\.app_maintenance_operations/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxAssert).toBeGreaterThan(idxBarrier);
    expect(idxEpoch).toBeGreaterThan(idxAssert);
    expect(idxInsert).toBeGreaterThan(idxEpoch);
  });

  it("begin não usa barrier exclusive e não captura MAINTENANCE_FENCE_ACTIVE", () => {
    expect(corpoBegin).not.toMatch(/app_maintenance_cutover_barrier_internal\(\s*true\s*\)/i);
    expect(corpoBegin).not.toMatch(/exception\s+when/i);
    expect(corpoBegin).not.toMatch(/MAINTENANCE_FENCE_ACTIVE/i);
  });

  it("preserva assinatura (text) returns uuid", () => {
    expect(cabecaDaFuncao(sqlSemComentarios, "app_maintenance_operation_begin_internal")).toMatch(
      /returns uuid/i,
    );
    expect(
      assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_operation_begin_internal"),
    ).toMatch(/p_operation_type\s+text/i);
  });
});

describe("migration 154 — assert grandfather", () => {
  it("NULL operation_id não usa transaction_timestamp grandfather", () => {
    expect(corpoAssert).not.toMatch(
      /if\s+transaction_timestamp\(\)\s*<\s*v_fence_effective_at\s+then\s+return/i,
    );
    const idxNullBypass = corpoAssert.search(/p_operation_id is null[\s\S]{0,200}transaction_timestamp/i);
    expect(idxNullBypass).toBe(-1);
    expect(corpoAssert).toMatch(/'NORMAL'/);
    expect(corpoAssert).toMatch(/'NOTICE'/);
    expect(corpoAssert).toMatch(/'CANCELED'/);
  });

  it("existing operation grandfather preservado", () => {
    expect(corpoAssert).toMatch(/p_operation_id is not null/i);
    expect(corpoAssert).toMatch(/v_op_status = 'IN_FLIGHT'/i);
    expect(corpoAssert).toMatch(/v_op_expires_at > clock_timestamp\(\)/i);
    expect(corpoAssert).toMatch(/v_op_type = p_expected_operation_type/i);
    expect(corpoAssert).toMatch(/v_op_epoch = v_epoch - 1/i);
    expect(corpoAssert).toMatch(/v_op_started_at < v_fence_effective_at/i);
  });

  it("preserva assinatura (uuid, text) returns void com defaults", () => {
    const cabeca = cabecaDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed");
    expect(cabeca).toMatch(/p_operation_id uuid default null/i);
    expect(cabeca).toMatch(/p_expected_operation_type text default null/i);
    expect(cabeca).toMatch(/returns void/i);
  });
});

describe("migration 154 — checkout shared antes de tab_pedidos", () => {
  it("checkout shared ANTES de tab_pedidos", () => {
    const idxBarrier = corpoCheckout.search(
      /app_maintenance_cutover_barrier_internal\(\s*false\s*\)/i,
    );
    const idxPedidos = corpoCheckout.search(/from\s+public\.tab_pedidos/i);
    const idxOps = corpoCheckout.search(/from\s+public\.app_maintenance_operations/i);
    const idxBegin = corpoCheckout.search(/app_maintenance_operation_begin_internal/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxPedidos).toBeGreaterThan(idxBarrier);
    expect(idxOps).toBeGreaterThan(idxPedidos);
    expect(idxBegin).toBeGreaterThan(idxOps);
  });

  it("não altera commit/fail/cancel de checkout nesta migration", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_checkout_commit/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_checkout_fail/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_checkout_cancel/i,
    );
  });
});

describe("migration 154 — fence exclusive e epoch", () => {
  it("fence exclusive", () => {
    const idxBarrier = corpoFence.search(
      /app_maintenance_cutover_barrier_internal\(\s*true\s*\)/i,
    );
    const idxState = corpoFence.search(/from\s+public\.app_maintenance_state/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxState).toBeGreaterThan(idxBarrier);
    expect(corpoFence).not.toMatch(/app_maintenance_cutover_barrier_internal\(\s*false\s*\)/i);
  });

  it("fence epoch+1 exatamente uma vez e aux update não version+1", () => {
    const epochIncs = sqlSemComentarios.match(/epoch\s*=\s*epoch\s*\+\s*1/gi) || [];
    expect(epochIncs).toHaveLength(1);
    expect(corpoFence).toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    expect(corpoFence).toMatch(/fence_effective_at\s*=\s*clock_timestamp\(\)/i);
    const aux = corpoFence.match(
      /update\s+public\.app_maintenance_state[\s\S]*?where scope = 'global';/i,
    );
    expect(aux, "UPDATE auxiliar do fence não encontrado").toBeTruthy();
    expect(aux[0]).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(aux[0]).not.toMatch(/phase\s*=/i);
    expect(aux[0]).not.toMatch(/release_id\s*=/i);
    expect(aux[0]).not.toMatch(/target_sha\s*=/i);
  });

  it("FENCE_STARTED depois do epoch update e usa NEW_EPOCH via transition_internal", () => {
    const idxEpoch = corpoFence.search(/epoch\s*=\s*epoch\s*\+\s*1/i);
    const idxTransition = corpoFence.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxTransition).toBeGreaterThan(idxEpoch);
    expect(corpoFence).toMatch(/'NOTICE'/);
    expect(corpoFence).toMatch(/'FENCING'/);
    expect(corpoFence).toMatch(/'FENCE_STARTED'/);
    expect(corpoFence).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
  });
});

describe("migration 154 — drain_start edge correta", () => {
  it("drain_start faz FENCING -> DRAINING via transition_internal e seta drain_started_at sem version+1", () => {
    expect(corpoDrainStart).toMatch(/app_maintenance_cutover_barrier_internal\(\s*true\s*\)/i);
    expect(corpoDrainStart).toMatch(/'FENCING'/);
    expect(corpoDrainStart).toMatch(/'DRAINING'/);
    expect(corpoDrainStart).toMatch(/'DRAIN_STARTED'/);
    expect(corpoDrainStart).toMatch(new RegExp(TRANSITION_FN, "i"));
    const idxTransition = corpoDrainStart.search(new RegExp(TRANSITION_FN, "i"));
    const idxDrainAt = corpoDrainStart.search(/drain_started_at\s*=/i);
    expect(idxDrainAt).toBeGreaterThan(idxTransition);
    const aux = corpoDrainStart.match(
      /update\s+public\.app_maintenance_state[\s\S]*?where scope = 'global';/i,
    );
    expect(aux, "UPDATE auxiliar drain_started_at não encontrado").toBeTruthy();
    expect(aux[0]).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(corpoDrainStart).not.toMatch(/drain_in_flight_count_internal/i);
  });
});

describe("migration 154 — drain count e expire", () => {
  it("count somente IN_FLIGHT e N-1/N", () => {
    expect(corpoCount).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
    expect(corpoCount).toMatch(/o\.maintenance_epoch in \(\s*v_epoch\s*-\s*1\s*,\s*v_epoch\s*\)/i);
    expect(corpoCount).not.toMatch(/'COMPLETED'/);
    expect(corpoCount).not.toMatch(/'FAILED'/);
    expect(corpoCount).not.toMatch(/'EXPIRED'/);
    expect(corpoCount).not.toMatch(/'CANCELED'/);
  });

  it("expire somente stale IN_FLIGHT", () => {
    expect(corpoExpire).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
    expect(corpoExpire).toMatch(/o\.expires_at\s*<=\s*clock_timestamp\(\)/i);
    expect(corpoExpire).toMatch(/maintenance_epoch in \(\s*v_epoch\s*-\s*1\s*,\s*v_epoch\s*\)/i);
    expect(corpoExpire).toMatch(/order by o\.id asc/i);
    expect(corpoExpire).toMatch(/for update/i);
    expect(corpoExpire).toMatch(/status\s*=\s*'EXPIRED'/i);
    expect(corpoExpire).toMatch(/expired_at\s*=/i);
  });

  it("OPERATION_EXPIRED é idempotente (1 evento por row atualizada, 0 rows = 0 eventos)", () => {
    expect(corpoExpire).toMatch(/'OPERATION_EXPIRED'/);
    expect(corpoExpire).toMatch(/'ticker'/);
    expect(corpoExpire).toMatch(/jsonb_build_object\(\s*'operation_id'\s*,\s*v_id\s*\)/i);
    expect(corpoExpire).toMatch(/v_row_count = 1/i);
    expect(corpoExpire).toMatch(/maintenance_epoch[\s\S]*v_epoch/i);
  });
});

describe("migration 154 — OPERATION_DRAINED e quiesce", () => {
  it("OPERATION_DRAINED exclui histórico pré-fence e EXPIRED", () => {
    expect(corpoQuiesce).toMatch(/'OPERATION_DRAINED'/);
    expect(corpoQuiesce).toMatch(/o\.status in \(\s*'COMPLETED'\s*,\s*'FAILED'\s*,\s*'CANCELED'\s*\)/i);
    expect(corpoQuiesce).toMatch(
      /coalesce\(\s*o\.completed_at\s*,\s*o\.failed_at\s*,\s*o\.canceled_at\s*\)\s*>=\s*v_fence_effective_at/i,
    );
    expect(corpoQuiesce).toMatch(/o\.maintenance_epoch in \(\s*v_epoch\s*-\s*1\s*,\s*v_epoch\s*\)/i);
    expect(corpoQuiesce).toMatch(/metadata->>'operation_id'/i);
    expect(corpoQuiesce).not.toMatch(/o\.status in \([^)]*'EXPIRED'/i);
  });

  it("quiesce count zero antes da edge", () => {
    const idxExpire = corpoQuiesce.search(/app_maintenance_operation_expire_internal/i);
    const idxCount = corpoQuiesce.search(/app_maintenance_drain_in_flight_count_internal/i);
    const idxCountConflict = corpoQuiesce.search(/v_count is distinct from 0/i);
    const idxDrainedInsert = corpoQuiesce.search(
      /insert\s+into\s+public\.app_maintenance_events[\s\S]*?'OPERATION_DRAINED'/i,
    );
    const idxTransition = corpoQuiesce.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxExpire).toBeGreaterThan(-1);
    expect(idxCount).toBeGreaterThan(idxExpire);
    expect(idxCountConflict).toBeGreaterThan(idxCount);
    expect(idxDrainedInsert).toBeGreaterThan(idxCountConflict);
    expect(idxTransition).toBeGreaterThan(idxDrainedInsert);
    expect(corpoQuiesce).toMatch(/'DRAINING'/);
    expect(corpoQuiesce).toMatch(/'QUIESCENT'/);
    expect(corpoQuiesce).toMatch(/'QUIESCENCE_REACHED'/);
    const aux = corpoQuiesce.match(
      /update\s+public\.app_maintenance_state[\s\S]*?where scope = 'global';/i,
    );
    expect(aux, "UPDATE auxiliar quiet_since/quiescent_at não encontrado").toBeTruthy();
    expect(aux[0]).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(aux[0]).toMatch(/quiet_since/i);
    expect(aux[0]).toMatch(/quiescent_at/i);
  });

  it("expire aparece antes do count no corpo executável de quiesce", () => {
    const idxExpire = corpoQuiesce.search(/app_maintenance_operation_expire_internal/i);
    const idxCount = corpoQuiesce.search(/app_maintenance_drain_in_flight_count_internal/i);
    expect(idxExpire).toBeGreaterThan(-1);
    expect(idxCount).toBeGreaterThan(idxExpire);
  });

  it("count aparece antes do INSERT de OPERATION_DRAINED no corpo executável de quiesce", () => {
    const idxCount = corpoQuiesce.search(/app_maintenance_drain_in_flight_count_internal/i);
    const idxDrainedInsert = corpoQuiesce.search(
      /insert\s+into\s+public\.app_maintenance_events[\s\S]*?'OPERATION_DRAINED'/i,
    );
    expect(idxCount).toBeGreaterThan(-1);
    expect(idxDrainedInsert).toBeGreaterThan(idxCount);
  });

  it("OPERATION_DRAINED aparece antes de transition_internal no corpo executável de quiesce", () => {
    const idxDrainedInsert = corpoQuiesce.search(
      /insert\s+into\s+public\.app_maintenance_events[\s\S]*?'OPERATION_DRAINED'/i,
    );
    const idxTransition = corpoQuiesce.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxDrainedInsert).toBeGreaterThan(-1);
    expect(idxTransition).toBeGreaterThan(idxDrainedInsert);
  });

  it("ordem total executável do quiesce é EXPIRE < COUNT < DRAINED < TRANSITION", () => {
    const idxExpire = corpoQuiesce.search(/app_maintenance_operation_expire_internal/i);
    const idxCount = corpoQuiesce.search(/app_maintenance_drain_in_flight_count_internal/i);
    const idxDrainedInsert = corpoQuiesce.search(
      /insert\s+into\s+public\.app_maintenance_events[\s\S]*?'OPERATION_DRAINED'/i,
    );
    const idxTransition = corpoQuiesce.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxExpire).toBeGreaterThan(-1);
    expect(idxCount).toBeGreaterThan(idxExpire);
    expect(idxDrainedInsert).toBeGreaterThan(idxCount);
    expect(idxTransition).toBeGreaterThan(idxDrainedInsert);
  });

  it("OPERATION_DRAINED scan BEFORE count é proibido (OPERATION_DRAINED_TERMINALIZATION_RACE)", () => {
    const idxCount = corpoQuiesce.search(/app_maintenance_drain_in_flight_count_internal/i);
    const idxDrainedInsert = corpoQuiesce.search(
      /insert\s+into\s+public\.app_maintenance_events[\s\S]*?'OPERATION_DRAINED'/i,
    );
    expect(idxCount).toBeGreaterThan(-1);
    expect(idxDrainedInsert).toBeGreaterThan(idxCount);
    const prefixUntilCount = corpoQuiesce.slice(0, idxCount);
    expect(prefixUntilCount).not.toMatch(/'OPERATION_DRAINED'/);
    expect(prefixUntilCount).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
  });
});

describe("migration 154 — probe", () => {
  it("probe não altera phase/version", () => {
    expect(corpoProbe).not.toMatch(/update\s+public\.app_maintenance_state/i);
    expect(corpoProbe).not.toMatch(new RegExp(TRANSITION_FN, "i"));
    expect(corpoProbe).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(corpoProbe).not.toMatch(/phase\s*=/i);
    expect(corpoProbe).not.toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    expect(corpoProbe).toMatch(/'QUIESCENT'/);
    expect(corpoProbe).toMatch(/'QUIESCENCE_PROBE_PASSED'/);
    expect(corpoProbe).toMatch(/'probe'/);
  });

  it("probe é idempotente", () => {
    const idxExists = corpoProbe.search(/event_type = 'QUIESCENCE_PROBE_PASSED'/i);
    const idxReturn = corpoProbe.search(/then\s+return/i);
    const idxInsert = corpoProbe.search(/insert\s+into\s+public\.app_maintenance_events/i);
    expect(idxExists).toBeGreaterThan(-1);
    expect(idxReturn).toBeGreaterThan(idxExists);
    expect(idxInsert).toBeGreaterThan(idxReturn);
  });
});

describe("migration 154 — release_start", () => {
  it("release_start exige probe e zero count", () => {
    const idxCount = corpoReleaseStart.search(/app_maintenance_drain_in_flight_count_internal/i);
    const idxProbe = corpoReleaseStart.search(/'QUIESCENCE_PROBE_PASSED'/);
    const idxTransition = corpoReleaseStart.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxCount).toBeGreaterThan(-1);
    expect(idxProbe).toBeGreaterThan(idxCount);
    expect(idxTransition).toBeGreaterThan(idxProbe);
    expect(corpoReleaseStart).toMatch(/v_count is distinct from 0/i);
  });

  it("release status active e target_sha match", () => {
    expect(corpoReleaseStart).toMatch(/'REQUESTED'/);
    expect(corpoReleaseStart).toMatch(/'SCHEDULED'/);
    expect(corpoReleaseStart).toMatch(/'WAITING'/);
    expect(corpoReleaseStart).toMatch(/'VALIDATING'/);
    expect(corpoReleaseStart).toMatch(/'DISPATCHED'/);
    expect(corpoReleaseStart).toMatch(/'RUNNING'/);
    expect(corpoReleaseStart).toMatch(/v_release_target_sha is distinct from v_target_sha/i);
    expect(corpoReleaseStart).toMatch(/'QUIESCENT'/);
    expect(corpoReleaseStart).toMatch(/'RELEASING'/);
    expect(corpoReleaseStart).toMatch(/'RELEASE_STARTED'/);
  });

  it("release row não sofre UPDATE", () => {
    expect(corpoReleaseStart).toMatch(/from\s+public\.app_release_runs/i);
    expect(corpoReleaseStart).toMatch(/for update/i);
    expect(corpoReleaseStart).not.toMatch(/update\s+public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_runs/i);
  });
});

describe("migration 154 — quatro edges via transition_internal", () => {
  it("NOTICE->FENCING, FENCING->DRAINING, DRAINING->QUIESCENT, QUIESCENT->RELEASING passam por transition_internal", () => {
    expect(corpoFence).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(corpoDrainStart).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(corpoQuiesce).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(corpoReleaseStart).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(corpoFence).toMatch(/'NOTICE'[\s\S]*'FENCING'[\s\S]*'FENCE_STARTED'/i);
    expect(corpoDrainStart).toMatch(/'FENCING'[\s\S]*'DRAINING'[\s\S]*'DRAIN_STARTED'/i);
    expect(corpoQuiesce).toMatch(/'DRAINING'[\s\S]*'QUIESCENT'[\s\S]*'QUIESCENCE_REACHED'/i);
    expect(corpoReleaseStart).toMatch(/'QUIESCENT'[\s\S]*'RELEASING'[\s\S]*'RELEASE_STARTED'/i);
  });

  it("não cria nova edge nem self-edge estrutural e não edita a matriz da 153", () => {
    expect(sqlSemComentarios).not.toMatch(/from \(values/i);
    expect(migration153).toMatch(/\('NOTICE',\s*'FENCING'\)/i);
    expect(migration153).toMatch(/\('FENCING',\s*'DRAINING'\)/i);
    expect(migration153).toMatch(/\('DRAINING',\s*'QUIESCENT'\)/i);
    expect(migration153).toMatch(/\('QUIESCENT',\s*'RELEASING'\)/i);
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_maintenance_orchestration_transition_internal/i,
    );
  });

  it("binding não é alterado pelos wrappers B13", () => {
    for (const corpo of [corpoFence, corpoDrainStart, corpoQuiesce, corpoProbe, corpoReleaseStart]) {
      expect(corpo).not.toMatch(/release_id\s*=\s*p_/i);
      expect(corpo).not.toMatch(/target_sha\s*=\s*p_/i);
      expect(corpo).not.toMatch(/release_id\s*=\s*null/i);
      expect(corpo).not.toMatch(/target_sha\s*=\s*null/i);
    }
  });
});

describe("migration 154 — ACL e SECURITY DEFINER", () => {
  it("novas públicas: REVOKE ALL e GRANT EXECUTE somente service_role", () => {
    for (const fn of NEW_PUBLIC_RPCS) {
      const sig = `${fn}\\(${PUBLIC_SIG}\\)`;
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${sig} from ${role}`, "i"),
        );
      }
      expect(sqlSemComentarios).toMatch(
        new RegExp(`grant execute on function public\\.${sig} to service_role`, "i"),
      );
    }
  });

  it("novas privadas: REVOKE ALL sem GRANT posterior", () => {
    const privSigs = [
      "app_maintenance_cutover_barrier_internal\\(boolean\\)",
      "app_maintenance_drain_in_flight_count_internal\\(\\)",
      "app_maintenance_operation_expire_internal\\(\\)",
    ];
    for (const fn of privSigs) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${fn} from ${role}`, "i"),
        );
      }
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}`, "i"),
      );
    }
  });

  it("funções replaced preservam ACL contratual anterior", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(
          `revoke all on function public\\.app_assert_business_write_allowed\\(uuid, text\\) from ${role}`,
          "i",
        ),
      );
      expect(sqlSemComentarios).toMatch(
        new RegExp(
          `revoke all on function public\\.app_maintenance_operation_begin_internal\\(text\\) from ${role}`,
          "i",
        ),
      );
    }
    expect(sqlSemComentarios).not.toMatch(
      /grant execute on function public\.app_assert_business_write_allowed/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /grant execute on function public\.app_maintenance_operation_begin_internal/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_checkout_begin\(bigint, text\[\]\) from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_checkout_begin\(bigint, text\[\]\) from anon/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_checkout_begin\(bigint, text\[\]\) from service_role/i,
    );
    expect(sqlSemComentarios).toMatch(
      /grant execute on function public\.app_checkout_begin\(bigint, text\[\]\) to authenticated/i,
    );
  });

  it("todas as funções novas/replaced usam SECURITY DEFINER, search_path=public e owner postgres", () => {
    const todas = [...NEW_PUBLIC_RPCS, ...NEW_PRIVATE_FNS, ...REPLACED_FNS];
    for (const fn of todas) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${fn}\\([^)]*\\) owner to postgres`, "i"),
      );
    }
  });
});

describe("migration 154 — finish/cancel/commit não adquirem cutover advisory", () => {
  it("não redefine finish/cancel e wrappers B13 de operação existente não tomam a barreira", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_maintenance_operation_finish_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.app_maintenance_operation_cancel_internal/i,
    );
    expect(migration150).not.toMatch(/app_maintenance_cutover_barrier_internal/i);
    expect(migration152).not.toMatch(/app_maintenance_cutover_barrier_internal/i);
  });
});

describe("migration 154 — precheck/postcheck fail-closed", () => {
  it("possui precheck 154 antes dos CREATE FUNCTION", () => {
    const idxPrecheck = sql.search(/precheck 154/i);
    const idxCreate = sql.search(/create function public\.app_maintenance_cutover_barrier_internal/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("possui postcheck 154 antes do COMMIT", () => {
    const idxPostcheck = sql.search(/postcheck 154/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });
});

describe("migration 154 — proibições de escopo", () => {
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
