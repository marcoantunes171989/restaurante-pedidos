import { ChefHat, Laptop, Smartphone, Tablet } from "lucide-react";
import { Picture, Reveal, SectionHeading } from "../ui";
import { DISPOSITIVOS } from "../content";

const ICONS = {
  smartphone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  chefHat: ChefHat,
};

export default function DevicesSection() {
  return (
    <section id="dispositivos" className="section scroll-mt-24 bg-[#EEEEEE]">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <SectionHeading
            align="left"
            badge={DISPOSITIVOS.badge}
            titulo={DISPOSITIVOS.titulo}
            tituloAccent={DISPOSITIVOS.tituloAccent}
            desc={DISPOSITIVOS.desc}
          />
          <Reveal delay={100}>
            <ul className="mt-9 grid grid-cols-2 gap-3">
              {DISPOSITIVOS.itens.map((item) => {
                const Icon = ICONS[item.icon] || Smartphone;
                return (
                  <li
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-[#012E46]/08 bg-white px-4 py-3.5 shadow-[0_8px_24px_-18px_rgba(1,46,70,0.35)]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#012E46]/[0.06] text-[#012E46]">
                      <Icon className="h-5 w-5" strokeWidth={1.65} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold text-[#012E46]">{item.label}</span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={120} className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] border border-[#012E46]/10 bg-[#012E46] p-2 shadow-[0_24px_60px_-30px_rgba(1,46,70,0.5)]">
          <Picture
            src={DISPOSITIVOS.imagem}
            fallback={DISPOSITIVOS.imagemFallback}
            alt="Dashboard gerencial real do Pedido Prime com indicadores de vendas"
            className="block h-full w-full overflow-hidden rounded-[1.25rem]"
            imgClassName="h-full w-full object-contain"
          />
          <span className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#012E46] shadow-lg sm:text-xs">
            Tela real do sistema
          </span>
        </Reveal>
      </div>
    </section>
  );
}
