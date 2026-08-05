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

/** Situação visual da mesa no salão (mockup PDV). */
export function situacaoMesaVisual(conta) {
  if (!conta) return "livre";
  if (conta.paymentStatus === "paid" || conta.situacao === "finalizada") return "finalizada";
  if (conta.solicitada || conta.situacao === "solicitado") return "pendente";
  if (conta.pendentePreparo) return "ocupada";
  return "ocupada";
}

export const MESA_STATUS_META = {
  livre: { label: "Livre", dot: "bg-[var(--pp-success)]", border: "border-[var(--pp-border)]", ring: "" },
  ocupada: { label: "Ocupada", dot: "bg-[var(--pp-primary)]", border: "border-[var(--pp-primary)]/35", ring: "" },
  pendente: { label: "Pendente", dot: "bg-[var(--pp-warning)]", border: "border-[var(--pp-warning)]/40", ring: "" },
  finalizada: { label: "Finalizada", dot: "bg-[var(--pp-success)]", border: "border-[var(--pp-success)]/30", ring: "" },
};

export function tempoAbertoISO(iso, agora = new Date()) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  return formatarDuracaoMin(mins);
}
