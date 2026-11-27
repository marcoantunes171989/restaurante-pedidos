import { describe, expect, it } from "vitest";
import {
  abaixoDoMinimo,
  agruparVisitas,
  canalDoPedido,
  concentracao,
  distribuicaoPorValor,
  intervaloAnterior,
  intervaloPeriodo,
  mapaCalor,
  mediana,
  paresDeProdutos,
  percentil,
  porCategoria,
  porMesa,
  rankingProdutos,
  resumoCurvaAbc,
  resumoDiario,
  resumoVendas,
  serieTemporal,
  situacaoEstoque,
  totalPedido,
  variacaoPct,
} from "./analiseVendas.js";

// Datas sempre construídas no horário local, para o teste não depender do fuso.
const em = (dia, hora = 12, min = 0) => new Date(2026, 10, dia, hora, min).toISOString();
const AGORA = new Date(2026, 10, 26, 20, 0);

const produtos = [
  { name: "Burger", category: "Lanches", cost: 12 },
  { name: "Suco", category: "Bebidas", cost: null },
  { name: "Batata", category: "Porções", cost: 4 },
];

const pedido = (extra) => ({
  id: Math.random(),
  status: "delivered",
  paymentStatus: "paid",
  table: "Mesa 01",
  command: "C1",
  createdAtISO: em(26),
  updatedAtISO: em(26, 13),
  items: [{ name: "Burger", price: 30, quantity: 1 }],
  ...extra,
});

describe("totalPedido", () => {
  it("cobra 10% no salão e não cobra em retirada ou entrega externa", () => {
    expect(totalPedido(pedido({}))).toBeCloseTo(33);
    expect(totalPedido(pedido({ table: "Externo · Entrega" }))).toBeCloseTo(30);
    expect(totalPedido(pedido({ table: "Externo · Retirada" }))).toBeCloseTo(30);
    expect(totalPedido(pedido({ table: "Externo · Consumo no local" }))).toBeCloseTo(33);
  });
});

describe("canalDoPedido", () => {
  it("pedido externo com comanda não conta como mesa", () => {
    expect(canalDoPedido({ table: "Externo · Entrega", command: "EXT-1" })).toBe("Externo / Delivery");
    expect(canalDoPedido({ table: "Mesa 02", command: "C2" })).toBe("Mesa / QR Code");
    expect(canalDoPedido({ table: "Balcão" })).toBe("Balcão");
    expect(canalDoPedido({})).toBe("Balcão");
  });
});

