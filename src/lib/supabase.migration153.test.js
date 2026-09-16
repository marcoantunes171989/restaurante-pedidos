import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/153_maintenance_release_orchestration_core.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration138 = readFileSync("supabase/migrations/138_release_control_plane.sql", "utf8");

const OLD_EVENT_TYPES = [
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
];

const NEW_EVENT_TYPE = "ORCHESTRATION_STARTED";

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
const START_FN = "app_maintenance_orchestration_start";
const CANCEL_FN = "app_maintenance_orchestration_cancel";
const FAIL_FN = "app_maintenance_orchestration_fail";

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

const corpoTransition = corpoDaFuncao(sqlSemComentarios, TRANSITION_FN);
const corpoGuard = corpoDaFuncao(sqlSemComentarios, GUARD_FN);
const corpoStart = corpoDaFuncao(sqlSemComentarios, START_FN);
const corpoCancel = corpoDaFuncao(sqlSemComentarios, CANCEL_FN);
const corpoFail = corpoDaFuncao(sqlSemComentarios, FAIL_FN);

describe("migration 153 — existência e transação", () => {
  it("arquivo 153 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^153[_.]/.test(f));
    expect(arquivos).toEqual(["153_maintenance_release_orchestration_core.sql"]);
  });

  it("é transacional (BEGIN/COMMIT), sem ROLLBACK executável", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
    expect(sqlSemComentarios).not.toMatch(/^\s*rollback\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("não modifica a migration140 (arquivo preservado, contrato antigo de 16 valores intacto)", () => {
    expect(migration140).toMatch(/create table public\.app_maintenance_state/i);
    expect(migration140).toMatch(/constraint app_maintenance_events_event_type_check/i);
    for (const tipo of OLD_EVENT_TYPES) {
      expect(migration140).toContain(`'${tipo}'`);
    }
    expect(migration140).not.toContain(NEW_EVENT_TYPE);
    const arquivos140 = readdirSync("supabase/migrations").filter((f) => /^140[_.]/.test(f));
    expect(arquivos140).toEqual(["140_maintenance_state.sql"]);
  });

  it("não modifica a migration138 (arquivo preservado)", () => {
    expect(migration138).toMatch(/create table public\.app_release_runs/i);
    const arquivos138 = readdirSync("supabase/migrations").filter((f) => /^138[_.]/.test(f));
    expect(arquivos138).toEqual(["138_release_control_plane.sql"]);
  });

  it("migrations 140-152 permanecem intocadas (nenhum arquivo extra ou renomeado)", () => {
    for (let n = 140; n <= 152; n += 1) {
      const arquivos = readdirSync("supabase/migrations").filter((f) =>
        new RegExp(`^${n}[_.]`).test(f),
      );
      expect(arquivos.length, `migration ${n} deveria ter exatamente 1 arquivo`).toBe(1);
    }
  });
});

describe("migration 153 — precheck fail-closed do contrato de event_type", () => {
  it("possui precheck 153 antes do DROP CONSTRAINT", () => {
    expect(sql).toMatch(/precheck 153/i);
    const idxPrecheck = sql.search(/precheck 153/i);
    const idxDrop = sql.search(/drop constraint app_maintenance_events_event_type_check/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxDrop).toBeGreaterThan(idxPrecheck);
  });

  it("valida existência de app_maintenance_state, app_maintenance_events e app_release_runs", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state não existe/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_events não existe/i);
    expect(sqlSemComentarios).toMatch(/app_release_runs não existe/i);
  });

  it("prova que a constraint é CHECK e que ORCHESTRATION_STARTED ainda não é permitido", () => {
    expect(sqlSemComentarios).toMatch(/deveria ser CHECK constraint/i);
    expect(sqlSemComentarios).toMatch(/ORCHESTRATION_STARTED já é permitido/i);
    expect(sqlSemComentarios).toMatch(/position\('ORCHESTRATION_STARTED' in v_condef\)/i);
  });

  it("compara o contrato antigo (16 valores) por igualdade textual exata (drift fail-closed)", () => {
    expect(sqlSemComentarios).toMatch(/divergente do contrato canônico de 16 valores/i);
    const constanteAntiga = sqlSemComentarios.match(
      /v_old_event_type_condef constant text :=\s*\n?\s*'([^']*(?:''[^']*)*)'/i,
    );
    expect(constanteAntiga, "constante v_old_event_type_condef não encontrada").toBeTruthy();
    const valorAntigo = constanteAntiga[1];
    for (const tipo of OLD_EVENT_TYPES) {
      expect(valorAntigo).toContain(tipo);
    }
    expect(valorAntigo).not.toContain(NEW_EVENT_TYPE);
  });

  it("bloqueia colisão de nome das 5 funções e do trigger antes de criá-las", () => {
    expect(sqlSemComentarios).toMatch(/colisão — alguma das funções do orchestration core já existe/i);
    expect(sqlSemComentarios).toMatch(
      /proname in \(\s*'app_maintenance_orchestration_transition_internal',\s*'app_maintenance_orchestration_binding_guard',\s*'app_maintenance_orchestration_start',\s*'app_maintenance_orchestration_cancel',\s*'app_maintenance_orchestration_fail'\s*\)/i,
    );
    expect(sqlSemComentarios).toMatch(/colisão — trigger app_maintenance_orchestration_binding_guard_trg já existe/i);
  });
});

