import { Bike, Clock, MapPin, Package } from "lucide-react";
import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";

const STATUS_META = {
  received: { label: "Recebido", chip: "bg-[#E0F0F4] text-[#0F4C5C]" },
  preparing: { label: "Em preparo", chip: "bg-[#FCE8D4] text-[#B3600E]" },
  ready: { label: "Pronto", chip: "bg-[#DFF3E6] text-[#1F7A3D]" },
  delivered: { label: "Saiu para entrega", chip: "bg-[#EDF0F4] text-[#52606D]" },
};

/**
 * Canal Delivery — cards em grade com a informação na ordem que o caixa lê:
 * código e status, cliente, itens, tempo e valor.
 */
export default function PdvDeliveryStrip({ pedidos = [], selecionadoId, onSelecionar, agora }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
        <h2 className="text-[13px] font-black text-[var(--pp-text)]">
          Delivery em andamento
          <span className="ml-1.5 font-bold text-[var(--pp-text-muted)]">{pedidos.length}</span>
        </h2>
      </div>

      {pedidos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-6 text-center text-[12px] text-[var(--pp-text-muted)]">
          Nenhum pedido delivery em andamento.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:gap-2">
          {pedidos.map((p) => {
            const on = selecionadoId === p.id;
            const Icon = /entrega/i.test(p.table || "") ? Bike : /retirada/i.test(p.table || "") ? Package : MapPin;
            const status = STATUS_META[p.status] || { label: p.status, chip: "bg-[var(--pp-bg)] text-[var(--pp-text-body)]" };
            const itens = (p.items || []).map((it) => `${it.quantity}x ${it.name}`).join(" · ");
            const tempo = tempoAbertoISO(p.createdAtISO, agora);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelecionar?.(p)}
                className={`flex flex-col gap-1 rounded-xl border bg-[var(--pp-surface)] p-2 text-left transition active:scale-[0.99] ${
                  on ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_var(--pp-primary-soft)]" : "border-[var(--pp-border)] hover:border-[var(--pp-primary)]"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-[10px] font-black text-[var(--op-nav-accent)]">#{p.command || p.id}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${status.chip}`}>
                    {status.label}
                  </span>
                </div>

                <p className="truncate text-[12px] font-black text-[var(--pp-text)]">{p.customer || "Cliente"}</p>

                <p className="line-clamp-2 text-[10px] font-semibold leading-snug text-[var(--pp-text-muted)]">
                  {itens || "Sem itens lançados"}
                </p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
                  <span className="inline-flex min-w-0 items-center gap-1 text-[9px] font-bold text-[var(--pp-text-muted)]">
                    <Icon size={10} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{p.table || "Delivery"}</span>
                    {tempo && (
                      <>
                        <Clock size={10} className="ml-0.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{tempo}</span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(p.total)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
