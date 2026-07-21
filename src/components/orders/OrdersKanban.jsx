import { useState } from "react";
import OrdersEmptyState from "./OrdersEmptyState";
import OrdersKanbanColumn from "./OrdersKanbanColumn";
import { STATUS_ACCENT } from "./orderStatusColors";

const COLUNAS = [
  { key: "novo", dataKey: "novos", titulo: "Novos", vazio: "Nenhum pedido novo." },
  { key: "preparo", dataKey: "preparo", titulo: "Em preparo", vazio: "Nenhum pedido em preparo." },
  { key: "pronto", dataKey: "prontos", titulo: "Pronto", vazio: "Nenhum pedido pronto no momento." },
];

/**
 * Kanban (tema claro) — 3 colunas lado a lado a partir de 768px (grid
 * auto-fit: cabe 3 quando o espaço permite — ex.: tablet paisagem/
 * desktop — e reduz para 2 sozinho quando não cabe, sem breakpoint fixo
 * frágil); abaixo de 768px vira tabs (uma lista de status por vez, sem
 * nunca comprimir 3 colunas lado a lado num celular). `renderCard(o,
 * variante)` monta o OrderCard já com todas as props por-pedido.
 */
export default function OrdersKanban({ dataColunas, renderCard }) {
  const [tabMobile, setTabMobile] = useState("novo");

  return (
    <div>
      {/* Tabs — só mobile (<768px) */}
      <div role="tablist" aria-label="Status dos pedidos" className="mb-3 flex gap-1.5 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-1.5 md:hidden">
        {COLUNAS.map((c) => {
          const qtd = dataColunas[c.dataKey]?.length || 0;
          const ativo = tabMobile === c.key;
          return (
            <button
              key={c.key} type="button" role="tab" aria-selected={ativo}
              onClick={() => setTabMobile(c.key)}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] ${
                ativo ? "bg-[var(--pp-surface)] text-[var(--pp-text)] shadow-[0_1px_3px_rgba(43,35,32,0.08)]" : "text-[var(--pp-text-muted)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_ACCENT[c.key] }} />
                {c.titulo}
              </span>
              <span className="tabular-nums">{qtd}</span>
            </button>
          );
        })}
      </div>
      <div className="md:hidden" role="tabpanel">
        {(() => {
          const c = COLUNAS.find((x) => x.key === tabMobile);
          const pedidos = dataColunas[c.dataKey] || [];
          return pedidos.length === 0 ? (
            <OrdersEmptyState variante={c.key} titulo={c.vazio} />
          ) : (
            <div className="flex flex-col gap-3">
              {pedidos.map((o) => renderCard(o, c.key))}
            </div>
          );
        })()}
      </div>

      {/* Colunas — >=768px */}
      <div className="hidden gap-4 md:grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {COLUNAS.map((c) => (
          <OrdersKanbanColumn key={c.key} variante={c.key} titulo={c.titulo} pedidos={dataColunas[c.dataKey] || []} renderCard={renderCard} />
        ))}
      </div>
    </div>
  );
}
