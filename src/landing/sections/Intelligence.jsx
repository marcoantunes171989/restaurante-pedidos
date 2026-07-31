import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { INTELIGENCIA, INTELIGENCIA_NOTA } from "../content";

// "Inteligência Operacional" — o sistema lê os próprios dados do
// restaurante e devolve leituras acionáveis. Cartões inteligentes com uma
// frase de exemplo cada — deixado claro que são exemplos ilustrativos do
// TIPO de leitura, não números medidos de um cliente real.
export default function Intelligence() {
  return (
    <section id="inteligencia" className="section scroll-mt-24 bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Inteligência operacional" titulo="O sistema analisa os dados do seu restaurante — e te conta o que eles significam"
          desc="Cada pedido, cada mesa e cada produto viram leitura acionável. Sem planilha, sem análise manual: o painel entrega o insight pronto." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTELIGENCIA.map((c, i) => (
            <Reveal as="article" key={c.frase} delay={(i % 4) * 80}
              className="group relative overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(28,20,15,0.25)] transition hover:-translate-y-1 hover:border-[#0F4C5C]/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E67E22]/10 to-[#0F4C5C]/10 text-[var(--pp-primary-hover)]"><Icone nome={c.icon} className="h-5 w-5" /></span>
              <p className="mt-4 text-sm font-bold leading-6 text-[var(--pp-graphite)]">{c.frase}</p>
              <span aria-hidden="true" className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-[radial-gradient(closest-side,rgba(230,126,34,0.08),transparent)] transition group-hover:scale-125" />
            </Reveal>
          ))}
        </div>
        <Reveal delay={160} className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-[var(--pp-text-muted)]">{INTELIGENCIA_NOTA}</Reveal>
      </div>
    </section>
  );
}
