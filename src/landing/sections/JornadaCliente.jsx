import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { JORNADA_CLIENTE } from "../content";

// "Experiência do Cliente" — jornada completa, do QR Code à avaliação,
// em cartões numerados e sequenciais (linha conectora sutil no desktop).
export default function JornadaCliente() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Experiência do cliente" titulo="Uma jornada pensada do primeiro clique ao último gole"
          desc="Da chegada à mesa até a avaliação do atendimento — cada passo do cliente é simples, rápido e sem atrito." />
        <div className="relative mt-14">
          <div aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px bg-[var(--pp-border)] lg:block" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-6">
            {JORNADA_CLIENTE.map((etapa, i) => (
              <Reveal key={etapa.titulo} delay={(i % 6) * 70} className="relative text-center">
                <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--pp-border)] bg-white text-[var(--pp-primary-hover)] shadow-[0_10px_26px_-18px_rgba(28,20,15,0.3)]">
                  <span className="absolute -top-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--pp-graphite)] text-[10px] font-black text-white">{i + 1}</span>
                  <Icone nome={etapa.icon} className="h-5 w-5" />
                </div>
                <p className="mt-3 text-xs font-bold leading-tight text-[var(--pp-graphite)]">{etapa.titulo}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--pp-text-muted)]">{etapa.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
