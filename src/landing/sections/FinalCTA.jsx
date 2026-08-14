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

        <Reveal delay={90} className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#071725] p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
          <Picture
            src={CTA_FINAL.imagem}
            fallback={CTA_FINAL.imagemFallback}
            alt="Tela real do PDV Pedido Prime durante o atendimento"
            className="block h-full w-full overflow-hidden rounded-[1.25rem]"
            imgClassName="h-full w-full object-contain"
          />
          <span className="absolute right-4 top-4 rounded-full bg-[#F38525] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#012E46] shadow-lg sm:text-xs">
            Conheça o Pedido Prime
          </span>
        </Reveal>
      </div>

      <LeadForm aberto={formAberto} onFechar={() => setFormAberto(false)} />
    </section>
  );
}
