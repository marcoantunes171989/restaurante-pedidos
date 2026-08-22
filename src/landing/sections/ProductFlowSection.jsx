import { ChefHat, CreditCard, LineChart, QrCode } from "lucide-react";
import { CardTitle, Reveal, SectionHeading } from "../ui";
import { FLUXO_PRODUTO } from "../content";

const ICONS = { qrCode: QrCode, chefHat: ChefHat, creditCard: CreditCard, lineChart: LineChart };

export default function ProductFlowSection() {
  return (
    <section id="fluxo" className="section scroll-mt-24 bg-[#012E46] text-white">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading claro badge={FLUXO_PRODUTO.badge} titulo={FLUXO_PRODUTO.titulo} tituloAccent={FLUXO_PRODUTO.tituloAccent} desc={FLUXO_PRODUTO.desc} />
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FLUXO_PRODUTO.etapas.map((etapa, i) => {
            const Icon = ICONS[etapa.icon] || QrCode;
            return (
              <Reveal as="li" key={etapa.numero} delay={i * 70} className="relative rounded-2xl border border-white/15 bg-white/[0.06] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F38525] text-[#012E46]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="pp-landing-display text-3xl text-white/15">{etapa.numero}</span>
                </div>
                <CardTitle claro className="mt-5">{etapa.titulo}</CardTitle>
                <p className="mt-2 text-sm leading-6 text-white/72">{etapa.desc}</p>
                {i < FLUXO_PRODUTO.etapas.length - 1 ? <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-px w-6 bg-[#F38525]/70 lg:block" /> : null}
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
