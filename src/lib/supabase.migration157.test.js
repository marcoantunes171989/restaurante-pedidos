import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/157_maintenance_smoke_recovery_orchestration.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration153 = readFileSync(
  "supabase/migrations/153_maintenance_release_orchestration_core.sql",
  "utf8",
);
const migration153SemComentarios = migration153
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");
const migration155 = readFileSync(
  "supabase/migrations/155_maintenance_fence_drain_quiescence_reconciliation.sql",
  "utf8",
);
const migration155SemComentarios = migration155
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

const B16_EDGES = [
  ["RELEASING", "SMOKE"],
  ["SMOKE", "NORMAL"],
  ["SMOKE", "RECOVERING"],
  ["RECOVERING", "FAILED"],
];

const TRANSITION_FN = "app_maintenance_orchestration_transition_internal";
const GUARD_FN = "app_maintenance_orchestration_binding_guard";
const BARRIER_FN = "app_maintenance_cutover_barrier_internal";
const START_FN = "app_maintenance_orchestration_start";
const CANCEL_FN = "app_maintenance_orchestration_cancel";
const FAIL_FN = "app_maintenance_orchestration_fail";
const FENCE_FN = "app_maintenance_orchestration_fence";
const DRAIN_START_FN = "app_maintenance_orchestration_drain_start";
const QUIESCE_FN = "app_maintenance_orchestration_quiesce";
const PROBE_FN = "app_maintenance_orchestration_quiescence_probe";
const RELEASE_START_FN = "app_maintenance_orchestration_release_start";
const NOTICE_FN = "app_maintenance_orchestration_notice";
const SMOKE_FN = "app_maintenance_orchestration_smoke";
const SUCCESS_FN = "app_maintenance_orchestration_success";
const RECOVER_FN = "app_maintenance_orchestration_recover";
const ABORT_FN = "app_maintenance_orchestration_abort";
const REOPEN_FN = "app_maintenance_orchestration_reopen";
const REHEARSAL_FN = "app_maintenance_orchestration_rehearsal";
const READINESS_FN = "app_maintenance_orchestration_readiness";
const NOTICE_TICK_FN = "app_maintenance_orchestration_notice_tick";

const PUBLIC_SIG = "integer, uuid, text, text, jsonb";
const FAIL_SIG = "text, integer, uuid, text, text, jsonb";
const NEW_RPCS = [SMOKE_FN, SUCCESS_FN, RECOVER_FN];

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

function performTransitionArgs(corpo) {
  const match = corpo.match(
    new RegExp(`perform\\s+public\\.${TRANSITION_FN}\\s*\\(([\\s\\S]*?)\\)\\s*;`, "i"),
  );
  expect(match, `perform de ${TRANSITION_FN} não encontrado`).toBeTruthy();
  return match[1];
}

function listaArgs(argsTexto) {
  return argsTexto
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
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

function allowlistFail(corpo) {
  const match = corpo.match(/p_expected_phase not in \(([^)]*)\)/i);
  expect(match, "allowlist de fail não encontrada").toBeTruthy();
  return match[1];
}

const corpoSmoke = corpoDaFuncao(sqlSemComentarios, SMOKE_FN);
const corpoSuccess = corpoDaFuncao(sqlSemComentarios, SUCCESS_FN);
const corpoRecover = corpoDaFuncao(sqlSemComentarios, RECOVER_FN);
const corpoFail = corpoDaFuncao(sqlSemComentarios, FAIL_FN);
const corpoFail153 = corpoDaFuncao(migration153SemComentarios, FAIL_FN);
const corpoTransition153 = corpoDaFuncao(migration153SemComentarios, TRANSITION_FN);
const corpoGuard153 = corpoDaFuncao(migration153SemComentarios, GUARD_FN);
const corpoBarrier155 = corpoDaFuncao(migration155SemComentarios, BARRIER_FN);
const blocoSmoke = blocoCompletoDaFuncao(sqlSemComentarios, SMOKE_FN);
const blocoSuccess = blocoCompletoDaFuncao(sqlSemComentarios, SUCCESS_FN);
const blocoRecover = blocoCompletoDaFuncao(sqlSemComentarios, RECOVER_FN);
const blocoFail = blocoCompletoDaFuncao(sqlSemComentarios, FAIL_FN);
const argsSmoke = listaArgs(performTransitionArgs(corpoSmoke));
const argsSuccess = listaArgs(performTransitionArgs(corpoSuccess));
const argsRecover = listaArgs(performTransitionArgs(corpoRecover));
const argsFail = listaArgs(performTransitionArgs(corpoFail));
const foraDasFuncoes = sqlSemComentarios
  .replace(blocoSmoke, "")
  .replace(blocoSuccess, "")
  .replace(blocoRecover, "")
  .replace(blocoFail, "");

