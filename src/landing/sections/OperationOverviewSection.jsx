import { LayoutDashboard, MonitorSmartphone, QrCode, Tablet } from "lucide-react";
import { CardTitle, Reveal, SectionHeading } from "../ui";
import { VISAO_OPERACAO } from "../content";

const icons = { layoutDashboard: LayoutDashboard, tablet: Tablet, qrCode: QrCode, monitorSmartphone: MonitorSmartphone };

export default function OperationOverviewSection() {
  return <section id="como-funciona" className="section scroll-mt-24 overflow-hidden bg-[#012E46] text-white">
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <SectionHeading claro badge={VISAO_OPERACAO.badge} titulo={VISAO_OPERACAO.titulo} tituloAccent={VISAO_OPERACAO.tituloAccent} desc={VISAO_OPERACAO.desc} />
      <div className="mt-12 grid gap-4 md:grid-cols-2">{VISAO_OPERACAO.contextos.map((item, index) => {
        const Icon = icons[item.icon] || LayoutDashboard;
        return <Reveal as="article" key={item.titulo} delay={index * 60} className="group rounded-3xl border border-white/15 bg-white/[.07] p-5 backdrop-blur-sm transition hover:border-[#F38525]/60 hover:bg-white/[.1] sm:p-6">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F38525] text-[#012E46]"><Icon className="h-6 w-6" strokeWidth={1.7} /></span><div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#F38525]">Etapa {String(index + 1).padStart(2, "0")}</p><CardTitle claro className="mt-1">{item.titulo}</CardTitle></div></div>
          <p className="mt-4 text-sm leading-6 text-white/75">{item.desc}</p><p className="mt-4 border-t border-white/10 pt-3 text-xs font-bold uppercase tracking-[.1em] text-[#F38525]">{item.destaque}</p>
        </Reveal>;
      })}</div>
      <Reveal delay={120} className="mt-6 rounded-3xl border border-[#F38525]/35 bg-[#F38525]/10 px-5 py-5 text-center sm:px-8">
        <p className="mx-auto max-w-4xl text-sm font-semibold leading-7 text-white sm:text-base">{VISAO_OPERACAO.fechamento}</p>
      </Reveal>
    </div>
  </section>;
}
