import { MessageCircle } from "lucide-react";
import { NOME_SISTEMA } from "./content";
import { linkWhatsappConsultor } from "../config/contato";

import LandingHeader from "./sections/LandingHeader";
import HeroSection from "./sections/HeroSection";
import SolutionsSection from "./sections/SolutionsSection";
import ProductFlowSection from "./sections/ProductFlowSection";
import CapabilitiesSection from "./sections/CapabilitiesSection";
import DevicesSection from "./sections/DevicesSection";
import BenefitsSection from "./sections/BenefitsSection";
import SegmentsSection from "./sections/SegmentsSection";
import PlanosSection from "./sections/PlanosSection";
import FAQSection from "./sections/FAQSection";
import FinalCTA from "./sections/FinalCTA";
import LandingFooter from "./sections/LandingFooter";

/**
 * Landing institucional Pedido Prime — hero (gestão em tempo real) →
 * plataforma → fluxo operacional → recursos → dispositivos → benefícios →
 * segmentos → soluções por perfil → FAQ → CTA.
 */
export default function LandingPage({ navigate }) {
  const entrar = () => (navigate ? navigate("/login") : (window.location.href = "/login"));

  return (
    <div className="pp-landing min-h-screen overflow-x-hidden bg-white font-sans text-[#012E46] antialiased">
      <LandingHeader onEntrar={entrar} transparente />
      <main>
        <HeroSection />
        <SolutionsSection />
        <ProductFlowSection />
        <CapabilitiesSection />
        <DevicesSection />
        <BenefitsSection />
        <SegmentsSection />
        <PlanosSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter onEntrar={entrar} />

      <a
        href={linkWhatsappConsultor(
          `Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`,
        )}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#10B981] px-4 py-3.5 font-bold text-white shadow-2xl shadow-[#10B981]/30 transition hover:bg-[#0D9668] active:scale-95"
      >
        <span className="pp-pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#10B981]" />
        <MessageCircle className="relative h-6 w-6 fill-white stroke-white" />
        <span className="relative hidden pr-1 text-sm sm:inline">Fale no WhatsApp</span>
      </a>
    </div>
  );
}
