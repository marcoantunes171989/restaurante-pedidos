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
          imgClassName="h-full w-full scale-105 object-cover object-center"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(105deg, rgba(1,46,70,0.93) 0%, rgba(1,46,70,0.86) 38%, rgba(1,46,70,0.62) 70%, rgba(1,46,70,0.45) 100%)",
        }}
      />

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-20 pt-32 sm:pt-36 lg:px-8">
        <div className="max-w-3xl">
          <Reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#F38525]">
              {NOME_SISTEMA}
            </p>
          </Reveal>

          <Reveal delay={50}>
            <h1 className="pp-landing-display mt-5 text-[clamp(2.6rem,1.5rem+4.5vw,5rem)] leading-[0.92] tracking-[0.01em]">
              <span className="block text-white">
                {HERO.linha1} {HERO.linha2.replace(/\.$/, "")}.
              </span>
              <span className="mt-1 block text-[#F38525]">
                {HERO.linha3} {HERO.linha4}
              </span>
            </h1>
          </Reveal>

          <Reveal delay={110}>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/88 sm:text-lg">
              {HERO.subtitulo}
            </p>
          </Reveal>

          <Reveal delay={170}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
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

          <Reveal delay={230}>
            <ul className="mt-12 grid grid-cols-2 gap-5 border-t border-white/15 pt-8 sm:grid-cols-4">
              {HERO.indicadores.map((item) => {
                const Icon = ICONS[item.icon] || Cloud;
                return (
                  <li key={item.label} className="flex flex-col gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <span className="text-[12px] font-semibold leading-snug text-white/92">
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
