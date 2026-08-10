import { Botao, Badge, Reveal, GlowOrb, Check } from "../ui";
import { Headline } from "../components/Headline";
import { DeviceStack } from "../components/DeviceStack";
import { StatBar } from "../components/StatBar";
import { goTo } from "../utils";
import { PosFrame, TelaMesa, TelaCardapioCliente, TelaDashboard, TelaKanban } from "../devices";
import { HERO } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

const COZINHA_COLUNAS = [
  { titulo: "Fila", cards: ["Pizza x2", "Massa"] },
  { titulo: "Preparo", cards: ["Risoto"] },
  { titulo: "Pronto", cards: ["Salada"] },
];

// Etiqueta flutuante — some no mobile por padrão (mostrarEm controla a
// partir de qual breakpoint aparece): no mobile a composição já fica
// apertada só com os 3 aparelhos principais, adicionar 5 selos pequenos
// vira ruído visual. A etiqueta "Cozinha" usa um corte mais largo (xl)
// porque só faz sentido quando a telinha de cozinha também está visível.
function Etiqueta({ texto, className = "", delay = "0s", mostrarEm = "min-[900px]:flex" }) {
  return (
    <div aria-hidden="true" className={`pp-float pointer-events-none absolute z-30 hidden items-center gap-1.5 rounded-full border border-[var(--pp-border)] bg-white/95 px-3 py-1.5 text-[11px] font-bold text-[var(--pp-graphite)] shadow-lg backdrop-blur ${mostrarEm} ${className}`} style={{ animationDelay: delay }}>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-primary-hover)]" />{texto}
    </div>
  );
}

// Cena do Hero em torno do DeviceStack — wash de ambiente (sem foto real
// disponível no projeto, ver nota abaixo), linhas SVG conectando os
// aparelhos, notebook (gestão) + tablet (mesa) + celular (cliente) via
// DeviceStack, PDV/caixa (lg+) e uma tela de cozinha (xl+, senão o cluster
// estoura a largura da coluna nas resoluções médias) no canto, com 5
// etiquetas de papel (Cliente, Mesa, Cozinha, Caixa, Gestão) marcando cada
// ponto do fluxo. Flutuação via .pp-float (respeita prefers-reduced-motion,
// ver index.css). Sem impressora: o briefing pede "PDV OU impressora", e
// com PDV + cozinha já ocupando o canto direito, a impressora só apertava
// a composição sem acrescentar um papel novo.
function DeviceScene() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <GlowOrb className="pp-glow-pulse -inset-10 sm:-inset-16" />
      {/* Ambiente quente ao fundo — sem foto real disponível no projeto,
          simulado com wash radial laranja/petróleo (restaurante desfocado). */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem]"
        style={{ background: "radial-gradient(60% 60% at 30% 20%, rgba(217,84,46,0.10), transparent), radial-gradient(50% 50% at 80% 80%, rgba(1, 46, 70,0.12), transparent)" }} />

      <svg aria-hidden="true" viewBox="0 0 400 420" className="pointer-events-none absolute inset-0 hidden h-full w-full min-[900px]:block">
        <path d="M60 340 C 120 300, 140 220, 210 190" fill="none" stroke="#F38525" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path d="M340 90 C 300 130, 260 150, 220 185" fill="none" stroke="#012E46" strokeOpacity=".35" strokeWidth="1.6" className="pp-line-flow" />
        <path d="M330 300 C 290 280, 250 250, 222 210" fill="none" stroke="#F38525" strokeOpacity=".25" strokeWidth="1.6" className="pp-line-flow" />
      </svg>

      <DeviceStack laptop={<TelaDashboard compacta />} tablet={<TelaMesa />} phone={<TelaCardapioCliente compacta />} />

      {/* PDV/caixa — canto superior direito, telas grandes (lg+) */}
      <div className="pp-float absolute -right-4 -top-6 z-20 hidden w-[28%] lg:block" style={{ animationDelay: "-4.5s" }}>
        <PosFrame><TelaDashboard compacta /></PosFrame>
      </div>

      {/* Tela de cozinha/operação — canto inferior direito, só telas bem
          largas (xl+): junto com o PDV, precisa de mais espaço horizontal
          do que a coluna tem em lg (1024–1279px). */}
      <div className="pp-float absolute -right-6 bottom-2 z-20 hidden w-[30%] xl:block" style={{ animationDelay: "-3.2s" }}>
        <PosFrame><TelaKanban colunas={COZINHA_COLUNAS} /></PosFrame>
      </div>

      {/* Etiquetas do fluxo — uma por papel da operação */}
      <Etiqueta texto="Gestão" className="-left-4 top-0" delay="-1s" />
      <Etiqueta texto="Mesa" className="right-[26%] top-[38%]" delay="-2.5s" />
      <Etiqueta texto="Cliente" className="left-0 bottom-14" delay="-0.5s" />
      <Etiqueta texto="Caixa" className="right-[4%] top-[26%] lg:right-[10%]" delay="-4s" />
      <Etiqueta texto="Cozinha" className="right-[8%] bottom-[18%]" delay="-3.6s" mostrarEm="xl:flex" />
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
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--pp-text-body)] sm:text-lg">{HERO.subtitulo}</p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Botao variant="primary" onClick={() => goTo("plataforma")}>{HERO.ctaPrimario}</Botao>
              <Botao variant="outline" href={linkWhatsappConsultor("Olá! Gostaria de ver uma demonstração do Pedido Prime.")}>{HERO.ctaSecundario}</Botao>
              <Botao variant="ghost" href={linkWhatsappConsultor("Olá! Gostaria de falar com um consultor do Pedido Prime.")}>{HERO.ctaTerciario}</Botao>
            </div>
          </Reveal>
          <Reveal delay={280}>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {HERO.beneficiosRapidos.map((b) => (
                <li key={b} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--pp-text-body)] sm:text-sm"><Check /> {b}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={320}>
            <StatBar className="mt-8" indicadores={HERO.indicadores} nota={HERO.indicadoresNota} />
          </Reveal>
        </div>
        <Reveal delay={160} className="relative lg:pl-6">
          <DeviceScene />
        </Reveal>
      </div>
    </section>
  );
}
