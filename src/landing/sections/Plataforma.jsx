import { Reveal, SectionHeading, IconBadge } from "../ui";
import { FUNCIONALIDADES } from "../content";

export default function Plataforma() {
  return (
    <section id="funcionalidades" className="scroll-mt-24 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Plataforma completa" tom="violet" titulo="Tudo que a sua operação precisa, em um só lugar"
          desc="Do pedido no cardápio digital ao relatório gerencial, cada módulo conectado em tempo real." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONALIDADES.map((f, i) => (
            <Reveal as="article" key={f.titulo} delay={(i % 3) * 70}
              className="rounded-[1.25rem] border border-[var(--pp-border)] bg-white p-6 transition hover:-translate-y-1 hover:border-[#C9501F]/30 hover:shadow-lg">
              <IconBadge nome={f.icon} />
              <h3 className="font-display mt-4 text-base font-bold text-[var(--pp-graphite)]">{f.titulo}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--pp-text-muted)]">{f.desc}</p>
              <p className="mt-2 text-xs font-semibold text-[var(--pp-primary-hover)]">{f.beneficio}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
