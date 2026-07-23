import { Botao, Badge, Reveal, GlowOrb } from "../ui";
import { Headline } from "../components/Headline";
import { DeviceStack } from "../components/DeviceStack";
import { StatBar } from "../components/StatBar";
import { goTo } from "../utils";
import { PosFrame, PrinterFrame, TelaMesa, TelaCardapioCliente, TelaDashboard } from "../devices";
import { HERO } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

// Cena do Hero em torno do DeviceStack — wash de ambiente, linhas SVG
// conectando os aparelhos (traço tracejado "escoando", pp-line-flow),
// PDV + impressora no canto (só desktop) e notificações flutuantes.
// O DeviceStack cuida só do trio notebook/tablet/celular em 3D; o resto
// é decoração posicionada em torno dele.
function DeviceScene() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <GlowOrb className="pp-glow-pulse -inset-10 sm:-inset-16" />
      {/* Ambiente quente ao fundo — sem foto real disponível no projeto,
          simulado com wash radial terracota/dourado (restaurante desfocado). */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem]"
        style={{ background: "radial-gradient(60% 60% at 30% 20%, rgba(217,84,46,0.10), transparent), radial-gradient(50% 50% at 80% 80%, rgba(184,135,42,0.12), transparent)" }} />

      <svg aria-hidden="true" viewBox="0 0 400 420" className="pointer-events-none absolute inset-0 hidden h-full w-full min-[900px]:block">
        <path id="linha1" d="M60 340 C 120 300, 140 220, 210 190" fill="none" stroke="#C63F1D" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path id="linha2" d="M340 90 C 300 130, 260 150, 220 185" fill="none" stroke="#B8872A" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path d="M330 300 C 290 280, 250 250, 222 210" fill="none" stroke="#C63F1D" strokeOpacity=".25" strokeWidth="1.6" className="pp-line-flow" />
      </svg>

      <DeviceStack laptop={<TelaDashboard compacta />} tablet={<TelaMesa />} phone={<TelaCardapioCliente compacta />} />

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
            <StatBar className="mt-10" indicadores={HERO.indicadores} nota={HERO.indicadoresNota} />
          </Reveal>
        </div>
        <Reveal delay={160} className="relative lg:pl-6">
          <DeviceScene />
        </Reveal>
      </div>
    </section>
  );
}
