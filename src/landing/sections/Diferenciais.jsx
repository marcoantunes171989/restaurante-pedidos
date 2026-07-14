import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { DIFERENCIAIS } from "../content";

export default function Diferenciais() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading titulo="Mais do que um cardápio digital." desc="Uma plataforma completa para a operação do seu negócio crescer com organização." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DIFERENCIAIS.map((d, i) => (
            <Reveal as="article" key={d.titulo} delay={(i % 5) * 60} className="rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
              <Icone nome={d.icon} className="h-5 w-5 text-[#2563EB]" />
              <h3 className="font-display mt-3 text-sm font-bold text-[#0D1B2A]">{d.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">{d.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
