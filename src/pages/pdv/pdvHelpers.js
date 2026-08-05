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

export const MESA_STATUS_META = {
  livre: { label: "Disponível", dot: "bg-[var(--pp-success)]", border: "border-[var(--pp-border)]", ring: "" },
  ocupada: { label: "Ocupada", dot: "bg-[var(--pp-primary)]", border: "border-[var(--pp-primary)]/35", ring: "" },
  pendente: { label: "Pendente", dot: "bg-[var(--pp-warning)]", border: "border-[var(--pp-warning)]/40", ring: "" },
};

export const CANAIS_PDV = [
  { id: "mesa", label: "Mesa" },
  { id: "delivery", label: "Delivery" },
  { id: "comanda", label: "Comanda" },
  { id: "cliente", label: "Cliente" },
  { id: "pedido", label: "Pedido" },
];

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

/** Rótulo curto para caber no botão da forma sem estourar o layout. */
export function rotuloFormaCurto(nome) {
  const n = String(nome || "").trim();
  if (!n) return "—";
  const low = n.toLowerCase();
  if (low.includes("pix")) return "PIX";
  if (low.includes("dinheiro") || low.includes("espécie") || low.includes("especie")) return "Dinheiro";
  if (low.includes("créd") || low.includes("cred")) return "Crédito";
  if (low.includes("déb") || low.includes("deb")) return "Débito";
  if (low.includes("voucher") || low.includes("vale") || low.includes("ticket")) return "Voucher";
  if (low.includes("ponto")) return "Pontos";
  return n.length > 10 ? `${n.slice(0, 9)}…` : n;
}
