import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/159_maintenance_abort_reopen_orchestration.sql";
const behaviorPath = "supabase/tests/159_maintenance_abort_reopen_orchestration.behavior.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");
const behavior = readFileSync(behaviorPath, "utf8");
const behaviorSemComentarios = behavior
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration153 = readFileSync(
  "supabase/migrations/153_maintenance_release_orchestration_core.sql",
  "utf8",
);
const migration153SemComentarios = migration153
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

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

const EVENT_TYPES_18 = [...EVENT_TYPES_17, "MAINTENANCE_REOPENED"];

const STRUCTURAL_EDGES = [
  ["NORMAL", "NOTICE"],
  ["NOTICE", "FENCING"],
  ["FENCING", "DRAINING"],
  ["DRAINING", "QUIESCENT"],
  ["QUIESCENT", "RELEASING"],
  ["RELEASING", "SMOKE"],
  ["SMOKE", "NORMAL"],
  ["SMOKE", "RECOVERING"],
  ["RECOVERING", "FAILED"],
  ["RELEASING", "ABORTING"],
  ["ABORTING", "FAILED"],
  ["FENCING", "FAILED"],
  ["DRAINING", "FAILED"],
  ["NORMAL", "CANCELED"],
  ["NOTICE", "CANCELED"],
  ["QUIESCENT", "FAILED"],
];

const TRANSITION_FN = "app_maintenance_orchestration_transition_internal";
const GUARD_FN = "app_maintenance_orchestration_binding_guard";
const BARRIER_FN = "app_maintenance_cutover_barrier_internal";
const FAIL_FN = "app_maintenance_orchestration_fail";
const SUCCESS_FN = "app_maintenance_orchestration_success";
const WRITE_ASSERT_FN = "app_assert_business_write_allowed";
const ABORT_FN = "app_maintenance_orchestration_abort";
const REOPEN_FN = "app_maintenance_orchestration_reopen";
const ABORT_SIG = "integer, uuid, text, text, jsonb";
const REOPEN_SIG = "text, integer, uuid, text, text, jsonb";
const CORE_INTOCADO = [TRANSITION_FN, GUARD_FN, FAIL_FN, SUCCESS_FN, WRITE_ASSERT_FN];

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function blocoCompletoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$[\\s\\S]*?\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `bloco completo da função ${nomeFuncao} não encontrado`).toBeTruthy();
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

function cabecaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}[\\s\\S]*?as \\$\\$`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `cabeçalho de ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[0];
}

