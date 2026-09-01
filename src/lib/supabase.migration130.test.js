import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 130 (Gate 8.84B): comprova, lendo o
// texto SQL real do arquivo, que o forward-fix é ACL-only — só repara o
// GRANT/REVOKE de public.app_is_super()/public.app_loja_id(), sem tocar
// corpo, tabelas, RLS/policies, ou qualquer outra RPC (incluindo
// app_caller_email, app_sessao_iniciar, app_sessao_encerrar,
// pub_fidelidade_regra e as pub_* de pedido/cliente/fidelidade). A própria
// migration também se autovalida em runtime (bloco `do $$ ... end $$;`
// final, via to_regprocedure/pg_proc/aclexplode/has_function_privilege) —
// este teste é a segunda camada, roda em CI/local sem Postgres real.
const sql = readFileSync("supabase/migrations/130_reparo_acl_helpers_tenant.sql", "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida, ex.: explicar a causa raiz envolvendo
// tab_impressoes_cozinha/migration 129 ou o motivo de não tocar
// service_role) de ALTERAÇÃO real em SQL executável (proibida fora do
// escopo desta migration).
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

// Statements executáveis de GRANT/REVOKE (para checar service_role/postgres
// sem cair em falso positivo do texto de documentação nos comentários e nas
// docstrings de COMMENT ON FUNCTION).
const statementsGrantRevoke = semComentarios.match(/\b(grant|revoke)\b[^;]*;/gi) || [];

// Remove também os blocos `comment on function ... is '...';` (docstrings
// legítimas que citam tab_impressoes_cozinha/migration 129/migration 097
// como contexto) antes de checar se algum OUTRO objeto foi alterado. Usa
// `';\n` (fecha aspas + ponto-e-vírgula + quebra de linha) como fim de
// bloco — um `[\s\S]*?;` ingênuo pararia no primeiro ";" DENTRO da string
// (ex.: "security definer; corpo definido..."), que não é o fim real do
// statement.
const semDocstrings = semComentarios.replace(/comment on function[\s\S]*?';\n/gi, "");

const migration129 = readFileSync("supabase/migrations/129_hardening_fila_impressoes.sql", "utf8");

describe("migration 130 — existência e assinaturas", () => {
  it("arquivo 130 existe e é legível", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("usa a assinatura app_is_super()", () => {
    expect(sql).toContain("public.app_is_super()");
  });

  it("usa a assinatura app_loja_id()", () => {
    expect(sql).toContain("public.app_loja_id()");
  });
});

describe("migration 130 — ACL de app_is_super()", () => {
  it("fecha PUBLIC (revoke all ... from public)", () => {
    expect(semComentarios).toMatch(/revoke all on function public\.app_is_super\(\)\s*from public/);
  });

  it("revoga anon e authenticated ANTES do grant (fail-closed antes de reconceder)", () => {
    const idxRevokeAnonAuth = semComentarios.search(
      /revoke all on function public\.app_is_super\(\)\s*from anon, authenticated/,
    );
    const idxGrant = semComentarios.search(
      /grant execute on function public\.app_is_super\(\)\s*to authenticated/,
    );
    expect(idxRevokeAnonAuth).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(idxRevokeAnonAuth);
  });

  it("concede EXECUTE somente a authenticated (nenhum GRANT para anon)", () => {
    expect(semComentarios).toMatch(/grant execute on function public\.app_is_super\(\)\s*to authenticated/);
    expect(semComentarios).not.toMatch(/grant execute on function public\.app_is_super\(\)\s*to[^;]*anon/);
  });
});

describe("migration 130 — ACL de app_loja_id()", () => {
  it("fecha PUBLIC (revoke all ... from public)", () => {
    expect(semComentarios).toMatch(/revoke all on function public\.app_loja_id\(\)\s*from public/);
  });

  it("revoga anon e authenticated ANTES do grant (fail-closed antes de reconceder)", () => {
    const idxRevokeAnonAuth = semComentarios.search(
      /revoke all on function public\.app_loja_id\(\)\s*from anon, authenticated/,
    );
    const idxGrant = semComentarios.search(
      /grant execute on function public\.app_loja_id\(\)\s*to authenticated/,
    );
    expect(idxRevokeAnonAuth).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(idxRevokeAnonAuth);
  });

  it("concede EXECUTE somente a authenticated (nenhum GRANT para anon)", () => {
    expect(semComentarios).toMatch(/grant execute on function public\.app_loja_id\(\)\s*to authenticated/);
    expect(semComentarios).not.toMatch(/grant execute on function public\.app_loja_id\(\)\s*to[^;]*anon/);
  });
});

describe("migration 130 — nenhum GRANT para PUBLIC/anon em nenhuma das duas funções", () => {
  it("nenhum GRANT EXECUTE para PUBLIC", () => {
    expect(semComentarios).not.toMatch(
      /grant execute on function public\.(app_is_super|app_loja_id)\(\)\s*to[^;]*\bpublic\b/i,
    );
  });

  it("nenhum GRANT EXECUTE para anon", () => {
    expect(semComentarios).not.toMatch(
      /grant execute on function public\.(app_is_super|app_loja_id)\(\)\s*to[^;]*\banon\b/i,
    );
  });
});

describe("migration 130 — service_role e postgres/owner fora de escopo dos statements executáveis", () => {
  it("existem statements de GRANT/REVOKE no arquivo", () => {
    expect(statementsGrantRevoke.length).toBeGreaterThan(0);
  });

  it("nenhum statement executável de GRANT/REVOKE menciona service_role", () => {
    for (const stmt of statementsGrantRevoke) {
      expect(stmt.toLowerCase()).not.toContain("service_role");
    }
  });

  it("nenhum statement executável de GRANT/REVOKE menciona postgres", () => {
    for (const stmt of statementsGrantRevoke) {
      expect(stmt.toLowerCase()).not.toContain("postgres");
    }
  });
});

describe("migration 130 — precheck das funções (to_regprocedure) antes do GRANT/REVOKE", () => {
  it("faz precheck de app_is_super() via to_regprocedure antes do primeiro REVOKE", () => {
    const idxPrecheck = semComentarios.search(/to_regprocedure\('public\.app_is_super\(\)'\)\s*is null/);
    const idxRevoke = semComentarios.search(/revoke all on function public\.app_is_super\(\)/);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxRevoke).toBeGreaterThan(idxPrecheck);
  });

  it("faz precheck de app_loja_id() via to_regprocedure antes do primeiro REVOKE", () => {
    const idxPrecheck = semComentarios.search(/to_regprocedure\('public\.app_loja_id\(\)'\)\s*is null/);
    const idxRevoke = semComentarios.search(/revoke all on function public\.app_loja_id\(\)/);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxRevoke).toBeGreaterThan(idxPrecheck);
  });

  it("aborta com RAISE EXCEPTION se alguma função não existir", () => {
    expect(semComentarios).toMatch(/raise exception 'precheck 130:/);
  });
});

describe("migration 130 — validation block (runtime)", () => {
  it("consulta pg_proc", () => {
    expect(semComentarios).toContain("pg_proc");
  });

  it("valida as duas funções no mesmo loop (array com as duas assinaturas)", () => {
    expect(semComentarios).toMatch(/array\['public\.app_is_super\(\)',\s*'public\.app_loja_id\(\)'\]/);
  });

  it("valida SECURITY DEFINER via prosecdef", () => {
    expect(semComentarios).toContain("v_prosecdef");
    expect(semComentarios).toMatch(/select\s+p\.prosecdef,\s*p\.proconfig/);
    expect(semComentarios).toMatch(/if not coalesce\(v_prosecdef, false\) then/);
  });

  it("valida owner via pg_get_userbyid(proowner) = postgres", () => {
    expect(semComentarios).toContain("pg_get_userbyid(p.proowner)");
    expect(semComentarios).toMatch(/v_owner is distinct from 'postgres'/);
  });

  it("valida search_path=public via proconfig", () => {
    expect(semComentarios).toContain("'search_path=public' = any (v_proconfig)");
  });

  it("valida que authenticated possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(/has_function_privilege\('authenticated', v_nome, 'execute'\)/);
  });

  it("valida que anon NÃO possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(/has_function_privilege\('anon', v_nome, 'execute'\)/);
  });

  it("valida PUBLIC via pg_proc/aclexplode (grantee = 0), não has_function_privilege('public', ...)", () => {
    expect(semComentarios).toContain("aclexplode(");
    expect(semComentarios).toContain("grantee = 0");
    expect(semComentarios).not.toMatch(/has_function_privilege\(\s*'public'/);
  });

  it("service_role não é validado quanto ao valor do ACL (fora de escopo, documentado em comentário)", () => {
    expect(sql).toMatch(/service_role.*fora de escopo|fora de escopo.*service_role/is);
  });
});

describe("migration 130 — transação e reload de schema", () => {
  it("é transacional (begin ... commit) e recarrega o schema do PostgREST ao final", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe("migration 130 — escopo ACL-only (nenhuma alteração fora do pretendido)", () => {
  it("não usa CREATE FUNCTION / CREATE OR REPLACE FUNCTION", () => {
    expect(semComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function\b/i);
  });

  it("não usa ALTER FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\balter\s+function\b/i);
  });

  it("não usa DROP FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\bdrop\s+function\b/i);
  });

  it("nenhum GRANT/REVOKE de tabela (select/insert/update/delete/all on table)", () => {
    expect(semComentarios).not.toMatch(
      /\b(grant|revoke)\s+(all\s+)?(select|insert|update|delete|all)\b[^;]*\bon\s+(table\s+)?public\.\w+/i,
    );
  });

  it("nenhum CREATE/ALTER/DROP POLICY (RLS não é tocado)", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });

  it("não faz INSERT/UPDATE/DELETE/TRUNCATE de dados em SQL executável", () => {
    expect(semComentarios).not.toMatch(/^\s*(insert into|update\s+public\.|delete from|truncate)\s/im);
  });
});

describe("migration 130 — escopo negativo (objetos citados só em docstring, nunca alterados)", () => {
  it("não altera tab_impressoes_cozinha em SQL executável", () => {
    expect(semDocstrings).not.toContain("tab_impressoes_cozinha");
  });

  it("não menciona tab_impressoras fora de comentário/docstring", () => {
    expect(semDocstrings).not.toContain("tab_impressoras");
  });

  it("não toca app_caller_email em SQL executável", () => {
    expect(semDocstrings).not.toContain("app_caller_email");
  });

  it("não toca app_sessao_iniciar em SQL executável", () => {
    expect(semDocstrings).not.toContain("app_sessao_iniciar");
  });

  it("não toca app_sessao_encerrar em SQL executável", () => {
    expect(semDocstrings).not.toContain("app_sessao_encerrar");
  });

  it("não toca pub_fidelidade_regra em SQL executável", () => {
    expect(semDocstrings).not.toContain("pub_fidelidade_regra");
  });

  it("não toca pub_criar_pedido_v2 em SQL executável", () => {
    expect(semDocstrings).not.toContain("pub_criar_pedido_v2");
  });

  it("não menciona nenhuma outra função além de app_is_super/app_loja_id em SQL executável", () => {
    expect(semDocstrings).not.toMatch(/\bfunction\s+public\.(?!app_is_super\b|app_loja_id\b)\w+/i);
  });
});

describe("migration 130 — numeração (não reativa 119)", () => {
  // A reserva documental de 131 para "pedido público seguro v2", citada no
  // cabeçalho desta migration (linha 59), foi formalmente realocada por
  // decisão humana (gate R0H-B.1) para 131_canonical_application_table_acl_
  // hardening.sql. A existência dessa migration 131 é portanto legítima —
  // migration 130 não é mais responsável por validar a ausência de 131;
  // a sequência de numeração daqui para frente é responsabilidade do
  // Release Manifest, não deste teste. O comentário histórico da própria
  // migration 130 (linha 59) permanece intocado como registro da reserva
  // original.
  const arquivosMigrations = readdirSync("supabase/migrations");

  it("migration 119 não está em supabase/migrations (permanece pausada)", () => {
    expect(arquivosMigrations.some((f) => /^119_/.test(f))).toBe(false);
  });

  it("não há texto de reativação da migration 119 no arquivo 130", () => {
    expect(sql.toLowerCase()).not.toMatch(/reativ\w*\s+.*119|119.*reativ/);
  });
});

describe("migration 130 — migration 129 permanece byte-idêntica", () => {
  it("hash SHA-256 da 129 confere com o valor auditado no Gate 8.84B", () => {
    const hash = createHash("sha256").update(migration129).digest("hex");
    expect(hash).toBe("9a93ec996c30e04348ca2544422252ec51cd168051e66683aa0ae56d5487152b");
  });
});
