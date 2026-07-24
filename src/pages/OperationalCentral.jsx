import {
  Clock, TrendingUp, Utensils, Bell, CheckCircle2, Hourglass, Receipt, Wallet,
  CalendarCheck, ChevronRight,
} from "lucide-react";
import OperationalHeader from "../components/OperationalHeader";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OperationalMetricCard from "../components/OperationalMetricCard";

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

  return (
    // paddingTop reserva a área do notch/status bar (env(safe-area-inset-top))
    // — sem isso, em celulares reais (não reproduz em viewport de desktop
    // redimensionado) o topo do cartão fica coberto pela barra de
    // status/entalhe, cortando o título "Central Operacional". Mesmo padrão
    // já usado pelas outras telas cheias deste app (tablet, cozinha, etc.).
    // pb-28 reserva espaço pra bottom nav fixa não cobrir o fim do conteúdo.
    <div className="min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-6 md:px-6 md:pt-10 lg:px-10">

        {/* CABEÇALHO — componente unificado (ver src/components/OperationalHeader). */}
        <OperationalHeader
          titulo="Central Operacional"
          statusLabelOnline="Operação em tempo real"
          comLogo={false}
          onFechar={onExit}
          meta={
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--pp-text-body)]">
              <span className="font-semibold text-[var(--pp-text)]">{user}</span>
              <span aria-hidden="true" className="text-[var(--pp-border)]">·</span>
              <span className="font-semibold text-[var(--op-nav-accent)]">{role}</span>
            </p>
          }
        />

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
