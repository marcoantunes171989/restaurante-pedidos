import { orderTotal } from "../../pages/pdv/pdvHelpers.js";

export const PETROLEO = "#012E46";
export const LARANJA = "#F38525";
export const VERDE = "#5E8C31";
export const CINZA = "#9CA3AF";
export const VERMELHO = "#C81E4A";

export function intervaloPeriodo(periodo, ini, fim) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 59, 999);
  switch (periodo) {
    case "hoje":
      return [hoje, fimHoje];
    case "ontem": {
      const o = new Date(hoje);
      o.setDate(o.getDate() - 1);
      const of = new Date(o);
      of.setHours(23, 59, 59, 999);
      return [o, of];
    }
    case "7": {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 6);
      return [d, fimHoje];
    }
    case "15": {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 14);
      return [d, fimHoje];
    }
    case "30": {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 29);
      return [d, fimHoje];
    }
    case "periodo": {
      const a = ini ? new Date(`${ini}T00:00:00`) : new Date(0);
      const b = fim ? new Date(`${fim}T23:59:59`) : fimHoje;
      return [a, b];
    }
    default:
      return [new Date(0), fimHoje];
  }
}

export function filtrarPedidosPorPeriodo(orders, periodo, ini, fim) {
  if (periodo === "tudo") return orders || [];
  const [a, b] = intervaloPeriodo(periodo, ini, fim);
  return (orders || []).filter((o) => {
    if (!o.createdAtISO) return true;
    const d = new Date(o.createdAtISO);
    return d >= a && d <= b;
  });
}

function horaDe(o) {
  return o.createdAtISO ? new Date(o.createdAtISO).getHours() : (o.hour ?? null);
}

/** Valor de pedido com taxa de serviço padrão (10%), alinhado ao dashboard legado. */
export function valorPedidoComTaxa(o) {
  return orderTotal(o) * 1.1;
}

export function analisarVendas(orders, products = []) {
  const validos = (orders || []).filter((o) => o.status !== "cancelled");
  const pagos = validos.filter((o) => o.paymentStatus === "paid");
  const faturamento = pagos.reduce((s, o) => s + valorPedidoComTaxa(o), 0);
  const emAberto = validos
    .filter((o) => o.paymentStatus !== "paid")
    .reduce((s, o) => s + valorPedidoComTaxa(o), 0);
  const ticket = pagos.length ? faturamento / pagos.length : 0;

  const porProduto = {};
  pagos.forEach((o) => (o.items || []).forEach((it) => {
    if (!porProduto[it.name]) porProduto[it.name] = { nome: it.name, qtd: 0, valor: 0 };
    porProduto[it.name].qtd += it.quantity;
    porProduto[it.name].valor += (Number(it.price) || 0) * (Number(it.quantity) || 0);
  }));
  const topProdutos = Object.values(porProduto).sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  const catDe = {};
  (products || []).forEach((p) => { catDe[p.name] = p.category; });
  const porCategoria = {};
  pagos.forEach((o) => (o.items || []).forEach((it) => {
    const cat = catDe[it.name] || "Outros";
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, valor: 0, qtd: 0 };
    porCategoria[cat].valor += (Number(it.price) || 0) * (Number(it.quantity) || 0);
    porCategoria[cat].qtd += it.quantity;
  }));
  const categorias = Object.values(porCategoria).sort((a, b) => b.valor - a.valor);

  return {
    pagos,
    faturamento,
    emAberto,
    ticket,
    topProdutos,
    categorias,
    totalPedidos: validos.length,
  };
}

export function filtrarOperacional(orders, { turno = "todos", canal = "todos", statusF = "todos" } = {}) {
  return (orders || []).filter((o) => {
    const h = horaDe(o);
    if (turno === "almoco" && !(h != null && h >= 11 && h <= 16)) return false;
    if (turno === "jantar" && !(h != null && h >= 18 && h <= 23)) return false;
    if (statusF === "pago" && !(o.paymentStatus === "paid" && o.status !== "cancelled")) return false;
    if (statusF === "aberto" && !(o.paymentStatus !== "paid" && o.status !== "cancelled")) return false;
    if (statusF === "cancelado" && o.status !== "cancelled") return false;
    if (canal === "mesa_qr" && !o.command) return false;
    if (canal === "balcao_delivery" && o.command) return false;
    return true;
  });
}

export function vendasPorHora(pagos) {
  const horas24 = Array.from({ length: 24 }, (_, h) => ({
    h,
    label: `${String(h).padStart(2, "0")}h`,
    valor: 0,
    qtd: 0,
  }));
  (pagos || []).forEach((o) => {
    const h = horaDe(o);
    if (h != null) {
      horas24[h].valor += valorPedidoComTaxa(o);
      horas24[h].qtd += 1;
    }
  });
  const sequencia = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1].map((h) => horas24[h]);
  const melhor = sequencia.reduce((b, d) => (d.valor > b.valor ? d : b), { valor: -1, label: "—", qtd: 0 });
  return { sequencia, melhor };
}

