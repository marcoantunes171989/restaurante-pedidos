import { motion } from "framer-motion";
import {
  ClipboardList, ChefHat, Wine, CreditCard, Home,
  LogOut, Clock, TrendingUp, Utensils, ChevronRight, Activity,
} from "lucide-react";

const brand = {
  primary: "#e8622c",
  primaryHover: "#c9501f",
  gold: "#d4a017",
  graphite: "#1a1a1a",
  cream: "#faf9f5",
  border: "#e7e5e4",
  success: "#16a34a",
  info: "#2563eb",
};

// Shape/placeholder — a tela real recebe `modules`/`kpis` via props, vindos
// da API (ver OperacaoMobileView em src/App.jsx). Estes arrays só documentam
// o formato esperado e servem de fallback se nada for passado.
const MODULES = [
  { id: "pedidos", label: "Pedidos", desc: "Fluxo de pedidos, novos itens e status de atendimento em tempo real.", icon: ClipboardList, tint: "#e8622c", count: 12 },
  { id: "cozinha", label: "Cozinha", desc: "Fila de preparo, prioridades e finalização de pratos.", icon: ChefHat, tint: "#d4a017", count: 5 },
  { id: "bar", label: "Bar", desc: "Bebidas e itens direcionados, com sinalização de urgência.", icon: Wine, tint: "#2563eb", count: 3 },
  { id: "caixa", label: "Caixa", desc: "Pagamentos, fechamento de conta e baixas da operação.", icon: CreditCard, tint: "#16a34a", count: 0 },
];

const KPIS = [
  { label: "Mesas abertas", value: "8", icon: Utensils },
  { label: "Em preparo", value: "5", icon: Clock },
  { label: "Turno atual", value: "R$ 1.847", icon: TrendingUp },
];

const NAV = [
  { id: "central", label: "Central", icon: Home },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  { id: "cozinha", label: "Cozinha", icon: ChefHat },
  { id: "bar", label: "Bar", icon: Wine },
  { id: "caixa", label: "Caixa", icon: CreditCard },
];

export default function OperationalCentral({ user = "Administrador", role = "Gestor", onOpen, onExit, active = "central", modules = MODULES, kpis = KPIS }) {
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
          className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${brand.graphite} 0%, #2a1a12 60%, ${brand.primaryHover} 140%)` }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-2xl"
               style={{ background: brand.primary }} />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
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
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/15"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>

          {/* KPI STRIP */}
          <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                <k.icon size={18} style={{ color: brand.gold }} />
                <p className="mt-2 text-lg font-bold leading-none">{k.value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-white/50">{k.label}</p>
              </div>
            ))}
          </div>
        </motion.header>

        {/* SECTION TITLE */}
        <div className="mt-8 mb-4 flex items-center gap-2">
          <Activity size={16} style={{ color: brand.primary }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: brand.graphite }}>
            Módulos da operação
          </h2>
        </div>

        {/* MODULE CARDS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modules.map((m, i) => (
            <motion.button
              key={m.id}
              onClick={() => onOpen?.(m.id)}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
              className="group relative flex items-center gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm outline-none transition focus-visible:ring-2"
              style={{ borderColor: brand.border, "--tw-ring-color": m.tint }}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: `${m.tint}14`, color: m.tint }}>
                <m.icon size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold" style={{ color: brand.graphite }}>{m.label}</h3>
                  {m.count > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                          style={{ background: m.tint }}>
                      {m.count}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-snug text-zinc-500">{m.desc}</p>
              </div>
              <ChevronRight size={20} className="shrink-0 transition group-hover:translate-x-1"
                            style={{ color: m.tint }} />
            </motion.button>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV — paddingBottom reserva a faixa de gestos/home-indicator
          em iPhones sem botão físico, mesmo padrão das demais telas cheias. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/90 backdrop-blur"
           style={{ borderColor: brand.border, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-5xl items-stretch justify-around px-2">
          {NAV.map((n) => {
            const isActive = active === n.id;
            return (
              <button key={n.id} onClick={() => onOpen?.(n.id)}
                      className="relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition"
                      style={{ color: isActive ? brand.primary : "#9ca3af" }}>
                {isActive && (
                  <motion.span layoutId="nav-indicator"
                    className="absolute top-0 h-0.5 w-8 rounded-full"
                    style={{ background: brand.primary }} />
                )}
                <n.icon size={20} />
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
