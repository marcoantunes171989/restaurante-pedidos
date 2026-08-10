import { Activity, Headset, Receipt, Store } from "lucide-react";
import { Reveal } from "../ui";
import { METRICAS } from "../content";

const ICONS = {
  store: Store,
  receipt: Receipt,
  activity: Activity,
  headset: Headset,
};

export default function MetricsSection() {
  return (
    <section id="indicadores" className="section scroll-mt-24 bg-[#EEEEEE]/60">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {METRICAS.itens.map((item, i) => {
            const Icon = ICONS[item.icon] || Store;
            return (
              <Reveal
                as="article"
                key={item.titulo}
                delay={i * 60}
                className="rounded-2xl border border-[#012E46]/08 bg-white p-6"
              >
                <span className="inline-flex text-[#F38525]">
                  <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold text-[#012E46]">{item.titulo}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5B4F47]">{item.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
