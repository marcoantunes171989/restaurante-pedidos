import { describe, it, expect } from "vitest";
import {
  paraCentavos, deCentavos, ratearCentavos, vincularProduto,
  mapearPagamentos, montarVendaFiscal, composicaoDaConta,
} from "./vendaFiscal.js";

describe("composicaoDaConta (o que o caixa envia à baixa)", () => {
  it("guarda cada parte em reais e o total igual ao cobrado no PDV", () => {
    const c = composicaoDaConta({ subtotal: 44, taxaServico: 4.4, acrescimo: 1, descontoManual: 2, descontoCupom: 3 });
    expect(c).toEqual({ subtotal: 44, taxaServico: 4.4, acrescimo: 1, descontoManual: 2, descontoCupom: 3, total: 44.4 });
  });
  it("ignora negativos/lixo e nunca fica abaixo de zero", () => {
    expect(composicaoDaConta({ subtotal: 10, descontoManual: 50, acrescimo: -5, taxaServico: "x" }).total).toBe(0);
  });
  it("é aceita direto como `ajustes` do rascunho fiscal", () => {
    const c = composicaoDaConta({ subtotal: 30, descontoCupom: 3 });
    const v = montarVendaFiscal({
      pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }] }],
      produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }],
      ctxFiscal: { lojaFiscalRegras: [{ id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102" }] },
      formas: [{ id: 2, nome: "PIX", tipo: "pix" }], mapaMeios: { pix: "COD_PIX" },
      ajustes: c, pagamento: { total: c.total, troco: 0, detalhes: [{ forma: "PIX", valor: c.total }] },
    });
    expect(v.apto).toBe(true);
    expect(v.totais).toMatchObject({ vProd: 30, vDesc: 3, vNF: 27 });
  });
});

// Mapa de formas → meio de pagamento fiscal. Os CÓDIGOS são fixture de teste:
// a tabela real vem da configuração da loja (fonte: Informe Técnico ENCAT).
const MAPA = { dinheiro: "COD_DIN", pix: "COD_PIX", cartao_credito: "COD_CC", cartao_debito: "COD_CD" };
const FORMAS = [
  { id: 1, nome: "Dinheiro", tipo: "dinheiro", lojaId: 7 },
  { id: 2, nome: "PIX", tipo: "pix", lojaId: 7 },
  { id: 3, nome: "Crédito", tipo: "cartao_credito", lojaId: 7 },
];
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const PRODUTOS = [
  { id: 10, name: "X-Burger", price: 30, lojaId: 7, lojaFiscalRegraId: 50 },
  { id: 11, name: "Refrigerante Lata", price: 7, lojaId: 7, lojaFiscalRegraId: 50 },
  { id: 12, name: "Batata", price: 13, lojaId: 7, lojaFiscalRegraId: 50 },
];
const CTX = { lojaFiscalRegras: [REGRA] };

function pedido(id, itens, extra = {}) {
  return { id, lojaId: 7, status: "delivered", command: "BUR-000001", items: itens, ...extra };
}

describe("centavos", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos("12,35")).toBe(1235);
    expect(deCentavos(1235)).toBe(12.35);
  });
});

describe("ratearCentavos", () => {
  it("distribui proporcionalmente e fecha a soma exata", () => {
    const r = ratearCentavos(100, [3000, 700, 1300]); // R$ 1,00 sobre 30/7/13
    expect(r.reduce((s, x) => s + x, 0)).toBe(100);
    expect(r).toEqual([60, 14, 26]);
  });
  it("sobra de arredondamento vai para o maior item", () => {
    const r = ratearCentavos(10, [100, 100, 100]);
    expect(r.reduce((s, x) => s + x, 0)).toBe(10);
    expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1);
  });
  it("zero ou bases vazias", () => {
    expect(ratearCentavos(0, [100, 200])).toEqual([0, 0]);
    expect(ratearCentavos(50, [0, 0])).toEqual([50, 0]);
  });
});

