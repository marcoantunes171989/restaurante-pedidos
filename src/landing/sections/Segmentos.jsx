import { useState } from "react";
import { Reveal, SectionHeading } from "../ui";
import { IcoSeta } from "../icons";
import { SEGMENTOS_DESTAQUE, SEGMENTOS_EXTRA } from "../content";

// Cartão com foto — placeholder cinza (ver ASSETS.md) até a foto real do
// segmento chegar. Hover: leve zoom na foto + overlay que clareia, para o
// nome do segmento continuar legível sobre a imagem.
function CardSegmento({ s }) {
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--pp-border)] shadow-[0_14px_36px_-28px_rgba(28,20,15,0.25)] transition hover:-translate-y-1 hover:shadow-[0_20px_46px_-24px_rgba(28,20,15,0.3)]">
      <img src={s.img} alt={`Estabelecimento do segmento ${s.nome}`} width="480" height="360" loading="lazy"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--pp-graphite)]/70 via-[var(--pp-graphite)]/10 to-transparent transition group-hover:from-[var(--pp-graphite)]/45" />
      <p className="absolute bottom-3 left-3.5 right-3.5 text-sm font-bold text-white drop-shadow-sm">{s.nome}</p>
    </div>
  );
}

// "Restaurantes de todos os segmentos" — grade 4×2 (2 col no mobile) com
// foto por segmento; "E muito mais" revela os demais segmentos atendidos
// como texto (sem foto), em vez de um link que não leva a lugar nenhum.
export default function Segmentos() {
  const [expandido, setExpandido] = useState(false);
  return (
    <section id="segmentos" className="section scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Para todo tipo de operação" titulo="Restaurantes de todos os segmentos"
          desc="De hamburguerias a hotéis, o Pedido Prime se adapta ao formato e ao ritmo de cada tipo de estabelecimento gastronômico." />

        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SEGMENTOS_DESTAQUE.map((s, i) => (
            <Reveal key={s.nome} delay={(i % 4) * 70}><CardSegmento s={s} /></Reveal>
          ))}
        </div>

        <Reveal delay={140} className="mt-8 text-center">
          <button onClick={() => setExpandido((v) => !v)} aria-expanded={expandido}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--pp-primary-hover)] transition hover:text-[var(--pp-primary)]">
            E muito mais <IcoSeta className={`h-4 w-4 transition-transform ${expandido ? "rotate-90" : ""}`} />
          </button>
          {expandido && (
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[var(--pp-text-muted)]">
              {SEGMENTOS_EXTRA.join(" · ")}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