function listaArgs(argsTexto) {
  return argsTexto
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

function performTransitionAll(corpo) {
  return [...corpo.matchAll(new RegExp(`perform\\s+public\\.${TRANSITION_FN}\\s*\\(([\\s\\S]*?)\\)\\s*;`, "gi"))].map(
    (m) => listaArgs(m[1]),
  );
}

function nomesCreateFunction(texto) {
  return [...texto.matchAll(/create\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]);
}

function nomesCreateOrReplace(texto) {
  return [...texto.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map(
    (m) => m[1],
  );
}

function updateAuxiliar(corpo) {
  const match = corpo.match(
    /update\s+public\.app_maintenance_state\s+set([\s\S]*?)where scope = 'global';/i,
  );
  expect(match, "UPDATE auxiliar de timestamp não encontrado").toBeTruthy();
  return match[1];
}

function contarDmlAppReleaseRuns(texto, verbo) {
  const padroes = {
    update: /\bupdate\s+(?:only\s+)?(?:public\.)?app_release_runs\b/gi,
    insert: /\binsert\s+into\s+(?:public\.)?app_release_runs\b/gi,
    delete: /\bdelete\s+from\s+(?:public\.)?app_release_runs\b/gi,
  };
  return [...texto.matchAll(padroes[verbo])].length;
}

function blocoDo(texto, indice) {
  const blocos = [...texto.matchAll(/do\s+\$\$[\s\S]*?end\s+\$\$;/gi)].map((m) => m[0]);
  expect(blocos.length, "esperados exatamente 2 blocos DO (precheck e postcheck)").toBe(2);
  return blocos[indice];
}

function statementsTopLevelBehavior(texto) {
  return texto.replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, "$$ $$");
}

const corpoAbort = corpoDaFuncao(sqlSemComentarios, ABORT_FN);
const corpoReopen = corpoDaFuncao(sqlSemComentarios, REOPEN_FN);
const blocoAbort = blocoCompletoDaFuncao(sqlSemComentarios, ABORT_FN);
const blocoReopen = blocoCompletoDaFuncao(sqlSemComentarios, REOPEN_FN);
const hopsAbort = performTransitionAll(corpoAbort);
const hopsReopen = performTransitionAll(corpoReopen);
const precheck = blocoDo(sqlSemComentarios, 0);
const postcheck = blocoDo(sqlSemComentarios, 1);
const corpoTransition153 = corpoDaFuncao(migration153SemComentarios, TRANSITION_FN);
const foraDasFuncoes = sqlSemComentarios.replace(blocoAbort, "").replace(blocoReopen, "");
const behaviorTopLevel = statementsTopLevelBehavior(behaviorSemComentarios);
const plpgsqlBodies = [...behavior.matchAll(/\$[a-zA-Z0-9_]*\$([\s\S]*?)\$[a-zA-Z0-9_]*\$/g)].map(
  (m) => m[1],
);

describe("migration 159 — existência e transação", () => {
  it("migration159 existe, é legível e é única", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^159[_.]/.test(f));
    expect(arquivos).toEqual(["159_maintenance_abort_reopen_orchestration.sql"]);
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

describe("migration 159 — abort e reopen existem exatamente uma vez", () => {
  it("abort RPC existe exatamente uma vez", () => {
    expect(nomesCreateFunction(sqlSemComentarios).filter((n) => n === ABORT_FN)).toEqual([ABORT_FN]);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`create\\s+function\\s+public\\.${ABORT_FN}\\s*\\(`, "i"),
    );
    expect(postcheck).toMatch(/esperado exatamente 1 função %, zero overload/i);
  });

  it("reopen RPC existe exatamente uma vez", () => {
    expect(nomesCreateFunction(sqlSemComentarios).filter((n) => n === REOPEN_FN)).toEqual([
      REOPEN_FN,
    ]);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`create\\s+function\\s+public\\.${REOPEN_FN}\\s*\\(`, "i"),
    );
  });

  it("cria somente abort e reopen, sem CREATE OR REPLACE", () => {
    expect(nomesCreateFunction(sqlSemComentarios)).toEqual([ABORT_FN, REOPEN_FN]);
    expect(nomesCreateOrReplace(sqlSemComentarios)).toEqual([]);
  });
});

