import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";

/**
 * Faixa de resumo do turno.
 * Mobile: colapsável para liberar altura aos produtos; desktop: faixa completa.
 */
export default function PdvStatsBar({
  agora,
  mesasOcupadas = 0,
  pagamentoPendente = 0,
  pagamentoFinalizado = 0,
  faturamentoDia = 0,
  ticketMedio = 0,
}) {
  const [aberto, setAberto] = useState(false);
  const dataTurno = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaTurno = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
    >
      {/* Mobile: linha compacta + expandir */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Turno · {dataTurno} {horaTurno}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-[var(--pp-text)]">
              <span className="text-[var(--pp-primary)]">{mesasOcupadas} ocup.</span>
              <span className="text-[var(--pp-warning-text)]">{pagamentoPendente} pend.</span>
              <span className="tabular-nums">{formatCurrency(faturamentoDia)}</span>
            </span>
          </span>
          <ChevronDown size={16} className={`shrink-0 text-[var(--pp-text-muted)] transition ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {pagamentoPendente > 0 && (
          <span className="grid h-11 min-w-11 place-items-center rounded-xl border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-2 text-xs font-black text-[var(--pp-warning-text)]">
            {pagamentoPendente}
          </span>
        )}
      </div>

      {aberto && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:hidden">
          <MetricaCard label="Mesas ocupadas" valor={mesasOcupadas} tom="text-[var(--pp-primary)]" />
          <MetricaCard label="Pag. pendente" valor={pagamentoPendente} tom="text-[var(--pp-warning-text)]" />
          <MetricaCard label="Pag. finalizado" valor={pagamentoFinalizado} tom="text-[var(--pp-success-text)]" />
          <MetricaCard label="Faturamento" valor={formatCurrency(faturamentoDia)} tom="text-[var(--pp-text)]" />
          <MetricaCard label="Ticket médio" valor={formatCurrency(ticketMedio)} tom="text-[var(--pp-text)]" className="col-span-2 sm:col-span-1" />
        </div>
      )}

      {/* Desktop / tablet largo */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 lg:flex">
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-xs font-bold text-[var(--pp-text-body)]"
        >
          <span className="text-[var(--pp-text-muted)]">Resumo do turno</span>
          <span className="font-black text-[var(--pp-text)]">Hoje, {dataTurno} · {horaTurno}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <Metrica label="Mesas ocupadas" valor={mesasOcupadas} tom="text-[var(--pp-primary)]" />
          <Metrica label="Pagamento pendente" valor={pagamentoPendente} tom="text-[var(--pp-warning-text)]" />
          <Metrica label="Pagamento finalizado" valor={pagamentoFinalizado} tom="text-[var(--pp-success-text)]" />
          <Metrica label="Faturamento do dia" valor={formatCurrency(faturamentoDia)} tom="text-[var(--pp-text)]" />
          <Metrica label="Tickets médios" valor={formatCurrency(ticketMedio)} tom="text-[var(--pp-text)]" />
        </div>

        {pagamentoPendente > 0 && (
          <div className="ml-auto inline-flex min-h-10 items-center rounded-lg border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-3 text-xs font-bold text-[var(--pp-warning-text)]">
            Atenção: {pagamentoPendente} mesa{pagamentoPendente === 1 ? "" : "s"} aguardando pagamento
          </div>
        )}
      </div>
    </section>
  );
}

function Metrica({ label, valor, tom }) {
  return (
    <div className="leading-tight">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{label}</p>
      <p className={`text-base font-black tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}

function MetricaCard({ label, valor, tom, className = "" }) {
  return (
    <div className={`rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{label}</p>
      <p className={`text-base font-black tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}
