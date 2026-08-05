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
 * Barra inferior — textos contidos, grid fixo no desktop (sem wrap/reflow).
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
      className="shrink-0 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-2 sm:px-3 lg:px-4"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mobile */}
      <div className="flex flex-col gap-1.5 lg:hidden">
        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          className={`flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-3 text-sm font-black text-white transition ${
            podeFechar && !fechando
              ? "btn-laranja"
              : "cursor-not-allowed bg-[#E67E22]/55"
          }`}
        >
          {fechando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={18} aria-hidden="true" />}
          <span className="truncate">{fechando ? "Registrando…" : "Fechar conta"}</span>
        </button>

        <div className="grid grid-cols-4 gap-1.5">
          {principaisMobile.map(({ id, label, Icon }) => (
            <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} title={SECUNDARIAS.find((s) => s.id === id)?.labelFull} />
          ))}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className="flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1 text-[10px] font-bold text-[var(--pp-text-body)]"
          >
            <MoreHorizontal size={15} aria-hidden="true" />
            <span className="truncate">Mais</span>
          </button>
        </div>
      </div>

      {/* Desktop — 7 colunas fixas, sem wrap */}
      <div className="hidden grid-cols-7 gap-1.5 lg:grid">
        {SECUNDARIAS.slice(0, 3).map(({ id, label, labelFull, Icon }) => (
          <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} title={labelFull} />
        ))}

        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          title="Fechar conta"
          className={`flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-1 text-[10px] font-black text-white transition ${
            podeFechar && !fechando
              ? "btn-laranja"
              : "cursor-not-allowed bg-[#E67E22]/55"
          }`}
        >
          {fechando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={16} aria-hidden="true" />}
          <span className="line-clamp-2 w-full px-0.5 text-center leading-tight">{fechando ? "Registrando…" : "Fechar conta"}</span>
        </button>

        {SECUNDARIAS.slice(3).map(({ id, label, labelFull, Icon }) => (
          <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} title={labelFull} />
        ))}
      </div>

      {maisAberto && (
        <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais ações"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--pp-border)] bg-white p-4 shadow-2xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-black text-[var(--pp-text)]">Mais ações</h2>
              <button type="button" onClick={() => setMaisAberto(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--pp-border)]" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...principaisMobile, ...extrasMobile].map(({ id, label, labelFull, Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={typeof handlers[id] !== "function"}
                  title={labelFull}
                  onClick={() => {
                    handlers[id]?.();
                    setMaisAberto(false);
                  }}
                  className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 text-center text-[11px] font-bold text-[var(--pp-text-body)] disabled:opacity-50"
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="line-clamp-2 w-full leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotaoSec({ label, Icon, onClick, title }) {
  const ativo = typeof onClick === "function";
  return (
    <button
      type="button"
      disabled={!ativo}
      onClick={onClick}
      title={title || (ativo ? label : "Selecione uma mesa")}
      className={`box-border flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1 text-[10px] font-bold leading-tight text-[var(--pp-text-body)] transition ${
        ativo ? "hover:bg-white" : "opacity-70"
      }`}
    >
      <Icon size={15} className="shrink-0" aria-hidden="true" />
      <span className="line-clamp-2 w-full max-w-full break-words px-0.5 text-center">{label}</span>
    </button>
  );
}
