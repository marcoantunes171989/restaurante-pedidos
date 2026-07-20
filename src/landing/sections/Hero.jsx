import { Botao, Badge, Reveal, Check } from "../ui";
import { goTo } from "../utils";
import { MockupTablet } from "../mockups";
import { HERO } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(198,63,29,0.10),transparent)]" />
      <div className="pointer-events-none absolute -left-24 top-40 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(184,135,42,0.10),transparent)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
        <div>
          <Reveal><Badge>{HERO.badge}</Badge></Reveal>
          <Reveal delay={80}>
            <h1 className="font-display mt-5 text-[clamp(1.9rem,1.3rem+2.6vw,3.2rem)] font-black leading-[1.1] tracking-tight text-[var(--pp-graphite)]">
              {HERO.titulo}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--pp-text-muted)] sm:text-lg">{HERO.subtitulo}</p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Botao variant="primary" onClick={() => goTo("funcionalidades")}>Conhecer o Pedido Prime</Botao>
              <Botao variant="outline" href={linkWhatsappConsultor("Olá! Gostaria de ver uma demonstração do Pedido Prime.")}>Ver demonstração</Botao>
            </div>
            <button onClick={() => goTo("planos")} className="mt-4 text-sm font-bold text-[var(--pp-primary-hover)] underline decoration-[#C63F1D]/30 underline-offset-4 hover:decoration-[var(--pp-primary-hover)]">
              Falar com um consultor →
            </button>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 sm:max-w-lg">
              {HERO.beneficios.map((b) => (
                <div key={b} className="flex items-center gap-2 font-semibold text-[var(--pp-text-body)]"><Check /> {b}</div>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={160} className="relative lg:pl-6">
          <MockupTablet />
          {/* Notificações flutuantes sutis */}
          <div className="pp-float pointer-events-none absolute -left-2 top-6 hidden rounded-2xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 text-xs font-bold text-[var(--pp-graphite)] shadow-lg sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-2s" }}>
            <span className="h-2 w-2 rounded-full bg-[var(--pp-info)]" /> Pedido recebido
          </div>
          <div className="pp-float pointer-events-none absolute -right-2 bottom-16 hidden rounded-2xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 text-xs font-bold text-[var(--pp-graphite)] shadow-lg sm:flex sm:items-center sm:gap-2" style={{ animationDelay: "-4s" }}>
            <span className="h-2 w-2 rounded-full bg-[var(--pp-success)]" /> Pedido concluído
          </div>
        </Reveal>
      </div>
    </section>
  );
}
