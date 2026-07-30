import { Minus, Plus, MoreVertical, PlusCircle } from "lucide-react";
import { formatCurrency, itemDetails, fallbackImage } from "../../../App";

// "Itens consumidos" do PDV — reproduz a tabela do mockup (produto com miniatura
// + descrição, quantidade com stepper, observação, unitário e total). Nesta
// fase o stepper e "Adicionar item" são fiéis ao visual mas DESABILITADOS
// ("em breve"): editar itens no caixa entra numa fase seguinte. Os valores
// (unitário/total) e a observação vêm dos dados reais da conta.
function LinhaItem({ it }) {
  const obs = itemDetails(it);
  const unit = Number(it.price) || 0;
  return (
    <div className="flex items-center gap-3 py-3">
      <img src={it.imageUrl || fallbackImage} alt="" aria-hidden="true" loading="lazy"
        className="h-11 w-11 shrink-0 rounded-xl border border-[var(--pp-border)] object-cover" />
      <div className="flex min-w-0 flex-[2] flex-col">
        <p className="line-clamp-2 text-sm font-bold leading-tight text-[var(--pp-text)]">{it.name}</p>
        {(it.description || obs) && (
          <p className="truncate text-xs text-[var(--pp-text-muted)]">{it.description || obs}</p>
        )}
      </div>

      {/* Quantidade (stepper visual, desabilitado nesta fase) */}
      <div className="flex shrink-0 items-center gap-1" title="Edição de itens em breve">
        <button type="button" disabled aria-label="Diminuir" className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--pp-border)] text-[var(--pp-text-muted)] opacity-60">
          <Minus aria-hidden="true" size={12} />
        </button>
        <span className="w-5 text-center text-sm font-black tabular-nums text-[var(--pp-text)]">{it.quantity}</span>
        <button type="button" disabled aria-label="Aumentar" className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--pp-border)] text-[var(--pp-text-muted)] opacity-60">
          <Plus aria-hidden="true" size={12} />
        </button>
      </div>

      <p className="hidden min-w-0 flex-1 truncate px-1 text-xs text-[var(--pp-text-body)] sm:block" title={obs}>{obs || "—"}</p>
      <p className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-[var(--pp-text-body)] md:block">{formatCurrency(unit)}</p>
      <p className="w-24 shrink-0 text-right text-sm font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(unit * (it.quantity || 1))}</p>
      <button type="button" disabled aria-label="Mais ações" title="Em breve" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--pp-text-muted)] opacity-60">
        <MoreVertical aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export default function CheckoutItemsTable({ itens = [] }) {
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)] md:p-5">
      <h2 className="mb-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Itens consumidos</h2>
      {/* Cabeçalho de colunas (só onde há espaço) */}
      <div className="flex items-center gap-3 border-b border-[var(--pp-border)] pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">
        <span className="w-11 shrink-0" />
        <span className="flex-[2]">Produto</span>
        <span className="w-[92px] shrink-0 text-center">Qtd.</span>
        <span className="hidden flex-1 sm:block">Observação</span>
        <span className="hidden w-20 shrink-0 text-right md:block">Unitário</span>
        <span className="w-24 shrink-0 text-right">Total</span>
        <span className="w-8 shrink-0" />
      </div>

      <div className="divide-y divide-[var(--pp-border)]">
        {itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--pp-text-muted)]">Nenhum item nesta conta.</p>
        ) : itens.map((it, i) => <LinhaItem key={i} it={it} />)}
      </div>

      <button type="button" disabled title="Em breve"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--pp-primary)]/40 py-2.5 text-sm font-bold text-[var(--pp-primary-text)] opacity-80">
        <PlusCircle aria-hidden="true" size={16} /> Adicionar item
      </button>
    </section>
  );
}
