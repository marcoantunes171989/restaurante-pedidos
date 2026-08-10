import {
  Cloud,
  Globe2,
  HeartHandshake,
  Play,
  ShieldCheck,
} from "lucide-react";
import { Botao, Picture, Reveal } from "../ui";
import { goTo } from "../utils";
import { HERO, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";
import HeroDeviceScene from "../components/HeroDeviceScene";

const ICONS = {
  cloud: Cloud,
  globe: Globe2,
  shield: ShieldCheck,
  heartHandshake: HeartHandshake,
};

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
          imgClassName="h-full w-full object-cover object-center"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(105deg, rgba(1,46,70,0.94) 0%, rgba(1,46,70,0.82) 42%, rgba(1,46,70,0.55) 68%, rgba(1,46,70,0.35) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#012E46]/40 to-transparent"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-28 sm:pt-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8 lg:pb-20 lg:pt-36">
        <div className="min-w-0">
          <Reveal>
            <p className="pp-landing-display text-[clamp(0.95rem,0.7rem+0.9vw,1.15rem)] tracking-[0.28em] text-[#F38525]">
              {NOME_SISTEMA.toUpperCase()}
            </p>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="pp-landing-display mt-4 text-[clamp(2.4rem,1.4rem+4.2vw,4.6rem)] leading-[0.95] tracking-[0.02em]">
              <span className="block text-white">{HERO.linha1}</span>
              <span className="block text-[#F38525]">{HERO.linha2}</span>
              <span className="mt-1 block text-white">{HERO.linha3}</span>
              <span className="block text-[#F38525]">{HERO.linha4}</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/85 sm:text-lg">
              {HERO.subtitulo}
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Botao
                variant="primary"
                showArrow
                onClick={() => goTo("solucoes")}
                className="!uppercase !tracking-[0.08em]"
              >
                {HERO.ctaPrimario}
              </Botao>
              <Botao
                variant="outline"
                href={linkWhatsappConsultor(
                  `Olá! Gostaria de ver uma demonstração do ${NOME_SISTEMA}.`,
                )}
                className="!uppercase !tracking-[0.08em]"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {HERO.ctaSecundario}
              </Botao>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:max-w-xl">
              {HERO.indicadores.map((item) => {
                const Icon = ICONS[item.icon] || Cloud;
                return (
                  <li key={item.label} className="flex flex-col gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white">
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="text-[12px] font-semibold leading-snug text-white/90">
                      {item.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={140} className="relative min-w-0 px-2 sm:px-6 lg:px-0">
          <HeroDeviceScene />
        </Reveal>
      </div>
    </section>
  );
}
