import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 125 (Gate 8.9): comprova, lendo o texto
// SQL real do arquivo, que as duas defesas exigidas pela auditoria de
// segurança continuam presentes. A própria migration também se
// autoprotege com uma validação equivalente em runtime (pg_get_functiondef
// dentro do bloco `do $$ ... end $$;` final) — este teste é a segunda
// camada, que roda em CI/local sem precisar de um Postgres real e falha
// imediatamente se alguém remover a checagem ao editar o arquivo.
const sql = readFileSync("supabase/migrations/125_dispositivos_sessao_seguros.sql", "utf8");

describe("migration 125 — ownership do device_id (estrutural)", () => {
  it("app_dispositivo_registrar recebe p_session_token", () => {
    expect(sql).toMatch(/p_session_token\s+uuid/);
  });

  it("valida a sessão contra tab_user_sessions (session_token + user_id + device_id + status ativo)", () => {
    expect(sql).toContain("from public.tab_user_sessions s");
    expect(sql).toMatch(/s\.session_token\s*=\s*p_session_token/);
    expect(sql).toMatch(/s\.user_id\s*=\s*v_caller\.id/);
    expect(sql).toMatch(/s\.device_id\s*=\s*v_dev/);
    expect(sql).toMatch(/s\.status\s*=\s*'active'/);
  });

  it("rejeita com device_session_mismatch quando a sessão não bate", () => {
    expect(sql).toContain("raise exception 'device_session_mismatch'");
  });
});

describe("migration 125 — exclusividade atômica de mesa (estrutural)", () => {
  it("usa pg_advisory_xact_lock determinístico por loja+mesa", () => {
    expect(sql).toContain("pg_advisory_xact_lock(");
    expect(sql).toContain("hashtextextended(");
    expect(sql).toMatch(/'pedido-prime:tablet-mesa:'\s*\|\|\s*v_loja::text\s*\|\|\s*':'\s*\|\|\s*v_mesa/);
  });

  it("checa conflito por loja_id + mesa + device_id diferente + janela de 5 minutos", () => {
    expect(sql).toContain("from public.tab_dispositivos d");
    expect(sql).toMatch(/d\.loja_id\s*=\s*v_loja/);
    expect(sql).toMatch(/d\.mesa\s*=\s*v_mesa/);
    expect(sql).toMatch(/d\.device_id\s*<>\s*v_dev/);
    expect(sql).toContain("interval '5 minutes'");
  });

  it("rejeita com mesa_em_uso_outro_dispositivo quando há conflito", () => {
    expect(sql).toContain("raise exception 'mesa_em_uso_outro_dispositivo'");
  });

  it("NÃO cria unique constraint física (loja_id, mesa) — critério é TTL, não unicidade permanente", () => {
    expect(sql).not.toMatch(/unique\s*\(\s*loja_id\s*,\s*mesa\s*\)/i);
  });
});

describe("migration 125 — validação estática embutida (autoproteção em runtime)", () => {
  it("o próprio bloco de validação final aborta se ownership ou advisory lock forem removidos", () => {
    expect(sql).toContain("perdeu a verificação de ownership");
    expect(sql).toContain("perdeu o advisory lock/checagem de exclusividade de mesa");
    expect(sql).toMatch(/pg_get_functiondef\('public\.app_dispositivo_registrar\([^)]*uuid\)'::regprocedure\)/);
  });
});

describe("migration 125 — continua sem broad grant em tab_dispositivos (regressão)", () => {
  it("nenhum GRANT de tabela para public/anon/authenticated", () => {
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.tab_dispositivos/i);
  });

  it("mantém a tabela com revoke all + RLS deny-all", () => {
    expect(sql).toContain("revoke all on table public.tab_dispositivos from public, anon, authenticated");
    expect(sql).toContain('tab_dispositivos_deny_client');
  });
});
