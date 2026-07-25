import { CATEGORIA_ACCENT } from "./accountStatusColors";

// Filtros do Caixa (Todas/Aguardando/Em aberto/Pagas) — segmented
// chips, terracota na opção ativa (mesmo padrão de OrdersViewToggle),
// com um ponto de cor semântica por status (âmbar/azul/verde) como
// pista visual extra, mesmo quando inativo. "Todas" não tem cor
// semântica própria (é a soma), fica neutra.
const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "aguardando", label: "Aguardando" },
  { key: "em_aberto", label: "Em aberto" },
  { key: "pago", label: "Pagas" },
];

export default function CashierStatusFilters({ filtro, onFiltro, counts }) {
  return (
    <div role="tablist" aria-label="Filtro de contas" className="flex flex-wrap items-center gap-2">
      {FILTROS.map((f) => {
        const ativo = filtro === f.key;
        const cnt = counts[f.key] ?? 0;
        const cor = CATEGORIA_ACCENT[f.key];
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onFiltro(f.key)}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] ${
              ativo
                ? "border-transparent btn-laranja text-white"
                : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
            }`}
          >
            {cor && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ativo ? "#fff" : cor }} />}
            {f.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${ativo ? "bg-white/25 text-white" : "bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"}`}>{cnt}</span>
          </button>
        );
      })}
    </div>
  );
}