describe("migration 159 — signatures, SECURITY DEFINER e ACL", () => {
  it("signatures corretas", () => {
    const tiposAbort = [...assinaturaDaFuncao(sqlSemComentarios, ABORT_FN).matchAll(/p_(\w+)\s+(\w+)/gi)].map(
      (m) => [m[1].toLowerCase(), m[2].toLowerCase()],
    );
    expect(tiposAbort).toEqual([
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["metadata", "jsonb"],
    ]);
    expect(cabecaDaFuncao(sqlSemComentarios, ABORT_FN)).toMatch(/returns\s+void/i);
    expect(sqlSemComentarios).toContain(`${ABORT_FN}(${ABORT_SIG})`);

    const tiposReopen = [
      ...assinaturaDaFuncao(sqlSemComentarios, REOPEN_FN).matchAll(/p_(\w+)\s+(\w+)/gi),
    ].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]);
    expect(tiposReopen).toEqual([
      ["expected_phase", "text"],
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["metadata", "jsonb"],
    ]);
    expect(cabecaDaFuncao(sqlSemComentarios, REOPEN_FN)).toMatch(/returns\s+void/i);
    expect(sqlSemComentarios).toContain(`${REOPEN_FN}(${REOPEN_SIG})`);
  });

  it("SECURITY DEFINER e search_path=public", () => {
    for (const fn of [ABORT_FN, REOPEN_FN]) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
    }
  });

  it("owner/grants/revokes corretos", () => {
    const sigs = [`${ABORT_FN}\\(${ABORT_SIG}\\)`, `${REOPEN_FN}\\(${REOPEN_SIG}\\)`];
    for (const sig of sigs) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${sig} owner to postgres`, "i"),
      );
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
});

describe("migration 159 — abort RELEASING -> ABORTING -> FAILED", () => {
  it("abort usa barrier exclusive", () => {
    expect(corpoAbort).toMatch(new RegExp(`${BARRIER_FN}\\(\\s*true\\s*\\)`, "i"));
    const idxBarrier = corpoAbort.search(new RegExp(`${BARRIER_FN}\\(\\s*true\\s*\\)`, "i"));
    const idxFirstHop = corpoAbort.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxFirstHop).toBeGreaterThan(idxBarrier);
  });

  it("abort RELEASING -> ABORTING", () => {
    expect(hopsAbort).toHaveLength(2);
    expect(hopsAbort[0][0]).toBe("'RELEASING'");
    expect(hopsAbort[0][1]).toBe("p_expected_version");
    expect(hopsAbort[0][2]).toBe("'ABORTING'");
    expect(hopsAbort[0][3]).toBe("null");
    expect(hopsAbort[0][4]).toBe("null");
    expect(hopsAbort[0][9]).toBe("'api'");
  });

  it("abort ABORTING -> FAILED", () => {
    expect(hopsAbort[1][0]).toBe("'ABORTING'");
    expect(hopsAbort[1][2]).toBe("'FAILED'");
    expect(hopsAbort[1][3]).toBe("null");
    expect(hopsAbort[1][4]).toBe("null");
    expect(hopsAbort[1][9]).toBe("'api'");
  });

  it("abort usa expected_version+1 no segundo hop", () => {
    expect(hopsAbort[1][1]).toBe("p_expected_version + 1");
  });

  it("abort emite MAINTENANCE_ABORTED", () => {
    expect(hopsAbort[0][8]).toBe("'MAINTENANCE_ABORTED'");
  });

  it("abort emite MAINTENANCE_FAILED", () => {
    expect(hopsAbort[1][8]).toBe("'MAINTENANCE_FAILED'");
  });

  it("abort version delta estrutural +2", () => {
    expect(hopsAbort).toHaveLength(2);
    expect(corpoAbort).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(corpoTransition153).toMatch(/version\s*=\s*version\s*\+\s*1/i);
  });

  it("abort grava aborted_at", () => {
    const idxSecondHop = corpoAbort.lastIndexOf(`perform public.${TRANSITION_FN}`);
    const idxTs = corpoAbort.search(/aborted_at\s*=\s*clock_timestamp\(\)/i);
    expect(idxTs).toBeGreaterThan(idxSecondHop);
    const setClause = updateAuxiliar(corpoAbort);
    expect(setClause).toMatch(/aborted_at\s*=\s*clock_timestamp\(\)/i);
    expect(setClause).not.toMatch(/\bversion\s*=/i);
    expect(setClause).not.toMatch(/\bepoch\s*=/i);
    expect(setClause).not.toMatch(/result_code\s*=/i);
  });

  it("abort grava abort_reason", () => {
    const setClause = updateAuxiliar(corpoAbort);
    expect(setClause).toMatch(/abort_reason\s*=\s*p_reason/i);
  });

  it("abort não altera epoch", () => {
    expect(corpoAbort).not.toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
  });
});

describe("migration 159 — reopen FAILED/CANCELED -> NORMAL", () => {
  it("reopen aceita FAILED/CANCELED", () => {
    expect(corpoReopen).toMatch(/p_expected_phase not in \('FAILED',\s*'CANCELED'\)/i);
    expect(hopsReopen).toHaveLength(0);
    expect(corpoReopen).not.toMatch(new RegExp(TRANSITION_FN, "i"));
  });

  it("reopen target NORMAL", () => {
    expect(corpoReopen).toMatch(/phase\s*=\s*'NORMAL'/i);
  });

  it("reopen epoch+1", () => {
    expect(corpoReopen).toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    expect(corpoReopen).toMatch(/v_epoch\s*\+\s*1/i);
  });

  it("reopen version+1", () => {
    expect(corpoReopen).toMatch(/version\s*=\s*version\s*\+\s*1/i);
  });

  it("reopen clear release_id/target_sha", () => {
    expect(corpoReopen).toMatch(/release_id\s*=\s*null/i);
    expect(corpoReopen).toMatch(/target_sha\s*=\s*null/i);
  });

  it("reopen emite MAINTENANCE_REOPENED", () => {
    expect(corpoReopen).toMatch(/'MAINTENANCE_REOPENED'/);
    expect(corpoReopen).toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
  });

  it("evento reopen release_id NULL", () => {
    const insertEvento = corpoReopen.match(
      /insert\s+into\s+public\.app_maintenance_events\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*;/i,
    );
    expect(insertEvento, "INSERT de evento em reopen não encontrado").toBeTruthy();
    const colunas = insertEvento[1].split(",").map((s) => s.replace(/\s+/g, " ").trim());
    const valores = insertEvento[2].split(",").map((s) => s.replace(/\s+/g, " ").trim());
    const idxReleaseCol = colunas.indexOf("release_id");
    expect(idxReleaseCol, "coluna release_id no INSERT de evento").toBeGreaterThan(-1);
    expect(valores[idxReleaseCol]).toBe("null");
    const idxEpochCol = colunas.indexOf("maintenance_epoch");
    expect(idxEpochCol).toBeGreaterThan(-1);
    expect(valores[idxEpochCol]).toMatch(/v_epoch\s*\+\s*1/i);
    const idxTypeCol = colunas.indexOf("event_type");
    expect(valores[idxTypeCol]).toBe("'MAINTENANCE_REOPENED'");
    const idxSourceCol = colunas.indexOf("source");
    expect(valores[idxSourceCol]).toBe("'api'");
  });
});

describe("migration 159 — event CHECK 18 valores e core intacto", () => {
  it("event CHECK contém exatamente 18 valores esperados", () => {
    expect(EVENT_TYPES_18).toHaveLength(18);
    expect(EVENT_TYPES_17).toHaveLength(17);
    expect(sql).toMatch(/17 -> 18 valores/i);
    expect(precheck).toMatch(/divergente do contrato canônico de 17 valores/i);
    expect(postcheck).toMatch(/divergente do contrato canônico de 18 valores/i);
    for (const tipo of EVENT_TYPES_17) {
      expect(sql).toContain(`'${tipo}'`);
    }
    expect(sql).toContain("'MAINTENANCE_REOPENED'");
    const checkBlock = sqlSemComentarios.match(
      /add constraint app_maintenance_events_event_type_check\s+check \(event_type in \(([\s\S]*?)\)\)/i,
    );
    expect(checkBlock, "CHECK replacement 159 não encontrado").toBeTruthy();
    const valores = [...checkBlock[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(valores).toEqual(EVENT_TYPES_18);
  });

  it("16 edges do transition_internal continuam intactas", () => {
    expect(STRUCTURAL_EDGES).toHaveLength(16);
    expect(precheck).toMatch(/esperado validar 16 edges estruturais/i);
    expect(postcheck).toMatch(/esperado validar 16 edges estruturais/i);
    for (const [from, to] of STRUCTURAL_EDGES) {
      expect(precheck).toMatch(new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"));
      expect(postcheck).toMatch(new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"));
    }
    expect(sqlSemComentarios).toMatch(/não deveria conter FAILED->NORMAL nem CANCELED->NORMAL/i);
  });

  it("binding_guard não foi substituído", () => {
    expect(sqlSemComentarios).not.toMatch(
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${GUARD_FN}\\s*\\(`, "i"),
    );
    expect(migration153).toMatch(/FUTURE B17 REOPEN CLEAR/);
    expect(precheck).toMatch(/FUTURE B17 REOPEN CLEAR/i);
    expect(postcheck).toMatch(/FUTURE B17 REOPEN CLEAR/i);
  });

  it("transition_internal não foi substituído", () => {
    expect(sqlSemComentarios).not.toMatch(
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${TRANSITION_FN}\\s*\\(`, "i"),
    );
  });

  it("fail não foi ampliado para RELEASING/ABORTING/SMOKE", () => {
    expect(sqlSemComentarios).not.toMatch(
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${FAIL_FN}\\s*\\(`, "i"),
    );
    expect(postcheck).toMatch(/fail não deveria ser ampliado para RELEASING\/ABORTING\/SMOKE/i);
    expect(precheck).toMatch(/fail não deveria aceitar RELEASING\/ABORTING\/SMOKE/i);
  });
});

