import { LayoutGrid, Receipt, Wallet } from "lucide-react";

const ABAS = [
  { id: "conta", label: "Conta", Icon: Receipt, dica: "Produtos e cliente" },
  { id: "salao", label: "Mesa", Icon: LayoutGrid, dica: "Mesas e delivery" },
  { id: "pagamento", label: "Pagar", Icon: Wallet, dica: "Formas e valor" },
];

/**
 * Navegação mobile/tablet do PDV — prioriza Conta (produtos) e Pagar.
 * Desktop (lg+) não usa: as três colunas ficam lado a lado.
 */
export default function PdvMobileNav({ ativo = "conta", onChange, temConta = false, totalLabel = "" }) {
  return (
    <nav
      aria-label="Áreas do PDV"
      className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 pt-1 lg:hidden"
    >
      <div className="grid grid-cols-3 gap-1">
        {ABAS.map(({ id, label, Icon, dica }) => {
          const on = ativo === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange?.(id)}
              aria-current={on ? "page" : undefined}
              title={dica}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-black transition active:scale-[0.98] ${
                on
                  ? "btn-laranja text-[#012E46]"
                  : "bg-[var(--pp-bg)] text-[var(--pp-text-body)]"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {id === "pagamento" && temConta && totalLabel && (
                <span className={`max-w-full truncate text-[10px] font-bold tabular-nums ${on ? "text-white/90" : "text-[var(--pp-primary-text)]"}`}>
                  {totalLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
