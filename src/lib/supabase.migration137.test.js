import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 137 (microgate SECURITY-PROD-02): comprova,
// lendo o texto SQL real do arquivo, que o hardening multi-tenant de
// tab_impressoras continua presente. A própria migration também se
// autoprotege com validações precheck/postcheck equivalentes em runtime
// (pg_class/pg_policy/aclexplode/has_table_privilege dentro dos blocos
// `do $$ ... end $$;`) — este teste é a segunda camada, que roda em CI/local
// sem precisar de um Postgres real e falha imediatamente se alguém remover a
// proteção ao editar o arquivo.
const sql = readFileSync("supabase/migrations/137_hardening_tab_impressoras.sql", "utf8");

// Remove comentários de linha (-- ...) para checagens estruturais estritas —
// o cabeçalho/comentários da migration documentam de propósito o escopo
// negativo (tabelas/funções que NÃO devem ser tocadas), o que faria uma
// regex ingênua sobre o texto bruto disparar falso-positivo.
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

function blocosCreatePolicy(texto) {
  return texto.split(/create policy/i).slice(1).map((bloco) => bloco.split(";")[0]);
}

function statementsSobre(texto, tabela) {
  return texto.match(new RegExp(`\\b(grant|revoke)[^;]*\\bon table\\s+public\\.${tabela}[^;]*;`, "gi")) || [];
}

const migration135 = readFileSync("supabase/migrations/135_reparo_acl_super_admin_contexto.sql", "utf8");
const migration136 = readFileSync("supabase/migrations/136_reparo_acl_grants_relatorios_e_modulos.sql", "utf8");

const TABELAS_FORA_DE_ESCOPO = [
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

const FUNCOES_FORA_DE_ESCOPO = [
  "app_listar_cargos",
  "app_listar_clientes",
  "app_listar_comandas",
  "app_listar_setores_cozinha",
];

describe("migration 137 — existência e imutabilidade das migrations antigas", () => {
  it("o arquivo 137 existe e não está vazio", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("não modifica o texto das migrations 135/136 (arquivos irmãos não tocados)", () => {
    // migration 136 já menciona tab_impressoras propositalmente (guard de
    // exclusão explícita, escrito quando 136 foi criada) — o que este teste
    // garante é que esse guard permanece intacto, não que a string esteja
    // ausente.
    expect(migration135).not.toContain("tab_impressoras");
    expect(migration136).toContain("EXCLUSÃO EXPLÍCITA: public.tab_impressoras");
  });
});

describe("migration 137 — transacional (BEGIN/COMMIT)", () => {
  it("contém BEGIN", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
  });

  it("contém COMMIT", () => {
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });
});

describe("migration 137 — escopo tab_impressoras", () => {
  it("referencia public.tab_impressoras", () => {
    expect(sql).toContain("public.tab_impressoras");
  });
});

describe("migration 137 — remoção da policy legacy", () => {
  it('faz DROP POLICY IF EXISTS da policy legacy "tab_impressoras_all"', () => {
    expect(sql).toMatch(/drop policy if exists "tab_impressoras_all" on public\.tab_impressoras/i);
  });

  it("não recria using(true)/with check(true) em nenhuma policy", () => {
    const blocos = blocosCreatePolicy(sqlSemComentarios);
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      expect(bloco).not.toMatch(/using\s*\(\s*true\s*\)/i);
      expect(bloco).not.toMatch(/with check\s*\(\s*true\s*\)/i);
    }
  });
});

describe("migration 137 — policies novas SELECT/INSERT/UPDATE/DELETE (sem FOR ALL, sem anon)", () => {
  it("cria policy SELECT para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoras_select_tenant"[\s\S]*?for select[\s\S]*?to authenticated/i);
  });

  it("cria policy INSERT para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoras_insert_tenant"[\s\S]*?for insert[\s\S]*?to authenticated/i);
  });

  it("cria policy UPDATE para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoras_update_tenant"[\s\S]*?for update[\s\S]*?to authenticated/i);
  });

  it("cria policy DELETE para authenticated (manutenção administrativa preservada)", () => {
    expect(sql).toMatch(/create policy "tab_impressoras_delete_tenant"[\s\S]*?for delete[\s\S]*?to authenticated/i);
  });

  it("nenhuma policy FOR ALL é criada", () => {
    const blocos = blocosCreatePolicy(sqlSemComentarios);
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      expect(bloco).not.toMatch(/for all/i);
    }
  });

  it("nenhuma policy é criada para anon", () => {
    const blocos = blocosCreatePolicy(sqlSemComentarios);
    for (const bloco of blocos) {
      expect(bloco).not.toMatch(/\bto anon\b/i);
    }
  });
});

describe("migration 137 — regra tenant fail-closed (app_is_super/app_loja_id/loja_id IS NOT NULL)", () => {
  it("usa public.app_is_super()", () => {
    expect(sql).toContain("public.app_is_super()");
  });

  it("usa public.app_loja_id()", () => {
    expect(sql).toContain("public.app_loja_id()");
  });

  it("exige loja_id is not null nas regras tenant", () => {
    expect(sql).toMatch(/loja_id\s+is\s+not\s+null/i);
  });

  it("as quatro policies novas usam a mesma expressão tenant-safe", () => {
    const ocorrencias =
      sql.match(/public\.app_is_super\(\)\s+or \(\s+loja_id is not null\s+and loja_id = public\.app_loja_id\(\)\s+\)/g) || [];
    // select, insert, update USING, update WITH CHECK, delete
    expect(ocorrencias.length).toBeGreaterThanOrEqual(5);
  });
});

