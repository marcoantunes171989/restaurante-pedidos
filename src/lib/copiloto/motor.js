/**
 * Motor do Copiloto: entende a pergunta, busca na loja e responde somente com
 * o que está nos pedidos, produtos e pesquisas carregados. Sem dado, diz que
 * não há — nunca estima.
 *
 * Contexto esperado (já filtrado pela loja):
 *   pedidos    pedidos do período     historico  todos os pedidos da loja
 *   anteriores pedidos do período anterior       produtos, pesquisas, agora
 */
import {
  abaixoDoMinimo, canalDoPedido, ehPago, mapaCalor, porFormaPagamento, rankingProdutos,
  resumoVendas, totalPedido, variacaoPct, porCategoria, vendasPorHoraDoDia,
} from "../relatorios/analiseVendas.js";

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (v, casas = 0) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const plural = (n, um, varios) => `${numero(n)} ${n === 1 ? um : varios}`;
const sinal = (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
const DIA_MS = 864e5;

export const PERGUNTAS = Object.freeze([
  { id: "vendas", rotulo: "Como estão as vendas?" },
  { id: "pendencias", rotulo: "Há contas para receber?" },
  { id: "produtos", rotulo: "O que mais vendeu?" },
  { id: "parados", rotulo: "O que não está saindo?" },
  { id: "estoque", rotulo: "O que preciso repor?" },
  { id: "horario", rotulo: "Quando vendo mais?" },
  { id: "clientes", rotulo: "Quem devo chamar de volta?" },
  { id: "cancelamentos", rotulo: "O que foi cancelado?" },
  { id: "margem", rotulo: "Onde está o lucro?" },
  { id: "satisfacao", rotulo: "O que os clientes acharam?" },
]);

export function normalizar(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// A ordem importa: os assuntos mais específicos vêm antes de "vendas".
const INTENCOES = [
  ["cancelamentos", /cancel/],
  ["estoque", /estoque|repor|reposi|acabando|em falta|zerad/],
  ["parados", /parad|nao (esta )?(vend|sai)|sem venda|encalhad/],
  ["pendencias", /em aberto|pendent|a receber|para receber|receber|contas?\b/],
  ["margem", /margem|lucro|custo|rentav/],
  ["satisfacao", /satisfa|avalia|\bnps\b|reclama|coment|opini|acharam/],
  ["clientes", /cliente|chamar|de volta|inativ|fideli|sumi/],
  ["horario", /horario|\bhora\b|pico|movimento|quando|melhor dia|dia da semana/],
  ["pagamentos", /\bpix\b|cartao|dinheiro|forma de pagamento|pagamentos?/],
  ["produtos", /mais vend|campe|top\b|produto|cardapio|item|itens/],
  ["vendas", /vend|fatur|receita|resultado|quanto|ticket|como (esta|estao|foi)/],
];

export function identificarPergunta(texto) {
  const t = normalizar(texto);
  return INTENCOES.find(([, re]) => re.test(t))?.[0] || null;
}

const semDados = (titulo, ctx) => ({ titulo, resposta: `Não há vendas pagas em ${ctx.rotuloPeriodo.toLowerCase()}.`, itens: [] });

const RESPOSTAS = {
  vendas(ctx) {
    const atual = resumoVendas(ctx.pedidos, ctx.produtos);
    if (!atual.qtdPagos) return { ...semDados("Vendas", ctx), destino: "geral" };
    const antes = ctx.anteriores.length ? resumoVendas(ctx.anteriores, ctx.produtos) : null;
    const variacao = antes ? variacaoPct(atual.faturamento, antes.faturamento) : null;
    const itens = [`${plural(atual.qtdPagos, "pedido pago", "pedidos pagos")} · ticket médio ${moeda(atual.ticket)}`];
    if (variacao != null) {
      const categorias = porCategoria(atual.pagos, ctx.produtos, antes.pagos).filter((c) => c.variacao != null);
      const alvo = [...categorias].sort((a, b) => (variacao < 0 ? a.variacao - b.variacao : b.variacao - a.variacao))[0];
      if (alvo && (variacao < 0 ? alvo.variacao < 0 : alvo.variacao > 0)) {
        itens.push(`Quem mais ${variacao < 0 ? "puxou para baixo" : "puxou para cima"}: ${alvo.rotulo} (${sinal(alvo.variacao)})`);
      }
    }
    return {
      titulo: "Vendas",
      resposta: `Você faturou ${moeda(atual.faturamento)}${variacao == null ? "." : `, ${sinal(variacao)} em relação ao período anterior.`}`,
      itens,
      destino: "geral",
    };
  },

  pendencias(ctx) {
    // Conta tudo o que está sem pagamento, mesmo fora do período escolhido.
    const abertos = ctx.historico.filter((o) => o.status !== "cancelled" && o.paymentStatus !== "paid");
    if (!abertos.length) return { titulo: "Contas a receber", resposta: "Nenhuma conta pendente nesta loja.", itens: [], destino: "mesas" };
    const total = abertos.reduce((s, o) => s + totalPedido(o), 0);
    const itens = [...abertos]
      .sort((a, b) => new Date(a.createdAtISO || 0) - new Date(b.createdAtISO || 0))
      .slice(0, 5)
      .map((o) => {
        const dias = o.createdAtISO ? Math.floor((ctx.agora - new Date(o.createdAtISO)) / DIA_MS) : 0;
        return `${o.table || "Balcão"}${o.command ? ` · ${o.command}` : ""} — ${moeda(totalPedido(o))}${o.paymentStatus === "requested" ? " · pediu a conta" : ""}${dias > 0 ? ` · há ${plural(dias, "dia", "dias")}` : ""}`;
      });
    return {
      titulo: "Contas a receber",
      resposta: `${plural(abertos.length, "pedido sem pagamento", "pedidos sem pagamento")}, somando ${moeda(total)}. Comece pelos mais antigos.`,
      itens,
      destino: "mesas",
    };
  },

  produtos(ctx) {
    const ranking = rankingProdutos(ctx.pedidos.filter(ehPago), ctx.produtos);
    if (!ranking.length) return { ...semDados("Mais vendidos", ctx), destino: "vendas" };
    const lider = ranking[0];
    return {
      titulo: "Mais vendidos",
      resposta: `${lider.nome} lidera, com ${moeda(lider.valor)} (${numero(lider.participacao)}% das vendas de produtos).`,
      itens: ranking.slice(0, 5).map((p, i) => `${i + 1}. ${p.nome} — ${numero(p.qtd)} un. · ${moeda(p.valor)}`),
      destino: "vendas",
    };
  },

  parados(ctx) {
    const vendidos = new Set(ctx.pedidos.filter(ehPago).flatMap((o) => (o.items || []).map((it) => it.name)));
    const parados = ctx.produtos.filter((p) => p.active !== false && !vendidos.has(p.name));
    if (!parados.length) return { titulo: "Sem saída", resposta: "Todos os produtos ativos venderam no período.", itens: [], destino: "vendas" };
    return {
      titulo: "Sem saída",
      resposta: `${plural(parados.length, "produto ativo não vendeu", "produtos ativos não venderam")} em ${ctx.rotuloPeriodo.toLowerCase()}. Considere destacar, combinar ou retirar.`,
      itens: parados.slice(0, 8).map((p) => `${p.name}${p.category ? ` · ${p.category}` : ""}`),
      destino: "vendas",
    };
  },

  estoque(ctx) {
    const controlados = ctx.produtos.filter((p) => p.controlaEstoque && p.active !== false);
    if (!controlados.length) return { titulo: "Estoque", resposta: "Nenhum produto desta loja está com controle de estoque ligado.", itens: [], destino: "estoque" };
    const faltando = controlados.filter(abaixoDoMinimo).sort((a, b) => (Number(a.estoque) || 0) - (Number(b.estoque) || 0));
    if (!faltando.length) return { titulo: "Estoque", resposta: "Nenhum produto zerado ou abaixo do mínimo.", itens: [], destino: "estoque" };
    return {
      titulo: "Repor",
      resposta: `${plural(faltando.length, "produto precisa", "produtos precisam")} de reposição.`,
      itens: faltando.slice(0, 8).map((p) => {
        const estoque = Number(p.estoque) || 0;
        const minimo = Number(p.estoqueMinimo) || 0;
        return `${p.name} — tem ${numero(estoque)}${minimo > estoque ? ` · faltam ${numero(minimo - estoque)} para o mínimo` : ""}`;
      }),
      destino: "estoque",
    };
  },

  horario(ctx) {
    const pagos = ctx.pedidos.filter(ehPago);
    if (!pagos.length) return { ...semDados("Movimento", ctx), destino: "geral" };
    const calor = mapaCalor(pagos);
    const horas = vendasPorHoraDoDia(pagos).filter((h) => h.valor > 0).sort((a, b) => b.valor - a.valor);
    const itens = horas.slice(0, 3).map((h) => `${h.rotulo} — ${moeda(h.valor)} em ${plural(h.qtd, "pedido", "pedidos")}`);
    if (horas.length > 3) {
      const fraca = horas[horas.length - 1];
      itens.push(`Mais fraco: ${fraca.rotulo} (${moeda(fraca.valor)}) — bom horário para uma promoção`);
    }
    return {
      titulo: "Movimento",
      resposta: calor.melhor ? `Seu ponto mais forte é ${calor.melhor.dia} às ${calor.melhor.hora}. Garanta equipe e preparo antes disso.` : "Há vendas sem horário registrado.",
      itens,
      destino: "geral",
    };
  },

  pagamentos(ctx) {
    const pagos = ctx.pedidos.filter(ehPago);
    if (!pagos.length) return { ...semDados("Pagamentos", ctx), destino: "geral" };
    const formas = porFormaPagamento(pagos);
    const total = formas.reduce((s, f) => s + f.valor, 0);
    return {
      titulo: "Pagamentos",
      resposta: `${formas[0].rotulo} é a forma que mais recebe: ${numero((formas[0].valor / total) * 100)}% do valor.`,
      itens: formas.map((f) => `${f.rotulo} — ${moeda(f.valor)} · ${plural(f.qtd, "pedido", "pedidos")}`),
      destino: "geral",
    };
  },

  clientes(ctx) {
    const porCliente = new Map();
    ctx.historico.filter(ehPago).forEach((o) => {
      // "Cliente" e "Consumidor" são preenchimentos genéricos, não uma pessoa.
      const nome = /^(cliente|consumidor( final)?)$/i.test(String(o.customer || "").trim()) ? null : o.customer;
      const chave = nome || o.clienteTelefone;
      if (!chave || !o.createdAtISO) return;
      const c = porCliente.get(chave) || { nome: chave, pedidos: 0, valor: 0, ultima: 0 };
      c.pedidos += 1;
      c.valor += totalPedido(o);
      c.ultima = Math.max(c.ultima, new Date(o.createdAtISO).getTime());
      porCliente.set(chave, c);
    });
    if (!porCliente.size) return { titulo: "Clientes", resposta: "Ainda não há vendas com cliente identificado. Peça nome ou telefone no fechamento.", itens: [], destino: "clientes" };
    const sumidos = [...porCliente.values()]
      .map((c) => ({ ...c, dias: Math.floor((ctx.agora - c.ultima) / DIA_MS) }))
      .filter((c) => c.dias > 30)
      .sort((a, b) => b.valor - a.valor);
    if (!sumidos.length) return { titulo: "Clientes", resposta: "Nenhum cliente identificado está há mais de 30 dias sem comprar.", itens: [], destino: "clientes" };
    return {
      titulo: "Chamar de volta",
      resposta: `${plural(sumidos.length, "cliente está", "clientes estão")} há mais de 30 dias sem comprar. Comece por quem mais gastou.`,
      itens: sumidos.slice(0, 5).map((c) => `${c.nome} — ${moeda(c.valor)} no histórico · ${numero(c.dias)} dias sem comprar`),
      destino: "clientes",
    };
  },

  cancelamentos(ctx) {
    const cancelados = ctx.pedidos.filter((o) => o.status === "cancelled");
    if (!cancelados.length) return { titulo: "Cancelamentos", resposta: "Nenhum pedido cancelado no período.", itens: [], destino: "cupom" };
    const motivos = new Map();
    cancelados.forEach((o) => { const m = o.cancelReason || "Sem motivo informado"; motivos.set(m, (motivos.get(m) || 0) + 1); });
    return {
      titulo: "Cancelamentos",
      resposta: `${plural(cancelados.length, "pedido cancelado", "pedidos cancelados")}, ${moeda(cancelados.reduce((s, o) => s + totalPedido(o), 0))} que não entraram.`,
      itens: [...motivos].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([motivo, n]) => `${motivo} — ${numero(n)}×`),
      destino: "cupom",
    };
  },

  margem(ctx) {
    const resumo = resumoVendas(ctx.pedidos, ctx.produtos);
    if (!resumo.qtdPagos) return { ...semDados("Lucro", ctx), destino: "vendas" };
    if (resumo.margem == null) return { titulo: "Lucro", resposta: "Cadastre o custo dos produtos para o lucro ser calculado.", itens: [], destino: "products" };
    const comMargem = rankingProdutos(resumo.pagos, ctx.produtos).filter((p) => p.margem != null).sort((a, b) => b.margem - a.margem);
    const itens = comMargem.slice(0, 3).map((p) => `${p.nome} — ${moeda(p.margem)} (${numero(p.margemPct)}%)`);
    const apertado = [...comMargem].sort((a, b) => a.margemPct - b.margemPct)[0];
    if (comMargem.length > 3) itens.push(`Menor margem: ${apertado.nome} (${numero(apertado.margemPct)}%) — revise preço ou custo`);
    return {
      titulo: "Lucro",
      resposta: `Margem estimada de ${moeda(resumo.margem)} (${numero(resumo.margemPct)}%), calculada sobre ${numero(resumo.cobertura)}% das vendas, que têm custo cadastrado.`,
      itens,
      destino: "vendas",
    };
  },

  satisfacao(ctx) {
    const notas = ctx.pesquisas.flatMap((q) => Object.values(q.notas || {}).filter((v) => v > 0));
    if (!notas.length) return { titulo: "Satisfação", resposta: "Nenhuma pesquisa respondida no período.", itens: [], destino: "satisfacao" };
    const media = notas.reduce((s, v) => s + v, 0) / notas.length;
    const comentarios = ctx.pesquisas.filter((q) => (q.comentario || "").trim())
      .sort((a, b) => new Date(b.criadoEmISO || 0) - new Date(a.criadoEmISO || 0));
    return {
      titulo: "Satisfação",
      resposta: `Média ${numero(media, 1)} de 5 em ${plural(ctx.pesquisas.length, "resposta", "respostas")}.`,
      itens: comentarios.slice(0, 3).map((q) => `“${q.comentario.trim().slice(0, 140)}”`),
      destino: "satisfacao",
    };
  },
};

export function responder(id, ctx) {
  return RESPOSTAS[id] ? { id, ...RESPOSTAS[id](ctx) } : null;
}

// ── Busca na loja ─────────────────────────────────────────────
const PALAVRAS_COMUNS = new Set(["como", "quanto", "vendeu", "venda", "vendas", "qual", "quais", "mais", "produto", "produtos", "cliente", "clientes", "esta", "para", "com", "sem", "dos", "das", "que", "mesa", "pedido", "cupom", "hoje", "ontem", "semana", "casa", "grande", "pequeno"]);

function palavras(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PALAVRAS_COMUNS.has(p));
}

