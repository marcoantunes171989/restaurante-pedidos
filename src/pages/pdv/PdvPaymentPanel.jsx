import { Eraser, Delete, CheckCircle2, Banknote, QrCode, CreditCard, Wallet, Ticket, Star } from "lucide-react";
import { estiloFormaPagamento, formatCurrency, numeroParaMoeda } from "./pdvHelpers";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const ICONE_POR_TIPO = {
  dinheiro: Banknote,
  pix: QrCode,
  credito: CreditCard,
  debito: CreditCard,
  voucher: Ticket,
  pontos: Star,
  outro: Wallet,
};

/**
 * Coluna / aba de pagamento — teclado e formas com alvos de toque confortáveis.
 */
export default function PdvPaymentPanel({
  totalConta = 0,
  aPagarAgora = 0,
  recebido = 0,
  falta = 0,
  formasPagamento = [],
  formaSelecionada,
  onSelecionarForma,
  onDigito,
  onLimpar,
  onApagar,
  onConfirmar,
  confirmarDesabilitado,
  bufferEntrada = "",
  valorExibido = 0,
  className = "",
}) {
  const formas = formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim());
  const cols = Math.min(4, Math.max(2, formas.length || 1));
  const valorCampo = bufferEntrada !== ""
    ? Number(bufferEntrada) / 100
    : (Number(valorExibido) || Number(recebido) || 0);

  return (
    <aside className={`flex w-full flex-col overflow-y-auto overscroll-contain border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
      <div className="shrink-0 border-b border-[var(--pp-border)] px-3 py-2.5 sm:px-4 sm:py-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Pagamento</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--pp-text-body)]">
          Total da conta:{" "}
          <span className="text-xl font-black tabular-nums text-[var(--pp-text)] sm:text-2xl">{formatCurrency(totalConta)}</span>
        </p>
        <p className="mt-1 text-right text-2xl font-black tabular-nums text-[var(--op-nav-accent)] sm:text-3xl">
          R$ {numeroParaMoeda(valorCampo)}
        </p>
        <p className="text-right text-[11px] font-semibold text-[var(--pp-text-muted)]">
          Valor a receber {formaSelecionada?.nome ? `· ${formaSelecionada.nome}` : "(selecione a forma)"}
        </p>
      </div>

      <div className="px-3 py-3 sm:px-4">
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-3 grid grid-cols-3 gap-2">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onDigito?.(t)}
                className="grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-xl font-black text-[var(--pp-text)] transition active:scale-[0.97] hover:bg-white sm:h-12 sm:text-lg"
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onDigito?.("0")}
              className="col-span-2 grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-xl font-black text-[var(--pp-text)] transition active:scale-[0.97] hover:bg-white sm:h-12 sm:text-lg"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => onDigito?.(",")}
              className="grid h-14 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-xl font-black text-[var(--pp-text)] transition active:scale-[0.97] hover:bg-white sm:h-12 sm:text-lg"
            >
              ,
            </button>
          </div>
          <div className="grid grid-rows-3 gap-2">
            <button type="button" onClick={onLimpar} className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[10px] font-black text-white active:scale-[0.97]">
              <Eraser size={15} aria-hidden="true" /> LIMPAR
            </button>
            <button type="button" onClick={onApagar} className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[10px] font-black text-white active:scale-[0.97]">
              <Delete size={15} aria-hidden="true" /> APAGAR
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={confirmarDesabilitado}
              className="grid place-items-center gap-0.5 rounded-xl bg-[var(--op-nav-accent)] text-[10px] font-black text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={15} aria-hidden="true" /> CONFIRMAR
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--pp-border)] px-3 py-3 sm:px-4">
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Formas de pagamento</h3>
        {formas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-4 text-center text-xs font-semibold text-[var(--pp-text-muted)]">
            Nenhuma forma cadastrada nesta loja. Cadastre em Administrativo → Pagamento.
          </p>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {formas.map((forma) => {
              const tipo = estiloFormaPagamento(forma.nome);
              const Icon = ICONE_POR_TIPO[tipo] || Wallet;
              const on = !!formaSelecionada && (
                formaSelecionada.id === forma.id
                || formaSelecionada.nome === forma.nome
              );
              return (
                <button
                  key={forma.id ?? forma.nome}
                  type="button"
                  onClick={() => onSelecionarForma?.(forma)}
                  aria-pressed={on}
                  className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition active:scale-[0.98] sm:min-h-[76px] ${
                    on
                      ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                      : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] hover:bg-white"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="min-w-0 truncate px-0.5 text-[11px] font-bold leading-tight">{forma.nome}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto space-y-1.5 border-t border-[var(--pp-border)] px-3 py-3 text-sm sm:px-4">
        <LinhaSaldo label="A pagar agora" valor={formatCurrency(aPagarAgora)} />
        <LinhaSaldo label="Recebido" valor={formatCurrency(recebido)} tom="text-[var(--pp-success-text)]" />
        <LinhaSaldo label="Falta" valor={formatCurrency(falta)} tom="text-[var(--pp-danger)]" destaque />
      </div>
    </aside>
  );
}

function LinhaSaldo({ label, valor, tom = "text-[var(--pp-text)]", destaque }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-[var(--pp-text-muted)]">{label}</span>
      <span className={`font-black tabular-nums ${tom} ${destaque ? "text-base" : ""}`}>{valor}</span>
    </div>
  );
}
