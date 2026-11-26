import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { pedidosParaRegistro, registrarVendaCaixa, vendasDoBalcao } from "./vendaCaixa.js";
import { dadosDaNotaNoCaixa, tipoDaNota, NOTA_VAZIA } from "./emissaoPdv.js";
import { acaoPrincipal } from "../../pages/pdv/pdvAcaoPrincipal.js";

const PEDIDO = { id: "P1", lojaId: 9, table: "Mesa 01", command: "C1", clienteTelefone: "11999990000", customer: "Maria", paymentStatus: "paid", status: "delivered",
  createdAtISO: "2026-11-26T12:00:00Z", items: [{ productId: 45, name: "X", price: 10, quantity: 2 }] };

describe("registro da venda do caixa", () => {
  it("guarda só o que a nota precisa (sem nome nem telefone do cliente)", () => {
    const [p] = pedidosParaRegistro([PEDIDO]);
    expect(p).toEqual({ id: "P1", lojaId: 9, table: "Mesa 01", command: "C1", items: [{ productId: 45, name: "X", price: 10, quantity: 2 }] });
  });
  it("migration ausente: não lança e avisa", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) };
    expect(await registrarVendaCaixa(supabase, { lojaId: 9, codigo: "PAG-1", tipo: "balcao", pedidos: [PEDIDO] })).toMatchObject({ ok: false, migracaoPendente: true });
  });
  it("pedido com registro não aparece duas vezes; pedido sem registro aparece sem permissão de emitir", () => {
    const registros = [{ codigo: "PAG-1", pedidos_ids: ["P1"], total: 20, pedidos: pedidosParaRegistro([PEDIDO]), criado_em: "2026-11-26T12:05:00Z" }];
    const r = vendasDoBalcao({ registros, orders: [PEDIDO, { ...PEDIDO, id: "P2" }], documentos: [], lojaId: 9 });
    expect(r.map((v) => [v.pedidosIds.join(), v.registrada])).toEqual([["P1", true], ["P2", false]]);
  });
});

describe("escolha do tipo no fechamento", () => {
  it("padrão é NFC-e; sem NFC-e é Venda Balcão", () => {
    expect(tipoDaNota(NOTA_VAZIA, { nfceDisponivel: true })).toBe("nfce");
    expect(tipoDaNota(NOTA_VAZIA, { nfceDisponivel: false, nfeDisponivel: true })).toBe("balcao");
  });
  it("Venda Balcão não confere nem emite nada", () => {
    expect(dadosDaNotaNoCaixa({ ...NOTA_VAZIA, balcao: true, documento: "000" })).toEqual({ ok: true, balcao: true, modelo: null, cpf: "", destinatario: null });
  });
  it("NF-e exige CNPJ", () => {
    expect(dadosDaNotaNoCaixa({ ...NOTA_VAZIA, nfe: true, documento: "123.456.789-09" }, { nfeDisponivel: true }).erro).toMatch(/CNPJ/);
  });
  it("a ação principal diz que é sem nota", () => {
    expect(acaoPrincipal({ temConta: true, passo: 2, temItens: true, restante: 0, podeFechar: true, total: 10, emiteNota: false, balcao: true }).texto).toBe("Fechar venda balcão (sem nota)");
  });
});

describe("migration 208", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/208_venda_caixa_registro.sql", import.meta.url), "utf8");
  it("tabela sem acesso direto e sem alteração pelo app", () => {
    expect(sql).toContain("alter table public.tab_venda_caixa enable row level security;");
    expect(sql).toContain("revoke all on table public.tab_venda_caixa from public, anon, authenticated;");
    expect(sql).not.toMatch(/create policy|grant (select|insert|update|delete|all)[^;]*tab_venda_caixa|update public\.tab_venda_caixa|delete from public\.tab_venda_caixa/i);
  });
  it("só quem recebe pagamento grava e lê; o anon não executa", () => {
    expect(sql.match(/app_pode_receber_pagamento\(p_loja_id\)/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on function public.app_venda_caixa_registrar(bigint, jsonb) from public, anon;");
    expect(sql).toContain("revoke all on function public.app_venda_caixa_listar(bigint, timestamptz) from public, anon;");
  });
});
