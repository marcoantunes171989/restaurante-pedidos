import { Bike, MapPin, Package } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";

const STATUS_LABEL = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Saiu para entrega",
};

/**
 * Faixa de pedidos delivery ativos — dados reais de pedidos externos.
 */
export default function PdvDeliveryStrip({ pedidos = [], selecionadoId, onSelecionar }) {
  return (
    <section className="shrink-0 border-t border-[var(--pp-border)] pt-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-black text-[var(--pp-text)]">Pedidos Delivery</h2>
        <span className="rounded-full bg-[var(--pp-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--pp-text-body)]">
          {pedidos.length}
        </span>
      </div>

      {pedidos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-5 text-center text-sm text-[var(--pp-text-muted)]">
          Nenhum delivery em andamento no momento.
        </p>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {pedidos.map((p) => {
            const on = selecionadoId === p.id;
            const Icon = /entrega/i.test(p.table || "") ? Bike : /retirada/i.test(p.table || "") ? Package : MapPin;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelecionar?.(p)}
                className={`min-w-[200px] shrink-0 rounded-xl border bg-[var(--pp-surface)] p-3 text-left transition ${
                  on ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_rgba(230,126,34,0.2)]" : "border-[var(--pp-border)] hover:border-[var(--pp-primary)]/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-black text-[var(--op-nav-accent)]">#{p.command || p.id}</p>
                  <Icon size={14} className="text-[var(--pp-text-muted)]" aria-hidden="true" />
                </div>
                <p className="mt-1 truncate text-sm font-bold text-[var(--pp-text)]">{p.customer || "Cliente"}</p>
                <p className="truncate text-[11px] font-semibold text-[var(--pp-text-muted)]">{p.table || "Delivery"}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="rounded-md bg-[var(--pp-bg)] px-1.5 py-0.5 text-[10px] font-black text-[var(--pp-text-body)]">
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                  <span className="text-xs font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(p.total)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
