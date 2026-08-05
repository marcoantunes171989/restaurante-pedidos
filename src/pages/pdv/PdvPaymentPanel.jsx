import { Eraser, Delete, CheckCircle2, Banknote, QrCode, CreditCard, Wallet, Ticket, Star } from "lucide-react";
import { estiloFormaPagamento, formatCurrency, numeroParaMoeda, rotuloFormaCurto } from "./pdvHelpers";

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
 * Coluna de pagamento — layout de alturas fixas (sem “pulo” ao selecionar forma).
 * Textos das formas contidos no botão; tipografia mais elegante.
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
  const formaLabel = formaSelecionada?.nome ? rotuloFormaCurto(formaSelecionada.nome) : "—";

  return (
    <aside className={`flex w-full min-w-0 flex-col overflow-hidden border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
      {/* Cabeçalho — altura estável */}
      <div className="shrink-0 border-b border-[var(--pp-border)] px-3 py-2 sm:px-3.5">
        <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Pagamento</h2>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="min-w-0 text-xs font-semibold text-[var(--pp-text-body)]">
            Total{" "}
            <span className="text-base font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(totalConta)}</span>
          </p>
        </div>
        <p className="mt-0.5 truncate text-right text-xl font-black tabular-nums leading-none text-[var(--op-nav-accent)]">
          R$ {numeroParaMoeda(valorCampo)}
        </p>
        {/* Linha reservada — evita reflow ao trocar a forma */}
        <p className="mt-1 h-4 truncate text-right text-[10px] font-semibold leading-4 text-[var(--pp-text-muted)]">
          Valor a receber · {formaLabel}
        </p>
      </div>

      {/* Teclado — alturas fixas */}
      <div className="shrink-0 px-3 py-2 sm:px-3.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className="col-span-3 grid grid-cols-3 gap-1.5">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onDigito?.(t)}
                className="grid h-11 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-base font-black text-[var(--pp-text)] transition hover:bg-white active:bg-[var(--pp-bg)]"
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onDigito?.("0")}
              className="col-span-2 grid h-11 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-base font-black text-[var(--pp-text)] transition hover:bg-white"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => onDigito?.(",")}
              className="grid h-11 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-base font-black text-[var(--pp-text)] transition hover:bg-white"
            >
              ,
            </button>
          </div>
          <div className="grid h-[calc(2.75rem*3+0.375rem*2)] grid-rows-3 gap-1.5">
            <button type="button" onClick={onLimpar} className="btn-laranja grid place-items-center gap-0 rounded-lg text-[9px] font-black leading-tight text-white">
              <Eraser size={13} aria-hidden="true" /> LIMPAR
            </button>
            <button type="button" onClick={onApagar} className="btn-laranja grid place-items-center gap-0 rounded-lg text-[9px] font-black leading-tight text-white">
              <Delete size={13} aria-hidden="true" /> APAGAR
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={confirmarDesabilitado}
              className="grid place-items-center gap-0 rounded-lg bg-[var(--op-nav-accent)] text-[9px] font-black leading-tight text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={13} aria-hidden="true" /> OK
            </button>
          </div>
        </div>
      </div>

      {/* Formas — altura mínima reservada, grid fixo, texto contido */}
      <div className="min-h-[7.5rem] flex-1 overflow-y-auto overscroll-contain border-t border-[var(--pp-border)] px-3 py-2 sm:px-3.5">
        <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Formas de pagamento</h3>
        {formas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-3 text-center text-[11px] font-semibold text-[var(--pp-text-muted)]">
            Nenhuma forma cadastrada. Cadastre em Administrativo → Pagamento.
          </p>
        ) : (
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {formas.map((forma) => {
              const tipo = estiloFormaPagamento(forma.nome);
              const Icon = ICONE_POR_TIPO[tipo] || Wallet;
              const on = !!formaSelecionada && (
                formaSelecionada.id === forma.id
                || formaSelecionada.nome === forma.nome
              );
              const rotulo = rotuloFormaCurto(forma.nome);
              return (
                <button
                  key={forma.id ?? forma.nome}
                  type="button"
                  onClick={() => onSelecionarForma?.(forma)}
                  aria-pressed={on}
                  title={forma.nome}
                  className={`box-border flex h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-0.5 py-1 text-center transition ${
                    on
                      ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                      : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] hover:bg-white"
                  }`}
                >
                  <Icon size={15} className="shrink-0" aria-hidden="true" />
                  <span className="line-clamp-2 w-full max-w-full break-words px-0.5 text-[9px] font-bold leading-[1.15]">
                    {rotulo}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Saldos — tipografia compacta, bloco fixo */}
      <div className="shrink-0 space-y-0.5 border-t border-[var(--pp-border)] px-3 py-2 sm:px-3.5">
        <LinhaSaldo label="A pagar agora" valor={formatCurrency(aPagarAgora)} />
        <LinhaSaldo label="Recebido" valor={formatCurrency(recebido)} tom="text-[var(--pp-success-text)]" />
        <LinhaSaldo label="Falta" valor={formatCurrency(falta)} tom="text-[var(--pp-danger)]" destaque />
      </div>
    </aside>
  );
}

function LinhaSaldo({ label, valor, tom = "text-[var(--pp-text)]", destaque }) {
  return (
    <div className="flex h-5 items-center justify-between gap-2">
      <span className="shrink-0 text-[10px] font-semibold text-[var(--pp-text-muted)]">{label}</span>
      <span className={`min-w-0 truncate text-right font-black tabular-nums ${tom} ${destaque ? "text-xs" : "text-[11px]"}`}>{valor}</span>
    </div>
  );
}
