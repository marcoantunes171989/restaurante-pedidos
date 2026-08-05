import { useState } from "react";
import { ArrowLeftRight, Split, Printer, DoorClosed, ReceiptText, StickyNote, History, Loader2, MoreHorizontal, X } from "lucide-react";

const SECUNDARIAS = [
  { id: "transferir", label: "Transferir", labelFull: "Transferir mesa", Icon: ArrowLeftRight },
  { id: "separar", label: "Separar", labelFull: "Separar itens", Icon: Split },
  { id: "preconta", label: "Pré-conta", labelFull: "Imprimir pré-conta", Icon: Printer },
  { id: "comprovante", label: "Comprovante", labelFull: "Emitir comprovante", Icon: ReceiptText },
  { id: "observacoes", label: "Observações", labelFull: "Observações Internas", Icon: StickyNote },
  { id: "historico", label: "Histórico", labelFull: "Histórico da mesa", Icon: History },
];

/**
 * Barra inferior de ações — Fechar conta sempre em destaque (polegar).
 * Mobile: CTA full-width + ações em scroll / menu Mais.
 * Desktop: fila completa.
 */
export default function PdvActionBar({
  onFecharConta,
  podeFechar,
  fechando,
  onTransferir,
  onSeparar,
  onImprimir,
  onComprovante,
  onObservacoes,
  onHistorico,
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const handlers = {
    transferir: onTransferir,
    separar: onSeparar,
    preconta: onImprimir,
    comprovante: onComprovante,
    observacoes: onObservacoes,
    historico: onHistorico,
  };

  const principaisMobile = SECUNDARIAS.filter((a) => ["preconta", "comprovante", "historico"].includes(a.id));
  const extrasMobile = SECUNDARIAS.filter((a) => !["preconta", "comprovante", "historico"].includes(a.id));

  return (
    <div
      className="shrink-0 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mobile / tablet estreito */}
      <div className="flex flex-col gap-2 lg:hidden">
        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white transition active:scale-[0.99] ${
            podeFechar && !fechando
              ? "btn-laranja"
              : "cursor-not-allowed bg-[#E67E22]/55"
          }`}
        >
          {fechando ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={20} aria-hidden="true" />}
          {fechando ? "Registrando…" : "Fechar conta"}
        </button>

        <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {principaisMobile.map(({ id, label, Icon }) => (
            <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} compact />
          ))}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className="flex min-h-12 min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 text-[11px] font-bold text-[var(--pp-text-body)]"
          >
            <MoreHorizontal size={17} aria-hidden="true" />
            Mais
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden flex-wrap items-stretch gap-2 lg:flex">
        {SECUNDARIAS.slice(0, 3).map(({ id, labelFull, Icon }) => (
          <BotaoSec key={id} label={labelFull} Icon={Icon} onClick={handlers[id]} />
        ))}

        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          className={`flex min-h-[58px] min-w-[140px] flex-[1.35] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-white transition active:scale-[0.98] ${
            podeFechar && !fechando
              ? "btn-laranja"
              : "cursor-not-allowed bg-[#E67E22]/55"
          }`}
        >
          {fechando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={18} aria-hidden="true" />}
          {fechando ? "Registrando…" : "Fechar conta"}
        </button>

        {SECUNDARIAS.slice(3).map(({ id, labelFull, Icon }) => (
          <BotaoSec key={id} label={labelFull} Icon={Icon} onClick={handlers[id]} />
        ))}
      </div>

      {maisAberto && (
        <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais ações"
            className="w-full max-w-md rounded-3xl border border-[var(--pp-border)] bg-white p-4 shadow-2xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-[var(--pp-text)]">Mais ações</h2>
              <button type="button" onClick={() => setMaisAberto(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-border)]" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...principaisMobile, ...extrasMobile].map(({ id, labelFull, Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={typeof handlers[id] !== "function"}
                  onClick={() => {
                    handlers[id]?.();
                    setMaisAberto(false);
                  }}
                  className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 text-center text-xs font-bold text-[var(--pp-text-body)] disabled:opacity-50"
                >
                  <Icon size={18} aria-hidden="true" />
                  {labelFull}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotaoSec({ label, Icon, onClick, compact }) {
  const ativo = typeof onClick === "function";
  return (
    <button
      type="button"
      disabled={!ativo}
      onClick={onClick}
      title={ativo ? undefined : "Selecione uma mesa"}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-center font-bold leading-tight text-[var(--pp-text-body)] transition ${
        compact
          ? "min-h-12 min-w-[5.25rem] shrink-0 px-2 py-1.5 text-[11px]"
          : "min-h-[58px] min-w-[88px] flex-1 px-2 py-2 text-[11px]"
      } ${ativo ? "active:bg-white hover:bg-white" : "opacity-70"}`}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
