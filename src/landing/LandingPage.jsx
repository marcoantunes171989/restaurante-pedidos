import { NOME_SISTEMA } from "./content";
import { IcoWhats } from "./icons";
import { linkWhatsappConsultor } from "../config/contato";

import Header from "./sections/Header";
import Hero from "./sections/Hero";
import Vitrine from "./sections/Vitrine";
import Canais from "./sections/Canais";
import Plataforma from "./sections/Plataforma";
import Fluxo from "./sections/Fluxo";
import Experiencia from "./sections/Experiencia";
import Multiestabelecimentos from "./sections/Multiestabelecimentos";
import Segmentos from "./sections/Segmentos";
import Diferenciais from "./sections/Diferenciais";
import Planos from "./sections/Planos";
import ProvaSocialFaq from "./sections/ProvaSocialFaq";
import Footer, { CtaFinal } from "./sections/CtaFooter";

// ════════════════════════════════════════════════════════════
//  Landing page comercial — Pedido Prime.
//  Orquestra as seções (src/landing/sections/*), com textos e dados
//  centralizados em src/landing/content.js e src/config/*.js — nenhum
//  texto comercial solto aqui. Recebe `navigate(rota)` do main.jsx para
//  abrir o sistema autenticado (ex.: "/login").
// ════════════════════════════════════════════════════════════
export default function LandingPage({ navigate }) {
  const entrar = () => (navigate ? navigate("/login") : (window.location.href = "/login"));

  return (
    <div className="min-h-screen bg-white font-sans text-[var(--pp-text-body)] antialiased">
      <Header onEntrar={entrar} />
      <main>
        <Hero />
        <Vitrine />
        <Canais />
        <Plataforma />
        <Fluxo />
        <Experiencia />
        <Multiestabelecimentos />
        <Segmentos />
        <Diferenciais />
        <Planos />
        <ProvaSocialFaq />
        <CtaFinal />
      </main>
      <Footer onEntrar={entrar} />

      {/* Botão flutuante de WhatsApp */}
      <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`)} target="_blank" rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#10B981] px-4 py-3.5 font-bold text-white shadow-2xl shadow-[#10B981]/30 transition hover:bg-[#0D9668] active:scale-95">
        <span className="pp-pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#10B981]" />
        <IcoWhats className="relative h-7 w-7 fill-white" />
        <span className="relative hidden pr-1 text-sm sm:inline">Fale no WhatsApp</span>
      </a>
    </div>
  );
}
