import { Reveal, SectionHeading, IconBadge } from "../ui";
import { CANAIS } from "../content";

export default function Canais() {
  return (
    <section id="canais" className="scroll-mt-24 bg-[var(--pp-bg)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Soluções" titulo="Quatro formas de atender, uma única plataforma"
          desc="Combine os canais que fizerem sentido para o seu negócio — tudo cai no mesmo painel de gestão." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CANAIS.map((c, i) => (
            <Reveal as="article" key={c.id} delay={i * 70}
              className="flex flex-col rounded-[1.25rem] border border-[var(--pp-border)] bg-white p-6 transition hover:-translate-y-1 hover:border-[#C63F1D]/30 hover:shadow-lg">
              <IconBadge nome={c.icon} />
              <h3 className="font-display mt-4 text-lg font-bold text-[var(--pp-graphite)]">{c.titulo}</h3>
              <dl className="mt-3 space-y-2 text-xs leading-5 text-[var(--pp-text-muted)]">
                <div><dt className="font-bold text-[var(--pp-text-body)]">Onde usar</dt><dd>{c.onde}</dd></div>
                <div><dt className="font-bold text-[var(--pp-text-body)]">Como funciona</dt><dd>{c.como}</dd></div>
              </dl>
              <p className="mt-3 rounded-xl bg-[#B8872A]/10 px-3 py-2 text-xs font-semibold text-[var(--pp-brand-text)]">{c.beneficio}</p>
              <p className="mt-2 text-[11px] text-[var(--pp-text-muted)]">{c.impacto}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
