import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/213_acessos_sem_login_e_usuarios.sql");
const prod = ler("supabase/manual/producao/travas_cupom_empresa_comanda.sql");
const cliente = ler("src/lib/supabase.js") + ler("src/lib/leads.js");
const semComentarios = (t) => t.replace(/--[^\n]*/g, "");

// Funções que o cardápio e o site chamam sem login: nenhuma pode ser fechada.
const PUBLICAS_EM_USO = [
  "pub_criar_pedido_v2", "pub_acompanhar_pedidos", "pub_upsert_cliente", "pub_buscar_cliente",
  "pub_saldo_fidelidade", "pub_solicitar_conta", "pub_criar_chamado", "pub_criar_lead", "pub_pesquisa_satisfacao",
];

describe("migration 213 — o que não precisa de acesso é fechado", () => {
  it("é a única migration 213, em uma transação, sem apagar nem alterar dados", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^213[_.]/.test(f))).toEqual(["213_acessos_sem_login_e_usuarios.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(semComentarios(sql)).not.toMatch(/\b(delete\s+from|update\s+public\.|insert\s+into|drop\s+|truncate\s+table)/i);
  });

  it("funções de senha e de usuário ficam só com o servidor", () => {
    const bloco = sql.slice(sql.indexOf("── 1 e 2)"), sql.indexOf("── 3)"));
    ["app_admin_criar_usuario", "app_admin_salvar_usuario", "app_criar_usuario", "app_salvar_usuario", "app_validar_login"]
      .forEach((f) => expect(bloco).toContain(`'${f}'`));
    expect(bloco).toContain("from public, anon, authenticated");
    expect(bloco).not.toMatch(/to authenticated/);
  });

  it("funções do painel perdem só o acesso sem login", () => {
    const bloco = sql.slice(sql.indexOf("── 3)"), sql.indexOf("── 4)"));
    expect(bloco).toContain("revoke all on function %s from public, anon'");
    expect(bloco).toContain("if f.logado then");
    // Usadas antes do login ou nas regras de acesso do visitante.
    ["app_dispositivo_esta_bloqueado", "app_release_prod_status", "app_caller_email", "app_is_super", "app_loja_id"]
      .forEach((f) => expect(bloco).not.toContain(`'${f}'`));
  });

  it("nenhuma função pública em uso é fechada, e as antigas só caem se a substituta existir", () => {
    const fechadas = [...semComentarios(sql).matchAll(/\('(pub_\w+)', '(pub_\w+)'\)/g)];
    expect(fechadas.map((m) => m[1])).toEqual(["pub_criar_pedido", "pub_pedidos_comanda", "pub_pedidos_cliente"]);
    PUBLICAS_EM_USO.forEach((f) => {
      expect(cliente).toContain(f);
      expect(fechadas.map((m) => m[1])).not.toContain(f);
    });
    expect(sql).toContain("q.proname = x.nova");
  });

  it("visitante sem login só lê o aviso de manutenção, e o navegador não grava usuários", () => {
    expect(sql).toContain("revoke all on table %s from anon");
    expect(sql).toContain("grant select on public.tab_sistema_status to anon;");
    expect(sql).toContain("revoke insert, update, delete, truncate on public.tab_usuarios from anon, authenticated;");
    expect(ler("src/lib/sistemaStatus.js")).toContain('.from("tab_sistema_status")');
  });
});

describe("script só da produção — travas de cupom, empresa e comanda", () => {
  it("fica fora das migrations numeradas e confere o código antes de substituir", () => {
    expect(readdirSync("supabase/migrations").some((f) => /travas_cupom_empresa/i.test(f))).toBe(false);
    expect(prod).toMatch(/\nbegin;\n/);
    expect(prod).toMatch(/\ncommit;\n/);
    expect(prod).toContain("mudou desde a consulta");
  });

  it("para no homologação com um aviso claro, antes de conferir ou substituir qualquer função", () => {
    const aviso = prod.indexOf("Este script é só da PRODUÇÃO");
    expect(aviso).toBeGreaterThan(prod.indexOf("\nbegin;\n"));
    expect(aviso).toBeLessThan(prod.indexOf("mudou desde a consulta"));
    expect(aviso).toBeLessThan(prod.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(prod).toContain("position('[trava 212]' in p.prosrc) > 0");
    // A marca do próprio script é outra: rodar de novo na produção continua permitido.
    expect(prod.slice(prod.indexOf("CREATE OR REPLACE FUNCTION"))).not.toContain("[trava 212]");
  });

  it("traz as seis funções, todas marcadas, e não as travas que dependem do app novo", () => {
    const blocos = prod.split("CREATE OR REPLACE FUNCTION public.").slice(1).map((b) => b.slice(0, b.indexOf("$function$;")));
    expect(blocos.map((b) => b.slice(0, b.indexOf("("))).sort()).toEqual(
      ["app_atualizar_loja", "app_criar_pedido", "cupom_consumir", "cupom_consumir", "cupom_validar", "cupom_validar"],
    );
    blocos.forEach((b) => expect(b).toContain("[trava producao]"));
    expect(prod).not.toContain("pedido_pago_nao_pode_ser");
    expect(prod).toContain("comanda_de_outra_empresa");
  });
});
