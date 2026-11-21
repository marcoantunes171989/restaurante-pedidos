import { formatCurrency } from "./pdvHelpers";

/**
 * Faixa fina do turno: o essencial numa linha (hora, faturamento, ticket médio, mesas livres e a situação das notas fiscais).
 * "Ver resumo do turno" abre o painel completo (children): alertas fiscais, mesas, cozinha e análise financeira. Fica fechado por padrão.
 */
export default function PdvFaixaTurno({
  agora, faturamentoDia = 0, ticketMedio = 0, mesasDisponiveis = 0, pagamentoPendente = 0,
  nfceAtiva = false, alertasFiscais = 0, aberta = false, onAlternar, children,
}) {
  const hora = agora ? `${agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
  return (
    <section data-testid="faixa-turno" className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)]">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[12px] text-[var(--pp-text-muted)]"
        style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
      >
        <span>Turno <b className="text-[var(--pp-text)]">{hora}</b></span>
        <span>Faturamento <b className="tabular-nums text-[var(--pp-text)]">{formatCurrency(faturamentoDia)}</b></span>
        <span>Ticket médio <b className="tabular-nums text-[var(--pp-text)]">{formatCurrency(ticketMedio)}</b></span>
        <span>Mesas livres <b className="tabular-nums text-[var(--pp-text)]">{mesasDisponiveis}</b></span>
        {pagamentoPendente > 0 && <span>Aguardando pagamento <b className="tabular-nums text-[var(--pp-text)]">{pagamentoPendente}</b></span>}
        {nfceAtiva && (
          <button
            type="button"
            onClick={onAlternar}
            data-testid="chip-fiscal"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${alertasFiscais > 0 ? "bg-[#FEF3E2] text-[#B45309]" : "bg-[#E6F4EA] text-[#1F7A3D]"}`}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
            {alertasFiscais > 0 ? `NFC-e: ${alertasFiscais} com problema` : "NFC-e pronta"}
          </button>
        )}
        <button type="button" onClick={onAlternar} aria-expanded={aberta} data-testid="btn-resumo-turno" className="ml-auto text-[12px] font-bold text-[var(--pp-text-muted)] underline">
          {aberta ? "ocultar resumo do turno" : "ver resumo do turno"}
        </button>
      </div>
      {aberta && <div data-testid="resumo-turno-completo">{children}</div>}
    </section>
  );
}
