import { Plus, Minus, Sparkles, Clock, Star } from "lucide-react";
import { formatCurrency, fallbackImage } from "../../App";

// Card de produto — horizontal em todas as resoluções: imagem à esquerda,
// informações comerciais à direita (nunca imagem em cima/conteúdo embaixo,
// nem em celular). A coluna direita usa flex-col com a área de preço/botão
// empurrada para o rodapé via mt-auto, para que cards com nomes/descrições
// de tamanhos diferentes mantenham o preço e o botão alinhados na mesma
// altura relativa. "Personalizável" só aparece quando o produto tem de fato
// grupos de opções, adicionais ou ingredientes cadastrados — nunca um selo
// genérico. `onAbrir` é usado tanto para "Adicionar" quanto para o "+"
// quando já está no carrinho: o produto sempre passa pelo modal de
// personalização antes de entrar (mesma regra de negócio já existente).
//
// `promo` (quando existe) já vem validado pelo chamador (App.jsx,
// promoDoProdutoTablet): { preco, original, label }, sempre com
// preco < original e original > 0 — reflete só promoções reais cadastradas,
// nunca inventadas aqui. O percentual de desconto é recalculado a partir
// desses dois valores e só é exibido quando é um número finito e positivo.
export default function TabletProductCard({ item, promo, etiqueta, noCarrinho, indisponivel, personalizavel, onAbrir, onRemover }) {
  const percentualOff = promo && promo.original > 0
    ? Math.round(((promo.original - promo.preco) / promo.original) * 100)
    : null;
  const percentualValido = Number.isFinite(percentualOff) && percentualOff > 0;

  return (
    <article className={`flex overflow-hidden rounded-2xl border bg-[var(--client-surface)] shadow-[var(--client-shadow-sm)] transition-shadow hover:shadow-[var(--client-shadow-md)] ${noCarrinho ? "border-[var(--client-primary)] ring-2 ring-[var(--client-primary-soft)]" : "border-[var(--client-border)]"}`}>
      {/* Coluna esquerda — imagem (112–140px no celular; percentual do card a partir de sm/lg) */}
      <button type="button" onClick={() => !indisponivel && onAbrir(item)} disabled={indisponivel}
        className="group relative block w-[120px] shrink-0 overflow-hidden bg-[var(--client-background-soft)] text-left disabled:cursor-not-allowed sm:w-[38%] lg:w-[40%]">
        <img src={item.imageUrl || fallbackImage} alt={item.name} loading="lazy" decoding="async"
          className={`h-full min-h-[128px] w-full object-cover transition-transform duration-200 group-hover:scale-105 ${indisponivel ? "opacity-50 grayscale" : ""}`} />
        {etiqueta && !indisponivel && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--client-offer-soft)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--client-offer-hover)] shadow-sm sm:left-2 sm:top-2">{etiqueta}</span>
        )}
        {promo && !indisponivel && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[var(--client-offer-hover)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-sm sm:bottom-2 sm:left-2">{promo.label}</span>
        )}
        {indisponivel && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-wider text-[var(--client-text-muted)]">Indisponível</span>
        )}
        {noCarrinho && !indisponivel && (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--client-primary-hover)] text-[11px] font-black text-[#012E46] shadow-sm sm:right-2 sm:top-2">{noCarrinho.quantity}</span>
        )}
      </button>

      {/* Coluna direita — nome, descrição, personalização, preço/oferta e ação */}
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
        {item.isFeatured && !indisponivel && (
          <span className="mb-1 inline-flex w-max items-center gap-1 rounded-full bg-[var(--client-primary-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--client-primary-hover)]">
            <Star aria-hidden="true" size={10} /> Mais vendido
          </span>
        )}
        <h3 title={item.name} className="line-clamp-2 text-sm font-bold leading-tight text-[var(--client-text-primary)] sm:text-base">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--client-text-secondary)] sm:line-clamp-3">{item.description}</p>}
        {item.time && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[var(--client-text-muted)]"><Clock aria-hidden="true" size={11} /> {item.time}</p>
        )}
        {personalizavel && !indisponivel && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[var(--client-info)]"><Sparkles aria-hidden="true" size={11} /> Personalizável</p>
        )}

        <div className="mt-auto pt-2.5">
          {promo ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--client-text-muted)] line-through">{formatCurrency(promo.original)}</span>
                {percentualValido && (
                  <span className="rounded-full bg-[var(--client-offer-soft)] px-1.5 py-0.5 text-[9px] font-black leading-none text-[var(--client-offer-hover)]">{percentualOff}% OFF</span>
                )}
              </div>
              <p className="text-xl font-black leading-tight text-[var(--client-offer-hover)]">{formatCurrency(promo.preco)}</p>
              {promo.original > promo.preco && (
                <span className="mt-1 inline-flex w-max items-center rounded-md bg-[var(--client-offer-soft)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--client-offer-hover)]">Economize {formatCurrency(promo.original - promo.preco)}</span>
              )}
            </div>
          ) : (
            <p className="text-xl font-black leading-tight text-[var(--client-text-primary)]">{formatCurrency(item.price)}</p>
          )}

          {indisponivel ? (
            <div className="mt-2.5 w-full rounded-xl border border-[var(--client-border)] bg-[var(--client-background-soft)] px-3 py-2.5 text-center text-xs font-bold text-[var(--client-text-muted)]">Indisponível</div>
          ) : noCarrinho ? (
            <div className="mt-2.5 flex items-center justify-between gap-1 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] p-1">
              <button type="button" onClick={() => onRemover(item)} aria-label={`Remover uma unidade de ${item.name}`}
                className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--client-border)] bg-[var(--client-surface)] font-black text-[var(--client-text-primary)] transition active:scale-95 hover:bg-[var(--client-background-soft)]"><Minus aria-hidden="true" size={14} /></button>
              <span className="w-8 text-center text-sm font-black text-[var(--client-text-primary)]">{noCarrinho.quantity}</span>
              <button type="button" onClick={() => onAbrir(item)} title="Personalizar / adicionar mais" aria-label={`Adicionar mais uma unidade de ${item.name}`}
                className="flex h-11 flex-1 items-center justify-center rounded-lg btn-laranja bg-[var(--client-primary-hover)] font-black text-[#012E46] transition active:scale-95 hover:bg-[var(--client-primary)]"><Plus aria-hidden="true" size={14} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => onAbrir(item)}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl btn-laranja bg-[var(--client-primary-hover)] px-3 text-sm font-bold text-[#012E46] transition active:scale-95 hover:bg-[var(--client-primary)]">
              Adicionar <Plus aria-hidden="true" size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