describe("migration 153 — event type contract (16 -> 17, monotônico)", () => {
  it("faz exatamente 1 DROP CONSTRAINT e 1 ADD CONSTRAINT do event_type check", () => {
    const drops = sqlSemComentarios.match(
      /drop constraint app_maintenance_events_event_type_check/gi,
    ) || [];
    const adds = sqlSemComentarios.match(
      /add constraint app_maintenance_events_event_type_check/gi,
    ) || [];
    expect(drops).toHaveLength(1);
    expect(adds).toHaveLength(1);
  });

  it("novo CHECK é superset exato dos 16 antigos + ORCHESTRATION_STARTED (nenhum removido, nenhum 18º criado)", () => {
    const addBlock = sqlSemComentarios.match(
      /add constraint app_maintenance_events_event_type_check\s*check\s*\(event_type in\s*\(([\s\S]*?)\)\)/i,
    );
    expect(addBlock, "bloco do novo CHECK não encontrado").toBeTruthy();
    const valores = [...addBlock[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(valores).toHaveLength(17);
    expect(new Set(valores)).toEqual(new Set([...OLD_EVENT_TYPES, NEW_EVENT_TYPE]));
    for (const tipo of OLD_EVENT_TYPES) {
      expect(valores).toContain(tipo);
    }
    expect(valores.filter((v) => v === NEW_EVENT_TYPE)).toHaveLength(1);
  });

  it("não altera migration140 nem faz CREATE OR REPLACE de constraint (única alteração é na 153)", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace.*constraint/i);
    expect(migration140).not.toContain(NEW_EVENT_TYPE);
  });

  it("não faz UPDATE/DELETE/INSERT de dados históricos para adequar rows existentes", () => {
    const antesDoCore = sqlSemComentarios.slice(
      0,
      sqlSemComentarios.search(new RegExp(`create function public\\.${TRANSITION_FN}`, "i")),
    );
    expect(antesDoCore).not.toMatch(/update\s+public\.app_maintenance_events/i);
    expect(antesDoCore).not.toMatch(/delete\s+from\s+public\.app_maintenance_events/i);
    expect(antesDoCore).not.toMatch(/insert\s+into\s+public\.app_maintenance_events/i);
  });
});

describe("migration 153 — START usa ORCHESTRATION_STARTED, nunca RELEASE_STARTED", () => {
  it("START insere exatamente 1 evento ORCHESTRATION_STARTED", () => {
    const ocorrencias = corpoStart.match(/'ORCHESTRATION_STARTED'/g) || [];
    expect(ocorrencias).toHaveLength(1);
    const inserts = corpoStart.match(/insert\s+into\s+public\.app_maintenance_events/gi) || [];
    expect(inserts).toHaveLength(1);
  });

  it("corpo do START não usa RELEASE_STARTED", () => {
    expect(corpoStart).not.toMatch(/RELEASE_STARTED/i);
  });

  it("ORCHESTRATION_STARTED não é usado para representar NOTICE/FENCING/DRAINING/RELEASING/SMOKE/RECOVERY/CANCEL/FAIL", () => {
    expect(corpoCancel).not.toMatch(/ORCHESTRATION_STARTED/i);
    expect(corpoFail).not.toMatch(/ORCHESTRATION_STARTED/i);
    expect(corpoTransition).not.toMatch(/'ORCHESTRATION_STARTED'/);
  });

  it("RELEASE_STARTED permanece reservado para QUIESCENT->RELEASING (não emitido pelas funções desta migration)", () => {
    expect(corpoStart).not.toMatch(/'RELEASE_STARTED'/);
    expect(corpoCancel).not.toMatch(/'RELEASE_STARTED'/);
    expect(corpoFail).not.toMatch(/'RELEASE_STARTED'/);
    expect(corpoTransition).not.toMatch(/'RELEASE_STARTED'/);
  });

  it("CANCEL usa MAINTENANCE_CANCELED e FAIL usa MAINTENANCE_FAILED como event_type", () => {
    expect(corpoCancel).toMatch(/'MAINTENANCE_CANCELED'/);
    expect(corpoFail).toMatch(/'MAINTENANCE_FAILED'/);
  });
});

