import { useState } from "react";
import { Botao, Reveal } from "../ui";
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
      <div className="relative mx-auto max-w-3xl px-5 text-center lg:px-8">
        <Reveal>
          <h2 className="pp-landing-display text-[clamp(1.9rem,1.2rem+2.6vw,3.2rem)] leading-[1.05] tracking-[0.02em]">
            {CTA_FINAL.titulo}
            <br />
            <span className="text-[#F38525]">{CTA_FINAL.tituloAccent}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/80">
            {CTA_FINAL.desc}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Botao
              variant="primary"
              showArrow
              onClick={() => setFormAberto(true)}
              className="!uppercase !tracking-[0.08em]"
            >
              {CTA_FINAL.ctaPrimario}
            </Botao>
            <Botao
              variant="outline"
              href={linkWhatsappConsultor(
                `Olá! Gostaria de agendar uma demonstração do ${NOME_SISTEMA}.`,
              )}
              className="!uppercase !tracking-[0.06em]"
            >
              {CTA_FINAL.ctaSecundario}
            </Botao>
          </div>
        </Reveal>
      </div>

      <LeadForm aberto={formAberto} onFechar={() => setFormAberto(false)} />
    </section>
  );
}
