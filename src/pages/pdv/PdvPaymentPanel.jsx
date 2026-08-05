import { Eraser, Delete, Check, Banknote, QrCode, CreditCard, Wallet, Ticket, Star, X } from "lucide-react";
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
 * Coluna de pagamento — alturas fixas (nada se move ao trocar de forma).
 * Aceita PAGAMENTO DIVIDIDO: cada forma confirmada no OK vira uma parcela
 * e o painel passa a cobrar só o que falta. Troco existe apenas no dinheiro.
 */
export default function PdvPaymentPanel({
  totalConta = 0,
  recebido = 0,
  restante = 0,
  troco = 0,
  pagamentos = [],
  formasPagamento = [],
  formaSelecionada,
  permiteTroco = false,
  onSelecionarForma,
  onRemoverPagamento,
  onDigito,
  onLimpar,
  onApagar,
  onConfirmar,
  confirmarDesabilitado,
  bufferEntrada = "",
  className = "",
}) {
  const formas = formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim());
  const cols = Math.min(4, Math.max(2, formas.length || 1));
  const valorCampo = Number(bufferEntrada || 0) / 100;
  const formaLabel = formaSelecionada?.nome ? rotuloFormaCurto(formaSelecionada.nome) : "—";
  const quitado = restante <= 0.001 && totalConta > 0;

  return (
    <aside className={`flex w-full min-w-0 flex-col overflow-hidden border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
      <div className="shrink-0 border-b border-[var(--pp-border)] px-2.5 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Pagamento</h2>
          <p className="truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
            Total <span className="font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(totalConta)}</span>
          </p>
        </div>
        <p className="truncate text-right text-xl font-black tabular-nums leading-tight text-[var(--op-nav-accent)]">
          R$ {numeroParaMoeda(valorCampo)}
        </p>
        <p className="h-3.5 truncate text-right text-[9px] font-semibold leading-[0.875rem] text-[var(--pp-text-muted)]">
          {quitado ? "Conta quitada" : `A receber em ${formaLabel}`}
        </p>
      </div>

      <div className="shrink-0 border-b border-[var(--pp-border)] px-2.5 py-1.5">
        <h3 className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Formas de pagamento</h3>
        {formas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--pp-border)] px-2 py-2 text-center text-[10px] font-semibold text-[var(--pp-text-muted)]">
            Nenhuma forma cadastrada. Cadastre em Administrativo → Pagamento.
          </p>
        ) : (
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {formas.map((forma) => {
              const Icon = ICONE_POR_TIPO[estiloFormaPagamento(forma.nome)] || Wallet;
              const on = !!formaSelecionada && (formaSelecionada.id === forma.id || formaSelecionada.nome === forma.nome);
              return (
                <button
                  key={forma.id ?? forma.nome}
                  type="button"
                  onClick={() => onSelecionarForma?.(forma)}
                  aria-pressed={on}
                  title={forma.nome}
                  className={`box-border flex h-[46px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-0.5 text-center transition ${
                    on
                      ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                      : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:border-[var(--pp-primary)]"
                  }`}
                >
                  <Icon size={13} className="shrink-0" aria-hidden="true" />
                  <span className="line-clamp-2 w-full break-words px-0.5 text-[8px] font-bold leading-[1.1]">
                    {rotuloFormaCurto(forma.nome)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 px-2.5 py-1.5">
        <div className="grid grid-cols-4 gap-1">
          <div className="col-span-3 grid grid-cols-3 gap-1">
            {TECLAS.map((t) => (
              <TeclaNum key={t} onClick={() => onDigito?.(t)}>{t}</TeclaNum>
            ))}
            <TeclaNum className="col-span-2" onClick={() => onDigito?.("0")}>0</TeclaNum>
            <TeclaNum onClick={() => onDigito?.("00")}>00</TeclaNum>
          </div>
          <div className="grid grid-rows-4 gap-1">
            <button type="button" onClick={onLimpar} className="grid place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] transition hover:border-[var(--pp-primary)]" title="Limpar valor">
              <Eraser size={13} aria-hidden="true" />
            </button>
            <button type="button" onClick={onApagar} className="grid place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] transition hover:border-[var(--pp-primary)]" title="Apagar dígito">
              <Delete size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={confirmarDesabilitado}
              title="Registrar esta forma de pagamento"
              className="btn-petroleo row-span-2 grid place-items-center gap-0.5 rounded-lg text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check size={14} aria-hidden="true" /> OK
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-[3.25rem] flex-1 overflow-y-auto overscroll-contain border-t border-[var(--pp-border)] px-2.5 py-1.5">
        <h3 className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
          Recebimentos {pagamentos.length > 0 && <span className="text-[var(--pp-text-body)]">({pagamentos.length})</span>}
        </h3>
        {pagamentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--pp-border)] px-2 py-1.5 text-center text-[9px] font-semibold text-[var(--pp-text-muted)]">
            Escolha a forma, digite o valor e toque em OK. Pode dividir em várias formas.
          </p>
        ) : (
          <ul className="space-y-1">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 py-1">
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[var(--pp-text)]">{rotuloFormaCurto(p.forma)}</span>
                <span className="shrink-0 text-[10px] font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(p.valor)}</span>
                <button
                  type="button"
                  onClick={() => onRemoverPagamento?.(p.id)}
                  aria-label={`Remover ${p.forma}`}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-danger)]"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-[var(--pp-border)] px-2.5 py-1.5">
        <LinhaSaldo label="Recebido" valor={formatCurrency(recebido)} tom="text-[#1F7A3D]" />
        <LinhaSaldo
          label={quitado ? "Restante" : "Falta"}
          valor={formatCurrency(restante)}
          tom={quitado ? "text-[#1F7A3D]" : "text-[var(--pp-danger)]"}
          destaque
        />
        {permiteTroco && troco > 0 && (
          <LinhaSaldo label="Troco" valor={formatCurrency(troco)} tom="text-[var(--pp-primary-text)]" />
        )}
      </div>
    </aside>
  );
}

function TeclaNum({ children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-9 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-sm font-black text-[var(--pp-text)] transition hover:border-[var(--pp-primary)] hover:bg-[var(--pp-surface)] active:bg-[var(--pp-bg)] ${className}`}
    >
      {children}
    </button>
  );
}

function LinhaSaldo({ label, valor, tom = "text-[var(--pp-text)]", destaque }) {
  return (
    <div className="flex h-4 items-center justify-between gap-2">
      <span className="shrink-0 text-[9px] font-semibold text-[var(--pp-text-muted)]">{label}</span>
      <span className={`min-w-0 truncate text-right font-black tabular-nums ${tom} ${destaque ? "text-[13px]" : "text-[10px]"}`}>{valor}</span>
    </div>
  );
}