describe("vincularProduto", () => {
  it("prefere o id do produto gravado no item", () => {
    const r = vincularProduto({ produtoId: 11, name: "Nome Antigo" }, PRODUTOS, 7);
    expect(r.produto.id).toBe(11);
    expect(r.via).toBe("id");
  });
  it("sem id, casa pelo nome normalizado (acento/caixa/espaço)", () => {
    const r = vincularProduto({ name: "  x-burger " }, PRODUTOS, 7);
    expect(r.produto.id).toBe(10);
    expect(r.via).toBe("nome");
  });
  it("não casa produto de outra loja", () => {
    const outros = [{ id: 99, name: "X-Burger", lojaId: 8 }];
    expect(vincularProduto({ name: "X-Burger" }, outros, 7).produto).toBeNull();
  });
  it("nome ambíguo não escolhe sozinho", () => {
    const dup = [...PRODUTOS, { id: 13, name: "Batata", lojaId: 7 }];
    const r = vincularProduto({ name: "Batata" }, dup, 7);
    expect(r.produto).toBeNull();
    expect(r.via).toBe("ambiguo");
  });
});

describe("mapearPagamentos", () => {
  it("resolve pelo tipo da forma cadastrada", () => {
    const r = mapearPagamentos([{ forma: "PIX", valor: 20 }], FORMAS, MAPA);
    expect(r.pagamentos[0]).toMatchObject({ meio: "COD_PIX", valorCentavos: 2000, forma: "PIX" });
    expect(r.pendencias).toEqual([]);
  });
  it("forma sem código vira pendência (não inventa código)", () => {
    const r = mapearPagamentos([{ forma: "Vale Refeição", valor: 10 }], FORMAS, MAPA);
    expect(r.pagamentos[0].meio).toBeNull();
    expect(r.pendencias[0]).toMatch(/Vale Refeição/);
  });
  it("pagamento com pontos exige regra definida", () => {
    const r = mapearPagamentos([{ forma: "Pontos", valor: 5 }], FORMAS, MAPA);
    expect(r.pendencias[0]).toMatch(/pontos/i);
  });
});

