import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql157Path = "supabase/migrations/157_maintenance_smoke_recovery_orchestration.sql";
const sqlPath = "supabase/migrations/158_maintenance_smoke_recovery_reconciliation.sql";
const MIGRATION157_BLOB = "e887d2d1c67f37067344837d67f57c7ee509c6ca";
const MIGRATION157_SHA256 = "eb7f5139acf81df40f7be36e296678121464d7b3e30ba2e1a524644fe5283a9c";

function stripComentarios(texto) {
  return texto
    .split("\n")
    .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
    .join("\n");
}

function normalizeLf(texto) {
  return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const sql = readFileSync(sqlPath, "utf8");
const sql157 = readFileSync(sql157Path, "utf8");
const sqlSemComentarios = stripComentarios(sql);
const sql157SemComentarios = stripComentarios(sql157);
const migration138 = readFileSync("supabase/migrations/138_release_control_plane.sql", "utf8");
const migration153 = readFileSync(
  "supabase/migrations/153_maintenance_release_orchestration_core.sql",
  "utf8",
);
const migration153SemComentarios = stripComentarios(migration153);

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
const FAIL_FN = "app_maintenance_orchestration_fail";
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
const PUBLIC_RPCS = [SMOKE_FN, SUCCESS_FN, RECOVER_FN];
const ALL_4 = [...PUBLIC_RPCS, FAIL_FN];
const INTERNAL_HELPERS = [TRANSITION_FN, GUARD_FN, BARRIER_FN];

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

function allowlistFail(corpo) {
  const match = corpo.match(/p_expected_phase not in \(([^)]*)\)/i);
  expect(match, "allowlist de fail não encontrada").toBeTruthy();
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

const COMMENT_ON_FUNCTION_RE =
  /^comment\s+on\s+function\s+public\.(\w+)\s*\(([^)]*)\)\s+is\s+'((?:[^']|'')*)'\s*;/i;

function sqlForaDeCorpos(texto) {
  return texto.replace(/as \$\$[\s\S]*?\$\$;/gi, "as $$ $$;");
}

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
  return { parsed };
}

const corpoSmoke = corpoDaFuncao(sqlSemComentarios, SMOKE_FN);
const corpoSuccess = corpoDaFuncao(sqlSemComentarios, SUCCESS_FN);
const corpoRecover = corpoDaFuncao(sqlSemComentarios, RECOVER_FN);
const corpoFail = corpoDaFuncao(sqlSemComentarios, FAIL_FN);
const corpoSmoke157 = corpoDaFuncao(sql157SemComentarios, SMOKE_FN);
const corpoSuccess157 = corpoDaFuncao(sql157SemComentarios, SUCCESS_FN);
const corpoRecover157 = corpoDaFuncao(sql157SemComentarios, RECOVER_FN);
const corpoFail157 = corpoDaFuncao(sql157SemComentarios, FAIL_FN);
const corpoTransition153 = corpoDaFuncao(migration153SemComentarios, TRANSITION_FN);
const blocoSmoke = blocoCompletoDaFuncao(sqlSemComentarios, SMOKE_FN);
const blocoSuccess = blocoCompletoDaFuncao(sqlSemComentarios, SUCCESS_FN);
const blocoRecover = blocoCompletoDaFuncao(sqlSemComentarios, RECOVER_FN);
const blocoFail = blocoCompletoDaFuncao(sqlSemComentarios, FAIL_FN);
const argsSmoke = listaArgs(performTransitionArgs(corpoSmoke));
const argsSuccess = listaArgs(performTransitionArgs(corpoSuccess));
const argsRecover = listaArgs(performTransitionArgs(corpoRecover));
const argsFail = listaArgs(performTransitionArgs(corpoFail));
const precheck = blocoDo(sqlSemComentarios, 0);
const postcheck = blocoDo(sqlSemComentarios, 1);
const sqlApply = sqlForaDeCorpos(sqlSemComentarios);
const foraDasFuncoes = sqlSemComentarios
  .replace(blocoSmoke, "")
  .replace(blocoSuccess, "")
  .replace(blocoRecover, "")
  .replace(blocoFail, "");
const { parsed: comments158 } = commentsOnFunctionExecutaveis(sql);
const { parsed: comments157 } = commentsOnFunctionExecutaveis(sql157);
const comments158PorNome = Object.fromEntries(
  comments158.filter((c) => c.valid).map((c) => [c.name, c]),
);
const comments157PorNome = Object.fromEntries(
  comments157.filter((c) => c.valid).map((c) => [c.name, c]),
);

