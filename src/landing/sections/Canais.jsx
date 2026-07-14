import { Reveal, SectionHeading, IconBadge } from "../ui";
import { CANAIS } from "../content";

export default function Canais() {
  return (
    <section id="canais" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Soluções" titulo="Quatro formas de atender, uma única plataforma"
          desc="Combine os canais que fizerem sentido para o seu negócio — tudo cai no mesmo painel de gestão." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CANAIS.map((c, i) => (
            <Reveal as="article" key={c.id} delay={i * 70}
              className="flex flex-col rounded-[1.25rem] border border-[#E2E8F0] bg-white p-6 transition hover:-translate-y-1 hover:border-[#2563EB]/30 hover:shadow-lg">
              <IconBadge nome={c.icon} />
              <h3 className="font-display mt-4 text-lg font-bold text-[#0D1B2A]">{c.titulo}</h3>
              <dl className="mt-3 space-y-2 text-xs leading-5 text-[#64748B]">
                <div><dt className="font-bold text-[#334155]">Onde usar</dt><dd>{c.onde}</dd></div>
                <div><dt className="font-bold text-[#334155]">Como funciona</dt><dd>{c.como}</dd></div>
              </dl>
              <p className="mt-3 rounded-xl bg-[#10B981]/5 px-3 py-2 text-xs font-semibold text-[#10B981]">{c.beneficio}</p>
              <p className="mt-2 text-[11px] text-[#94A3B8]">{c.impacto}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
