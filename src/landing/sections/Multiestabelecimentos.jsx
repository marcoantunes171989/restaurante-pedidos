import { Reveal, SectionHeading, IconBadge } from "../ui";
import { MULTILOJA } from "../content";

export default function Multiestabelecimentos() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Redes e múltiplas unidades" tom="violet" titulo="Pronto para crescer além de uma unidade"
          desc="Administre uma rede inteira sem perder a visão individual de cada estabelecimento." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MULTILOJA.map((m, i) => (
            <Reveal as="article" key={m.titulo} delay={(i % 3) * 70} className="rounded-[1.25rem] border border-[var(--pp-border)] bg-[var(--pp-bg)] p-6">
              <IconBadge nome={m.icon} tom="violet" />
              <h3 className="font-display mt-4 text-base font-bold text-[var(--pp-graphite)]">{m.titulo}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--pp-text-muted)]">{m.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
