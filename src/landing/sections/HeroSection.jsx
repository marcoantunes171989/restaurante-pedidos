import {
  BarChart3,
  Cloud,
  Globe2,
  HeartHandshake,
  Play,
  ShieldCheck,
  CheckCircle2,
  Wifi,
  Wallet,
} from "lucide-react";
import { Botao, Picture, Reveal } from "../ui";
import { goTo } from "../utils";
import { HERO, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

const TRUST_ICONS = {
  cloud: Cloud,
  globe: Globe2,
  shield: ShieldCheck,
  heartHandshake: HeartHandshake,
};

const KPI_ICONS = {
  barChart: BarChart3,
  wallet: Wallet,
};

/**
 * Hero comercial — benefício "Gestão em tempo real" em full-bleed.
 * Marca fica só no header (sem wordmark duplicado acima do título).
 */
export default function HeroSection() {
  return (
    <section
      id="topo"
      className="relative isolate min-h-[100svh] overflow-hidden bg-[#012E46] text-white"
    >
      <div className="absolute inset-0 -z-20">
        <Picture
          src={HERO.bg}
          fallback={HERO.bgFallback}
          alt=""
          loading="eager"
          fetchPriority="high"
          className="block h-full w-full"
          imgClassName="pp-hero-mockup h-full w-full object-cover object-center"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(105deg, rgba(1,46,70,0.95) 0%, rgba(1,46,70,0.90) 42%, rgba(1,46,70,0.68) 72%, rgba(1,46,70,0.52) 100%)",
        }}
      />

      <div aria-hidden="true" className="pointer-events-none absolute bottom-20 right-[4vw] z-0 hidden xl:block">
        <div className="pp-hero-chip flex items-center gap-3 rounded-2xl border border-white/20 bg-[#012E46]/80 px-4 py-3 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F38525] text-[#012E46]"><CheckCircle2 className="h-5 w-5" /></span>
          <span><strong className="block text-sm">Pedidos em tempo real</strong><small className="text-white/65">Atendimento e produção conectados</small></span>
        </div>
        <div className="pp-hero-chip ml-14 mt-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-white/90 px-4 py-3 text-[#012E46] shadow-2xl shadow-black/20 backdrop-blur-md [animation-delay:-2s]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#012E46] text-[#F38525]"><Wifi className="h-5 w-5" /></span>
          <span><strong className="block text-sm">Operação integrada</strong><small className="text-[#012E46]/65">Salão, cozinha, bar e caixa</small></span>
        </div>
      </div>

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-16 pt-28 sm:pt-32 lg:px-8 lg:pb-20">
        <div className="relative z-10 max-w-3xl">
          <Reveal>
            <h1 className="pp-landing-display text-[clamp(2.75rem,1.4rem+5vw,5.25rem)] leading-[0.9] tracking-[0.01em]">
              <span className="block text-[#F38525]">{HERO.destaqueLaranja}</span>
              <span className="mt-1 block text-white">{HERO.destaqueBranco}</span>
            </h1>
          </Reveal>

          <Reveal delay={90}>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/90 sm:text-lg">
              {HERO.subtitulo}
            </p>
          </Reveal>

          <Reveal delay={130}>
            <ul className="mt-7 flex flex-wrap items-stretch gap-4 sm:gap-5">
              {HERO.kpis.map((kpi, i) => {
                const Icon = KPI_ICONS[kpi.icon] || BarChart3;
                return (
                  <li key={kpi.label} className="flex min-w-[10.5rem] items-center gap-3">
                    {i > 0 ? (
                      <span
                        aria-hidden="true"
                        className="hidden h-10 w-px shrink-0 bg-[#F38525]/70 sm:block"
                      />
                    ) : null}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F38525]/15 text-[#F38525] ring-1 ring-[#F38525]/35">
                      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm font-bold text-white sm:text-base">
                        {kpi.valor}
                      </span>
                      <span className="block text-[11px] font-medium text-white/75 sm:text-xs">
                        {kpi.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          <Reveal delay={170}>
            <p className="mt-6 max-w-xl text-sm leading-6 text-white/70">
              {HERO.apoio}
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Botao
                variant="primary"
                showArrow
                onClick={() => goTo("solucoes")}
                className="!rounded-lg !px-7 !uppercase !tracking-[0.1em]"
              >
                {HERO.ctaPrimario}
              </Botao>
              <Botao
                variant="outline"
                href={linkWhatsappConsultor(
                  `Olá! Gostaria de ver uma demonstração do ${NOME_SISTEMA}.`,
                )}
                className="!rounded-lg !uppercase !tracking-[0.1em]"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {HERO.ctaSecundario}
              </Botao>
            </div>
          </Reveal>

          <Reveal delay={250}>
            <ul className="mt-10 grid grid-cols-2 gap-4 border-t border-white/15 pt-6 sm:grid-cols-4">
              {HERO.indicadores.map((item) => {
                const Icon = TRUST_ICONS[item.icon] || Cloud;
                return (
                  <li key={item.label} className="flex flex-col gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white">
                      <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold leading-snug text-white/88">
                      {item.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