describe("estatísticas", () => {
  it("mediana e percentil com interpolação", () => {
    expect(mediana([1, 3, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(percentil([10, 20, 30, 40, 50], 90)).toBeCloseTo(46);
    expect(mediana([])).toBeNull();
  });

  it("variação sem base de comparação é nula", () => {
    expect(variacaoPct(150, 100)).toBeCloseTo(50);
    expect(variacaoPct(80, 100)).toBeCloseTo(-20);
    expect(variacaoPct(80, 0)).toBeNull();
    expect(variacaoPct(80, undefined)).toBeNull();
  });
});

describe("períodos", () => {
  it("o período anterior tem o mesmo número de dias e não sobrepõe o atual", () => {
    const [a] = intervaloPeriodo("7", "", "", AGORA);
    const [pa, pb] = intervaloAnterior("7", "", "", AGORA);
    expect(a.getDate()).toBe(20);
    expect(pa.getDate()).toBe(13);
    expect(pb.getDate()).toBe(19);
    expect(pb.getTime()).toBeLessThan(a.getTime());
  });

  it("'tudo' e período sem data inicial não têm comparação", () => {
    expect(intervaloAnterior("tudo", "", "", AGORA)).toBeNull();
    expect(intervaloAnterior("periodo", "", "2026-11-20", AGORA)).toBeNull();
  });
});

describe("resumoVendas", () => {
  const orders = [
    pedido({ items: [{ name: "Burger", price: 30, quantity: 2 }, { name: "Suco", price: 10, quantity: 1 }] }),
    pedido({ table: "Externo · Entrega", command: "EXT-1", items: [{ name: "Batata", price: 20, quantity: 1 }] }),
    pedido({ paymentStatus: "open" }),
    pedido({ paymentStatus: "requested" }),
    pedido({ status: "cancelled" }),
  ];
  const r = resumoVendas(orders, produtos);

  it("separa pagos, em aberto, aguardando e cancelados", () => {
    expect(r.qtdPagos).toBe(2);
    expect(r.totalPedidos).toBe(4);
    expect(r.emAberto.qtd).toBe(1);
    expect(r.aguardando.qtd).toBe(1);
    expect(r.cancelados.qtd).toBe(1);
    expect(r.faturamento).toBeCloseTo(70 * 1.1 + 20);
    expect(r.taxa).toBeCloseTo(7);
    expect(r.itens).toBe(4);
    expect(r.itensPorPedido).toBe(2);
  });

  it("margem considera só itens com custo e informa a cobertura", () => {
    // Burger 60 − 24 + Batata 20 − 4 = 52 sobre 80 de receita com custo, de 90 vendidos.
    expect(r.margem).toBeCloseTo(52);
    expect(r.margemPct).toBeCloseTo(65);
    expect(r.cobertura).toBeCloseTo((80 / 90) * 100);
  });

  it("sem venda, ticket e margem são nulos", () => {
    const vazio = resumoVendas([], produtos);
    expect(vazio.ticket).toBeNull();
    expect(vazio.margem).toBeNull();
    expect(vazio.faturamento).toBe(0);
  });
});

describe("serieTemporal", () => {
  const orders = [
    pedido({ createdAtISO: em(26, 22, 30) }),
    pedido({ createdAtISO: em(24, 12) }),
    pedido({ createdAtISO: em(17, 12) }),
  ];

  it("preenche dias sem venda e alinha o período anterior", () => {
    const s = serieTemporal({ orders, periodo: "7", agora: new Date(2026, 10, 26, 23, 0) });
    expect(s.granularidade).toBe("dia");
    expect(s.pontos).toHaveLength(7);
    expect(s.pontos.map((p) => p.valor > 0)).toEqual([false, false, false, false, true, false, true]);
    // 17/11 é a 5ª posição do período anterior (13 a 19).
    expect(s.pontos[4].anterior).toBeCloseTo(33);
  });

  it("agrupa pelo dia local, mesmo perto da meia-noite", () => {
    const s = serieTemporal({ orders, periodo: "7", agora: new Date(2026, 10, 26, 23, 0) });
    expect(s.pontos[6].rotulo).toBe("26/11");
    expect(s.pontos[6].valor).toBeCloseTo(33);
  });

  it("um dia vira série por hora", () => {
    const s = serieTemporal({ orders, periodo: "hoje", agora: new Date(2026, 10, 26, 23, 0) });
    expect(s.granularidade).toBe("hora");
    expect(s.pontos.map((p) => p.rotulo)).toEqual(["22h"]);
    expect(s.temAnterior).toBe(false);
  });

  it("períodos longos viram série mensal sem comparação", () => {
    const longos = [...orders, pedido({ createdAtISO: new Date(2026, 7, 3, 12).toISOString() })];
    const s = serieTemporal({ orders: longos, periodo: "tudo", agora: AGORA });
    expect(s.granularidade).toBe("mes");
    expect(s.pontos.map((p) => p.rotulo)).toEqual(["ago/26", "set/26", "out/26", "nov/26"]);
    expect(s.temAnterior).toBe(false);
  });

  it("sem venda devolve série vazia", () => {
    expect(serieTemporal({ orders: [], periodo: "7", agora: AGORA }).pontos).toEqual([]);
  });

  it("resumo diário usa todos os dias do período na média", () => {
    const s = serieTemporal({ orders, periodo: "7", agora: new Date(2026, 10, 26, 23, 0) });
    const d = resumoDiario(s);
    expect(d.diasComVenda).toBe(2);
    expect(d.dias).toBe(7);
    expect(d.mediaDiaria).toBeCloseTo(66 / 7);
  });
});

describe("mapaCalor", () => {
  it("cruza dia da semana e hora, incluindo a madrugada no fim", () => {
    // 26/11/2026 é quinta-feira; 28/11, sábado.
    const m = mapaCalor([pedido({ createdAtISO: em(26, 23) }), pedido({ createdAtISO: em(28, 1) }), pedido({ createdAtISO: em(26, 23, 20) })]);
    expect(m.horas).toEqual(["23h", "00h", "01h"]);
    expect(m.celulas[3][0].qtd).toBe(2);
    expect(m.celulas[3][0].valor).toBeCloseTo(66);
    expect(m.melhor.dia).toBe("Qui");
    expect(m.melhor.hora).toBe("23h");
  });

  it("sem pedidos não há horas nem melhor célula", () => {
    const m = mapaCalor([]);
    expect(m.horas).toEqual([]);
    expect(m.melhor).toBeNull();
  });
});

describe("produtos e categorias", () => {
  const pagos = [
    pedido({ items: [{ name: "Burger", price: 80, quantity: 1 }, { name: "Suco", price: 15, quantity: 1 }] }),
    pedido({ items: [{ name: "Burger", price: 0, quantity: 1 }, { name: "Suco", price: 0, quantity: 1 }, { name: "Batata", price: 5, quantity: 1 }] }),
  ];

  it("ordena por faturamento e classifica a curva ABC", () => {
    const r = rankingProdutos(pagos, produtos);
    expect(r.map((p) => p.nome)).toEqual(["Burger", "Suco", "Batata"]);
    expect(r.map((p) => p.classe)).toEqual(["A", "B", "C"]);
    expect(r[1].margem).toBeNull();
    expect(resumoCurvaAbc(r).map((c) => c.produtos)).toEqual([1, 1, 1]);
  });

  it("variação por categoria só quando há base anterior", () => {
    const antes = [pedido({ items: [{ name: "Burger", price: 40, quantity: 1 }] })];
    const c = porCategoria(pagos, produtos, antes);
    expect(c.find((x) => x.rotulo === "Lanches").variacao).toBeCloseTo(100);
    expect(c.find((x) => x.rotulo === "Bebidas").variacao).toBeNull();
  });

  it("lista pares repetidos", () => {
    expect(paresDeProdutos(pagos)).toEqual([{ rotulo: "Burger + Suco", qtd: 2 }]);
  });

  it("mesas ignoram pedidos externos", () => {
    const m = porMesa([...pagos, pedido({ table: "Externo · Entrega", command: "EXT-9" })]);
    expect(m).toHaveLength(1);
    expect(m[0].rotulo).toBe("Mesa 01");
  });

  it("distribui valores por faixa", () => {
    const d = distribuicaoPorValor([10, 30, 31, 500]);
    expect(d.map((f) => f.qtd)).toEqual([2, 1, 0, 0, 1]);
  });
});

describe("agruparVisitas", () => {
  it("comanda reutilizada depois do pagamento abre nova visita", () => {
    const v = agruparVisitas([
      pedido({ createdAtISO: em(25, 12), updatedAtISO: em(25, 13) }),
      pedido({ createdAtISO: em(25, 12, 20), updatedAtISO: em(25, 13) }),
      pedido({ createdAtISO: em(26, 12), updatedAtISO: em(26, 12, 30) }),
    ]);
    expect(v.map((x) => x.minutos)).toEqual([60, 30]);
    expect(v[0].pedidos).toHaveLength(2);
  });

  it("pedidos sem comanda não são misturados", () => {
    const v = agruparVisitas([
      pedido({ id: 1, command: "", createdAtISO: em(26, 10), updatedAtISO: em(26, 11) }),
      pedido({ id: 2, command: "", createdAtISO: em(26, 10, 30), updatedAtISO: em(26, 10, 40) }),
    ]);
    expect(v).toHaveLength(2);
  });

  it("ignora pedidos não pagos ou cancelados", () => {
    expect(agruparVisitas([pedido({ paymentStatus: "open" }), pedido({ status: "cancelled" })])).toEqual([]);
  });
});

describe("estoque e clientes", () => {
  it("produto sem controle de estoque nunca é crítico", () => {
    expect(situacaoEstoque({ controla: false, estoque: 0, minimo: 0, vendido: 3, dias: 7 })).toBe("semControle");
    expect(situacaoEstoque({ controla: true, estoque: 0, minimo: 0, vendido: 3, dias: 7 })).toBe("critico");
    expect(situacaoEstoque({ controla: true, estoque: 4, minimo: 5, vendido: 3, dias: 7 })).toBe("atencao");
    expect(situacaoEstoque({ controla: true, estoque: 500, minimo: 5, vendido: 7, dias: 7 })).toBe("excesso");
    expect(situacaoEstoque({ controla: true, estoque: 50, minimo: 5, vendido: 0, dias: 7 })).toBe("semMovimento");
    expect(situacaoEstoque({ controla: true, estoque: 50, minimo: 5, vendido: 7, dias: 7 })).toBe("normal");
  });

  it("abaixoDoMinimo não presume mínimo quando não há cadastro", () => {
    expect(abaixoDoMinimo({ controlaEstoque: true, estoque: 3, estoqueMinimo: 0 })).toBe(false);
    expect(abaixoDoMinimo({ controlaEstoque: true, estoque: 3, estoqueMinimo: 3 })).toBe(true);
    expect(abaixoDoMinimo({ controlaEstoque: false, estoque: 0, estoqueMinimo: 3 })).toBe(false);
  });

  it("mede a concentração do faturamento nos maiores clientes", () => {
    const c = concentracao([80, 5, 5, 5, 5]);
    expect(c.clientes).toBe(1);
    expect(c.participacao).toBeCloseTo(80);
    expect(concentracao([])).toBeNull();
  });
});
