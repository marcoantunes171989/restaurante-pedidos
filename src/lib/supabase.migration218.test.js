// Migrations 218/219/220 e a ligação do app com o fechamento no servidor. O comportamento no banco é testado em
// supabase/tests/caixa-218-integration.sql; aqui ficam as garantias que não podem sumir do texto.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (caminho) => readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
const m218 = ler("supabase/migrations/218_caixa_parametros_e_fechamento.sql");
const m219 = ler("supabase/migrations/219_taxa_publica_do_cardapio.sql");
const m220 = ler("supabase/migrations/220_caixa_fecha_caminho_antigo.sql");
const app = ler("src/App.jsx");

describe("migration 218: limites e fechamento no servidor", () => {
  it("teto de 99,99% no desconto e no acréscimo, e a venda nunca zera", () => {
    expect(m218).toMatch(/floor\(p_compra \* 99\.99 \/ 100\)/);
    for (const campo of ["desconto máximo em percentual", "acréscimo máximo em percentual"]) {
      expect(m218).toContain(`0, 99.99, '${campo}')`);
    }
    expect(m218).toMatch(/if v_total < 1 then raise exception 'venda_nao_pode_zerar'/);
  });
  it("o total é calculado dos itens do pedido; a função não recebe total do navegador", () => {
    const assinatura = m218.slice(m218.indexOf("create or replace function public.app_fechar_conta("), m218.indexOf(") returns jsonb", m218.indexOf("function public.app_fechar_conta(")));
    expect(assinatura).not.toMatch(/p_total|p_subtotal/);
    expect(m218).toMatch(/app_pp_numero\(e -> 'price'\)/);
    expect(m218).toMatch(/for update;/);
  });
  it("confere empresa e permissão, e o visitante não executa nada", () => {
    expect(m218).toMatch(/conta_de_empresas_diferentes/);
    expect(m218).toMatch(/v_u\.loja_id is distinct from v_loja or not \('cashier' = any/);
    for (const fn of ["app_fechar_conta", "app_parametros_caixa", "app_salvar_parametros_caixa"]) {
      expect(m218).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*from public, anon;`));
    }
  });
  it("não fecha o caminho antigo (isso é da 220, depois do app publicado)", () => {
    expect(m218).not.toMatch(/revoke[^;]*app_pedido_marcar_pago/);
    expect(m218).not.toMatch(/revoke insert on public\.tab_pagamentos/);
    expect(m220).toMatch(/precheck 220: rode antes a migration 218/);
    expect(m220).toMatch(/revoke all on function public\.app_pedido_marcar_pago\(text, text, text\) from public, anon, authenticated;/);
    expect(m220).toMatch(/revoke insert on public\.tab_pagamentos from anon, authenticated;/);
  });
});

describe("migration 219: taxa pública do cardápio", () => {
  it("devolve só um número e é a única função aberta ao visitante", () => {
    expect(m219).toMatch(/function public\.pub_taxa_servico\(p_loja_id bigint\)\s*\nreturns numeric language sql stable security definer/);
    expect(m219.match(/to anon/g)).toHaveLength(1);
    expect(m219).not.toMatch(/\b(insert into|update|delete from) public\./i);
  });
});

describe("app: fechamento pelo servidor", () => {
  const corpo = app.slice(app.indexOf("async function baixarComandas("), app.indexOf("async function registrarComandas("));
  it("pergunta ao servidor antes de mostrar a conta como paga e para se houver recusa", () => {
    const servidor = corpo.indexOf("fecharContaNoServidor(");
    expect(servidor).toBeGreaterThan(-1);
    expect(servidor).toBeLessThan(corpo.indexOf("setOrders((cur) => cur.map("));
    expect(corpo).toMatch(/return \{ alertas: \[\], erro: true, recusado: true, pagamentoGravado: false \};/);
  });
  it("quando o servidor fechou a conta, o app não grava pagamento nem movimento de novo", () => {
    expect(corpo).toMatch(/if \(!noServidor\) \{\s*\n\s*await Promise\.all\(alvo\.map\(\(o\) => marcarPagoPedido\(/);
    expect(corpo).toMatch(/if \(info && !noServidor\) await registrarPagamento\(/);
    expect(corpo).toMatch(/if \(info && caixaAberto && !noServidor\)/);
  });
  it("a tela Comandas mostra a taxa da empresa, não a do aparelho", () => {
    const comandas = app.slice(app.indexOf("function ComandasGestaoAdmin("), app.indexOf("const abertos = grupos.filter("));
    expect(comandas).toContain("useParametrosCaixa(supabase, lojaId)");
    expect(comandas).not.toMatch(/lerConfigTaxaServico/);
  });
  it("PDV e Central do Caixa informam os pedidos da conta", () => {
    expect(ler("src/pages/CentralDoCaixa.jsx")).toMatch(/fechamento: \{ pedidoIds: \[o\.id\] \}/);
    expect(ler("src/pages/pdv/CashierPdv.jsx")).toMatch(/fechamento/);
  });
});
