import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/211_desempenho_para_escala.sql", "utf8").replace(/\r\n/g, "\n");
const codigo = sql.replace(/--[^\n]*/g, "").toLowerCase();

describe("migration 211 — desempenho para muitas empresas", () => {
  it("é a única migration 211", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^211[_.]/.test(f))).toEqual(["211_desempenho_para_escala.sql"]);
  });

  it("indexa a busca do usuário por e-mail com a mesma expressão das funções", () => {
    expect(codigo).toContain("on public.tab_usuarios (lower(trim(email)))");
  });

  it("indexa as listas por empresa", () => {
    ["tab_pedidos (loja_id, criado_em desc)", "tab_produtos (loja_id)", "tab_clientes (loja_id, criado_em desc)"]
      .forEach((i) => expect(codigo).toContain(`on public.${i}`));
  });

  it("calcula a identificação uma vez por consulta, sem sobrar chamada por linha", () => {
    const politicas = codigo.split("alter policy").slice(1);
    expect(politicas.length).toBeGreaterThan(50);
    for (const p of politicas) {
      const corpo = p.split("end if;")[0];
      expect(corpo).not.toMatch(/(?<!select public\.)(app_is_super|app_loja_id|app_usuario_id)\(\)/);
    }
  });

  it("não muda dados, permissões nem estruturas existentes", () => {
    expect(codigo).not.toMatch(/\b(insert into|update public|delete from|truncate|drop |grant |revoke |create policy)/);
  });
});
