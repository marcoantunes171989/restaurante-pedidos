import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 127 (Gate 8.42): comprova, lendo o
// texto SQL real do arquivo, que o forward-fix é ACL-only — só repara o
// GRANT/REVOKE de public.app_sessao_encerrar(uuid,text), sem tocar corpo,
// tabelas, RLS/policies, ou qualquer outra RPC (incluindo
// app_sessao_encerrar_remota, função distinta). A própria migration também
// se autovalida em runtime (bloco `do $$ ... end $$;` final, via
// to_regprocedure/pg_proc/aclexplode) — este teste é a segunda camada, roda
// em CI/local sem Postgres real.
const sql = readFileSync("supabase/migrations/127_reparo_acl_sessao_encerrar.sql", "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida, ex.: explicar a causa raiz envolvendo
// tab_user_sessions/app_sessao_encerrar_remota) de ALTERAÇÃO real em SQL
// executável (proibida fora do escopo desta migration).
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

describe("migration 127 — ACL de app_sessao_encerrar(uuid,text)", () => {
  it("alvo é a assinatura exata (uuid, text)", () => {
    expect(sql).toContain("public.app_sessao_encerrar(uuid, text)");
  });

  it("fecha PUBLIC (revoke all ... from public)", () => {
    expect(semComentarios).toMatch(
      /revoke all on function public\.app_sessao_encerrar\(uuid,\s*text\)\s*from public/,
    );
  });

  it("fecha anon (revoke ... from anon, authenticated ANTES do grant)", () => {
    const idxRevokeAnonAuth = semComentarios.search(
      /revoke all on function public\.app_sessao_encerrar\(uuid,\s*text\)\s*from anon, authenticated/,
    );
    const idxGrant = semComentarios.search(
      /grant execute on function public\.app_sessao_encerrar\(uuid,\s*text\)\s*to authenticated/,
    );
    expect(idxRevokeAnonAuth).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(idxRevokeAnonAuth);
  });

  it("concede EXECUTE SOMENTE a authenticated (nenhum GRANT para anon)", () => {
    expect(semComentarios).toMatch(
      /grant execute on function public\.app_sessao_encerrar\(uuid,\s*text\)\s*to authenticated/,
    );
    expect(semComentarios).not.toMatch(/grant execute on function public\.app_sessao_encerrar\(uuid,\s*text\)\s*to[^;]*anon/);
  });

  it("valida SECURITY DEFINER via prosecdef (pg_proc)", () => {
    expect(semComentarios).toContain("v_prosecdef");
    expect(semComentarios).toMatch(/select\s+p\.prosecdef,\s*p\.proconfig/);
    expect(semComentarios).toMatch(/if not coalesce\(v_prosecdef, false\) then/);
  });

  it("valida search_path=public via proconfig", () => {
    expect(semComentarios).toContain("'search_path=public' = any (v_proconfig)");
  });

  it("valida que authenticated possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(
      /has_function_privilege\(\s*'authenticated',\s*'public\.app_sessao_encerrar\(uuid,text\)',\s*'execute'\s*\)/,
    );
  });

  it("valida que anon NÃO possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(
      /has_function_privilege\(\s*'anon',\s*'public\.app_sessao_encerrar\(uuid,text\)',\s*'execute'\s*\)/,
    );
  });

  it("valida PUBLIC via pg_proc/aclexplode (grantee = 0), não has_function_privilege('public', ...)", () => {
    expect(semComentarios).toContain("aclexplode(");
    expect(semComentarios).toContain("grantee = 0");
    expect(semComentarios).not.toMatch(/has_function_privilege\(\s*'public'/);
  });
});

describe("migration 127 — transação e reload de schema", () => {
  it("é transacional (begin ... commit) e recarrega o schema do PostgREST ao final", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe("migration 127 — escopo ACL-only (nenhuma alteração fora do pretendido)", () => {
  it("não recria/altera o corpo de app_sessao_encerrar (sem CREATE OR REPLACE FUNCTION)", () => {
    expect(semComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.app_sessao_encerrar\b/i);
  });

  it("não toca app_sessao_encerrar_remota (função distinta, fora de escopo)", () => {
    expect(semComentarios).not.toContain("app_sessao_encerrar_remota");
  });

  it("nenhum GRANT de tabela (select/insert/update/delete/all)", () => {
    expect(semComentarios).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.\w+/i);
  });

  it("nenhum CREATE/ALTER/DROP POLICY (RLS não é tocado)", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });

  it("não faz INSERT/UPDATE/DELETE de dados em SQL executável", () => {
    expect(semComentarios).not.toMatch(/^\s*(insert into|update\s+public\.|delete from)\s/im);
  });

  it("não altera tab_user_sessions em SQL executável (só pode aparecer em comentário explicativo)", () => {
    expect(semComentarios).not.toContain("tab_user_sessions");
  });

  it("não altera tab_access_events em SQL executável (só pode aparecer em comentário explicativo)", () => {
    expect(semComentarios).not.toContain("tab_access_events");
  });

  it("não usa service_role em nenhum lugar do arquivo (nem comentário)", () => {
    expect(sql).not.toContain("service_role");
  });
});
