import { Reveal, SectionHeading, IconBadge } from "../ui";
import { TECNOLOGIA } from "../content";

// "Tecnologia que trabalha para você" — fundamentos técnicos que sustentam
// a plataforma, explicados em benefício direto (não jargão).
export default function Tecnologia() {
  return (
    <section className="section bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Tecnologia" titulo="Tecnologia que trabalha para você"
          desc="Nuvem, tempo real, segurança e escalabilidade — para que a operação nunca pare, em nenhum dispositivo." />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {TECNOLOGIA.map((t, i) => (
            <Reveal as="article" key={t.titulo} delay={(i % 4) * 70}
              className="rounded-2xl border border-[var(--pp-border)] bg-white p-5 transition hover:-translate-y-1 hover:shadow-[0_16px_40px_-28px_rgba(28,20,15,0.28)]">
              <IconBadge nome={t.icon} tom="gold" />
              <h3 className="font-display mt-3.5 text-sm font-bold text-[var(--pp-graphite)]">{t.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--pp-text-muted)]">{t.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
