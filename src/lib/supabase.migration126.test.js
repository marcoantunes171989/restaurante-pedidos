import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 126 (Gate 8.19): comprova, lendo o
// texto SQL real do arquivo, que o forward-fix é ACL-only — só repara o
// GRANT/REVOKE da assinatura de 14 argumentos (com p_device_id) de
// public.app_sessao_iniciar, sem tocar corpo, tabelas, RLS/policies, a
// assinatura legada de 13 args, ou qualquer outra RPC. A própria
// migration também se autovalida em runtime (bloco `do $$ ... end $$;`
// final, via to_regprocedure/pg_proc/aclexplode) — este teste é a
// segunda camada, roda em CI/local sem Postgres real.
const sql = readFileSync("supabase/migrations/126_reparo_acl_sessao_iniciar.sql", "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida, ex.: explicar a causa raiz envolvendo
// tab_user_sessions/app_dispositivo_registrar) de ALTERAÇÃO real em SQL
// executável (proibida fora do escopo desta migration).
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

const ASSINATURA_14_ARGS =
  "uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text";

describe("migration 126 — ACL da assinatura de 14 args (app_sessao_iniciar)", () => {
  it("concede EXECUTE a authenticated na assinatura de 14 args", () => {
    expect(semComentarios).toMatch(
      /grant execute on function public\.app_sessao_iniciar\(\s*uuid,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*boolean,\s*text,\s*text,\s*text\s*\)\s*to authenticated/,
    );
  });

  it("fecha PUBLIC (revoke all ... from public) na assinatura de 14 args", () => {
    expect(semComentarios).toMatch(
      /revoke all on function public\.app_sessao_iniciar\(\s*uuid,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*boolean,\s*text,\s*text,\s*text\s*\)\s*from public/,
    );
  });

  it("fecha anon (revoke ... from anon, authenticated antes do grant) na assinatura de 14 args", () => {
    expect(semComentarios).toMatch(
      /revoke all on function public\.app_sessao_iniciar\(\s*uuid,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*boolean,\s*text,\s*text,\s*text\s*\)\s*from anon, authenticated/,
    );
  });

  it("valida PUBLIC via pg_proc/aclexplode (grantee = 0), não has_function_privilege('public', ...)", () => {
    expect(semComentarios).toContain("aclexplode(");
    expect(semComentarios).toContain("grantee = 0");
    expect(semComentarios).not.toMatch(/has_function_privilege\(\s*'public'/);
  });
});

describe("migration 126 — assinatura legada de 13 args não é tocada", () => {
  it("nenhum REVOKE/GRANT/comentário SQL referencia a assinatura de 13 args (sem o p_device_id final)", () => {
    // A lista de tipos de 13 args é um prefixo exato da de 14 args — só
    // é "13 args de verdade" quando "boolean, text, text" é IMEDIATAMENTE
    // seguido do fechamento ")" (sem mais um "text," antes, que é o que
    // diferencia a assinatura de 14 args).
    const referenciaAssinatura13Args = /boolean,\s*text,\s*text\s*\)/;
    expect(semComentarios).not.toMatch(referenciaAssinatura13Args);
  });

  it("a assinatura de 14 args continua com exatamente 14 tipos (não vira 13 por engano)", () => {
    expect(sql).toContain(ASSINATURA_14_ARGS);
  });
});

describe("migration 126 — escopo ACL-only (nenhuma alteração fora do pretendido)", () => {
  it("nenhum GRANT de tabela (select/insert/update/delete/all)", () => {
    expect(semComentarios).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.\w+/i);
  });

  it("não altera tab_user_sessions em SQL executável (só pode aparecer em comentário explicativo)", () => {
    expect(semComentarios).not.toContain("tab_user_sessions");
  });

  it("não altera tab_dispositivos em SQL executável (só pode aparecer em comentário explicativo)", () => {
    expect(semComentarios).not.toContain("tab_dispositivos");
  });

  it("nenhum CREATE/ALTER/DROP POLICY", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });

  it("não recria/altera o corpo de app_sessao_iniciar (sem CREATE OR REPLACE FUNCTION)", () => {
    expect(semComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.app_sessao_iniciar/i);
  });

  it("não referencia app_dispositivo_registrar em SQL executável (só pode aparecer em comentário explicativo)", () => {
    expect(semComentarios).not.toContain("app_dispositivo_registrar");
  });

  it("não usa service_role em nenhum lugar do arquivo (nem comentário)", () => {
    expect(sql).not.toContain("service_role");
  });

  it("é transacional (begin ... commit) e recarrega o schema do PostgREST ao final", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
