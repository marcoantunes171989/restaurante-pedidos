import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 129 (Gate 8.75): comprova, lendo o texto
// SQL real do arquivo, que o hardening multi-tenant de
// tab_impressoes_cozinha continua presente. A própria migration também se
// autoprotege com uma validação equivalente em runtime (pg_class/pg_policy/
// aclexplode/has_table_privilege dentro do bloco `do $$ ... end $$;` final)
// — este teste é a segunda camada, que roda em CI/local sem precisar de um
// Postgres real e falha imediatamente se alguém remover a proteção ao
// editar o arquivo.
const sql = readFileSync("supabase/migrations/129_hardening_fila_impressoes.sql", "utf8");

// Remove comentários de linha (-- ...) para checagens estruturais estritas —
// o cabeçalho/comentários da migration documentam de propósito a policy
// legacy removida e o escopo negativo (ex.: "não toca tab_impressoras"),
// o que faria uma regex ingênua sobre o texto bruto disparar falso-positivo.
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

function blocosCreatePolicy(texto) {
  return texto.split(/create policy/i).slice(1).map((bloco) => bloco.split(";")[0]);
}

function statementsSobre(texto, tabela) {
  return (texto.match(new RegExp(`\\b(grant|revoke)[^;]*\\bon table\\s+public\\.${tabela}[^;]*;`, "gi")) || []);
}

const migration125 = readFileSync("supabase/migrations/125_dispositivos_sessao_seguros.sql", "utf8");
const migration126 = readFileSync("supabase/migrations/126_reparo_acl_sessao_iniciar.sql", "utf8");
const migration127 = readFileSync("supabase/migrations/127_reparo_acl_sessao_encerrar.sql", "utf8");
const migration128 = readFileSync("supabase/migrations/128_reparo_acl_fidelidade_publica.sql", "utf8");

describe("migration 129 — existência e imutabilidade das migrations antigas", () => {
  it("o arquivo 129 existe e não está vazio", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("não modifica o texto das migrations 125/126/127/128 (arquivos irmãos não tocados)", () => {
    expect(migration125).not.toContain("tab_impressoes_cozinha");
    expect(migration126).not.toContain("tab_impressoes_cozinha");
    expect(migration127).not.toContain("tab_impressoes_cozinha");
    expect(migration128).not.toContain("tab_impressoes_cozinha");
  });
});

describe("migration 129 — remoção da policy legacy", () => {
  it('faz DROP POLICY IF EXISTS da policy legacy "tab_impressoes_cozinha_all"', () => {
    expect(sql).toMatch(/drop policy if exists "tab_impressoes_cozinha_all" on public\.tab_impressoes_cozinha/i);
  });

  it("não recria using(true)/with check(true) em nenhuma policy", () => {
    // Restrito aos blocos "create policy ... ;" — a mensagem de erro do
    // validation block cita "using(true)/with check(true)" como texto
    // descritivo do que está sendo checado, não como SQL executável.
    const blocos = blocosCreatePolicy(sqlSemComentarios);
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      expect(bloco).not.toMatch(/using\s*\(\s*true\s*\)/i);
      expect(bloco).not.toMatch(/with check\s*\(\s*true\s*\)/i);
    }
  });
});

