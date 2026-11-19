// @vitest-environment node
// Contrato da migration 190 (tabela IBPT): garante as travas que protegem as outras lojas da mesma UF.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/190_fiscal_ibpt_tabela.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("migration 190 — tabela IBPT", () => {
  it("tabelas sem acesso direto (RLS ligada e revoke)", () => {
    expect(sql).toContain("alter table public.fiscal_ibpt_tabela      enable row level security");
    expect(sql).toMatch(/revoke all on public\.fiscal_ibpt_tabela\s+from public, anon, authenticated/);
  });
  it("importar: permissão por loja, UF da própria loja para quem não é super, e as travas de qualidade", () => {
    for (const c of ["FORBIDDEN", "UF_DIFERENTE_DA_LOJA", "TABELA_VENCIDA", "POUCOS_NCM", "ALIQUOTA_INVALIDA", "VIGENCIA_ANTERIOR", "UF_INVALIDA", "FORMATO_INVALIDO"]) {
      expect(sql, c).toContain(`'${c}'`);
    }
    expect(sql).toContain("app_fiscal_pode_configurar(p_loja_id)");
    expect(sql).toContain("insert into public.fiscal_ibpt_tabela_hist");
  });
  it("funções da tela: só usuário logado; leitura do servidor: só service_role", () => {
    expect(sql).toContain("revoke all on function public.app_fiscal_ibpt_resumo(bigint) from public, anon;");
    expect(sql).toContain("grant execute on function public.app_fiscal_ibpt_importar(bigint, text, jsonb, jsonb) to authenticated;");
    expect(sql).toContain("revoke all on function public.app_fiscal_ibpt_da_uf(text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.app_fiscal_ibpt_da_uf(text) to service_role;");
    expect(sql).not.toMatch(/grant execute on function public\.app_fiscal_ibpt_da_uf\(text\) to (anon|authenticated)/);
  });
  it("a leitura do servidor devolve o formato do emissor ({meta, ncm})", () => {
    const corpo = /create or replace function public\.app_fiscal_ibpt_da_uf[\s\S]*?\$\$;/.exec(sql)?.[0] || "";
    for (const c of ["'meta'", "'ncm'", "'versao'", "'vigenciaFim'", "'chave'", "'fonte'"]) expect(corpo, c).toContain(c);
  });
});
