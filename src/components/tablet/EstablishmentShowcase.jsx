import { UtensilsCrossed, Tablet } from "lucide-react";
import ProductHighlightCarousel from "./ProductHighlightCarousel";

// Área visual do estabelecimento — logomarca + identidade sobrepostas a
// uma vitrine de produtos reais em destaque (ou, na ausência deles, um
// placeholder gastronômico neutro — nunca uma imagem quebrada ou
// inventada). Sem produto algum com imagem cadastrada, mostra só o
// placeholder; nunca busca imagem externa.
export default function EstablishmentShowcase({ lojaInfo, produtosDestaque = [] }) {
  const temImagens = produtosDestaque.length > 0;
  const nome = lojaInfo?.nome || "Pedido Prime";

  return (
    <div className="relative flex h-full min-h-[240px] flex-col overflow-hidden rounded-[24px] border border-[var(--client-border)] shadow-[var(--client-shadow-md)] lg:min-h-0 lg:rounded-[28px]">
      <div className="absolute inset-0">
        {temImagens ? (
          <ProductHighlightCarousel produtos={produtosDestaque} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,var(--client-primary-soft),var(--client-background)_70%)]">
            <UtensilsCrossed aria-hidden="true" size={64} strokeWidth={1.2} className="text-[var(--client-primary-border)]" />
          </div>
        )}
      </div>

      {/* Gradiente superior — só para garantir leitura da identidade sobre a imagem */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28" style={{ background: "linear-gradient(to bottom, rgba(33,24,20,0.55), transparent)" }} />

      <div className="relative z-10 flex items-center gap-3 p-5 sm:p-6">
        {lojaInfo?.logoUrl ? (
          <img
            src={lojaInfo.logoUrl} alt={`Logo ${nome}`} width={48} height={48}
            className="h-12 w-12 shrink-0 rounded-2xl border border-white/40 bg-white object-cover shadow-[var(--client-shadow-sm)]"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/90 text-lg font-black text-[var(--client-primary-active)] shadow-[var(--client-shadow-sm)]">
            {nome.trim().charAt(0).toUpperCase() || "P"}
          </span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/85">
            <Tablet aria-hidden="true" size={12} /> Tablet de atendimento
          </p>
          <h1 className="truncate text-lg font-black leading-tight text-white sm:text-xl">{nome}</h1>
        </div>
      </div>
    </div>
  );
}
