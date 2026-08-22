import { BarChart3, Boxes, HeartHandshake, LayoutDashboard, ReceiptText, ScanLine, ShieldCheck, Utensils } from "lucide-react";
import { CardTitle, Reveal, SectionHeading } from "../ui";
import { RECURSOS_PRODUTO } from "../content";

const ICONS = { layoutDashboard: LayoutDashboard, utensils: Utensils, scanLine: ScanLine, boxes: Boxes, heartHandshake: HeartHandshake, barChart3: BarChart3, receiptText: ReceiptText, shieldCheck: ShieldCheck };

export default function CapabilitiesSection() {
  return (
    <section id="recursos" className="section scroll-mt-24 bg-[#EEEEEE]">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading badge={RECURSOS_PRODUTO.badge} titulo={RECURSOS_PRODUTO.titulo} tituloAccent={RECURSOS_PRODUTO.tituloAccent} desc={RECURSOS_PRODUTO.desc} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS_PRODUTO.grupos.map((item, i) => {
            const Icon = ICONS[item.icon] || LayoutDashboard;
            return (
              <Reveal as="article" key={item.titulo} delay={(i % 4) * 55} className="group rounded-2xl border border-[#012E46]/10 bg-white p-5 shadow-[0_12px_32px_-26px_rgba(1,46,70,0.45)] transition hover:-translate-y-1 hover:border-[#F38525]/45">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#012E46]/[0.06] text-[#012E46] transition group-hover:bg-[#F38525] group-hover:text-[#012E46]"><Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
                <CardTitle className="mt-4">{item.titulo}</CardTitle>
                <p className="mt-2 text-sm leading-6 text-[#012E46]/68">{item.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
