import {
  BarChart3,
  ClipboardList,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { CardTitle, Reveal, SectionHeading } from "../ui";
import { SOLUCOES } from "../content";

const ICONS = {
  shoppingCart: ShoppingCart,
  clipboardList: ClipboardList,
  users: Users,
  barChart3: BarChart3,
  package: Package,
  settings: Settings,
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

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUCOES.itens.map((item, i) => {
            const Icon = ICONS[item.icon] || Package;
            return (
              <Reveal
                as="article"
                key={item.titulo}
                delay={i * 55}
                className="group"
              >
                <span className="inline-flex text-[#012E46] transition duration-300 group-hover:text-[#F38525]">
                  <Icon className="h-8 w-8" strokeWidth={1.45} aria-hidden="true" />
                </span>
                <CardTitle className="mt-5 tracking-tight">
                  {item.titulo}
                </CardTitle>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#012E46]/68">
                  {item.desc}
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
