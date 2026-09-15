import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/150_maintenance_operation_registry_core.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration149 = readFileSync(
  "supabase/migrations/149_maintenance_operation_lifecycle_canceled.sql",
  "utf8",
);

const OPERATION_TYPES = [
  "CHECKOUT",
  "PUBLIC_ORDER",
  "INTERNAL_ORDER",
  "ONBOARDING",
  "FISCAL_RULE_MUTATION",
  "NFCE_EMISSION",
  "USER_ADMIN_MUTATION",
];

const BEGIN_FN = "app_maintenance_operation_begin_internal";
const FINISH_FN = "app_maintenance_operation_finish_internal";
const CANCEL_FN = "app_maintenance_operation_cancel_internal";

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

const corpoBegin = corpoDaFuncao(sqlSemComentarios, BEGIN_FN);
const corpoFinish = corpoDaFuncao(sqlSemComentarios, FINISH_FN);
const corpoCancel = corpoDaFuncao(sqlSemComentarios, CANCEL_FN);

describe("migration 150 — existência e transação", () => {
  it("arquivo 150 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^150[_.]/.test(f));
    expect(arquivos).toEqual(["150_maintenance_operation_registry_core.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("migration151 agora existe", () => {
    const arquivos151 = readdirSync("supabase/migrations").filter((f) => /^151[_.]/.test(f));
    expect(arquivos151).toEqual([
      "151_onboarding_operation_registry_integration.sql"
    ]);
  });

  it("não modifica migration141, 142 ou 149 (arquivos preservados)", () => {
    expect(migration141).toMatch(/create table public\.app_maintenance_operations/i);
    expect(migration142).toMatch(/create function public\.app_assert_business_write_allowed/i);
    expect(migration149).toMatch(/canceled_at timestamptz null/i);
    const arquivos141 = readdirSync("supabase/migrations").filter((f) => /^141[_.]/.test(f));
    const arquivos142 = readdirSync("supabase/migrations").filter((f) => /^142[_.]/.test(f));
    const arquivos149 = readdirSync("supabase/migrations").filter((f) => /^149[_.]/.test(f));
    expect(arquivos141).toEqual(["141_maintenance_operations.sql"]);
    expect(arquivos142).toEqual(["142_maintenance_write_assert.sql"]);
    expect(arquivos149).toEqual(["149_maintenance_operation_lifecycle_canceled.sql"]);
  });
});

describe("migration 150 — precheck fail-closed", () => {
  it("possui precheck 150 antes das 3 CREATE FUNCTION", () => {
    expect(sql).toMatch(/precheck 150/i);
    const idxPrecheck = sql.search(/precheck 150/i);
    const idxCreate = sql.search(new RegExp(`create function public\\.${BEGIN_FN}`, "i"));
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("valida existência da tabela, canceled_at e os 3 contratos de constraint (operation_type, status, lifecycle)", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations não existe/i);
    expect(sqlSemComentarios).toMatch(/coluna canceled_at ausente/i);
    expect(sqlSemComentarios).toMatch(/operation_type_check divergente do contrato canônico de 7 tipos/i);
    expect(sqlSemComentarios).toMatch(/status_check não contém os 5 estados esperados/i);
    expect(sqlSemComentarios).toMatch(/lifecycle_check não suporta CANCELED conforme esperado/i);
  });

  it("valida a assinatura/segurança real do assert (owner postgres, security definer, search_path=public)", () => {
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
    expect(sqlSemComentarios).toMatch(/app_assert_business_write_allowed — owner deveria ser postgres/i);
    expect(sqlSemComentarios).toMatch(/app_assert_business_write_allowed — deveria ser SECURITY DEFINER/i);
    expect(sqlSemComentarios).toMatch(/app_assert_business_write_allowed — proconfig deveria conter search_path=public/i);
  });

  it("bloqueia colisão de nome das 3 funções do core antes de criá-las", () => {
    expect(sqlSemComentarios).toMatch(/colisão — alguma das 3 funções do core privado já existe/i);
    expect(sqlSemComentarios).toMatch(
      /proname in \(\s*'app_maintenance_operation_begin_internal',\s*'app_maintenance_operation_finish_internal',\s*'app_maintenance_operation_cancel_internal'\s*\)/i,
    );
  });

  it("não usa CREATE OR REPLACE nas 3 funções novas", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+function/i);
  });
});

