import { useEffect, useRef, useState } from "react";
import { Reveal, SectionHeading } from "../ui";
import { RestaurantMap } from "../components/RestaurantMap";
import { TIMELINE_PEDIDO } from "../content";

// Timeline horizontal do pedido — preenche 1x quando entra na viewport
// (IntersectionObserver, mesmo padrão do .pp-reveal, mas aqui o alvo é
// width/transição de cor, não opacity/transform, por isso não reaproveita
// a classe .pp-reveal diretamente). Respeita prefers-reduced-motion via
// .pp-timeline-fill (ver index.css).
function TimelinePedido() {
  const ref = useRef(null);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setAtivo(true); io.unobserve(el); } }),
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="mx-auto mt-16 max-w-3xl">
      <div className="relative h-1 rounded-full bg-[var(--pp-border)]">
        <div className="pp-timeline-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#F38525] to-[#F38525]" style={{ width: ativo ? "100%" : "0%" }} />
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {TIMELINE_PEDIDO.map((etapa, i) => (
          <div key={etapa} className="text-center">
            <span
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-colors duration-500 motion-reduce:transition-none ${ativo ? "bg-[var(--pp-primary-hover)] text-[#012E46]" : "border border-[var(--pp-border)] bg-white text-[var(--pp-text-muted)]"}`}
              style={{ transitionDelay: ativo ? `${i * 260}ms` : "0ms" }}
            >
              {i + 1}
            </span>
            {/* --pp-text-body, não --pp-text-muted: nesse tamanho (10px) o
                muted reprovava contraste AA sobre --pp-bg (3.74:1, achado na
                auditoria da Fase 6) — body já passa com folga (7.42:1). */}
            <p className="mt-2 text-[10px] font-semibold leading-tight text-[var(--pp-text-body)]">{etapa}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// "Operação Integrada" — mapa isométrico do salão com 6 pontos conectados
// (mesas, atendimento, cozinha, bar, caixa, gestor) + timeline do pedido
// do pedido realizado ao pagamento processado.
export default function OperacaoIntegrada() {
  return (
    <section className="section bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Operação integrada" titulo="Cliente, equipe e gestão — todos conectados no mesmo fluxo"
          desc="Cada papel da operação enxerga exatamente o que precisa, no momento certo, sem depender de comunicação manual entre setores." />
        <Reveal delay={120} className="mt-14">
          <RestaurantMap />
        </Reveal>
        <TimelinePedido />
      </div>
    </section>
  );
}
