import { describe, it, expect } from "vitest";
import { seloFiscalDaConta, previaFiscalAtivaPorEnv } from "./seloFiscal.js";
import { montarVendaFiscal } from "./vendaFiscal.js";

const EMIT_ON = { nfceHabilitada: true, nfeHabilitada: false };
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102" };
const base = {
  emitente: EMIT_ON,
  pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }] }],
  produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }],
  ctxFiscal: { lojaFiscalRegras: [REGRA] },
  formas: [{ id: 2, nome: "PIX", tipo: "pix" }],
  config: { mapaMeios: { pix: "COD_PIX" } },
  composicao: { subtotal: 30, total: 30 },
};

describe("seloFiscalDaConta", () => {
  it("fica oculto quando a loja não habilitou NFC-e nem NF-e (nada muda para quem não usa)", () => {
    expect(seloFiscalDaConta({ ...base, emitente: { nfceHabilitada: false, nfeHabilitada: false } })).toBeNull();
    expect(seloFiscalDaConta({ ...base, emitente: null })).toBeNull();
  });

  it("oculto quando a chave de ativação está desligada (padrão em produção)", () => {
    expect(seloFiscalDaConta({ ...base, ativo: false })).toBeNull();
  });

  it("chave de ativação lê só o valor exato 'true'", () => {
    expect(previaFiscalAtivaPorEnv({ VITE_FISCAL_PREVIA_PDV: "true" })).toBe(true);
    expect(previaFiscalAtivaPorEnv({ VITE_FISCAL_PREVIA_PDV: "1" })).toBe(false);
    expect(previaFiscalAtivaPorEnv({})).toBe(false);
    expect(previaFiscalAtivaPorEnv(undefined)).toBe(false);
  });

  it("oculto sem conta selecionada", () => {
    expect(seloFiscalDaConta({ ...base, pedidos: [] })).toBeNull();
  });

  it("pronta: itens com regra fiscal e forma escolhida com código", () => {
    const s = seloFiscalDaConta({ ...base, pagamentos: [{ forma: "PIX", valor: 30 }] });
    expect(s).toMatchObject({ estado: "pronta", titulo: "Nota fiscal: pronta", pendencias: [] });
  });

  it("antes de lançar o pagamento não acusa falta de pagamento", () => {
    const s = seloFiscalDaConta({ ...base, pagamentos: [] });
    expect(s.estado).toBe("pronta");
  });

  it("forma lançada sem código fiscal aparece como pendência", () => {
    const s = seloFiscalDaConta({ ...base, config: {}, pagamentos: [{ forma: "PIX", valor: 30 }] });
    expect(s.estado).toBe("pendente");
    expect(s.titulo).toBe("Nota fiscal: 1 pendência");
    expect(s.pendencias[0]).toMatch(/PIX/);
  });

  it("junta pendências dos itens, sem repetir, com nome do item", () => {
    const pedidos = [{ id: "P1", lojaId: 7, status: "delivered", items: [
      { name: "Avulso", price: 5, quantity: 1 }, { name: "Avulso", price: 5, quantity: 1 },
    ] }];
    const s = seloFiscalDaConta({ ...base, pedidos, composicao: { subtotal: 10, total: 10 } });
    expect(s.estado).toBe("pendente");
    expect(s.pendencias).toHaveLength(1);
    expect(s.pendencias[0]).toMatch(/Avulso/);
  });

  it("taxa de serviço sem regra vira pendência da conta", () => {
    const s = seloFiscalDaConta({ ...base, composicao: { subtotal: 30, taxaServico: 3, total: 33 } });
    expect(s.pendencias.join(" ")).toMatch(/taxa de serviço/i);
  });

  it("nunca lança erro com dados incompletos", () => {
    expect(() => seloFiscalDaConta({ emitente: EMIT_ON, pedidos: [{ id: "X", items: [{}] }] })).not.toThrow();
  });
});

describe("montarVendaFiscal parcial (prévia antes do pagamento)", () => {
  it("não confere total nem cobertura de pagamento", () => {
    const v = montarVendaFiscal({
      pedidos: base.pedidos, produtos: base.produtos, ctxFiscal: base.ctxFiscal,
      pagamento: { total: 0, detalhes: [] }, parcial: true,
    });
    expect(v.apto).toBe(true);
  });
});
