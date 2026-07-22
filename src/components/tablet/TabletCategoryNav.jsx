// Navegação de categorias — menu lateral claro em desktop/tablet-paisagem
// (>= lg) e tira horizontal fixa em tablet-retrato/celular (< lg). Ambas
// só indicam visualmente a seção visível (scroll-spy do TabletView) — não
// disparam nova busca nem recarregam a lista.
export function TabletCategorySidebar({ categorias, categoriaAtiva, onSelecionar, iconeCategoria }) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--client-border)] bg-[var(--client-surface)] lg:flex xl:w-[248px]">
      <nav aria-label="Categorias do cardápio" className="scrollbar-none flex-1 space-y-1 overflow-y-auto p-3">
        {categorias.map((c) => {
          const sel = categoriaAtiva === c;
          return (
            <button key={c} type="button" onClick={() => onSelecionar(c)} aria-pressed={sel}
              className={`relative flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${sel ? "border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-transparent text-[var(--client-text-secondary)] hover:bg-[var(--client-background-soft)]"}`}>
              {sel && <span aria-hidden="true" className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-[var(--client-primary)]" />}
              <span aria-hidden="true" className="text-base leading-none">{iconeCategoria(c)}</span>
              <span className="truncate">{c === "Todos" ? "Destaques" : c}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function TabletCategoryStrip({ categorias, categoriaAtiva, onSelecionar, iconeCategoria }) {
  return (
    <nav aria-label="Categorias do cardápio"
      className="sticky top-0 z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-2.5 lg:hidden">
      {categorias.map((c) => {
        const sel = categoriaAtiva === c;
        return (
          <button key={c} type="button" onClick={() => onSelecionar(c)} aria-pressed={sel}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${sel ? "border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] text-[var(--client-text-secondary)]"}`}>
            <span aria-hidden="true">{iconeCategoria(c)}</span> {c === "Todos" ? "Destaques" : c}
          </button>
        );
      })}
    </nav>
  );
}