describe("migration 137 — não altera coluna loja_id", () => {
  it("não contém ALTER COLUMN loja_id SET NOT NULL", () => {
    expect(sql).not.toMatch(/alter\s+column\s+loja_id\s+set\s+not\s+null/i);
  });
});

describe("migration 137 — ACL de tabela", () => {
  it("faz REVOKE ALL de PUBLIC, anon e authenticated", () => {
    expect(sql).toMatch(/revoke all privileges on table public\.tab_impressoras from public, anon, authenticated/i);
  });

  it("concede SELECT, INSERT, UPDATE, DELETE apenas a authenticated", () => {
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.tab_impressoras to authenticated/i);
  });

  it("nenhuma concessão de TRUNCATE/TRIGGER/REFERENCES/MAINTAIN", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoras").filter((s) => /^grant/i.test(s.trim()));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g.toLowerCase()).not.toMatch(/\btruncate\b/);
      expect(g.toLowerCase()).not.toMatch(/\btrigger\b/);
      expect(g.toLowerCase()).not.toMatch(/\breferences\b/);
      expect(g.toLowerCase()).not.toMatch(/\bmaintain\b/);
    }
  });

  it("anon não recebe nenhum GRANT nesta tabela", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoras").filter((s) => /^grant/i.test(s.trim()));
    for (const g of grants) {
      expect(g).not.toMatch(/\bto\b[^;]*\banon\b/i);
    }
  });

  it("PUBLIC não recebe nenhum GRANT nesta tabela", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoras").filter((s) => /^grant/i.test(s.trim()));
    for (const g of grants) {
      expect(g).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });

  it("REVOKE explicitamente inclui anon", () => {
    const revokes = statementsSobre(sqlSemComentarios, "tab_impressoras").filter((s) => /^revoke/i.test(s.trim()));
    expect(revokes.length).toBeGreaterThan(0);
    for (const r of revokes) {
      expect(r).toMatch(/\bfrom\b[^;]*\banon\b/i);
    }
  });

  it("service_role não aparece em nenhum REVOKE nem GRANT desta tabela", () => {
    const clauses = statementsSobre(sqlSemComentarios, "tab_impressoras");
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause.toLowerCase()).not.toContain("service_role");
    }
  });
});

describe("migration 137 — precheck e postcheck fail-closed (runtime)", () => {
  it("possui bloco de precheck antes das alterações (referência explícita a 'precheck 137')", () => {
    expect(sql).toMatch(/precheck 137/i);
  });

  it("possui bloco de postcheck antes do COMMIT (referência explícita a 'postcheck 137')", () => {
    expect(sql).toMatch(/postcheck 137/i);
  });

  it("usa RAISE EXCEPTION para abortar em caso de premissa divergente", () => {
    expect(sql.toLowerCase()).toContain("raise exception");
  });

  it("verifica ACL real via has_table_privilege/aclexplode", () => {
    expect(sql).toContain("has_table_privilege(");
    expect(sql).toContain("aclexplode(");
  });

  it("verifica as policies via pg_policies", () => {
    expect(sql).toContain("from pg_policies");
  });

  it("o precheck ocorre antes do DROP POLICY e o postcheck antes do COMMIT", () => {
    const idxPrecheck = sql.search(/precheck 137/i);
    const idxDrop = sql.search(/drop policy if exists "tab_impressoras_all"/i);
    const idxPostcheck = sql.search(/postcheck 137/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);

    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxDrop).toBeGreaterThan(-1);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(-1);

    expect(idxPrecheck).toBeLessThan(idxDrop);
    expect(idxPostcheck).toBeLessThan(idxCommit);
    expect(idxDrop).toBeLessThan(idxPostcheck);
  });
});

describe("migration 137 — proibições absolutas de escopo", () => {
  it("não contém ALTER DEFAULT PRIVILEGES", () => {
    expect(sql.toLowerCase()).not.toMatch(/alter\s+default\s+privileges/);
  });

  it("não toca nenhuma das tabelas fora de escopo (proibidas pelo microgate)", () => {
    for (const tabela of TABELAS_FORA_DE_ESCOPO) {
      expect(sqlSemComentarios).not.toMatch(new RegExp(`\\b${tabela}\\b`, "i"));
    }
  });

  it("não toca nenhuma das funções fora de escopo (proibidas pelo microgate)", () => {
    for (const fn of FUNCOES_FORA_DE_ESCOPO) {
      expect(sqlSemComentarios).not.toContain(fn);
    }
  });

  it("não altera corpos de função (sem CREATE FUNCTION / CREATE OR REPLACE FUNCTION / ALTER FUNCTION)", () => {
    expect(sql.toLowerCase()).not.toMatch(/create\s+(or\s+replace\s+)?function/);
    expect(sql.toLowerCase()).not.toMatch(/alter\s+function/);
  });

  it("não contém comandos SQL de aplicação/administração remota (fora de comentários de escopo)", () => {
    expect(sqlSemComentarios.toLowerCase()).not.toContain("apply_migration");
    expect(sqlSemComentarios.toLowerCase()).not.toContain("db push");
    expect(sqlSemComentarios.toLowerCase()).not.toContain("migration repair");
  });

  it("não altera Realtime (sem ALTER PUBLICATION executado, fora de comentários de escopo)", () => {
    expect(sqlSemComentarios.toLowerCase()).not.toMatch(/alter\s+publication/);
  });

  it("nenhuma operação de dados (INSERT/UPDATE/DELETE) em registros reais de tab_impressoras", () => {
    expect(sql).not.toMatch(/^\s*insert into public\.tab_impressoras\s*\(/im);
    expect(sql).not.toMatch(/^\s*update public\.tab_impressoras\s+set/im);
    expect(sql).not.toMatch(/^\s*delete from public\.tab_impressoras\s*;/im);
  });
});
