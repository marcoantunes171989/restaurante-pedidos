import {
  BarChart3,
  Cloud,
  Globe2,
  HeartHandshake,
  Play,
  ShieldCheck,
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
 * Hero comercial — benefício "Gestão em tempo real" + prova visual em
 * perspectiva 3D (gestor + dashboard). Valoriza o produto no primeiro
 * viewport sem mockups flutuantes genéricos: foto real com transform 3D.
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
          imgClassName="h-full w-full scale-105 object-cover object-center"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 78% 55%, rgba(1,46,70,0.25) 0%, transparent 55%), linear-gradient(105deg, rgba(1,46,70,0.96) 0%, rgba(1,46,70,0.92) 42%, rgba(1,46,70,0.72) 68%, rgba(1,46,70,0.55) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pp-glow-pulse pointer-events-none absolute -right-16 top-1/3 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(243,133,37,0.22), transparent)" }}
      />

      <div className="mx-auto grid min-h-[100svh] max-w-7xl items-center gap-10 px-5 pb-16 pt-28 sm:pt-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.1fr)] lg:gap-8 lg:px-8 lg:pb-20 xl:gap-12">
        <div className="relative z-10 max-w-xl">
          <Reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#F38525]">
              {NOME_SISTEMA}
            </p>
          </Reveal>

          <Reveal delay={40}>
            <h1 className="pp-landing-display mt-4 text-[clamp(2.75rem,1.4rem+5vw,5.25rem)] leading-[0.9] tracking-[0.01em]">
              <span className="block text-[#F38525]">{HERO.destaqueLaranja}</span>
              <span className="mt-1 block text-white">{HERO.destaqueBranco}</span>
            </h1>
          </Reveal>

          <Reveal delay={90}>
            <p className="mt-5 max-w-md text-base leading-7 text-white/90 sm:text-lg">
              {HERO.subtitulo}
            </p>
          </Reveal>

          <Reveal delay={130}>
            <ul className="mt-7 flex flex-wrap items-stretch gap-4 sm:gap-5">
              {HERO.kpis.map((kpi, i) => {
                const Icon = KPI_ICONS[kpi.icon] || BarChart3;
                return (
                  <li key={kpi.label} className="flex min-w-[10.5rem] flex-1 items-center gap-3">
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
            <p className="mt-6 max-w-md text-sm leading-6 text-white/70">
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

        <Reveal delay={120} className="relative z-10 mx-auto w-full max-w-xl lg:max-w-none lg:justify-self-end">
          <div className="pp-hero-3d-stage">
            <div className="pp-hero-3d-glow" aria-hidden="true" />
            <div className="pp-hero-3d-card">
              <Picture
                src={HERO.showcase}
                fallback={HERO.showcaseFallback}
                alt="Gestor acompanhando o painel Pedido Prime em tempo real no restaurante"
                loading="eager"
                fetchPriority="high"
                className="block h-full w-full"
                imgClassName="aspect-[3/2] h-full w-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#012E46]/25 via-transparent to-white/5"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
