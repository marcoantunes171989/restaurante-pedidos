import { Reveal, SectionHeading, StatusPill } from "../ui";
import { Icone } from "../icons";
import { ALEM_DO_SALAO } from "../content";

// "Muito além do salão" — canais de venda e atendimento, hoje e no roadmap.
// Itens com status "em breve" são marcados como tal (ver StatusPill) —
// nunca apresentados como já disponíveis.
export default function AlemDoSalao() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Além do salão" titulo="Muito além do salão"
          desc="Pedido interno, QR Code, delivery, retirada e app instalável hoje — totem, WhatsApp e novas integrações a caminho." />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {ALEM_DO_SALAO.map((c, i) => (
            <Reveal as="article" key={c.titulo} delay={(i % 5) * 60}
              className="relative rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-4 transition hover:-translate-y-1">
              <StatusPill status={c.status} />
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--pp-primary-hover)] shadow-sm"><Icone nome={c.icon} className="h-4.5 w-4.5" /></span>
              <h3 className="font-display mt-3 text-xs font-bold text-[var(--pp-graphite)]">{c.titulo}</h3>
              <p className="mt-1 text-[11px] leading-4 text-[var(--pp-text-muted)]">{c.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
