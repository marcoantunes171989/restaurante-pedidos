import { motion, useReducedMotion } from "framer-motion";
import {
  LogOut, Clock, TrendingUp, Utensils, Bell, CheckCircle2, Hourglass, Receipt, Wallet,
  CalendarCheck, ChevronRight,
} from "lucide-react";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OperationalMetricCard from "../components/OperationalMetricCard";
import { useOnline } from "../lib/useOnline";

// Shape/placeholder — a tela real recebe `kpis` via props, vindos da API
// (ver OperacaoMobileView em src/App.jsx). Este array só documenta o
// formato esperado e serve de fallback se nada for passado. `variant`
// define a cor semântica de cada card (ver OperationalMetricCard) — segue
// a mesma semântica de status de pedido já documentada em
// docs/design-tokens.md (info=recebido, warning=em preparo, success=pronto).
const KPIS = [
  { label: "Mesas abertas", value: "8", icon: Utensils, variant: "neutral" },
  { label: "Novos", value: "2", icon: Bell, variant: "info" },
  { label: "Em preparo", value: "5", icon: Clock, variant: "warning" },
  { label: "Prontos", value: "3", icon: CheckCircle2, variant: "success" },
  { label: "Aguardando pagamento", value: "4", icon: Hourglass, variant: "warning" },
  { label: "Contas em aberto", value: "6", icon: Receipt, variant: "neutral" },
];
const KPIS_FINANCEIRO = [
  { label: "Total a receber", value: "R$ 312,00", icon: Wallet, variant: "financial" },
  { label: "Faturado hoje", value: "R$ 1.847,00", icon: CalendarCheck, variant: "financial" },
  { label: "Turno atual", value: "R$ 1.847,00", icon: TrendingUp, variant: "financial" },
];

export default function OperationalCentral({ user = "Administrador", role = "Acesso total", onOpen, onExit, active = "central", kpis = KPIS, kpisFinanceiro = KPIS_FINANCEIRO, modules = [], navItems = [] }) {
  const online = useOnline();
  const reduzMovimento = useReducedMotion();

  return (
    // paddingTop reserva a área do notch/status bar (env(safe-area-inset-top))
    // — sem isso, em celulares reais (não reproduz em viewport de desktop
    // redimensionado) o topo do cartão fica coberto pela barra de
    // status/entalhe, cortando o título "Central Operacional". Mesmo padrão
    // já usado pelas outras telas cheias deste app (tablet, cozinha, etc.).
    // pb-28 reserva espaço pra bottom nav fixa não cobrir o fim do conteúdo.
    <div className="min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-6 md:px-6 md:pt-10 lg:px-10">

        {/* CABEÇALHO */}
        <motion.header
          initial={reduzMovimento ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-[20px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-5 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.05)] md:p-7"
        >
          {/* Faixa de detalhe azul petróleo — acento de identidade/navegação (paleta oficial), sem transformar o cabeçalho num bloco escuro */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--op-nav-accent)]" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div
                role="status"
                className={`mb-2.5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${
                  online
                    ? "border-[var(--pp-success)]/25 bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
                    : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"
                }`}
              >
                {online && (
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    {!reduzMovimento && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pp-success)] opacity-75" />}
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--pp-success)]" />
                  </span>
                )}
                {online ? "Operação em tempo real" : "Sem conexão"}
              </div>
              <h1 className="text-[26px] font-black leading-tight tracking-tight text-[var(--pp-text)] md:text-[32px]">Central Operacional</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--pp-text-body)]">
                <span className="font-semibold text-[var(--pp-text)]">{user}</span>
                <span aria-hidden="true" className="text-[var(--pp-border)]">·</span>
                <span className="font-semibold text-[var(--op-nav-accent)]">{role}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-2.5 text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:border-[var(--pp-danger)]/30 hover:bg-[var(--pp-danger-soft)] hover:text-[var(--pp-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]"
            >
              <LogOut aria-hidden="true" size={16} />
              <span>Sair</span>
            </button>
          </div>
        </motion.header>

        {/* RESUMO OPERACIONAL */}
        <section aria-label="Resumo operacional" className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Operação agora</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {kpis.map((k) => (
              <OperationalMetricCard key={k.label} title={k.label} value={k.value} icon={k.icon} variant={k.variant} loading={k.loading} description={k.description} />
            ))}
          </div>
        </section>

        {/* RESUMO FINANCEIRO */}
        <section aria-label="Resumo financeiro" className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Financeiro</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpisFinanceiro.map((k) => (
              <OperationalMetricCard key={k.label} title={k.label} value={k.value} icon={k.icon} variant="financial" loading={k.loading} description={k.description} />
            ))}
          </div>
        </section>

        {/* ACESSO RÁPIDO AOS MÓDULOS — reaproveita os dados já calculados
            (contagem real por módulo) em vez de duplicar lógica; só
            aparece se houver mais de um módulo liberado para o usuário
            (mesma regra de navItems em OperacaoMobileView/App.jsx). */}
        {modules.length > 0 && (
          <section aria-label="Acesso rápido aos módulos" className="mt-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Acesso rápido</h2>
            <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 lg:grid-cols-4">
              {modules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpen?.(m.id)}
                  className="group flex items-center gap-3 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 text-left shadow-[0_1px_2px_rgba(43,35,32,0.04),0_2px_8px_rgba(43,35,32,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--op-nav-accent)]/30 hover:shadow-[0_4px_16px_rgba(43,35,32,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-nav-accent)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--op-nav-accent-soft)]">
                    {m.icon && <m.icon aria-hidden="true" size={20} className="text-[var(--op-nav-accent)]" strokeWidth={2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold text-[var(--pp-text)]">{m.label}</span>
                      {typeof m.count === "number" && m.count > 0 && (
                        <span className="rounded-full bg-[var(--op-nav-accent)] px-1.5 py-0.5 text-[10px] font-black text-white">{m.count}</span>
                      )}
                    </span>
                    {m.desc && <span className="mt-0.5 block truncate text-xs text-[var(--pp-text-muted)]">{m.desc}</span>}
                  </span>
                  <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-[var(--pp-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <OperationalBottomNav items={navItems} active={active} onNavigate={(id) => onOpen?.(id)} />
    </div>
  );
}
