import { LineChart, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Picture, Reveal, SectionHeading } from "../ui";
import { BENEFICIOS } from "../content";

const ICONS = {
  zap: Zap,
  trendingDown: TrendingDown,
  trendingUp: TrendingUp,
  lineChart: LineChart,
};

export default function BenefitsSection() {
  return (
    <section id="beneficios" className="section scroll-mt-24 bg-[#012E46] text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <Reveal className="relative order-2 min-h-[280px] overflow-hidden rounded-[1.75rem] sm:min-h-[360px] lg:order-1 lg:min-h-[480px]">
          <Picture
            src={BENEFICIOS.imagem}
            fallback={BENEFICIOS.imagemFallback}
            alt="Equipe de restaurante acompanhando a operação no salão"
            className="absolute inset-0 block h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#012E46]/55 via-transparent to-transparent"
          />
        </Reveal>

        <div className="order-1 lg:order-2">
          <SectionHeading
            align="left"
            claro
            badge={BENEFICIOS.eyebrow}
            titulo={BENEFICIOS.titulo}
            tituloAccent={BENEFICIOS.tituloAccent}
            desc={BENEFICIOS.desc}
          />
          <ul className="mt-10 space-y-6">
            {BENEFICIOS.itens.map((item, i) => {
              const Icon = ICONS[item.icon] || Zap;
              return (
                <Reveal as="li" key={item.titulo} delay={i * 70} className="flex gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F38525] text-[#012E46] shadow-[0_8px_22px_-8px_rgba(243,133,37,0.65)]">
                    <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="pt-0.5">
                    <h3 className="text-base font-bold text-white">{item.titulo}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/75">{item.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
