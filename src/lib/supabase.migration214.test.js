import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/214_cardapio_publico_permissoes.sql");
const codigo = sql.replace(/--[^\n]*/g, "");
const cliente = ler("src/lib/supabase.js") + ler("src/lib/leads.js");

const ASSINATURAS = [
  "public.pub_criar_chamado(bigint, text, text, text)",
  "public.pub_solicitar_conta(bigint, text)",
  "public.pub_solicitar_conta(bigint, text, boolean)",
  "public.pub_upsert_cliente(bigint, text, text)",
  "public.pub_buscar_cliente(bigint, text)",
  "public.pub_saldo_fidelidade(bigint, text)",
  "public.pub_pesquisa_satisfacao(text, bigint, text, text, text, jsonb, text)",
  "public.pub_criar_lead(text, text, text, text, integer, text)",
];

describe("migration 214 — o cardápio público volta a executar as funções que chama", () => {
  it("é a única migration 214, em uma transação, sem mexer em tabela, função ou dado", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^214[_.]/.test(f))).toEqual(["214_cardapio_publico_permissoes.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(codigo).not.toMatch(/\b(delete\s+from|update\s+public\.|insert\s+into|truncate|drop\s+|alter\s+|create\s+)/i);
    expect(codigo).not.toMatch(/\bon\s+(table|all\s+(tables|functions))\b/i);
  });

  it("libera exatamente as oito assinaturas, todas ainda chamadas pelo app", () => {
    expect([...codigo.matchAll(/'(public\.pub_\w+\([^)]*\))'/g)].map((m) => m[1])).toEqual(ASSINATURAS);
    ASSINATURAS.forEach((a) => expect(cliente).toContain(a.slice("public.".length, a.indexOf("("))));
  });

  it("concede só execução ao visitante e ao usuário logado, sem acesso geral", () => {
    expect([...codigo.matchAll(/\bgrant\b[^']*/gi)].map((m) => m[0].trim()))
      .toEqual(["grant execute on function %s to anon, authenticated"]);
    expect(codigo).toContain("revoke all on function %s from public'");
  });

  it("confere todas as funções antes de liberar a primeira", () => {
    expect(codigo).toContain("to_regprocedure(v_alvo)");
    expect(codigo).toContain("p.prosecdef");
    expect(codigo).toContain("search_path=");
    expect(codigo.indexOf("precheck 214")).toBeLessThan(codigo.indexOf("grant execute"));
  });

  it("não reabre as funções antigas que aceitavam preço ou devolviam pedidos completos", () => {
    expect(codigo).not.toMatch(/pub_criar_pedido\b|pub_pedidos_comanda|pub_pedidos_cliente/);
  });
});