describe("migration 153 — topologia exata (2 privadas, 3 públicas, 1 trigger)", () => {
  it("cria exatamente 5 funções (nenhuma a mais) com os nomes esperados", () => {
    const criadas = [
      ...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi),
    ].map((m) => m[1]);
    expect(new Set(criadas)).toEqual(
      new Set([TRANSITION_FN, GUARD_FN, START_FN, CANCEL_FN, FAIL_FN]),
    );
    expect(criadas).toHaveLength(5);
  });

  it("cria exatamente 1 trigger, BEFORE UPDATE FOR EACH ROW em app_maintenance_state", () => {
    const triggers = sqlSemComentarios.match(/create trigger/gi) || [];
    expect(triggers).toHaveLength(1);
    expect(sqlSemComentarios).toMatch(
      /create trigger app_maintenance_orchestration_binding_guard_trg\s*before update on public\.app_maintenance_state\s*for each row/i,
    );
  });

  it("não cria start_internal, cancel_internal ou fail_internal", () => {
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_start_internal/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_cancel_internal/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_fail_internal/i);
  });

  it("não cria RPC pública genérica (advance/next/set_state/transition)", () => {
    const criadas = [
      ...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi),
    ].map((m) => m[1]);
    for (const proibido of ["advance", "next", "set_state"]) {
      expect(criadas.some((nome) => nome.toLowerCase().includes(proibido))).toBe(false);
    }
    expect(criadas).not.toContain("app_maintenance_orchestration_transition");
  });

  it("não cria tabela, coluna, índice ou policy nova", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
  });
});

describe("migration 153 — matriz estrutural de 16 edges exatas", () => {
  it("transition_internal valida exatamente as 16 edges (sem self-edge, sem wildcard)", () => {
    expect(STRUCTURAL_EDGES).toHaveLength(16);
    for (const [from, to] of STRUCTURAL_EDGES) {
      expect(corpoTransition).toMatch(new RegExp(`\\('${from}',\\s*'${to}'\\)`, "i"));
      expect(from).not.toBe(to);
    }
    const edgesEncontradas = [
      ...corpoTransition.matchAll(/\('([A-Z]+)',\s*'([A-Z]+)'\)/g),
    ].map((m) => [m[1], m[2]]);
    expect(edgesEncontradas).toHaveLength(16);
  });

  it("FAILED e CANCELED não têm nenhuma edge de saída (terminais)", () => {
    const edgesEncontradas = [
      ...corpoTransition.matchAll(/\('([A-Z]+)',\s*'([A-Z]+)'\)/g),
    ].map((m) => [m[1], m[2]]);
    expect(edgesEncontradas.filter(([from]) => from === "FAILED")).toHaveLength(0);
    expect(edgesEncontradas.filter(([from]) => from === "CANCELED")).toHaveLength(0);
  });

  it("QUIESCENT->FAILED e QUIESCENT->RELEASING estão presentes na matriz", () => {
    expect(corpoTransition).toMatch(/\('QUIESCENT',\s*'FAILED'\)/i);
    expect(corpoTransition).toMatch(/\('QUIESCENT',\s*'RELEASING'\)/i);
  });

  it("START (NORMAL->NORMAL) está fora da matriz estrutural (não aparece na lista de edges)", () => {
    expect(corpoTransition).not.toMatch(/\('NORMAL',\s*'NORMAL'\)/i);
  });

  it("START não chama transition_internal (edge NORMAL->NORMAL não é estrutural)", () => {
    expect(corpoStart).not.toMatch(new RegExp(TRANSITION_FN, "i"));
  });

  it("CANCEL e FAIL delegam ao core privado (transition_internal)", () => {
    expect(corpoCancel).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
    expect(corpoFail).toMatch(new RegExp(`perform\\s+public\\.${TRANSITION_FN}`, "i"));
  });
});

