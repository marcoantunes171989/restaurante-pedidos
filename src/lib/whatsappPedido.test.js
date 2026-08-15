import { describe, expect, it } from "vitest";
import { criarUrlPedidoWhatsApp, montarMensagemPedidoWhatsApp, normalizarNumeroWhatsApp, numeroWhatsAppValido } from "./whatsappPedido";

describe("pedido pelo WhatsApp", () => {
  it("normaliza telefone brasileiro com DDI", () => {
    expect(normalizarNumeroWhatsApp("(11) 98765-4321")).toBe("5511987654321");
    expect(numeroWhatsAppValido("5511987654321")).toBe(true);
  });

  it("monta mensagem com cliente, itens, observação, pagamento e total", () => {
    const mensagem = montarMensagemPedidoWhatsApp({
      pedido: { id: "PED-10", customer: "Ana", clienteTelefone: "11999999999", table: "Externo · Retirada", observation: "Retirar às 19h", items: [{ name: "X-Salada", quantity: 2, price: 20, observation: "Sem cebola" }] },
      total: 40, formaPagamento: "PIX", momentoPagamento: "Na retirada",
    });
    expect(mensagem).toContain("*PEDIDO PED-10*");
    expect(mensagem).toContain("Cliente: Ana");
    expect(mensagem).toContain("2x X-Salada");
    expect(mensagem).toContain("Obs.: Sem cebola");
    expect(mensagem).toContain("*OBSERVAÇÃO DO PEDIDO*");
    expect(mensagem).toContain("Retirar às 19h");
    expect(mensagem).toContain("*Total: R$ 40,00*");
    expect(mensagem).toContain("Pagamento: PIX — Na retirada");
  });

  it("gera link wa.me codificado e rejeita número inválido", () => {
    expect(criarUrlPedidoWhatsApp("11 98765-4321", { pedido: { items: [] }, total: 0 })).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    expect(criarUrlPedidoWhatsApp("123", { pedido: { items: [] }, total: 0 })).toBe("");
  });
});
