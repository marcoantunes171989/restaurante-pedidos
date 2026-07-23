import { Reveal, SectionHeading } from "../ui";
import { CRESCIMENTO } from "../content";

// "O Pedido Prime acompanha seu crescimento" — timeline do primeiro
// restaurante até a rede, mostrando que a plataforma escala junto.
export default function Crescimento() {
  return (
    <section className="section bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading badge="Cresça sem trocar de sistema" titulo="O Pedido Prime acompanha o seu crescimento"
          desc="Comece pequeno, evolua no seu ritmo — do primeiro restaurante até uma rede com várias unidades." />
        <Reveal delay={120} className="relative mt-16">
          <div aria-hidden="true" className="absolute left-4 top-0 h-full w-px bg-gradient-to-b from-[#C63F1D] via-[#B8872A] to-[#C63F1D] sm:left-1/2" />
          <div className="space-y-10 sm:space-y-14">
            {CRESCIMENTO.map((etapa, i) => {
              const esquerda = i % 2 === 0;
              return (
                <div key={etapa.titulo} className={`relative flex items-start gap-5 sm:items-center ${esquerda ? "sm:flex-row" : "sm:flex-row-reverse"}`}>
                  <div className="absolute left-4 top-1 z-10 -translate-x-1/2 sm:left-1/2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--pp-primary-hover)] text-[11px] font-black text-white shadow-md">{i + 1}</span>
                  </div>
                  <div className="ml-10 flex-1 sm:ml-0">
                    <div className={`rounded-2xl border border-[var(--pp-border)] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(28,20,15,0.25)] sm:max-w-sm ${esquerda ? "sm:ml-auto sm:mr-10 sm:text-right" : "sm:ml-10"}`}>
                      <p className="font-display text-base font-bold text-[var(--pp-graphite)]">{etapa.titulo}</p>
                      <p className="mt-1.5 text-sm leading-6 text-[var(--pp-text-muted)]">{etapa.desc}</p>
                    </div>
                  </div>
                  <div className="hidden flex-1 sm:block" />
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
