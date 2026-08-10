import {
  BarChart3,
  ClipboardList,
  MonitorSmartphone,
  Package,
  Puzzle,
  Users,
} from "lucide-react";
import { Reveal, SectionHeading } from "../ui";
import { SOLUCOES } from "../content";

const ICONS = {
  monitorSmartphone: MonitorSmartphone,
  clipboardList: ClipboardList,
  users: Users,
  barChart3: BarChart3,
  package: Package,
  puzzle: Puzzle,
};

export default function SolutionsSection() {
  return (
    <section id="solucoes" className="section scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading
          badge={SOLUCOES.badge}
          titulo={SOLUCOES.titulo}
          tituloAccent={SOLUCOES.tituloAccent}
        />

        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUCOES.itens.map((item, i) => {
            const Icon = ICONS[item.icon] || Package;
            return (
              <Reveal
                as="article"
                key={item.titulo}
                delay={i * 60}
                className="group border-t border-[#012E46]/10 pt-6"
              >
                <span className="inline-flex text-[#012E46] transition group-hover:text-[#F38525]">
                  <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-[#012E46]">{item.titulo}</h3>
                <p className="mt-2 text-sm leading-6 text-[#012E46]/70">{item.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
