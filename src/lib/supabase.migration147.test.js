import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/147_maintenance_rpc_guard_admin_final.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration100 = readFileSync(
  "supabase/migrations/100_controle_acessos_permanencia.sql",
  "utf8",
);
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
const migration146 = readFileSync(
  "supabase/migrations/146_maintenance_rpc_guard_produtos.sql",
  "utf8",
);

const ASSINATURAS = [
  {
    nome: "app_atualizar_loja",
    args: "bigint, jsonb",
    ret: "jsonb",
    dml: /\bupdate\s+public\.tab_lojas\b/i,
    origem: migration124,
  },
  {
    nome: "app_evento_acesso_excluir",
    args: "uuid",
    ret: "jsonb",
    dml: /\bdelete\s+from\s+public\.tab_access_events\b/i,
    origem: migration100,
  },
  {
    nome: "app_salvar_funcionamento_loja",
    args: "bigint, jsonb",
    ret: "jsonb",
    dml: /\bupdate\s+public\.tab_lojas\b/i,
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
  const padroes = [/\bupdate\s+public\./i, /\bdelete\s+from\b/i];
  const idxs = padroes.map((re) => corpo.search(re)).filter((idx) => idx >= 0);
  expect(idxs.length, "DML não encontrado no corpo").toBeGreaterThan(0);
  return Math.min(...idxs);
}

describe("migration 147 — existência e transação", () => {
  it("arquivo 147 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^147[_.]/.test(f));
    expect(arquivos).toEqual(["147_maintenance_rpc_guard_admin_final.sql"]);
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

describe("migration 147 — 100/124/140–146 intactas", () => {
  it("não modifica o arquivo da migration 100 nem 124", () => {
    expect(migration100).toMatch(
      /create or replace function public\.app_evento_acesso_excluir\s*\(/i,
    );
    expect(migration100).not.toMatch(/app_assert_business_write_allowed/i);

    expect(migration124).toMatch(/create or replace function public\.app_atualizar_loja\s*\(/i);
    expect(migration124).toMatch(
      /create or replace function public\.app_salvar_funcionamento_loja\s*\(/i,
    );
    expect(migration124).toMatch(/create or replace function public\.app_criar_categoria\s*\(/i);
    expect(migration124).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica as migrations 140, 141 e 142", () => {
    expect(migration140).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration141).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration142).toMatch(
      /create function public\.app_assert_business_write_allowed/i,
    );
    expect(migration142).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
  });

  it("não modifica as migrations 143, 144, 145 e 146", () => {
    expect(migration143).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration144).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration145).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration146).not.toMatch(
      /app_atualizar_loja|app_evento_acesso_excluir|app_salvar_funcionamento_loja/i,
    );
    expect(migration143).toMatch(/app_criar_mesa|app_atualizar_mesa/i);
    expect(migration144).toMatch(/postcheck 144/i);
    expect(migration145).toMatch(/app_criar_cupom/i);
    expect(migration146).toMatch(/app_criar_produto/i);
  });
});

describe("migration 147 — precheck fail-closed", () => {
  it("possui precheck 147 antes do primeiro CREATE OR REPLACE", () => {
    expect(sql).toMatch(/precheck 147/i);
    const idxPrecheck = sql.search(/precheck 147/i);
    const idxCreate = sql.search(/create or replace function public\.app_atualizar_loja/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige assert da 142, as 3 RPCs existentes e 147 ainda não aplicada conceitualmente", () => {
    expect(sqlSemComentarios).toMatch(
      /public\.app_assert_business_write_allowed\(uuid, text\) não existe \(migration 142 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /já contém o guard \(migration 147 já aplicada conceitualmente\)/i,
    );
    for (const fn of ASSINATURAS) {
      expect(sqlSemComentarios).toMatch(new RegExp(fn.nome, "i"));
    }
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
  });

  it("rejeita ambiguidade/overload não previsto (exatamente 1 função por nome, para as 3 RPCs)", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 overload de app_atualizar_loja/i);
    expect(sqlSemComentarios).toMatch(
      /esperado exatamente 1 overload de app_evento_acesso_excluir/i,
    );
    expect(sqlSemComentarios).toMatch(
      /esperado exatamente 1 overload de app_salvar_funcionamento_loja/i,
    );
    expect(sqlSemComentarios).toMatch(/proname = 'app_atualizar_loja'/i);
  });

  it("precheck valida owner/SECURITY DEFINER/search_path/ACL do assert e das 3 RPCs antes de qualquer CREATE OR REPLACE", () => {
    const idxPrecheckFim = sql.search(/end \$\$;/i);
    const idxCreate = sql.search(/create or replace function public\.app_atualizar_loja/i);
    expect(idxPrecheckFim).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheckFim);

    const blocoPrecheck = sqlSemComentarios.slice(
      sqlSemComentarios.search(/precheck 147/i),
      sqlSemComentarios.search(/create or replace function public\.app_atualizar_loja/i),
    );
    expect(blocoPrecheck).toMatch(/owner deveria ser postgres/i);
    expect(blocoPrecheck).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(blocoPrecheck).toMatch(/proconfig deveria conter search_path=public/i);
    expect(blocoPrecheck).toMatch(/anon NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/service_role NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });

  it("precheck confirma existência de app_criar_categoria sem redefini-la", () => {
    expect(sqlSemComentarios).toMatch(
      /app_criar_categoria\(bigint,\s*text,\s*bigint,\s*bigint,\s*integer\)/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_criar_categoria/i,
    );
  });

  it("tira um snapshot do ACL (proacl) das 3 RPCs antes de qualquer CREATE OR REPLACE", () => {
    expect(sqlSemComentarios).toMatch(/_mig147_acl_snapshot/i);
    expect(sqlSemComentarios).toMatch(/insert into pg_temp\._mig147_acl_snapshot/i);
    const idxSnapshot = sqlSemComentarios.search(/insert into pg_temp\._mig147_acl_snapshot/i);
    const idxCreate = sqlSemComentarios.search(
      /create or replace function public\.app_atualizar_loja/i,
    );
    expect(idxSnapshot).toBeGreaterThan(-1);
    expect(idxSnapshot).toBeLessThan(idxCreate);
  });
});

describe("migration 147 — exatamente 3 CREATE OR REPLACE e 3 assinaturas", () => {
  it("contém exatamente 3 CREATE OR REPLACE FUNCTION", () => {
    const creates = sqlSemComentarios.match(/create\s+or\s+replace\s+function/gi) || [];
    expect(creates).toHaveLength(3);
  });

  it("recria exatamente as 3 assinaturas aprovadas, nesta ordem, com args e return type corretos", () => {
    const encontrados = [
      ...sqlSemComentarios.matchAll(
        /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(jsonb)/gi,
      ),
    ].map((item) => ({
      nome: item[1],
      args: item[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
      ret: item[3].toLowerCase(),
    }));
    expect(encontrados).toHaveLength(3);
    expect(encontrados.map((item) => item.nome)).toEqual(ASSINATURAS.map((fn) => fn.nome));
    expect(encontrados.every((item) => item.ret === "jsonb")).toBe(true);

    expect(encontrados[0].args).toMatch(/^p_loja_id bigint,\s*p_patch jsonb$/i);
    expect(encontrados[1].args).toMatch(/^p_event_id uuid$/i);
    expect(encontrados[2].args).toMatch(/^p_loja_id bigint,\s*p_funcionamento jsonb$/i);
  });

  it("não recria nenhuma quarta RPC nem redefine o assert ou app_criar_categoria", () => {
    expect(sqlSemComentarios).not.toMatch(/app_criar_categoria\(\s*p_/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_criar_categoria/i,
    );
    expect(sqlSemComentarios).not.toMatch(/app_criar_produto/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_cupom/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_mesa/i);
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

describe("migration 147 — guard único antes da primeira mutação", () => {
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
    "$nome: exatamente 1 guard, depois da auth/autorização/tenant/validações e imediatamente antes da primeira mutação, sem mutação antes do guard",
    (fn) => {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      const guards = guardsEm(corpo);
      expect(guards).toHaveLength(1);

      const idxBegin = corpo.search(/\bbegin\b/i);
      const idxNotAuth = corpo.search(/not_authenticated/i);
      const idxForbidden = corpo.search(/forbidden/i);
      const idxGuard = corpo.search(GUARD_RE);
      const idxDml = idxPrimeiroDml(corpo);
      const idxDmlEspecifico = corpo.search(fn.dml);

      expect(idxBegin).toBeGreaterThan(-1);
      expect(idxNotAuth).toBeGreaterThan(-1);
      expect(idxForbidden).toBeGreaterThan(-1);
      expect(idxGuard).toBeGreaterThan(idxBegin);
      expect(idxGuard).toBeGreaterThan(idxNotAuth);
      expect(idxGuard).toBeGreaterThan(idxForbidden);
      expect(idxDml).toBeGreaterThan(idxGuard);
      expect(idxDmlEspecifico).toBeGreaterThan(idxGuard);
      expect(idxDmlEspecifico).toBe(idxDml);

      // Nenhuma mutação (INSERT/UPDATE/DELETE) antes do guard.
      const antesDoGuard = corpo.slice(0, idxGuard);
      expect(antesDoGuard).not.toMatch(/\bupdate\s+public\./i);
      expect(antesDoGuard).not.toMatch(/\bdelete\s+from\s+public\./i);
      expect(antesDoGuard).not.toMatch(/\binsert\s+into\s+public\./i);

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

  it("app_atualizar_loja: guard vem depois da validação forbidden_licenca e antes do bloco begin/UPDATE (com unique_violation)", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_loja");
    const idxValidacao = corpo.search(/forbidden_licenca/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxUpdate = corpo.search(/update\s+public\.tab_lojas/i);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxValidacao);
    expect(idxUpdate).toBeGreaterThan(idxGuard);
    expect(corpo).toMatch(/loja_prefixo_duplicado/i);
  });

  it("app_evento_acesso_excluir: guard vem depois da checagem de escopo de loja (forbidden) e antes do DELETE", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_evento_acesso_excluir");
    const idxEscopo = corpo.search(
      /v_loja_ev is distinct from public\.app_loja_id\(\)/i,
    );
    const idxGuard = corpo.search(GUARD_RE);
    const idxDelete = corpo.search(/delete\s+from\s+public\.tab_access_events/i);
    expect(idxEscopo).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxEscopo);
    expect(idxDelete).toBeGreaterThan(idxGuard);
  });

  it("app_salvar_funcionamento_loja: guard vem depois da checagem de tenant (loja_id) e antes do UPDATE", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_salvar_funcionamento_loja");
    const idxTenant = corpo.search(
      /v_caller\.loja_id is null or v_caller\.loja_id <> p_loja_id/i,
    );
    const idxGuard = corpo.search(GUARD_RE);
    const idxUpdate = corpo.search(/update\s+public\.tab_lojas set funcionamento/i);
    expect(idxTenant).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxTenant);
    expect(idxUpdate).toBeGreaterThan(idxGuard);

    const updates = [...corpo.matchAll(/update\s+public\.tab_lojas/gi)];
    expect(updates).toHaveLength(1);
  });
});

describe("migration 147 — auth, tenant e validações preservados", () => {
  it.each(ASSINATURAS)("$nome: corpo idêntico ao original após remover o único guard", (fn) => {
    const atual = trechoFuncao(sql, fn.nome);
    const original = trechoFuncao(fn.origem, fn.nome);
    expect(normalizar(semGuard(atual))).toBe(normalizar(original));
  });

  it("app_atualizar_loja preserva auth, admin, tenant, allowlist do patch, licença e retorno completo", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_loja");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_nao_encontrada/);
    expect(corpo).toMatch(/forbidden_licenca/);
    expect(corpo).toMatch(/loja_prefixo_duplicado/);
    expect(corpo).toMatch(/v_caller\.loja_id <> p_loja_id/);
    expect(corpo).toMatch(/return jsonb_build_object\(/);
    expect(corpo).toMatch(/'funcionamento', l\.funcionamento/);
  });

  it("app_evento_acesso_excluir preserva auth, permissão de controle de acessos, escopo de loja e retorno (inclusive a anomalia ACL, não corrigida)", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_evento_acesso_excluir");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/app_pode_controle_acessos/);
    expect(corpo).toMatch(/invalid_event/);
    expect(corpo).toMatch(/not_found/);
    expect(corpo).toMatch(/app_is_super/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'deleted', coalesce\(v_n, 0\)\)/);
  });

  it("app_salvar_funcionamento_loja preserva auth, admin, tenant e retorno", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_salvar_funcionamento_loja");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_nao_encontrada/);
    expect(corpo).toMatch(/jsonb_build_object\('id', l\.id, 'funcionamento', l\.funcionamento\)/);
  });
});

describe("migration 147 — grants/ACL intocados", () => {
  it("não adiciona nenhum GRANT ou REVOKE", () => {
    expect(grantsDe(sqlSemComentarios)).toHaveLength(0);
    expect(revokesDe(sqlSemComentarios)).toHaveLength(0);
  });

  it("não usa ALTER DEFAULT PRIVILEGES", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("não concede EXECUTE do assert a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova que o ACL (proacl) é comparado byte-a-byte entre precheck e postcheck para as 3 RPCs", () => {
    expect(sqlSemComentarios).toMatch(/select proacl into v_acl_antes from pg_temp\._mig147_acl_snapshot/i);
    expect(sqlSemComentarios).toMatch(/select p\.proacl::text into v_acl_depois/i);
    expect(sqlSemComentarios).toMatch(/ACL mudou \(antes=%, depois=%\)/i);
  });

  it("documenta a anomalia ACL de app_evento_acesso_excluir sem tentar corrigi-la", () => {
    expect(sql).toMatch(/ANOMALIA ACL CONHECIDA/i);
    expect(sql).toMatch(/NÃO corrige essa anomalia/i);
  });
});

describe("migration 147 — proibições de escopo", () => {
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

  it("a única tabela permanente que cria é temporária (snapshot de ACL), com ON COMMIT DROP", () => {
    const creates = [...sqlSemComentarios.matchAll(/create\s+([a-z ]*?)table\s+([^\s(]+)/gi)];
    expect(creates).toHaveLength(1);
    expect(creates[0][1].toLowerCase()).toContain("temporary");
    expect(creates[0][2]).toMatch(/_mig147_acl_snapshot/i);
    expect(sqlSemComentarios).toMatch(/on commit drop/i);
  });

  it("não usa GUC (set_config/current_setting) nem bypass genérico", () => {
    expect(sqlSemComentarios).not.toMatch(/set_config/i);
    expect(sqlSemComentarios).not.toMatch(/current_setting/i);
    expect(sqlSemComentarios).not.toMatch(/bypass/i);
  });

  it("não cria frontend/API nem NOTIFY pgrst", () => {
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

describe("migration 147 — postchecks fail-closed", () => {
  it("possui postcheck 147 antes do COMMIT e não executa o assert", () => {
    expect(sql).toMatch(/postcheck 147/i);
    const idxPostcheck = sql.search(/postcheck 147/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(
      /select\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova RPC count = 3", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 RPCs administrativas/i);
    expect(sqlSemComentarios).toMatch(
      /proname in \('app_atualizar_loja', 'app_evento_acesso_excluir', 'app_salvar_funcionamento_loja'\)/i,
    );
  });

  it("prova owner=postgres, SECURITY DEFINER, search_path preservados", () => {
    expect(sqlSemComentarios).toMatch(/pg_get_userbyid\(p\.proowner\)/);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true \(SECURITY DEFINER\)/);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/service_role NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
  });

  it("prova os return types corretos (jsonb para as 3 RPCs)", () => {
    expect(sqlSemComentarios).toMatch(
      /app_atualizar_loja\(bigint, jsonb\)'\)\)\s+is distinct from 'jsonb'::regtype/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_evento_acesso_excluir\(uuid\)'\)\)\s+is distinct from 'jsonb'::regtype/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_salvar_funcionamento_loja\(bigint, jsonb\)'\)\)\s+is distinct from 'jsonb'::regtype/i,
    );
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

  it("prova que app_atualizar_loja preserva o UPDATE em tab_lojas e o tratamento de unique_violation", () => {
    expect(sqlSemComentarios).toMatch(/perdeu o UPDATE em tab_lojas\./i);
    expect(sqlSemComentarios).toMatch(/perdeu o tratamento de unique_violation/i);
  });

  it("prova que app_evento_acesso_excluir preserva o DELETE físico em tab_access_events", () => {
    expect(sqlSemComentarios).toMatch(/perdeu o DELETE físico em tab_access_events/i);
  });

  it("prova que app_salvar_funcionamento_loja preserva o UPDATE em tab_lojas", () => {
    expect(sqlSemComentarios).toMatch(
      /app_salvar_funcionamento_loja perdeu o UPDATE em tab_lojas/i,
    );
  });

  it("prova que app_criar_categoria não recebe o guard (verificação pós-migration)", () => {
    expect(sqlSemComentarios).toMatch(
      /app_criar_categoria NÃO deveria conter o guard de manutenção/i,
    );
    expect(sqlSemComentarios).toMatch(
      /p\.proname = 'app_criar_categoria'[\s\S]*?prosrc ilike '%app_assert_business_write_allowed%'/i,
    );
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

  it("prova que authenticated continua com EXECUTE nas duas RPCs de loja (sem alterar a anomalia da de eventos)", () => {
    expect(sqlSemComentarios).toMatch(
      /app_atualizar_loja\(bigint, jsonb\)', 'execute'\)\s*then\s*[\s\S]*?authenticated deveria continuar com EXECUTE/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_salvar_funcionamento_loja\(bigint, jsonb\)', 'execute'\)\s*then\s*[\s\S]*?authenticated deveria continuar com EXECUTE/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /app_evento_acesso_excluir\(uuid\)', 'execute'\)\s*then\s*[\s\S]*?authenticated deveria/i,
    );
  });
});
