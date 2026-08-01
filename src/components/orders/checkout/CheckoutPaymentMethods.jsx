import { QrCode, CreditCard, Banknote, Ticket, ArrowLeftRight, Wallet, Check, Star } from "lucide-react";

// Grade de formas de pagamento do PDV. As opções vêm das formas cadastradas na
// loja (prop `opcoes`); o ícone e a cor são resolvidos pelo nome (fallback
// neutro para formas personalizadas). Selecionar liga/desliga a forma — a mesma
// lógica de múltiplas formas já usada no card do caixa (usePagamentoConta).
function estiloForma(nome) {
  const n = (nome || "").toLowerCase();
  if (n.includes("ponto")) return { Icon: Star, cor: "text-[var(--pp-success-text)]" };
  if (n.includes("pix")) return { Icon: QrCode, cor: "text-[var(--op-nav-accent)]" };
  if (n.includes("dinheiro") || n.includes("espécie") || n.includes("especie")) return { Icon: Banknote, cor: "text-[var(--pp-success-text)]" };
  if (n.includes("voucher") || n.includes("vale") || n.includes("ticket")) return { Icon: Ticket, cor: "text-[var(--pp-primary-text)]" };
  if (n.includes("misto")) return { Icon: ArrowLeftRight, cor: "text-[var(--pp-primary-text)]" };
  if (n.includes("créd") || n.includes("cred") || n.includes("déb") || n.includes("deb") || n.includes("cart")) return { Icon: CreditCard, cor: "text-[var(--op-nav-accent)]" };
  return { Icon: Wallet, cor: "text-[var(--pp-text-body)]" };
}

export default function CheckoutPaymentMethods({ opcoes = [], formaAtiva, onToggle }) {
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)]">
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Forma de pagamento</h2>
      <div className="grid grid-cols-3 gap-2.5">
        {opcoes.map((f) => {
          const { Icon, cor } = estiloForma(f);
          const on = formaAtiva(f);
          return (
            <button key={f} type="button" onClick={() => onToggle(f)} aria-pressed={on}
              className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] ${
                on ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)]" : "border-[var(--pp-border)] bg-[var(--pp-surface)] hover:bg-[var(--pp-bg)]"
              }`}>
              {on && <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--pp-primary-hover)] text-white"><Check size={11} /></span>}
              <Icon aria-hidden="true" size={22} className={on ? "text-[var(--pp-primary-text)]" : cor} />
              <span className={`min-w-0 truncate text-xs font-bold ${on ? "text-[var(--pp-primary-text)]" : "text-[var(--pp-text-body)]"}`}>{f}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
