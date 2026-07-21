import OrdersEmptyState from "./OrdersEmptyState";
import { STATUS_ACCENT } from "./orderStatusColors";

const VAZIO_TXT = {
  novo: "Nenhum pedido novo.",
  preparo: "Nenhum pedido em preparo.",
  pronto: "Nenhum pedido pronto no momento.",
};

/**
 * Coluna do Kanban (tema claro) — usada só em desktop/tablet (>=768px,
 * ver OrdersKanban.jsx). Cabeçalho fixo dentro da coluna quando a lista
 * rola internamente (max-height fixo + overflow-y-auto), sem depender
 * de altura de viewport frágil. `renderCard(o, variante)` monta o
 * OrderCard já com todas as props por-pedido (mesmo padrão do
 * `renderCard` original de CentralDePedidos.jsx).
 */
export default function OrdersKanbanColumn({ variante, titulo, pedidos = [], renderCard }) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3.5">
      <div className="sticky top-0 z-[1] mb-3 flex items-center gap-2.5 rounded-xl bg-[var(--pp-bg)] px-1 py-1">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_ACCENT[variante] }} />
        <h3 className="flex-1 text-sm font-bold text-[var(--pp-text)]">{titulo}</h3>
        <span className="rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--pp-text-body)]">{pedidos.length}</span>
      </div>

      {pedidos.length === 0 ? (
        <OrdersEmptyState variante={variante} titulo={VAZIO_TXT[variante]} />
      ) : (
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-0.5">
          {pedidos.map((o) => renderCard(o, variante))}
        </div>
      )}
    </div>
  );
}
