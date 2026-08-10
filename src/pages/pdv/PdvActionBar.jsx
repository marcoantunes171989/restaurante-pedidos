import { useState } from "react";
import { ArrowLeftRight, Split, Printer, DoorClosed, ReceiptText, StickyNote, History, Loader2, MoreHorizontal, X, ChefHat } from "lucide-react";

const SECUNDARIAS = [
  { id: "transferir", label: "Transferir", labelFull: "Transferir mesa", Icon: ArrowLeftRight },
  { id: "separar", label: "Separar", labelFull: "Separar itens", Icon: Split },
  { id: "preconta", label: "Pré-conta", labelFull: "Imprimir pré-conta (80mm)", Icon: Printer },
  { id: "comprovante", label: "Comprovante", labelFull: "Emitir comprovante / conferência (80mm)", Icon: ReceiptText },
  { id: "cozinha", label: "Cozinha", labelFull: "Imprimir produção por setor (80mm)", Icon: ChefHat },
  { id: "observacoes", label: "Observações", labelFull: "Observações internas", Icon: StickyNote },
  { id: "historico", label: "Histórico", labelFull: "Histórico da mesa", Icon: History },
];

/**
 * Barra inferior compacta — ações secundárias discretas em uma linha só,
 * com "Fechar conta" como única ação em destaque.
 */
export default function PdvActionBar({
  onFecharConta,
  podeFechar,
  fechando,
  onTransferir,
  onSeparar,
  onImprimir,
  onComprovante,
  onCozinha,
  onObservacoes,
  onHistorico,
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const handlers = {
    transferir: onTransferir,
    separar: onSeparar,
    preconta: onImprimir,
    comprovante: onComprovante,
    cozinha: onCozinha,
    observacoes: onObservacoes,
    historico: onHistorico,
  };

  const principaisMobile = SECUNDARIAS.filter((a) => ["preconta", "comprovante", "cozinha"].includes(a.id));
  const extrasMobile = SECUNDARIAS.filter((a) => !["preconta", "comprovante", "cozinha"].includes(a.id));

  return (
    <div
      className="shrink-0 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-1.5 lg:px-3"
      style={{
        paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mobile / tablet */}
      <div className="flex flex-col gap-1 lg:hidden">
        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          className={`flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg px-3 text-[12px] font-black text-white transition ${
            podeFechar && !fechando ? "btn-laranja" : "cursor-not-allowed bg-[#F38525]/45"
          }`}
        >
          {fechando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={15} aria-hidden="true" />}
          <span className="truncate">{fechando ? "Registrando…" : "Fechar conta"}</span>
        </button>

        <div className="grid grid-cols-4 gap-1">
          {principaisMobile.map(({ id, label, labelFull, Icon }) => (
            <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} title={labelFull} />
          ))}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className="flex h-9 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1 text-[9px] font-bold text-[var(--pp-text-body)]"
          >
            <MoreHorizontal size={13} aria-hidden="true" />
            <span className="truncate">Mais</span>
          </button>
        </div>
      </div>

      {/* Desktop — ações secundárias discretas + destaque no fechamento */}
      <div className="hidden items-center gap-1 lg:flex">
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {SECUNDARIAS.map(({ id, label, labelFull, Icon }) => (
            <BotaoSec key={id} label={label} Icon={Icon} onClick={handlers[id]} title={labelFull} />
          ))}
        </div>

        <button
          type="button"
          onClick={onFecharConta}
          disabled={!podeFechar || fechando}
          title="Fechar conta (F5)"
          className={`flex h-9 w-[158px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2 text-[11px] font-black text-white transition ${
            podeFechar && !fechando ? "btn-laranja" : "cursor-not-allowed bg-[#F38525]/45"
          }`}
        >
          {fechando ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <DoorClosed size={14} aria-hidden="true" />}
          <span className="truncate">{fechando ? "Registrando…" : "Fechar conta"}</span>
        </button>
      </div>

      {maisAberto && (
        <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais ações"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-white p-3 shadow-2xl"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[var(--pp-text)]">Mais ações</h2>
              <button type="button" onClick={() => setMaisAberto(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pp-border)]" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
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
                  className="flex h-11 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 text-center text-[11px] font-bold text-[var(--pp-text-body)] disabled:opacity-45"
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className="truncate">{label}</span>
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
      className={`box-border flex h-9 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 text-[9px] font-bold leading-tight text-[var(--pp-text-body)] transition ${
        ativo ? "hover:border-[var(--pp-primary)] hover:bg-[var(--pp-surface)]" : "opacity-50"
      }`}
    >
      <Icon size={13} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
