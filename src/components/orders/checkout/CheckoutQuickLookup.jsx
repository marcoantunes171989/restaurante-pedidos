import { Utensils, Receipt, User, ClipboardList, BarChart3, Store, FileText, Clock3, TrendingUp, ChevronRight } from "lucide-react";

// Coluna esquerda do PDV — "Consulta rápida" (seletor visual, com a conta atual
// destacada) + "Indicadores do turno" (dados reais derivados da operação do
// caixa). Nesta fase a consulta rápida é fiel ao mockup e realça o tipo da
// conta aberta; a troca de conta continua acontecendo pela lista do caixa.
const CONSULTA = [
  { id: "mesa", label: "Mesa", icon: Utensils },
  { id: "comanda", label: "Comanda", icon: Receipt },
  { id: "cliente", label: "Cliente", icon: User },
  { id: "pedido", label: "Pedido", icon: ClipboardList },
];

function Indicador({ icon: Icon, label, valor, destaque }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--op-nav-accent-soft)] text-[var(--op-nav-accent)]">
        <Icon aria-hidden="true" size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--pp-text-body)]">{label}</span>
      <span className={`shrink-0 text-right text-sm font-black tabular-nums ${destaque ? "text-[var(--pp-success-text)]" : "text-[var(--pp-text)]"}`}>{valor}</span>
    </div>
  );
}

export default function CheckoutQuickLookup({ tipoAtivo = "mesa", indicadores }) {
  const { mesasOcupadas, mesasTotal, comandasEmAberto, contasAguardando, faturamentoTurno } = indicadores;
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Consulta rápida</h2>
        <div className="flex flex-col gap-2">
          {CONSULTA.map(({ id, label, icon: Icon }) => {
            const ativo = id === tipoAtivo;
            return (
              <button key={id} type="button" aria-pressed={ativo}
                className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
                  ativo ? "btn-laranja text-white" : "border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
                }`}>
                <Icon aria-hidden="true" size={18} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
        <h2 className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
          <BarChart3 aria-hidden="true" size={14} /> Indicadores do turno
        </h2>
        <div className="divide-y divide-[var(--pp-border)]">
          <Indicador icon={Store} label="Mesas ocupadas" valor={`${mesasOcupadas}${mesasTotal ? ` / ${mesasTotal}` : ""}`} />
          <Indicador icon={FileText} label="Comandas em aberto" valor={comandasEmAberto} />
          <Indicador icon={Clock3} label="Contas aguardando" valor={contasAguardando} />
          <Indicador icon={TrendingUp} label="Faturamento do turno" valor={faturamentoTurno} destaque />
        </div>
        <button type="button" disabled title="Em breve"
          className="mt-2 flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-sm font-semibold text-[var(--pp-text-muted)] opacity-70">
          Ver mais indicadores <ChevronRight aria-hidden="true" size={16} />
        </button>
      </section>
    </div>
  );
}
