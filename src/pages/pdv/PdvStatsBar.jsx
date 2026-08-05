import { ChevronDown } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";

/**
 * Faixa de resumo do turno — métricas reais derivadas dos pedidos do dia.
 */
export default function PdvStatsBar({
  agora,
  mesasOcupadas = 0,
  pagamentoPendente = 0,
  pagamentoFinalizado = 0,
  faturamentoDia = 0,
  ticketMedio = 0,
}) {
  const dataTurno = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaTurno = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2.5 sm:px-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-xs font-bold text-[var(--pp-text-body)]"
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
          <div className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-3 text-xs font-bold text-[var(--pp-warning-text)]">
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
