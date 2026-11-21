import { describe, it, expect } from "vitest";
import { classificarPedido, totalDoPedido, montarMensagemPedido } from "../../supabase/functions/notificacoes-push/mensagem.js";

const norm = (s) => s.replace(/ /g, " ");
const itens = [{ price: 30, quantity: 2 }, { price: 10, quantity: 1 }];

describe("classificarPedido", () => {
  it("mesa do salão", () => {
    expect(classificarPedido("Mesa 5", "CMD-1")).toEqual({ tipo: "Mesa", externo: false, local: "Mesa 5" });
    expect(classificarPedido("7", "CMD-1").local).toBe("Mesa 7");
  });
  it("externo: retirada, entrega e delivery genérico", () => {
    expect(classificarPedido("Externo · Retirada", "EXT-9").tipo).toBe("Retirada");
    expect(classificarPedido("Externo · Entrega", "EXT-9").tipo).toBe("Entrega");
    expect(classificarPedido("Externo", "EXT-9").tipo).toBe("Delivery");
    expect(classificarPedido("X", "EXT-1").externo).toBe(true);
  });
});

describe("totalDoPedido", () => {
  it("soma itens + 10% no salão; sem taxa na retirada/entrega", () => {
    expect(totalDoPedido(itens, "Mesa 5")).toBeCloseTo(77);
    expect(totalDoPedido(itens, "Externo · Retirada")).toBeCloseTo(70);
    expect(totalDoPedido(null, "Mesa 1")).toBe(0);
  });
});

describe("montarMensagemPedido", () => {
  it("novo pedido na mesa: loja, cliente, itens e valor", () => {
    const m = montarMensagemPedido({ evento: "novo_pedido", numero: 12, lojaNome: "Burger Station",
      pedido: { mesa: "Mesa 5", comanda: "CMD-1", cliente: "João", itens } });
    expect(m.titulo).toBe("🛎️ Novo pedido #12 · Mesa 5");
    expect(norm(m.corpo)).toBe("Burger Station · João · 3 itens · R$ 77,00");
  });
  it("entrega externa identifica o tipo e omite cliente 'Visitante'", () => {
    const m = montarMensagemPedido({ evento: "novo_pedido", numero: 3,
      pedido: { mesa: "Externo · Entrega", comanda: "EXT-1", cliente: "Visitante", itens: [{ price: 20, quantity: 1 }] } });
    expect(m.titulo).toBe("🛎️ Novo pedido #3 · Entrega");
    expect(norm(m.corpo)).toBe("Entrega · 1 item · R$ 20,00");
  });
  it("caixa aguardando pagamento", () => {
    const m = montarMensagemPedido({ evento: "caixa_aguardando", numero: 12, lojaNome: "Matriz",
      pedido: { mesa: "Mesa 5", comanda: "CMD-1", cliente: "Ana", itens } });
    expect(m.titulo).toBe("💳 Pagamento aguardando #12 · Mesa 5");
    expect(m.corpo).toContain("Matriz");
  });
  it("pedido sem dados ainda gera texto útil", () => {
    expect(montarMensagemPedido({ evento: "novo_pedido", pedido: null }).corpo).toBe("Pedido aguardando atendimento");
    expect(montarMensagemPedido({ evento: "caixa_aguardando", pedido: {} }).corpo).toBe("Pedido enviado para o Caixa");
  });
});
