import { BadgeDollarSign, ChartNoAxesCombined, ChefHat, Tablet, UserRound } from "lucide-react";
import { Reveal, SectionHeading } from "../ui";
import { EXPERIENCIA_POR_PERFIL } from "../content";

const icons = { userRound: UserRound, tablet: Tablet, chefHat: ChefHat, badgeDollarSign: BadgeDollarSign, chartNoAxesCombined: ChartNoAxesCombined };

export default function ExperienceByRoleSection() {
  return <section id="diferenciais" className="section scroll-mt-24 bg-white">
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <SectionHeading badge={EXPERIENCIA_POR_PERFIL.badge} titulo={EXPERIENCIA_POR_PERFIL.titulo} tituloAccent={EXPERIENCIA_POR_PERFIL.tituloAccent} desc={EXPERIENCIA_POR_PERFIL.desc} />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{EXPERIENCIA_POR_PERFIL.itens.map((item, index) => {
        const Icon = icons[item.icon] || UserRound;
        return <Reveal as="article" key={item.titulo} delay={index * 55} className="group relative overflow-hidden rounded-3xl border border-[#012E46]/10 bg-[#F4F6F7] p-5 transition hover:-translate-y-1 hover:border-[#F38525]/50 hover:bg-white hover:shadow-[0_20px_45px_-32px_rgba(1,46,70,.55)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#012E46] text-[#F38525]"><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
          <p className="mt-5 text-xs font-black uppercase tracking-[.14em] text-[#F38525]">{String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 text-lg font-black text-[#012E46]">{item.titulo}</h3><p className="mt-2 text-sm leading-6 text-[#496675]">{item.desc}</p>
        </Reveal>;
      })}</div>
      <div className="mt-7 rounded-2xl border border-[#F38525]/25 bg-[#FFF7EF] px-5 py-4 text-center text-sm font-semibold leading-6 text-[#012E46]">O diferencial está na continuidade: o pedido nasce no atendimento, segue para produção, passa pelo caixa e se transforma em informação para a gestão.</div>
    </div>
  </section>;
}
