import { formatCurrency, fallbackImage } from "../../App";
import { CkIconCoracao, CkIconEstrela, CkIconRelogio } from "../../components/cardapio/CkIcons.jsx";

// ════════════════════════════════════════════════════════════
//  Card de produto da grade do Cardápio Externo — extraído da
//  função renderProduto() de CardapioPublico.jsx. Mesmo
//  comportamento/estrutura; tipografia no teto font-semibold.
// ════════════════════════════════════════════════════════════
export default function CardapioProdutoCard({ item, promo, favorito, onAbrir }) {
  const indisponivel = item.disponivel === false;
  const abrir = () => { if (!indisponivel) onAbrir(); };
  const destaque = promo || (item.isFeatured && !indisponivel);

  return (
    <article className={`flex h-full gap-2.5 !rounded-none border-x-0 border-t-0 border-b !bg-transparent px-0 py-2.5 !shadow-none ${destaque ? "border-[var(--client-offer-border)]" : "border-[var(--client-border)]"}`}>
      {/* Imagem — alvo de toque que abre a personalização. */}
      <button type="button" onClick={abrir} disabled={indisponivel}
        aria-label={indisponivel ? `${item.name} — indisponível` : `Ver ${item.name}`}
        className="relative shrink-0 transition active:scale-[0.98] disabled:cursor-not-allowed">
        <span
          className="relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[var(--client-surface-secondary)]"
          style={{
            backgroundImage: `url(${JSON.stringify(String(item.imageUrl || fallbackImage))})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <img
            src={item.imageUrl || fallbackImage}
            alt={item.name}
            loading="lazy"
            decoding="async"
            width={72}
            height={72}
            onError={(e) => {
              if (e.currentTarget.src !== fallbackImage) {
                e.currentTarget.src = fallbackImage;
                const box = e.currentTarget.parentElement;
                if (box) {
                  box.style.backgroundImage = `url(${JSON.stringify(fallbackImage)})`;
                }
              }
            }}
            className={`pp-img-fill block h-full w-full object-cover ${indisponivel ? "grayscale opacity-50" : ""}`}
            style={{ maxWidth: "none" }}
          />
        </span>
        {promo && !indisponivel && <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--client-offer-hover)] px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-[var(--client-shadow-sm)]">{promo.label}</span>}
        {indisponivel && <span className="absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--client-border)] bg-white/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--client-text-secondary)]">Indisponível</span>}
        {favorito && !indisponivel && (
          <span aria-label="Favorito" title="Favorito" className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--client-surface)] text-[var(--client-primary-hover)] shadow-[var(--client-shadow-sm)]">
            <CkIconCoracao width={13} height={13} />
          </span>
        )}
      </button>

      {/* Conteúdo — nome/descrição/tempo e, embaixo, preço + "+". */}
      <div className="relative flex min-w-0 flex-1 flex-col pr-8">
        <button type="button" onClick={abrir} disabled={indisponivel}
          aria-label={indisponivel ? `${item.name} — indisponível` : `Ver ${item.name}`}
          className="text-left transition disabled:cursor-not-allowed">
          {item.isFeatured && !indisponivel && (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--client-primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--client-primary-hover)]">
              <CkIconEstrela width={10} height={10} /> {item.featuredLabel || "Mais vendido"}
            </span>
          )}
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.15] text-[var(--client-info)]">{item.name}</h3>
          {item.description && <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-4 text-[var(--client-text-secondary)]">{item.description}</p>}
          {item.time && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[9.5px] font-semibold leading-3 text-[var(--client-text-muted)]">
              <CkIconRelogio width={11} height={11} /> {item.time}
            </p>
          )}
        </button>

        <div className="mt-0 flex items-center gap-2 leading-none">
          {promo
            ? <span className="flex flex-col gap-0.5 leading-none">
                <span className="text-[11px] font-semibold text-[var(--client-text-muted)] line-through">{formatCurrency(promo.original)}</span>
                <span className="text-[14px] font-semibold text-[var(--client-offer-hover)]">{formatCurrency(promo.preco)}</span>
                <span className="mt-0.5 inline-flex w-max items-center rounded-md bg-[var(--client-offer-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--client-offer-hover)]">Economize {formatCurrency(promo.original - promo.preco)}</span>
              </span>
            : <span className="text-[13px] font-semibold leading-4 text-[var(--client-info)]">{formatCurrency(item.price)}</span>}
        </div>
        {indisponivel
          ? <span className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-sm text-[var(--client-text-muted)]">✕</span>
          : <button onClick={abrir} aria-label={`Adicionar ${item.name}`} className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center border-0 bg-transparent text-base font-semibold text-[var(--client-primary)] transition active:scale-90 hover:text-[var(--client-info)]">+</button>}
      </div>
    </article>
  );
}
