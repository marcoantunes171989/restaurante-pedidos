import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/210_isolamento_e_travas.sql");
const codigo = sql.replace(/--[^\n]*/g, "").toLowerCase();
const cliente = ler("src/lib/supabase.js");

// Tabelas em que o app grava direto (insert/update/delete/upsert) com o login do usuário.
const gravaDireto = (tabela, operacao) => new RegExp(`from\\('${tabela}'\\)\\s*\\.${operacao}\\(`).test(cliente);

describe("migration 210 — isolamento entre empresas e travas", () => {
  it("é a única migration 210 e roda em uma transação", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^210[_.]/.test(f))).toEqual(["210_isolamento_e_travas.sql"]);
    expect(codigo.trim().startsWith("begin;")).toBe(true);
    expect(codigo).toContain("commit;");
  });

  it("fecha os perfis fiscais e separa leitura do geral de gravação", () => {
    expect(codigo).toContain("'tab_fiscal_perfis'");
    expect(codigo).toContain("t || '_all'");
    expect(codigo).toContain("or loja_id is null)', t || '_ler'");
    expect(codigo).not.toMatch(/_gravar'[\s\S]{0,40}loja_id is null/);
  });

  it("plano e licença só são alterados pelo administrador geral", () => {
    expect(codigo).toMatch(/create policy tab_assinaturas_gravar[\s\S]*?using \(\(select public\.app_is_super\(\)\)\) with check \(\(select public\.app_is_super\(\)\)\)/);
    expect(codigo).toContain("revoke update, delete on public.tab_licenca_historico from authenticated, anon;");
  });

  it("não retira permissão de operação que o app usa", () => {
    const retiradas = [...codigo.matchAll(/revoke ([a-z, ]+) on public\.(tab_[a-z_]+) from authenticated/g)];
    expect(retiradas.length).toBeGreaterThan(3);
    for (const [, operacoes, tabela] of retiradas) {
      for (const op of operacoes.split(",").map((o) => o.trim())) {
        // A auditoria perde o UPDATE geral e ganha só o das colunas de análise.
        if (tabela === "tab_auditoria" && op === "update") continue;
        expect(gravaDireto(tabela, op), `${op} em ${tabela}`).toBe(false);
      }
    }
    expect(codigo).toContain("grant update (analisado, status_analise) on public.tab_auditoria to authenticated;");
    expect(cliente).toContain("update({ analisado: true, status_analise: 'Analisado' })");
  });

  it("cupom deixa de ser executável sem login", () => {
    expect(codigo).toContain("p.proname in ('cupom_validar', 'cupom_consumir')");
    expect(codigo).toContain("revoke all on function %s from public, anon");
    expect(readFileSync("src/CardapioPublico.jsx", "utf8")).not.toMatch(/validarCupom|consumirCupom/);
  });

  it("recusa ligação com registro de outra empresa e preenche a empresa quando faltar", () => {
    expect(codigo).toContain("create or replace function public.app_trava_mesma_loja()");
    expect(codigo).toContain("set search_path = public");
    expect(codigo).toContain("raise exception 'registro_de_outra_empresa");
    expect(codigo).toContain("new.loja_id := v_loja;");
    ["'tab_produtos', 'categoria_id'", "'tab_caixa_mov', 'caixa_id'", "'tab_opcoes', 'grupo_id'"].forEach((p) => expect(codigo).toContain(p));
    // O acerto dos movimentos de caixa antigos acontece antes de a trava existir.
    expect(codigo.indexOf("update public.tab_caixa_mov m set loja_id")).toBeLessThan(codigo.indexOf("create trigger"));
  });

  it("não apaga dados nem estruturas", () => {
    expect(codigo).not.toMatch(/\b(delete from|truncate|drop table|drop column|drop function)\b/);
  });
});
