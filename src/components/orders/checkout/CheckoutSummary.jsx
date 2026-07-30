import { MinusCircle, PlusCircle } from "lucide-react";
import { formatCurrency } from "../../../App";

// "Resumo financeiro" do PDV — coluna esquerda com os componentes do valor
// (subtotal, taxa de serviço 10%, desconto, acréscimos) e, à direita, o bloco
// de destaque com o TOTAL GERAL (petróleo), o valor já pago e o saldo restante
// (laranja). Desconto/acréscimos são fiéis ao mockup, porém 0,00 nesta fase
// (persistência entra depois). Os demais valores são reais.
export default function CheckoutSummary({ subtotal, taxa, desconto = 0, acrescimo = 0, total, pago = 0, restante }) {
  return (
    <section className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)] md:p-5 lg:grid-cols-2">
      {/* Componentes do valor */}
      <div>
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Resumo financeiro</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--pp-text-body)]">Subtotal</dt>
            <dd className="tabular-nums text-[var(--pp-text)]">{formatCurrency(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--pp-text-body)]">Taxa de serviço (10%)</dt>
            <dd className="tabular-nums text-[var(--pp-text)]">{formatCurrency(taxa)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="inline-flex items-center gap-1.5 text-[var(--pp-danger)]"><MinusCircle aria-hidden="true" size={15} /> Desconto</dt>
            <dd className="tabular-nums font-semibold text-[var(--pp-danger)]">{formatCurrency(desconto)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="inline-flex items-center gap-1.5 text-[var(--pp-success-text)]"><PlusCircle aria-hidden="true" size={15} /> Acréscimos</dt>
            <dd className="tabular-nums font-semibold text-[var(--pp-success-text)]">{formatCurrency(acrescimo)}</dd>
          </div>
        </dl>
      </div>

      {/* Total em destaque */}
      <div className="flex flex-col justify-center rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-4 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Total geral</p>
        <p className="mt-1 text-[34px] font-black leading-none tabular-nums text-[var(--op-nav-accent)]">{formatCurrency(total)}</p>
        <div className="mt-3 space-y-1 border-t border-[var(--pp-border)] pt-3 text-left text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--pp-text-body)]">Valor pago</span>
            <span className="font-bold tabular-nums text-[var(--pp-text)]">{formatCurrency(pago)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Saldo restante</span>
            <span className={`text-lg font-black tabular-nums ${Math.abs(restante) < 0.01 ? "text-[var(--pp-success-text)]" : "text-[var(--pp-primary-text)]"}`}>{formatCurrency(restante)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
