import { Eraser, Delete, CheckCircle2 } from "lucide-react";

// Teclado numérico do PDV ("Digite o código"). Alimenta um buffer em centavos
// mantido pelo pai (CashierCheckout); LIMPAR zera, APAGAR remove o último
// dígito e CONFIRMAR aplica o valor digitado à forma de pagamento ativa. É a
// forma "de balcão" de lançar o valor recebido — funciona em conjunto com a
// grade de formas de pagamento.
const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", ","];

export default function CheckoutKeypad({ onDigito, onLimpar, onApagar, onConfirmar, confirmarDesabilitado }) {
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Digite o código</h2>
      <div className="grid grid-cols-4 gap-2.5">
        {/* Coluna 1-3 dos números (9 primeiras teclas) + 0 e vírgula na última linha */}
        <div className="col-span-3 grid grid-cols-3 gap-2.5">
          {TECLAS.slice(0, 9).map((t) => (
            <button key={t} type="button" onClick={() => onDigito(t)}
              className="grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-xl font-black text-[var(--pp-text)] tabular-nums transition-colors hover:bg-[var(--pp-bg)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
              {t}
            </button>
          ))}
          <button type="button" onClick={() => onDigito("0")}
            className="col-span-2 grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-xl font-black text-[var(--pp-text)] tabular-nums transition-colors hover:bg-[var(--pp-bg)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
            0
          </button>
          <button type="button" onClick={() => onDigito(",")}
            className="grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-xl font-black text-[var(--pp-text)] transition-colors hover:bg-[var(--pp-bg)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
            ,
          </button>
        </div>

        {/* Coluna de ações */}
        <div className="grid grid-rows-3 gap-2.5">
          <button type="button" onClick={onLimpar} aria-label="Limpar valor"
            className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[11px] font-black text-white transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]">
            <Eraser aria-hidden="true" size={17} /> LIMPAR
          </button>
          <button type="button" onClick={onApagar} aria-label="Apagar último dígito"
            className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[11px] font-black text-white transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]">
            <Delete aria-hidden="true" size={17} /> APAGAR
          </button>
          <button type="button" onClick={onConfirmar} disabled={confirmarDesabilitado} aria-label="Confirmar valor"
            className="grid place-items-center gap-0.5 rounded-xl bg-[var(--op-nav-accent)] text-[11px] font-black text-white transition hover:brightness-110 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-nav-accent)] disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCircle2 aria-hidden="true" size={17} /> CONFIRMAR
          </button>
        </div>
      </div>
    </section>
  );
}