describe("montarVendaFiscal", () => {
  const base = {
    pedidos: [pedido("P1", [{ name: "X-Burger", price: 30, quantity: 1 }, { name: "Refrigerante Lata", price: 7, quantity: 2 }])],
    produtos: PRODUTOS, formas: FORMAS, mapaMeios: MAPA, ctxFiscal: CTX,
  };

  it("venda simples apta: itens, totais e pagamento batem", () => {
    const v = montarVendaFiscal({ ...base, pagamento: { total: 44, troco: 6, detalhes: [{ forma: "Dinheiro", valor: 50 }] } });
    expect(v.apto).toBe(true);
    expect(v.lojaId).toBe(7);
    expect(v.itens).toHaveLength(2);
    expect(v.itens[1]).toMatchObject({ produtoId: 11, quantidade: 2, valorUnitario: 7, valorBruto: 14 });
    expect(v.itens[0].fiscal.ncm).toBe("21069090");
    expect(v.totais).toMatchObject({ vProd: 44, vDesc: 0, vOutro: 0, vNF: 44, vPag: 50, vTroco: 6 });
  });

  it("desconto é rateado por item e a soma fecha", () => {
    const v = montarVendaFiscal({ ...base, ajustes: { desconto: 4.4 }, pagamento: { total: 39.6, troco: 0, detalhes: [{ forma: "PIX", valor: 39.6 }] } });
    const soma = v.itens.reduce((s, it) => s + paraCentavos(it.vDesc), 0);
    expect(soma).toBe(440);
    expect(v.totais.vNF).toBe(39.6);
    expect(v.apto).toBe(true);
  });

  it("taxa de serviço sem regra definida bloqueia (decisão do contador)", () => {
    const v = montarVendaFiscal({ ...base, ajustes: { taxaServico: 4.4 }, pagamento: { total: 48.4, troco: 0, detalhes: [{ forma: "PIX", valor: 48.4 }] } });
    expect(v.apto).toBe(false);
    expect(v.pendencias.join(" ")).toMatch(/taxa de serviço/i);
  });

  it("taxa de serviço como outras despesas entra no vOutro rateado", () => {
    const v = montarVendaFiscal({ ...base, ajustes: { taxaServico: 4.4 }, regras: { taxaServico: "outras_despesas" }, pagamento: { total: 48.4, troco: 0, detalhes: [{ forma: "PIX", valor: 48.4 }] } });
    expect(v.apto).toBe(true);
    expect(v.totais.vOutro).toBe(4.4);
    expect(v.totais.vNF).toBe(48.4);
  });

  it("taxa de serviço fora da nota: vNF sem a taxa e pagamento coerente", () => {
    const v = montarVendaFiscal({ ...base, ajustes: { taxaServico: 4.4 }, regras: { taxaServico: "fora_da_nota" }, pagamento: { total: 48.4, troco: 0, detalhes: [{ forma: "PIX", valor: 48.4 }] } });
    expect(v.totais.vNF).toBe(44);
    expect(v.totais.vPag).toBe(44);
    expect(v.apto).toBe(true);
  });

  it("total pago diferente da composição vira pendência com a diferença", () => {
    const v = montarVendaFiscal({ ...base, pagamento: { total: 40, troco: 0, detalhes: [{ forma: "PIX", valor: 40 }] } });
    expect(v.apto).toBe(false);
    expect(v.pendencias.join(" ")).toMatch(/4,00/);
  });

  it("troco informado precisa ser pago − valor da nota", () => {
    const v = montarVendaFiscal({ ...base, pagamento: { total: 44, troco: 10, detalhes: [{ forma: "Dinheiro", valor: 50 }] } });
    expect(v.apto).toBe(false);
    expect(v.pendencias.join(" ")).toMatch(/troco/i);
  });

  it("item sem produto cadastrado ou sem regra fiscal bloqueia", () => {
    const v = montarVendaFiscal({ ...base, pedidos: [pedido("P1", [{ name: "Item Avulso", price: 10, quantity: 1 }])], pagamento: { total: 10, troco: 0, detalhes: [{ forma: "PIX", valor: 10 }] } });
    expect(v.apto).toBe(false);
    expect(v.itens[0].pendencias.join(" ")).toMatch(/produto/i);
  });

  it("ignora pedidos cancelados e junta várias comandas da mesa", () => {
    const pedidos = [
      pedido("P1", [{ name: "X-Burger", price: 30, quantity: 1 }]),
      pedido("P2", [{ name: "Batata", price: 13, quantity: 1 }], { command: "BUR-000002" }),
      pedido("P3", [{ name: "X-Burger", price: 30, quantity: 5 }], { status: "cancelled" }),
    ];
    const v = montarVendaFiscal({ ...base, pedidos, pagamento: { total: 43, troco: 0, detalhes: [{ forma: "Crédito", valor: 43 }] } });
    expect(v.pedidosIds).toEqual(["P1", "P2"]);
    expect(v.totais.vNF).toBe(43);
    expect(v.apto).toBe(true);
  });

  it("recusa misturar lojas", () => {
    const pedidos = [pedido("P1", [{ name: "X-Burger", price: 30, quantity: 1 }]), { ...pedido("P9", []), lojaId: 8 }];
    const v = montarVendaFiscal({ ...base, pedidos, pagamento: { total: 30, troco: 0, detalhes: [{ forma: "PIX", valor: 30 }] } });
    expect(v.apto).toBe(false);
    expect(v.erro).toMatch(/loja/i);
  });

  it("venda vazia não é apta", () => {
    const v = montarVendaFiscal({ ...base, pedidos: [], pagamento: { total: 0, detalhes: [] } });
    expect(v.apto).toBe(false);
  });
});

import { refazerFiscalDaVenda } from "./vendaFiscal.js";
describe("U2 — refazerFiscalDaVenda", () => {
  const venda = { apto: true, pendencias: [], pedidosIds: ["P1"], totais: { vNF: 30 },
    itens: [{ seq: 1, produtoId: 10, nome: "X-Burger", quantidade: 1, valorBruto: 30, fiscal: { ncm: "00000000" }, pendencias: [] }] };
  it("troca só a parte fiscal pelo cadastro atual; valores iguais", () => {
    const r = refazerFiscalDaVenda(venda, [{ id: 10, name: "X-Burger", lojaFiscalRegraId: 50 }], { lojaFiscalRegras: [{ id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" }] });
    expect(r.apto).toBe(true);
    expect(r.itens[0].fiscal.ncm).toBe("21069090");
    expect({ ...r.itens[0], fiscal: null, pendencias: null }).toEqual({ ...venda.itens[0], fiscal: null, pendencias: null });
    expect(r.totais).toEqual(venda.totais);
  });
  it("produto ainda sem regra → não fica apto", () => {
    const r = refazerFiscalDaVenda(venda, [{ id: 10, name: "X-Burger" }], { lojaFiscalRegras: [] });
    expect(r.apto).toBe(false);
    expect(r.itens[0].pendencias.length).toBeGreaterThan(0);
  });
});