describe("migration 159 — zero DML em app_release_runs e zero API/UI", () => {
  it("zero DML em app_release_runs", () => {
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "update")).toBe(0);
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "insert")).toBe(0);
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "delete")).toBe(0);
    for (const corpo of [corpoAbort, corpoReopen]) {
      expect(contarDmlAppReleaseRuns(corpo, "update")).toBe(0);
      expect(contarDmlAppReleaseRuns(corpo, "insert")).toBe(0);
      expect(contarDmlAppReleaseRuns(corpo, "delete")).toBe(0);
    }
  });

  it("nenhuma API/UI criada", () => {
    expect(sqlSemComentarios).not.toMatch(/api\/maintenance/i);
    expect(sqlSemComentarios).not.toMatch(/MaintenanceAdmin/i);
    expect(sqlSemComentarios).not.toMatch(/App\.jsx/i);
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    const apiUi = readdirSync("src").filter((f) => /abort|reopen/i.test(f));
    expect(apiUi).toEqual([]);
  });

  it("não substitui core existente (transition_internal, binding_guard, fail, success, write_assert)", () => {
    for (const fn of CORE_INTOCADO) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
    expect(foraDasFuncoes).not.toMatch(/^\s*insert\s+into/im);
    expect(foraDasFuncoes).not.toMatch(/^\s*update\s+public\./im);
    expect(foraDasFuncoes).not.toMatch(/^\s*delete\s+from/im);
  });
});

