import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/145_maintenance_rpc_guard_cupons.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration121 = readFileSync("supabase/migrations/121_cupons_admin_seguro.sql", "utf8");
const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration143 = readFileSync(
  "supabase/migrations/143_maintenance_rpc_guard_allowlist.sql",
  "utf8",
);
const migration144 = readFileSync(
  "supabase/migrations/144_maintenance_table_guard_triggers.sql",
  "utf8",
);

const ASSINATURAS = [
  {
    nome: "app_criar_cupom",
    args: "bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time",
    dml: /\binsert\s+into\s+public\.tab_cupons\b/i,
    origem: migration121,
  },
  {
    nome: "app_atualizar_cupom",
    args: "bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time",
    dml: /\bupdate\s+public\.tab_cupons\b/i,
    origem: migration121,
  },
  {
    nome: "app_excluir_cupom",
    args: "bigint",
    dml: /\bdelete\s+from\s+public\.tab_cupons\b/i,
    origem: migration121,
  },
];

const GUARD_RE =
  /perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;/i;

function guardsEm(texto) {
  return (
    texto.match(
      /perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;/gi,
    ) || []
  );
}

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function revokesDe(texto) {
  return texto.match(/\brevoke\b[^;]*;/gi) || [];
}

function trechoFuncao(texto, nome) {
  const re = new RegExp(
    `create or replace function public\\.${nome}\\s*\\([\\s\\S]*?\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `função ${nome} não encontrada`).toBeTruthy();
  return match[0];
}

function corpoDaFuncao(texto, nome) {
  const trecho = trechoFuncao(texto, nome);
  const match = trecho.match(/as\s+\$\$([\s\S]*?)\$\$;/i);
  expect(match, `corpo de ${nome} não encontrado`).toBeTruthy();
  return match[1];
}

function semGuard(trecho) {
  return trecho.replace(
    /\r?\n[ \t]*perform public\.app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)\s*;[ \t]*/gi,
    "",
  );
}

function tiposDe(args) {
  return [...args.matchAll(/\b(bigint|integer|text|boolean|jsonb|numeric|timestamptz|time)\b/gi)].map(
    (item) => item[1].toLowerCase(),
  );
}

function normalizar(texto) {
  return texto.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

function idxPrimeiroDml(corpo) {
  const padroes = [
    /\binsert\s+into\b/i,
    /\bupdate\s+public\./i,
    /\bdelete\s+from\b/i,
  ];
  const idxs = padroes
    .map((re) => corpo.search(re))
    .filter((idx) => idx >= 0);
  expect(idxs.length, "DML não encontrado no corpo").toBeGreaterThan(0);
  return Math.min(...idxs);
}

describe("migration 145 — existência e transação", () => {
  it("arquivo 145 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^145[_.]/.test(f));
    expect(arquivos).toEqual(["145_maintenance_rpc_guard_cupons.sql"]);
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

describe("migration 145 — 121/140–144 intactas", () => {
  it("não modifica o arquivo da migration 121", () => {
    expect(migration121).toMatch(/create or replace function public\.app_criar_cupom\s*\(/i);
    expect(migration121).toMatch(/create or replace function public\.app_atualizar_cupom\s*\(/i);
    expect(migration121).toMatch(/create or replace function public\.app_excluir_cupom\s*\(/i);
    expect(migration121).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica as migrations 140, 141 e 142", () => {
    expect(migration140).not.toMatch(/app_criar_cupom|app_atualizar_cupom|app_excluir_cupom/i);
    expect(migration141).not.toMatch(/app_criar_cupom|app_atualizar_cupom|app_excluir_cupom/i);
    expect(migration142).toMatch(
      /create function public\.app_assert_business_write_allowed/i,
    );
    expect(migration142).not.toMatch(/app_criar_cupom|app_atualizar_cupom|app_excluir_cupom/i);
  });

  it("não modifica as migrations 143 e 144", () => {
    expect(migration143).not.toMatch(/app_criar_cupom|app_atualizar_cupom|app_excluir_cupom/i);
    expect(migration144).not.toMatch(/app_criar_cupom|app_atualizar_cupom|app_excluir_cupom/i);
    expect(migration143).toMatch(/app_criar_mesa|app_atualizar_mesa/i);
    expect(migration144).toMatch(/postcheck 144/i);
  });
});

describe("migration 145 — precheck fail-closed", () => {
  it("possui precheck 145 antes do primeiro CREATE OR REPLACE", () => {
    expect(sql).toMatch(/precheck 145/i);
    const idxPrecheck = sql.search(/precheck 145/i);
    const idxCreate = sql.search(/create or replace function public\.app_criar_cupom/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige assert da 142, as 3 RPCs existentes e 145 ainda não aplicada conceitualmente", () => {
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(uuid,\s*text\) não existe \(migration 142 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /já contém o guard \(migration 145 já aplicada conceitualmente\)/i,
    );
    for (const fn of ASSINATURAS) {
      expect(sqlSemComentarios).toMatch(new RegExp(fn.nome, "i"));
    }
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
  });

  it("rejeita ambiguidade/overload não previsto (exatamente 1 função por nome)", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_criar_cupom/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_atualizar_cupom/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_excluir_cupom/i);
    expect(sqlSemComentarios).toMatch(
      /proname = 'app_criar_cupom'/i,
    );
  });
});

describe("migration 145 — exatamente 3 CREATE OR REPLACE e 3 assinaturas", () => {
  it("contém exatamente 3 CREATE OR REPLACE FUNCTION", () => {
    const creates = sqlSemComentarios.match(/create\s+or\s+replace\s+function/gi) || [];
    expect(creates).toHaveLength(3);
  });

  it("recria exatamente as 3 assinaturas aprovadas, nesta ordem", () => {
    const encontrados = [
      ...sqlSemComentarios.matchAll(
        /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns jsonb/gi,
      ),
    ].map((item) => ({
      nome: item[1],
      args: item[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
    }));
    expect(encontrados).toHaveLength(3);
    expect(encontrados.map((item) => item.nome)).toEqual(ASSINATURAS.map((fn) => fn.nome));

    const tiposComuns = [
      "bigint",
      "text",
      "text",
      "text",
      "numeric",
      "numeric",
      "integer",
      "timestamptz",
      "timestamptz",
      "boolean",
      "text",
      "time",
      "time",
    ];
    expect(tiposDe(encontrados[0].args)).toEqual(tiposComuns);
    expect(tiposDe(encontrados[1].args)).toEqual(tiposComuns);
    expect(tiposDe(encontrados[2].args)).toEqual(["bigint"]);

    expect(encontrados[0].args).toMatch(/p_loja_id bigint,\s*p_codigo text/i);
    expect(encontrados[1].args).toMatch(/p_cupom_id bigint,\s*p_codigo text/i);
    expect(encontrados[2].args).toMatch(/^p_cupom_id\s+bigint$/i);
  });

  it("não recria nenhuma outra RPC", () => {
    expect(sqlSemComentarios).not.toMatch(/app_listar_cupons/i);
    expect(sqlSemComentarios).not.toMatch(/app_validar_cupom/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_mesa/i);
    expect(sqlSemComentarios).not.toMatch(/app_atualizar_categoria/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_produto/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("preserva SECURITY DEFINER, search_path=public e retorno jsonb", () => {
    for (const fn of ASSINATURAS) {
      const trecho = trechoFuncao(sqlSemComentarios, fn.nome);
      expect(trecho).toMatch(/returns jsonb/i);
      expect(trecho).toMatch(/security definer/i);
      expect(trecho).toMatch(/set search_path\s*=\s*public/i);
      expect(trecho).toMatch(/language plpgsql/i);
    }
  });
});

describe("migration 145 — guard único antes da primeira mutação", () => {
  it("contém exatamente 3 PERFORM do assert (null, null)", () => {
    expect(guardsEm(sqlSemComentarios)).toHaveLength(3);
  });

  it("não usa operation_id nem segundo argumento preenchido", () => {
    const performs = [
      ...sqlSemComentarios.matchAll(
        /perform\s+public\.app_assert_business_write_allowed\s*\(([^)]*)\)/gi,
      ),
    ];
    expect(performs).toHaveLength(3);
    for (const item of performs) {
      expect(item[1].replace(/\s+/g, "")).toMatch(/^null,null$/i);
    }
    for (const fn of ASSINATURAS) {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      expect(corpo).not.toMatch(/operation_id/i);
    }
  });

  it.each(ASSINATURAS)(
    "$nome: exatamente 1 guard, depois da auth/autorização e imediatamente antes da primeira mutação",
    (fn) => {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      const guards = guardsEm(corpo);
      expect(guards).toHaveLength(1);

      const idxBegin = corpo.search(/\bbegin\b/i);
      const idxAuth = corpo.search(/app_caller_email/i);
      const idxNotAuth = corpo.search(/not_authenticated/i);
      const idxForbidden = corpo.search(/forbidden/i);
      const idxGuard = corpo.search(GUARD_RE);
      const idxDml = idxPrimeiroDml(corpo);
      const idxDmlEspecifico = corpo.search(fn.dml);

      expect(idxBegin).toBeGreaterThan(-1);
      expect(idxAuth).toBeGreaterThan(-1);
      expect(idxNotAuth).toBeGreaterThan(-1);
      expect(idxForbidden).toBeGreaterThan(-1);
      expect(idxGuard).toBeGreaterThan(idxBegin);
      expect(idxGuard).toBeGreaterThan(idxAuth);
      expect(idxGuard).toBeGreaterThan(idxNotAuth);
      expect(idxGuard).toBeGreaterThan(idxForbidden);
      expect(idxDml).toBeGreaterThan(idxGuard);
      expect(idxDmlEspecifico).toBeGreaterThan(idxGuard);
      expect(idxDmlEspecifico).toBe(idxDml);

      const depoisDaMutacao = corpo.slice(idxDml);
      expect(guardsEm(depoisDaMutacao)).toHaveLength(0);
    },
  );

  it("não coloca o guard no início da função", () => {
    for (const fn of ASSINATURAS) {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      const semEspaco = corpo.replace(/^\s+/, "");
      expect(semEspaco).not.toMatch(/^perform\s+public\.app_assert_business_write_allowed/i);
    }
  });

  it("app_excluir_cupom: guard vem depois da checagem cupom_possui_usos e antes do DELETE físico", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_excluir_cupom");
    const idxUso = corpo.search(/cupom_possui_usos/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxDelete = corpo.search(/delete\s+from\s+public\.tab_cupons/i);
    expect(idxUso).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxUso);
    expect(idxDelete).toBeGreaterThan(idxGuard);
  });
});

describe("migration 145 — auth, tenant e validações preservados", () => {
  it.each(ASSINATURAS)(
    "$nome: corpo idêntico ao de 121 após remover o único guard",
    (fn) => {
      const atual = trechoFuncao(sql, fn.nome);
      const original = trechoFuncao(fn.origem, fn.nome);
      expect(normalizar(semGuard(atual))).toBe(normalizar(original));
    },
  );

  it("app_criar_cupom preserva auth, admin, tenant, validações e JSON de retorno", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_criar_cupom");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_obrigatoria/);
    expect(corpo).toMatch(/loja_invalida/);
    expect(corpo).toMatch(/v_loja := v_caller\.loja_id/);
    expect(corpo).toMatch(/codigo_invalido/);
    expect(corpo).toMatch(/valor_invalido/);
    expect(corpo).toMatch(/percentual_invalido/);
    expect(corpo).toMatch(/periodo_invalido/);
    expect(corpo).toMatch(/quantidade_total_invalida/);
    expect(corpo).toMatch(/jsonb_build_object/);
    expect(corpo).toMatch(/'hora_fim'/);
  });

  it("app_atualizar_cupom preserva SELECT prévio, tenant, imutabilidade de loja_id/quantidade_usada e JSON", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_cupom");
    expect(corpo).toMatch(/select \* into v_atual from public\.tab_cupons where id = p_cupom_id/);
    expect(corpo).toMatch(/cupom_nao_encontrado/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/p_quantidade_total < v_atual\.quantidade_usada/);
    const setClause = corpo.match(/update public\.tab_cupons set([\s\S]*?)where id = p_cupom_id/i);
    expect(setClause, "SET clause do UPDATE não encontrado").toBeTruthy();
    expect(setClause[1]).not.toMatch(/loja_id\s*=/);
    expect(setClause[1]).not.toMatch(/quantidade_usada\s*=/);
    expect(corpo).toMatch(/atualizado_em = now\(\)/);
    expect(corpo).toMatch(/jsonb_build_object/);
  });

  it("app_excluir_cupom preserva SELECT/tenant antes do assert, checagem de uso e DELETE físico", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_excluir_cupom");
    expect(corpo).toMatch(/cupom_nao_encontrado/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/cupom_possui_usos/);
    expect(corpo).toMatch(/delete from public\.tab_cupons where id = p_cupom_id/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'id', p_cupom_id\)/);
  });
});

describe("migration 145 — grants intocados", () => {
  it("não adiciona nenhum GRANT ou REVOKE (grants das 3 RPCs já eram authenticated apenas)", () => {
    expect(grantsDe(sqlSemComentarios)).toHaveLength(0);
    expect(revokesDe(sqlSemComentarios)).toHaveLength(0);
  });

  it("não concede EXECUTE do assert a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });
});

describe("migration 145 — proibições de escopo", () => {
  it("não cria table, trigger, policy, index nem altera state/operations/release", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+index/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_release_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_/i);
  });

  it("não usa GUC (set_config/current_setting) nem bypass genérico", () => {
    expect(sqlSemComentarios).not.toMatch(/set_config/i);
    expect(sqlSemComentarios).not.toMatch(/current_setting/i);
    expect(sqlSemComentarios).not.toMatch(/bypass/i);
  });

  it("não cria frontend/API nem NOTIFY pgrst (fora de comentários herdados de 121)", () => {
    expect(sqlSemComentarios).not.toMatch(/notify pgrst/i);
    expect(sqlSemComentarios).not.toMatch(/src\//);
    expect(sqlSemComentarios).not.toMatch(/App\.jsx/);
    expect(sqlSemComentarios).not.toMatch(/supabase\.js/);
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

describe("migration 145 — postchecks fail-closed", () => {
  it("possui postcheck 145 antes do COMMIT e não executa o assert", () => {
    expect(sql).toMatch(/postcheck 145/i);
    const idxPostcheck = sql.search(/postcheck 145/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(
      /select\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova RPC count = 3", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 RPCs de cupons/i);
    expect(sqlSemComentarios).toMatch(
      /proname in \('app_criar_cupom', 'app_atualizar_cupom', 'app_excluir_cupom'\)/i,
    );
  });

  it("prova assinatura, owner=postgres, SECURITY DEFINER, search_path e grants preservados", () => {
    expect(sqlSemComentarios).toMatch(/pg_get_userbyid\(p\.proowner\)/);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true \(SECURITY DEFINER\)/);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/authenticated deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/service_role NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
  });

  it("prova guard presente exatamente 1 vez em cada RPC, com (null, null), total 3, sem operation_id", () => {
    expect(sqlSemComentarios).toMatch(/guard deveria aparecer exatamente 1 vez/);
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /regexp_matches\(v_prosrc,\s*'app_assert_business_write_allowed'/,
    );
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 guards no total/i);
    expect(sqlSemComentarios).toMatch(/não deveria referenciar operation_id/i);
  });

  it("prova que app_excluir_cupom preserva a checagem de uso e o DELETE físico", () => {
    expect(sqlSemComentarios).toMatch(/perdeu a checagem cupom_possui_usos/i);
    expect(sqlSemComentarios).toMatch(/perdeu o DELETE físico em tab_cupons/i);
  });

  it("prova que o assert continua sem EXECUTE para PUBLIC/anon/authenticated/service_role", () => {
    expect(sql).toMatch(/assert — PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — anon NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — authenticated NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — service_role NÃO deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('anon',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('authenticated',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /has_function_privilege\('service_role',\s*'public\.app_assert_business_write_allowed\(uuid,\s*text\)',\s*'execute'\)/,
    );
  });
});
