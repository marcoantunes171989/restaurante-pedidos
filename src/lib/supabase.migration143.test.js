import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/143_maintenance_rpc_guard_allowlist.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration122 = readFileSync("supabase/migrations/122_mesas_seguras.sql", "utf8");
const migration124 = readFileSync("supabase/migrations/124_catalogo_admin_seguro.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");

const ASSINATURAS = [
  {
    nome: "app_criar_mesa",
    args: "bigint, integer, text, integer, text, text, boolean, boolean",
    dml: /\binsert\s+into\s+public\.tab_mesas\b/i,
    origem: migration122,
  },
  {
    nome: "app_atualizar_mesa",
    args: "bigint, integer, text, integer, text, text, boolean, boolean, boolean",
    dml: /\bupdate\s+public\.tab_mesas\b/i,
    origem: migration122,
  },
  {
    nome: "app_atualizar_categoria",
    args: "bigint, jsonb",
    dml: /\bupdate\s+public\.tab_categorias\b/i,
    origem: migration124,
  },
  {
    nome: "app_excluir_categoria",
    args: "bigint",
    dml: /\bdelete\s+from\s+public\.tab_categorias\b/i,
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

function tiposDe(args) {
  return [...args.matchAll(/\b(bigint|integer|text|boolean|jsonb)\b/gi)].map((item) =>
    item[1].toLowerCase(),
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

describe("migration 143 — existência e transação", () => {
  it("arquivo 143 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^143[_.]/.test(f));
    expect(arquivos).toEqual(["143_maintenance_rpc_guard_allowlist.sql"]);
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

describe("migration 143 — 122/124/142 intactas", () => {
  it("não modifica o arquivo da migration 122", () => {
    expect(migration122).toMatch(/create or replace function public\.app_criar_mesa\s*\(/i);
    expect(migration122).toMatch(/create or replace function public\.app_atualizar_mesa\s*\(/i);
    expect(migration122).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica o arquivo da migration 124", () => {
    expect(migration124).toMatch(
      /create or replace function public\.app_atualizar_categoria\s*\(/i,
    );
    expect(migration124).toMatch(
      /create or replace function public\.app_excluir_categoria\s*\(/i,
    );
    expect(migration124).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("não modifica o arquivo da migration 142", () => {
    expect(migration142).toMatch(
      /create function public\.app_assert_business_write_allowed/i,
    );
    expect(migration142).not.toMatch(/app_criar_mesa/i);
    expect(migration142).not.toMatch(/app_atualizar_categoria/i);
  });
});

describe("migration 143 — precheck fail-closed", () => {
  it("possui precheck 143 antes do primeiro CREATE OR REPLACE", () => {
    expect(sql).toMatch(/precheck 143/i);
    const idxPrecheck = sql.search(/precheck 143/i);
    const idxCreate = sql.search(/create or replace function public\.app_criar_mesa/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige assert da 142, as 4 RPCs existentes e 143 ainda não aplicada conceitualmente", () => {
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(uuid,\s*text\) não existe \(migration 142 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(/não existe/i);
    expect(sqlSemComentarios).toMatch(
      /já contém o guard \(migration 143 já aplicada conceitualmente\)/i,
    );
    for (const fn of ASSINATURAS) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(`app_${fn.nome.replace("app_", "")}|${fn.nome}`, "i"),
      );
    }
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)/,
    );
  });
});

describe("migration 143 — exatamente 4 CREATE OR REPLACE e 4 assinaturas", () => {
  it("contém exatamente 4 CREATE OR REPLACE FUNCTION", () => {
    const creates = sqlSemComentarios.match(/create\s+or\s+replace\s+function/gi) || [];
    expect(creates).toHaveLength(4);
  });

  it("recria exatamente as 4 assinaturas aprovadas, nesta ordem", () => {
    const encontrados = [
      ...sqlSemComentarios.matchAll(
        /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns jsonb/gi,
      ),
    ].map((item) => ({
      nome: item[1],
      args: item[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
    }));
    expect(encontrados).toHaveLength(4);
    expect(encontrados.map((item) => item.nome)).toEqual(ASSINATURAS.map((fn) => fn.nome));
    expect(tiposDe(encontrados[0].args)).toEqual([
      "bigint",
      "integer",
      "text",
      "integer",
      "text",
      "text",
      "boolean",
      "boolean",
    ]);
    expect(tiposDe(encontrados[1].args)).toEqual([
      "bigint",
      "integer",
      "text",
      "integer",
      "text",
      "text",
      "boolean",
      "boolean",
      "boolean",
    ]);
    expect(tiposDe(encontrados[2].args)).toEqual(["bigint", "jsonb"]);
    expect(tiposDe(encontrados[3].args)).toEqual(["bigint"]);
    expect(encontrados[0].args).toMatch(/p_nome\s+text\s+default null/i);
    expect(encontrados[1].args).toMatch(/p_ativo\s+boolean default true/i);
    expect(encontrados[2].args).toMatch(/p_categoria_id bigint,\s*p_patch jsonb/i);
    expect(encontrados[3].args).toMatch(/^p_categoria_id\s+bigint$/i);
  });

  it("não recria nenhuma outra RPC", () => {
    expect(sqlSemComentarios).not.toMatch(/app_listar_mesas/i);
    expect(sqlSemComentarios).not.toMatch(/app_excluir_mesa/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_categoria/i);
    expect(sqlSemComentarios).not.toMatch(/app_criar_produto/i);
    expect(sqlSemComentarios).not.toMatch(/app_atualizar_produto/i);
    expect(sqlSemComentarios).not.toMatch(/app_excluir_produto/i);
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

describe("migration 143 — guard único antes do primeiro DML", () => {
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
  });

  it.each(ASSINATURAS)(
    "$nome: exatamente 1 guard, depois da auth e imediatamente antes do primeiro DML",
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

      const depoisDoDml = corpo.slice(idxDml);
      expect(guardsEm(depoisDoDml)).toHaveLength(0);
    },
  );

  it("não coloca o guard no início da função", () => {
    for (const fn of ASSINATURAS) {
      const corpo = corpoDaFuncao(sqlSemComentarios, fn.nome);
      const semEspaco = corpo.replace(/^\s+/, "");
      expect(semEspaco).not.toMatch(/^perform\s+public\.app_assert_business_write_allowed/i);
    }
  });
});

describe("migration 143 — auth, tenant e validações preservados", () => {
  it.each(ASSINATURAS)(
    "$nome: corpo idêntico ao de 122/124 após remover o único guard",
    (fn) => {
      const atual = trechoFuncao(sql, fn.nome);
      const original = trechoFuncao(fn.origem, fn.nome);
      expect(normalizar(semGuard(atual))).toBe(normalizar(original));
    },
  );

  it("app_criar_mesa preserva auth, admin, tenant, numero e JSON de retorno", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_criar_mesa");
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_obrigatoria/);
    expect(corpo).toMatch(/loja_invalida/);
    expect(corpo).toMatch(/v_loja := v_caller\.loja_id/);
    expect(corpo).toMatch(/mesa_numero_invalido/);
    expect(corpo).toMatch(/mesa_numero_duplicado/);
    expect(corpo).toMatch(/jsonb_build_object/);
    expect(corpo).toMatch(/'permite_qr'/);
  });

  it("app_atualizar_mesa preserva SELECT prévio, tenant, numero imutável de loja_id e JSON", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_mesa");
    expect(corpo).toMatch(/select \* into v_atual from public\.tab_mesas where id = p_mesa_id/);
    expect(corpo).toMatch(/mesa_nao_encontrada/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/mesa_numero_invalido/);
    expect(corpo).toMatch(/mesa_numero_duplicado/);
    expect(corpo).not.toMatch(/loja_id\s*=/);
    expect(corpo).toMatch(/jsonb_build_object/);
  });

  it("app_atualizar_categoria preserva allowlist, tenant, FKs e unique", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_atualizar_categoria");
    expect(corpo).toMatch(/categoria_nao_encontrada/);
    expect(corpo).toMatch(/categoria_nome_invalido/);
    expect(corpo).toMatch(/setor_invalido/);
    expect(corpo).toMatch(/impressora_invalida/);
    expect(corpo).toMatch(/categoria_nome_duplicado/);
    expect(corpo).toMatch(/p_patch \? 'nome'/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/jsonb_build_object/);
  });

  it("app_excluir_categoria preserva SELECT/tenant antes do DELETE e FK traduzida", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, "app_excluir_categoria");
    expect(corpo).toMatch(/categoria_nao_encontrada/);
    expect(corpo).toMatch(/v_atual\.loja_id is distinct from v_caller\.loja_id/);
    expect(corpo).toMatch(/foreign_key_violation/);
    expect(corpo).toMatch(/categoria_possui_produtos/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'id', p_categoria_id\)/);
  });
});

describe("migration 143 — segurança e grants", () => {
  it("reafirma REVOKE ALL das 4 RPCs de public, anon e authenticated", () => {
    for (const fn of ASSINATURAS) {
      const re = new RegExp(
        `revoke all on function public\\.${fn.nome}\\(${fn.args}\\) from public, anon, authenticated;`,
        "i",
      );
      expect(sqlSemComentarios).toMatch(re);
    }
    expect(revokesDe(sqlSemComentarios)).toHaveLength(4);
  });

  it("concede EXECUTE somente a authenticated nas 4 RPCs", () => {
    for (const fn of ASSINATURAS) {
      const re = new RegExp(
        `grant execute on function public\\.${fn.nome}\\(${fn.args}\\) to authenticated;`,
        "i",
      );
      expect(sqlSemComentarios).toMatch(re);
    }
    expect(grantsDe(sqlSemComentarios)).toHaveLength(4);
  });

  it("não concede EXECUTE do assert a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
    const grants = grantsDe(sqlSemComentarios);
    for (const grant of grants) {
      expect(grant).not.toMatch(/app_assert_business_write_allowed/i);
    }
  });
});

describe("migration 143 — proibições de escopo", () => {
  it("não cria table, trigger, policy, event, operation nem state write", () => {
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

  it("não cria frontend/API nem NOTIFY pgrst", () => {
    expect(sqlSemComentarios).not.toMatch(/notify pgrst/i);
    expect(sql).not.toMatch(/src\//);
    expect(sql).not.toMatch(/App\.jsx/);
    expect(sql).not.toMatch(/supabase\.js/);
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

describe("migration 143 — postchecks fail-closed", () => {
  it("possui postcheck 143 antes do COMMIT e não executa o assert", () => {
    expect(sql).toMatch(/postcheck 143/i);
    const idxPostcheck = sql.search(/postcheck 143/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(
      /select\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova assinatura, owner=postgres, SECURITY DEFINER, search_path e grants das 4 RPCs", () => {
    expect(sqlSemComentarios).toMatch(/pg_get_userbyid\(p\.proowner\)/);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true \(SECURITY DEFINER\)/);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/authenticated deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
  });

  it("prova guard presente exatamente 1 vez em cada RPC, com (null, null)", () => {
    expect(sqlSemComentarios).toMatch(
      /guard deveria aparecer exatamente 1 vez/,
    );
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)/,
    );
    expect(sqlSemComentarios).toMatch(/regexp_matches\(v_prosrc,\s*'app_assert_business_write_allowed'/);
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
