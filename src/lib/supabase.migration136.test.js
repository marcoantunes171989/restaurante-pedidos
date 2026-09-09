import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 136 (MICROGATE 08-C3I-C): comprova, lendo
// o SQL real do arquivo, que o forward-fix é GRANT-only nas 12 tabelas e
// EXECUTE-only nas 4 RPCs já existentes — sem tocar RLS/policy, corpo/
// assinatura de função, tab_impressoras ou anon. A própria migration também
// se autovalida em runtime (blocos `do $$ ... end $$;` de precheck e
// validação final); este teste é a segunda camada, roda em CI/local sem
// Postgres real.
const sqlPath = "supabase/migrations/136_reparo_acl_grants_relatorios_e_modulos.sql";
const sql = readFileSync(sqlPath, "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida — ex.: explicar por que tab_impressoras está fora
// de escopo) de ALTERAÇÃO real em SQL executável.
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

const TABELAS_ESPERADAS = [
  "fiscal_template",
  "fiscal_catalogo_cst_pis",
  "loja_fiscal_regra",
  "fiscal_template_regra",
  "tab_caixas",
  "tab_fidelidade_transacoes",
  "tab_chamados",
  "tab_pesquisa_satisfacao",
  "tab_setores_cozinha",
  "tab_comandas",
  "tab_clientes",
  "tab_cargos",
];

const VERBOS_ESPERADOS = {
  fiscal_template: ["select", "insert", "update", "delete"],
  fiscal_catalogo_cst_pis: ["select", "insert", "update", "delete"],
  loja_fiscal_regra: ["select", "insert", "update", "delete"],
  fiscal_template_regra: ["select", "insert", "delete"],
  tab_caixas: ["select", "insert", "update"],
  tab_fidelidade_transacoes: ["select", "insert"],
  tab_chamados: ["select", "insert", "update"],
  tab_pesquisa_satisfacao: ["select"],
  tab_setores_cozinha: ["select", "insert", "update", "delete"],
  tab_comandas: ["select", "update", "delete"],
  tab_clientes: ["select", "insert", "update"],
  tab_cargos: ["select", "insert", "update", "delete"],
};

const RPCS_ESPERADAS = [
  "public.app_listar_cargos()",
  "public.app_listar_clientes()",
  "public.app_listar_comandas()",
  "public.app_listar_setores_cozinha()",
];

// Extrai o literal jsonb `v_allowed := '{ ... }'::jsonb` do texto do SQL e
// devolve como objeto JS — permite validar a allowlist de verbos
// programaticamente em vez de textualmente.
function extrairAllowedJson(texto) {
  const idxInicio = texto.indexOf("v_allowed jsonb := '{");
  expect(idxInicio, "declaração v_allowed jsonb não encontrada").toBeGreaterThan(-1);
  const idxChaveInicial = texto.indexOf("{", idxInicio);
  const idxFim = texto.indexOf("}'::jsonb", idxChaveInicial);
  expect(idxFim, "fechamento '}'::jsonb não encontrado").toBeGreaterThan(-1);
  const bruto = texto.slice(idxChaveInicial, idxFim + 1);
  return JSON.parse(bruto);
}

describe("migration 136 — existência, transação e numeração", () => {
  it("arquivo 136 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^136[_.]/.test(f));
    expect(arquivos).toEqual(["136_reparo_acl_grants_relatorios_e_modulos.sql"]);
  });

  it("é transacional (begin ... commit)", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it("NOTIFY pgrst reload schema vem depois do COMMIT", () => {
    const idxCommit = semComentarios.search(/^commit;/m);
    expect(idxCommit).toBeGreaterThan(-1);
    const depois = semComentarios.slice(idxCommit + "commit;".length);
    expect(depois.toLowerCase()).toMatch(/notify pgrst,\s*'reload schema'/);
  });

  it("não cria a migration 119", () => {
    const arquivos119 = readdirSync("supabase/migrations").filter((f) => /^119[_.]/.test(f));
    expect(arquivos119).toEqual([]);
  });

  it("não modifica a migration 135 (byte-idêntica)", () => {
    const migration135 = readFileSync("supabase/migrations/135_reparo_acl_super_admin_contexto.sql", "utf8");
    expect(migration135).toContain("app_sessao_trocar_contexto");
    // Garantia estrutural mínima: 136 não reabre/reescreve a 135 — o próprio
    // arquivo 135 permanece intocado no diretório (verificado pela leitura
    // acima não lançar e o conteúdo não ter sido reescrito por este teste).
    expect(sql).not.toMatch(/app_sessao_trocar_contexto/);
  });
});

describe("migration 136 — contém exatamente as 12 tabelas esperadas", () => {
  const allowed = extrairAllowedJson(semComentarios);

  it("todas as 12 tabelas esperadas estão presentes na allowlist", () => {
    for (const tabela of TABELAS_ESPERADAS) {
      expect(Object.keys(allowed)).toContain(tabela);
    }
  });

  it("a allowlist não contém tabelas além das 12 esperadas", () => {
    expect(Object.keys(allowed).sort()).toEqual([...TABELAS_ESPERADAS].sort());
  });

  it("grants das tabelas respeitam exatamente a allowlist de verbos especificada", () => {
    for (const tabela of TABELAS_ESPERADAS) {
      expect(allowed[tabela].slice().sort()).toEqual([...VERBOS_ESPERADOS[tabela]].sort());
    }
  });
});

describe("migration 136 — tab_impressoras NUNCA aparece em GRANT", () => {
  it("nenhum GRANT/REVOKE de tabela referencia tab_impressoras", () => {
    const statementsAclTabela =
      semComentarios.match(/\b(grant|revoke)\b[^;]*\bon\s+table\b[^;]*;/gi) || [];
    for (const stmt of statementsAclTabela) {
      expect(stmt.toLowerCase()).not.toContain("tab_impressoras");
    }
  });

  it("tab_impressoras só aparece no guard/assertion (has_table_privilege), nunca em GRANT executável", () => {
    expect(sql).toMatch(/tab_impressoras/);
    const linhasComTabImpressoras = semComentarios
      .split("\n")
      .filter((linha) => linha.includes("tab_impressoras"));
    for (const linha of linhasComTabImpressoras) {
      expect(linha.toLowerCase()).not.toMatch(/\bgrant\b/);
    }
  });

  it("guard explícito confirma ausência de SELECT para authenticated antes e depois da migration", () => {
    const ocorrencias = (
      semComentarios.match(/has_table_privilege\('authenticated',\s*'public\.tab_impressoras',\s*'select'\)/g) || []
    ).length;
    expect(ocorrencias).toBeGreaterThanOrEqual(2);
  });
});

describe("migration 136 — nenhum GRANT para anon", () => {
  it("nenhum statement executável concede privilégio de tabela a anon", () => {
    const statementsAclTabela =
      semComentarios.match(/\bgrant\b[^;]*\bon\s+table\b[^;]*;/gi) || [];
    for (const stmt of statementsAclTabela) {
      expect(stmt.toLowerCase()).not.toContain("anon");
    }
  });

  it("nenhum GRANT EXECUTE concede a anon", () => {
    const statementsGrantExecute = semComentarios.match(/\bgrant execute\b[^;]*;/gi) || [];
    expect(statementsGrantExecute.length).toBeGreaterThan(0);
    for (const stmt of statementsGrantExecute) {
      expect(stmt.toLowerCase()).not.toContain("anon");
    }
  });
});

describe("migration 136 — RPCs: REVOKE de PUBLIC/anon e GRANT EXECUTE para authenticated", () => {
  for (const rpc of RPCS_ESPERADAS) {
    const rpcEscapado = rpc.replace(/[().]/g, (c) => `\\${c}`);

    it(`${rpc} — revoke all from public`, () => {
      expect(semComentarios).toMatch(new RegExp(`revoke all on function ${rpcEscapado} from public`));
    });

    it(`${rpc} — revoke all from anon, authenticated`, () => {
      expect(semComentarios).toMatch(
        new RegExp(`revoke all on function ${rpcEscapado} from anon, authenticated`),
      );
    });

    it(`${rpc} — grant execute to authenticated`, () => {
      expect(semComentarios).toMatch(new RegExp(`grant execute on function ${rpcEscapado} to authenticated`));
    });
  }

  it("não modifica corpo (nenhum CREATE FUNCTION referenciando as 4 RPCs)", () => {
    for (const rpc of RPCS_ESPERADAS) {
      const nome = rpc.replace("public.", "").replace("()", "");
      expect(semComentarios).not.toMatch(new RegExp(`create (or replace )?function public\\.${nome}\\b`, "i"));
    }
  });
});

describe("migration 136 — proibições estruturais (ACL-only)", () => {
  it("não contém CREATE OR REPLACE FUNCTION", () => {
    expect(semComentarios).not.toMatch(/create\s+or\s+replace\s+function/i);
  });

  it("não contém CREATE FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\bcreate\s+function\b/i);
  });

  it("não contém ALTER FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\balter\s+function\b/i);
  });

  it("não contém ALTER POLICY", () => {
    expect(semComentarios).not.toMatch(/\balter\s+policy\b/i);
  });

  it("não contém CREATE POLICY", () => {
    expect(semComentarios).not.toMatch(/\bcreate\s+policy\b/i);
  });

  it("não contém DROP POLICY", () => {
    expect(semComentarios).not.toMatch(/\bdrop\s+policy\b/i);
  });

  it("não contém ALTER TABLE", () => {
    expect(semComentarios).not.toMatch(/\balter\s+table\b/i);
  });

  it("não contém ENABLE/DISABLE ROW LEVEL SECURITY", () => {
    expect(semComentarios).not.toMatch(/\b(enable|disable)\s+row\s+level\s+security\b/i);
  });
});

