import OrderStatusBadge from "./OrderStatusBadge";
import OrderOriginBadge from "./OrderOriginBadge";
import OrdersEmptyState from "./OrdersEmptyState";
import OrderActionButton from "./OrderActionButton";

/**
 * Visualização em Lista (tema claro) — tabela em telas >=768px (coluna
 * "Setor" só a partir de 1024px — reduz colunas secundárias em tablet),
 * cards verticais (reaproveita OrderCard via `renderCard`, mesmo
 * componente do Kanban) abaixo de 768px. `renderCard(o, variante)` e
 * `acaoPrincipal(o)` vêm de CentralDePedidos.jsx — mesma fonte de dados/
 * ações do Kanban, sem lógica duplicada.
 */
export default function OrdersList({ pedidos = [], deriveVariant, renderCard, acaoPrincipal, origemDe, haTxt, numeroPedido, setoresPresentes, vazioTitulo, vazioDescricao }) {
  if (pedidos.length === 0) {
    return <OrdersEmptyState variante="lista" titulo={vazioTitulo} descricao={vazioDescricao} />;
  }

  return (
    <>
      {/* Mobile (<768px) — cards verticais, mesmo componente do Kanban */}
      <div className="flex flex-col gap-3 md:hidden">
        {pedidos.map((o) => renderCard(o, deriveVariant(o)))}
      </div>

      {/* >=768px — tabela; coluna "Setor" só a partir de 1024px */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">
              <th className="px-3 pb-2">Pedido</th>
              <th className="px-3 pb-2">Cliente</th>
              <th className="px-3 pb-2">Origem</th>
              <th className="px-3 pb-2">Status</th>
              <th className="px-3 pb-2">Tempo</th>
              <th className="hidden px-3 pb-2 lg:table-cell">Setor</th>
              <th className="px-3 pb-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((o) => {
              const variante = deriveVariant(o);
              const org = origemDe(o);
              const setores = setoresPresentes(o);
              const [tableBase] = String(o.table || "").split(" · ");
              return (
                <tr key={o.id} className="rounded-xl bg-[var(--pp-surface)] shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
                  <td className="rounded-l-xl px-3 py-3 align-top">
                    <p className="font-bold text-[var(--pp-text)]">#{numeroPedido[o.id] ?? "—"}</p>
                    <p className="text-xs text-[var(--pp-text-muted)]">{tableBase || o.table}</p>
                  </td>
                  <td className="px-3 py-3 align-top font-semibold text-[var(--pp-text)]">{o.customer || "Cliente"}</td>
                  <td className="px-3 py-3 align-top"><OrderOriginBadge origem={org} /></td>
                  <td className="px-3 py-3 align-top"><OrderStatusBadge variante={variante} /></td>
                  <td className="px-3 py-3 align-top tabular-nums text-[var(--pp-text-body)]">{haTxt(o) || "—"}</td>
                  <td className="hidden px-3 py-3 align-top text-[var(--pp-text-body)] lg:table-cell">{setores.join(", ") || "—"}</td>
                  <td className="rounded-r-xl px-3 py-3 text-right align-top">
                    <div className="flex justify-end">
                      <OrderActionButton a={acaoPrincipal(o)} variante={variante} compact />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
