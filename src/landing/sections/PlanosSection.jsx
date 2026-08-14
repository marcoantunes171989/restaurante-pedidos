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
          badge="Soluções"
          titulo="Uma solução para cada"
          tituloAccent="tipo de operação."
          desc="Cada restaurante tem uma rotina, estrutura e necessidade diferente. Conheça a plataforma em uma apresentação personalizada e descubra a configuração mais adequada para o seu negócio."
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
                <p className="mt-1 min-h-[3.25rem] text-sm leading-6 text-[#012E46]/70">{p.desc}</p>
                <p className="mt-4 min-h-[3.5rem] text-base font-bold leading-6 text-[#012E46]">
                  Solução personalizada para sua operação
                </p>
                <ul className="mt-5 flex-1 space-y-2">
                  {p.recursos.slice(0, 5).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-[#012E46]/85">
                      <CheckIcon /> {r}
                    </li>
                  ))}
                  {p.recursos.length > 5 ? (
                    <li className="pl-6 text-xs font-semibold text-[#012E46]/65">
                      + {p.recursos.length - 5} recurso(s)
                    </li>
                  ) : null}
                </ul>
                <Botao
                  variant={destaque ? "primary" : "outlineDark"}
                  href={linkWhatsappConsultor(`Olá! Gostaria de agendar uma apresentação da solução ${p.nome} do Pedido Prime.`)}
                  className="mt-6 w-full"
                >
                  Agendar uma apresentação
                </Botao>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-8 text-center text-sm text-[#012E46]/65">
          Fale com um consultor para entender a configuração mais adequada para o seu negócio.
        </Reveal>
      </div>
    </section>
  );
}
