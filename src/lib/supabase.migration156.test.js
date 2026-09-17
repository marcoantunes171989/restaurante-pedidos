import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/156_maintenance_notice_orchestration.sql";
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

const TRANSITION_FN = "app_maintenance_orchestration_transition_internal";
const GUARD_FN = "app_maintenance_orchestration_binding_guard";
const START_FN = "app_maintenance_orchestration_start";
const CANCEL_FN = "app_maintenance_orchestration_cancel";
const FAIL_FN = "app_maintenance_orchestration_fail";
const FENCE_FN = "app_maintenance_orchestration_fence";
const DRAIN_START_FN = "app_maintenance_orchestration_drain_start";
const QUIESCE_FN = "app_maintenance_orchestration_quiesce";
const PROBE_FN = "app_maintenance_orchestration_quiescence_probe";
const RELEASE_START_FN = "app_maintenance_orchestration_release_start";
const NOTICE_FN = "app_maintenance_orchestration_notice";
const NOTICE_TICK_FN = "app_maintenance_orchestration_notice_tick";

const NOTICE_SIGNATURE_TYPES = "integer, uuid, text, text, text, timestamptz, jsonb";

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function blocoCompletoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$[\\s\\S]*?\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `bloco completo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[0];
}

function assinaturaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `assinatura de ${nomeFuncao} não encontrada`).toBeTruthy();
  return match[1];
}

function cabecaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(`create function public\\.${nomeFuncao}[\\s\\S]*?as \\$\\$`, "i");
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

const corpoNotice = corpoDaFuncao(sqlSemComentarios, NOTICE_FN);
const blocoNotice = blocoCompletoDaFuncao(sqlSemComentarios, NOTICE_FN);
const assinaturaNotice = assinaturaDaFuncao(sqlSemComentarios, NOTICE_FN);
const cabecaNotice = cabecaDaFuncao(sqlSemComentarios, NOTICE_FN);
const argsTransition = performTransitionArgs(corpoNotice);
const listaArgsTransition = listaArgs(argsTransition);

const foraDaFuncaoNotice = sqlSemComentarios.replace(blocoNotice, "");

describe("migration 156 — existência e transação", () => {
  it("arquivo 156 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^156[_.]/.test(f));
    expect(arquivos).toEqual(["156_maintenance_notice_orchestration.sql"]);
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

  it("migrations 140-155 permanecem intocadas (exatamente 1 arquivo por número)", () => {
    for (let n = 140; n <= 155; n += 1) {
      const arquivos = readdirSync("supabase/migrations").filter((f) =>
        new RegExp(`^${n}[_.]`).test(f),
      );
      expect(arquivos.length, `migration ${n} deveria ter exatamente 1 arquivo`).toBe(1);
    }
  });

  it("não modifica a migration140 nem a migration153 (arquivos preservados)", () => {
    expect(migration140).toMatch(/create table public\.app_maintenance_state/i);
    expect(migration153).toMatch(
      new RegExp(`create function public\\.${TRANSITION_FN}`, "i"),
    );
  });
});

describe("migration 156 — precheck/postcheck fail-closed", () => {
  it("possui precheck 156 antes do CREATE FUNCTION e postcheck 156 antes do COMMIT", () => {
    expect(sql).toMatch(/precheck 156/i);
    expect(sql).toMatch(/postcheck 156/i);
    const idxPrecheck = sql.search(/precheck 156/i);
    const idxCreate = sql.search(new RegExp(`create function public\\.${NOTICE_FN}`, "i"));
    const idxPostcheck = sql.search(/postcheck 156/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
    expect(idxPostcheck).toBeGreaterThan(idxCreate);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("precheck valida dependências reais: app_maintenance_state, transition_internal, NOTICE_STARTED e ausência prévia da RPC", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state não existe/i);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`public\\.${TRANSITION_FN}\\([^)]*\\)\\s+não existe`, "i"),
    );
    expect(sqlSemComentarios).toMatch(/NOTICE_STARTED deveria já ser permitido/i);
    expect(sqlSemComentarios).toMatch(
      new RegExp(`public\\.${NOTICE_FN}\\([^)]*\\)\\s+já existe`, "i"),
    );
    expect(sqlSemComentarios).toMatch(/colisão de nome/i);
  });

  it("postcheck valida contagem exata (1, zero overload), assinatura, owner, security, search_path e ACL", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 função app_maintenance_orchestration_notice/i);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/i);
    expect(sqlSemComentarios).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(sqlSemComentarios).toMatch(/proconfig deveria conter search_path=public/i);
    expect(sqlSemComentarios).toMatch(/return type deveria ser void/i);
    expect(sqlSemComentarios).toMatch(/anon\/authenticated NÃO deveriam ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/service_role deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/PUBLIC NÃO deveria ter EXECUTE/i);
  });
});

describe("migration 156 — topologia exata (1 nova função, zero notice_tick)", () => {
  it("cria exatamente 1 função nova: app_maintenance_orchestration_notice", () => {
    const criadas = [
      ...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi),
    ].map((m) => m[1]);
    expect(criadas).toEqual([NOTICE_FN]);
  });

  it("não cria nem referencia app_maintenance_orchestration_notice_tick", () => {
    expect(sqlSemComentarios).not.toMatch(new RegExp(NOTICE_TICK_FN, "i"));
  });

  it("não cria RPC de fence/drain/quiesce/release_start/smoke/recovery/abort/reopen/reabertura", () => {
    for (const proibido of [
      FENCE_FN,
      DRAIN_START_FN,
      QUIESCE_FN,
      PROBE_FN,
      RELEASE_START_FN,
      "app_maintenance_orchestration_smoke",
      "app_maintenance_orchestration_recover",
      "app_maintenance_orchestration_success",
      "app_maintenance_orchestration_abort",
      "app_maintenance_orchestration_reopen",
    ]) {
      expect(sqlSemComentarios).not.toMatch(new RegExp(`create function public\\.${proibido}\\s*\\(`, "i"));
    }
  });

  it("não usa CREATE OR REPLACE em nenhuma função (não redefine funções existentes)", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+function/i);
  });

  it("não cria RPC pública genérica (advance/next/set_state/transition)", () => {
    for (const proibido of ["advance", "next", "set_state"]) {
      expect(NOTICE_FN.toLowerCase()).not.toContain(proibido);
    }
    expect(sqlSemComentarios).not.toMatch(/create function public\.app_maintenance_orchestration_transition\s*\(/i);
  });
});

describe("migration 156 — zero DDL estrutural e zero event type novo", () => {
  it("não cria tabela, coluna, índice, constraint ou policy nova", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+constraint/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+constraint/i);
  });

  it("não altera o contrato de event_type (continua exatamente 17 valores, nenhum ALTER TABLE ... event_type_check)", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_maintenance_events/i);
    for (const tipo of EVENT_TYPES_17) {
      expect(sqlSemComentarios).toContain(`'${tipo}'`);
    }
    const eventoUsado = argsTransition.split(",").map((s) => s.trim())[8];
    expect(eventoUsado).toBe("'NOTICE_STARTED'");
    expect(EVENT_TYPES_17).toContain("NOTICE_STARTED");
  });

  it("não cria nem altera trigger algum (binding_guard da migration 153 permanece único)", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+trigger/i);
  });
});

describe("migration 156 — zero DML de schema_migrations e zero apply-time business DML", () => {
  it("não referencia schema_migrations", () => {
    expect(sqlSemComentarios).not.toMatch(/schema_migrations/i);
  });

  it("não faz INSERT/UPDATE/DELETE fora do corpo da função (nenhuma mutação apply-time)", () => {
    expect(foraDaFuncaoNotice).not.toMatch(/^\s*insert\s+into/im);
    expect(foraDaFuncaoNotice).not.toMatch(/^\s*update\s+public\./im);
    expect(foraDaFuncaoNotice).not.toMatch(/^\s*delete\s+from/im);
  });

  it("não referencia domínios de negócio fora do orquestrador (pedidos, checkout, fiscal, nfce, cupons, dispositivos)", () => {
    for (const nome of [
      "tab_pedidos",
      "tab_caixas",
      "tab_dispositivos",
      "tab_cupons",
      "loja_fiscal_regra",
      "app_dispositivo_registrar",
      "app_sessao_heartbeat",
      "pub_criar_pedido",
    ]) {
      expect(sqlSemComentarios).not.toContain(nome);
    }
  });
});

describe("migration 156 — assinatura congelada", () => {
  it("assinatura exata: p_expected_version integer, p_actor_user_id uuid, p_actor_email text, p_reason text, p_message_public text, p_scheduled_for timestamptz, p_metadata jsonb", () => {
    const tipos = [...assinaturaNotice.matchAll(/p_(\w+)\s+(\w+)/gi)].map((m) => [
      m[1].toLowerCase(),
      m[2].toLowerCase(),
    ]);
    expect(tipos).toEqual([
      ["expected_version", "integer"],
      ["actor_user_id", "uuid"],
      ["actor_email", "text"],
      ["reason", "text"],
      ["message_public", "text"],
      ["scheduled_for", "timestamptz"],
      ["metadata", "jsonb"],
    ]);
  });

  it("return type é void", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(`create function public\\.${NOTICE_FN}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+void`, "i"),
    );
  });

  it("assinatura completa aparece registrada em REVOKE/GRANT/OWNER/comment/precheck/postcheck", () => {
    const assinaturaCompleta = `${NOTICE_FN}(${NOTICE_SIGNATURE_TYPES})`;
    expect(sqlSemComentarios).toContain(assinaturaCompleta);
    const ocorrencias = sqlSemComentarios.split(assinaturaCompleta).length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(5);
  });
});

describe("migration 156 — contrato NORMAL -> NOTICE", () => {
  it("lock order: SELECT ... FOR UPDATE em app_maintenance_state, scope='global'", () => {
    expect(corpoNotice).toMatch(
      /select phase, version, release_id, target_sha\s+into v_phase, v_version, v_release_id, v_target_sha\s+from public\.app_maintenance_state\s+where scope = 'global'\s+for update;/i,
    );
  });

  it("valida fail-closed phase=NORMAL antes de qualquer UPDATE", () => {
    const idxPhase = corpoNotice.search(/v_phase is distinct from 'NORMAL'/i);
    const idxUpdate = corpoNotice.search(/update\s+public\.app_maintenance_state/i);
    expect(idxPhase).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(idxPhase);
  });

  it("valida fail-closed version=p_expected_version (VERSION_CONFLICT) antes de qualquer UPDATE", () => {
    const idxVersion = corpoNotice.search(/v_version is distinct from p_expected_version/i);
    const idxUpdate = corpoNotice.search(/update\s+public\.app_maintenance_state/i);
    expect(idxVersion).toBeGreaterThan(-1);
    expect(corpoNotice).toMatch(/detail = 'VERSION_CONFLICT'/i);
    expect(idxUpdate).toBeGreaterThan(idxVersion);
  });

  it("exige binding ativo completo (release_id e target_sha NOT NULL) antes de qualquer UPDATE", () => {
    const idxBinding = corpoNotice.search(/v_release_id is null or v_target_sha is null/i);
    const idxUpdate = corpoNotice.search(/update\s+public\.app_maintenance_state/i);
    expect(idxBinding).toBeGreaterThan(-1);
    expect(corpoNotice).toMatch(/'Active orchestration binding required\.'/);
    expect(corpoNotice).toMatch(/detail = 'STATE_CONFLICT'/i);
    expect(idxUpdate).toBeGreaterThan(idxBinding);
  });

  it("escreve notice_started_at=clock_timestamp(), scheduled_for=input e message_public=input, sem version/epoch/phase, antes da transição", () => {
    const update = corpoNotice.match(
      /update\s+public\.app_maintenance_state\s+set([\s\S]*?)where scope = 'global';/i,
    );
    expect(update, "UPDATE dos campos NOTICE não encontrado").toBeTruthy();
    const setClause = update[1];
    expect(setClause).toMatch(/notice_started_at\s*=\s*clock_timestamp\(\)/i);
    expect(setClause).toMatch(/scheduled_for\s*=\s*p_scheduled_for/i);
    expect(setClause).toMatch(/message_public\s*=\s*p_message_public/i);
    expect(setClause).not.toMatch(/\bversion\s*=/i);
    expect(setClause).not.toMatch(/\bepoch\s*=/i);
    expect(setClause).not.toMatch(/\bphase\s*=/i);
    expect(setClause).not.toMatch(/\brelease_id\s*=/i);
    expect(setClause).not.toMatch(/\btarget_sha\s*=/i);

    const idxUpdate = corpoNotice.search(/update\s+public\.app_maintenance_state/i);
    const idxTransition = corpoNotice.search(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(idxTransition).toBeGreaterThan(idxUpdate);
  });

  it("chama transition_internal com NORMAL -> NOTICE, release/target null (preserva binding via core), reason, evento NOTICE_STARTED, source api", () => {
    expect(listaArgsTransition).toHaveLength(12);
    expect(listaArgsTransition[0]).toBe("'NORMAL'");
    expect(listaArgsTransition[1]).toBe("p_expected_version");
    expect(listaArgsTransition[2]).toBe("'NOTICE'");
    expect(listaArgsTransition[3]).toBe("null");
    expect(listaArgsTransition[4]).toBe("null");
    expect(listaArgsTransition[5]).toBe("p_actor_user_id");
    expect(listaArgsTransition[6]).toBe("p_actor_email");
    expect(listaArgsTransition[7]).toBe("p_reason");
    expect(listaArgsTransition[8]).toBe("'NOTICE_STARTED'");
    expect(listaArgsTransition[9]).toBe("'api'");
    expect(listaArgsTransition[10]).toBe("p_reason");
    expect(listaArgsTransition[11]).toBe("p_metadata");
  });

  it("não faz nenhum INSERT em app_maintenance_events diretamente (delega ao core)", () => {
    expect(corpoNotice).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
  });

  it("não incrementa epoch em lugar nenhum do corpo", () => {
    expect(corpoNotice).not.toMatch(/epoch\s*=\s*epoch\s*\+\s*1/i);
    expect(corpoNotice).not.toMatch(/\bepoch\s*=/i);
  });

  it("não incrementa version diretamente (somente via transition_internal)", () => {
    expect(corpoNotice).not.toMatch(/version\s*=\s*version\s*\+\s*1/i);
  });

  it("binding preservado: corpo não escreve release_id/target_sha e passa null/null para o core", () => {
    expect(corpoNotice).not.toMatch(/release_id\s*=\s*p_/i);
    expect(corpoNotice).not.toMatch(/target_sha\s*=\s*p_/i);
    expect(corpoNotice).not.toMatch(/release_id\s*=\s*v_release_id/i);
    expect(corpoNotice).not.toMatch(/target_sha\s*=\s*v_target_sha/i);
  });

  it("usa p_expected_version tanto no CAS local quanto no perform de transition_internal", () => {
    expect(corpoNotice).toMatch(/v_version is distinct from p_expected_version/i);
    expect(listaArgsTransition[1]).toBe("p_expected_version");
  });

  it("é fail-closed: NOT_FOUND, STATE_CONFLICT e VERSION_CONFLICT usam errcode P0001", () => {
    const raises = corpoNotice.match(/raise exception[\s\S]*?using errcode = 'P0001', detail = '(\w+)';/gi) || [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
    expect(corpoNotice).toMatch(/detail = 'NOT_FOUND'/i);
    expect(corpoNotice).toMatch(/detail = 'STATE_CONFLICT'/i);
    expect(corpoNotice).toMatch(/detail = 'VERSION_CONFLICT'/i);
  });
});

describe("migration 156 — ACL e SECURITY DEFINER", () => {
  it("REVOKE ALL de public/anon/authenticated/service_role e GRANT EXECUTE somente para service_role", () => {
    const sig = `${NOTICE_FN}\\(${NOTICE_SIGNATURE_TYPES}\\)`;
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`revoke all on function public\\.${sig} from ${role}`, "i"),
      );
    }
    expect(sqlSemComentarios).toMatch(
      new RegExp(`grant execute on function public\\.${sig} to service_role`, "i"),
    );
    const grants = sqlSemComentarios.match(/grant execute on function[^;]*;/gi) || [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/\banon\b/i);
    expect(grants[0]).not.toMatch(/\bauthenticated\b/i);
    expect(grants[0]).toMatch(/\bservice_role\b/i);
  });

  it("owner postgres, SECURITY DEFINER e search_path=public", () => {
    const sig = `${NOTICE_FN}\\(${NOTICE_SIGNATURE_TYPES}\\)`;
    expect(sqlSemComentarios).toMatch(
      new RegExp(`alter function public\\.${sig} owner to postgres`, "i"),
    );
    expect(cabecaNotice).toMatch(/security definer/i);
    expect(cabecaNotice).toMatch(/set search_path\s*=\s*public/i);
    expect(cabecaNotice).toMatch(/language plpgsql/i);
    expect(cabecaNotice).toMatch(/volatile/i);
  });
});

describe("migration 156 — testes históricos 154/155 e funções B12/B13 intocadas", () => {
  it("não redefine app_maintenance_orchestration_cancel", () => {
    expect(sqlSemComentarios).not.toMatch(
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${CANCEL_FN}\\s*\\(`, "i"),
    );
  });

  it("não redefine nenhuma função das migrations 140-155 (start/cancel/fail/transition_internal/binding_guard/fence/drain_start/quiesce/probe/release_start)", () => {
    for (const fn of [
      TRANSITION_FN,
      GUARD_FN,
      START_FN,
      CANCEL_FN,
      FAIL_FN,
      FENCE_FN,
      DRAIN_START_FN,
      QUIESCE_FN,
      PROBE_FN,
      RELEASE_START_FN,
    ]) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });

  it("os testes históricos 154/155 continuam listando app_maintenance_orchestration_notice como função B14 ainda não implementada por eles", () => {
    const teste154 = readFileSync("src/lib/supabase.migration154.test.js", "utf8");
    const teste155 = readFileSync("src/lib/supabase.migration155.test.js", "utf8");
    expect(teste154).toContain("app_maintenance_orchestration_notice");
    expect(teste155).toContain("app_maintenance_orchestration_notice");
  });
});

describe("migration 156 — proibições explícitas de escopo", () => {
  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });

  it("não adiciona verificação de super_admin em SQL", () => {
    expect(sqlSemComentarios).not.toMatch(/super_admin/i);
  });

  it("não inventa validação de scheduled_for futuro, message_public não vazio ou limites de caracteres", () => {
    expect(sqlSemComentarios).not.toMatch(/scheduled_for\s*[<>]/i);
    expect(sqlSemComentarios).not.toMatch(/length\(\s*p_message_public/i);
    expect(sqlSemComentarios).not.toMatch(/p_message_public\s*(is null|=\s*'')/i);
    expect(sqlSemComentarios).not.toMatch(/char_length/i);
  });

  it("não cria idempotency key nova", () => {
    expect(sqlSemComentarios).not.toMatch(/idempotency/i);
  });
});
