import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/155_maintenance_fence_drain_quiescence_reconciliation.sql";
const sql154Path = "supabase/migrations/154_maintenance_fence_drain_quiescence.sql";
const sql = readFileSync(sqlPath, "utf8");
const sql154 = readFileSync(sql154Path, "utf8");

function stripComentarios(texto) {
  return texto
    .split("\n")
    .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
    .join("\n");
}

const sqlSemComentarios = stripComentarios(sql);
const sql154SemComentarios = stripComentarios(sql154);

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

const B13_FNS = [...NEW_PRIVATE_FNS, ...NEW_PUBLIC_RPCS];
const ALL_11 = [...NEW_PRIVATE_FNS, ...REPLACED_FNS, ...NEW_PUBLIC_RPCS];
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

const APPLY_DML_TABLES = [
  "app_maintenance_state",
  "app_maintenance_events",
  "app_maintenance_operations",
  "app_release_runs",
  "tab_pedidos",
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

function sqlForaDeCorpos(texto) {
  return texto.replace(/as \$\$[\s\S]*?\$\$;/gi, "as $$ $$;");
}

const COMMENT_ON_FUNCTION_RE =
  /^comment\s+on\s+function\s+public\.(\w+)\s*\(([^)]*)\)\s+is\s+'((?:[^']|'')*)'\s*;/i;

function sqlForaDeDollarQuotes(texto) {
  return sqlForaDeCorpos(texto).replace(/do\s+\$\$[\s\S]*?end\s+\$\$;/gi, "do $$ end $$;");
}

function commentsOnFunctionExecutaveis(texto) {
  const fora = sqlForaDeDollarQuotes(texto);
  const starts = [...fora.matchAll(/comment\s+on\s+function\b/gi)];
  const parsed = starts.map((start) => {
    const rest = fora.slice(start.index);
    const match = rest.match(COMMENT_ON_FUNCTION_RE);
    if (!match) {
      return {
        valid: false,
        index: start.index,
        prefix: rest.slice(0, 240),
      };
    }
    return {
      valid: true,
      name: match[1],
      args: match[2].replace(/\s+/g, " ").trim(),
      literal: match[3].replace(/''/g, "'"),
      full: match[0],
      index: start.index,
      end: start.index + match[0].length,
    };
  });
  return { fora, parsed };
}

