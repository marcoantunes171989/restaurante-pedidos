import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { DIFERENCIAIS } from "../content";

// Diferenciais como BENEFÍCIO (não função) — cada card nomeia o ganho e
// ancora em algo real da plataforma, para não soar vazio.
export default function Diferenciais() {
  return (
    <section className="section bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Por que Pedido Prime" titulo="Não vendemos função. Entregamos resultado."
          desc="Cada recurso da plataforma existe para gerar um ganho concreto na operação do seu restaurante." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DIFERENCIAIS.map((d, i) => (
            <Reveal as="article" key={d.titulo} delay={(i % 5) * 60}
              className="rounded-[1.25rem] border border-[var(--pp-border)] bg-[var(--pp-bg)] p-5 transition hover:-translate-y-1 hover:border-[#C63F1D]/30">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#C63F1D]/20 bg-white text-[var(--pp-primary-hover)]"><Icone nome={d.icon} className="h-5 w-5" /></span>
              <h3 className="font-display mt-3.5 text-sm font-bold text-[var(--pp-graphite)]">{d.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--pp-text-muted)]">{d.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