describe("behavioral 159 — static safety", () => {
  it("BEGIN/SAVEPOINT/ROLLBACK TO/ROLLBACK final/COMMIT no top-level", () => {
    const begins = behaviorTopLevel.match(/^\s*BEGIN\s*;/gim) || [];
    const savepoints = behaviorTopLevel.match(/^\s*SAVEPOINT\s+\w+\s*;/gim) || [];
    const rollbackTo = behaviorTopLevel.match(/^\s*ROLLBACK\s+TO\s+SAVEPOINT\s+\w+\s*;/gim) || [];
    const rollbacks = (behaviorTopLevel.match(/^\s*ROLLBACK\s*;/gim) || []).filter(
      (s) => !/ROLLBACK\s+TO\s+SAVEPOINT/i.test(s),
    );
    const commits = behaviorTopLevel.match(/^\s*COMMIT\s*;/gim) || [];
    expect(begins).toHaveLength(1);
    expect(savepoints.length).toBeGreaterThanOrEqual(1);
    expect(rollbackTo).toHaveLength(savepoints.length);
    expect(rollbacks).toHaveLength(1);
    expect(commits).toHaveLength(0);
  });

  it("zero transaction control inside PL/pgSQL e zero COMMIT", () => {
    for (const body of plpgsqlBodies) {
      const semLinhaComentario = body
        .split("\n")
        .map((linha) => linha.replace(/--.*$/, ""))
        .join("\n");
      expect(semLinhaComentario).not.toMatch(/^\s*COMMIT\s*;/im);
      expect(semLinhaComentario).not.toMatch(/^\s*ROLLBACK\s*;/im);
      expect(semLinhaComentario).not.toMatch(/^\s*ROLLBACK\s+TO\s+SAVEPOINT/im);
      expect(semLinhaComentario).not.toMatch(/^\s*SAVEPOINT\s+/im);
    }
    expect(behaviorSemComentarios).not.toMatch(/^\s*COMMIT\s*;/im);
  });

  it("cenários obrigatórios A-H e FALSE_PASS fail-closed", () => {
    expect(behavior).toMatch(/CENARIO A/i);
    expect(behavior).toMatch(/CENARIO B/i);
    expect(behavior).toMatch(/CENARIO C/i);
    expect(behavior).toMatch(/CENARIO D/i);
    expect(behavior).toMatch(/CENARIO E/i);
    expect(behavior).toMatch(/CENARIO F/i);
    expect(behavior).toMatch(/CENARIO G/i);
    expect(behavior).toMatch(/CENARIO H/i);
    expect(behavior).toMatch(/FALSE_PASS/i);
    expect(behavior).toMatch(/app_maintenance_orchestration_abort/i);
    expect(behavior).toMatch(/app_maintenance_orchestration_reopen/i);
    expect(behavior).toMatch(/app_assert_business_write_allowed/i);
  });
});