describe("migration 157 — existência e transação", () => {
  it("arquivo 157 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^157[_.]/.test(f));
    expect(arquivos).toEqual(["157_maintenance_smoke_recovery_orchestration.sql"]);
  });

  it("é transacional (BEGIN/COMMIT), sem ROLLBACK executável", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
    expect(sqlSemComentarios).not.toMatch(/^\s*rollback\s*;/im);
  });

  it("possui exatamente 1 BEGIN e 1 COMMIT, e COMMIT é o último statement executável", () => {
    const begins = sqlSemComentarios.match(/^\s*begin\s*;/gim) || [];
    const commits = sqlSemComentarios.match(/^\s*commit\s*;/gim) || [];
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("migrations 140-156 permanecem intocadas (exatamente 1 arquivo por número)", () => {
    for (let n = 140; n <= 156; n += 1) {
      const arquivos = readdirSync("supabase/migrations").filter((f) =>
        new RegExp(`^${n}[_.]`).test(f),
      );
      expect(arquivos.length, `migration ${n} deveria ter exatamente 1 arquivo`).toBe(1);
    }
  });
});

describe("migration 157 — precheck/postcheck fail-closed", () => {
  it("possui precheck 157 antes do primeiro CREATE FUNCTION e postcheck 157 antes do COMMIT", () => {
    expect(sql).toMatch(/precheck 157/i);
    expect(sql).toMatch(/postcheck 157/i);
    const idxPrecheck = sql.search(/precheck 157/i);
    const idxCreate = sql.search(new RegExp(`create function public\\.${SMOKE_FN}`, "i"));
    const idxPostcheck = sql.search(/postcheck 157/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
    expect(idxPostcheck).toBeGreaterThan(idxCreate);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("precheck valida dependências reais: state, events, release_runs, transition_internal, barrier, guard e fail", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state não existe/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_events não existe/i);
    expect(sqlSemComentarios).toMatch(/app_release_runs não existe/i);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`public\\.${TRANSITION_FN}\\([^)]*\\)\\s+não existe`, "i"),
    );
    expect(sqlSemComentarios).toMatch(
      new RegExp(`${BARRIER_FN}\\(boolean\\) não existe`, "i"),
    );
    expect(sqlSemComentarios).toMatch(
      new RegExp(`${GUARD_FN}\\(\\) não existe`, "i"),
    );
    expect(sqlSemComentarios).toMatch(/binding_guard_trg ausente/i);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`public\\.${FAIL_FN}\\([^)]*\\)\\s+não existe`, "i"),
    );
  });

  it("precheck valida o contrato canônico de 17 event_types e as 16 edges estruturais", () => {
    expect(sqlSemComentarios).toMatch(/divergente do contrato canônico de 17 valores/i);
    expect(sqlSemComentarios).toMatch(/esperado validar 16 edges estruturais/i);
    for (const [from, to] of STRUCTURAL_EDGES) {
      expect(sqlSemComentarios).toContain(`('${from}'`);
      expect(sqlSemComentarios).toContain(`'${to}'`);
      expect(sqlSemComentarios).toMatch(
        new RegExp(`edge % -> % ausente em transition_internal`, "i"),
      );
    }
    expect(STRUCTURAL_EDGES).toHaveLength(16);
  });

  it("precheck comprova as 4 edges B16 já existentes no core", () => {
    for (const [from, to] of B16_EDGES) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"),
      );
    }
  });

  it("precheck bloqueia colisão das 3 RPCs novas e overload inesperado do fail", () => {
    for (const fn of NEW_RPCS) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`public\\.${fn}\\([^)]*\\)\\s+já existe`, "i"),
      );
    }
    expect(sqlSemComentarios).toMatch(/colisão de nome — alguma RPC B16 já existe/i);
    expect(sqlSemComentarios).toMatch(/fail deveria ter exatamente 1 assinatura/i);
  });

  it("postcheck valida owner, SECURITY DEFINER, search_path, void, ACL e barrier exclusiva das 3 novas", () => {
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/i);
    expect(sqlSemComentarios).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(sqlSemComentarios).toMatch(/proconfig deveria conter search_path=public/i);
    expect(sqlSemComentarios).toMatch(/return type deveria ser void/i);
    expect(sqlSemComentarios).toMatch(/anon\/authenticated NÃO deveriam ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/service_role deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/PUBLIC NÃO deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/deveria adquirir barrier exclusiva/i);
  });
});

