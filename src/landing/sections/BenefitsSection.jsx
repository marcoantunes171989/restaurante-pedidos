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
        <Reveal className="relative order-2 aspect-[16/10] overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#071725] p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] lg:order-1">
          <Picture
            src={BENEFICIOS.imagem}
            fallback={BENEFICIOS.imagemFallback}
            alt="Mockup 3D da gestão Pedido Prime em computador, notebook e celular"
            className="block h-full w-full overflow-hidden rounded-[1.25rem]"
            imgClassName="h-full w-full object-contain"
          />
          <span className="absolute right-4 top-4 rounded-full bg-[#F38525] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#012E46] shadow-lg sm:text-xs">
            Gestão de onde estiver
          </span>
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
