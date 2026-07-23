import { Reveal, SectionHeading, Carrossel } from "../ui";
import { SEGMENTOS } from "../content";

const GRADIENTES = [
  "from-[#C63F1D]/12 to-[#B8872A]/12", "from-[#B8872A]/12 to-[#C63F1D]/8", "from-[#A53416]/10 to-[#B8872A]/10",
];

function CardSegmento({ s, i }) {
  return (
    <div className="group flex w-40 shrink-0 flex-col items-center gap-3 rounded-2xl border border-[var(--pp-border)] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(28,20,15,0.25)] transition hover:-translate-y-1 hover:shadow-[0_20px_46px_-24px_rgba(28,20,15,0.3)]">
      <span className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${GRADIENTES[i % GRADIENTES.length]} text-3xl transition group-hover:scale-110`} aria-hidden="true">{s.emoji}</span>
      <p className="text-center text-sm font-bold text-[var(--pp-graphite)]">{s.nome}</p>
    </div>
  );
}

// "Restaurantes de todos os segmentos" — carrossel contínuo de cartões
// premium (sem foto real disponível: representação por ícone/emoji em
// tile com gradiente da marca, mesma decisão já usada em PRATOS_DESTAQUE).
export default function Segmentos() {
  return (
    <section id="segmentos" className="scroll-mt-24 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Para todo tipo de operação" titulo="Restaurantes de todos os segmentos"
          desc="De hamburguerias a hotéis, o Pedido Prime se adapta ao formato e ao ritmo de cada tipo de estabelecimento gastronômico." />
      </div>
      <Reveal delay={100} className="mt-12">
        <Carrossel duracao={38}>
          {SEGMENTOS.map((s, i) => <CardSegmento key={s.nome} s={s} i={i} />)}
        </Carrossel>
      </Reveal>
    </section>
  );
}