describe("migration 150 — exatamente 3 funções core com nomes e assinaturas corretos", () => {
  it("cria exatamente as 3 funções esperadas (nenhuma a mais)", () => {
    const criadas = [
      ...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi),
    ].map((m) => m[1]);
    expect(new Set(criadas)).toEqual(new Set([BEGIN_FN, FINISH_FN, CANCEL_FN]));
    expect(criadas).toHaveLength(3);
  });

  it("BEGIN: assinatura (text) returns uuid", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(`create function public\\.${BEGIN_FN}\\s*\\(\\s*p_operation_type text\\s*\\)\\s*returns uuid`, "i"),
    );
  });

  it("FINISH: assinatura (uuid, text, boolean) returns void", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(
        `create function public\\.${FINISH_FN}\\s*\\(\\s*p_operation_id uuid\\s*,\\s*p_operation_type text\\s*,\\s*p_success boolean\\s*\\)\\s*returns void`,
        "i",
      ),
    );
  });

  it("CANCEL: assinatura (uuid, text) returns void", () => {
    expect(sqlSemComentarios).toMatch(
      new RegExp(
        `create function public\\.${CANCEL_FN}\\s*\\(\\s*p_operation_id uuid\\s*,\\s*p_operation_type text\\s*\\)\\s*returns void`,
        "i",
      ),
    );
  });

  it("nenhuma das 3 funções tem parâmetro com DEFAULT (sem TTL do chamador)", () => {
    for (const fn of [BEGIN_FN, FINISH_FN, CANCEL_FN]) {
      const cabeca = sqlSemComentarios.match(
        new RegExp(`create function public\\.${fn}\\s*\\(([\\s\\S]*?)\\)\\s*returns`, "i"),
      );
      expect(cabeca, `cabeçalho de ${fn} não encontrado`).toBeTruthy();
      expect(cabeca[1]).not.toMatch(/default/i);
    }
  });

  it("todas usam LANGUAGE plpgsql VOLATILE SECURITY DEFINER search_path=public", () => {
    for (const fn of [BEGIN_FN, FINISH_FN, CANCEL_FN]) {
      const cabeca = sqlSemComentarios.match(
        new RegExp(`create function public\\.${fn}[\\s\\S]*?as \\$\\$`, "i"),
      );
      expect(cabeca, `cabeçalho de ${fn} não encontrado`).toBeTruthy();
      expect(cabeca[0]).toMatch(/language plpgsql/i);
      expect(cabeca[0]).toMatch(/\bvolatile\b/i);
      expect(cabeca[0]).toMatch(/security definer/i);
      expect(cabeca[0]).toMatch(/set search_path\s*=\s*public/i);
    }
  });
});

describe("migration 150 — TTL fixo, sem heartbeat/renew/extend", () => {
  it("declara exatamente os 7 tipos canônicos no TTL do BEGIN", () => {
    expect(OPERATION_TYPES).toHaveLength(7);
    for (const tipo of OPERATION_TYPES) {
      expect(corpoBegin).toMatch(new RegExp(`when '${tipo}' then`, "i"));
    }
  });

  it("ONBOARDING = 180 segundos; demais 6 tipos = 120 segundos", () => {
    expect(corpoBegin).toMatch(/when 'ONBOARDING' then 180/i);
    for (const tipo of OPERATION_TYPES.filter((t) => t !== "ONBOARDING")) {
      expect(corpoBegin).toMatch(new RegExp(`when '${tipo}' then 120`, "i"));
    }
  });

  it("nenhum parâmetro de TTL é aceito pelo chamador", () => {
    expect(sqlSemComentarios).not.toMatch(/p_ttl/i);
    expect(sqlSemComentarios).not.toMatch(/p_expires/i);
    expect(sqlSemComentarios).not.toMatch(/p_seconds/i);
  });

  it("usa now() para os timestamps da operação e make_interval para o TTL, nunca clock_timestamp/statement_timestamp", () => {
    expect(corpoBegin).toMatch(/now\(\)\s*\+\s*make_interval\(secs\s*=>\s*v_ttl_seconds\)/i);
    expect(sqlSemComentarios).not.toMatch(/clock_timestamp\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(/statement_timestamp\s*\(/i);
  });

  it("ausência total de heartbeat/renew/extend/touch/expiração automática", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+function[\s\S]{0,80}(renew|extend|touch)/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_renew\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_extend\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_touch\b/i);
    expect(sqlSemComentarios).not.toMatch(/heartbeat_at\s*=\s*(?!now\(\))/i);
    expect(sqlSemComentarios).not.toMatch(/status\s*=\s*'EXPIRED'/i);
    expect(sqlSemComentarios).not.toMatch(/expired_at\s*=\s*now\(\)/i);
  });
});

