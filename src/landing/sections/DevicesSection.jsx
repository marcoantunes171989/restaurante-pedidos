import { ChefHat, Laptop, Smartphone, Tablet } from "lucide-react";
import { Reveal, SectionHeading } from "../ui";
import { DISPOSITIVOS } from "../content";

const ICONS = {
  smartphone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  chefHat: ChefHat,
};

export default function DevicesSection() {
  return (
    <section id="dispositivos" className="section scroll-mt-24 bg-[#F7F5F2]">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading
          badge={DISPOSITIVOS.badge}
          titulo={DISPOSITIVOS.titulo}
          tituloAccent={DISPOSITIVOS.tituloAccent}
          desc={DISPOSITIVOS.desc}
        />
        <Reveal delay={100}>
          <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {DISPOSITIVOS.itens.map((item) => {
              const Icon = ICONS[item.icon] || Smartphone;
              return (
                <li
                  key={item.label}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-[#012E46]/08 bg-white px-4 py-5 text-center"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#012E46]/5 text-[#012E46]">
                    <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-bold text-[#012E46]">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
