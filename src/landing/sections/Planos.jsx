import { Reveal, SectionHeading, Botao, Check } from "../ui";
import { planosPedidoPrime } from "../../config/pricing";
import { linkWhatsappConsultor } from "../../config/contato";
import { IcoPhone, IcoBars, IcoHandshake } from "../../components/upgrade/UpgradeModais";

// Ícones dos planos — mesmos já usados no PlanosModal do sistema logado
// (reutilizados via export, sem duplicar SVG).
const ICONE_PLANO = { phone: IcoPhone, bars: IcoBars, handshake: IcoHandshake };

export default function Planos() {
  return (
    <section id="planos" className="section scroll-mt-24 bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Planos" titulo={`Planos a partir de R$ ${planosPedidoPrime[0].preco}/mês`}
          desc="Escolha os recursos ideais para a sua operação. Valores e funcionalidades podem variar conforme o porte do negócio." />
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {planosPedidoPrime.map((p, i) => {
            const Icone = ICONE_PLANO[p.ico] || ICONE_PLANO.phone;
            const destaque = !!p.destaque;
            return (
              <Reveal as="article" key={p.id} delay={i * 80}
                className={`relative flex flex-col rounded-[1.25rem] border bg-white p-7 ${destaque ? "border-[#B8872A] shadow-xl" : "border-[var(--pp-border)]"}`}>
                {destaque && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#B8872A] px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--pp-graphite)] shadow">Recomendado</span>
                )}
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${destaque ? "border-[#B8872A]/40 text-[var(--pp-brand-text)]" : "border-[var(--pp-border)] text-[var(--pp-primary-hover)]"}`}><Icone className="h-5 w-5" /></span>
                <h3 className="font-display mt-4 text-xl font-bold text-[var(--pp-graphite)]">{p.nome}</h3>
                <p className="mt-1 min-h-[3.5rem] text-sm leading-6 text-[var(--pp-text-muted)]">{p.desc}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  {p.preco ? (<><span className="font-display text-3xl font-black text-[var(--pp-graphite)]">R$ {p.preco}</span><span className="text-sm text-[var(--pp-text-muted)]">{p.periodo}</span></>) : (
                    <span className="font-display text-2xl font-black text-[var(--pp-graphite)]">{p.precoTexto}</span>
                  )}
                </p>
                <ul className="mt-5 flex-1 space-y-2">
                  {p.recursos.slice(0, 6).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-[var(--pp-text-body)]"><Check /> {r}</li>
                  ))}
                  {p.recursos.length > 6 && <li className="pl-6 text-xs font-semibold text-[var(--pp-text-muted)]">+ {p.recursos.length - 6} recurso(s)</li>}
                </ul>
                {p.obs && <p className="mt-3 text-[11px] leading-5 text-[var(--pp-text-muted)]">{p.obs}</p>}
                {p.indicado && <p className="mt-3 text-[11px] font-semibold text-[var(--pp-primary-hover)]">Ideal para: {p.indicado}</p>}
                <Botao variant={destaque ? "primary" : "outline"} href={linkWhatsappConsultor(`Olá! Tenho interesse no plano ${p.nome} do Pedido Prime.`)} className="mt-6 w-full">{p.cta}</Botao>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-8 text-center text-xs text-[var(--pp-text-muted)]">
          * Valores mensais de referência — recursos, limites e condições podem variar conforme o plano contratado e o porte da operação.
        </Reveal>
      </div>
    </section>
  );
}
