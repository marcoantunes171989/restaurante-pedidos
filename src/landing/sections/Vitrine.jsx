import { Reveal, SectionHeading, Carrossel, Botao } from "../ui";
import { goTo } from "../utils";
import { PRATOS_DESTAQUE } from "../content";

// Fundo do selo de emoji alterna entre os dois tons de marca (terracota e
// dourado) e um neutro — só variedade visual, sem significado de status.
const TONS_CARD = [
  { bg: "bg-[#FBEAE3]", anel: "ring-[#C63F1D]/15" },
  { bg: "bg-[#F8EFD9]", anel: "ring-[#B8872A]/15" },
  { bg: "bg-[#F3EDE4]", anel: "ring-[var(--pp-border)]" },
];

function PratoCard({ prato, i }) {
  const tom = TONS_CARD[i % TONS_CARD.length];
  return (
    <article
      className="group w-60 shrink-0 rounded-[1.5rem] border border-[var(--pp-border)] bg-white p-4 shadow-[0_16px_40px_-24px_rgba(43,35,32,0.25)] transition duration-300 ease-out hover:-translate-y-1.5 hover:border-[#C63F1D]/35 hover:shadow-[0_24px_50px_-20px_rgba(198,63,29,0.3)]"
    >
      <div className={`flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl ${tom.bg} ring-1 ${tom.anel}`}>
        <span className="text-5xl transition duration-300 ease-out group-hover:scale-110" aria-hidden="true">{prato.emoji}</span>
      </div>
      <p className="mt-3.5 truncate text-[11px] font-bold uppercase tracking-wider text-[var(--pp-brand-text)]">{prato.estabelecimento}</p>
      <h3 className="font-display mt-1 text-[15px] font-bold leading-snug text-[var(--pp-graphite)]">{prato.nome}</h3>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-display text-base font-black text-[var(--pp-graphite)]">R$ {prato.preco}</span>
        <span className="whitespace-nowrap rounded-full bg-[var(--pp-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--pp-text-muted)]">Peça em segundos</span>
      </div>
    </article>
  );
}

// Vitrine de pratos em destaque — logo após o Hero, pra reforçar apetite
// e "isso funciona pro meu segmento" antes de entrar em funcionalidades.
// Carrossel em marquee contínuo (pausa no hover, respeita
// prefers-reduced-motion — ver .pp-marquee no CSS global) com efeito de
// destaque por card (elevação + zoom leve do emoji + brilho de borda).
export default function Vitrine() {
  return (
    <section className="relative overflow-hidden bg-white py-16 sm:py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[140%] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(198,63,29,0.07),transparent)]" />
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          badge="Vitrine do cardápio"
          titulo="É assim que o seu prato mais vendido chega até o cliente"
          desc="Cardápio digital pensado para valorizar o produto — card grande, preço em destaque e pedido em poucos toques, em qualquer segmento gastronômico."
        />
      </div>
      <Reveal delay={100} className="mt-12">
        <Carrossel duracao={44}>
          {PRATOS_DESTAQUE.map((p, i) => <PratoCard key={p.nome} prato={p} i={i} />)}
        </Carrossel>
      </Reveal>
      <Reveal delay={180} className="mt-10 flex justify-center px-5">
        <Botao variant="primary" onClick={() => goTo("planos")}>Quero isso no meu cardápio</Botao>
      </Reveal>
    </section>
  );
}