describe("migration 153 — CAS fail-closed no core privado", () => {
  it("bloqueia por STATE_CONFLICT quando phase não coincide, antes de qualquer UPDATE", () => {
    const idxStateConflict = corpoTransition.search(/STATE_CONFLICT/i);
    const idxUpdate = corpoTransition.search(/update\s+public\.app_maintenance_state/i);
    expect(idxStateConflict).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(idxStateConflict);
  });

  it("bloqueia por VERSION_CONFLICT quando version não coincide, sem produzir UPDATE ou evento (raise antes das mutações)", () => {
    const idxVersionConflict = corpoTransition.search(/VERSION_CONFLICT/i);
    const idxUpdate = corpoTransition.search(/update\s+public\.app_maintenance_state/i);
    const idxInsert = corpoTransition.search(/insert\s+into\s+public\.app_maintenance_events/i);
    expect(idxVersionConflict).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(idxVersionConflict);
    expect(idxInsert).toBeGreaterThan(idxVersionConflict);
  });

  it("lock order: SELECT ... FOR UPDATE em app_maintenance_state antes de qualquer lock em app_release_runs", () => {
    const idxStateLock = corpoTransition.search(/from\s+public\.app_maintenance_state[\s\S]*?for update/i);
    const idxReleaseLock = corpoTransition.search(/from\s+public\.app_release_runs[\s\S]*?for update/i);
    expect(idxStateLock).toBeGreaterThan(-1);
    expect(idxReleaseLock).toBeGreaterThan(idxStateLock);
  });

  it("nunca faz UPDATE em app_release_runs (não altera a release)", () => {
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_runs/i);
  });

  it("cada UPDATE real de app_maintenance_state produz exatamente 1 INSERT em app_maintenance_events no mesmo corpo", () => {
    for (const corpo of [corpoTransition, corpoStart]) {
      const updates = corpo.match(/update\s+public\.app_maintenance_state/gi) || [];
      const inserts = corpo.match(/insert\s+into\s+public\.app_maintenance_events/gi) || [];
      expect(updates).toHaveLength(1);
      expect(inserts).toHaveLength(1);
    }
  });

  it("version = version + 1 em toda UPDATE real do singleton", () => {
    expect(corpoTransition).toMatch(/version\s*=\s*version\s*\+\s*1/i);
    expect(corpoStart).toMatch(/version\s*=\s*version\s*\+\s*1/i);
  });
});

describe("migration 153 — START", () => {
  it("exige phase='NORMAL' E release_id/target_sha IS NULL (as duas condições, unbound obrigatório)", () => {
    expect(corpoStart).toMatch(/v_phase is distinct from 'NORMAL'/i);
    expect(corpoStart).toMatch(/v_release_id is not null or v_target_sha is not null/i);
    expect(corpoStart).toMatch(/ACTIVE_RELEASE_CONFLICT/);
  });

  it("lock order: state primeiro, depois release", () => {
    const idxStateLock = corpoStart.search(/from\s+public\.app_maintenance_state[\s\S]*?for update/i);
    const idxReleaseLock = corpoStart.search(/from\s+public\.app_release_runs[\s\S]*?for update/i);
    expect(idxStateLock).toBeGreaterThan(-1);
    expect(idxReleaseLock).toBeGreaterThan(idxStateLock);
  });

  it("valida existência da release (NOT_FOUND) antes de checar status/target", () => {
    const idxReleaseLock = corpoStart.search(/from\s+public\.app_release_runs[\s\S]*?for update/i);
    const idxNotFound = corpoStart.indexOf("NOT_FOUND", idxReleaseLock);
    const idxStatusCheck = corpoStart.search(/v_release_status not in/i);
    expect(idxReleaseLock).toBeGreaterThan(-1);
    expect(idxNotFound).toBeGreaterThan(idxReleaseLock);
    expect(idxStatusCheck).toBeGreaterThan(idxNotFound);
  });

  it("valida status contra o ACTIVE_RELEASE_STATUSES real (REQUESTED/SCHEDULED/WAITING/VALIDATING/DISPATCHED/RUNNING)", () => {
    for (const status of [
      "REQUESTED",
      "SCHEDULED",
      "WAITING",
      "VALIDATING",
      "DISPATCHED",
      "RUNNING",
    ]) {
      expect(corpoStart).toContain(`'${status}'`);
    }
    expect(corpoStart).toMatch(/v_release_status not in/i);
  });

  it("valida target_sha real da release; mismatch produz TARGET_MISMATCH", () => {
    expect(corpoStart).toMatch(/v_release_target_sha is distinct from p_target_sha/i);
    expect(corpoStart).toMatch(/TARGET_MISMATCH/);
  });

  it("não altera app_release_runs (START_MUTATES_RELEASE_RUN = NÃO)", () => {
    expect(corpoStart).not.toMatch(/update\s+public\.app_release_runs/i);
  });

  it("na mesma UPDATE: phase continua NORMAL, release_id/target_sha reais, version+1", () => {
    const update = corpoStart.match(/update\s+public\.app_maintenance_state[\s\S]*?where scope = 'global';/i);
    expect(update, "UPDATE do start não encontrado").toBeTruthy();
    expect(update[0]).toMatch(/phase\s*=\s*'NORMAL'/i);
    expect(update[0]).toMatch(/release_id\s*=\s*p_release_id/i);
    expect(update[0]).toMatch(/target_sha\s*=\s*p_target_sha/i);
    expect(update[0]).toMatch(/version\s*=\s*version\s*\+\s*1/i);
  });
});

