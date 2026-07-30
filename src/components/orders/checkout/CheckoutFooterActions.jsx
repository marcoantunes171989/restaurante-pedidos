import { ArrowLeftRight, Split, Printer, DoorClosed, ReceiptText, StickyNote, History, Loader2 } from "lucide-react";

// Barra de ações do PDV. Apenas "Fechar conta" está ligada nesta fase (finaliza
// o pagamento — reusa toda a lógica de baixa de comanda já existente); as demais
// são fiéis ao mockup, porém desabilitadas ("em breve"). "Fechar conta" só
// habilita quando a soma das formas de pagamento bate exatamente com o total.
const SECUNDARIAS = [
  { id: "transferir", label: "Transferir mesa", icon: ArrowLeftRight },
  { id: "separar", label: "Separar itens", icon: Split },
  { id: "preconta", label: "Imprimir pré-conta", icon: Printer },
];
const SECUNDARIAS_DIR = [
  { id: "comprovante", label: "Emitir comprovante", icon: ReceiptText },
  { id: "observacoes", label: "Observações internas", icon: StickyNote },
  { id: "historico", label: "Histórico da mesa", icon: History },
];

function BotaoSecundario({ label, icon: Icon, onClick }) {
  const ativo = typeof onClick === "function";
  return (
    <button type="button" disabled={!ativo} onClick={onClick} title={ativo ? undefined : "Em breve"}
      className={`flex min-h-[62px] min-w-[92px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-2 text-center text-[11px] font-bold leading-tight text-[var(--pp-text-body)] transition-colors ${ativo ? "hover:bg-[var(--pp-bg)]" : "opacity-70"}`}>
      <Icon aria-hidden="true" size={18} />
      <span className="min-w-0">{label}</span>
    </button>
  );
}

export default function CheckoutFooterActions({ onFecharConta, podeFechar, fechando, onImprimir }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2.5">
      {SECUNDARIAS.map((a) => <BotaoSecundario key={a.id} {...a} onClick={a.id === "preconta" ? onImprimir : undefined} />)}

      <button type="button" onClick={onFecharConta} disabled={!podeFechar || fechando}
        className="btn-laranja flex min-h-[62px] min-w-[130px] flex-[1.4] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-center text-xs font-black text-white transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
        {fechando ? <Loader2 aria-hidden="true" size={19} className="animate-spin" /> : <DoorClosed aria-hidden="true" size={19} />}
        {fechando ? "Registrando…" : "Fechar conta"}
      </button>

      {SECUNDARIAS_DIR.map((a) => <BotaoSecundario key={a.id} {...a} />)}
    </div>
  );
}
