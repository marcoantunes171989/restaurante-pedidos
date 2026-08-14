import { useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Botao, Reveal, SectionHeading } from "../ui";
import { FAQ, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export default function FAQSection() {
  const [aberta, setAberta] = useState(0);
  return (
    <section id="faq" className="section scroll-mt-24 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
        <div>
          <SectionHeading align="left" badge={FAQ.badge} titulo={FAQ.titulo} tituloAccent={FAQ.tituloAccent} desc={FAQ.desc} />
          <Reveal delay={80} className="mt-7">
            <Botao variant="navy" href={linkWhatsappConsultor(`Olá! Tenho uma dúvida sobre o ${NOME_SISTEMA}.`)}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Falar com um consultor
            </Botao>
          </Reveal>
        </div>
        <Reveal as="div" className="divide-y divide-[#012E46]/10 border-y border-[#012E46]/10">
          {FAQ.itens.map((item, i) => {
            const abertaAgora = aberta === i;
            const painelId = `faq-resposta-${i}`;
            return (
              <div key={item.pergunta}>
                <button type="button" onClick={() => setAberta(abertaAgora ? -1 : i)} aria-expanded={abertaAgora} aria-controls={painelId} className="flex w-full items-center justify-between gap-5 py-5 text-left text-base font-bold text-[#012E46]">
                  <span>{item.pergunta}</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-[#F38525] transition-transform ${abertaAgora ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                <div id={painelId} hidden={!abertaAgora} className="pb-5 pr-10 text-sm leading-6 text-[#012E46]/70">{item.resposta}</div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
