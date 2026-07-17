import { useMemo, useState } from "react";
import OperationalBottomNav from "./OperationalBottomNav";
import OperationalDarkHeader from "./OperationalDarkHeader";

// Mesmos tons hex já usados em .pp-operational-header/.pp-glass-surface/
// .pp-kpi-card (index.css, Central Operacional) — repetidos aqui como
// literais (não como import de src/pages/OperationalCentral.jsx) para não
// mexer naquele arquivo; garante a MESMA paleta sem alterar a Central.
const brand = { graphite: "#1a1a1a" };
const GLASS = "pp-glass-surface";

/**
 * Casco visual escuro compartilhado por Pedidos, Cozinha e Bar (as três
 * telas kanban padronizadas com a Central Operacional): cabeçalho (via
 * OperationalDarkHeader, também usado pelo Caixa) + board Kanban/Lista —
 * tudo reaproveitando as classes da Central Operacional
 * (.pp-operational-header/.pp-glass-surface/.pp-kpi-card/.pp-kpi-label/
 * .pp-status-badge) mais as classes novas pp-pd-* (index.css) para a
 * área de board/cards, que a Central não tem. A lógica de negócio
 * (dados, mutações, ações por card) fica 100% nas telas-mãe, passada via
 * `renderCard`/`searchMatch`/`deriveListVariant` — este componente só
 * monta o esqueleto.
 */
export default function OperationalDarkPage({
  title,
  flowTitle,
  activeNavId,
  navItems = [],
  onNavigate,
  usuarioNome = "",
  lojaInfo,
  onFechar,
  nivelAcesso = "",
  searchPlaceholder = "Buscar pedido, cliente ou código…",
  kpis = [],
  columns = [],
  dataColumns = {},
  dataList = [],
  searchMatch,
  renderCard,
  deriveListVariant,
  emptyListMessage,
}) {
  const [busca, setBusca] = useState("");
  const [view, setView] = useState("kanban");

  const buscaNorm = busca.trim().toLowerCase();
  const bate = (o) => !buscaNorm || searchMatch(o, buscaNorm);

  const colunasFiltradas = useMemo(() => {
    const out = {};
    for (const col of columns) out[col.key] = (dataColumns[col.key] || []).filter(bate);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataColumns, columns, buscaNorm]);

  const listaFiltrada = useMemo(() => dataList.filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataList, buscaNorm]);

  const notificacoes = colunasFiltradas.novos?.length || 0;

  return (
    <div className="pp-pd-root" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">

        <OperationalDarkHeader
          title={title}
          usuarioNome={usuarioNome}
          lojaInfo={lojaInfo}
          onFechar={onFechar}
          nivelAcesso={nivelAcesso}
          searchPlaceholder={searchPlaceholder}
          busca={busca}
          onBuscaChange={setBusca}
          notificacoes={notificacoes}
          kpis={kpis}
        />

        {/* Fluxo — mesmo fundo/bordas/paleta escura da Central (card
            próprio, mesma família de gradiente do header acima), já que
            a Central não tem um board para reaproveitar 1:1. */}
        <div
          className="pp-operational-header relative mt-6 overflow-hidden rounded-3xl p-6 shadow-lg md:p-8"
          style={{ background: `linear-gradient(160deg, ${brand.graphite} 0%, #241c15 100%)` }}
        >
          <div className="pp-pd-board-head">
            <h2>{flowTitle}</h2>
            <div className={`${GLASS} pp-pd-toggle rounded-xl`}>
              <button className={view === "kanban" ? "is-active" : ""} onClick={() => setView("kanban")} type="button">Kanban</button>
              <button className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")} type="button">Lista</button>
            </div>
          </div>

          {view === "kanban" ? (
            <div className="pp-pd-board">
              {columns.map((col) => {
                const itens = colunasFiltradas[col.key] || [];
                return (
                  <div className="pp-pd-col" key={col.key}>
                    <div className="pp-pd-col-head">
                      <span className="pp-pd-cd" style={{ background: col.dot }} />
                      <h3>{col.label}</h3>
                      <span className="pp-pd-cn">{itens.length}</span>
                    </div>
                    {itens.length === 0 ? (
                      <div className="pp-pd-empty"><div className="pp-pd-e-ic">{col.vazio.ic}</div><p>{col.vazio.txt}</p></div>
                    ) : itens.map((o) => renderCard(o, col.variante))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pp-pd-list">
              {listaFiltrada.length === 0 && (
                <div className="pp-pd-empty"><div className="pp-pd-e-ic">{emptyListMessage.ic}</div><p>{emptyListMessage.txt}</p></div>
              )}
              {listaFiltrada.map((o) => renderCard(o, deriveListVariant(o)))}
            </div>
          )}
        </div>
      </div>

      <OperationalBottomNav items={navItems} active={activeNavId} onNavigate={onNavigate} />
    </div>
  );
}
