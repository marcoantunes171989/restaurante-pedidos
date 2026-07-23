import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { FLUXO_TEMPO_REAL } from "../content";

// "Veja o restaurante funcionando em tempo real" — sequência de nós
// conectados por uma linha; cada nó "acende" em ondas (anel pulsante com
// atraso escalonado por índice), sugerindo o pedido percorrendo o fluxo
// completo de forma contínua e automática.
export default function LiveFlow() {
  const total = FLUXO_TEMPO_REAL.length;
  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[var(--pp-graphite)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          badge="Automação de ponta a ponta"
          titulo="Veja o restaurante funcionando em tempo real"
          desc="Do primeiro escaneio do QR Code ao relatório gerencial, cada etapa acontece automaticamente — sem papel, sem retrabalho e sem intermediário manual."
          className="[&_h2]:text-white [&_p]:text-white/60"
        />

        <Reveal delay={120} className="relative mt-14">
          {/* Linha conectora (desktop: horizontal · mobile: vertical) */}
          <div aria-hidden="true" className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-[#C63F1D]/50 via-white/15 to-[#B8872A]/50 sm:hidden" />
          <div aria-hidden="true" className="absolute left-0 top-6 hidden h-px w-full bg-gradient-to-r from-[#C63F1D]/50 via-white/15 to-[#B8872A]/50 sm:block" />

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-5 sm:gap-x-4 sm:gap-y-10 lg:grid-cols-10">
            {FLUXO_TEMPO_REAL.map((etapa, i) => (
              <div key={etapa.id} className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
                <div className="relative shrink-0">
                  <span aria-hidden="true" className="pp-pulse-ring absolute inset-0 rounded-2xl bg-[#C63F1D]/30" style={{ animationDuration: `${total * 0.6}s`, animationDelay: `${i * 0.6}s` }} />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-white backdrop-blur">
                    <Icone nome={etapa.icon} className="h-5 w-5" />
                  </span>
                </div>
                <p className="text-sm font-bold text-white sm:mt-3 sm:text-xs">{etapa.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={200} className="mx-auto mt-14 max-w-2xl text-center">
          <p className="text-sm font-semibold text-white/50">Sem planilha paralela. Sem comanda de papel. Sem retrabalho entre setores.</p>
        </Reveal>
      </div>
    </section>
  );
}
