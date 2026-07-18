import { motion } from "framer-motion";
import { LogOut, Clock, TrendingUp, Utensils, Bell, CheckCircle2, Hourglass, Receipt, Wallet, CalendarCheck } from "lucide-react";
import OperationalBottomNav from "../components/OperationalBottomNav";

const brand = {
  primary: "#e8622c",
  primaryHover: "#c9501f",
  gold: "#d4a017",
  graphite: "#1a1a1a",
  cream: "#faf9f5",
  success: "#16a34a",
  info: "#2563eb",
};

// Superfície "vidro" reutilizável (cards de KPI + botão Sair + badge
// "Operação em tempo real", sobre o header escuro). O fundo escuro
// translúcido, borda, cor de texto e blur/hover progressivos vêm
// inteiramente de .pp-glass-surface (index.css) via background-color:
// rgba(...) direto na classe. O badge usa a MESMA classe (não uma cópia
// dos valores) e um reset em index.css (@media min-width:768px
// .pp-status-badge.pp-glass-surface) restaura sua aparência original em
// telas >=768px, já que .pp-glass-surface não tem media query própria
// (estiliza o Sair em qualquer largura). Ver comentário completo em
// index.css.
//
// CAUSA RAIZ do "fundo branco" (achada por inspeção real do CSS
// compilado, não presumida): index.css tem regras globais de
// repaint do tema claro — [data-theme="light"] .tema-claro-area
// .bg-white\/10 { background-color:#F5F4F0 !important } e o mesmo para
// .text-white { color:var(--pp-graphite) !important } — criadas para
// re-pintar telas do admin que reaproveitam classes "escuras" dentro de
// áreas claras. Esta tela vive dentro do módulo admin (data-theme="light"
// hardcoded no wrapper do AdminView, App.jsx) e de <div className=
// "tema-claro-area"> (App.jsx, wrapper de /operacional) — então QUALQUER
// elemento aqui com a classe literal `bg-white/10` ou `text-white` era
// hijackado por esse !important, em qualquer breakpoint (não só mobile).
// Antes a solução tentava vencer essa regra com media query/especifi-
// cidade, o que não funciona contra !important. A correção definitiva é
// não usar esses nomes de classe Tailwind reservados no header: cor de
// texto vem de .pp-operational-header (abaixo) e o fundo do badge vem só
// de .pp-glass-surface/.pp-status-badge — nenhum dos dois é alvo das
// regras globais, então o !important nunca entra em jogo.
const GLASS_SURFACE = "pp-glass-surface";

// Shape/placeholder — a tela real recebe `kpis` via props, vindos da API
// (ver OperacaoMobileView em src/App.jsx). Este array só documenta o
// formato esperado e serve de fallback se nada for passado.
const KPIS = [
  { label: "Mesas abertas", value: "8", icon: Utensils },
  { label: "Novos", value: "2", icon: Bell },
  { label: "Em preparo", value: "5", icon: Clock },
  { label: "Prontos", value: "3", icon: CheckCircle2 },
  { label: "Aguardando pagamento", value: "4", icon: Hourglass },
  { label: "Contas em aberto", value: "6", icon: Receipt },
  { label: "Total a receber", value: "R$ 312,00", icon: Wallet },
  { label: "Faturado hoje", value: "R$ 1.847,00", icon: CalendarCheck },
  { label: "Turno atual", value: "R$ 1.847,00", icon: TrendingUp },
];

export default function OperationalCentral({ user = "Administrador", role = "Gestor", onOpen, onExit, active = "central", kpis = KPIS, navItems = [] }) {
  return (
    // paddingTop reserva a área do notch/status bar (env(safe-area-inset-top))
    // — sem isso, em celulares reais (não reproduz em viewport de desktop
    // redimensionado) o topo do cartão escuro fica coberto pela barra de
    // status/entalhe, cortando o título "Central Operacional". Mesmo padrão
    // já usado pelas outras telas cheias deste app (tablet, cozinha, etc.).
    <div className="min-h-screen w-full pb-28" style={{ background: brand.cream, paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">

        {/* HERO HEADER */}
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="pp-operational-header relative overflow-hidden rounded-3xl p-6 md:p-8 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${brand.graphite} 0%, #2a1a12 60%, ${brand.primaryHover} 140%)` }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-2xl"
               style={{ background: brand.primary }} />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className={`${GLASS_SURFACE} pp-status-badge mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium`}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: brand.success }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: brand.success }} />
                </span>
                Operação em tempo real
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Central Operacional</h1>
              <p className="mt-1 text-sm text-white/70">
                {user} · <span style={{ color: brand.gold }}>{role}</span>
              </p>
            </div>
            <button
              onClick={onExit}
              className={`${GLASS_SURFACE} flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium`}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>

          {/* KPI STRIP — 1 coluna em telas bem estreitas, 2 a partir de
              ~400px (mobile "seguro"), 3 a partir de 640px (tablet/desktop);
              9 indicadores ÷ 3 colunas fecha em linhas completas, sem sobra. */}
          <div className="relative mt-6 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.label} className={`${GLASS_SURFACE} pp-kpi-card rounded-2xl p-3`}>
                <k.icon size={18} style={{ color: brand.gold }} />
                <p className="mt-2 text-lg font-bold leading-none">{k.value}</p>
                <p className="pp-kpi-label mt-1 text-[11px] uppercase tracking-wide">{k.label}</p>
              </div>
            ))}
          </div>
        </motion.header>
      </div>

      <OperationalBottomNav items={navItems} active={active} onNavigate={(id) => onOpen?.(id)} />
    </div>
  );
}
