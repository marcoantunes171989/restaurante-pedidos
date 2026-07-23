import { Reveal, SectionHeading, GlowOrb } from "../ui";
import { Icone } from "../icons";
import { FLUXO_TEMPO_REAL } from "../content";

// "Veja o restaurante funcionando em tempo real" — sequência de nós
// conectados por uma linha; cada nó "acende" em ondas (anel pulsante com
// atraso escalonado por índice), sugerindo o pedido percorrendo o fluxo
// completo de forma contínua e automática. Fundo claro (paleta oficial:
// branco/bege muito claro + terracota) — nada de blocos escuros pesados.
export default function LiveFlow() {
  const total = FLUXO_TEMPO_REAL.length;
  return (
    <section id="como-funciona" className="section scroll-mt-24 relative overflow-hidden bg-white">
      <GlowOrb className="left-1/2 top-0 h-96 w-96 -translate-x-1/2" />
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          badge="Automação de ponta a ponta"
          titulo="Veja o restaurante funcionando em tempo real"
          desc="Do primeiro escaneio do QR Code ao relatório gerencial, cada etapa acontece automaticamente — sem papel, sem retrabalho e sem intermediário manual."
        />

        <Reveal delay={120} className="relative mt-14">
          {/* Linha conectora (desktop: horizontal · mobile: vertical) */}
          <div aria-hidden="true" className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-[#C63F1D]/40 via-[var(--pp-border)] to-[#B8872A]/40 sm:hidden" />
          <div aria-hidden="true" className="absolute left-0 top-6 hidden h-px w-full bg-gradient-to-r from-[#C63F1D]/40 via-[var(--pp-border)] to-[#B8872A]/40 sm:block" />

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-5 sm:gap-x-4 sm:gap-y-10 lg:grid-cols-10">
            {FLUXO_TEMPO_REAL.map((etapa, i) => (
              <div key={etapa.id} className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
                <div className="relative shrink-0">
                  <span aria-hidden="true" className="pp-pulse-ring absolute inset-0 rounded-2xl bg-[#C63F1D]/20" style={{ animationDuration: `${total * 0.6}s`, animationDelay: `${i * 0.6}s` }} />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C63F1D]/20 bg-white text-[var(--pp-primary-hover)] shadow-[0_10px_26px_-20px_rgba(28,20,15,0.3)]">
                    <Icone nome={etapa.icon} className="h-5 w-5" />
                  </span>
                </div>
                <p className="text-sm font-bold text-[var(--pp-graphite)] sm:mt-3 sm:text-xs">{etapa.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={200} className="mx-auto mt-14 max-w-2xl text-center">
          <p className="text-sm font-semibold text-[var(--pp-text-muted)]">Sem planilha paralela. Sem comanda de papel. Sem retrabalho entre setores.</p>
        </Reveal>
      </div>
    </section>
  );
}