describe("migration 150 — BEGIN chama o assert antes do INSERT", () => {
  it("chama app_assert_business_write_allowed(null, p_operation_type) exatamente 1 vez", () => {
    const chamadas = corpoBegin.match(/app_assert_business_write_allowed/gi) || [];
    expect(chamadas).toHaveLength(1);
    expect(corpoBegin).toMatch(
      /perform\s+public\.app_assert_business_write_allowed\(\s*null\s*,\s*p_operation_type\s*\)\s*;/i,
    );
  });

  it("a chamada do assert vem antes do INSERT", () => {
    const idxAssert = corpoBegin.search(/app_assert_business_write_allowed/i);
    const idxInsert = corpoBegin.search(/insert\s+into\s+public\.app_maintenance_operations/i);
    expect(idxAssert).toBeGreaterThan(-1);
    expect(idxInsert).toBeGreaterThan(idxAssert);
  });

  it("não captura/traduz exceção do assert (sem BEGIN/EXCEPTION ao redor da chamada)", () => {
    expect(corpoBegin).not.toMatch(/exception\s+when/i);
    expect(corpoBegin).not.toMatch(/MAINTENANCE_FENCE_ACTIVE/i);
  });

  it("insere exatamente 1 operação IN_FLIGHT e retorna o uuid gerado", () => {
    const inserts = corpoBegin.match(/insert\s+into\s+public\./gi) || [];
    expect(inserts).toHaveLength(1);
    expect(corpoBegin).toMatch(/'IN_FLIGHT'/);
    expect(corpoBegin).toMatch(/v_id\s*:=\s*gen_random_uuid\(\)/i);
    expect(corpoBegin).toMatch(/return v_id\s*;/i);
  });

  it("lê o epoch atual internamente (sem exigir parâmetro extra) a partir de app_maintenance_state", () => {
    expect(corpoBegin).toMatch(/select\s+s\.epoch\s+into\s+v_epoch/i);
    expect(corpoBegin).toMatch(/from\s+public\.app_maintenance_state\s+as\s+s/i);
    expect(corpoBegin).toMatch(/where\s+s\.scope\s*=\s*'global'/i);
  });

  it("valida operation_type antes de qualquer INSERT/UPDATE", () => {
    const idxValidacao = corpoBegin.search(/MAINTENANCE_OPERATION_TYPE_INVALID/i);
    const idxInsert = corpoBegin.search(/insert\s+into\s+public\./i);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxInsert).toBeGreaterThan(idxValidacao);
  });
});