describe("migration 129 — policies novas SELECT/INSERT/UPDATE (sem DELETE, sem FOR ALL)", () => {
  it("cria policy SELECT para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoes_cozinha_select_tenant"[\s\S]*?for select[\s\S]*?to authenticated/i);
  });

  it("cria policy INSERT para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoes_cozinha_insert_tenant"[\s\S]*?for insert[\s\S]*?to authenticated/i);
  });

  it("cria policy UPDATE para authenticated", () => {
    expect(sql).toMatch(/create policy "tab_impressoes_cozinha_update_tenant"[\s\S]*?for update[\s\S]*?to authenticated/i);
  });

  it("nenhuma policy DELETE é criada", () => {
    const blocos = blocosCreatePolicy(sqlSemComentarios);
    for (const bloco of blocos) {
      expect(bloco).not.toMatch(/for delete/i);
    }
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

describe("migration 129 — regra tenant fail-closed (app_is_super/app_loja_id/loja_id IS NOT NULL)", () => {
  it("usa public.app_is_super()", () => {
    expect(sql).toContain("public.app_is_super()");
  });

  it("usa public.app_loja_id()", () => {
    expect(sql).toContain("public.app_loja_id()");
  });

  it("exige loja_id is not null nas regras tenant", () => {
    expect(sql).toMatch(/loja_id\s+is\s+not\s+null/i);
  });

  it("as três policies novas usam a mesma expressão tenant-safe", () => {
    const ocorrencias = sql.match(/loja_id is not null\s+and \(\s+public\.app_is_super\(\)\s+or loja_id = public\.app_loja_id\(\)\s+\)/g) || [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(4); // select, insert, update USING, update WITH CHECK
  });
});

describe("migration 129 — ACL de tabela", () => {
  it("faz REVOKE ALL de PUBLIC, anon e authenticated", () => {
    expect(sql).toMatch(/revoke all privileges on table public\.tab_impressoes_cozinha from public, anon, authenticated/i);
  });

  it("concede somente SELECT, INSERT, UPDATE a authenticated", () => {
    expect(sql).toMatch(/grant select, insert, update on table public\.tab_impressoes_cozinha to authenticated/i);
  });

  it("nenhuma concessão de DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoes_cozinha").filter((s) => /^grant/i.test(s.trim()));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g.toLowerCase()).not.toMatch(/\bdelete\b/);
      expect(g.toLowerCase()).not.toMatch(/\btruncate\b/);
      expect(g.toLowerCase()).not.toMatch(/\btrigger\b/);
      expect(g.toLowerCase()).not.toMatch(/\breferences\b/);
      expect(g.toLowerCase()).not.toMatch(/\bmaintain\b/);
    }
  });

  it("anon não recebe nenhum GRANT nesta tabela", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoes_cozinha").filter((s) => /^grant/i.test(s.trim()));
    for (const g of grants) {
      expect(g).not.toMatch(/\bto\b[^;]*\banon\b/i);
    }
  });

  it("PUBLIC não recebe nenhum GRANT nesta tabela", () => {
    const grants = statementsSobre(sqlSemComentarios, "tab_impressoes_cozinha").filter((s) => /^grant/i.test(s.trim()));
    for (const g of grants) {
      expect(g).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });

  it("service_role não aparece em nenhum REVOKE nem GRANT desta tabela", () => {
    const clauses = statementsSobre(sqlSemComentarios, "tab_impressoes_cozinha");
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause.toLowerCase()).not.toContain("service_role");
    }
  });
});

describe("migration 129 — validation block (runtime)", () => {
  it("verifica ACL real via has_table_privilege/aclexplode", () => {
    expect(sql).toContain("has_table_privilege(");
    expect(sql).toContain("aclexplode(");
  });

  it("verifica as policies via pg_policies", () => {
    expect(sql).toContain("from pg_policies");
  });
});

describe("migration 129 — escopo negativo", () => {
  it("nenhuma referência a pub_criar_pedido_v2", () => {
    expect(sql).not.toContain("pub_criar_pedido_v2");
  });

  it("nenhuma referência ativa à migration 119 (reativação)", () => {
    expect(sql.toLowerCase()).not.toMatch(/reativ\w*\s+.*119|119.*reativ/);
  });

  it("nenhuma alteração em tab_impressoras (menções em comentário de escopo são permitidas)", () => {
    expect(sqlSemComentarios).not.toMatch(/\btab_impressoras\b/);
  });

  it("nenhuma operação de dados (INSERT/UPDATE/DELETE) em registros reais de tab_impressoes_cozinha", () => {
    expect(sql).not.toMatch(/^\s*insert into public\.tab_impressoes_cozinha/im);
    expect(sql).not.toMatch(/^\s*update public\.tab_impressoes_cozinha\s+set/im);
    expect(sql).not.toMatch(/^\s*delete from public\.tab_impressoes_cozinha/im);
  });
});
