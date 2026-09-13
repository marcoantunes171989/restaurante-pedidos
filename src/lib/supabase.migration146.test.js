import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/146_maintenance_rpc_guard_produtos.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration124 = readFileSync("supabase/migrations/124_catalogo_admin_seguro.sql", "utf8");
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
const migration145 = readFileSync(
  "supabase/migrations/145_maintenance_rpc_guard_cupons.sql",
  "utf8",
);

const ASSINATURAS = [
  {
    nome: "app_criar_produto",
    args: "bigint, jsonb",
    ret: "jsonb",
    dml: /\binsert\s+into\s+public\.tab_produtos\b/i,
    origem: migration124,
  },
  {
    nome: "app_atualizar_produto",
    args: "bigint, jsonb",
    ret: "jsonb",
    dml: /\bupdate\s+public\.tab_produtos\b/i,
    origem: migration124,
  },
  {
    nome: "app_atualizar_produtos_fiscal_lote",
    args: "bigint, bigint[], jsonb",
    ret: "integer",
    dml: /\bupdate\s+public\.tab_produtos\b/i,
    origem: migration124,
  },
  {
    nome: "app_excluir_produto",
    args: "bigint",
    ret: "jsonb",
    dml: /\bdelete\s+from\s+public\.tab_produtos\b/i,
    origem: migration124,
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

describe("migration 146 — existência e transação", () => {
  it("arquivo 146 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^146[_.]/.test(f));
    expect(arquivos).toEqual(["146_maintenance_rpc_guard_produtos.sql"]);
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

describe("migration 146 — 124/140–145 intactas", () => {
  it("não modifica o arquivo da migration 124", () => {
    expect(migration124).toMatch(/create or replace function public\.app_criar_produto\s*\(/i);
    expect(migration124).toMatch(/create or replace function public\.app_atualizar_produto\s*\(/i);
    expect(migration124).toMatch(/create or replace function public\.app_excluir_produto\s*\(/i);
    expect(migration124).toMatch(
      /create or replace function public\.app_atualizar_produtos_fiscal_lote\s*\(/i,
    );
    expect(migration124).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica as migrations 140, 141 e 142", () => {
    expect(migration140).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
    expect(migration141).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
    expect(migration142).toMatch(
      /create function public\.app_assert_business_write_allowed/i,
    );
    expect(migration142).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
  });

  it("não modifica as migrations 143, 144 e 145", () => {
    expect(migration143).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
    expect(migration144).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
    expect(migration145).not.toMatch(
      /app_criar_produto|app_atualizar_produto|app_excluir_produto|app_atualizar_produtos_fiscal_lote/i,
    );
    expect(migration143).toMatch(/app_criar_mesa|app_atualizar_mesa/i);
    expect(migration144).toMatch(/postcheck 144/i);
    expect(migration145).toMatch(/app_criar_cupom/i);
  });
});

describe("migration 146 — precheck fail-closed", () => {
  it("possui precheck 146 antes do primeiro CREATE OR REPLACE", () => {
    expect(sql).toMatch(/precheck 146/i);
    const idxPrecheck = sql.search(/precheck 146/i);
    const idxCreate = sql.search(/create or replace function public\.app_criar_produto/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige assert da 142, as 4 RPCs existentes e 146 ainda não aplicada conceitualmente", () => {
    expect(sqlSemComentarios).toMatch(
      /public\.app_assert_business_write_allowed\(uuid, text\) não existe \(migration 142 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /já contém o guard \(migration 146 já aplicada conceitualmente\)/i,
    );
    for (const fn of ASSINATURAS) {
      expect(sqlSemComentarios).toMatch(new RegExp(fn.nome, "i"));
    }
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
  });

  it("rejeita ambiguidade/overload não previsto (exatamente 1 função por nome, para as 4 RPCs)", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_criar_produto/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_atualizar_produto/i);
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_excluir_produto/i);
    expect(sqlSemComentarios).toMatch(
      /esperado exatamente 1 overload de app_atualizar_produtos_fiscal_lote/i,
    );
    expect(sqlSemComentarios).toMatch(/proname = 'app_criar_produto'/i);
  });

  it("precheck valida owner/SECURITY DEFINER/search_path/ACL do assert e das 4 RPCs antes de qualquer CREATE OR REPLACE", () => {
    const idxPrecheckFim = sql.search(/end \$\$;/i);
    const idxCreate = sql.search(/create or replace function public\.app_criar_produto/i);
    expect(idxPrecheckFim).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheckFim);

    const blocoPrecheck = sqlSemComentarios.slice(
      sqlSemComentarios.search(/precheck 146/i),
      sqlSemComentarios.search(/create or replace function public\.app_criar_produto/i),
    );
    expect(blocoPrecheck).toMatch(/owner deveria ser postgres/i);
    expect(blocoPrecheck).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(blocoPrecheck).toMatch(/proconfig deveria conter search_path=public/i);
    expect(blocoPrecheck).toMatch(/authenticated deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/anon NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/service_role NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });
});

describe("migration 146 — exatamente 4 CREATE OR REPLACE e 4 assinaturas", () => {
  it("contém exatamente 4 CREATE OR REPLACE FUNCTION", () => {
    const creates = sqlSemComentarios.match(/create\s+or\s+replace\s+function/gi) || [];
    expect(creates).toHaveLength(4);
  });

  it("recria exatamente as 4 assinaturas aprovadas, nesta ordem, com args e return type corretos", () => {
    const encontrados = [
      ...sqlSemComentarios.matchAll(
        /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(jsonb|integer)/gi,
      ),
    ].map((item) => ({
      nome: item[1],
      args: item[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
      ret: item[3].toLowerCase(),
    }));
    expect(encontrados).toHaveLength(4);
    expect(encontrados.map((item) => item.nome)).toEqual(ASSINATURAS.map((fn) => fn.nome));
    expect(encontrados.map((item) => item.ret)).toEqual(ASSINATURAS.map((fn) => fn.ret));

    expect(encontrados[0].args).toMatch(/^p_loja_id bigint,\s*p_dados jsonb$/i);
    expect(encontrados[1].args).toMatch(/^p_produto_id bigint,\s*p_patch jsonb$/i);
    expect(encontrados[2].args).toMatch(
      /^p_loja_id\s+bigint,\s*p_produto_ids\s+bigint\[\],\s*p_patch\s+jsonb$/i,
    );
    expect(encontrados[3].args).toMatch(/^p_produto_id\s+bigint$/i);
  });

  it("não recria nenhuma outra RPC nem redefine o assert", () => {
    expect(sqlSemComentarios).not.toMatch(/app_listar_produtos/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_cupom/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_mesa/i);
    expect(sqlSemComentarios).not.toMatch(/app_atualizar_categoria/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("preserva SECURITY DEFINER, search_path=public, language plpgsql e o return type de cada RPC", () => {
    for (const fn of ASSINATURAS) {
      const trecho = trechoFuncao(sqlSemComentarios, fn.nome);
      expect(trecho).toMatch(new RegExp(`returns ${fn.ret}`, "i"));
      expect(trecho).toMatch(/security definer/i);
      expect(trecho).toMatch(/set search_path\s*=\s*public/i);
      expect(trecho).toMatch(/language plpgsql/i);
    }
  });
});

describe("migration 146 — guard único antes da primeira mutação", () => {
  it("contém exatamente 4 PERFORM do assert (null, null)", () => {
    expect(guardsEm(sqlSemComentarios)).toHaveLength(4);
  });

  it("não usa operation_id nem segundo argumento preenchido", () => {
    const performs = [
      ...sqlSemComentarios.matchAll(
        /perform\s+public\.app_assert_business_write_allowed\s*\(([^)]*)\)/gi,
      ),
    ];
    expect(performs).toHaveLength(4);
    for (const item of performs) {
      expect(item[1].replace(/\s+/g, "")).toMatch(/^null,null$/i);
    }
    for (const fn of ASSINATURAS) {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      expect(corpo).not.toMatch(/operation_id/i);
    }
  });

  it.each(ASSINATURAS)(
    "$nome: exatamente 1 guard, depois da auth/autorização/validações e imediatamente antes da primeira mutação",
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

  it("app_criar_produto: guard vem depois da última validação de loja_fiscal_regra_id e antes do INSERT", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_criar_produto");
    const idxValidacao = corpo.search(/loja_fiscal_regra_invalida/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxInsert = corpo.search(/insert\s+into\s+public\.tab_produtos/i);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxValidacao);
    expect(idxInsert).toBeGreaterThan(idxGuard);
  });

  it("app_atualizar_produto: guard vem depois da checagem condicional de loja_fiscal_regra_id (p_patch ? ...) e antes do UPDATE", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_produto");
    const idxCondicional = corpo.search(/p_patch \? 'loja_fiscal_regra_id'/i);
    const idxValidacao = corpo.search(/loja_fiscal_regra_invalida/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxUpdate = corpo.search(/update\s+public\.tab_produtos/i);
    expect(idxCondicional).toBeGreaterThan(-1);
    expect(idxValidacao).toBeGreaterThan(idxCondicional);
    expect(idxGuard).toBeGreaterThan(idxValidacao);
    expect(idxUpdate).toBeGreaterThan(idxGuard);
  });

  it("app_excluir_produto: guard vem depois de todas as validações e checagem de ownership e antes do DELETE físico", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_excluir_produto");
    const idxOwnership = corpo.search(
      /v_atual\.loja_id is distinct from v_caller\.loja_id/i,
    );
    const idxGuard = corpo.search(GUARD_RE);
    const idxDelete = corpo.search(/delete\s+from\s+public\.tab_produtos/i);
    expect(idxOwnership).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxOwnership);
    expect(idxDelete).toBeGreaterThan(idxGuard);
  });

  it("app_atualizar_produtos_fiscal_lote: guard vem depois da última validação de loja_fiscal_regra_id e antes do único UPDATE set-based", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_produtos_fiscal_lote");
    const idxValidacao = corpo.search(/loja_fiscal_regra_invalida/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxUpdate = corpo.search(/update\s+public\.tab_produtos/i);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxValidacao);
    expect(idxUpdate).toBeGreaterThan(idxGuard);

    const updates = [...corpo.matchAll(/update\s+public\.tab_produtos/gi)];
    expect(updates).toHaveLength(1);
  });
});

describe("migration 146 — auth, tenant e validações preservados", () => {
  it.each(ASSINATURAS)(
    "$nome: corpo idêntico ao de 124 após remover o único guard",
    (fn) => {
      const atual = trechoFuncao(sql, fn.nome);
      const original = trechoFuncao(fn.origem, fn.nome);
      expect(normalizar(semGuard(atual))).toBe(normalizar(original));
    },
  );

  it("app_criar_produto preserva auth, admin, tenant, todas as FKs opcionais e retorno to_jsonb(p)", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_criar_produto");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_obrigatoria/);
    expect(corpo).toMatch(/loja_invalida/);
    expect(corpo).toMatch(/v_loja := v_caller\.loja_id/);
    expect(corpo).toMatch(/produto_nome_invalido/);
    expect(corpo).toMatch(/produto_preco_invalido/);
    expect(corpo).toMatch(/categoria_invalida/);
    expect(corpo).toMatch(/setor_invalido/);
    expect(corpo).toMatch(/impressora_invalida/);
    expect(corpo).toMatch(/ncm_invalido/);
    expect(corpo).toMatch(/cfop_invalido/);
    expect(corpo).toMatch(/pis_invalido/);
    expect(corpo).toMatch(/cofins_invalido/);
    expect(corpo).toMatch(/ipi_invalido/);
    expect(corpo).toMatch(/cest_invalido/);
    expect(corpo).toMatch(/loja_fiscal_regra_invalida/);
    expect(corpo).toMatch(/return to_jsonb\(p\)/);
  });

  it("app_atualizar_produto preserva SELECT prévio, tenant, imutabilidade de loja_id, PATCH parcial e retorno to_jsonb(p)", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_produto");
    expect(corpo).toMatch(
      /select \* into v_atual from public\.tab_produtos where id = p_produto_id/,
    );
    expect(corpo).toMatch(/produto_nao_encontrado/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    const setClause = corpo.match(
      /update public\.tab_produtos set([\s\S]*?)where id = p_produto_id/i,
    );
    expect(setClause, "SET clause do UPDATE não encontrado").toBeTruthy();
    expect(setClause[1]).not.toMatch(/^\s*loja_id\s*=/m);
    expect(corpo).toMatch(/return to_jsonb\(p\)/);
  });

  it("app_excluir_produto preserva SELECT/tenant antes do assert e DELETE físico", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_excluir_produto");
    expect(corpo).toMatch(
      /select \* into v_atual from public\.tab_produtos where id = p_produto_id/,
    );
    expect(corpo).toMatch(/produto_nao_encontrado/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/delete from public\.tab_produtos where id = p_produto_id/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'id', p_produto_id\)/);
  });

  it("app_atualizar_produtos_fiscal_lote preserva resolução de tenant, allowlist fiscal, id = ANY(p_produto_ids), loja_id = v_loja e retorno de contagem", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_produtos_fiscal_lote");
    expect(corpo).toMatch(/loja_obrigatoria/);
    expect(corpo).toMatch(/v_loja := v_caller\.loja_id/);
    expect(corpo).toMatch(/array_length\(p_produto_ids,\s*1\)\s+is\s+null/i);
    expect(corpo).toMatch(/ncm_invalido/);
    expect(corpo).toMatch(/cfop_invalido/);
    expect(corpo).toMatch(/pis_invalido/);
    expect(corpo).toMatch(/cofins_invalido/);
    expect(corpo).toMatch(/ipi_invalido/);
    expect(corpo).toMatch(/cest_invalido/);
    expect(corpo).toMatch(/loja_fiscal_regra_invalida/);
    expect(corpo).toMatch(/where\s+id\s*=\s*any\s*\(\s*p_produto_ids\s*\)/i);
    expect(corpo).toMatch(/and\s+loja_id\s*=\s*v_loja/i);
    expect(corpo).toMatch(/get diagnostics v_afetados = row_count/i);
    expect(corpo).toMatch(/return v_afetados/i);
  });
});

describe("migration 146 — grants intocados", () => {
  it("não adiciona nenhum GRANT ou REVOKE (grants das 4 RPCs já eram authenticated apenas)", () => {
    expect(grantsDe(sqlSemComentarios)).toHaveLength(0);
    expect(revokesDe(sqlSemComentarios)).toHaveLength(0);
  });

  it("não concede EXECUTE do assert a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });
});

describe("migration 146 — proibições de escopo", () => {
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

  it("não cria frontend/API nem NOTIFY pgrst (fora de comentários herdados de 124)", () => {
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

describe("migration 146 — postchecks fail-closed", () => {
  it("possui postcheck 146 antes do COMMIT e não executa o assert", () => {
    expect(sql).toMatch(/postcheck 146/i);
    const idxPostcheck = sql.search(/postcheck 146/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(
      /select\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova RPC count = 4", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 4 RPCs de produtos/i);
    expect(sqlSemComentarios).toMatch(
      /proname in \('app_criar_produto', 'app_atualizar_produto', 'app_excluir_produto', 'app_atualizar_produtos_fiscal_lote'\)/i,
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

  it("prova os return types corretos (jsonb para 3 RPCs, integer para fiscal_lote)", () => {
    expect(sqlSemComentarios).toMatch(
      /app_criar_produto\(bigint, jsonb\)'\)\)\s+is distinct from 'jsonb'::regtype/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_atualizar_produtos_fiscal_lote\(bigint, bigint\[\], jsonb\)'\)\)\s+is distinct from 'integer'::regtype/i,
    );
  });

  it("prova guard presente exatamente 1 vez em cada RPC, com (null, null), total 4, sem operation_id", () => {
    expect(sqlSemComentarios).toMatch(/guard deveria aparecer exatamente 1 vez/);
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)/,
    );
    expect(sqlSemComentarios).toMatch(
      /regexp_matches\(v_prosrc,\s*'app_assert_business_write_allowed'/,
    );
    expect(sqlSemComentarios).toMatch(/esperado exatamente 4 guards no total/i);
    expect(sqlSemComentarios).toMatch(/não deveria referenciar operation_id/i);
  });

  it("prova que app_atualizar_produtos_fiscal_lote preserva a estrutura atômica (id = ANY / loja_id = v_loja) e o UPDATE em tab_produtos", () => {
    expect(sqlSemComentarios).toMatch(
      /perdeu "id = any\(p_produto_ids\)"/i,
    );
    expect(sqlSemComentarios).toMatch(/perdeu "loja_id = v_loja"/i);
    expect(sqlSemComentarios).toMatch(
      /perdeu o UPDATE em tab_produtos/i,
    );
  });

  it("prova que app_excluir_produto preserva o DELETE físico e app_criar_produto/app_atualizar_produto preservam INSERT/UPDATE", () => {
    expect(sqlSemComentarios).toMatch(/perdeu o DELETE físico em tab_produtos/i);
    expect(sqlSemComentarios).toMatch(/perdeu o INSERT em tab_produtos/i);
    expect(sqlSemComentarios).toMatch(/app_atualizar_produto perdeu o UPDATE em tab_produtos/i);
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
