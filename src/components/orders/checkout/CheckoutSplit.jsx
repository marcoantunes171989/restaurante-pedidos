import { Users, ListChecks, Pencil, Clock4 } from "lucide-react";
import { formatCurrency } from "../../../App";

// "Divisão da conta" do PDV. "Dividir igualmente" é funcional (valor por pessoa
// = total / nº de pessoas); os demais modos (por item, valor personalizado,
// pagamento parcial) são fiéis ao mockup, porém desabilitados nesta fase.
const MODOS = [
  { id: "igual", label: "Dividir igualmente", icon: Users, ativoPadrao: true },
  { id: "item", label: "Dividir por item", icon: ListChecks },
  { id: "personalizado", label: "Valor personalizado", icon: Pencil },
  { id: "parcial", label: "Pagamento parcial", icon: Clock4 },
];

export default function CheckoutSplit({ total, pessoas, onPessoas }) {
  const valorPorPessoa = pessoas > 0 ? total / pessoas : total;
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Divisão da conta</h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {MODOS.map(({ id, label, icon: Icon, ativoPadrao }) => (
          <button key={id} type="button" disabled={!ativoPadrao} aria-pressed={ativoPadrao} title={ativoPadrao ? undefined : "Em breve"}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[11px] font-bold leading-tight transition-colors ${
              ativoPadrao ? "btn-laranja border-transparent text-white" : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] opacity-70"
            }`}>
            <Icon aria-hidden="true" size={18} />
            <span className="min-w-0">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Pessoas</p>
          <div className="flex flex-col gap-2">
            {[2, 3, 4].map((n) => {
              const on = n === pessoas;
              return (
                <button key={n} type="button" onClick={() => onPessoas(n)} aria-pressed={on}
                  className={`flex min-h-[40px] items-center justify-center rounded-xl border text-sm font-bold transition-colors ${
                    on ? "btn-laranja border-transparent text-white" : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
                  }`}>
                  {n} pessoas
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3 text-center">
          <p className="text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Valor por pessoa</p>
          <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-2xl font-black tabular-nums text-[var(--op-nav-accent)]">
            <Users aria-hidden="true" size={18} /> {formatCurrency(valorPorPessoa)}
          </p>
          <p className="text-[11px] text-[var(--pp-text-muted)]">por pessoa</p>
          <p className="mt-2 border-t border-[var(--pp-border)] pt-2 text-sm font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(total)}</p>
          <p className="text-[11px] text-[var(--pp-text-muted)]">total da conta</p>
        </div>
      </div>
    </section>
  );
}
