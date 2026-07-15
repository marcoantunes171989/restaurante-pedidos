import { Reveal, Check } from "../ui";
import { MockupCardapioCliente, MockupDashboard } from "../mockups";
import { EXPERIENCIA_CLIENTE, RECURSOS_PAINEL } from "../content";

export default function Experiencia() {
  return (
    <>
      {/* Experiência do cliente */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <h2 className="font-display text-[clamp(1.4rem,1.1rem+1.2vw,2rem)] font-black tracking-tight text-[var(--pp-graphite)]">Uma experiência de pedido rápida e intuitiva</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[var(--pp-text-muted)]">O cliente navega, personaliza e acompanha o pedido sem sair do celular — sem instalar aplicativo.</p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {EXPERIENCIA_CLIENTE.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm font-medium text-[var(--pp-text-body)]"><Check /> {b}</li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120}><MockupCardapioCliente /></Reveal>
          </div>
        </div>
      </section>

      {/* Painel administrativo */}
      <section className="bg-[var(--pp-bg)] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal delay={80} className="order-2 lg:order-1"><MockupDashboard /></Reveal>
            <Reveal className="order-1 lg:order-2">
              <h2 className="font-display text-[clamp(1.4rem,1.1rem+1.2vw,2rem)] font-black tracking-tight text-[var(--pp-graphite)]">Gestão completa em um painel administrativo</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[var(--pp-text-muted)]">Acompanhe a operação inteira sem precisar abrir várias telas ou planilhas separadas.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {RECURSOS_PAINEL.map((r) => (
                  <span key={r} className="rounded-full border border-[var(--pp-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pp-text-body)]">{r}</span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
