// Helpers do PDV — isolados do App.jsx para evitar acoplamento circular.

export const TAXA_SERVICO_DEFAULT = {
  enabled: true,
  percent: 10,
  chargingRule: "opcional",
  partialStrategy: "proporcional_itens",
};

export function lerConfigTaxaServico(lojaId) {
  try {
    return {
      ...TAXA_SERVICO_DEFAULT,
      ...JSON.parse(localStorage.getItem(`pedidoPrime:taxaServico:${lojaId || "geral"}`) || "{}"),
    };
  } catch {
    return TAXA_SERVICO_DEFAULT;
  }
}

export function orderTotal(order) {
  return (order?.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDuracaoMin(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min` : `${m}min`;
}

export function moedaParaNumero(str) {
  const digits = String(str || "").replace(/\D/g, "");
  return Number(digits) / 100;
}

export function numeroParaMoeda(num) {
  return Number(num || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ehPedidoExterno(o) {
  return o?.table === "Externo" || /^Externo\b/i.test(o?.table || "") || /^EXT-|^D-/i.test(o?.command || "");
}

export function chaveConta(o) {
  return ehPedidoExterno(o) ? o.command : o.table;
}

export function numeroMesaDe(table) {
  const m = String(table || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function rotuloMesa(n) {
  return `Mesa ${String(n).padStart(2, "0")}`;
}

/**
 * Situação visual da mesa no salão.
 * Conta paga/finalizada → Disponível (libera a mesa para novo consumo).
 */
export function situacaoMesaVisual(conta) {
  if (!conta) return "livre";
  if (conta.paymentStatus === "paid" || conta.situacao === "finalizada") return "livre";
  if (conta.solicitada || conta.situacao === "solicitado") return "pendente";
  if (conta.pendentePreparo) return "ocupada";
  return "ocupada";
}

/**
 * Cor da mesa = leitura instantânea do salão (só na tela de Mesa):
 * verde livre, laranja claro em consumo, amarelo aguardando pagamento.
 */
export const MESA_STATUS_META = {
  livre: {
    label: "Disponível",
    curto: "Disponível",
    dot: "bg-[#2F9E52]",
    border: "border-[#BFE3CB]",
    card: "bg-[#F2FBF5]",
    texto: "text-[#1F7A3D]",
    chip: "bg-[#DFF3E6] text-[#1F7A3D]",
  },
  ocupada: {
    label: "Ocupada",
    curto: "Ocupada",
    dot: "bg-[#F38525]",
    border: "border-[#F7D9BB]",
    card: "bg-[#FFF7EF]",
    texto: "text-[#012E46]",
    chip: "bg-[#FCE8D4] text-[#012E46]",
  },
  pendente: {
    label: "Aguardando pagamento",
    curto: "Conta pedida",
    dot: "bg-[#F38525]",
    border: "border-[#F5DFA3]",
    card: "bg-[#FFFBEB]",
    texto: "text-[#012E46]",
    chip: "bg-[#FBEFC4] text-[#012E46]",
  },
};

const STATUS_PEDIDO_META = {
  received: { label: "Recebido", chip: "bg-[#E0F0F4] text-[#012E46]" },
  preparing: { label: "Em preparo", chip: "bg-[#FCE8D4] text-[#012E46]" },
  ready: { label: "Pronto", chip: "bg-[#DFF3E6] text-[#1F7A3D]" },
  delivered: { label: "Entregue", chip: "bg-[#EDF0F4] text-[#52606D]" },
  cancelled: { label: "Cancelado", chip: "bg-[#FBE3E9] text-[#A3183A]" },
};

/** Status do pedido sempre em português — o dado interno é em inglês. */
export function rotuloStatusPedido(status) {
  return STATUS_PEDIDO_META[status] || { label: "Em aberto", chip: "bg-[#EDF0F4] text-[#52606D]" };
}

/**
 * Status consolidado dos pedidos de uma conta — o estágio MENOS avançado
 * manda, porque é ele que o salão ainda precisa acompanhar.
 */
export function statusPedidosConta(pedidos = []) {
  const abertos = pedidos.filter((o) => o?.status !== "cancelled");
  if (!abertos.length) return null;
  const ordem = ["received", "preparing", "ready", "delivered"];
  const menor = ordem.find((s) => abertos.some((o) => o.status === s));
  const id = menor || "delivered";
  return { id, ...STATUS_PEDIDO_META[id] };
}

/** Forma com troco liberado — apenas dinheiro/espécie (regra do caixa). */
export function formaPermiteTroco(forma) {
  if (!forma) return false;
  if (forma.permiteTroco === true) return true;
  return estiloFormaPagamento(forma.nome) === "dinheiro";
}

/** Texto sem acento/caixa para a busca global casar "Joao" com "João". */
export function normalizarBusca(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Índice de busca de uma conta: tudo que está visível na tela vira texto
 * pesquisável (mesa, cliente, telefone, comanda, pedido, produtos e valores).
 */
export function textoBuscaConta(conta, pedidos = []) {
  const partes = [
    conta?.mesa,
    conta?.cliente,
    conta?.telefone,
    String(conta?.telefone || "").replace(/\D/g, ""),
    ...(conta?.comandas || []),
    ...(conta?.pedidosIds || []),
    numeroParaMoeda(conta?.total),
    String(Number(conta?.total || 0).toFixed(2)),
  ];
  pedidos.forEach((o) => {
    partes.push(o.id, o.command, o.customer, o.table);
    (o.items || []).forEach((it) => {
      partes.push(it.name, numeroParaMoeda(it.price), String(Number(it.price || 0).toFixed(2)), it.observation);
    });
  });
  return normalizarBusca(partes.filter(Boolean).join(" "));
}

/** Casa todos os termos digitados (busca por palavras, em qualquer ordem). */
export function combinaBusca(indice, termo) {
  const alvo = normalizarBusca(termo);
  if (!alvo) return true;
  return alvo.split(/\s+/).every((t) => indice.includes(t));
}

export const CANAIS_PDV = [
  { id: "mesa", label: "Mesa", dica: "Mesas do atendimento" },
  { id: "delivery", label: "Delivery", dica: "Pedidos de entrega e retirada" },
  { id: "comanda", label: "Comanda", dica: "Comandas em aberto" },
  { id: "cliente", label: "Cliente", dica: "Clientes identificados" },
  { id: "pedido", label: "Pedido", dica: "Pedidos em aberto" },
];

/**
 * Situação da cozinha para o caixa acompanhar sem trocar de tela.
 * "Retirado" é o pedido já entregue ao cliente (status delivered).
 */
export function resumoCozinha(orders = []) {
  const base = { recebido: 0, preparando: 0, pronto: 0, retirado: 0 };
  const hoje = new Date().toDateString();
  orders.forEach((o) => {
    if (o.status === "cancelled") return;
    if (o.status === "delivered") {
      const ref = o.updatedAtISO || o.createdAtISO;
      if (ref && new Date(ref).toDateString() !== hoje) return;
      base.retirado += 1;
      return;
    }
    if (o.status === "received") base.recebido += 1;
    else if (o.status === "preparing") base.preparando += 1;
    else if (o.status === "ready") base.pronto += 1;
  });
  return base;
}

export function tempoAbertoISO(iso, agora = new Date()) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  return formatarDuracaoMin(mins);
}

export const CRM_CFG_PADRAO = { vipPedidos: 5, vipValor: 200, inatividadeDias: 30 };

/** VIP pelas regras do CRM da loja (mesmos critérios do painel de clientes). */
export function clienteEhVip({ telefone, orders = [], configCrm = {} }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel) return false;
  const cfg = { ...CRM_CFG_PADRAO, ...(configCrm || {}) };
  const pagos = orders.filter((o) => {
    if (o.paymentStatus !== "paid" || o.status === "cancelled") return false;
    return String(o.clienteTelefone || "").replace(/\D/g, "") === tel;
  });
  const qtd = pagos.length;
  const total = pagos.reduce((s, o) => s + orderTotal(o), 0);
  return qtd >= (Number(cfg.vipPedidos) || 5) || total >= (Number(cfg.vipValor) || 200);
}

export function nomeClienteDe(pedido, clientes = []) {
  if (pedido?.customer) return pedido.customer;
  const tel = String(pedido?.clienteTelefone || "").replace(/\D/g, "");
  if (!tel) return "";
  const cli = clientes.find((c) => String(c.telefone || "").replace(/\D/g, "") === tel);
  return cli?.nome || "";
}

/** Ícone/estilo da forma a partir do nome cadastrado na loja. */
export function estiloFormaPagamento(nome) {
  const n = (nome || "").toLowerCase();
  if (n.includes("ponto")) return "pontos";
  if (n.includes("pix")) return "pix";
  if (n.includes("dinheiro") || n.includes("espécie") || n.includes("especie")) return "dinheiro";
  if (n.includes("créd") || n.includes("cred")) return "credito";
  if (n.includes("déb") || n.includes("deb")) return "debito";
  if (n.includes("voucher") || n.includes("vale") || n.includes("ticket")) return "voucher";
  return "outro";
}

/**
 * Rótulo curto para caber no botão da forma sem estourar o layout.
 * Só encurta o que é ambíguo por natureza ("Cartão de Crédito" → "Crédito");
 * nomes livres cadastrados pela loja (vales, convênios, cortesias) mantêm o
 * texto original, senão duas formas diferentes virariam o mesmo botão.
 */
export function rotuloFormaCurto(nome) {
  const n = String(nome || "").trim();
  if (!n) return "—";
  const low = n.toLowerCase();
  if (low.includes("pix")) return "PIX";
  if (low.includes("dinheiro") || low.includes("espécie") || low.includes("especie")) return "Dinheiro";
  if (low.includes("créd") || low.includes("cred")) return "Crédito";
  if (low.includes("déb") || low.includes("deb")) return "Débito";
  const limpo = n.replace(/^cart(ã|a)o\s+(de\s+)?/i, "");
  return limpo.length > 16 ? `${limpo.slice(0, 15)}…` : limpo;
}
