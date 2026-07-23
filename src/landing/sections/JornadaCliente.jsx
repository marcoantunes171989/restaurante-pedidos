import { useEffect, useRef, useState } from "react";
import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { JORNADA_CLIENTE } from "../content";

function CartaoEtapa({ etapa, indice }) {
  return (
    <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--pp-border)] bg-white text-[var(--pp-primary-hover)] shadow-[0_10px_26px_-18px_rgba(28,20,15,0.3)]">
      <span className="absolute -top-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--pp-graphite)] text-[10px] font-black text-white">{indice + 1}</span>
      <Icone nome={etapa.icon} className="h-5 w-5" />
    </div>
  );
}

// No mobile, 11 etapas empilhadas verticalmente viram uma rolagem enorme —
// em vez disso, carrossel horizontal com scroll-snap e "bolinhas" de posição
// (a rolagem nativa já é acessível a swipe/teclado, sem JS extra para isso;
// o único JS aqui é para acender a bolinha ativa).
function CarrosselMobile({ etapas }) {
  const trilhoRef = useRef(null);
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    const el = trilhoRef.current;
    if (!el) return;
    function aoRolar() {
      const largura = el.firstChild?.offsetWidth || el.clientWidth;
      const indice = Math.round(el.scrollLeft / largura);
      setAtivo(Math.min(etapas.length - 1, Math.max(0, indice)));
    }
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, [etapas.length]);

  return (
    <div className="sm:hidden">
      <div ref={trilhoRef} className="pp-noscrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2">
        {etapas.map((etapa, i) => (
          <div key={etapa.titulo} className="w-[72%] shrink-0 snap-center rounded-2xl border border-[var(--pp-border)] bg-white p-5 text-center">
            <CartaoEtapa etapa={etapa} indice={i} />
            <p className="mt-3 text-xs font-bold leading-tight text-[var(--pp-graphite)]">{etapa.titulo}</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--pp-text-muted)]">{etapa.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Posição no carrossel">
        {etapas.map((etapa, i) => (
          <span key={etapa.titulo} role="tab" aria-selected={i === ativo} aria-label={etapa.titulo}
            className={`h-1.5 rounded-full transition-all ${i === ativo ? "w-5 bg-[var(--pp-primary-hover)]" : "w-1.5 bg-[var(--pp-border)]"}`} />
        ))}
      </div>
    </div>
  );
}

// "Experiência do Cliente" — jornada completa, do QR Code à avaliação.
// Desktop/tablet: grade numerada com linha conectora. Mobile: carrossel
// horizontal (ver CarrosselMobile acima) — nunca empilhamento vertical.
export default function JornadaCliente() {
  return (
    <section className="section bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Experiência do cliente" titulo="Uma jornada pensada do primeiro clique ao último gole"
          desc="Da chegada à mesa até a avaliação do atendimento — cada passo do cliente é simples, rápido e sem atrito." />
      </div>

      <Reveal delay={100} className="mt-14">
        <CarrosselMobile etapas={JORNADA_CLIENTE} />
      </Reveal>

      <div className="mx-auto hidden max-w-7xl px-5 sm:block">
        <div className="relative mt-14">
          <div aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px bg-[var(--pp-border)] lg:block" />
          <div className="grid grid-cols-3 gap-x-4 gap-y-9 lg:grid-cols-6">
            {JORNADA_CLIENTE.map((etapa, i) => (
              <Reveal key={etapa.titulo} delay={(i % 6) * 70} className="relative text-center">
                <CartaoEtapa etapa={etapa} indice={i} />
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
