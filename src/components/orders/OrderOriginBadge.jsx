import { Bike, UtensilsCrossed, Clock } from "lucide-react";

// ════════════════════════════════════════════════════════════
//  Origem + tempo decorrido do pedido (tema claro). `origemDe(o)` (prop
//  vinda de OperacaoMobileView/App.jsx) já resolve a origem real do
//  pedido em só 2 buckets — "Delivery" (externo) ou "Mesa / QR" — nunca
//  inventamos uma 3ª categoria aqui; só trocamos o emoji (org.ic) por um
//  ícone lucide equivalente, sem tocar a função de origem em si.
// ════════════════════════════════════════════════════════════
export default function OrderOriginBadge({ origem, tempoTexto }) {
  const Icon = origem.l === "Delivery" ? Bike : UtensilsCrossed;
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--pp-text-muted)]">
      <Icon aria-hidden="true" size={13} />
      {origem.l}
      {tempoTexto && (
        <>
          <span aria-hidden="true" className="text-[var(--pp-border)]">·</span>
          <Clock aria-hidden="true" size={12} />
          <span className="tabular-nums">{tempoTexto}</span>
        </>
      )}
    </span>
  );
}
