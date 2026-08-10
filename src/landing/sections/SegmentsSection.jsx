import { Picture, Reveal, SectionHeading } from "../ui";
import { SEGMENTOS } from "../content";

export default function SegmentsSection() {
  return (
    <section id="segmentos" className="section scroll-mt-24 overflow-hidden bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-8">
        <div>
          <SectionHeading
            align="left"
            badge={SEGMENTOS.badge}
            titulo={SEGMENTOS.titulo}
            tituloAccent={SEGMENTOS.tituloAccent}
            desc="Do salão fino à operação dinâmica — uma plataforma adaptada ao ritmo da gastronomia."
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {SEGMENTOS.fotos.map((foto, i) => {
            const tall = i % 3 === 0;
            return (
              <Reveal
                key={foto.rotulo}
                delay={i * 50}
                className={`group relative overflow-hidden rounded-2xl ${tall ? "min-h-[180px] sm:min-h-[220px] md:row-span-2 md:min-h-full" : "min-h-[140px] sm:min-h-[160px]"}`}
              >
                <Picture
                  src={foto.src}
                  fallback={foto.fallback}
                  alt={foto.alt}
                  className="absolute inset-0 block h-full w-full"
                  imgClassName="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#012E46]/75 via-[#012E46]/15 to-transparent"
                />
                <p className="absolute bottom-3 left-3 text-sm font-bold text-white">
                  {foto.rotulo}
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
