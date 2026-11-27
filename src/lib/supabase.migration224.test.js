// Migration 224: o estoque é baixado pelo banco, na mesma operação da venda.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/224_estoque_baixado_pelo_servidor.sql", "utf8").replace(/\r\n/g, "\n");

describe("migration 224 — estoque no servidor", () => {
  it("baixa pelo gatilho do pagamento, com a linha do produto travada e dentro da empresa", () => {
    expect(sql).toContain("create trigger trg_pagamento_baixa_estoque before insert on public.tab_pagamentos");
    expect(sql).toContain("where pr.id = v_item.produto_id for update;");
    expect(sql).toContain("and p.loja_id = new.loja_id");
  });
  it("a função antiga continua para o app publicado, sem alterar nada e com a trava de manutenção", () => {
    const antiga = sql.slice(sql.indexOf("create or replace function public.app_baixar_estoque_produto"), sql.indexOf("$funcao$, '--@trava@'"));
    expect(antiga).not.toMatch(/update\s+public\.|insert\s+into/i);
    expect(antiga).toContain("--@trava@");
    expect(sql).toContain("grant execute on function public.app_baixar_estoque_produto(bigint, jsonb) to authenticated;");
    expect(sql).toContain("revoke all on function public.app_baixar_estoque_produto(bigint, jsonb) from public, anon, authenticated;");
  });
  it("o gatilho não pode ser chamado pelo navegador", () => {
    expect(sql).toContain("revoke all on function public.app_pp_baixar_estoque_da_venda() from public, anon, authenticated;");
  });
});
