import { Plus, Minus, Sparkles } from "lucide-react";
import { formatCurrency, fallbackImage } from "../../App";

// Card de produto — reescrito do zero em superfície clara (--client-*).
// "Personalizável" só aparece quando o produto tem de fato grupos de
// opções, adicionais ou ingredientes removíveis cadastrados — nunca um
// selo genérico. `onAbrir` é usado tanto para "Adicionar" quanto para o
// "+" quando já está no carrinho: o produto sempre passa pelo modal de
// personalização antes de entrar (mesma regra de negócio já existente).
//
// `promo` (quando existe) já vem validado pelo chamador (App.jsx,
// promoDoProdutoTablet): { preco, original, label }, sempre com
// preco < original e original > 0 — reflete só promoções reais cadastradas,
// nunca inventadas aqui. O percentual de desconto é recalculado a partir
// desses dois valores e só é exibido quando é um número finito e positivo.
export default function TabletProductCard({ item, promo, etiqueta, noCarrinho, indisponivel, personalizavel, onAbrir, onRemover, featured = false }) {
  const percentualOff = promo && promo.original > 0
    ? Math.round(((promo.original - promo.preco) / promo.original) * 100)
    : null;
  const percentualValido = Number.isFinite(percentualOff) && percentualOff > 0;

  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-[var(--client-surface)] shadow-[var(--client-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--client-shadow-md)] ${noCarrinho ? "border-[var(--client-primary)] ring-2 ring-[var(--client-primary-soft)]" : "border-[var(--client-border)]"} ${featured ? "w-[210px] shrink-0 snap-start sm:w-[230px]" : ""}`}>
      <button type="button" onClick={() => !indisponivel && onAbrir(item)} disabled={indisponivel}
        className={`relative block w-full overflow-hidden bg-[var(--client-background-soft)] text-left disabled:cursor-not-allowed ${featured ? "h-32" : "h-28 sm:h-32"}`}>
        <img src={item.imageUrl || fallbackImage} alt={item.name} loading="lazy" decoding="async"
          className={`h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 ${indisponivel ? "opacity-50 grayscale" : ""}`} />
        {etiqueta && !indisponivel && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--client-gold-soft)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--client-gold-hover)] shadow-sm">{etiqueta}</span>
        )}
        {promo && !indisponivel && (
          <span className="absolute bottom-2 left-2 rounded-full bg-[var(--client-gold)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-sm">{promo.label}</span>
        )}
        {indisponivel && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--client-text-muted)]">Indisponível</span>
        )}
        {noCarrinho && !indisponivel && (
          <span aria-hidden="true" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--client-primary)] text-[11px] font-black text-white shadow-sm">{noCarrinho.quantity}</span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-[var(--client-text-primary)]">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--client-text-secondary)]">{item.description}</p>}
        <div className="mt-auto pt-2.5">
          {/* "Personalizável" numa linha própria (nunca disputa espaço com o
              preço — em cards estreitos, como os de destaques, os dois lado a
              lado colidiam) e o preço sempre destacado e alinhado à direita,
              com o selo de oferta agrupado ao valor original quando promocional. */}
          {personalizavel && !indisponivel && (
            <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-[var(--client-info)]"><Sparkles aria-hidden="true" size={11} /> Personalizável</p>
          )}
          <div className="text-right">
            {promo ? (
              <>
                <div className="flex items-center justify-end gap-1">
                  <span className="text-[11px] font-semibold text-[var(--client-text-muted)] line-through">{formatCurrency(promo.original)}</span>
                  {percentualValido && (
                    <span className="rounded-full bg-[var(--client-gold-soft)] px-1.5 py-0.5 text-[9px] font-black leading-none text-[var(--client-gold-hover)]">{percentualOff}% OFF</span>
                  )}
                </div>
                <p className="text-lg font-black leading-tight text-[var(--client-gold-hover)]">{formatCurrency(promo.preco)}</p>
              </>
            ) : (
              <p className="text-lg font-black leading-tight text-[var(--client-text-primary)]">{formatCurrency(item.price)}</p>
            )}
          </div>
          {indisponivel ? (
            <div className="mt-2.5 w-full rounded-xl border border-[var(--client-border)] bg-[var(--client-background-soft)] px-3 py-2.5 text-center text-xs font-bold text-[var(--client-text-muted)]">Indisponível</div>
          ) : noCarrinho ? (
            <div className="mt-2.5 flex items-center justify-between gap-1 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] p-1">
              <button type="button" onClick={() => onRemover(item)} aria-label={`Remover uma unidade de ${item.name}`}
                className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--client-border)] bg-[var(--client-surface)] font-black text-[var(--client-text-primary)] transition active:scale-95 hover:bg-[var(--client-background-soft)]"><Minus aria-hidden="true" size={14} /></button>
              <span className="w-8 text-center text-sm font-black text-[var(--client-text-primary)]">{noCarrinho.quantity}</span>
              <button type="button" onClick={() => onAbrir(item)} title="Personalizar / adicionar mais" aria-label={`Adicionar mais uma unidade de ${item.name}`}
                className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--client-primary)] font-black text-white transition active:scale-95 hover:bg-[var(--client-primary-hover)]"><Plus aria-hidden="true" size={14} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => onAbrir(item)}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--client-primary)] px-3 text-sm font-bold text-white transition active:scale-95 hover:bg-[var(--client-primary-hover)]">
              Adicionar <Plus aria-hidden="true" size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