describe("migration 153 — CANCEL e FAIL", () => {
  it("CANCEL: allowed source somente NORMAL/NOTICE, destino hardcoded CANCELED", () => {
    expect(corpoCancel).toMatch(/p_expected_phase not in \('NORMAL', 'NOTICE'\)/i);
    expect(corpoCancel).toMatch(/'CANCELED'/);
  });

  it("FAIL: allowed source somente FENCING/DRAINING/QUIESCENT, destino hardcoded FAILED", () => {
    expect(corpoFail).toMatch(/p_expected_phase not in \('FENCING', 'DRAINING', 'QUIESCENT'\)/i);
    expect(corpoFail).toMatch(/'FAILED'/);
  });

  it("FAIL não permite NORMAL/NOTICE/RELEASING/SMOKE/RECOVERING/ABORTING/FAILED/CANCELED como source direto", () => {
    const proibidos = [
      "NORMAL",
      "NOTICE",
      "RELEASING",
      "SMOKE",
      "RECOVERING",
      "ABORTING",
      "FAILED",
      "CANCELED",
    ];
    const permitido = corpoFail.match(/p_expected_phase not in \(([^)]*)\)/i)[1];
    for (const fase of proibidos) {
      expect(permitido).not.toContain(`'${fase}'`);
    }
  });
});

describe("migration 153 — binding_guard", () => {
  it("proíbe binding parcial (release_id NULL <=> target_sha NULL)", () => {
    expect(corpoGuard).toMatch(/NEW\.release_id is null.*is distinct from.*NEW\.target_sha is null/i);
  });

  it("permite initial bind: NORMAL->NORMAL, unbound -> full", () => {
    expect(corpoGuard).toMatch(/OLD\.phase = 'NORMAL' and NEW\.phase = 'NORMAL'/i);
  });

  it("permite success clear: SMOKE->NORMAL, full -> null", () => {
    expect(corpoGuard).toMatch(/OLD\.phase = 'SMOKE' and NEW\.phase = 'NORMAL'/i);
  });

  it("permite reopen clear futuro do B17: FAILED/CANCELED->NORMAL com epoch maior, full -> null", () => {
    expect(corpoGuard).toMatch(/OLD\.phase in \('FAILED', 'CANCELED'\) and NEW\.phase = 'NORMAL'/i);
    expect(corpoGuard).toMatch(/NEW\.epoch > OLD\.epoch/i);
  });

  it("demais casos exigem binding NULL-safe idêntico (troca mid-cycle proibida) via IS NOT DISTINCT FROM", () => {
    expect(corpoGuard).toMatch(/NEW\.release_id is not distinct from OLD\.release_id/i);
    expect(corpoGuard).toMatch(/NEW\.target_sha is not distinct from OLD\.target_sha/i);
  });

  it("migration153 não cria RPC de reopen (B17 é caminho dedicado futuro)", () => {
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_reopen/i);
  });
});