describe("migration 158 — 157 imutável", () => {
  it("migration157 permanece inalterada (diff vazio + blob + SHA256 LF)", () => {
    execFileSync("git", ["diff", "--exit-code", "--", sql157Path], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const blobSha = execFileSync("git", ["rev-parse", `HEAD:${sql157Path}`], {
      encoding: "utf8",
    }).trim();
    expect(blobSha).toBe(MIGRATION157_BLOB);

    const blobContent = execFileSync("git", ["cat-file", "-p", MIGRATION157_BLOB]);
    expect(createHash("sha256").update(blobContent).digest("hex")).toBe(MIGRATION157_SHA256);

    const workingLf = normalizeLf(sql157);
    expect(createHash("sha256").update(workingLf, "utf8").digest("hex")).toBe(MIGRATION157_SHA256);
  });
});

describe("migration 158 — existência e transação", () => {
  it("arquivo 158 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^158[_.]/.test(f));
    expect(arquivos).toEqual(["158_maintenance_smoke_recovery_reconciliation.sql"]);
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

describe("migration 158 — history 157 precheck", () => {
  it("exige exatamente 1 history por name 157_maintenance_smoke_recovery_orchestration", () => {
    expect(precheck).toMatch(/supabase_migrations\.schema_migrations/i);
    expect(precheck).toMatch(/name = '157_maintenance_smoke_recovery_orchestration'/i);
    expect(precheck).toMatch(/esperado exatamente 1 history name=157_maintenance_smoke_recovery_orchestration/i);
    expect(precheck).toMatch(/v_history157 is distinct from 1/i);
    const idxHistory = precheck.search(/supabase_migrations\.schema_migrations/i);
    const idxCreate = sqlSemComentarios.search(/create\s+or\s+replace\s+function/i);
    expect(idxHistory).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(sqlSemComentarios.search(/do\s+\$\$/i));
  });

  it("não fixa version ruim do HML nem payload forense", () => {
    expect(sqlSemComentarios).not.toMatch(/20260917185644/);
    expect(sql).not.toMatch(/20260917185644/);
    expect(sqlSemComentarios).not.toMatch(/\b1657\b/);
    expect(precheck).not.toMatch(/idempotency_key/i);
    expect(precheck).not.toMatch(/\brollback\b/i);
    expect(precheck).not.toMatch(/created_by/i);
    expect(precheck).not.toMatch(/array_length\s*\(\s*statements/i);
  });
});

describe("migration 158 — precheck estrutural", () => {
  it("valida state, events, release_runs, transition_internal, barrier, guard e fail", () => {
    expect(precheck).toMatch(/app_maintenance_state não existe/i);
    expect(precheck).toMatch(/app_maintenance_events não existe/i);
    expect(precheck).toMatch(/app_release_runs não existe/i);
    expect(precheck).toMatch(new RegExp(`public\\.${TRANSITION_FN}\\([^)]*\\)\\s+não existe`, "i"));
    expect(precheck).toMatch(new RegExp(`${BARRIER_FN}\\(boolean\\) não existe`, "i"));
    expect(precheck).toMatch(new RegExp(`${GUARD_FN}\\(\\) não existe`, "i"));
    expect(precheck).toMatch(/binding_guard_trg ausente/i);
    expect(precheck).toMatch(/fail com assinatura canônica ausente ou incompatível/i);
  });

  it("valida id uuid, status text e target_sha text em app_release_runs", () => {
    expect(migration138).toMatch(/id\s+uuid\s+primary key/i);
    expect(migration138).toMatch(/status\s+text\s+not null/i);
    expect(migration138).toMatch(/target_sha\s+text\s+not null/i);
    expect(precheck).toMatch(/\('id'\s*,\s*'uuid'\)/i);
    expect(precheck).toMatch(/\('status'\s*,\s*'text'\)/i);
    expect(precheck).toMatch(/\('target_sha'\s*,\s*'text'\)/i);
  });

  it("valida 17 event types e 16 edges, inclusive as 4 B16", () => {
    expect(EVENT_TYPES_17).toHaveLength(17);
    expect(STRUCTURAL_EDGES).toHaveLength(16);
    expect(B16_EDGES).toHaveLength(4);
    expect(precheck).toMatch(/divergente do contrato canônico de 17 valores/i);
    expect(precheck).toMatch(/esperado validar 16 edges estruturais/i);
    for (const tipo of EVENT_TYPES_17) {
      expect(precheck).toContain(`'${tipo}'`);
    }
    for (const [from, to] of STRUCTURAL_EDGES) {
      expect(precheck).toMatch(new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"));
    }
    for (const [from, to] of B16_EDGES) {
      expect(precheck).toMatch(new RegExp(`\\('${from}'\\s*,\\s*'${to}'\\)`, "i"));
    }
    expect(precheck).toMatch(/pg_advisory_xact_lock\(154, 1\)/i);
  });
});

describe("migration 158 — dual-state A/B fail-closed", () => {
  it("STATE A é permitido (0/3 RPCs B16 + fail antigo)", () => {
    expect(precheck).toMatch(/if v_rpc_present = 0 then/i);
    expect(precheck).toMatch(/STATE A exige fail antigo \(FENCING\/DRAINING\/QUIESCENT, sem RECOVERING\)/i);
    expect(precheck).toMatch(/v_fail_old/i);
    expect(precheck).toMatch(/FENCING.*DRAINING.*QUIESCENT/i);
  });

  it("STATE B é permitido (3/3 RPCs canônicas + fail com RECOVERING)", () => {
    expect(precheck).toMatch(/elsif v_rpc_present = 3 then/i);
    expect(precheck).toMatch(/STATE B exige fail final com RECOVERING/i);
    expect(precheck).toMatch(
      /to_regprocedure\(\s*'public\.app_maintenance_orchestration_smoke\(integer, uuid, text, text, jsonb\)'\s*\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\(\s*'public\.app_maintenance_orchestration_success\(integer, uuid, text, text, jsonb\)'\s*\)/i,
    );
    expect(precheck).toMatch(
      /to_regprocedure\(\s*'public\.app_maintenance_orchestration_recover\(integer, uuid, text, text, jsonb\)'\s*\)/i,
    );
    expect(precheck).toMatch(/marcadores semânticos incompatíveis com 157/i);
  });

  it("estado misto (1 ou 2 das 3 RPCs) é rejeitado", () => {
    expect(precheck).toMatch(/if v_rpc_present between 1 and 2 then/i);
    expect(precheck).toMatch(/estado misto bloqueado/i);
  });

  it("overload inesperado e assinatura incompatível são rejeitados", () => {
    expect(precheck).toMatch(/overload inesperado/i);
    expect(precheck).toMatch(/v_smoke_count > 1 or v_success_count > 1 or v_recover_count > 1 or v_fail_count > 1/i);
    expect(precheck).toMatch(/assinatura incompatível — smoke\/success\/recover STATE B/i);
    expect(precheck).toMatch(/fail com terceira semântica/i);
  });
});

describe("migration 158 — topologia CREATE OR REPLACE", () => {
  it("faz CREATE OR REPLACE das quatro funções smoke/success/recover/fail", () => {
    expect(nomesCreateOrReplace(sqlSemComentarios)).toEqual(ALL_4);
    expect(nomesCreateFunction(sqlSemComentarios)).toEqual([]);
    for (const fn of ALL_4) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });

  it("assinaturas canônicas: 3 públicas (integer,uuid,text,text,jsonb) e fail B12 (text,integer,uuid,text,text,jsonb)", () => {
    for (const fn of PUBLIC_RPCS) {
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
      expect(cabecaDaFuncao(sqlSemComentarios, fn)).toMatch(/returns\s+void/i);
      expect(sqlSemComentarios).toContain(`${fn}(${PUBLIC_SIG})`);
    }

    const tiposFail = [...assinaturaDaFuncao(sqlSemComentarios, FAIL_FN).matchAll(/p_(\w+)\s+(\w+)/gi)].map(
      (m) => [m[1].toLowerCase(), m[2].toLowerCase()],
    );
    expect(tiposFail).toEqual([
      ["expected_phase", "text"],
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["metadata", "jsonb"],
    ]);
    expect(cabecaDaFuncao(sqlSemComentarios, FAIL_FN)).toMatch(/returns\s+void/i);
    expect(sqlSemComentarios).toContain(`${FAIL_FN}(${FAIL_SIG})`);
  });
});

describe("migration 158 — corpos derivados da 157", () => {
  it("smoke body é semanticamente derivado da 157", () => {
    expect(normalizeLf(corpoSmoke)).toBe(normalizeLf(corpoSmoke157));
    expect(argsSmoke[0]).toBe("'RELEASING'");
    expect(argsSmoke[2]).toBe("'SMOKE'");
    expect(argsSmoke[8]).toBe("'SMOKE_STARTED'");
    expect(argsSmoke[9]).toBe("'api'");
  });

  it("success body é semanticamente derivado da 157", () => {
    expect(normalizeLf(corpoSuccess)).toBe(normalizeLf(corpoSuccess157));
    expect(argsSuccess[0]).toBe("'SMOKE'");
    expect(argsSuccess[2]).toBe("'NORMAL'");
    expect(argsSuccess[8]).toBe("'MAINTENANCE_COMPLETED'");
    expect(argsSuccess[9]).toBe("'api'");
  });

  it("recover body é semanticamente derivado da 157", () => {
    expect(normalizeLf(corpoRecover)).toBe(normalizeLf(corpoRecover157));
    expect(argsRecover[0]).toBe("'SMOKE'");
    expect(argsRecover[2]).toBe("'RECOVERING'");
    expect(argsRecover[8]).toBe("'RECOVERY_STARTED'");
    expect(argsRecover[9]).toBe("'api'");
  });

  it("fail final é semanticamente igual à 157", () => {
    expect(normalizeLf(corpoFail)).toBe(normalizeLf(corpoFail157));
    expect(allowlistFail(corpoFail)).toMatch(/'FENCING'/);
    expect(allowlistFail(corpoFail)).toMatch(/'DRAINING'/);
    expect(allowlistFail(corpoFail)).toMatch(/'QUIESCENT'/);
    expect(allowlistFail(corpoFail)).toMatch(/'RECOVERING'/);
    expect(argsFail[2]).toBe("'FAILED'");
    expect(argsFail[8]).toBe("'MAINTENANCE_FAILED'");
    expect(argsFail[9]).toBe("'api'");
  });

  it("COMMENTs das 4 funções correspondem aos finais da 157", () => {
    for (const fn of ALL_4) {
      expect(comments157PorNome[fn], `COMMENT canônico ausente na 157: ${fn}`).toBeTruthy();
      expect(comments158PorNome[fn], `COMMENT ausente na 158: ${fn}`).toBeTruthy();
      expect(comments158PorNome[fn].literal).toBe(comments157PorNome[fn].literal);
    }
  });
});

describe("migration 158 — eventos, binding, version e epoch", () => {
  it("smoke emite SMOKE_STARTED e preserva binding", () => {
    expect(argsSmoke[8]).toBe("'SMOKE_STARTED'");
    expect(argsSmoke[3]).toBe("null");
    expect(argsSmoke[4]).toBe("null");
    expect(corpoSmoke).not.toMatch(/release_id\s*=/i);
    expect(corpoSmoke).not.toMatch(/target_sha\s*=/i);
  });

  it("success emite MAINTENANCE_COMPLETED e limpa binding somente via core", () => {
    expect(argsSuccess[8]).toBe("'MAINTENANCE_COMPLETED'");
    expect(corpoSuccess).not.toMatch(/release_id\s*=/i);
    expect(corpoSuccess).not.toMatch(/target_sha\s*=/i);
    expect(corpoTransition153).toMatch(/p_expected_phase = 'SMOKE' and p_to_phase = 'NORMAL'/i);
  });

  it("recover emite RECOVERY_STARTED e preserva binding", () => {
    expect(argsRecover[8]).toBe("'RECOVERY_STARTED'");
    expect(argsRecover[3]).toBe("null");
    expect(argsRecover[4]).toBe("null");
    expect(corpoRecover).not.toMatch(/release_id\s*=/i);
    expect(corpoRecover).not.toMatch(/target_sha\s*=/i);
  });

  it("fail emite MAINTENANCE_FAILED, aceita RECOVERING e preserva binding", () => {
    expect(argsFail[8]).toBe("'MAINTENANCE_FAILED'");
    expect(allowlistFail(corpoFail)).toMatch(/'RECOVERING'/);
    expect(argsFail[3]).toBe("null");
    expect(argsFail[4]).toBe("null");
    expect(corpoFail).not.toMatch(new RegExp(BARRIER_FN, "i"));
  });

  it("version +1 somente core e epoch inalterado nas 4 RPCs", () => {
    for (const corpo of [corpoSmoke, corpoSuccess, corpoRecover, corpoFail]) {
      expect(corpo).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
      expect(corpo).not.toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    }
  });
});

describe("migration 158 — zero DML de apply e zero write em app_release_runs", () => {
  it("zero UPDATE/INSERT/DELETE em app_release_runs no arquivo 158", () => {
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "update")).toBe(0);
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "insert")).toBe(0);
    expect(contarDmlAppReleaseRuns(sqlSemComentarios, "delete")).toBe(0);
    for (const corpo of [corpoSmoke, corpoSuccess, corpoRecover, corpoFail]) {
      expect(contarDmlAppReleaseRuns(corpo, "update")).toBe(0);
      expect(contarDmlAppReleaseRuns(corpo, "insert")).toBe(0);
      expect(contarDmlAppReleaseRuns(corpo, "delete")).toBe(0);
    }
  });

  it("runtime DML de apply = 0 (sem INSERT/UPDATE/DELETE/TRUNCATE fora dos corpos)", () => {
    expect(foraDasFuncoes).not.toMatch(/^\s*insert\s+into/im);
    expect(foraDasFuncoes).not.toMatch(/^\s*update\s+public\./im);
    expect(foraDasFuncoes).not.toMatch(/^\s*delete\s+from/im);
    expect(sqlApply).not.toMatch(/insert\s+into\s+public\.app_maintenance_state/i);
    expect(sqlApply).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
    expect(sqlApply).not.toMatch(/insert\s+into\s+public\.app_maintenance_operations/i);
    expect(sqlApply).not.toMatch(/insert\s+into\s+public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/^\s*truncate\s+/im);
  });

  it("não cria timeout writer nem scheduler", () => {
    expect(sqlSemComentarios).not.toMatch(/timeout_at\s*=/i);
    expect(sqlSemComentarios).not.toMatch(/pg_cron/i);
    expect(sqlSemComentarios).not.toMatch(/cron\./i);
    expect(sqlSemComentarios).not.toMatch(/scheduler/i);
    expect(sqlSemComentarios).not.toMatch(/pg_net/i);
  });
});

describe("migration 158 — security, ACL e postcheck", () => {
  it("owner postgres, SECURITY DEFINER e search_path public nas 4", () => {
    for (const fn of ALL_4) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${fn}\\([^)]*\\) owner to postgres`, "i"),
      );
    }
  });

  it("ACL service_role only nas 4 públicas", () => {
    const sigs = [
      `${SMOKE_FN}\\(${PUBLIC_SIG}\\)`,
      `${SUCCESS_FN}\\(${PUBLIC_SIG}\\)`,
      `${RECOVER_FN}\\(${PUBLIC_SIG}\\)`,
      `${FAIL_FN}\\(${FAIL_SIG}\\)`,
    ];
    for (const sig of sigs) {
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

  it("helpers internos não ganham EXECUTE service_role", () => {
    for (const fn of INTERNAL_HELPERS) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}`, "i"),
      );
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
    expect(postcheck).toMatch(/helper interno não deveria ter EXECUTE para anon\/authenticated\/service_role/i);
  });

  it("postcheck prova as 4 funções, RECOVERING no fail e 17/16 contratos", () => {
    expect(postcheck).toMatch(/esperado exatamente 1 função %, zero overload/i);
    expect(postcheck).toMatch(/fail deveria permitir FENCING\/DRAINING\/QUIESCENT\/RECOVERING/i);
    expect(postcheck).toMatch(/smoke deveria emitir SMOKE_STARTED/i);
    expect(postcheck).toMatch(/success deveria emitir MAINTENANCE_COMPLETED/i);
    expect(postcheck).toMatch(/recover deveria emitir RECOVERY_STARTED/i);
    expect(postcheck).toMatch(/17 valores/i);
    expect(postcheck).toMatch(/16 edges estruturais/i);
    expect(postcheck).toMatch(/owner deveria ser postgres/i);
    expect(postcheck).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(postcheck).toMatch(/search_path=public/i);
    expect(postcheck).toMatch(/return type deveria ser void/i);
  });
});

describe("migration 158 — zero edge/event/column nova e B17-B19 fora", () => {
  it("zero nova edge, event type ou coluna", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(nomesCreateOrReplace(sqlSemComentarios)).toEqual(ALL_4);
    expect(EVENT_TYPES_17).toHaveLength(17);
    expect(STRUCTURAL_EDGES).toHaveLength(16);
  });

  it("não implementa abort/reopen/rehearsal/readiness/notice_tick", () => {
    for (const fn of [ABORT_FN, REOPEN_FN, REHEARSAL_FN, READINESS_FN, NOTICE_TICK_FN]) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });

  it("API/UI permanecem intocados", () => {
    expect(sqlSemComentarios).not.toMatch(/api\/maintenance/i);
    expect(sqlSemComentarios).not.toMatch(/MaintenanceAdmin/i);
    expect(sqlSemComentarios).not.toMatch(/App\.jsx/i);
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
