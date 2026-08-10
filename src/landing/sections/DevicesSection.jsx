import { ChefHat, Laptop, Smartphone, Tablet } from "lucide-react";
import { Reveal, SectionHeading } from "../ui";
import { DeviceStack } from "../components/DeviceStack";
import { TelaCardapioCliente, TelaDashboard, TelaKanban, TelaMesa } from "../devices";
import { DISPOSITIVOS } from "../content";

const ICONS = {
  smartphone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  chefHat: ChefHat,
};

const COZINHA = [
  { titulo: "Fila", cards: ["Risoto"] },
  { titulo: "Preparo", cards: ["Burger"] },
  { titulo: "Pronto", cards: ["Café"] },
];

export default function DevicesSection() {
  return (
    <section id="dispositivos" className="section scroll-mt-24 bg-[#F7F5F2]">
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
            <ul className="mt-8 grid grid-cols-2 gap-4">
              {DISPOSITIVOS.itens.map((item) => {
                const Icon = ICONS[item.icon] || Smartphone;
                return (
                  <li
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-[#012E46]/08 bg-white px-4 py-3.5"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#012E46]/5 text-[#012E46]">
                      <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold text-[#012E46]">{item.label}</span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={120} className="relative min-w-0">
          <DeviceStack
            laptop={<TelaDashboard compacta />}
            tablet={<TelaMesa />}
            phone={<TelaCardapioCliente compacta />}
          />
          <div className="pp-float absolute -bottom-4 -right-2 z-20 hidden w-[42%] max-w-[220px] sm:block">
            <div className="overflow-hidden rounded-2xl border-[5px] border-[#012E46] bg-white shadow-2xl">
              <TelaKanban colunas={COZINHA} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
