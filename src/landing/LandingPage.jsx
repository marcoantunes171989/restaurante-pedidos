import { NOME_SISTEMA } from "./content";
import { IcoWhats } from "./icons";
import { linkWhatsappConsultor } from "../config/contato";

import Header from "./sections/Header";
import Hero from "./sections/Hero";
import LiveFlow from "./sections/LiveFlow";
import Ecosystem from "./sections/Ecosystem";
import CommandCenter from "./sections/CommandCenter";
import Intelligence from "./sections/Intelligence";
import JornadaCliente from "./sections/JornadaCliente";
import JornadaGestor from "./sections/JornadaGestor";
import Segmentos from "./sections/Segmentos";
import OperacaoIntegrada from "./sections/OperacaoIntegrada";
import DashboardPremium from "./sections/DashboardPremium";
import Tecnologia from "./sections/Tecnologia";
import Diferenciais from "./sections/Diferenciais";
import Crescimento from "./sections/Crescimento";
import AlemDoSalao from "./sections/AlemDoSalao";
import Seguranca from "./sections/Seguranca";
import Planos from "./sections/Planos";
import ProvaSocialFaq from "./sections/ProvaSocialFaq";
import Footer, { CtaFinal } from "./sections/CtaFooter";

// ════════════════════════════════════════════════════════════
//  Landing page comercial — Pedido Prime.
//  Orquestra as seções (src/landing/sections/*), com textos e dados
//  centralizados em src/landing/content.js e src/config/*.js — nenhum
//  texto comercial solto aqui. Recebe `navigate(rota)` do main.jsx para
//  abrir o sistema autenticado (ex.: "/login"). Tipografia de marca
//  (Manrope) via .pp-brand-manrope, mesmo escopo já usado no Login
//  (ver src/index.css — rebrand 2026).
// ════════════════════════════════════════════════════════════
export default function LandingPage({ navigate }) {
  const entrar = () => (navigate ? navigate("/login") : (window.location.href = "/login"));

  return (
    <div className="pp-brand-manrope min-h-screen bg-white font-sans text-[var(--pp-text-body)] antialiased">
      <Header onEntrar={entrar} />
      <main>
        <Hero />
        <LiveFlow />
        <Ecosystem />
        <CommandCenter />
        <Intelligence />
        <JornadaCliente />
        <JornadaGestor />
        <Segmentos />
        <OperacaoIntegrada />
        <DashboardPremium />
        <Tecnologia />
        <Diferenciais />
        <Crescimento />
        <AlemDoSalao />
        <Seguranca />
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