function indiceCreateOrReplace(fora, nomeFuncao) {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nomeFuncao}\\s*\\(`, "i");
  return fora.search(re);
}

function blocoDo(texto, indice) {
  const blocos = [...texto.matchAll(/do\s+\$\$[\s\S]*?end\s+\$\$;/gi)].map((m) => m[0]);
  expect(blocos.length, "esperados exatamente 2 blocos DO (precheck e postcheck)").toBe(2);
  return blocos[indice];
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

const precheck = blocoDo(sqlSemComentarios, 0);
const postcheck = blocoDo(sqlSemComentarios, 1);
const sqlApply = sqlForaDeCorpos(sqlSemComentarios);

const statementsBegin = (sqlSemComentarios.match(/^\s*begin\s*;/gim) || []).length;
const statementsCommit = (sqlSemComentarios.match(/^\s*commit\s*;/gim) || []).length;
const statementsRollback = (sqlSemComentarios.match(/^\s*rollback\s*;/gim) || []).length;

describe("migration 155 — existência e transação", () => {
  it("arquivo 155 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^155[_.]/.test(f));
    expect(arquivos).toEqual(["155_maintenance_fence_drain_quiescence_reconciliation.sql"]);
  });

  it("é transacional com exatamente 1 BEGIN e 1 COMMIT", () => {
    expect(statementsBegin).toBe(1);
    expect(statementsCommit).toBe(1);
    expect(sqlSemComentarios).toMatch(/^\s*begin\s*;/im);
    expect(sqlSemComentarios).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável e ROLLBACK_COUNT = 0", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
    expect(statementsRollback).toBe(0);
  });

  it("não reescreve schema_migrations", () => {
    expect(sqlSemComentarios).not.toMatch(/schema_migrations/i);
  });
});

describe("migration 155 — zero mudança estrutural", () => {
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

  it("event CHECK de 17 valores não é alterado", () => {
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
  });
});

describe("migration 155 — topologia CREATE OR REPLACE", () => {
  it("contém exatamente 11 CREATE OR REPLACE FUNCTION", () => {
    const replaced = nomesCreateOrReplace(sqlSemComentarios);
    expect(replaced).toEqual(ALL_11);
    expect(replaced).toHaveLength(11);
  });

  it("zero CREATE FUNCTION nu para as 8 funções B13", () => {
    const bare = nomesCreateFunction(sqlSemComentarios);
    expect(bare).toEqual([]);
    for (const fn of B13_FNS) {
      expect(bare).not.toContain(fn);
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });

  it("não usa DROP FUNCTION para resolver assinatura", () => {
    expect(sqlSemComentarios).not.toMatch(/drop\s+function/i);
  });

  it("define exatamente 5 RPCs públicas", () => {
    const publicas = nomesCreateOrReplace(sqlSemComentarios).filter((n) =>
      NEW_PUBLIC_RPCS.includes(n),
    );
    expect(publicas).toEqual(NEW_PUBLIC_RPCS);
    expect(publicas).toHaveLength(5);
  });

  it("define exatamente 3 helpers privados", () => {
    const privadas = nomesCreateOrReplace(sqlSemComentarios).filter((n) =>
      NEW_PRIVATE_FNS.includes(n),
    );
    expect(privadas).toEqual(NEW_PRIVATE_FNS);
    expect(privadas).toHaveLength(3);
  });

  it("define exatamente 3 replacements", () => {
    const replaced = nomesCreateOrReplace(sqlSemComentarios).filter((n) =>
      REPLACED_FNS.includes(n),
    );
    expect(replaced).toEqual(REPLACED_FNS);
    expect(replaced).toHaveLength(3);
  });

  it("assinaturas canônicas das 11 funções", () => {
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_cutover_barrier_internal")).toMatch(
      /p_exclusive\s+boolean/i,
    );
    expect(
      cabecaDaFuncao(sqlSemComentarios, "app_maintenance_cutover_barrier_internal"),
    ).toMatch(/returns void/i);
    expect(
      assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_drain_in_flight_count_internal").trim(),
    ).toBe("");
    expect(
      cabecaDaFuncao(sqlSemComentarios, "app_maintenance_drain_in_flight_count_internal"),
    ).toMatch(/returns integer/i);
    expect(
      assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_operation_expire_internal").trim(),
    ).toBe("");
    expect(
      cabecaDaFuncao(sqlSemComentarios, "app_maintenance_operation_expire_internal"),
    ).toMatch(/returns void/i);
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed")).toMatch(
      /p_operation_id uuid default null/i,
    );
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed")).toMatch(
      /p_expected_operation_type text default null/i,
    );
    expect(cabecaDaFuncao(sqlSemComentarios, "app_assert_business_write_allowed")).toMatch(
      /returns void/i,
    );
    expect(
      assinaturaDaFuncao(sqlSemComentarios, "app_maintenance_operation_begin_internal"),
    ).toMatch(/p_operation_type\s+text/i);
    expect(
      cabecaDaFuncao(sqlSemComentarios, "app_maintenance_operation_begin_internal"),
    ).toMatch(/returns uuid/i);
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_checkout_begin")).toMatch(
      /p_loja_id\s+bigint/i,
    );
    expect(assinaturaDaFuncao(sqlSemComentarios, "app_checkout_begin")).toMatch(
      /p_pedido_ids\s+text\[\]/i,
    );
    expect(cabecaDaFuncao(sqlSemComentarios, "app_checkout_begin")).toMatch(/returns jsonb/i);
    for (const fn of NEW_PUBLIC_RPCS) {
      const sig = assinaturaDaFuncao(sqlSemComentarios, fn);
      expect(sig).toMatch(/p_expected_version\s+integer/i);
      expect(sig).toMatch(/p_actor_user_id\s+uuid/i);
      expect(sig).toMatch(/p_actor_email\s+text/i);
      expect(sig).toMatch(/p_reason\s+text/i);
      expect(sig).toMatch(/p_metadata\s+jsonb/i);
      expect(cabecaDaFuncao(sqlSemComentarios, fn)).toMatch(/returns void/i);
    }
  });

  it("não cria funções B14+", () => {
    const todas = nomesCreateOrReplace(sqlSemComentarios);
    for (const fn of B14_B19_FNS) {
      expect(todas).not.toContain(fn);
      expect(sqlSemComentarios).not.toMatch(new RegExp(`function\\s+public\\.${fn}\\s*\\(`, "i"));
    }
  });

  it("organiza helpers, replacements e RPCs nessa ordem", () => {
    const replaced = nomesCreateOrReplace(sqlSemComentarios);
    expect(replaced.slice(0, 3)).toEqual(NEW_PRIVATE_FNS);
    expect(replaced.slice(3, 6)).toEqual(REPLACED_FNS);
    expect(replaced.slice(6)).toEqual(NEW_PUBLIC_RPCS);
  });
});

describe("migration 155 — precheck STATE A / STATE B fail-closed", () => {
  it("precheck executável vem antes dos CREATE OR REPLACE", () => {
    const idxPrecheck = sqlSemComentarios.search(/do\s+\$\$/i);
    const idxCreate = sqlSemComentarios.search(/create\s+or\s+replace\s+function/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("cenário A (0/8) é aceito — não exige ausência nem raise quando count=0", () => {
    expect(precheck).not.toMatch(/if\s+exists\s*\([\s\S]{0,800}app_maintenance_orchestration_fence/i);
    expect(precheck).not.toMatch(/colisão/i);
    expect(precheck).not.toMatch(/if\s+v_b13_name_count\s*=\s*0\s+then\s+raise/i);
    expect(precheck).not.toMatch(/v_b13_name_count\s+is\s+not\s+distinct\s+from\s+0\s+then\s+raise/i);
    expect(precheck).toMatch(/if v_b13_name_count between 1 and 7 then/i);
    expect(precheck).toMatch(/elsif v_b13_name_count is distinct from 0 then/i);
  });

  it("cenário B (8/8 canônico) é aceito via to_regprocedure das 8 assinaturas", () => {
    expect(precheck).toMatch(/if v_b13_name_count = 8 then/i);
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_cutover_barrier_internal\(boolean\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_drain_in_flight_count_internal\(\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_operation_expire_internal\(\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_orchestration_fence\(integer, uuid, text, text, jsonb\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_orchestration_drain_start\(integer, uuid, text, text, jsonb\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_orchestration_quiesce\(integer, uuid, text, text, jsonb\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_orchestration_quiescence_probe\(integer, uuid, text, text, jsonb\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_orchestration_release_start\(integer, uuid, text, text, jsonb\)'\)/i,
    );
  });

  it("1–7 presentes é bloqueado", () => {
    expect(precheck).toMatch(/if v_b13_name_count between 1 and 7 then/i);
    expect(precheck).toMatch(/estado parcial bloqueado/i);
  });

  it("overload por nome é bloqueado", () => {
    expect(precheck).toMatch(/having count\(\*\) > 1/i);
    expect(precheck).toMatch(/overload bloqueado/i);
  });

  it("assinatura divergente no STATE B é bloqueada", () => {
    const trechoB = precheck.slice(precheck.search(/if v_b13_name_count = 8 then/i));
    expect(trechoB).toMatch(/if v_oid is null then/i);
    expect(trechoB).toMatch(/assinatura divergente/i);
    expect(trechoB).toMatch(/prorettype is distinct from/i);
  });

  it("replacement ausente ou com identidade divergente é bloqueado", () => {
    expect(precheck).toMatch(/replacement ausente/i);
    expect(precheck).toMatch(/identidade divergente/i);
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid, text\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_maintenance_operation_begin_internal\(text\)'\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\('public\.app_checkout_begin\(bigint, text\[\]\)'\)/i,
    );
  });

  it("transition_internal ausente é bloqueado", () => {
    expect(precheck).toMatch(
      /to_regprocedure\(\s*'public\.app_maintenance_orchestration_transition_internal\(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb\)'\s*\)/i,
    );
    expect(precheck).toMatch(/transition_internal ausente/i);
  });

  it("dependências 140–153 ausentes são bloqueadas", () => {
    expect(precheck).toMatch(/to_regclass\('public\.app_maintenance_state'\)/i);
    expect(precheck).toMatch(/to_regclass\('public\.app_maintenance_operations'\)/i);
    expect(precheck).toMatch(/to_regclass\('public\.app_maintenance_events'\)/i);
    expect(precheck).toMatch(/to_regclass\('public\.app_release_runs'\)/i);
    expect(precheck).toMatch(/to_regclass\('public\.tab_pedidos'\)/i);
    expect(precheck).toMatch(/migration 140 ausente/i);
    expect(precheck).toMatch(/migration 141 ausente/i);
    expect(precheck).toMatch(/migration 142/i);
    expect(precheck).toMatch(/migration 150/i);
    expect(precheck).toMatch(/migration 152/i);
    expect(precheck).toMatch(/migration 153/i);
  });

  it("event CHECK diferente de 17 valores é bloqueado", () => {
    expect(precheck).toMatch(/app_maintenance_events_event_type_check/i);
    expect(precheck).toMatch(/17 valores/i);
  });
});

describe("migration 155 — owner, SECURITY DEFINER, search_path e ACL", () => {
  it("todas as 11 funções finais usam SECURITY DEFINER, search_path=public e owner postgres", () => {
    for (const fn of ALL_11) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${fn}\\([^)]*\\) owner to postgres`, "i"),
      );
    }
  });

  it("públicas B13: REVOKE ALL de PUBLIC/anon/authenticated/service_role e GRANT EXECUTE só service_role", () => {
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

  it("privadas: REVOKE ALL sem GRANT posterior", () => {
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

  it("replacements preservam contrato, inclusive EXECUTE authenticated em app_checkout_begin", () => {
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
    expect(sqlSemComentarios).not.toMatch(
      /revoke all on function public\.app_checkout_begin\(bigint, text\[\]\) from authenticated/i,
    );
  });

  it("ownership/ACL/postcheck vêm depois das definições", () => {
    const idxLastCreate = sqlSemComentarios.lastIndexOf("create or replace function");
    const idxOwner = sqlSemComentarios.search(
      /alter function public\.app_maintenance_cutover_barrier_internal\(boolean\) owner to postgres/i,
    );
    const idxAcl = sqlSemComentarios.search(
      /revoke all on function public\.app_maintenance_cutover_barrier_internal\(boolean\) from public/i,
    );
    const idxPost = sqlSemComentarios.lastIndexOf("do $$");
    const idxCommit = sqlSemComentarios.search(/^\s*commit\s*;/im);
    expect(idxLastCreate).toBeGreaterThan(-1);
    expect(idxOwner).toBeGreaterThan(idxLastCreate);
    expect(idxAcl).toBeGreaterThan(idxOwner);
    expect(idxPost).toBeGreaterThan(idxAcl);
    expect(idxCommit).toBeGreaterThan(idxPost);
  });
});

describe("migration 155 — contratos canônicos derivados da 154", () => {
  it("cutover usa advisory xact (154, 1)", () => {
    expect(corpoBarrier).toMatch(/pg_advisory_xact_lock\(\s*154\s*,\s*1\s*\)/i);
    expect(corpoBarrier).toMatch(/pg_advisory_xact_lock_shared\(\s*154\s*,\s*1\s*\)/i);
    expect(corpoBarrier).not.toMatch(/pg_advisory_unlock/i);
  });

  it("begin é shared-first: barrier → assert → epoch → INSERT", () => {
    const idxBarrier = corpoBegin.search(/app_maintenance_cutover_barrier_internal\(\s*false\s*\)/i);
    const idxAssert = corpoBegin.search(/app_assert_business_write_allowed/i);
    const idxEpoch = corpoBegin.search(/select\s+s\.epoch\s+into\s+v_epoch/i);
    const idxInsert = corpoBegin.search(/insert\s+into\s+public\.app_maintenance_operations/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxAssert).toBeGreaterThan(idxBarrier);
    expect(idxEpoch).toBeGreaterThan(idxAssert);
    expect(idxInsert).toBeGreaterThan(idxEpoch);
  });

  it("NULL begin não usa grandfather por transaction_timestamp", () => {
    expect(corpoAssert).not.toMatch(
      /if\s+transaction_timestamp\(\)\s*<\s*v_fence_effective_at\s+then\s+return/i,
    );
    expect(corpoAssert.search(/p_operation_id is null[\s\S]{0,200}transaction_timestamp/i)).toBe(-1);
  });

  it("operação existente preserva grandfather", () => {
    expect(corpoAssert).toMatch(/p_operation_id is not null/i);
    expect(corpoAssert).toMatch(/v_op_status = 'IN_FLIGHT'/i);
    expect(corpoAssert).toMatch(/v_op_expires_at > clock_timestamp\(\)/i);
    expect(corpoAssert).toMatch(/v_op_type = p_expected_operation_type/i);
    expect(corpoAssert).toMatch(/v_op_epoch = v_epoch - 1/i);
    expect(corpoAssert).toMatch(/v_op_started_at < v_fence_effective_at/i);
  });

  it("checkout shared antes de tab_pedidos", () => {
    const idxBarrier = corpoCheckout.search(
      /app_maintenance_cutover_barrier_internal\(\s*false\s*\)/i,
    );
    const idxPedidos = corpoCheckout.search(/from\s+public\.tab_pedidos/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxPedidos).toBeGreaterThan(idxBarrier);
  });

  it("fence NEW_EPOCH com epoch +1 exatamente uma vez", () => {
    const epochIncs = sqlSemComentarios.match(/epoch\s*=\s*epoch\s*\+\s*1/gi) || [];
    expect(epochIncs).toHaveLength(1);
    expect(corpoFence).toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    expect(corpoFence).toMatch(/'NOTICE'/);
    expect(corpoFence).toMatch(/'FENCING'/);
    expect(corpoFence).toMatch(/'FENCE_STARTED'/);
    const idxEpoch = corpoFence.search(/epoch\s*=\s*epoch\s*\+\s*1/i);
    const idxTransition = corpoFence.search(new RegExp(TRANSITION_FN, "i"));
    expect(idxTransition).toBeGreaterThan(idxEpoch);
  });

  it("drain N-1/N somente IN_FLIGHT", () => {
    expect(corpoCount).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
    expect(corpoCount).toMatch(/o\.maintenance_epoch in \(\s*v_epoch\s*-\s*1\s*,\s*v_epoch\s*\)/i);
    expect(corpoDrainStart).toMatch(/'FENCING'/);
    expect(corpoDrainStart).toMatch(/'DRAINING'/);
    expect(corpoDrainStart).toMatch(/'DRAIN_STARTED'/);
  });

  it("expire somente stale IN_FLIGHT", () => {
    expect(corpoExpire).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
    expect(corpoExpire).toMatch(/o\.expires_at\s*<=\s*clock_timestamp\(\)/i);
    expect(corpoExpire).toMatch(/maintenance_epoch in \(\s*v_epoch\s*-\s*1\s*,\s*v_epoch\s*\)/i);
    expect(corpoExpire).toMatch(/status\s*=\s*'EXPIRED'/i);
  });

  it("quiesce EXPIRE < COUNT < DRAINED < TRANSITION", () => {
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

  it("probe é idempotente e não altera phase/version", () => {
    expect(corpoProbe).not.toMatch(/update\s+public\.app_maintenance_state/i);
    expect(corpoProbe).not.toMatch(new RegExp(TRANSITION_FN, "i"));
    const idxExists = corpoProbe.search(/event_type = 'QUIESCENCE_PROBE_PASSED'/i);
    const idxReturn = corpoProbe.search(/then\s+return/i);
    const idxInsert = corpoProbe.search(/insert\s+into\s+public\.app_maintenance_events/i);
    expect(idxExists).toBeGreaterThan(-1);
    expect(idxReturn).toBeGreaterThan(idxExists);
    expect(idxInsert).toBeGreaterThan(idxReturn);
  });

  it("release_start é read-only em app_release_runs", () => {
    expect(corpoReleaseStart).toMatch(/from\s+public\.app_release_runs/i);
    expect(corpoReleaseStart).toMatch(/for update/i);
    expect(corpoReleaseStart).not.toMatch(/update\s+public\.app_release_runs/i);
    expect(sqlApply).not.toMatch(/update\s+public\.app_release_runs/i);
  });
});

describe("migration 155 — zero apply-time DML", () => {
  it("não executa DML de negócio fora dos corpos de função", () => {
    for (const tabela of APPLY_DML_TABLES) {
      expect(sqlApply).not.toMatch(new RegExp(`insert\\s+into\\s+public\\.${tabela}\\b`, "i"));
      expect(sqlApply).not.toMatch(new RegExp(`update\\s+public\\.${tabela}\\b`, "i"));
      expect(sqlApply).not.toMatch(new RegExp(`delete\\s+from\\s+public\\.${tabela}\\b`, "i"));
    }
  });
});

describe("migration 155 — postcheck fail-closed", () => {
  it("valida 5 públicas, 3 privadas, 3 replacements, sem overload, ACLs, 17 events, transition, quiesce e release_start", () => {
    expect(postcheck).toMatch(/esperado exatamente 5 RPCs públicas finais/i);
    expect(postcheck).toMatch(/esperado exatamente 3 helpers privados finais/i);
    expect(postcheck).toMatch(/esperado exatamente 3 replacements finais/i);
    expect(postcheck).toMatch(/having count\(\*\) > 1/i);
    expect(postcheck).toMatch(/app_maintenance_events_event_type_check/i);
    expect(postcheck).toMatch(/transition_internal B12 não está intacto/i);
    expect(postcheck).toMatch(/EXPIRE < COUNT < DRAINED < TRANSITION/i);
    expect(postcheck).toMatch(/release_start não pode UPDATE app_release_runs/i);
    expect(postcheck).toMatch(/deveria preservar EXECUTE para authenticated/i);
    expect(postcheck).toMatch(/raise exception/i);
  });
});

describe("migration 155 — semântica 154 ↔ 155", () => {
  it("corpos finais das 11 funções batem com a migration154 canônica", () => {
    for (const fn of ALL_11) {
      expect(corpoDaFuncao(sqlSemComentarios, fn)).toBe(corpoDaFuncao(sql154SemComentarios, fn));
    }
  });

  it("migration154 permanece create function nu para as 8 B13 (não editada para or replace)", () => {
    const bare154 = nomesCreateFunction(sql154SemComentarios);
    for (const fn of B13_FNS) {
      expect(bare154).toContain(fn);
    }
    expect(nomesCreateOrReplace(sql154SemComentarios)).toEqual(REPLACED_FNS);
  });
});

describe("migration 155 — COMMENT ON FUNCTION executáveis", () => {
  const { fora, parsed } = commentsOnFunctionExecutaveis(sql);
  const { parsed: parsed154 } = commentsOnFunctionExecutaveis(sql154);
  const porNome155 = Object.fromEntries(parsed.filter((c) => c.valid).map((c) => [c.name, c]));
  const porNome154 = Object.fromEntries(parsed154.filter((c) => c.valid).map((c) => [c.name, c]));

  it("todo COMMENT ON FUNCTION possui término sintático completo", () => {
    expect(parsed.length).toBeGreaterThan(0);
    for (const comment of parsed) {
      expect(comment.valid, `COMMENT incompleto: ${comment.prefix ?? comment.name}`).toBe(true);
      expect(comment.full).toMatch(/\bis\b/i);
      expect(comment.full.trim().endsWith(";")).toBe(true);
      expect(comment.literal.length).toBeGreaterThan(0);
    }
    expect(parsed.map((c) => c.name)).toEqual(ALL_11);
  });

  it("COMMENT de quiesce fecha antes do CREATE OR REPLACE de quiescence_probe", () => {
    const quiesce = porNome155.app_maintenance_orchestration_quiesce;
    const idxProbe = indiceCreateOrReplace(fora, "app_maintenance_orchestration_quiescence_probe");
    expect(quiesce, "COMMENT de quiesce não encontrado ou inválido").toBeTruthy();
    expect(quiesce.valid).toBe(true);
    expect(idxProbe).toBeGreaterThan(-1);
    expect(quiesce.end).toBeLessThan(idxProbe);
  });

  it("COMMENT de quiescence_probe fecha antes do CREATE OR REPLACE de release_start", () => {
    const probe = porNome155.app_maintenance_orchestration_quiescence_probe;
    const idxRelease = indiceCreateOrReplace(fora, "app_maintenance_orchestration_release_start");
    expect(probe, "COMMENT de quiescence_probe não encontrado ou inválido").toBeTruthy();
    expect(probe.valid).toBe(true);
    expect(idxRelease).toBeGreaterThan(-1);
    expect(probe.end).toBeLessThan(idxRelease);
  });

  it("nenhum COMMENT aberto engloba outro CREATE OR REPLACE FUNCTION", () => {
    const creates = [
      ...fora.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi),
    ];
    expect(creates).toHaveLength(11);
    for (const comment of parsed) {
      expect(comment.valid).toBe(true);
      expect(comment.full).not.toMatch(/create\s+or\s+replace\s+function/i);
      const engolido = creates.filter((c) => c.index > comment.index && c.index < comment.end);
      expect(engolido.map((c) => c[1])).toEqual([]);
    }
    for (let i = 0; i < creates.length - 1; i += 1) {
      const between = fora.slice(creates[i].index, creates[i + 1].index);
      const internos = [...between.matchAll(/comment\s+on\s+function\b/gi)];
      for (const interno of internos) {
        const trecho = between.slice(interno.index);
        const fechado = trecho.match(COMMENT_ON_FUNCTION_RE);
        expect(fechado, "COMMENT aberto entre CREATE OR REPLACE consecutivos").toBeTruthy();
        expect(interno.index + fechado[0].length).toBeLessThanOrEqual(between.length);
      }
    }
  });

  it("COMMENTs relevantes correspondem semanticamente aos da migration154 final", () => {
    for (const fn of ALL_11) {
      expect(porNome154[fn], `COMMENT canônico ausente na 154: ${fn}`).toBeTruthy();
      expect(porNome155[fn], `COMMENT ausente na 155: ${fn}`).toBeTruthy();
      expect(porNome155[fn].literal).toBe(porNome154[fn].literal);
    }
  });
});
