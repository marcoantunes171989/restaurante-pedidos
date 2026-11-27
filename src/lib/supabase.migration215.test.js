import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/215_painel_acessos_e_nota_simulada_permissoes.sql");
const codigo = sql.replace(/--[^\n]*/g, "");
const consulta = ler("supabase/diagnostics/permissoes-funcoes-hml.sql").replace(/--[^\n]*/g, "");
const cliente = ler("src/lib/supabase.js") + ler("src/lib/accessControl/api.js");

const ACESSOS = [
  "app_listar_sessoes", "app_sessoes_metricas", "app_listar_eventos_acesso", "app_listar_page_stays_sessao",
  "app_listar_permanencia", "app_sessao_encerrar_remota", "app_sessao_excluir", "app_evento_acesso_excluir",
];
const NOTA_SIMULADA = ["app_reservar_numero_nfce", "app_registrar_nfce_simulada"];
const alvos = [...codigo.matchAll(/\{"f": "public\.(\w+)\(([^)]*)\)", "confere": "(\w+)"\}/g)]
  .map((m) => ({ nome: m[1], tipos: m[2], confere: m[3] }));

// Última definição de cada função no repositório.
const migrations = readdirSync("supabase/migrations").filter((f) => /^\d{3}_.*\.sql$/.test(f) && f < "215").sort()
  .map((f) => ler(`supabase/migrations/${f}`)).join("\n");
const ultimaDefinicao = (nome) => {
  const re = new RegExp(String.raw`create (?:or replace )?function public\.${nome}\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(\$\w*\$)([\s\S]*?)\2`, "gi");
  return [...migrations.matchAll(re)].pop();
};

describe("migration 215 — o usuário logado volta a executar as funções de duas telas", () => {
  it("é a única migration 215, em uma transação, sem mexer em tabela, função ou dado", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^215[_.]/.test(f))).toEqual(["215_painel_acessos_e_nota_simulada_permissoes.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(codigo).not.toMatch(/\b(delete\s+from|update\s+public\.|insert\s+into|truncate|drop\s+|alter\s+|create\s+)/i);
    expect(codigo).not.toMatch(/\bon\s+(table|all\s+(tables|functions))\b/i);
  });

  it("libera exatamente as dez funções, todas ainda chamadas pelo app", () => {
    expect(alvos.map((a) => a.nome)).toEqual([...ACESSOS, ...NOTA_SIMULADA]);
    alvos.forEach((a) => expect(cliente).toContain(a.nome));
  });

  it("usa a assinatura da última definição de cada função no repositório", () => {
    alvos.forEach((a) => {
      const parametros = ultimaDefinicao(a.nome)[1].replace(/--[^\n]*/g, "").split(",")
        .map((p) => p.trim().replace(/\s+default[\s\S]*$/i, "").split(/\s+/).slice(1).join(" "))
        .map((t) => t.replace("timestamp with time zone", "timestamptz").replace(/^int$/, "integer"));
      expect(`${a.nome}(${parametros.join(", ")})`).toBe(`${a.nome}(${a.tipos})`);
    });
  });

  it("só libera função que confere quem chama, e confere todas antes de liberar a primeira", () => {
    alvos.forEach((a) => {
      expect(a.confere).toBe(ACESSOS.includes(a.nome) ? "app_pode_controle_acessos" : "app_pode_gerir_loja");
      expect(ultimaDefinicao(a.nome)[3]).toContain(a.confere);
    });
    expect(codigo).toContain("position(v_alvo.confere in p.prosrc) > 0");
    expect(codigo).toContain("p.prosecdef");
    expect(codigo.lastIndexOf("precheck 215")).toBeLessThan(codigo.indexOf("grant execute"));
  });

  it("concede só execução ao usuário logado e mantém o visitante fora", () => {
    expect([...codigo.matchAll(/\bgrant\b[^']*/gi)].map((m) => m[0].trim())).toEqual(["grant execute on function %s to authenticated"]);
    expect(codigo).toContain("revoke all on function %s from public, anon'");
  });

  it("não abre pagamentos V2 nem as funções antigas de usuário e senha", () => {
    expect(codigo).not.toMatch(/app_registrar_pagamento_v2|app_validar_login|app_(admin_)?(criar|salvar)_usuario/);
  });

  it("a consulta de conferência é somente leitura", () => {
    expect(consulta).not.toMatch(/\b(grant|revoke|insert\s+into|update\s+\w|delete\s+from|truncate|drop|alter|create|do\s+\$\$|notify)\b/i);
    expect(consulta.match(/;/g)).toHaveLength(1);
    [...ACESSOS, ...NOTA_SIMULADA].forEach((f) => expect(consulta).toContain(`'${f}'`));
  });
});
