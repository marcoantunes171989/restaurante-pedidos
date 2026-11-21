import { describe, expect, it, vi, beforeEach } from "vitest";

// 195: o acompanhamento público do pedido passou a usar pub_acompanhar_pedidos. As funções antigas (pub_pedidos_cliente/pub_pedidos_comanda) estão
// fechadas para anon no HML ("permission denied"): só servem de reserva quando a nova ainda não existe no banco.
const estado = { rpc: {} };
const rpcMock = vi.fn(async (nome) => estado.rpc[nome] || { data: null, error: { code: "PGRST202", message: "Could not find the function" } });

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: rpcMock, from: () => ({}), storage: { from: () => ({}) }, channel: () => ({ on: () => ({ subscribe: () => {} }) }), removeChannel: () => {} }),
}));

const { rpcPedidosCliente, rpcPedidosComanda } = await import("./supabase.js");
beforeEach(() => { estado.rpc = {}; rpcMock.mockClear(); });

const LINHA = { id: "PED-1", mesa: "Externo · Retirada", comanda: "EXT-000001", cliente: "Maria", status: "preparando", status_pagamento: "aberto", criado_em: "2026-11-20T15:00:00Z",
  atualizado_em: "2026-11-20T15:05:00Z", preparo_em: "2026-11-20T15:03:00Z", pronto_em: null, itens: [{ name: "Batata", price: 18.9, quantity: 1 }], loja_id: 9, cliente_telefone: "11900000001", setor_status: {}, pagamento_forma: null };

describe("acompanhamento público dos pedidos (195)", () => {
  it("externo: chama a RPC nova com o telefone e devolve o pedido com o status em formato do app", async () => {
    estado.rpc.pub_acompanhar_pedidos = { data: [LINHA], error: null };
    const r = await rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" });
    expect(rpcMock).toHaveBeenCalledWith("pub_acompanhar_pedidos", { p_loja_id: 9, p_telefone: "11900000001", p_comanda: null });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "PED-1", status: "preparing", paymentStatus: "open", clienteTelefone: "11900000001", lojaId: 9, command: "EXT-000001" });
    expect(r[0].preparoEmISO).toBe("2026-11-20T15:03:00Z");
  });
  it("mesa: chama a RPC nova com a comanda", async () => {
    estado.rpc.pub_acompanhar_pedidos = { data: [{ ...LINHA, status: "finalizado" }], error: null };
    const r = await rpcPedidosComanda({ lojaId: 9, comanda: "HAM-0001" });
    expect(rpcMock).toHaveBeenCalledWith("pub_acompanhar_pedidos", { p_loja_id: 9, p_telefone: null, p_comanda: "HAM-0001" });
    expect(r[0].status).toBe("ready");
  });
  it("sem pedidos: lista vazia (não é erro)", async () => {
    estado.rpc.pub_acompanhar_pedidos = { data: [], error: null };
    expect(await rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" })).toEqual([]);
    estado.rpc.pub_acompanhar_pedidos = { data: null, error: null };
    expect(await rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" })).toEqual([]);
  });
  it("banco ainda sem a 195: cai nas funções antigas (ambientes que ainda as têm abertas)", async () => {
    estado.rpc.pub_pedidos_cliente = { data: [LINHA], error: null };
    const r = await rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" });
    expect(rpcMock.mock.calls.map((c) => c[0])).toEqual(["pub_acompanhar_pedidos", "pub_pedidos_cliente"]);
    expect(r[0].id).toBe("PED-1");
    estado.rpc.pub_pedidos_comanda = { data: [LINHA], error: null };
    expect((await rpcPedidosComanda({ lojaId: 9, comanda: "HAM-0001" }))[0].id).toBe("PED-1");
  });
  it("erro real (permissão, rede) NÃO vira lista vazia: propaga para a tela avisar", async () => {
    estado.rpc.pub_acompanhar_pedidos = { data: null, error: { code: "42501", message: "permission denied for function pub_acompanhar_pedidos" } };
    await expect(rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" })).rejects.toMatchObject({ code: "42501" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
  it("função nova ausente E antiga negada: o erro da antiga sobe (a tela mostra 'não foi possível consultar')", async () => {
    estado.rpc.pub_pedidos_cliente = { data: null, error: { code: "42501", message: "permission denied for function pub_pedidos_cliente" } };
    await expect(rpcPedidosCliente({ lojaId: 9, telefone: "11900000001" })).rejects.toMatchObject({ code: "42501" });
  });
});
