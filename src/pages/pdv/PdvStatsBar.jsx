import { useState } from "react";
import { ChevronDown, X, DoorClosed, Wallet, CheckCircle2, TrendingUp, Ticket } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";

/**
 * Faixa de resumo do turno — botão abre detalhe do turno (métricas + contas).
 */
export default function PdvStatsBar({
  agora,
  mesasOcupadas = 0,
  pagamentoPendente = 0,
  pagamentoFinalizado = 0,
  faturamentoDia = 0,
  ticketMedio = 0,
  contasAbertas = [],
  pagosHoje = [],
}) {
  const [modalAberto, setModalAberto] = useState(false);
  const dataTurno = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaTurno = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataCompleta = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <section
      className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
    >
      {/* Mobile */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-left active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Resumo do turno · {dataTurno} {horaTurno}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-[var(--pp-text)]">
              <span className="text-[var(--pp-primary)]">{mesasOcupadas} ocup.</span>
              <span className="text-[var(--pp-warning-text)]">{pagamentoPendente} pend.</span>
              <span className="tabular-nums">{formatCurrency(faturamentoDia)}</span>
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-[var(--pp-text-muted)]" aria-hidden="true" />
        </button>
        {pagamentoPendente > 0 && (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="grid h-11 min-w-11 place-items-center rounded-xl border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-2 text-xs font-black text-[var(--pp-warning-text)]"
          >
            {pagamentoPendente}
          </button>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 lg:flex">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-xs font-bold text-[var(--pp-text-body)] transition hover:border-[var(--pp-primary)]/40 active:scale-[0.99]"
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
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="ml-auto inline-flex min-h-10 items-center rounded-lg border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-3 text-xs font-bold text-[var(--pp-warning-text)]"
          >
            Atenção: {pagamentoPendente} mesa{pagamentoPendente === 1 ? "" : "s"} aguardando pagamento
          </button>
        )}
      </div>

      {modalAberto && (
        <ModalResumoTurno
          dataCompleta={dataCompleta}
          horaTurno={horaTurno}
          mesasOcupadas={mesasOcupadas}
          pagamentoPendente={pagamentoPendente}
          pagamentoFinalizado={pagamentoFinalizado}
          faturamentoDia={faturamentoDia}
          ticketMedio={ticketMedio}
          contasAbertas={contasAbertas}
          pagosHoje={pagosHoje}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </section>
  );
}

function ModalResumoTurno({
  dataCompleta,
  horaTurno,
  mesasOcupadas,
  pagamentoPendente,
  pagamentoFinalizado,
  faturamentoDia,
  ticketMedio,
  contasAbertas,
  pagosHoje,
  onFechar,
}) {
  const abertas = (contasAbertas || []).filter((c) => !c.externo);
  const pagos = pagosHoje || [];

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resumo do turno"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--pp-border)] bg-white shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--pp-border)] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-black text-[var(--pp-text)] sm:text-lg">Resumo do turno</h2>
            <p className="mt-0.5 text-sm capitalize text-[var(--pp-text-muted)]">{dataCompleta} · {horaTurno}</p>
          </div>
          <button type="button" onClick={onFechar} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-border)]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CardMetrica Icon={DoorClosed} label="Mesas ocupadas" valor={mesasOcupadas} tom="text-[var(--pp-primary)]" />
            <CardMetrica Icon={Wallet} label="Pag. pendente" valor={pagamentoPendente} tom="text-[var(--pp-warning-text)]" />
            <CardMetrica Icon={CheckCircle2} label="Pag. finalizado" valor={pagamentoFinalizado} tom="text-[var(--pp-success-text)]" />
            <CardMetrica Icon={TrendingUp} label="Faturamento" valor={formatCurrency(faturamentoDia)} tom="text-[var(--pp-text)]" />
            <CardMetrica Icon={Ticket} label="Ticket médio" valor={formatCurrency(ticketMedio)} tom="text-[var(--pp-text)]" className="col-span-2 sm:col-span-1" />
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Contas em aberto</h3>
            {abertas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-4 text-center text-sm text-[var(--pp-text-muted)]">Nenhuma conta aberta no momento.</p>
            ) : (
              <ul className="space-y-2">
                {abertas.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--pp-text)]">{c.mesa}</p>
                      <p className="truncate text-xs font-semibold text-[var(--pp-text-muted)]">
                        {c.cliente || "Cliente não identificado"}
                        {c.solicitada ? " · pagamento solicitado" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black tabular-nums">{formatCurrency(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Pagamentos de hoje</h3>
            {pagos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-4 text-center text-sm text-[var(--pp-text-muted)]">Nenhum pagamento registrado hoje.</p>
            ) : (
              <ul className="space-y-2">
                {pagos.slice(0, 20).map((o) => {
                  const tot = (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--pp-text)]">{o.table || o.command}</p>
                        <p className="truncate text-xs font-semibold text-[var(--pp-text-muted)]">
                          {o.customer || "Cliente"} · #{o.command || o.id}
                          {o.pagamentoForma ? ` · ${o.pagamentoForma}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums text-[var(--pp-success-text)]">{formatCurrency(tot)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--pp-border)] px-4 py-3 sm:px-5">
          <button type="button" onClick={onFechar} className="btn-laranja min-h-12 w-full rounded-2xl text-sm font-black text-white">
            Fechar resumo
          </button>
        </div>
      </div>
    </div>
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

function CardMetrica({ Icon, label, valor, tom, className = "" }) {
  return (
    <div className={`rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[var(--pp-text-muted)]">
        <Icon size={14} aria-hidden="true" />
        <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-lg font-black tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}
