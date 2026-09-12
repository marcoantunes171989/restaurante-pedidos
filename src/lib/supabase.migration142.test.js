import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/142_maintenance_write_assert.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");

const VALID_PHASES = [
  "NORMAL",
  "NOTICE",
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
  "CANCELED",
];

const ALLOW_PHASES = ["NORMAL", "NOTICE", "CANCELED"];

const BLOCK_PHASES = [
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
];

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function corpoDaFuncao(texto) {
  const match = texto.match(
    /create function public\.app_assert_business_write_allowed[\s\S]*?as \$\$([\s\S]*?)\$\$;/i,
  );
  expect(match, "corpo da função 142 não encontrado").toBeTruthy();
  return match[1];
}

function extractPhaseLists(corpo) {
  const re = /v_phase\s+(not\s+)?in\s*\(([^)]*)\)/gi;
  const lists = [];
  let match = re.exec(corpo);
  while (match) {
    lists.push({
      negated: Boolean(match[1]),
      phases: [...match[2].matchAll(/'([^']+)'/g)].map((item) => item[1]),
    });
    match = re.exec(corpo);
  }
  return lists;
}

const corpo = corpoDaFuncao(sqlSemComentarios);

describe("migration 142 — existência e transação", () => {
  it("arquivo 142 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^142[_.]/.test(f));
    expect(arquivos).toEqual(["142_maintenance_write_assert.sql"]);
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

describe("migration 142 — 140/141 intactas", () => {
  it("não modifica o arquivo da migration 140", () => {
    expect(migration140).toMatch(/create table public\.app_maintenance_state/i);
    expect(migration140).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica o arquivo da migration 141", () => {
    expect(migration141).toMatch(/create table public\.app_maintenance_operations/i);
    expect(migration141).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("precheck exige 140 e 141 e bloqueia função já existente", () => {
    expect(sql).toMatch(/precheck 142/i);
    const idxPrecheck = sql.search(/precheck 142/i);
    const idxCreate = sql.search(/create function public\.app_assert_business_write_allowed/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
    expect(sqlSemComentarios).toMatch(/app_maintenance_state não existe/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_operations não existe/i);
    expect(sqlSemComentarios).toMatch(/app_assert_business_write_allowed já existe/i);
  });
});

describe("migration 142 — assinatura da função", () => {
  it("cria a função com assinatura exata, sem CREATE OR REPLACE", () => {
    expect(sqlSemComentarios).toMatch(
      /create function public\.app_assert_business_write_allowed\s*\(\s*p_operation_id uuid default null\s*,\s*p_expected_operation_type text default null\s*\)/i,
    );
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace/i);
  });

  it("RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER search_path=public", () => {
    const cabeca = sqlSemComentarios.match(
      /create function public\.app_assert_business_write_allowed[\s\S]*?as \$\$/i,
    );
    expect(cabeca, "cabeçalho da função não encontrado").toBeTruthy();
    expect(cabeca[0]).toMatch(/returns void/i);
    expect(cabeca[0]).toMatch(/language plpgsql/i);
    expect(cabeca[0]).toMatch(/\bvolatile\b/i);
    expect(cabeca[0]).toMatch(/security definer/i);
    expect(cabeca[0]).toMatch(/set search_path\s*=\s*public/i);
    expect(cabeca[0]).not.toMatch(/returns boolean/i);
  });

  it("não adiciona parâmetros fora do contrato (phase/epoch/timestamp/operation_key/bypass)", () => {
    const cabeca = sqlSemComentarios.match(
      /create function public\.app_assert_business_write_allowed\s*\(([\s\S]*?)\)\s*returns void/i,
    );
    expect(cabeca, "lista de parâmetros não encontrada").toBeTruthy();
    const params = cabeca[1];
    expect(params).toMatch(/p_operation_id uuid default null/i);
    expect(params).toMatch(/p_expected_operation_type text default null/i);
    expect(params).not.toMatch(/p_phase\b/i);
    expect(params).not.toMatch(/p_epoch\b/i);
    expect(params).not.toMatch(/p_timestamp\b/i);
    expect(params).not.toMatch(/p_operation_key\b/i);
    expect(params).not.toMatch(/p_bypass\b/i);
    expect((params.match(/\bp_/gi) || []).length).toBe(2);
  });
});

describe("migration 142 — snapshot único", () => {
  it("lê state e operation em um único SELECT com LEFT JOIN e INTO STRICT", () => {
    const selects = corpo.match(/\bselect\b/gi) || [];
    expect(selects).toHaveLength(1);
    expect(corpo).toMatch(/into\s+strict/i);
    expect(corpo).toMatch(
      /from public\.app_maintenance_state as s\s+left join public\.app_maintenance_operations as o/i,
    );
    expect(corpo).toMatch(/on o\.id\s*=\s*p_operation_id/i);
    expect(corpo).toMatch(/where s\.scope\s*=\s*'global'/i);
  });

  it("projeta colunas fully-qualified de state e operation no mesmo statement", () => {
    expect(corpo).toMatch(/s\.phase/);
    expect(corpo).toMatch(/s\.epoch/);
    expect(corpo).toMatch(/s\.fence_effective_at/);
    expect(corpo).toMatch(/o\.id/);
    expect(corpo).toMatch(/o\.operation_type/);
    expect(corpo).toMatch(/o\.status/);
    expect(corpo).toMatch(/o\.maintenance_epoch/);
    expect(corpo).toMatch(/o\.started_at/);
    expect(corpo).toMatch(/o\.expires_at/);
  });

  it("converte NO_DATA_FOUND e TOO_MANY_ROWS no erro canônico", () => {
    expect(corpo).toMatch(/when no_data_found or too_many_rows/i);
    const handler = corpo.match(
      /when no_data_found or too_many_rows then([\s\S]*?)end;/i,
    );
    expect(handler, "handler de STRICT não encontrado").toBeTruthy();
    expect(handler[1]).toMatch(/errcode\s*=\s*'P0001'/i);
    expect(handler[1]).toMatch(/detail\s*=\s*v_err_detail/i);
  });
});

describe("migration 142 — phase matrix", () => {
  it("declara exatamente 11 phases válidas, 3 allow e 8 block", () => {
    expect(VALID_PHASES).toHaveLength(11);
    expect(ALLOW_PHASES).toHaveLength(3);
    expect(BLOCK_PHASES).toHaveLength(8);
    const lists = extractPhaseLists(corpo);
    expect(lists).toHaveLength(3);
    expect(lists[0]).toEqual({ negated: true, phases: VALID_PHASES });
    expect(lists[1]).toEqual({ negated: false, phases: ALLOW_PHASES });
    expect(lists[2]).toEqual({ negated: true, phases: BLOCK_PHASES });
  });

  it("não usa comparação lexical de phase", () => {
    expect(corpo).not.toMatch(/v_phase\s*[<>]=?/);
    expect(corpo).not.toMatch(/s\.phase\s*[<>]=?/);
    expect(corpo).not.toMatch(/order by\s+[\s\S]{0,40}phase/i);
    expect(corpo).not.toMatch(/localecompare/i);
  });
});

describe("migration 142 — ordem de decisão", () => {
  it("carrega snapshot, valida integridade, allow, fence, tx grandfather, operation grandfather, erro", () => {
    const idxStrict = corpo.search(/into\s+strict/i);
    const idxValid = corpo.search(/v_phase not in/i);
    const idxAllow = corpo.search(/v_phase in \(/i);
    const idxFenceEpoch = corpo.search(/v_epoch\s*<\s*1/i);
    const idxFenceAt = corpo.search(/v_fence_effective_at is null/i);
    const idxTx = corpo.search(/transaction_timestamp\s*\(\s*\)\s*<\s*v_fence_effective_at/i);
    const idxOp = corpo.search(/v_op_epoch\s*=\s*v_epoch\s*-\s*1/i);
    const raises = [...corpo.matchAll(/raise exception/gi)];
    expect(idxStrict).toBeGreaterThan(-1);
    expect(idxValid).toBeGreaterThan(idxStrict);
    expect(idxAllow).toBeGreaterThan(idxValid);
    expect(idxFenceEpoch).toBeGreaterThan(idxAllow);
    expect(idxFenceAt).toBeGreaterThan(idxAllow);
    expect(idxTx).toBeGreaterThan(idxFenceEpoch);
    expect(idxOp).toBeGreaterThan(idxTx);
    expect(raises.length).toBeGreaterThanOrEqual(4);
    expect(corpo.lastIndexOf("raise exception")).toBeGreaterThan(idxOp);
  });
});

describe("migration 142 — grandfathers e regras de operação", () => {
  it("usa transaction_timestamp < fence e não usa statement_timestamp/now no corpo", () => {
    expect(corpo).toMatch(/transaction_timestamp\s*\(\s*\)\s*<\s*v_fence_effective_at/i);
    expect(corpo).not.toMatch(/transaction_timestamp\s*\(\s*\)\s*<=/);
    expect(corpo).not.toMatch(/statement_timestamp\s*\(/i);
    expect(corpo).not.toMatch(/\bnow\s*\(/i);
  });

  it("usa clock_timestamp somente para expires_at", () => {
    const clocks = corpo.match(/clock_timestamp\s*\(\s*\)/gi) || [];
    expect(clocks).toHaveLength(1);
    expect(corpo).toMatch(/v_op_expires_at\s*>\s*clock_timestamp\s*\(\s*\)/i);
  });

  it("exige IN_FLIGHT, tipo, epoch N-1 e started_at < fence", () => {
    expect(corpo).toMatch(/p_operation_id is not null/i);
    expect(corpo).toMatch(/p_expected_operation_type is not null/i);
    expect(corpo).toMatch(/v_op_id is not null/i);
    expect(corpo).toMatch(/v_op_status\s*=\s*'IN_FLIGHT'/i);
    expect(corpo).toMatch(/v_op_type\s*=\s*p_expected_operation_type/i);
    expect(corpo).toMatch(/v_op_epoch\s*=\s*v_epoch\s*-\s*1/i);
    expect(corpo).toMatch(/v_op_started_at\s*<\s*v_fence_effective_at/i);
  });

  it("não consulta operation_key nem exige heartbeat", () => {
    expect(corpo).not.toMatch(/operation_key/i);
    expect(corpo).not.toMatch(/heartbeat/i);
  });
});

describe("migration 142 — contrato de erro", () => {
  it("expõe P0001, MESSAGE canônica, DETAIL MAINTENANCE_FENCE_ACTIVE e nenhum HINT", () => {
    expect(corpo).toMatch(/errcode\s*=\s*'P0001'/i);
    expect(corpo).toContain(
      "Manutenção em andamento. Novas operações estão temporariamente pausadas.",
    );
    expect(corpo).toContain("MAINTENANCE_FENCE_ACTIVE");
    expect(corpo).not.toMatch(/\bhint\s*=/i);
    const raises = [...corpo.matchAll(/raise exception[\s\S]*?;/gi)].map((item) => item[0]);
    expect(raises.length).toBeGreaterThanOrEqual(4);
    for (const raise of raises) {
      expect(raise).toMatch(/errcode\s*=\s*'P0001'/i);
      expect(raise).toMatch(/detail\s*=\s*v_err_detail/i);
      expect(raise).not.toMatch(/\bhint\s*=/i);
    }
  });
});

describe("migration 142 — segurança e isolamento", () => {
  it("faz REVOKE ALL da função para PUBLIC, anon, authenticated e service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_assert_business_write_allowed\(uuid,\s*text\) from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_assert_business_write_allowed\(uuid,\s*text\) from anon/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_assert_business_write_allowed\(uuid,\s*text\) from authenticated/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_assert_business_write_allowed\(uuid,\s*text\) from service_role/i,
    );
  });

  it("não concede EXECUTE e não cria GRANT algum", () => {
    expect(grantsDe(sqlSemComentarios)).toEqual([]);
    expect(sqlSemComentarios).not.toMatch(/grant\s+execute/i);
  });

  it("define owner postgres", () => {
    expect(sqlSemComentarios).toMatch(
      /alter function public\.app_assert_business_write_allowed\(uuid,\s*text\) owner to postgres/i,
    );
  });

  it("não cria trigger, policy, nem DML de infra", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/\binsert\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bupdate\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bdelete\b/i);
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_release_/i);
    expect(sqlSemComentarios).not.toMatch(/p_bypass\b/i);
  });

  it("não toca tabelas de negócio nem notifica PostgREST", () => {
    for (const tabela of [
      "tab_pedidos",
      "tab_caixas",
      "tab_impressoras",
      "tab_impressoes_cozinha",
    ]) {
      expect(sqlSemComentarios).not.toContain(tabela);
    }
    expect(sqlSemComentarios).not.toMatch(/notify pgrst/i);
  });
});

describe("migration 142 — postchecks fail-closed", () => {
  it("possui postcheck 142 antes do COMMIT e não executa a função", () => {
    expect(sql).toMatch(/postcheck 142/i);
    const idxPostcheck = sql.search(/postcheck 142/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(
      /perform\s+public\.app_assert_business_write_allowed/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /select\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("valida assinatura, defaults, void, volatile, security definer, owner e search_path", () => {
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
    expect(sqlSemComentarios).toMatch(/p\.pronargs/);
    expect(sqlSemComentarios).toMatch(/p\.pronargdefaults/);
    expect(sqlSemComentarios).toMatch(/p\.provolatile/);
    expect(sqlSemComentarios).toMatch(/p\.prosecdef/);
    expect(sqlSemComentarios).toMatch(/p\.prorettype/);
    expect(sqlSemComentarios).toMatch(/pg_get_userbyid\(p\.proowner\)/);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/pronargs=% \(esperado 2\)/);
    expect(sqlSemComentarios).toMatch(/pronargdefaults=% \(esperado 2\)/);
    expect(sqlSemComentarios).toMatch(/return type deveria ser void/);
    expect(sqlSemComentarios).toMatch(/provolatile=% \(esperado v \/ VOLATILE\)/);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true/);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/);
  });

  it("nega EXECUTE de PUBLIC, anon, authenticated e service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('anon',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('authenticated',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('service_role',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
    expect(sqlSemComentarios).not.toMatch(/has_function_privilege\(\s*'public'/);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
    expect(sql).toMatch(/anon NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/authenticated NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/service_role NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });
});

describe("migration 142 — proibições de escopo", () => {
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
