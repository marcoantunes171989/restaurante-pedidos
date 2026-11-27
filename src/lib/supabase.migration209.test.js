import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARQUIVO = "209_pub_setores_publico.sql";
const sql = readFileSync(`supabase/migrations/${ARQUIVO}`, "utf8").replace(/\r\n/g, "\n");
const codigo = sql.replace(/--[^\n]*/g, "").toLowerCase();
const cliente = readFileSync("src/lib/supabase.js", "utf8");

describe("migration 209 — setores no cardápio público", () => {
  it("é a única migration com o número 209", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^209[_.]/.test(f))).toEqual([ARQUIVO]);
  });

  it("cria a função com o parâmetro que o app envia", () => {
    expect(codigo).toContain("create or replace function public.pub_setores_publico(p_loja_id bigint)");
    expect(cliente).toContain("rpc('pub_setores_publico', { p_loja_id:");
  });

  it("devolve exatamente as colunas que o app lê", () => {
    const colunas = codigo.match(/returns table\(([\s\S]*?)\)\s*language/)[1].split(",").map((c) => c.trim().split(/\s+/)[0]);
    expect(colunas).toEqual(["id", "loja_id", "nome", "ordem", "ativo"]);
    colunas.forEach((c) => expect(cliente).toContain(`r.${c}`));
  });

  it("não expõe impressora nem descrição", () => {
    expect(codigo.split("comment on function")[0]).not.toMatch(/impress|descricao|s\.\*/);
  });

  it("lê só a loja informada e ativa, com search_path fixo", () => {
    expect(codigo).toContain("security definer");
    expect(codigo).toContain("set search_path = public");
    expect(codigo).toContain("where s.loja_id = p_loja_id");
    expect(codigo).toContain("l.id = p_loja_id and l.ativo = true");
  });

  it("libera só a execução e não grava nem altera nada", () => {
    expect(codigo).toContain("revoke all on function public.pub_setores_publico(bigint) from public;");
    expect(codigo).toContain("grant execute on function public.pub_setores_publico(bigint) to anon, authenticated;");
    expect(codigo).not.toMatch(/\b(insert into|update public|delete from|alter table|drop |create table|create policy|grant select)/);
  });
});
