import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import OperationalBottomNav from "./OperationalBottomNav";
import { OperationalBrandLogo } from "./BrandLogo";

// Mesmos tons hex já usados em .pp-operational-header/.pp-glass-surface/
// .pp-kpi-card (index.css, Central Operacional) — repetidos aqui como
// literais (não como import de src/pages/OperationalCentral.jsx) para não
// mexer naquele arquivo; garante a MESMA paleta sem alterar a Central.
const brand = { primary: "#e8622c", primaryHover: "#c9501f", gold: "#d4a017", graphite: "#1a1a1a" };
const GLASS = "pp-glass-surface";

/**
 * Casco visual escuro compartilhado por Pedidos e Cozinha (as duas telas
 * padronizadas com a Central Operacional): cabeçalho com gradiente/logo/
 * badge "Online"/busca/notificações/configurações/Sair, KPIs e board
 * Kanban/Lista — tudo reaproveitando as classes da Central Operacional
 * (.pp-operational-header/.pp-glass-surface/.pp-kpi-card/.pp-kpi-label/
 * .pp-status-badge) mais as classes novas pp-pd-* (index.css) para a
 * área de board/cards, que a Central não tem. Bar continua no tema claro
 * (CentralDoSetor.jsx) — não usa este componente. A lógica de negócio
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

        {/* HERO HEADER — mesmo gradiente/vidro/Sair da Central Operacional */}
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="pp-operational-header relative overflow-hidden rounded-3xl p-6 shadow-lg md:p-8"
          style={{ background: `linear-gradient(135deg, ${brand.graphite} 0%, #2a1a12 60%, ${brand.primaryHover} 140%)` }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-2xl" style={{ background: brand.primary }} />

          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <OperationalBrandLogo />
                <div className="min-w-0">
                  <div className={`${GLASS} pp-status-badge mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium`}>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16a34a] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16a34a]" />
                    </span>
                    Online
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">
                    {lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Operador"}{nivelAcesso ? <> · <span style={{ color: brand.gold }}>{nivelAcesso}</span></> : ""}
                  </p>
                </div>
              </div>
              <button onClick={onFechar} type="button" className={`${GLASS} flex shrink-0 items-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium sm:self-auto`}>
                <LogOut size={16} /> Sair
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className={`${GLASS} pp-pd-search rounded-xl`}>
                🔎 <input placeholder={searchPlaceholder} value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Notificações" type="button">
                🔔{notificacoes > 0 && <span className="pp-pd-notif-badge">{notificacoes}</span>}
              </button>
              <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Configurações" type="button">⚙️</button>
            </div>

            {/* KPI STRIP — mesmas classes de KPI da Central (pp-glass-surface/pp-kpi-card/pp-kpi-label) */}
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
              {kpis.map((k) => (
                <div key={k.key} className={`${GLASS} pp-kpi-card rounded-2xl p-3`}>
                  <k.Icon size={18} style={{ color: brand.gold }} />
                  <p className="mt-2 text-lg font-bold leading-none">{k.value}</p>
                  <p className="pp-kpi-label mt-1 text-[11px] uppercase tracking-wide">{k.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.header>

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
