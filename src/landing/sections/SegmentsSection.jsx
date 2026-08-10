import { Activity, Headset, Receipt, Store } from "lucide-react";
import { Picture, Reveal, SectionHeading } from "../ui";
import { METRICAS, SEGMENTOS } from "../content";

const METRIC_ICONS = {
  store: Store,
  receipt: Receipt,
  activity: Activity,
  headset: Headset,
};

/** Colagem 3 fotos (referência) + indicadores institucionais na mesma seção. */
export default function SegmentsSection() {
  const collage = SEGMENTOS.fotos.slice(0, 3);

  return (
    <section id="segmentos" className="section scroll-mt-24 overflow-hidden bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <div>
          <SectionHeading
            align="left"
            badge={SEGMENTOS.badge}
            titulo={SEGMENTOS.titulo}
            tituloAccent={SEGMENTOS.tituloAccent}
            desc="Do salão fino à operação dinâmica — uma plataforma adaptada ao ritmo da gastronomia."
          />

          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {METRICAS.itens.map((item, i) => {
              const Icon = METRIC_ICONS[item.icon] || Store;
              return (
                <Reveal
                  as="li"
                  key={item.titulo}
                  delay={i * 55}
                  className="rounded-2xl border border-[#012E46]/10 bg-[#EEEEEE]/60 px-4 py-4"
                >
                  <span className="inline-flex text-[#F38525]">
                    <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <p className="mt-2.5 text-sm font-bold leading-snug text-[#012E46]">{item.titulo}</p>
                  <p className="mt-1 text-xs leading-5 text-[#012E46]/65">{item.desc}</p>
                </Reveal>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Reveal className="relative min-h-[280px] overflow-hidden rounded-[1.5rem] sm:min-h-[360px] lg:min-h-[440px]">
            <Picture
              src={collage[0].src}
              fallback={collage[0].fallback}
              alt={collage[0].alt}
              className="absolute inset-0 block h-full w-full"
              imgClassName="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#012E46]/70 via-transparent to-transparent"
            />
            <p className="absolute bottom-4 left-4 text-sm font-bold text-white">{collage[0].rotulo}</p>
          </Reveal>

          <div className="grid gap-3 sm:gap-4">
            {collage.slice(1).map((foto, i) => (
              <Reveal
                key={foto.rotulo}
                delay={(i + 1) * 70}
                className="relative min-h-[130px] overflow-hidden rounded-[1.5rem] sm:min-h-[170px] lg:min-h-[210px]"
              >
                <Picture
                  src={foto.src}
                  fallback={foto.fallback}
                  alt={foto.alt}
                  className="absolute inset-0 block h-full w-full"
                  imgClassName="h-full w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#012E46]/70 via-transparent to-transparent"
                />
                <p className="absolute bottom-3 left-3 text-sm font-bold text-white">{foto.rotulo}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