describe("migration 150 — FINISH", () => {
  it("valida operation_type contra os 7 tipos canônicos", () => {
    expect(corpoFinish).toMatch(/MAINTENANCE_OPERATION_TYPE_INVALID/i);
    for (const tipo of OPERATION_TYPES) {
      expect(corpoFinish).toContain(`'${tipo}'`);
    }
  });

  it("predicate exige id + operation_type + status IN_FLIGHT, sem expires_at > now()", () => {
    const updates = corpoFinish.match(/update\s+public\.app_maintenance_operations[\s\S]*?;/gi) || [];
    expect(updates.length).toBeGreaterThanOrEqual(1);
    for (const upd of updates) {
      expect(upd).toMatch(/id\s*=\s*p_operation_id/i);
      expect(upd).toMatch(/operation_type\s*=\s*p_operation_type/i);
      expect(upd).toMatch(/status\s*=\s*'IN_FLIGHT'/i);
      expect(upd).not.toMatch(/expires_at\s*>\s*now\(\)/i);
    }
  });

  it("success=true define COMPLETED/completed_at; success=false define FAILED/failed_at", () => {
    expect(corpoFinish).toMatch(/if\s+p_success\s+then/i);
    const bloco = corpoFinish.match(/if\s+p_success\s+then([\s\S]*?)else([\s\S]*?)end if;/i);
    expect(bloco, "bloco if/else de p_success não encontrado").toBeTruthy();
    expect(bloco[1]).toMatch(/status\s*=\s*'COMPLETED'/i);
    expect(bloco[1]).toMatch(/completed_at\s*=\s*now\(\)/i);
    expect(bloco[2]).toMatch(/status\s*=\s*'FAILED'/i);
    expect(bloco[2]).toMatch(/failed_at\s*=\s*now\(\)/i);
  });

  it("não chama o assert de manutenção", () => {
    expect(corpoFinish).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("exige exatamente 1 row afetada via GET DIAGNOSTICS e falha fail-closed caso contrário", () => {
    expect(corpoFinish).toMatch(/get diagnostics v_row_count\s*=\s*row_count/i);
    expect(corpoFinish).toMatch(/if\s+v_row_count\s*<>\s*1\s+then/i);
    expect(corpoFinish).toMatch(/MAINTENANCE_OPERATION_NOT_IN_FLIGHT/i);
  });
});

describe("migration 150 — CANCEL", () => {
  it("valida operation_type contra os 7 tipos canônicos", () => {
    expect(corpoCancel).toMatch(/MAINTENANCE_OPERATION_TYPE_INVALID/i);
    for (const tipo of OPERATION_TYPES) {
      expect(corpoCancel).toContain(`'${tipo}'`);
    }
  });

  it("predicate exige id + operation_type + status IN_FLIGHT, sem expires_at > now()", () => {
    const update = corpoCancel.match(/update\s+public\.app_maintenance_operations[\s\S]*?;/i);
    expect(update, "UPDATE do cancel não encontrado").toBeTruthy();
    expect(update[0]).toMatch(/id\s*=\s*p_operation_id/i);
    expect(update[0]).toMatch(/operation_type\s*=\s*p_operation_type/i);
    expect(update[0]).toMatch(/status\s*=\s*'IN_FLIGHT'/i);
    expect(update[0]).not.toMatch(/expires_at\s*>\s*now\(\)/i);
  });

  it("define CANCELED/canceled_at e zera completed_at, failed_at e expired_at", () => {
    const update = corpoCancel.match(/update\s+public\.app_maintenance_operations[\s\S]*?;/i)[0];
    expect(update).toMatch(/status\s*=\s*'CANCELED'/i);
    expect(update).toMatch(/canceled_at\s*=\s*now\(\)/i);
    expect(update).toMatch(/completed_at\s*=\s*null/i);
    expect(update).toMatch(/failed_at\s*=\s*null/i);
    expect(update).toMatch(/expired_at\s*=\s*null/i);
  });

  it("não chama o assert de manutenção", () => {
    expect(corpoCancel).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("exige exatamente 1 row afetada via GET DIAGNOSTICS e falha fail-closed caso contrário", () => {
    expect(corpoCancel).toMatch(/get diagnostics v_row_count\s*=\s*row_count/i);
    expect(corpoCancel).toMatch(/if\s+v_row_count\s*<>\s*1\s+then/i);
    expect(corpoCancel).toMatch(/MAINTENANCE_OPERATION_NOT_IN_FLIGHT/i);
  });
});

describe("migration 150 — privacidade / ACL", () => {
  it("faz REVOKE ALL das 3 funções para PUBLIC, anon, authenticated e service_role", () => {
    for (const fn of [
      `${BEGIN_FN}(text)`,
      `${FINISH_FN}(uuid, text, boolean)`,
      `${CANCEL_FN}(uuid, text)`,
    ]) {
      const escaped = fn.replace(/[()]/g, (c) => `\\${c}`).replace(/,\s*/g, ",\\s*");
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${escaped} from ${role}`, "i"),
        );
      }
    }
  });

  it("não concede GRANT EXECUTE a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(/grant\s+execute/i);
    expect(sqlSemComentarios.match(/\bgrant\b/gi)).toBeNull();
  });

  it("define owner postgres nas 3 funções", () => {
    for (const fn of [
      `${BEGIN_FN}\\(text\\)`,
      `${FINISH_FN}\\(uuid,\\s*text,\\s*boolean\\)`,
      `${CANCEL_FN}\\(uuid,\\s*text\\)`,
    ]) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${fn} owner to postgres`, "i"),
      );
    }
  });

  it("postcheck nega EXECUTE de anon/authenticated/service_role e PUBLIC via aclexplode para as 3 funções", () => {
    expect(sqlSemComentarios).toMatch(/has_function_privilege\('anon', v_oid, 'execute'\)/i);
    expect(sqlSemComentarios).toMatch(/has_function_privilege\('authenticated', v_oid, 'execute'\)/i);
    expect(sqlSemComentarios).toMatch(/has_function_privilege\('service_role', v_oid, 'execute'\)/i);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });

  it("não cria RPC pública genérica de begin nem endpoint HTTP", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_begin\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(/grant\s+execute\s+on\s+function/i);
  });
});

describe("migration 150 — postcheck fail-closed", () => {
  it("possui postcheck 150 antes do COMMIT", () => {
    expect(sql).toMatch(/postcheck 150/i);
    const idxPostcheck = sql.search(/postcheck 150/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("valida exatamente 3 funções do core, return types e ausência de defaults", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 funções do core privado/i);
    expect(sqlSemComentarios).toMatch(/BEGIN — return type deveria ser uuid/i);
    expect(sqlSemComentarios).toMatch(/FINISH — return type deveria ser void/i);
    expect(sqlSemComentarios).toMatch(/CANCEL — return type deveria ser void/i);
    expect(sqlSemComentarios).toMatch(/não deveria ter parâmetros com default/i);
  });

  it("valida que a tabela não sofreu alteração estrutural (constraints/índices/triggers intactos)", () => {
    expect(sqlSemComentarios).toMatch(/esperado 9, encontrado/i);
    expect(sqlSemComentarios).toMatch(/índices de app_maintenance_operations mudaram \(esperado 5, encontrado/i);
    expect(sqlSemComentarios).toMatch(/não deveria ter trigger algum/i);
  });
});

describe("migration 150 — proibições explícitas de escopo", () => {
  it("não faz ALTER TABLE, ADD/DROP COLUMN, índice, trigger ou RLS", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/enable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/disable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
  });

  it("não faz DML de negócio fora do INSERT/UPDATE interno ao corpo das 3 funções", () => {
    const semCorpoFuncoes = sqlSemComentarios
      .replace(corpoBegin, "")
      .replace(corpoFinish, "")
      .replace(corpoCancel, "");
    expect(semCorpoFuncoes).not.toMatch(/^\s*insert\s+into\s+public\./im);
    expect(semCorpoFuncoes).not.toMatch(/^\s*update\s+public\./im);
    expect(semCorpoFuncoes).not.toMatch(/delete\s+from\s+public\./i);
    expect(semCorpoFuncoes).not.toMatch(/truncate/i);
  });

  it("não altera app_maintenance_state, app_release_runs nem app_assert_business_write_allowed", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_maintenance_state/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+function\s+public\.app_assert_business_write_allowed/i);
  });

  it("não integra fluxo de negócio (pedidos, checkout, fiscal, nfce, cupons, dispositivos)", () => {
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

  it("não cria função de heartbeat/renew/extend/touch nem job de expiração", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+function[\s\S]{0,80}(heartbeat|renew|extend|touch)/i);
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
