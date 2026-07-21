// ════════════════════════════════════════════════════════════
//  Selo de status do pedido (tema claro) — Novo/Em preparo/Pronto.
//  Mesma semântica de cor já usada na Central Operacional
//  (OperationalMetricCard: info=recebido, warning=em preparo,
//  success=pronto) e documentada em docs/design-tokens.md. O texto do
//  selo comunica o status por PALAVRA, não só por cor.
// ════════════════════════════════════════════════════════════
const VARIANTE = {
  novo: { label: "Novo", bg: "bg-[var(--pp-info-soft)]", text: "text-[var(--pp-info)]" },
  preparo: { label: "Em preparo", bg: "bg-[var(--pp-warning-soft)]", text: "text-[var(--pp-warning-text)]" },
  pronto: { label: "Pronto", bg: "bg-[var(--pp-success-soft)]", text: "text-[var(--pp-success-text)]" },
};

export default function OrderStatusBadge({ variante }) {
  const v = VARIANTE[variante] || VARIANTE.novo;
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${v.bg} ${v.text}`}>
      {v.label}
    </span>
  );
}
