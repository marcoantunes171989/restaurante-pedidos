import { describe, it, expect, vi } from "vitest";
import {
  PAYMENT_V2_ENABLED, STATUS_PAGAMENTO_V2, EVENTOS_PAGAMENTO_V2,
  novaIdempotencyKey, normalizarAlocacoes, somarAlocacoes,
  validarPagamentoV2, mensagemErroPagamentoV2, registrarPagamentoV2,
} from "./paymentService";

// NOTA: RLS, concorrência de verdade, rollback de transação e append-only são
// comportamentos de BANCO — verificados por SQL de integração em homologação
// (ver docs/arquitetura-pagamentos-v2.md §Testes). Aqui cobrimos o domínio puro
// do cliente + a fiação da chamada da RPC (mock), sem tocar em banco.

describe("feature flag", () => {
  it("PAYMENT_V2_ENABLED começa desligada (default false)", () => {
    expect(PAYMENT_V2_ENABLED).toBe(false);
  });
});

describe("catálogos de status/eventos (espelham a migration 118)", () => {
  it("status inclui os 10 canônicos", () => {
    expect(STATUS_PAGAMENTO_V2).toContain("PAID");
    expect(STATUS_PAGAMENTO_V2).toHaveLength(10);
  });
  it("eventos incluem CREATED e PAID", () => {
    expect(EVENTOS_PAGAMENTO_V2).toEqual(expect.arrayContaining(["CREATED", "PAID"]));
  });
});

describe("idempotency key", () => {
  it("gera UUID v4 e valores distintos", () => {
    const a = novaIdempotencyKey(), b = novaIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(a).not.toBe(b);
  });
});

describe("normalização/soma de alocações", () => {
  it("aceita pedidoId/pedido_id/id e valor/amount, arredonda 2 casas", () => {
    const n = normalizarAlocacoes([{ pedidoId: "P1", valor: 10.005 }, { id: "P2", amount: 5.1 }]);
    expect(n).toEqual([{ pedido_id: "P1", valor: 10.01 }, { pedido_id: "P2", valor: 5.1 }]);
  });
  it("soma com 2 casas", () => {
    expect(somarAlocacoes([{ pedido_id: "A", valor: 10.1 }, { pedido_id: "B", valor: 0.2 }])).toBe(10.3);
  });
});

describe("validarPagamentoV2 (espelho das regras do servidor)", () => {
  const ok = { valorBruto: 30, valorTaxa: 0, alocacoes: [{ pedido_id: "A", valor: 20 }, { pedido_id: "B", valor: 10 }] };

  it("caso feliz é válido; valorLiquido = bruto - taxa", () => {
    const r = validarPagamentoV2({ ...ok, valorTaxa: 1.5 });
    expect(r.valido).toBe(true);
    expect(r.valorLiquido).toBe(28.5);
    expect(r.soma).toBe(30);
  });
  it("valor_bruto <= 0 → inválido", () => {
    expect(validarPagamentoV2({ ...ok, valorBruto: 0 }).valido).toBe(false);
  });
  it("taxa negativa → inválido", () => {
    expect(validarPagamentoV2({ ...ok, valorTaxa: -1 }).valido).toBe(false);
  });
  it("taxa > bruto (líquido negativo) → inválido", () => {
    expect(validarPagamentoV2({ valorBruto: 10, valorTaxa: 20, alocacoes: [{ pedido_id: "A", valor: 10 }] }).valido).toBe(false);
  });
  it("sem alocação → inválido", () => {
    expect(validarPagamentoV2({ valorBruto: 10, alocacoes: [] }).valido).toBe(false);
  });
  it("alocação sem pedido_id → inválido", () => {
    expect(validarPagamentoV2({ valorBruto: 10, alocacoes: [{ pedido_id: "", valor: 10 }] }).valido).toBe(false);
  });
  it("alocação com valor <= 0 → inválido", () => {
    expect(validarPagamentoV2({ valorBruto: 10, alocacoes: [{ pedido_id: "A", valor: 0 }] }).valido).toBe(false);
  });
  it("alocação MAIOR que o pagamento → soma difere → inválido", () => {
    const r = validarPagamentoV2({ valorBruto: 10, alocacoes: [{ pedido_id: "A", valor: 25 }] });
    expect(r.valido).toBe(false);
    expect(r.erros.join(" ")).toMatch(/soma das aloca/i);
  });
  it("soma das alocações diferente do pagamento → inválido", () => {
    expect(validarPagamentoV2({ valorBruto: 30, alocacoes: [{ pedido_id: "A", valor: 20 }, { pedido_id: "B", valor: 9 }] }).valido).toBe(false);
  });
  it("consistência do CLIENTE para pagamento parcial: só valida soma==bruto (NÃO decide 'pago')", () => {
    // A validação do cliente confirma apenas a consistência interna (soma == bruto).
    // Quem calcula saldo, decide parcial × quitado e marca status_pagamento='pago'
    // é o SERVIDOR (RPC), com base em pagamento_alocacoes + pagamento_transacoes.
    // Este teste NÃO afirma que o pedido foi quitado.
    const r = validarPagamentoV2({ valorBruto: 15, alocacoes: [{ pedido_id: "A", valor: 15 }] });
    expect(r.valido).toBe(true);
    expect(r).not.toHaveProperty("pedidoPago"); // o cliente não decide quitação
  });
});

