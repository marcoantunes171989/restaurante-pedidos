import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { OperationalBrandLogo } from "./BrandLogo";

// Mesmos tons hex já usados em .pp-operational-header/.pp-glass-surface/
// .pp-kpi-card (index.css, Central Operacional) — repetidos aqui como
// literais (não como import de src/pages/OperationalCentral.jsx) para não
// mexer naquele arquivo; garante a MESMA paleta sem alterar a Central.
const brand = { primary: "#e8622c", primaryHover: "#c9501f", gold: "#d4a017", graphite: "#1a1a1a" };
const GLASS = "pp-glass-surface";

/**
 * Cabeçalho escuro compartilhado por Pedidos, Cozinha, Bar e Caixa —
 * gradiente/logo/badge "Online"/busca/notificações/configurações/Sair +
 * faixa de KPIs, tudo reaproveitando as classes da Central Operacional
 * (.pp-operational-header/.pp-glass-surface/.pp-kpi-card/.pp-kpi-label/
 * .pp-status-badge). Extraído de OperationalDarkPage.jsx (Pedidos/
 * Cozinha/Bar) para o Caixa também reaproveitar — o Caixa NÃO usa
 * OperationalDarkPage inteiro (não é um kanban), só este cabeçalho.
 * `busca`/`onBuscaChange` e `kpis` são controlados pela tela-mãe.
 */
export default function OperationalDarkHeader({
  title,
  usuarioNome = "",
  lojaInfo,
  onFechar,
  nivelAcesso = "",
  searchPlaceholder = "Buscar pedido, cliente ou código…",
  busca,
  onBuscaChange,
  notificacoes = 0,
  kpis = [],
  kpiGridClassName = "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3",
}) {
  return (
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
            🔎 <input placeholder={searchPlaceholder} value={busca} onChange={(e) => onBuscaChange(e.target.value)} />
          </div>
          <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Notificações" type="button">
            🔔{notificacoes > 0 && <span className="pp-pd-notif-badge">{notificacoes}</span>}
          </button>
          <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Configurações" type="button">⚙️</button>
        </div>

        {/* KPI STRIP — mesmas classes de KPI da Central (pp-glass-surface/pp-kpi-card/pp-kpi-label) */}
        <div className={kpiGridClassName}>
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
  );
}
