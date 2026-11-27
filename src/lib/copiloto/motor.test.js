import { describe, expect, it } from "vitest";
import { PERGUNTAS, identificarPergunta, interpretar, responder, resumoParaIA } from "./motor.js";

const AGORA = new Date(2026, 10, 26, 20, 0);
const em = (mes, dia, hora = 12) => new Date(2026, mes, dia, hora).toISOString();
const pedido = (extra) => ({
  id: "PED-100001", status: "delivered", paymentStatus: "paid", table: "Mesa 03", command: "C3",
  customer: null, createdAtISO: em(10, 26), items: [{ name: "Burger Bacon", price: 30, quantity: 1 }], ...extra,
});
const produtos = [
  { name: "Burger Bacon", category: "Lanches", price: 30, cost: 12, controlaEstoque: true, estoque: 2, estoqueMinimo: 5, active: true },
  { name: "Suco de Laranja", category: "Bebidas", price: 10, cost: null, controlaEstoque: false, active: true },
];
const historico = [
  pedido({}),
  pedido({ id: "PED-100002", paymentStatus: "requested", createdAtISO: em(10, 24) }),
  pedido({ id: "PED-100003", status: "cancelled", cancelReason: "Desistência" }),
  pedido({ id: "PED-100004", customer: "Marina Alves", createdAtISO: em(8, 10) }),
];
const ctx = {
  lojaNome: "Loja Teste", rotuloPeriodo: "7 dias", agora: AGORA, produtos, historico,
  pedidos: historico.slice(0, 3), anteriores: [], pesquisas: [],
};

describe("motor do Copiloto", () => {
  it("reconhece o assunto da pergunta, com ou sem acento", () => {
    expect(identificarPergunta("Há contas para receber?")).toBe("pendencias");
    expect(identificarPergunta("o que preciso repor no estoque")).toBe("estoque");
    expect(identificarPergunta("Qual o horário de pico?")).toBe("horario");
    expect(identificarPergunta("quanto faturei")).toBe("vendas");
    expect(identificarPergunta("blablabla")).toBeNull();
  });

  it("toda pergunta fixa tem resposta própria", () => {
    PERGUNTAS.forEach((p) => {
      expect(identificarPergunta(p.rotulo)).toBe(p.id);
      expect(responder(p.id, ctx).resposta.length).toBeGreaterThan(10);
    });
  });

  it("responde com os números da loja", () => {
    expect(responder("vendas", ctx).resposta).toContain("33,00");
    const pendencias = responder("pendencias", ctx);
    expect(pendencias.resposta).toContain("1 pedido sem pagamento");
    expect(pendencias.itens[0]).toContain("pediu a conta");
    expect(responder("estoque", ctx).itens[0]).toContain("faltam 3");
    expect(responder("clientes", ctx).itens[0]).toContain("Marina Alves");
    expect(responder("cancelamentos", ctx).itens[0]).toBe("Desistência — 1×");
  });

  it("sem dado, diz que não há", () => {
    const vazio = { ...ctx, pedidos: [], historico: [], produtos: [] };
    expect(responder("vendas", vazio).resposta).toContain("Não há vendas pagas");
    expect(responder("estoque", vazio).resposta).toContain("controle de estoque");
    expect(responder("satisfacao", vazio).resposta).toContain("Nenhuma pesquisa");
  });

  it("busca produto, cupom, mesa e cliente da loja", () => {
    expect(interpretar("quanto vendeu o burger?", ctx).titulo).toBe("Burger Bacon");
    expect(interpretar("cupom 100002", ctx).titulo).toBe("Cupom PED-100002");
    expect(interpretar("mesa 3", ctx).titulo).toBe("Mesa 3");
    expect(interpretar("Marina", ctx).titulo).toBe("Marina Alves");
    expect(interpretar("o que preciso repor?", ctx).titulo).toBe("Repor");
    expect(interpretar("previsão do tempo", ctx)).toBeNull();
  });

  it("entende abreviação e ignora nome genérico de cliente", () => {
    const loja = { ...ctx, produtos: [{ name: "Refri Lata", price: 7, active: true }] };
    expect(interpretar("refrigerante", loja).titulo).toBe("Refri Lata");
    const generico = { ...ctx, historico: [pedido({ customer: "Cliente", createdAtISO: em(8, 10) })] };
    expect(responder("clientes", generico).resposta).toContain("Ainda não há vendas com cliente identificado");
  });

  it("não envia nome de cliente para a IA", () => {
    const resumo = resumoParaIA({ ...ctx, pedidos: historico });
    expect(resumo).toContain("Loja Teste");
    expect(resumo).not.toContain("Marina");
  });
});