/** Nomes cujas palavras aparecem na pergunta, do mais parecido ao menos. */
function parecidos(consulta, nomes) {
  const buscadas = palavras(consulta);
  if (!buscadas.length) return [];
  return nomes
    .map((nome) => {
      const doNome = palavras(nome);
      // Aceita abreviação dos dois lados: "refri" acha "Refrigerante" e vice-versa.
      const acertos = buscadas.filter((b) => doNome.some((n) => n === b || (b.length >= 4 && n.startsWith(b)) || (n.length >= 4 && b.startsWith(n)))).length;
      return { nome, acertos };
    })
    .filter((x) => x.acertos > 0)
    .sort((a, b) => b.acertos - a.acertos || a.nome.localeCompare(b.nome, "pt-BR"))
    .filter((x, _, lista) => x.acertos === lista[0].acertos)
    .map((x) => x.nome);
}

export function buscarNaLoja(consulta, ctx) {
  const t = normalizar(consulta);

  const cupom = t.match(/(?:ped-?|cupom\s*|pedido\s*)(\d{3,})/) || t.match(/^(\d{5,})$/);
  if (cupom) {
    const o = ctx.historico.find((x) => normalizar(x.id).includes(cupom[1]));
    if (o) {
      return {
        titulo: `Cupom ${o.id}`,
        resposta: `${o.table || "Balcão"} · ${moeda(totalPedido(o))} · ${o.status === "cancelled" ? "cancelado" : o.paymentStatus === "paid" ? "pago" : "sem pagamento"}${o.createdAtISO ? ` · ${new Date(o.createdAtISO).toLocaleString("pt-BR")}` : ""}.`,
        itens: (o.items || []).slice(0, 8).map((it) => `${it.quantity}× ${it.name} — ${moeda(it.price * it.quantity)}`),
        destino: "cupom",
      };
    }
  }

  const mesa = t.match(/mesa\s*0*(\d+)/);
  if (mesa) {
    const daMesa = ctx.pedidos.filter((o) => new RegExp(`mesa\\s*0*${mesa[1]}\\b`).test(normalizar(o.table)));
    const resumo = resumoVendas(daMesa, ctx.produtos);
    return {
      titulo: `Mesa ${mesa[1]}`,
      resposta: daMesa.length
        ? `${moeda(resumo.faturamento)} em ${plural(resumo.qtdPagos, "pedido pago", "pedidos pagos")} no período${resumo.emAberto.qtd + resumo.aguardando.qtd ? ` e ${plural(resumo.emAberto.qtd + resumo.aguardando.qtd, "conta em aberto", "contas em aberto")}` : ""}.`
        : "Nenhum pedido desta mesa no período.",
      itens: rankingProdutos(resumo.pagos, ctx.produtos).slice(0, 3).map((p) => `${p.nome} — ${numero(p.qtd)} un.`),
      destino: "mesas",
    };
  }

  const produtos = parecidos(consulta, ctx.produtos.map((p) => p.name));
  if (produtos.length) {
    const ranking = rankingProdutos(ctx.pedidos.filter(ehPago), ctx.produtos);
    const linhas = produtos.slice(0, 5).map((nome) => {
      const venda = ranking.find((r) => r.nome === nome);
      const produto = ctx.produtos.find((p) => p.name === nome);
      const estoque = produto?.controlaEstoque ? ` · estoque ${numero(produto.estoque)}` : "";
      return { nome, venda, produto, texto: `${nome} — ${venda ? `${numero(venda.qtd)} un. · ${moeda(venda.valor)}` : "sem venda no período"}${estoque}` };
    });
    const unico = linhas.length === 1 ? linhas[0] : null;
    return {
      titulo: unico ? unico.nome : `${plural(produtos.length, "produto encontrado", "produtos encontrados")}`,
      resposta: unico
        ? `Preço ${moeda(unico.produto?.price)}. ${unico.venda ? `Vendeu ${numero(unico.venda.qtd)} un. (${moeda(unico.venda.valor)}) em ${ctx.rotuloPeriodo.toLowerCase()}.` : `Sem venda em ${ctx.rotuloPeriodo.toLowerCase()}.`}`
        : `Vendas em ${ctx.rotuloPeriodo.toLowerCase()}:`,
      itens: unico ? [unico.venda?.margem != null ? `Margem estimada: ${moeda(unico.venda.margem)}` : null, unico.produto?.controlaEstoque ? `Estoque: ${numero(unico.produto.estoque)} un.` : null].filter(Boolean) : linhas.map((l) => l.texto),
      destino: "vendas",
    };
  }

  const nomes = [...new Set(ctx.historico.map((o) => o.customer).filter(Boolean))];
  const clientes = parecidos(consulta, nomes);
  if (clientes.length) {
    return {
      titulo: clientes.length === 1 ? clientes[0] : plural(clientes.length, "cliente encontrado", "clientes encontrados"),
      resposta: "Histórico nesta loja:",
      itens: clientes.slice(0, 5).map((nome) => {
        const dele = ctx.historico.filter((o) => o.customer === nome && ehPago(o));
        const ultima = dele.reduce((m, o) => Math.max(m, new Date(o.createdAtISO || 0).getTime()), 0);
        return `${nome} — ${plural(dele.length, "compra", "compras")} · ${moeda(dele.reduce((s, o) => s + totalPedido(o), 0))}${ultima ? ` · última em ${new Date(ultima).toLocaleDateString("pt-BR")}` : ""}`;
      }),
      destino: "clientes",
    };
  }
  return null;
}

