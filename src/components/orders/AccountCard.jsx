import { useState } from "react";
import { User, Phone, Loader2, CreditCard, Check } from "lucide-react";
import { formatCurrency } from "../../App";
import AccountStatusBadge from "./AccountStatusBadge";
import { CATEGORIA_ACCENT } from "./accountStatusColors";
import OrderOriginBadge from "./OrderOriginBadge";
import { usePagamentoConta } from "./checkout/usePagamentoConta";

/**
 * Card de conta do Caixa (tema claro) — porta 1:1 a lógica financeira de
 * ContaCard (antigo src/pages/CentralDoCaixa.jsx, tema escuro): mesmo
 * cálculo de subtotal/taxa de serviço (10%, calculado de trás pra
 * frente a partir do total), mesma validação de múltiplas formas de
 * pagamento (soma tem que bater exatamente com o total, sem troco —
 * nunca foi essa a regra aqui), mesmo toggle de forma de pagamento,
 * mesmo parse de valor em centavos. Nada disso foi alterado — só a
 * apresentação. "Detalhes" continua sendo expansão inline no próprio
 * card (não virou modal): era assim que já funcionava.
 */
export default function AccountCard({
  o, categoria, totalCom, haTxt, numeroPedido, telMascarado, opcoes,
  pagando, onFinalizar, retirando, onRetirar, onAbrirCheckout, destacado = false, cardRef,
}) {
  const [aberto, setAberto] = useState(false);
  const total = totalCom(o);
  const pago = categoria === "pago";
  const externo = o.table === "Externo" || /^EXT-/.test(o.command || "");
  const origem = { l: externo ? "Delivery" : "Mesa / QR" };
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const subtitulo = externo ? (tableSub || "Delivery/retirada") : (tableBase || o.table);

  // Estado do formulário de pagamento (múltiplas formas) — lógica compartilhada
  // com a tela PDV (usePagamentoConta), escondida atrás de "Receber".
  const { linhas, soma, restante, valido, sub, taxa, fmtMoeda, toggleForma, editarValor } = usePagamentoConta(total);

  const itensVisiveis = (o.items || []).slice(0, 3);
  const itensExtra = (o.items || []).length - itensVisiveis.length;

  return (
    <article ref={cardRef} className={`relative overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_2px_10px_rgba(43,35,32,0.05)] transition-shadow duration-200 hover:shadow-[0_4px_18px_rgba(43,35,32,0.09)] ${destacado ? "pp-order-destaque" : ""}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: CATEGORIA_ACCENT[categoria] }} />

      <div className="mb-3 flex items-center justify-between gap-2 pl-2">
        <AccountStatusBadge categoria={categoria} />
        <OrderOriginBadge origem={origem} tempoTexto={haTxt(o)} />
      </div>

      <div className="pl-2">
        <div className="flex items-center gap-2 text-sm">
          <User aria-hidden="true" size={14} className="shrink-0 text-[var(--pp-text-muted)]" />
          <h4 className="min-w-0 flex-1 truncate text-base font-bold leading-tight text-[var(--pp-text)]">
            Pedido #{numeroPedido[o.id] ?? "—"} <span className="font-semibold text-[var(--pp-text-body)]">· {o.customer || "Cliente"}</span>
          </h4>
        </div>
        <p className="mt-0.5 text-xs text-[var(--pp-text-muted)]">{subtitulo}</p>
        <p className="mt-0.5 text-[11px] tracking-wide text-[var(--pp-text-muted)]">{o.id}</p>
        {telMascarado(o.clienteTelefone) && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--pp-text-body)]">
            <Phone aria-hidden="true" size={11} /> {telMascarado(o.clienteTelefone)}
          </p>
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-y border-dashed border-[var(--pp-border)] py-2.5 pl-2">
        {itensVisiveis.map((it, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 font-bold tabular-nums text-[var(--op-nav-accent)]">{it.quantity}×</span>
            <span className="min-w-0 flex-1 break-words text-[var(--pp-text-body)]">{it.name}</span>
          </div>
        ))}
        {itensExtra > 0 && <p className="text-xs font-semibold text-[var(--pp-text-muted)]">+ {itensExtra} {itensExtra === 1 ? "item" : "itens"}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-2">
        <span className="shrink-0 text-xs text-[var(--pp-text-muted)]">Total</span>
        <span className="min-w-0 break-words text-right text-[22px] font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 pl-2 min-[380px]:grid-cols-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-h-[44px] min-w-0 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]"
        >
          Detalhes
        </button>
        {pago ? (
          <button
            type="button"
            onClick={() => onRetirar(o)}
            disabled={retirando}
            className="flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-xl btn-verde bg-[var(--pp-success)] text-sm font-bold text-white transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {retirando ? <><Loader2 aria-hidden="true" size={15} className="animate-spin" /> Confirmando…</> : <><Check aria-hidden="true" size={15} /> Retirada</>}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (onAbrirCheckout ? onAbrirCheckout(o) : setAberto(true))}
            className="btn-laranja flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]"
          >
            <CreditCard aria-hidden="true" size={15} /> Receber
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-3 space-y-2 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
          <div className="space-y-1">
            {(o.items || []).map((it, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                <span className="min-w-0 flex-1 break-words text-[var(--pp-text-body)]">{it.quantity}× {it.name}</span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--pp-text)]">{formatCurrency(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5 border-t border-[var(--pp-border)] pt-2 text-xs">
            <div className="flex flex-wrap justify-between gap-x-2 text-[var(--pp-text-muted)]"><span>Subtotal</span><span className="tabular-nums text-[var(--pp-text)]">{formatCurrency(sub)}</span></div>
            <div className="flex flex-wrap justify-between gap-x-2 text-[var(--pp-text-muted)]"><span>Taxa de serviço (10%)</span><span className="tabular-nums text-[var(--pp-text)]">{formatCurrency(taxa)}</span></div>
            <div className="flex flex-wrap justify-between gap-x-2 text-sm font-black"><span className="text-[var(--pp-text)]">Total</span><span className="tabular-nums text-[var(--pp-success-text)]">{formatCurrency(total)}</span></div>
          </div>

          {!pago && (
            <>
              <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Forma(s) de pagamento</p>
              <div className="grid grid-cols-2 gap-1.5">
                {opcoes.map((f) => {
                  const on = linhas.some((l) => l.forma === f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleForma(f)}
                      aria-pressed={on}
                      className={`flex min-h-[40px] items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-center text-xs font-bold transition-colors duration-150 ${
                        on ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]" : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
                      }`}
                    >
                      {on && <Check aria-hidden="true" size={13} className="shrink-0" />}<span className="min-w-0 break-words">{f}</span>
                    </button>
                  );
                })}
              </div>
              {linhas.length > 0 && (
                <div className="space-y-1.5">
                  {linhas.map((l) => (
                    <div key={l.forma} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 break-words text-xs font-bold text-[var(--op-nav-accent)]">{l.forma}</span>
                      <span className="shrink-0 text-xs text-[var(--pp-text-muted)]">R$</span>
                      <input
                        inputMode="numeric"
                        value={fmtMoeda(l.valor)}
                        onChange={(e) => editarValor(l.forma, e.target.value)}
                        aria-label={`Valor pago em ${l.forma}`}
                        className="w-28 shrink-0 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-1 text-right text-sm font-bold tabular-nums text-[var(--pp-text)] outline-none transition-colors duration-150 focus:border-[var(--pp-primary)] focus:ring-[3px] focus:ring-[var(--pp-primary-soft)]"
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
                    <span className={`min-w-0 break-words font-bold ${Math.abs(restante) < 0.01 ? "text-[var(--pp-success-text)]" : restante > 0 ? "text-[var(--pp-warning-text)]" : "text-[var(--pp-danger)]"}`}>
                      {Math.abs(restante) < 0.01 ? "Valor confere ✓" : restante > 0 ? `Falta ${formatCurrency(restante)}` : `Excede ${formatCurrency(-restante)}`}
                    </span>
                    <span className="min-w-0 break-words tabular-nums text-[var(--pp-text-muted)]">Pago {formatCurrency(soma)} / {formatCurrency(total)}</span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => onFinalizar(o, linhas, total)}
                disabled={!valido || pagando}
                className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl btn-verde bg-[var(--pp-success)] text-sm font-bold text-white transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--pp-bg)] disabled:text-[var(--pp-text-muted)]"
              >
                {pagando && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
                {pagando ? "Registrando…" : linhas.length === 0 ? "Selecione a forma de pagamento" : !valido ? "Confirme o valor" : "Finalizar pagamento"}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
