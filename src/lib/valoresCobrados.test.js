// Relatórios com o valor realmente cobrado (migrations 218 e 221).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { anotarCobranca, buscarValoresCobrados, distribuirPagamentos } from "./valoresCobrados";
import { ajustePedido, resumoVendas, taxaPedido, totalPedido } from "./relatorios/analiseVendas";

const pedido = (id, table, precos, extra = {}) => ({ id, table, paymentStatus: "paid", status: "delivered",
  items: precos.map((p, i) => ({ name: `I${i}`, price: p, quantity: 1 })), ...extra });
const soma = (mapa, campo) => Math.round([...mapa.values()].reduce((s, v) => s + v[campo], 0) * 100) / 100;

describe("repartição do pagamento entre os pedidos", () => {
  it("um pedido recebe exatamente o total e a taxa do pagamento", () => {
    const m = distribuirPagamentos([{ pedidos: ["A"], taxaServico: 2.99, total: 34.89 }], [pedido("A", "Mesa 1", [29.9])]);
    expect(m.get("A")).toEqual({ total: 34.89, taxa: 2.99 });
  });
  it("conta com vários pedidos fecha em centavos; entrega não recebe taxa", () => {
    const pedidos = [pedido("A", "Mesa 1", [33.33]), pedido("B", "Mesa 1", [33.33]), pedido("C", "Externo · Entrega", [33.34])];
    const m = distribuirPagamentos([{ pedidos: ["A", "B", "C"], taxaServico: 6.67, total: 96.67 }], pedidos);
    expect(soma(m, "total")).toBe(96.67);
    expect(soma(m, "taxa")).toBe(6.67);
    expect(m.get("C").taxa).toBe(0);
  });
  it("não reparte quando falta um pedido da conta ou o total é inválido", () => {
    const pedidos = [pedido("A", "Mesa 1", [10])];
    expect(distribuirPagamentos([{ pedidos: ["A", "Z"], taxaServico: 0, total: 20 }], pedidos).size).toBe(0);
    expect(distribuirPagamentos([{ pedidos: ["A"], taxaServico: 0 }], pedidos).size).toBe(0);
  });
});

describe("relatórios", () => {
  it("venda com valor gravado vale o cobrado, com desconto separado da taxa", () => {
    const [o] = anotarCobranca([pedido("A", "Mesa 1", [100])], new Map([["A", { total: 95, taxa: 10 }]]), 12);
    expect([totalPedido(o), taxaPedido(o), ajustePedido(o)]).toEqual([95, 10, -15]);
    expect(resumoVendas([o]).faturamento).toBe(95);
  });
  it("venda antiga sem registro continua com a regra da época (10%)", () => {
    const [o] = anotarCobranca([pedido("A", "Mesa 1", [100])], new Map(), 12);
    expect(o.cobrado).toBeUndefined();
    expect(totalPedido(o)).toBeCloseTo(110, 6);
    expect(totalPedido(pedido("B", "Externo · Retirada", [100]))).toBe(100);
  });
  it("pedido em aberto usa a taxa atual da empresa; sem ela, nada muda", () => {
    const aberto = pedido("A", "Mesa 1", [100], { paymentStatus: "open" });
    expect(totalPedido(anotarCobranca([aberto], new Map(), 12)[0])).toBe(112);
    expect(totalPedido(anotarCobranca([aberto], new Map(), 0)[0])).toBe(100);
    expect(anotarCobranca([aberto], new Map(), null)[0]).toBe(aberto);
  });
});

describe("busca no servidor", () => {
  const sb = (resposta) => ({ rpc: vi.fn(async () => resposta) });
  it("pede a empresa em foco e aceita só lista", async () => {
    const s = sb({ data: [{ pedidos: ["A"] }], error: null });
    expect(await buscarValoresCobrados(s, 9)).toHaveLength(1);
    expect(s.rpc).toHaveBeenCalledWith("app_valores_cobrados", { p_loja_id: 9 });
    expect(await buscarValoresCobrados(sb({ data: { ok: true }, error: null }), 9)).toBeNull();
  });
  it("banco sem a função: null; recusa sobe como erro", async () => {
    expect(await buscarValoresCobrados(sb({ data: null, error: { code: "PGRST202" } }), 9)).toBeNull();
    await expect(buscarValoresCobrados(sb({ data: null, error: { message: "forbidden" } }), 9)).rejects.toBeTruthy();
  });
});

describe("migration 221 e telas", () => {
  const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("só leitura, fechada ao visitante e restrita à própria empresa", () => {
    const m = ler("supabase/migrations/221_relatorios_valor_cobrado.sql");
    expect(m).toMatch(/revoke all on function public\.app_valores_cobrados\(bigint\) from public, anon;/);
    expect(m).toMatch(/v_u\.loja_id is distinct from p_loja_id/);
    expect(m).not.toMatch(/\b(insert into|update|delete from) public\./i);
  });
  it("o painel anota os pedidos num único ponto e não sobra percentual fixo nos cupons", () => {
    const app = ler("src/App.jsx");
    expect(app).toContain("const orders = useCobranca(supabase, pedidosDoApp, lojaInfo?.id ?? null, percentualAberto);");
    expect(app).not.toMatch(/servi[cç]o \(?10%/i);
    expect(app).not.toMatch(/\?\s*1\.1\s*:\s*1/);
    expect(ler("src/pages/admin/relatorios/RelatorioVisaoGeral.jsx")).not.toContain("10%");
  });
});
