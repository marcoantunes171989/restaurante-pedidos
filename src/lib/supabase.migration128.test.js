import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 128 (Gate 8.55): comprova, lendo o
// texto SQL real do arquivo, que o forward-fix é ACL-only — só repara o
// GRANT/REVOKE de public.pub_fidelidade_regra(bigint), sem tocar corpo,
// tabelas, RLS/policies, ou qualquer outra RPC. A própria migration também
// se autovalida em runtime (bloco `do $$ ... end $$;` final, via
// to_regprocedure/pg_proc/aclexplode) — este teste é a segunda camada, roda
// em CI/local sem Postgres real.
const sql = readFileSync("supabase/migrations/128_reparo_acl_fidelidade_publica.sql", "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida, ex.: explicar a causa raiz envolvendo
// tab_fidelidade_regras/CardapioPublico.jsx) de ALTERAÇÃO real em SQL
// executável (proibida fora do escopo desta migration).
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

describe("migration 128 — ACL de pub_fidelidade_regra(bigint)", () => {
  it("arquivo 128 existe e é legível", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("alvo é a assinatura exata (bigint)", () => {
    expect(sql).toContain("public.pub_fidelidade_regra(bigint)");
  });

  it("fecha PUBLIC (revoke all ... from public)", () => {
    expect(semComentarios).toMatch(
      /revoke all on function public\.pub_fidelidade_regra\(bigint\)\s*from public/,
    );
  });

  it("revoga anon e authenticated ANTES do grant (fail-closed antes de reconceder)", () => {
    const idxRevokeAnonAuth = semComentarios.search(
      /revoke all on function public\.pub_fidelidade_regra\(bigint\)\s*from anon, authenticated/,
    );
    const idxGrant = semComentarios.search(
      /grant execute on function public\.pub_fidelidade_regra\(bigint\)\s*to anon, authenticated/,
    );
    expect(idxRevokeAnonAuth).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(idxRevokeAnonAuth);
  });

  it("concede EXECUTE a anon", () => {
    expect(semComentarios).toMatch(
      /grant execute on function public\.pub_fidelidade_regra\(bigint\)\s*to anon, authenticated/,
    );
  });

  it("concede EXECUTE a authenticated", () => {
    expect(semComentarios).toMatch(
      /grant execute on function public\.pub_fidelidade_regra\(bigint\)\s*to anon, authenticated/,
    );
  });

  it("nenhum GRANT de EXECUTE para PUBLIC", () => {
    expect(semComentarios).not.toMatch(
      /grant execute on function public\.pub_fidelidade_regra\(bigint\)\s*to[^;]*\bpublic\b/i,
    );
  });

  it("nenhum GRANT de EXECUTE para service_role", () => {
    expect(semComentarios).not.toMatch(
      /grant execute on function public\.pub_fidelidade_regra\(bigint\)\s*to[^;]*service_role/i,
    );
    expect(sql).not.toContain("service_role");
  });

  it("valida a assinatura exata via to_regprocedure e aborta se ausente", () => {
    expect(semComentarios).toContain("to_regprocedure('public.pub_fidelidade_regra(bigint)')");
    expect(semComentarios).toMatch(/if v_oid is null then/);
  });

  it("valida SECURITY DEFINER via prosecdef (pg_proc)", () => {
    expect(semComentarios).toContain("v_prosecdef");
    expect(semComentarios).toMatch(/select\s+p\.prosecdef,\s*p\.proconfig/);
    expect(semComentarios).toMatch(/if not coalesce\(v_prosecdef, false\) then/);
  });

  it("valida search_path=public via proconfig", () => {
    expect(semComentarios).toContain("'search_path=public' = any (v_proconfig)");
  });

  it("valida que anon possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(
      /has_function_privilege\(\s*'anon',\s*'public\.pub_fidelidade_regra\(bigint\)',\s*'execute'\s*\)/,
    );
  });

  it("valida que authenticated possui EXECUTE (has_function_privilege)", () => {
    expect(semComentarios).toMatch(
      /has_function_privilege\(\s*'authenticated',\s*'public\.pub_fidelidade_regra\(bigint\)',\s*'execute'\s*\)/,
    );
  });

  it("valida PUBLIC via pg_proc/aclexplode (grantee = 0), não has_function_privilege('public', ...)", () => {
    expect(semComentarios).toContain("aclexplode(");
    expect(semComentarios).toContain("grantee = 0");
    expect(semComentarios).toContain("acldefault('f', p.proowner)");
    expect(semComentarios).not.toMatch(/has_function_privilege\(\s*'public'/);
  });
});

describe("migration 128 — transação e reload de schema", () => {
  it("é transacional (begin ... commit) e recarrega o schema do PostgREST ao final", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe("migration 128 — escopo ACL-only (nenhuma alteração fora do pretendido)", () => {
  it("não recria/altera o corpo de pub_fidelidade_regra (sem CREATE OR REPLACE FUNCTION)", () => {
    expect(semComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.pub_fidelidade_regra\b/i);
  });

  it("não usa ALTER FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\balter\s+function\b/i);
  });

  it("não usa DROP FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\bdrop\s+function\b/i);
  });

  it("nenhum GRANT/REVOKE de tabela (select/insert/update/delete/all on table)", () => {
    expect(semComentarios).not.toMatch(/\b(grant|revoke)\s+(all\s+)?(select|insert|update|delete|all)\b[^;]*\bon\s+(table\s+)?public\.\w+/i);
  });

  it("nenhum CREATE/ALTER/DROP POLICY (RLS não é tocado)", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });

  it("não faz INSERT/UPDATE/DELETE/TRUNCATE de dados em SQL executável", () => {
    expect(semComentarios).not.toMatch(/^\s*(insert into|update\s+public\.|delete from|truncate)\s/im);
  });

  it("não altera nenhuma outra função (só pub_fidelidade_regra aparece em SQL executável)", () => {
    const semComentariosEDocstring = semComentarios.replace(
      /comment on function public\.pub_fidelidade_regra\(bigint\) is[\s\S]*?;/,
      "",
    );
    expect(semComentariosEDocstring).not.toMatch(/\bfunction\s+public\.(?!pub_fidelidade_regra\b)\w+/i);
  });
});