describe("migration 157 — precheck estrutural de colunas (tipos canônicos da migration140)", () => {
  it("migration140 declara smoke_started_at/completed_at/recovering_at/timeout_at/release_started_at como timestamptz", () => {
    expect(migration140).toMatch(/smoke_started_at\s+timestamptz\s+null/i);
    expect(migration140).toMatch(/completed_at\s+timestamptz\s+null/i);
    expect(migration140).toMatch(/recovering_at\s+timestamptz\s+null/i);
    expect(migration140).toMatch(/timeout_at\s+timestamptz\s+null/i);
    expect(migration140).toMatch(/release_started_at\s+timestamptz\s+null/i);
    expect(migration140).toMatch(/result_code\s+text\s+null/i);
  });

  it("precheck 157 valida via pg_attribute as colunas exigidas antes do CREATE FUNCTION", () => {
    const idxPrecheck = sqlSemComentarios.search(/precheck 157/i);
    const idxCreate = sqlSemComentarios.search(new RegExp(`create function public\\.${SMOKE_FN}`, "i"));
    for (const coluna of [
      "smoke_started_at",
      "completed_at",
      "recovering_at",
      "timeout_at",
      "release_started_at",
      "result_code",
      "release_id",
      "target_sha",
      "version",
      "epoch",
      "phase",
    ]) {
      expect(sqlSemComentarios).toContain(`'${coluna}'`);
      const idxCheck = sqlSemComentarios.search(new RegExp(`'${coluna}'`, "i"));
      expect(idxCheck, `checagem de ${coluna} não encontrada`).toBeGreaterThan(idxPrecheck);
      expect(idxCheck).toBeLessThan(idxCreate);
    }
    expect(sqlSemComentarios).toMatch(/ausente em app_maintenance_state \(migration 140 ausente\/drift\)/i);
  });

  it("não altera tabela/coluna: precheck de colunas é somente leitura", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
  });
});

describe("migration 157 — topologia (3 CREATE FUNCTION + 1 CREATE OR REPLACE fail)", () => {
  it("cria exatamente 3 funções novas: smoke, success, recover", () => {
    expect(nomesCreateFunction(sqlSemComentarios)).toEqual(NEW_RPCS);
  });

  it("faz CREATE OR REPLACE somente de app_maintenance_orchestration_fail", () => {
    expect(nomesCreateOrReplace(sqlSemComentarios)).toEqual([FAIL_FN]);
  });

  it("não redefine transition_internal, binding_guard, start, cancel, fence, drain, quiesce, probe, release_start, notice", () => {
    for (const fn of [
      TRANSITION_FN,
      GUARD_FN,
      START_FN,
      CANCEL_FN,
      FENCE_FN,
      DRAIN_START_FN,
      QUIESCE_FN,
      PROBE_FN,
      RELEASE_START_FN,
      NOTICE_FN,
      BARRIER_FN,
    ]) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });
});

