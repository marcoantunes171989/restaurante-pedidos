import { Reveal, SectionHeading, Botao } from "../ui";
import { planosPedidoPrime } from "../../config/pricing";
import { linkWhatsappConsultor } from "../../config/contato";
import { IcoPhone, IcoBars, IcoHandshake } from "../../components/upgrade/UpgradeModais";

const ICONE_PLANO = { phone: IcoPhone, bars: IcoBars, handshake: IcoHandshake };

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="#012E46" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function PlanosSection() {
  return (
    <section id="planos" className="section scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeading
          badge="Planos"
          titulo="Escolha o plano ideal"
          tituloAccent="para a sua operação."
          desc={`Planos a partir de R$ ${planosPedidoPrime[0].preco}/mês. Valores e recursos podem variar conforme o porte do negócio.`}
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-4">
          {planosPedidoPrime.map((p, i) => {
            const Icone = ICONE_PLANO[p.ico] || ICONE_PLANO.phone;
            const destaque = !!p.destaque;
            return (
              <Reveal
                as="article"
                key={p.id}
                delay={i * 70}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 transition ${
                  destaque
                    ? "border-[#012E46] shadow-[0_28px_60px_-28px_rgba(1,46,70,0.45)] lg:-translate-y-2"
                    : "border-[#012E46]/12"
                }`}
              >
                {destaque ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#012E46] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Recomendado
                  </span>
                ) : null}
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    destaque ? "border-[#012E46]/30 text-[#012E46]" : "border-[#F38525]/30 text-[#F38525]"
                  }`}
                >
                  <Icone className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-xl font-bold text-[#012E46]">{p.nome}</h3>
                <p className="mt-1 min-h-[3.25rem] text-sm leading-6 text-[#5B4F47]">{p.desc}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  {p.preco ? (
                    <>
                      <span className="text-3xl font-black text-[#012E46]">R$ {p.preco}</span>
                      <span className="text-sm text-[#5B4F47]">{p.periodo}</span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-[#012E46]">{p.precoTexto}</span>
                  )}
                </p>
                <ul className="mt-5 flex-1 space-y-2">
                  {p.recursos.slice(0, 5).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-[#012E46]/85">
                      <CheckIcon /> {r}
                    </li>
                  ))}
                  {p.recursos.length > 5 ? (
                    <li className="pl-6 text-xs font-semibold text-[#5B4F47]">
                      + {p.recursos.length - 5} recurso(s)
                    </li>
                  ) : null}
                </ul>
                <Botao
                  variant={destaque ? "primary" : "outlineDark"}
                  href={linkWhatsappConsultor(`Olá! Tenho interesse no plano ${p.nome} do Pedido Prime.`)}
                  className="mt-6 w-full"
                >
                  {p.cta}
                </Botao>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-8 text-center text-xs text-[#5B4F47]">
          * Valores mensais de referência — recursos e condições podem variar conforme o plano e o porte da operação.
        </Reveal>
      </div>
    </section>
  );
}
