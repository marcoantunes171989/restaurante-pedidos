import { useState } from "react";
import { Reveal, SectionHeading } from "../ui";
import { IcoSeta } from "../icons";
import { DEPOIMENTOS, FAQ } from "../content";

// Prova social — só renderiza se houver depoimentos reais cadastrados em
// content.js (DEPOIMENTOS). Sem dados reais, a seção fica oculta (não
// inventamos depoimento, avaliação ou cliente).
function ProvaSocial() {
  if (DEPOIMENTOS.length === 0) return null;
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Quem usa" titulo="O que dizem os estabelecimentos que usam o Pedido Prime" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DEPOIMENTOS.map((d, i) => (
            <Reveal as="article" key={d.nome} delay={i * 70} className="rounded-[1.25rem] border border-[#E2E8F0] bg-[#F8FAFC] p-6">
              <p className="text-sm leading-6 text-[#334155]">“{d.texto}”</p>
              <p className="mt-4 text-sm font-bold text-[#0D1B2A]">{d.nome}</p>
              <p className="text-xs text-[#64748B]">{d.cargo ? `${d.cargo} · ` : ""}{d.estabelecimento}{d.cidade ? ` · ${d.cidade}` : ""}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [aberto, setAberto] = useState(-1);
  return (
    <section id="faq" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <SectionHeading badge="FAQ" titulo="Perguntas frequentes" />
        <div className="mt-10 space-y-3">
          {FAQ.map((item, i) => {
            const ativo = aberto === i;
            return (
              <Reveal key={item.q} delay={(i % 5) * 50}>
                <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
                  <button onClick={() => setAberto(ativo ? -1 : i)} aria-expanded={ativo} aria-controls={`faq-resposta-${i}`}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-4 text-left">
                    <span className="font-display text-sm font-bold text-[#0D1B2A] sm:text-base">{item.q}</span>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] text-[#2563EB] transition ${ativo ? "rotate-90 bg-[#2563EB]/10" : ""}`}>
                      <IcoSeta className="h-4 w-4" />
                    </span>
                  </button>
                  {ativo && <p id={`faq-resposta-${i}`} className="px-5 pb-5 text-sm leading-6 text-[#64748B]">{item.a}</p>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function ProvaSocialFaq() {
  return (
    <>
      <ProvaSocial />
      <Faq />
    </>
  );
}