export function faturamentoPorCanal(pagos) {
  let mesa = 0;
  let balcao = 0;
  (pagos || []).forEach((o) => {
    const v = valorPedidoComTaxa(o);
    if (o.command) mesa += v;
    else balcao += v;
  });
  return [
    { label: "Mesa / QR Code", valor: mesa, cor: PETROLEO },
    { label: "Balcão / Delivery", valor: balcao, cor: LARANJA },
  ].filter((d) => d.valor > 0);
}

export function statusPedidos(orders) {
  const list = orders || [];
  const pagos = list.filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled").length;
  const abertos = list.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled").length;
  const cancelados = list.filter((o) => o.status === "cancelled").length;
  return [
    { label: "Pago", valor: pagos, cor: VERDE },
    { label: "Em aberto", valor: abertos, cor: LARANJA },
    { label: "Cancelado", valor: cancelados, cor: VERMELHO },
  ].filter((d) => d.valor > 0);
}

export function serieDiaria(pagos, periodo, ini, fim) {
  const map = new Map();
  (pagos || []).forEach((o) => {
    if (!o.createdAtISO) return;
    const d = new Date(o.createdAtISO);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = map.get(key) || { data: key, valor: 0, qtd: 0 };
    cur.valor += valorPedidoComTaxa(o);
    cur.qtd += 1;
    map.set(key, cur);
  });

  if (periodo === "hoje" || periodo === "ontem") {
    const [a] = intervaloPeriodo(periodo, ini, fim);
    const key = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-${String(a.getDate()).padStart(2, "0")}`;
    const pontos = Array.from({ length: 24 }, (_, h) => {
      const valor = (pagos || [])
        .filter((o) => o.createdAtISO && new Date(o.createdAtISO).getHours() === h)
        .reduce((s, o) => s + valorPedidoComTaxa(o), 0);
      return { label: `${String(h).padStart(2, "0")}h`, valor, key: `${key}-${h}` };
    }).filter((_, h) => h >= 10 || h <= 1);
    return pontos.length ? pontos : [{ label: "—", valor: 0 }];
  }

  const ordered = [...map.values()].sort((a, b) => a.data.localeCompare(b.data));
  if (ordered.length === 0) return [{ label: "—", valor: 0 }];
  return ordered.map((p) => ({
    label: p.data.slice(5).split("-").reverse().join("/"),
    valor: p.valor,
    key: p.data,
  }));
}

export function comparativoPeriodo(orders, products, periodo, ini, fim) {
  if (periodo === "tudo") return null;
  const [a0, b0] = intervaloPeriodo(periodo, ini, fim);
  if (!a0 || a0.getTime() <= 0) return null;
  const dur = b0.getTime() - a0.getTime();
  const atuais = filtrarPedidosPorPeriodo(orders, periodo, ini, fim);
  const anteriores = (orders || []).filter((o) => {
    if (!o.createdAtISO) return false;
    const d = new Date(o.createdAtISO);
    return d >= new Date(a0.getTime() - dur - 1) && d <= new Date(a0.getTime() - 1);
  });
  if (anteriores.length === 0) return null;
  const at = analisarVendas(atuais, products);
  const an = analisarVendas(anteriores, products);
  const varPct = (atual, ant) => (ant > 0 ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : null));
  const serieAtual = serieDiaria(at.pagos, periodo, ini, fim);
  const serieAnt = serieDiaria(an.pagos, periodo === "periodo" ? "tudo" : periodo, ini, fim);
  return {
    faturamento: varPct(at.faturamento, an.faturamento),
    pedidos: varPct(at.totalPedidos, an.totalPedidos),
    ticket: varPct(at.ticket, an.ticket),
    serieAtual,
    serieAnterior: serieAnt,
    anterior: an,
  };
}

export function mesasAbertasAgora(orders) {
  const abertos = (orders || []).filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled" && o.table);
  const porMesa = new Set(abertos.map((o) => o.table));
  return porMesa.size;
}

export function clientesNoPeriodo(orders) {
  return new Set((orders || []).map((o) => o.clienteTelefone).filter(Boolean)).size;
}

export function sparklineValores(serie) {
  return (serie || []).map((p) => Number(p.valor) || 0);
}

export function insightsGestao({ produtoTop, melhorHora, semEstoque, abertos, ticket }) {
  const meta = 45;
  return [
    produtoTop ? { tipo: "destaque", texto: `Destaque do dia: ${produtoTop.nome}` } : null,
    melhorHora?.valor > 0
      ? { tipo: "horario", texto: `Melhor horário: ${melhorHora.label}` }
      : null,
    semEstoque === 0
      ? { tipo: "estoque", texto: "Estoque: todos os produtos com estoque adequado" }
      : { tipo: "estoque", texto: `Estoque: ${semEstoque} produto(s) abaixo do mínimo` },
    ticket < meta
      ? { tipo: "oportunidade", texto: "Oportunidade: elevar ticket médio com combos e sobremesas" }
      : { tipo: "oportunidade", texto: "Oportunidade: estimular vendas nos horários de menor movimento" },
    abertos > 0
      ? { tipo: "alerta", texto: `${abertos} comanda(s) em aberto — priorizar fechamento` }
      : null,
  ].filter(Boolean);
}
