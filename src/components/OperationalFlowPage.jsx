import { useMemo, useState } from "react";
import OperationalBottomNav from "./OperationalBottomNav";
import { OperationalBrandLogo } from "./BrandLogo";

/**
 * Casco visual compartilhado das telas operacionais em kanban (Pedidos,
 * Cozinha, Bar) — cabeçalho, KPIs, alternância Kanban/Lista, colunas/lista
 * e nav inferior são idênticos nas três; o que muda entra por prop
 * (título, KPIs, colunas, chips de filtro, conteúdo do card). Toda a
 * lógica de negócio (o que cada card mostra, ações, mutações, filtro por
 * setor) continua nas telas-mãe — este componente só monta o esqueleto.
 */
export default function OperationalFlowPage({
  title,
  flowTitle,
  activeNavId,
  navItems = [],
  onNavigate,
  usuarioNome = "",
  lojaInfo,
  onFechar,
  searchPlaceholder = "Buscar pedido, cliente ou código…",
  renderChips,
  kpis = [],
  kpisVariant,
  columns = [],
  boardVariant,
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

  const kpisCls = `pp-cp-kpis${kpisVariant ? ` pp-cp-kpis--${kpisVariant}` : ""}`;
  const boardCls = `pp-cp-board${boardVariant ? ` pp-cp-board--${boardVariant}` : ""}`;

  return (
    <div className="pp-central-pedidos min-h-screen w-full" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="pp-cp-app">
        <header className="pp-cp-topbar">
          <div className="pp-cp-brand">
            <OperationalBrandLogo />
            <div>
              <h1>{title}</h1>
              <p><span className="pp-cp-dot" />{lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Operador"} · <b style={{ color: "var(--cp-txt-dim)" }}>Online</b></p>
            </div>
          </div>
          <div className="pp-cp-topbar-actions">
            <div className="pp-cp-search">
              🔎 <input placeholder={searchPlaceholder} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button className="pp-cp-icon-btn" title="Notificações" type="button">
              🔔{notificacoes > 0 && <span className="pp-cp-badge">{notificacoes}</span>}
            </button>
            <button className="pp-cp-icon-btn" title="Configurações" type="button">⚙️</button>
            <button className="pp-cp-logout" onClick={onFechar} type="button">✕ Sair</button>
          </div>
        </header>

        {renderChips?.()}

        <div className={kpisCls}>
          {kpis.map((k) => (
            <div key={k.key} className="pp-cp-kpi" style={{ "--cp-accent": k.accent, "--cp-accent-soft": k.accentSoft }}>
              <div className="pp-cp-bar" />
              <div className="pp-cp-kpi-top">
                <div className="pp-cp-kicon">{k.icon}</div>
                {k.trend != null && <span className="pp-cp-trend">{k.trend}</span>}
              </div>
              <div className="pp-cp-num">{k.value}</div>
              <div className="pp-cp-lbl">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="pp-cp-board-head">
          <h2>{flowTitle}</h2>
          <div className="pp-cp-view-toggle">
            <button className={view === "kanban" ? "is-active" : ""} onClick={() => setView("kanban")} type="button">Kanban</button>
            <button className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")} type="button">Lista</button>
          </div>
        </div>

        {view === "kanban" ? (
          <div className={boardCls}>
            {columns.map((col) => {
              const itens = colunasFiltradas[col.key] || [];
              return (
                <div className="pp-cp-col" key={col.key}>
                  <div className="pp-cp-col-head">
                    <span className="pp-cp-cd" style={{ background: col.dot }} />
                    <h3>{col.label}</h3>
                    <span className="pp-cp-cn">{itens.length}</span>
                  </div>
                  {itens.length === 0 ? (
                    <div className="pp-cp-empty"><div className="pp-cp-e-ic">{col.vazio.ic}</div><p>{col.vazio.txt}</p></div>
                  ) : itens.map((o) => renderCard(o, col.variante))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pp-cp-list">
            {listaFiltrada.length === 0 && (
              <div className="pp-cp-empty"><div className="pp-cp-e-ic">{emptyListMessage.ic}</div><p>{emptyListMessage.txt}</p></div>
            )}
            {listaFiltrada.map((o) => renderCard(o, deriveListVariant(o)))}
          </div>
        )}
      </div>

      <OperationalBottomNav items={navItems} active={activeNavId} onNavigate={onNavigate} />
    </div>
  );
}
