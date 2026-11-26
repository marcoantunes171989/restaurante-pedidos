// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ENDERECO_VAZIO, problemaDoEndereco, enderecoEmLinha, completarComEnderecoDoPedido, lojaPedeEndereco, criarPedidoEntrega, buscarEnderecoDosPedidos } from "./enderecoEntrega.js";
import { NOTA_VAZIA, dadosDaNotaNoCaixa } from "./fiscal/emissaoPdv.js";
import { montarMensagemPedidoWhatsApp } from "./whatsappPedido.js";

const END = { CEP: "01310100", xLgr: "Avenida Paulista", nro: "1000", xCpl: "", xBairro: "Bela Vista", xMun: "São Paulo", UF: "SP", cMun: "3550308" };

describe("endereço de entrega no cardápio", () => {
  it("pede CEP, rua, número, bairro, cidade e UF", () => {
    expect(problemaDoEndereco(ENDERECO_VAZIO)).toMatch(/CEP/);
    expect(problemaDoEndereco(END)).toBeNull();
    expect(problemaDoEndereco({ ...END, nro: " " })).toMatch(/número/);
    expect(problemaDoEndereco({ ...END, UF: "S" })).toMatch(/UF/);
  });
  it("mostra em uma linha, sem campos vazios", () => {
    expect(enderecoEmLinha(END)).toBe("Avenida Paulista, 1000 · Bela Vista · São Paulo - SP · CEP 01310100");
    expect(enderecoEmLinha(null)).toBe("");
  });
  it("preenche o caixa e o resultado já serve para a NFC-e de entrega (falta só o CPF)", () => {
    const nota = completarComEnderecoDoPedido({ ...NOTA_VAZIA, entrega: true }, { endereco: END, cliente: "Maria Teste" });
    expect(nota).toMatchObject({ nome: "Maria Teste", xLgr: "Avenida Paulista", cMun: "3550308" });
    const opts = { entregaDisponivel: true, ufEmitente: "SP" };
    expect(dadosDaNotaNoCaixa(nota, opts).erro).toMatch(/CPF/);
    expect(dadosDaNotaNoCaixa({ ...nota, documento: "123.456.789-09" }, opts).ok).toBe(true);
  });
  it("não troca nem mistura o que o operador já digitou", () => {
    const nota = completarComEnderecoDoPedido({ ...NOTA_VAZIA, nome: "Outro Nome", xLgr: "Rua Digitada" }, { endereco: END, cliente: "Maria" });
    expect(nota).toMatchObject({ nome: "Outro Nome", xLgr: "Rua Digitada", CEP: "", cMun: "" });
    expect(completarComEnderecoDoPedido(NOTA_VAZIA, null)).toBe(NOTA_VAZIA);
  });
  it("sem a função no banco: a loja não pede endereço e o caixa não mostra nada", async () => {
    const semFuncao = { rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) };
    expect(await lojaPedeEndereco(semFuncao, 9)).toBe(false);
    expect(await buscarEnderecoDosPedidos(semFuncao, ["PED-1"])).toBeNull();
    expect(await lojaPedeEndereco({ rpc: vi.fn(async () => ({ data: true, error: null })) }, 9)).toBe(true);
  });
  it("cria o pedido com o endereço e repassa o erro do banco", async () => {
    const ok = { rpc: vi.fn(async () => ({ data: "PED-1", error: null })) };
    expect(await criarPedidoEntrega(ok, { lojaId: 9, itens: [{ productId: 1, quantity: 1 }], endereco: END, comanda: "EXT-000000", cliente: "Maria", telefone: "11900000000" })).toBe("PED-1");
    expect(ok.rpc).toHaveBeenCalledWith("pub_criar_pedido_entrega", expect.objectContaining({ p_loja_id: 9, p_endereco: END, p_comanda: "EXT-000000" }));
    const erro = { rpc: async () => ({ data: null, error: { message: "PPV2: Confira o endereço de entrega." } }) };
    await expect(criarPedidoEntrega(erro, { lojaId: 9, endereco: END })).rejects.toMatchObject({ message: /PPV2/ });
  });
  it("a mensagem do WhatsApp leva o endereço só quando há", () => {
    const base = { pedido: { customer: "Maria", table: "Externo · Entrega", items: [] }, total: 10 };
    expect(montarMensagemPedidoWhatsApp({ ...base, pedido: { ...base.pedido, enderecoEntrega: enderecoEmLinha(END) } })).toContain("Endereço de entrega: Avenida Paulista, 1000");
    expect(montarMensagemPedidoWhatsApp(base)).not.toContain("Endereço de entrega");
  });
});

describe("migration 207", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/207_pedido_endereco_entrega.sql", import.meta.url), "utf8");
  it("a tabela com dado pessoal não tem acesso direto", () => {
    expect(sql).toContain("alter table public.tab_pedido_endereco enable row level security;");
    expect(sql).toContain("revoke all on table public.tab_pedido_endereco from public, anon, authenticated;");
    expect(sql).not.toMatch(/create policy|grant (select|insert|update|delete|all)[^;]*tab_pedido_endereco/i);
  });
  it("o cardápio (anon) não lê endereço; o caixa lê só com permissão de receber pagamento", () => {
    expect(sql).toContain("revoke all on function public.app_pedido_endereco_entrega(text[]) from public, anon;");
    expect(sql).toContain("public.app_pode_receber_pagamento(e.loja_id)");
  });
});
