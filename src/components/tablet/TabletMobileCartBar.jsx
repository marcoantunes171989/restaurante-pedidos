import { ShoppingBag, ChevronRight } from "lucide-react";
import { formatCurrency } from "../../App";

// Barra fixa inferior do carrinho — só em tablet-retrato/celular (o desktop
// e o tablet-paisagem já têm o painel permanente, ver TabletCartPanel).
// Some por completo com o carrinho vazio (a ação de carrinho continua
// acessível pelo ícone do cabeçalho).
export default function TabletMobileCartBar({ totalCartItems, total, onAbrir }) {
  if (totalCartItems === 0) return null;
  return (
    <div className="shrink-0 border-t border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 lg:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
      <button type="button" onClick={onAbrir}
        className="flex h-[54px] w-full items-center justify-between gap-3 rounded-2xl bg-[var(--client-primary)] px-4 text-white transition active:scale-[0.98] hover:bg-[var(--client-primary-hover)]">
        <span className="flex items-center gap-2 text-sm font-bold">
          <ShoppingBag aria-hidden="true" size={18} />
          {totalCartItems} {totalCartItems === 1 ? "item" : "itens"} · {formatCurrency(total)}
        </span>
        <span className="flex items-center gap-1 text-sm font-black">Ver carrinho <ChevronRight aria-hidden="true" size={16} /></span>
      </button>
    </div>
  );
}