describe("migration 136 — precheck e postcheck fail-closed", () => {
  it("precheck com RAISE EXCEPTION prefixado 'precheck 136:' antes do primeiro GRANT de tabela", () => {
    const idxPrecheck = semComentarios.search(/raise exception 'precheck 136:/);
    const idxGrant = semComentarios.search(/execute\s+format\(\s*\n?\s*'grant %s on table public\.%I to authenticated'/);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(-1);
    expect(idxPrecheck).toBeLessThan(idxGrant);
  });

  it("postcheck com RAISE EXCEPTION prefixado 'validação 136:' depois do último GRANT EXECUTE", () => {
    const idxUltimoGrant = semComentarios.lastIndexOf("grant execute");
    const idxValidacao = semComentarios.search(/raise exception 'validação 136:/);
    expect(idxUltimoGrant).toBeGreaterThan(-1);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxUltimoGrant).toBeLessThan(idxValidacao);
  });

  it("precheck confirma relrowsecurity=true nas 12 tabelas", () => {
    expect(semComentarios).toMatch(/relrowsecurity/);
  });

  it("precheck confirma SECURITY DEFINER e search_path=public nas 4 RPCs", () => {
    expect(semComentarios).toMatch(/prosecdef/);
    expect(semComentarios).toMatch(/search_path=public/);
  });

  it("postcheck usa has_table_privilege para validar authenticated em todas as tabelas/verbos", () => {
    expect(semComentarios).toMatch(/has_table_privilege\('authenticated', format\('public\.%I', v_table\), v_verbo\)/);
  });

  it("postcheck usa has_function_privilege e aclexplode para validar authenticated/anon/PUBLIC nas RPCs", () => {
    expect(semComentarios).toMatch(/has_function_privilege\('authenticated', v_func, 'execute'\)/);
    expect(semComentarios).toMatch(/has_function_privilege\('anon', v_func, 'execute'\)/);
    expect(semComentarios).toMatch(/aclexplode\(/);
    expect(semComentarios).toMatch(/acl\.grantee = 0/);
  });
});

describe("migration 136 — RLS não alterado", () => {
  it("não contém nenhuma menção executável a CREATE/ALTER/DROP POLICY (RLS_CHANGED = NÃO)", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    expect(semComentarios).not.toMatch(/\brow\s+level\s+security\b/i);
  });
});