describe("migration 153 — ACL e privacidade", () => {
  it("core privado (transition_internal, binding_guard) tem REVOKE ALL de public/anon/authenticated/service_role", () => {
    for (const fn of [
      `${TRANSITION_FN}\\(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb\\)`,
      `${GUARD_FN}\\(\\)`,
    ]) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${fn} from ${role}`, "i"),
        );
      }
    }
  });

  it("wrappers públicos (start/cancel/fail) fazem REVOKE ALL e depois GRANT EXECUTE somente para service_role", () => {
    for (const fn of [
      `${START_FN}\\(uuid, text, uuid, text, text, jsonb\\)`,
      `${CANCEL_FN}\\(text, integer, uuid, text, text, jsonb\\)`,
      `${FAIL_FN}\\(text, integer, uuid, text, text, jsonb\\)`,
    ]) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${fn} from ${role}`, "i"),
        );
      }
      expect(sqlSemComentarios).toMatch(
        new RegExp(`grant execute on function public\\.${fn} to service_role`, "i"),
      );
    }
  });

  it("não concede EXECUTE a anon/authenticated em nenhuma função criada", () => {
    const grants = sqlSemComentarios.match(/grant execute on function[^;]*;/gi) || [];
    for (const grant of grants) {
      expect(grant).not.toMatch(/\banon\b/i);
      expect(grant).not.toMatch(/\bauthenticated\b/i);
      expect(grant).toMatch(/\bservice_role\b/i);
    }
    expect(grants).toHaveLength(3);
  });

  it("todas as 5 funções usam owner postgres", () => {
    for (const fn of [
      `${TRANSITION_FN}\\(text, integer, text, uuid, text, boolean, uuid, text, text, text, text, text, jsonb\\)`,
      `${GUARD_FN}\\(\\)`,
      `${START_FN}\\(uuid, text, uuid, text, text, jsonb\\)`,
      `${CANCEL_FN}\\(text, integer, uuid, text, text, jsonb\\)`,
      `${FAIL_FN}\\(text, integer, uuid, text, text, jsonb\\)`,
    ]) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${fn} owner to postgres`, "i"),
      );
    }
  });

  it("todas as 5 funções usam SECURITY DEFINER e search_path=public", () => {
    for (const fn of [TRANSITION_FN, GUARD_FN, START_FN, CANCEL_FN, FAIL_FN]) {
      const cabeca = sqlSemComentarios.match(
        new RegExp(`create function public\\.${fn}[\\s\\S]*?as \\$\\$`, "i"),
      );
      expect(cabeca, `cabeçalho de ${fn} não encontrado`).toBeTruthy();
      expect(cabeca[0]).toMatch(/security definer/i);
      expect(cabeca[0]).toMatch(/set search_path\s*=\s*public/i);
    }
  });

  it("REVOKE UPDATE de service_role em app_maintenance_state, preservando SELECT", () => {
    expect(sqlSemComentarios).toMatch(/revoke update on table public\.app_maintenance_state from service_role/i);
    expect(sqlSemComentarios).not.toMatch(/revoke select on table public\.app_maintenance_state from service_role/i);
    expect(sqlSemComentarios).not.toMatch(/revoke all on table public\.app_maintenance_state/i);
  });

  it("não faz TABLE_ACL change em nenhuma outra tabela", () => {
    const revokesDeTabela = sqlSemComentarios.match(/revoke\s+\w+\s+on\s+table[^;]*;/gi) || [];
    expect(revokesDeTabela).toHaveLength(1);
    expect(revokesDeTabela[0]).toMatch(/app_maintenance_state/i);
  });
});

describe("migration 153 — postcheck fail-closed", () => {
  it("possui postcheck 153 antes do COMMIT", () => {
    expect(sql).toMatch(/postcheck 153/i);
    const idxPostcheck = sql.search(/postcheck 153/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("valida o novo contrato de 17 valores por igualdade textual exata", () => {
    expect(sqlSemComentarios).toMatch(/novo contrato de event_type divergente do superset de 17 valores esperado/i);
    expect(sqlSemComentarios).toMatch(/ORCHESTRATION_STARTED deveria ser permitido pelo novo CHECK/i);
  });

  it("valida contagem de 2 privadas, 3 públicas e 1 trigger", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 2 funções privadas/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 RPCs públicas/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 trigger de binding_guard/i);
  });

  it("valida ACL de service_role em app_maintenance_state (SELECT sim, UPDATE não)", () => {
    expect(sqlSemComentarios).toMatch(/service_role deveria manter SELECT em app_maintenance_state/i);
    expect(sqlSemComentarios).toMatch(/service_role NÃO deveria mais ter UPDATE direto em app_maintenance_state/i);
  });
});

describe("migration 153 — proibições explícitas de escopo", () => {
  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
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

  it("não adiciona verificação de super_admin em SQL (fica no /api/maintenance-orchestration)", () => {
    expect(sqlSemComentarios).not.toMatch(/super_admin/i);
  });

  it("não cria wrapper B16 (SMOKE->NORMAL) nem RPC de reopen B17 nesta migration", () => {
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_success/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_orchestration_reopen/i);
  });
});
