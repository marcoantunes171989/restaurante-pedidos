/**
 * Cálculos de vendas usados pelo Dashboard e pelos Relatórios.
 *
 * Funções puras sobre os pedidos e produtos já carregados no app: sem
 * consultas, sem estado e sem valores presumidos. Quando falta dado (período
 * anterior vazio, produto sem custo), o resultado é `null` — a tela mostra
 * "—" em vez de inventar um número.
 */
import { cobraTaxaServico } from "../taxaServico.js";
import { ehPedidoExterno } from "../../pages/pdv/pdvHelpers.js";

const DIA_MS = 864e5;

// ── Pedido ────────────────────────────────────────────────────
export function subtotalPedido(o) {
  return (o?.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
}

/** Total cobrado: itens + 10% de serviço, exceto retirada/entrega externa. */
export function totalPedido(o) {
  return subtotalPedido(o) * (cobraTaxaServico(o?.table) ? 1.1 : 1);
}

export function taxaPedido(o) {
  return totalPedido(o) - subtotalPedido(o);
}

export function itensPedido(o) {
  return (o?.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

export function ehCancelado(o) {
  return o?.status === "cancelled";
}

export function ehPago(o) {
  return !ehCancelado(o) && o?.paymentStatus === "paid";
}

export const CANAIS = Object.freeze(["Mesa / QR Code", "Externo / Delivery", "Balcão"]);

export function canalDoPedido(o) {
  if (ehPedidoExterno(o)) return CANAIS[1];
  const mesa = String(o?.table || "").trim();
  if (/^balc[aã]o/i.test(mesa)) return CANAIS[2];
  if (o?.command || mesa) return CANAIS[0];
  return CANAIS[2];
}

// ── Números ───────────────────────────────────────────────────
export function soma(lista) {
  return lista.reduce((s, v) => s + v, 0);
}

export function media(lista) {
  return lista.length ? soma(lista) / lista.length : null;
}

/** Percentil com interpolação linear (p de 0 a 100). */
export function percentil(lista, p) {
  if (!lista.length) return null;
  const ord = [...lista].sort((a, b) => a - b);
  const pos = ((ord.length - 1) * p) / 100;
  const base = Math.floor(pos);
  const resto = pos - base;
  return ord[base + 1] === undefined ? ord[base] : ord[base] + resto * (ord[base + 1] - ord[base]);
}

export function mediana(lista) {
  return percentil(lista, 50);
}

/** Variação percentual; sem base de comparação retorna null (nunca "+100%"). */
export function variacaoPct(atual, anterior) {
  if (atual == null || anterior == null || !(anterior > 0)) return null;
  return ((atual - anterior) / anterior) * 100;
}

// ── Datas e períodos ──────────────────────────────────────────
export function chaveDia(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function somarDias(data, n) {
  const d = new Date(data);
  d.setDate(d.getDate() + n);
  return d;
}

function diasEntre(a, b) {
  return Math.round((inicioDoDia(b) - inicioDoDia(a)) / DIA_MS) + 1;
}

export function intervaloPeriodo(periodo, ini, fim, agora = new Date()) {
  const hoje = inicioDoDia(agora);
  const fimHoje = fimDoDia(agora);
  switch (periodo) {
    case "hoje": return [hoje, fimHoje];
    case "ontem": { const o = somarDias(hoje, -1); return [o, fimDoDia(o)]; }
    case "7": return [somarDias(hoje, -6), fimHoje];
    case "15": return [somarDias(hoje, -14), fimHoje];
    case "30": return [somarDias(hoje, -29), fimHoje];
    case "mes": return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), fimHoje];
    case "periodo": return [
      ini ? new Date(`${ini}T00:00:00`) : new Date(0),
      fim ? new Date(`${fim}T23:59:59.999`) : fimHoje,
    ];
    default: return [new Date(0), fimHoje];
  }
}

/** Intervalo imediatamente anterior, com o mesmo número de dias. */
export function intervaloAnterior(periodo, ini, fim, agora = new Date()) {
  if (periodo === "tudo") return null;
  if (periodo === "periodo" && !ini) return null;
  const [a, b] = intervaloPeriodo(periodo, ini, fim, agora);
  if (b < a) return null;
  const dias = diasEntre(a, b);
  return [somarDias(a, -dias), fimDoDia(somarDias(a, -1))];
}

export function pedidosNoIntervalo(orders, intervalo) {
  if (!intervalo) return [];
  const [a, b] = intervalo;
  return (orders || []).filter((o) => {
    if (!o.createdAtISO) return false;
    const d = new Date(o.createdAtISO);
    return d >= a && d <= b;
  });
}

export function rotuloComparacao(periodo) {
  if (periodo === "hoje") return "ontem (dia inteiro)";
  if (periodo === "ontem") return "anteontem";
  if (periodo === "7" || periodo === "15" || periodo === "30") return `${periodo} dias anteriores`;
  return "período anterior";
}

// ── Resumo ────────────────────────────────────────────────────
export function mapaDeProdutos(products) {
  const mapa = new Map();
  (products || []).forEach((p) => {
    const custo = Number(p.cost);
    mapa.set(p.name, { categoria: p.category || "Outros", custo: custo > 0 ? custo : null });
  });
  return mapa;
}

/**
 * Margem sobre os itens que têm custo cadastrado. `cobertura` informa quanto
 * do subtotal vendido entrou na conta.
 */
export function margemDosPedidos(pagos, mapa) {
  let receita = 0;
  let custo = 0;
  let subtotal = 0;
  pagos.forEach((o) => (o.items || []).forEach((it) => {
    const qtd = Number(it.quantity) || 0;
    const valor = (Number(it.price) || 0) * qtd;
    subtotal += valor;
    const c = mapa.get(it.name)?.custo;
    if (c != null) {
      receita += valor;
      custo += c * qtd;
    }
  }));
  const margem = receita > 0 ? receita - custo : null;
  return {
    margem,
    custo,
    margemPct: margem != null ? (margem / receita) * 100 : null,
    cobertura: subtotal > 0 ? (receita / subtotal) * 100 : null,
  };
}

export function resumoVendas(orders, products = []) {
  const todos = orders || [];
  const validos = todos.filter((o) => !ehCancelado(o));
  const cancelados = todos.filter(ehCancelado);
  const pagos = validos.filter((o) => o.paymentStatus === "paid");
  const abertos = validos.filter((o) => o.paymentStatus !== "paid");
  const aguardando = abertos.filter((o) => o.paymentStatus === "requested");
  const emAberto = abertos.filter((o) => o.paymentStatus !== "requested");
  const subtotal = soma(pagos.map(subtotalPedido));
  const faturamento = soma(pagos.map(totalPedido));
  const itens = soma(pagos.map(itensPedido));
  const grupo = (lista) => ({ qtd: lista.length, valor: soma(lista.map(totalPedido)) });
  return {
    pagos,
    totalPedidos: validos.length,
    qtdPagos: pagos.length,
    subtotal,
    faturamento,
    taxa: faturamento - subtotal,
    ticket: pagos.length ? faturamento / pagos.length : null,
    itens,
    itensPorPedido: pagos.length ? itens / pagos.length : null,
    pctPagos: validos.length ? (pagos.length / validos.length) * 100 : null,
    emAberto: grupo(emAberto),
    aguardando: grupo(aguardando),
    cancelados: grupo(cancelados),
    pctCancelados: todos.length ? (cancelados.length / todos.length) * 100 : null,
    ...margemDosPedidos(pagos, mapaDeProdutos(products)),
  };
}

// ── Séries no tempo ───────────────────────────────────────────
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function acumular(pagos, chaveDe) {
  const mapa = new Map();
  pagos.forEach((o) => {
    if (!o.createdAtISO) return;
    const chave = chaveDe(new Date(o.createdAtISO));
    const cur = mapa.get(chave) || { valor: 0, qtd: 0 };
    cur.valor += totalPedido(o);
    cur.qtd += 1;
    mapa.set(chave, cur);
  });
  return mapa;
}

/** Ordem das horas começando às 6h, para o turno que passa da meia-noite. */
const HORAS_COMERCIAIS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);

function faixaDeHoras(horasComDado) {
  const posicoes = horasComDado.map((h) => HORAS_COMERCIAIS.indexOf(h));
  if (!posicoes.length) return [];
  return HORAS_COMERCIAIS.slice(Math.min(...posicoes), Math.max(...posicoes) + 1);
}

const rotuloHora = (h) => `${String(h).padStart(2, "0")}h`;

/**
 * Série contínua (dias sem venda aparecem como zero) com o período anterior
 * alinhado posição a posição. Um dia → por hora; até 62 dias → por dia;
 * acima disso → por mês, sem comparação.
 */
export function serieTemporal({ orders, periodo, ini, fim, agora = new Date() }) {
  const intervalo = intervaloPeriodo(periodo, ini, fim, agora);
  const pagos = pedidosNoIntervalo(orders, intervalo).filter(ehPago);
  if (!pagos.length) return { granularidade: "dia", temAnterior: false, pontos: [] };

  const primeiro = pagos.reduce((m, o) => Math.min(m, new Date(o.createdAtISO).getTime()), Infinity);
  const inicio = intervalo[0].getTime() > 0 ? intervalo[0] : inicioDoDia(primeiro);
  const termino = intervalo[1] > fimDoDia(agora) ? fimDoDia(agora) : intervalo[1];
  const dias = diasEntre(inicio, termino);
  const anterior = intervaloAnterior(periodo, ini, fim, agora);
  const pagosAnt = pedidosNoIntervalo(orders, anterior).filter(ehPago);
  const temAnterior = pagosAnt.length > 0;

  if (dias <= 1) {
    const atual = acumular(pagos, (d) => d.getHours());
    const ant = acumular(pagosAnt, (d) => d.getHours());
    const pontos = faixaDeHoras([...atual.keys(), ...ant.keys()]).map((h) => ({
      chave: String(h),
      rotulo: rotuloHora(h),
      valor: atual.get(h)?.valor || 0,
      qtd: atual.get(h)?.qtd || 0,
      anterior: temAnterior ? ant.get(h)?.valor || 0 : null,
    }));
    return { granularidade: "hora", temAnterior, pontos };
  }

  if (dias <= 62) {
    const atual = acumular(pagos, chaveDia);
    const ant = acumular(pagosAnt, chaveDia);
    const pontos = Array.from({ length: dias }, (_, i) => {
      const dia = somarDias(inicio, i);
      const chave = chaveDia(dia);
      return {
        chave,
        rotulo: `${chave.slice(8)}/${chave.slice(5, 7)}`,
        valor: atual.get(chave)?.valor || 0,
        qtd: atual.get(chave)?.qtd || 0,
        anterior: temAnterior ? ant.get(chaveDia(somarDias(anterior[0], i)))?.valor || 0 : null,
      };
    });
    return { granularidade: "dia", temAnterior, pontos };
  }

  const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const atual = acumular(pagos, chaveMes);
  const pontos = [];
  for (let d = new Date(inicio.getFullYear(), inicio.getMonth(), 1); d <= termino; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const chave = chaveMes(d);
    pontos.push({
      chave,
      rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      valor: atual.get(chave)?.valor || 0,
      qtd: atual.get(chave)?.qtd || 0,
      anterior: null,
    });
  }
  return { granularidade: "mes", temAnterior: false, pontos };
}

export const DIAS_SEMANA = Object.freeze(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
const indiceDia = (d) => (d.getDay() + 6) % 7;

/** Faturamento por dia da semana (linhas) × hora (colunas). */
export function mapaCalor(pagos) {
  const comData = (pagos || []).filter((o) => o.createdAtISO);
  const horas = faixaDeHoras(comData.map((o) => new Date(o.createdAtISO).getHours()));
  const celulas = DIAS_SEMANA.map(() => horas.map(() => ({ valor: 0, qtd: 0 })));
  comData.forEach((o) => {
    const d = new Date(o.createdAtISO);
    const cel = celulas[indiceDia(d)][horas.indexOf(d.getHours())];
    cel.valor += totalPedido(o);
    cel.qtd += 1;
  });
  let max = 0;
  let melhor = null;
  celulas.forEach((linha, di) => linha.forEach((c, hi) => {
    if (c.valor > max) {
      max = c.valor;
      melhor = { dia: DIAS_SEMANA[di], hora: rotuloHora(horas[hi]), ...c };
    }
  }));
  return { dias: [...DIAS_SEMANA], horas: horas.map(rotuloHora), celulas, max, melhor };
}

export function vendasPorHoraDoDia(pagos) {
  const mapa = acumular(pagos || [], (d) => d.getHours());
  return faixaDeHoras([...mapa.keys()]).map((h) => ({
    rotulo: rotuloHora(h),
    valor: mapa.get(h)?.valor || 0,
    qtd: mapa.get(h)?.qtd || 0,
  }));
}

// ── Agrupamentos ──────────────────────────────────────────────
function agrupar(pagos, chaveDe) {
  const mapa = new Map();
  pagos.forEach((o) => {
    const chave = chaveDe(o);
    const cur = mapa.get(chave) || { rotulo: chave, valor: 0, qtd: 0 };
    cur.valor += totalPedido(o);
    cur.qtd += 1;
    mapa.set(chave, cur);
  });
  return [...mapa.values()]
    .map((g) => ({ ...g, ticket: g.valor / g.qtd }))
    .sort((a, b) => b.valor - a.valor);
}

export function porCanal(pagos) {
  return agrupar(pagos || [], canalDoPedido);
}

export function porFormaPagamento(pagos) {
  return agrupar(pagos || [], (o) => o.pagamentoForma || "Não informado");
}

export function porMesa(pagos) {
  return agrupar((pagos || []).filter((o) => canalDoPedido(o) === CANAIS[0] && o.table), (o) => String(o.table));
}

function itensAgrupados(pagos, chaveDe) {
  const mapa = new Map();
  (pagos || []).forEach((o) => (o.items || []).forEach((it) => {
    const chave = chaveDe(it);
    const qtd = Number(it.quantity) || 0;
    const cur = mapa.get(chave) || { rotulo: chave, valor: 0, qtd: 0 };
    cur.valor += (Number(it.price) || 0) * qtd;
    cur.qtd += qtd;
    mapa.set(chave, cur);
  }));
  return mapa;
}

/** Ranking completo por faturamento, com participação e classe da curva ABC. */
export function rankingProdutos(pagos, products = []) {
  const mapa = mapaDeProdutos(products);
  const lista = [...itensAgrupados(pagos, (it) => it.name).values()].sort((a, b) => b.valor - a.valor);
  const total = soma(lista.map((p) => p.valor));
  let anterior = 0;
  return lista.map((p) => {
    const info = mapa.get(p.rotulo);
    const margem = info?.custo != null ? p.valor - info.custo * p.qtd : null;
    const participacao = total > 0 ? (p.valor / total) * 100 : 0;
    const classe = anterior < 80 ? "A" : anterior < 95 ? "B" : "C";
    anterior += participacao;
    return {
      nome: p.rotulo,
      categoria: info?.categoria || "Outros",
      qtd: p.qtd,
      valor: p.valor,
      precoMedio: p.qtd ? p.valor / p.qtd : 0,
      margem,
      margemPct: margem != null && p.valor > 0 ? (margem / p.valor) * 100 : null,
      participacao,
      acumulado: anterior,
      classe,
    };
  });
}

export function resumoCurvaAbc(ranking) {
  return ["A", "B", "C"].map((classe) => {
    const itens = ranking.filter((p) => p.classe === classe);
    return { classe, produtos: itens.length, valor: soma(itens.map((p) => p.valor)) };
  });
}

export function porCategoria(pagos, products = [], pagosAnteriores = []) {
  const mapa = mapaDeProdutos(products);
  const chave = (it) => mapa.get(it.name)?.categoria || "Outros";
  const antes = itensAgrupados(pagosAnteriores, chave);
  return [...itensAgrupados(pagos, chave).values()]
    .map((c) => ({ ...c, variacao: variacaoPct(c.valor, antes.get(c.rotulo)?.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/** Pares de produtos presentes no mesmo pedido (mínimo de 2 ocorrências). */
export function paresDeProdutos(pagos, limite = 5, minimo = 2) {
  const mapa = new Map();
  (pagos || []).forEach((o) => {
    const nomes = [...new Set((o.items || []).map((it) => it.name))].sort();
    for (let i = 0; i < nomes.length; i += 1) {
      for (let j = i + 1; j < nomes.length; j += 1) {
        const chave = `${nomes[i]} + ${nomes[j]}`;
        mapa.set(chave, (mapa.get(chave) || 0) + 1);
      }
    }
  });
  return [...mapa.entries()]
    .filter(([, qtd]) => qtd >= minimo)
    .map(([rotulo, qtd]) => ({ rotulo, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, limite);
}

export const FAIXAS_VALOR = Object.freeze([
  { rotulo: "até R$ 30", ate: 30 },
  { rotulo: "R$ 30–60", ate: 60 },
  { rotulo: "R$ 60–100", ate: 100 },
  { rotulo: "R$ 100–150", ate: 150 },
  { rotulo: "acima de R$ 150", ate: Infinity },
]);

export function distribuicaoPorValor(valores, faixas = FAIXAS_VALOR) {
  const saida = faixas.map((f) => ({ rotulo: f.rotulo, qtd: 0, valor: 0 }));
  (valores || []).forEach((v) => {
    const i = faixas.findIndex((f) => v <= f.ate);
    if (i >= 0) {
      saida[i].qtd += 1;
      saida[i].valor += v;
    }
  });
  return saida;
}

// ── Permanência ───────────────────────────────────────────────
/**
 * Agrupa pedidos pagos em visitas. A comanda é reutilizada em outros
 * atendimentos: um pedido criado depois do último pagamento da visita abre
 * uma nova. Pedido sem comanda conta sozinho.
 */
export function agruparVisitas(pedidos) {
  const ordenados = (pedidos || [])
    .filter((o) => o.paymentStatus === "paid" && !ehCancelado(o) && o.createdAtISO && o.updatedAtISO)
    .sort((a, b) => new Date(a.createdAtISO) - new Date(b.createdAtISO));
  const abertas = new Map();
  const visitas = [];
  ordenados.forEach((o) => {
    const chave = o.command || `pedido:${o.id}`;
    let v = abertas.get(chave);
    if (!v || new Date(o.createdAtISO) > new Date(v.fim)) {
      v = { comanda: o.command || String(o.id), mesa: o.table, inicio: o.createdAtISO, fim: o.updatedAtISO, pedidos: [] };
      abertas.set(chave, v);
      visitas.push(v);
    }
    if (new Date(o.updatedAtISO) > new Date(v.fim)) v.fim = o.updatedAtISO;
    v.pedidos.push(o);
  });
  return visitas.map((v) => ({ ...v, minutos: Math.max(0, Math.round((new Date(v.fim) - new Date(v.inicio)) / 60000)) }));
}

// ── Estoque ───────────────────────────────────────────────────
/** Só produtos com controle de estoque entram em ruptura/mínimo/excesso. */
export function situacaoEstoque({ controla, estoque, minimo, vendido, dias }) {
  if (!controla) return "semControle";
  if (estoque <= 0) return "critico";
  if (minimo > 0 && estoque <= minimo) return "atencao";
  const cobertura = vendido > 0 && dias > 0 ? estoque / (vendido / dias) : null;
  if (cobertura != null && cobertura > 90) return "excesso";
  if (vendido === 0) return "semMovimento";
  return "normal";
}

export function abaixoDoMinimo(produto) {
  if (!produto?.controlaEstoque || produto.active === false) return false;
  const estoque = Number(produto.estoque) || 0;
  const minimo = Number(produto.estoqueMinimo) || 0;
  return estoque <= 0 || (minimo > 0 && estoque <= minimo);
}

// ── Clientes ──────────────────────────────────────────────────
/** Parcela (%) do faturamento concentrada nos `pctTopo`% maiores clientes. */
export function concentracao(valores, pctTopo = 20) {
  const ord = [...(valores || [])].filter((v) => v > 0).sort((a, b) => b - a);
  if (!ord.length) return null;
  const n = Math.max(1, Math.ceil((ord.length * pctTopo) / 100));
  return { clientes: n, participacao: (soma(ord.slice(0, n)) / soma(ord)) * 100 };
}

// ── Dias ──────────────────────────────────────────────────────
export function resumoDiario(serie) {
  if (serie?.granularidade !== "dia" || !serie.pontos.length) return null;
  const comVenda = serie.pontos.filter((p) => p.valor > 0);
  if (!comVenda.length) return null;
  const melhor = comVenda.reduce((b, p) => (p.valor > b.valor ? p : b));
  return {
    melhor,
    mediaDiaria: soma(serie.pontos.map((p) => p.valor)) / serie.pontos.length,
    diasComVenda: comVenda.length,
    dias: serie.pontos.length,
  };
}
