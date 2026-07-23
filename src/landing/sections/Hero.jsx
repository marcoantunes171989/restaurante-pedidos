import { Botao, Badge, Reveal, GlowOrb } from "../ui";
import { Headline } from "../components/Headline";
import { goTo } from "../utils";
import { LaptopFrame, TabletFrame, PhoneFrame, PosFrame, PrinterFrame, TelaMesa, TelaCardapioCliente, TelaDashboard } from "../devices";
import { HERO } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

// Cluster de dispositivos do Hero — notebook (dashboard) ao fundo, tablet
// (mesa) em destaque central, celular (cliente) sobreposto, PDV e
// impressora no canto. Linhas SVG conectam os aparelhos, com um traço
// tracejado "escoando" (pp-line-flow) para sugerir dados em trânsito.
// Simplificado em telas pequenas (só tablet + celular) — a composição
// completa exige espaço horizontal.
function DeviceCluster() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <GlowOrb className="pp-glow-pulse -inset-10 sm:-inset-16" />
      {/* Ambiente quente ao fundo — sem foto real disponível no projeto,
          simulado com wash radial terracota/dourado (restaurante desfocado). */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem]"
        style={{ background: "radial-gradient(60% 60% at 30% 20%, rgba(217,84,46,0.10), transparent), radial-gradient(50% 50% at 80% 80%, rgba(184,135,42,0.12), transparent)" }} />

      <svg aria-hidden="true" viewBox="0 0 400 420" className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block">
        <path id="linha1" d="M60 340 C 120 300, 140 220, 210 190" fill="none" stroke="#C63F1D" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path id="linha2" d="M340 90 C 300 130, 260 150, 220 185" fill="none" stroke="#B8872A" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path d="M330 300 C 290 280, 250 250, 222 210" fill="none" stroke="#C63F1D" strokeOpacity=".25" strokeWidth="1.6" className="pp-line-flow" />
      </svg>

      {/* Notebook — dashboard, ao fundo/esquerda */}
      <div className="pp-float hidden w-[62%] sm:block" style={{ animationDelay: "-1.4s", transform: "perspective(1400px) rotateY(8deg) rotateX(2deg)" }}>
        <LaptopFrame><TelaDashboard compacta /></LaptopFrame>
      </div>

      {/* Tablet — mesa, em destaque central/direita, sobreposto ao notebook */}
      <div className="pp-float relative z-10 -mt-16 ml-auto w-[72%] sm:-mt-24 sm:w-[58%]" style={{ animationDelay: "-3s" }}>
        <TabletFrame><TelaMesa /></TabletFrame>
      </div>

      {/* Celular — cliente, sobreposto no canto inferior esquerdo */}
      <div className="pp-float absolute -bottom-6 left-0 z-20 w-[42%] min-w-[152px] sm:-bottom-10" style={{ animationDelay: "-0.6s" }}>
        <PhoneFrame><TelaCardapioCliente compacta /></PhoneFrame>
      </div>

      {/* PDV + impressora — canto superior direito, só em telas maiores */}
      <div className="pp-float absolute -right-4 -top-6 z-20 hidden w-[30%] lg:block" style={{ animationDelay: "-4.5s" }}>
        <PosFrame><TelaDashboard compacta /></PosFrame>
      </div>
      <div className="absolute -right-10 top-24 hidden w-[22%] lg:block">
        <PrinterFrame />
      </div>

      {/* Notificações flutuantes */}
      <div className="pp-float pointer-events-none absolute -left-4 top-2 z-30 hidden rounded-2xl border border-[var(--pp-border)] bg-white/95 px-3.5 py-2.5 text-xs font-bold text-[var(--pp-graphite)] shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-2s" }}>
        <span className="h-2 w-2 rounded-full bg-[var(--pp-info)]" /> Pedido recebido
      </div>
      <div className="pp-float pointer-events-none absolute -right-2 bottom-1/3 z-30 hidden rounded-2xl border border-[var(--pp-border)] bg-white/95 px-3.5 py-2.5 text-xs font-bold text-[var(--pp-graphite)] shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-4s" }}>
        <span className="h-2 w-2 rounded-full bg-[var(--pp-success)]" /> Pedido concluído
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-8 sm:pt-12">
      <GlowOrb className="-right-24 -top-24 h-96 w-96" />
      <GlowOrb tom="brand" className="-left-24 top-40 h-72 w-72" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-10 sm:py-16 lg:grid-cols-2 lg:gap-8">
        <div>
          <Reveal><Badge>{HERO.badge}</Badge></Reveal>
          <Reveal delay={80}>
            <Headline as="h1" lead={HERO.tituloLinha1} accent={HERO.tituloLinha2}
              className="font-display mt-5 text-[clamp(2rem,1.4rem+2.8vw,3.4rem)] font-black leading-[1.08] tracking-tight text-[var(--pp-graphite)]" />
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--pp-text-muted)] sm:text-lg">{HERO.subtitulo}</p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Botao variant="primary" href={linkWhatsappConsultor("Olá! Gostaria de solicitar uma demonstração do Pedido Prime.")}>{HERO.ctaPrimario}</Botao>
              <Botao variant="outline" onClick={() => goTo("plataforma")}>{HERO.ctaSecundario}</Botao>
              <Botao variant="ghost" href={linkWhatsappConsultor("Olá! Gostaria de falar com um especialista do Pedido Prime.")}>{HERO.ctaTerciario}</Botao>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-10 grid grid-cols-3 gap-x-4 gap-y-6 border-t border-[var(--pp-border)] pt-7 sm:grid-cols-6">
              {HERO.indicadores.map((k) => (
                <div key={k.label}>
                  <p className="font-display text-xl font-black text-[var(--pp-primary-hover)] sm:text-2xl">{k.valor}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-tight text-[var(--pp-text-muted)]">{k.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[var(--pp-text-muted)]/80">{HERO.indicadoresNota}</p>
          </Reveal>
        </div>
        <Reveal delay={160} className="relative lg:pl-6">
          <DeviceCluster />
        </Reveal>
      </div>
    </section>
  );
}