describe("migration 157 — zero DDL estrutural, zero event type novo, zero edge nova", () => {
  it("não cria tabela, coluna, índice, constraint, policy ou trigger", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+trigger/i);
  });

  it("não altera o contrato de event_type (continua exatamente 17 valores)", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_maintenance_events/i);
    for (const tipo of EVENT_TYPES_17) {
      expect(sqlSemComentarios).toContain(`'${tipo}'`);
    }
    expect(EVENT_TYPES_17).toHaveLength(17);
  });

  it("migration153 já declara as 16 edges, inclusive as 4 B16, e 157 não as reescreve", () => {
    expect(STRUCTURAL_EDGES).toHaveLength(16);
    expect(B16_EDGES).toHaveLength(4);
    for (const [from, to] of STRUCTURAL_EDGES) {
      expect(corpoTransition153).toMatch(
        new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"),
      );
    }
    expect(sqlSemComentarios).not.toMatch(
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${TRANSITION_FN}\\s*\\(`, "i"),
    );
  });

  it("não inventa event types B16 (SMOKE_PASSED, SMOKE_FAILED, RECOVERY_FAILED)", () => {
    expect(sqlSemComentarios).not.toContain("SMOKE_PASSED");
    expect(sqlSemComentarios).not.toContain("SMOKE_FAILED");
    expect(sqlSemComentarios).not.toContain("RECOVERY_FAILED");
  });
});

describe("migration 157 — assinaturas congeladas", () => {
  it.each(NEW_RPCS)("%s tem assinatura integer,uuid,text,text,jsonb -> void", (fn) => {
    const tipos = [...assinaturaDaFuncao(sqlSemComentarios, fn).matchAll(/p_(\w+)\s+(\w+)/gi)].map(
      (m) => [m[1].toLowerCase(), m[2].toLowerCase()],
    );
    expect(tipos).toEqual([
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["metadata", "jsonb"],
    ]);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`create function public\\.${fn}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+void`, "i"),
    );
  });

  it("fail continua assinatura (text, integer, uuid, text, text, jsonb) -> void", () => {
    const tipos = [...assinaturaDaFuncao(sqlSemComentarios, FAIL_FN).matchAll(/p_(\w+)\s+(\w+)/gi)].map(
      (m) => [m[1].toLowerCase(), m[2].toLowerCase()],
    );
    expect(tipos).toEqual([
      ["expected_phase", "text"],
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["metadata", "jsonb"],
    ]);
    expect(sqlSemComentarios).toMatch(
      new RegExp(
        `create or replace function public\\.${FAIL_FN}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+void`,
        "i",
      ),
    );
    expect(sqlSemComentarios).toContain(`${FAIL_FN}(${FAIL_SIG})`);
  });
});

describe("migration 157 — smoke RELEASING -> SMOKE", () => {
  it("adquire barrier exclusiva (154,1) antes do lock do singleton", () => {
    const idxBarrier = corpoSmoke.search(new RegExp(`${BARRIER_FN}\\(\\s*true\\s*\\)`, "i"));
    const idxLock = corpoSmoke.search(/for update;/i);
    expect(idxBarrier).toBeGreaterThan(-1);
    expect(idxLock).toBeGreaterThan(idxBarrier);
    expect(corpoSmoke).not.toMatch(new RegExp(`${BARRIER_FN}\\(\\s*false\\s*\\)`, "i"));
    expect(corpoBarrier155).toMatch(/pg_advisory_xact_lock\(\s*154\s*,\s*1\s*\)/i);
    expect(sqlSemComentarios).toMatch(/pg_advisory_xact_lock\(154, 1\)/i);
  });

  it("lock order: singleton FOR UPDATE depois release bound FOR UPDATE", () => {
    const idxState = corpoSmoke.search(/from public\.app_maintenance_state/i);
    const idxStateLock = corpoSmoke.search(/for update;/i);
    const idxRelease = corpoSmoke.search(/from public\.app_release_runs/i);
    const idxReleaseLock = corpoSmoke.lastIndexOf("for update;");
    expect(idxState).toBeGreaterThan(-1);
    expect(idxStateLock).toBeGreaterThan(idxState);
    expect(idxRelease).toBeGreaterThan(idxStateLock);
    expect(idxReleaseLock).toBeGreaterThan(idxRelease);
  });

  it("CAS fail-closed: phase=RELEASING e version=p_expected_version", () => {
    expect(corpoSmoke).toMatch(/v_phase is distinct from 'RELEASING'/i);
    expect(corpoSmoke).toMatch(/v_version is distinct from p_expected_version/i);
    expect(corpoSmoke).toMatch(/detail = 'STATE_CONFLICT'/i);
    expect(corpoSmoke).toMatch(/detail = 'VERSION_CONFLICT'/i);
  });

  it("exige binding completo e release_started_at IS NOT NULL antes da transition", () => {
    const idxBinding = corpoSmoke.search(/v_release_id is null or v_target_sha is null/i);
    const idxStarted = corpoSmoke.search(/v_release_started_at is null/i);
    const idxTransition = corpoSmoke.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(idxBinding).toBeGreaterThan(-1);
    expect(idxStarted).toBeGreaterThan(idxBinding);
    expect(idxTransition).toBeGreaterThan(idxStarted);
    expect(corpoSmoke).toMatch(/'Active orchestration binding required\.'/i);
  });

  it("consulta a release bound sem UPDATE e recusa somente CANCELED/BLOCKED", () => {
    expect(corpoSmoke).toMatch(/from public\.app_release_runs/i);
    expect(corpoSmoke).toMatch(/v_release_status in \('CANCELED', 'BLOCKED'\)/i);
    expect(corpoSmoke).not.toMatch(/update\s+public\.app_release_runs/i);
    expect(corpoSmoke).not.toMatch(/'REQUESTED'/);
    expect(corpoSmoke).not.toMatch(/'SCHEDULED'/);
    expect(corpoSmoke).not.toMatch(/'WAITING'/);
    expect(corpoSmoke).not.toMatch(/'VALIDATING'/);
    expect(corpoSmoke).not.toMatch(/'DISPATCHED'/);
    expect(corpoSmoke).not.toMatch(/'RUNNING'/);
  });

  it("chama transition_internal RELEASING -> SMOKE com SMOKE_STARTED source api e null/null de binding", () => {
    expect(argsSmoke).toHaveLength(12);
    expect(argsSmoke[0]).toBe("'RELEASING'");
    expect(argsSmoke[1]).toBe("p_expected_version");
    expect(argsSmoke[2]).toBe("'SMOKE'");
    expect(argsSmoke[3]).toBe("null");
    expect(argsSmoke[4]).toBe("null");
    expect(argsSmoke[8]).toBe("'SMOKE_STARTED'");
    expect(argsSmoke[9]).toBe("'api'");
  });

  it("grava smoke_started_at = clock_timestamp() DEPOIS da transition, sem segundo version increment", () => {
    const idxTransition = corpoSmoke.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    const idxTs = corpoSmoke.search(/smoke_started_at\s*=\s*clock_timestamp\(\)/i);
    expect(idxTs).toBeGreaterThan(idxTransition);
    const setClause = updateAuxiliar(corpoSmoke);
    expect(setClause).toMatch(/smoke_started_at\s*=\s*clock_timestamp\(\)/i);
    expect(setClause).not.toMatch(/\bversion\s*=/i);
    expect(setClause).not.toMatch(/\bepoch\s*=/i);
    expect(setClause).not.toMatch(/\bphase\s*=/i);
    expect(setClause).not.toMatch(/\brelease_id\s*=/i);
    expect(setClause).not.toMatch(/\btarget_sha\s*=/i);
    expect(setClause).not.toMatch(/timeout_at\s*=/i);
  });

  it("preserva binding: não escreve release_id/target_sha e passa null/null ao core", () => {
    expect(corpoSmoke).not.toMatch(/release_id\s*=/i);
    expect(corpoSmoke).not.toMatch(/target_sha\s*=/i);
    expect(argsSmoke[3]).toBe("null");
    expect(argsSmoke[4]).toBe("null");
  });
});

describe("migration 157 — success SMOKE -> NORMAL", () => {
  it("adquire barrier exclusiva, lock/CAS SMOKE+version e binding completo", () => {
    expect(corpoSuccess).toMatch(new RegExp(`${BARRIER_FN}\\(\\s*true\\s*\\)`, "i"));
    expect(corpoSuccess).toMatch(/from public\.app_maintenance_state[\s\S]*for update;/i);
    expect(corpoSuccess).toMatch(/v_phase is distinct from 'SMOKE'/i);
    expect(corpoSuccess).toMatch(/v_version is distinct from p_expected_version/i);
    expect(corpoSuccess).toMatch(/v_release_id is null or v_target_sha is null/i);
    expect(corpoSuccess).toMatch(/v_smoke_started_at is null/i);
  });

  it("chama transition_internal SMOKE -> NORMAL com MAINTENANCE_COMPLETED source api", () => {
    expect(argsSuccess).toHaveLength(12);
    expect(argsSuccess[0]).toBe("'SMOKE'");
    expect(argsSuccess[1]).toBe("p_expected_version");
    expect(argsSuccess[2]).toBe("'NORMAL'");
    expect(argsSuccess[3]).toBe("null");
    expect(argsSuccess[4]).toBe("null");
    expect(argsSuccess[8]).toBe("'MAINTENANCE_COMPLETED'");
    expect(argsSuccess[9]).toBe("'api'");
  });

  it("clear de binding ocorre somente via core (SMOKE->NORMAL), sem UPDATE manual de release_id/target_sha", () => {
    expect(corpoSuccess).not.toMatch(/release_id\s*=/i);
    expect(corpoSuccess).not.toMatch(/target_sha\s*=/i);
    expect(corpoTransition153).toMatch(/p_expected_phase = 'SMOKE' and p_to_phase = 'NORMAL'/i);
    const clearBlock = corpoTransition153.match(
      /if p_expected_phase = 'SMOKE' and p_to_phase = 'NORMAL' then([\s\S]*?)else([\s\S]*?)end if;/i,
    );
    expect(clearBlock, "bloco determinístico SMOKE->NORMAL não encontrado em 153").toBeTruthy();
    expect(clearBlock[1]).toMatch(/v_new_release_id\s*:=\s*null/i);
    expect(clearBlock[1]).toMatch(/v_new_target_sha\s*:=\s*null/i);
    expect(corpoGuard153).toMatch(/OLD\.phase = 'SMOKE' and NEW\.phase = 'NORMAL'/i);
    expect(corpoSuccess).not.toMatch(/from public\.app_release_runs/i);
  });

  it("grava completed_at = clock_timestamp() DEPOIS da transition, sem segundo version increment", () => {
    const idxTransition = corpoSuccess.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    const idxTs = corpoSuccess.search(/completed_at\s*=\s*clock_timestamp\(\)/i);
    expect(idxTs).toBeGreaterThan(idxTransition);
    const setClause = updateAuxiliar(corpoSuccess);
    expect(setClause).toMatch(/completed_at\s*=\s*clock_timestamp\(\)/i);
    expect(setClause).not.toMatch(/\bversion\s*=/i);
    expect(setClause).not.toMatch(/\bepoch\s*=/i);
    expect(setClause).not.toMatch(/timeout_at\s*=/i);
  });
});

describe("migration 157 — recover SMOKE -> RECOVERING", () => {
  it("adquire barrier exclusiva, lock/CAS SMOKE+version, binding e smoke_started_at", () => {
    expect(corpoRecover).toMatch(new RegExp(`${BARRIER_FN}\\(\\s*true\\s*\\)`, "i"));
    expect(corpoRecover).toMatch(/from public\.app_maintenance_state[\s\S]*for update;/i);
    expect(corpoRecover).toMatch(/v_phase is distinct from 'SMOKE'/i);
    expect(corpoRecover).toMatch(/v_version is distinct from p_expected_version/i);
    expect(corpoRecover).toMatch(/v_release_id is null or v_target_sha is null/i);
    expect(corpoRecover).toMatch(/v_smoke_started_at is null/i);
  });

  it("chama transition_internal SMOKE -> RECOVERING com RECOVERY_STARTED source api", () => {
    expect(argsRecover).toHaveLength(12);
    expect(argsRecover[0]).toBe("'SMOKE'");
    expect(argsRecover[2]).toBe("'RECOVERING'");
    expect(argsRecover[3]).toBe("null");
    expect(argsRecover[4]).toBe("null");
    expect(argsRecover[8]).toBe("'RECOVERY_STARTED'");
    expect(argsRecover[9]).toBe("'api'");
  });

  it("preserva binding e grava recovering_at depois da transition, sem timeout_at e sem segundo version increment", () => {
    expect(corpoRecover).not.toMatch(/release_id\s*=/i);
    expect(corpoRecover).not.toMatch(/target_sha\s*=/i);
    const idxTransition = corpoRecover.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    const idxTs = corpoRecover.search(/recovering_at\s*=\s*clock_timestamp\(\)/i);
    expect(idxTs).toBeGreaterThan(idxTransition);
    const setClause = updateAuxiliar(corpoRecover);
    expect(setClause).toMatch(/recovering_at\s*=\s*clock_timestamp\(\)/i);
    expect(setClause).not.toMatch(/\bversion\s*=/i);
    expect(setClause).not.toMatch(/\bepoch\s*=/i);
    expect(setClause).not.toMatch(/timeout_at\s*=/i);
    expect(corpoRecover).not.toMatch(/timeout_at\s*=/i);
    expect(corpoRecover).not.toMatch(/from public\.app_release_runs/i);
  });
});

describe("migration 157 — fail allowlist RECOVERING", () => {
  it("migration153 ainda restringe fail a FENCING/DRAINING/QUIESCENT; 157 amplia para RECOVERING", () => {
    expect(allowlistFail(corpoFail153)).toMatch(/'FENCING'/i);
    expect(allowlistFail(corpoFail153)).toMatch(/'DRAINING'/i);
    expect(allowlistFail(corpoFail153)).toMatch(/'QUIESCENT'/i);
    expect(allowlistFail(corpoFail153)).not.toMatch(/'RECOVERING'/i);
    expect(allowlistFail(corpoFail)).toMatch(/'FENCING'/i);
    expect(allowlistFail(corpoFail)).toMatch(/'DRAINING'/i);
    expect(allowlistFail(corpoFail)).toMatch(/'QUIESCENT'/i);
    expect(allowlistFail(corpoFail)).toMatch(/'RECOVERING'/i);
  });

  it("fail aceita RECOVERING e NÃO aceita RELEASING, SMOKE ou ABORTING", () => {
    const permitido = allowlistFail(corpoFail);
    expect(permitido).toMatch(/'RECOVERING'/);
    for (const fase of ["NORMAL", "NOTICE", "RELEASING", "SMOKE", "ABORTING", "FAILED", "CANCELED"]) {
      expect(permitido).not.toContain(`'${fase}'`);
    }
  });

  it("fail permanece FAILED + MAINTENANCE_FAILED, preserva binding via null/null, sem barrier e sem aborted_at", () => {
    expect(argsFail[2]).toBe("'FAILED'");
    expect(argsFail[3]).toBe("null");
    expect(argsFail[4]).toBe("null");
    expect(argsFail[8]).toBe("'MAINTENANCE_FAILED'");
    expect(argsFail[9]).toBe("'api'");
    expect(corpoFail).not.toMatch(new RegExp(BARRIER_FN, "i"));
    expect(corpoFail).not.toMatch(/aborted_at\s*=/i);
    expect(corpoFail).not.toMatch(/abort_reason\s*=/i);
    expect(corpoFail).not.toMatch(/timeout_at\s*=/i);
    expect(corpoFail).not.toMatch(/update\s+public\.app_release_runs/i);
    expect(corpoFail).not.toMatch(/from public\.app_release_runs/i);
  });
});

describe("migration 157 — version/epoch e app_release_runs", () => {
  it("nenhuma das 4 RPCs incrementa version ou epoch fora do core", () => {
    for (const corpo of [corpoSmoke, corpoSuccess, corpoRecover, corpoFail]) {
      expect(corpo).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
      expect(corpo).not.toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    }
  });

  it("zero UPDATE app_release_runs em todo o arquivo 157", () => {
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_runs/i);
  });

  it("success é o único B16 cuja edge limpa binding; smoke/recover/fail preservam via core", () => {
    expect(argsSuccess[0]).toBe("'SMOKE'");
    expect(argsSuccess[2]).toBe("'NORMAL'");
    expect(argsSmoke[0]).toBe("'RELEASING'");
    expect(argsSmoke[2]).toBe("'SMOKE'");
    expect(argsRecover[0]).toBe("'SMOKE'");
    expect(argsRecover[2]).toBe("'RECOVERING'");
    expect(argsFail[2]).toBe("'FAILED'");
    const releaseNull = [...corpoTransition153.matchAll(/v_new_release_id\s*:=\s*null;/gi)];
    expect(releaseNull).toHaveLength(1);
  });
});

describe("migration 157 — ACL e SECURITY DEFINER", () => {
  it("REVOKE ALL de public/anon/authenticated/service_role e GRANT EXECUTE somente para service_role nas 3 novas", () => {
    for (const fn of NEW_RPCS) {
      const sig = `${fn}\\(${PUBLIC_SIG}\\)`;
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${sig} from ${role}`, "i"),
        );
      }
      expect(sqlSemComentarios).toMatch(
        new RegExp(`grant execute on function public\\.${sig} to service_role`, "i"),
      );
      expect(cabecaDaFuncao(sqlSemComentarios, fn)).toMatch(/security definer/i);
      expect(cabecaDaFuncao(sqlSemComentarios, fn)).toMatch(/set search_path\s*=\s*public/i);
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${sig} owner to postgres`, "i"),
      );
    }
  });

  it("fail preserva owner postgres, SECURITY DEFINER, search_path e ACL service_role only", () => {
    const sig = `${FAIL_FN}\\(${FAIL_SIG}\\)`;
    expect(cabecaDaFuncao(sqlSemComentarios, FAIL_FN)).toMatch(/security definer/i);
    expect(cabecaDaFuncao(sqlSemComentarios, FAIL_FN)).toMatch(/set search_path\s*=\s*public/i);
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
  });
});

describe("migration 157 — timeout/scheduler e contaminação B17/B18/B19", () => {
  it("não cria writer de timeout_at nem scheduler/cron", () => {
    expect(sqlSemComentarios).not.toMatch(/timeout_at\s*=/i);
    expect(sqlSemComentarios).not.toMatch(/pg_cron/i);
    expect(sqlSemComentarios).not.toMatch(/cron\./i);
    expect(sqlSemComentarios).not.toMatch(/scheduler/i);
    expect(sqlSemComentarios).not.toMatch(/pg_net/i);
  });

  it("não implementa abort/reopen/rehearsal/readiness/notice_tick", () => {
    for (const fn of [ABORT_FN, REOPEN_FN, REHEARSAL_FN, READINESS_FN, NOTICE_TICK_FN]) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });

  it("não emite NOTICE_TICK, MAINTENANCE_ABORTED nem transita para ABORTING", () => {
    expect(corpoSmoke).not.toMatch(/NOTICE_TICK/);
    expect(corpoSuccess).not.toMatch(/NOTICE_TICK/);
    expect(corpoRecover).not.toMatch(/NOTICE_TICK/);
    expect(corpoFail).not.toMatch(/NOTICE_TICK/);
    expect(argsSmoke[8]).not.toBe("'NOTICE_TICK'");
    expect(argsSuccess[8]).not.toBe("'NOTICE_TICK'");
    expect(argsRecover[8]).not.toBe("'NOTICE_TICK'");
    expect(argsFail[8]).not.toBe("'NOTICE_TICK'");
    expect(argsSmoke[2]).not.toBe("'ABORTING'");
    expect(argsSuccess[2]).not.toBe("'ABORTING'");
    expect(argsRecover[2]).not.toBe("'ABORTING'");
    expect(argsFail[2]).not.toBe("'ABORTING'");
    expect(argsSmoke[8]).not.toBe("'MAINTENANCE_ABORTED'");
    expect(argsSuccess[8]).not.toBe("'MAINTENANCE_ABORTED'");
    expect(argsRecover[8]).not.toBe("'MAINTENANCE_ABORTED'");
    expect(argsFail[8]).not.toBe("'MAINTENANCE_ABORTED'");
  });
});

describe("migration 157 — zero DML apply-time e proibições de escopo", () => {
  it("não referencia schema_migrations", () => {
    expect(sqlSemComentarios).not.toMatch(/schema_migrations/i);
  });

  it("não faz INSERT/UPDATE/DELETE fora dos corpos das funções", () => {
    expect(foraDasFuncoes).not.toMatch(/^\s*insert\s+into/im);
    expect(foraDasFuncoes).not.toMatch(/^\s*update\s+public\./im);
    expect(foraDasFuncoes).not.toMatch(/^\s*delete\s+from/im);
  });

  it("não contém token/segredo hardcoded nem verificação de super_admin", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sqlSemComentarios).not.toMatch(/super_admin/i);
  });

  it("não cria idempotency key nova", () => {
    expect(sqlSemComentarios).not.toMatch(/idempotency/i);
  });

  it("não referencia API/UI de manutenção", () => {
    expect(sqlSemComentarios).not.toMatch(/api\/maintenance/i);
    expect(sqlSemComentarios).not.toMatch(/MaintenanceAdmin/i);
    expect(sqlSemComentarios).not.toMatch(/App\.jsx/i);
  });
});
