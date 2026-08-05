import { ArrowLeftRight, Split, Printer, DoorClosed, ReceiptText, StickyNote, History, Loader2 } from "lucide-react";

const SECUNDARIAS = [
  { id: "transferir", label: "Transferir mesa", Icon: ArrowLeftRight },
  { id: "separar", label: "Separar itens", Icon: Split },
  { id: "preconta", label: "Imprimir pré-conta", Icon: Printer },
];

const SECUNDARIAS_DIR = [
  { id: "comprovante", label: "Emitir comprovante", Icon: ReceiptText },
  { id: "observacoes", label: "Observações Internas", Icon: StickyNote },
  { id: "historico", label: "Histórico da mesa", Icon: History },
];

/**
 * Barra inferior de ações operacionais do PDV.
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
  const handlers = {
    transferir: onTransferir,
    separar: onSeparar,
    preconta: onImprimir,
    comprovante: onComprovante,
    observacoes: onObservacoes,
    historico: onHistorico,
  };

  return (
    <div className="shrink-0 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2.5 sm:px-4 lg:px-5">
      <div className="flex flex-wrap items-stretch gap-2">
        {SECUNDARIAS.map(({ id, label, Icon }) => (
          <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} />
        ))}

        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          className={`flex min-h-[58px] min-w-[128px] flex-[1.35] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-white transition active:scale-[0.98] ${
            podeFechar && !fechando
              ? "btn-laranja"
              : "cursor-not-allowed bg-[#E67E22]/55"
          }`}
        >
          {fechando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={18} aria-hidden="true" />}
          {fechando ? "Registrando…" : "Fechar conta"}
        </button>

        {SECUNDARIAS_DIR.map(({ id, label, Icon }) => (
          <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} />
        ))}
      </div>
    </div>
  );
}

function BotaoSec({ label, Icon, onClick }) {
  const ativo = typeof onClick === "function";
  return (
    <button
      type="button"
      disabled={!ativo}
      onClick={onClick}
      title={ativo ? undefined : "Selecione uma mesa"}
      className={`flex min-h-[58px] min-w-[88px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-2 text-center text-[11px] font-bold leading-tight text-[var(--pp-text-body)] transition ${
        ativo ? "hover:bg-white" : "opacity-70"
      }`}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