describe("mensagemErroPagamentoV2", () => {
  it("mapeia códigos do servidor sem vazar detalhe técnico", () => {
    expect(mensagemErroPagamentoV2("PAYMENT_V2_CROSS_TENANT: ...")).toMatch(/não permitida/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_PEDIDO_CANCELADO: ...")).toMatch(/cancelado/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_SOMA_INVALIDA: ...")).toMatch(/não confere/i);
  });
  it("cobre os NOVOS códigos (autorização, caixa, forma, saldo)", () => {
    expect(mensagemErroPagamentoV2("PAYMENT_V2_FORBIDDEN: x")).toMatch(/permissão/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_CAIXA_FECHADO: x")).toMatch(/caixa não está aberto/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_CAIXA_CROSS_TENANT: x")).toMatch(/outra empresa/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_FORMA_INATIVA: x")).toMatch(/inativa/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_FORMA_CROSS_TENANT: x")).toMatch(/outra empresa/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_PEDIDO_JA_PAGO: x")).toMatch(/quitado/i);
    expect(mensagemErroPagamentoV2("PAYMENT_V2_EXCEDE_SALDO: x")).toMatch(/saldo/i);
  });
  it("mensagem genérica para código desconhecido", () => {
    expect(mensagemErroPagamentoV2("algo inesperado")).toMatch(/não foi possível/i);
  });
});

describe("registrarPagamentoV2 (fiação da RPC — mock)", () => {
  it("mesma idempotency_key → repassa a mesma key ao servidor (idempotência)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, idempotente: true, id: "t1" }, error: null });
    const supa = { rpc };
    const key = novaIdempotencyKey();
    const base = { idempotencyKey: key, valorBruto: 10, alocacoes: [{ pedido_id: "A", valor: 10 }] };
    await registrarPagamentoV2(supa, base);
    await registrarPagamentoV2(supa, base);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe(key);
    expect(rpc.mock.calls[1][1].p_idempotency_key).toBe(key);
  });
  it("validação local bloqueia antes de chamar o servidor", async () => {
    const rpc = vi.fn();
    await expect(registrarPagamentoV2({ rpc }, { valorBruto: 10, alocacoes: [{ pedido_id: "A", valor: 5 }] }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("função ausente no banco → código MIGRACAO_PENDENTE", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42883", message: "function app_registrar_pagamento_v2 does not exist" } });
    await expect(registrarPagamentoV2({ rpc }, { valorBruto: 10, alocacoes: [{ pedido_id: "A", valor: 10 }] }))
      .rejects.toMatchObject({ code: "MIGRACAO_PENDENTE" });
  });
});