/**
 * Pergunta digitada: um assunto reconhecido vence nomes soltos, exceto quando
 * a pergunta cita um cupom, uma mesa ou só nomeia algo da loja.
 */
export function interpretar(texto, ctx) {
  const assunto = identificarPergunta(texto);
  const citaRegistro = /(ped-?\d{3,}|cupom\s*\d|pedido\s*\d|mesa\s*\d|^\d{5,}$)/.test(normalizar(texto));
  const busca = buscarNaLoja(texto, ctx);
  if (busca && (citaRegistro || !assunto || assunto === "vendas" || assunto === "produtos")) return busca;
  return assunto ? responder(assunto, ctx) : null;
}

/** Contexto enviado à IA: somente números agregados, sem nome ou telefone de cliente. */
export function resumoParaIA(ctx) {
  const r = resumoVendas(ctx.pedidos, ctx.produtos);
  const antes = ctx.anteriores.length ? resumoVendas(ctx.anteriores, ctx.produtos) : null;
  const ranking = rankingProdutos(r.pagos, ctx.produtos);
  const variacao = antes ? variacaoPct(r.faturamento, antes.faturamento) : null;
  const notas = ctx.pesquisas.flatMap((q) => Object.values(q.notas || {}).filter((v) => v > 0));
  return [
    `Loja: ${ctx.lojaNome || "loja selecionada"}. Período: ${ctx.rotuloPeriodo}.`,
    `Faturamento pago: ${moeda(r.faturamento)} | Pedidos pagos: ${r.qtdPagos} | Ticket médio: ${r.ticket == null ? "sem dado" : moeda(r.ticket)} | Itens: ${r.itens}.`,
    variacao == null ? "Sem período anterior para comparar." : `Variação do faturamento: ${sinal(variacao)}.`,
    `Em aberto: ${r.emAberto.qtd} (${moeda(r.emAberto.valor)}) | Aguardando pagamento: ${r.aguardando.qtd} | Cancelados: ${r.cancelados.qtd} (${moeda(r.cancelados.valor)}).`,
    r.margem == null ? "Margem: sem custo cadastrado." : `Margem estimada: ${moeda(r.margem)} (${numero(r.margemPct)}%), sobre ${numero(r.cobertura)}% das vendas.`,
    ranking.length ? `Produtos que mais faturam: ${ranking.slice(0, 10).map((p) => `${p.nome} (${p.qtd} un, ${moeda(p.valor)})`).join("; ")}.` : "Sem produtos vendidos.",
    ranking.length ? `Canais: ${[...new Set(r.pagos.map(canalDoPedido))].join(", ")}.` : "",
    r.pagos.length ? `Formas de pagamento: ${porFormaPagamento(r.pagos).map((f) => `${f.rotulo} ${moeda(f.valor)}`).join("; ")}.` : "",
    `Produtos abaixo do mínimo: ${ctx.produtos.filter(abaixoDoMinimo).map((p) => p.name).slice(0, 10).join(", ") || "nenhum"}.`,
    notas.length ? `Satisfação média: ${numero(notas.reduce((s, v) => s + v, 0) / notas.length, 1)} de 5 (${ctx.pesquisas.length} respostas).` : "Satisfação: sem respostas.",
  ].filter(Boolean).join("\n");
}
