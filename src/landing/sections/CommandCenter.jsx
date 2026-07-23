import { Reveal, SectionHeading, IconBadge } from "../ui";
import { CENTRO_COMANDO, CENTRO_COMANDO_DESTAQUES } from "../content";

// "Mais que um sistema. Um verdadeiro centro de comando para restaurantes."
// Combina 6 cards de destaque (com ícone + benefício) e uma nuvem de dezenas
// de funcionalidades agrupadas por categoria — mostra amplitude sem virar
// uma parede de texto ilegível.
export default function CommandCenter() {
  return (
    <section id="plataforma" className="section scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Centro de comando" titulo="Mais que um sistema. Um verdadeiro centro de comando para restaurantes."
          desc="Cardápio, mesas, cozinha, bar, caixa, estoque, financeiro, CRM e relatórios — tudo o que a operação precisa, numa base de dados só." />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CENTRO_COMANDO_DESTAQUES.map((f, i) => (
            <Reveal as="article" key={f.titulo} delay={(i % 3) * 90}
              className="rounded-2xl border border-[var(--pp-border)] bg-white p-6 shadow-[0_16px_40px_-30px_rgba(28,20,15,0.25)] transition hover:-translate-y-1 hover:border-[#C63F1D]/30">
              <IconBadge nome={f.icon} />
              <h3 className="font-display mt-4 text-base font-bold text-[var(--pp-graphite)]">{f.titulo}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--pp-text-muted)]">{f.desc}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120} className="mt-16 rounded-[1.75rem] border border-[var(--pp-border)] bg-[var(--pp-bg)] p-7 sm:p-10">
          <p className="font-display text-center text-sm font-bold uppercase tracking-widest text-[var(--pp-text-muted)]">E muito mais dentro da plataforma</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {CENTRO_COMANDO.map((grupo) => (
              <div key={grupo.categoria}>
                <p className="text-xs font-black uppercase tracking-wider text-[var(--pp-primary-hover)]">{grupo.categoria}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {grupo.itens.map((item) => (
                    <span key={item} className="rounded-full border border-[var(--pp-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pp-text-body)]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
