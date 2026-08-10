import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { TelaPorTipo } from "../devices";
import { ECOSSISTEMA } from "../content";

// "Conheça o ecossistema Pedido Prime" — grade de mockups de tela, cada um
// num card premium com chrome de "janela" leve (mesma linguagem visual em
// todos os 12, para não competir com os dispositivos do Hero).
export default function Ecosystem() {
  return (
    <section id="ecossistema" className="section scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Ecossistema completo" titulo="Conheça o ecossistema Pedido Prime"
          desc="Cada perfil da operação com a tela certa — cliente, garçom, cozinha, bar, caixa e gestão, todos conectados à mesma base de dados, em tempo real." />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ECOSSISTEMA.map((item, i) => (
            <Reveal as="article" key={item.id} delay={(i % 3) * 90}
              className="group overflow-hidden rounded-[1.25rem] border border-[var(--pp-border)] bg-white shadow-[0_16px_40px_-28px_rgba(28,20,15,0.25)] transition hover:-translate-y-1 hover:shadow-[0_24px_54px_-24px_rgba(28,20,15,0.3)]">
              <div className="border-b border-[var(--pp-border)] bg-[var(--pp-bg)] px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--pp-border)]" />
                  <span className="h-2 w-2 rounded-full bg-[var(--pp-border)]" />
                  <span className="h-2 w-2 rounded-full bg-[var(--pp-border)]" />
                </div>
              </div>
              <div className="min-h-[168px] bg-white">
                <TelaPorTipo tipo={item.tela} />
              </div>
              <div className="flex items-start gap-3 border-t border-[var(--pp-border)] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#F38525]/20 bg-[#F38525]/5 text-[var(--pp-primary-hover)]"><Icone nome={item.icon} className="h-4.5 w-4.5" /></span>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-[var(--pp-graphite)]">{item.titulo}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--pp-text-muted)]">{item.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
