import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/212_travas_nas_funcoes.sql");
const cliente = ler("src/lib/supabase.js");
const app = ler("src/App.jsx");
// Texto de uma função da migration (todas as versões com o mesmo nome).
const funcoes = (nome) => sql.split("CREATE OR REPLACE FUNCTION public.").slice(1).filter((b) => b.startsWith(`${nome}(`)).map((b) => b.slice(0, b.indexOf("$function$;")));

describe("migration 212 — senhas fora do navegador e travas nas funções", () => {
  it("é a única migration 212, em uma transação, e confere o código antes de substituir", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^212[_.]/.test(f))).toEqual(["212_travas_nas_funcoes.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(sql).toContain("mudou desde a consulta");
  });

  it("o navegador não lê senha, e continua lendo o que o app usa", () => {
    expect(sql).toContain("revoke select on public.tab_usuarios from anon, authenticated;");
    const liberadas = sql.match(/grant select \(([^)]*)\)\s*on public\.tab_usuarios to authenticated;/)[1].split(",").map((c) => c.trim());
    expect(liberadas).not.toContain("senha");
    expect(liberadas).not.toContain("senha_hash");
    const usadas = cliente.match(/USUARIO_COLS_SEM_SENHA = '([^']+)'/)[1].split(",");
    usadas.forEach((c) => expect(liberadas).toContain(c));
    expect(cliente).not.toMatch(/from\('tab_usuarios'\)\.select\('\*'\)/);
  });

  it("cupom só vale para a própria empresa", () => {
    const blocos = [...funcoes("cupom_validar"), ...funcoes("cupom_consumir")];
    expect(blocos).toHaveLength(4);
    blocos.forEach((b) => expect(b).toContain("p_loja_id <> public.app_loja_id()"));
    funcoes("cupom_consumir").forEach((b) => expect(b).toContain("k.id = p_cupom_id and k.loja_id is not null and k.loja_id <> p_loja_id"));
  });

  it("pedido pago não é alterado, transferido nem cancelado; cancelado não é pago", () => {
    expect(funcoes("app_pedido_atualizar_itens")[0]).toContain("pedido_pago_nao_pode_ser_alterado");
    expect(funcoes("app_pedido_transferir_mesa")[0]).toContain("pedido_pago_nao_pode_ser_transferido");
    expect(funcoes("app_pedido_atualizar_status")[0]).toContain("pedido_pago_nao_pode_ser_cancelado");
    expect(funcoes("app_pedido_marcar_pago")[0]).toContain("pedido_cancelado_nao_pode_ser_pago");
  });

  it("ativar ou suspender empresa é só do administrador geral", () => {
    expect(funcoes("app_alternar_loja_usuarios")[0]).toContain("super_admin_required");
    expect(funcoes("app_atualizar_loja")[0]).toContain("(p_patch->>'ativo')::boolean is distinct from v_atual.ativo");
  });

  it("o app não manda pagar pedido cancelado e avisa quando o cancelamento é recusado", () => {
    expect(app).toContain('const alvo = orders.filter((o) => ehAlvo(o) && o.paymentStatus !== "paid" && o.status !== "cancelled");');
    expect(app).toContain('includes("pedido_pago_nao_pode_ser_cancelado")');
  });
});
