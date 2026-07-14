import { Reveal, SectionHeading, IconBadge } from "../ui";
import { Icone } from "../icons";
import { COMO_FUNCIONA, FLUXO_OPERACAO, FLUXO_BENEFICIOS } from "../content";

export default function Fluxo() {
  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Como funciona" titulo="Do cadastro ao resultado, em quatro passos" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMO_FUNCIONA.map((p, i) => (
            <Reveal as="article" key={p.n} delay={i * 70} className="relative rounded-[1.25rem] border border-[#E2E8F0] bg-white p-6">
              <span className="font-display absolute right-5 top-4 text-4xl font-black text-[#2563EB]/10">{p.n}</span>
              <IconBadge nome={p.icon} />
              <h3 className="font-display mt-4 text-base font-bold text-[#0D1B2A]">{p.titulo}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{p.desc}</p>
            </Reveal>
          ))}
        </div>

        {/* Operação integrada — fluxo Cliente → Atendimento → Cozinha/Bar → Caixa → Gestão */}
        <div className="mt-16">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h3 className="font-display text-xl font-bold text-[#0D1B2A]">Operação integrada, do pedido ao resultado</h3>
          </Reveal>
          <Reveal delay={80} className="mt-8 overflow-x-auto">
            <div className="mx-auto flex w-max min-w-full items-center justify-center gap-2 px-1 sm:gap-3">
              {FLUXO_OPERACAO.map((etapa, i) => (
                <div key={etapa} className="flex items-center gap-2 sm:gap-3">
                  <span className="whitespace-nowrap rounded-full border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-bold text-[#0D1B2A] shadow-sm sm:text-sm">{etapa}</span>
                  {i < FLUXO_OPERACAO.length - 1 && <Icone nome="crescimento" className="h-4 w-4 shrink-0 rotate-[-35deg] text-[#CBD5E1]" />}
                </div>
              ))}
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {FLUXO_BENEFICIOS.map((b, i) => (
              <Reveal as="article" key={b.titulo} delay={i * 80} className="rounded-[1.25rem] border border-[#E2E8F0] bg-white p-5 text-center">
                <div className="flex justify-center"><IconBadge nome={b.icon} tom="green" /></div>
                <h4 className="font-display mt-3 text-sm font-bold text-[#0D1B2A]">{b.titulo}</h4>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">{b.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
