import { useState } from "react";
import { Botao, Picture, Reveal } from "../ui";
import { LeadForm } from "../components/LeadForm";
import { CTA_FINAL, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export default function FinalCTA() {
  const [formAberto, setFormAberto] = useState(false);

  return (
    <section id="contato" className="section relative scroll-mt-24 overflow-hidden bg-[#012E46] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(243,133,37,0.35), transparent)" }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <Reveal>
          <h2 className="pp-landing-display text-[clamp(1.9rem,1.2rem+2.6vw,3.2rem)] leading-[1.05] tracking-[0.02em]">
            {CTA_FINAL.titulo}{" "}
            <span className="text-[#F38525]">{CTA_FINAL.tituloAccent}</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/80">{CTA_FINAL.desc}</p>
          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Botao
              variant="primary"
              showArrow
              onClick={() => setFormAberto(true)}
              className="!uppercase !tracking-[0.08em]"
            >
              {CTA_FINAL.ctaPrimario}
            </Botao>
            <a
              href={linkWhatsappConsultor(
                `Olá! Gostaria de agendar uma demonstração do ${NOME_SISTEMA}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white/85 underline decoration-white/35 underline-offset-4 transition hover:text-white hover:decoration-white"
            >
              {CTA_FINAL.ctaSecundario}
            </a>
          </div>
        </Reveal>

        <Reveal delay={90} className="relative min-h-[240px] overflow-hidden rounded-[1.75rem] sm:min-h-[320px] lg:min-h-[360px]">
          <Picture
            src={CTA_FINAL.imagem}
            fallback={CTA_FINAL.imagemFallback}
            alt="Clientes e operação gastronômica em ambiente real"
            className="absolute inset-0 block h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-tr from-[#012E46]/45 via-transparent to-transparent"
          />
        </Reveal>
      </div>

      <LeadForm aberto={formAberto} onFechar={() => setFormAberto(false)} />
    </section>
  );
}
