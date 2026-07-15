import { Reveal, SectionHeading } from "../ui";
import { SEGMENTOS } from "../content";

export default function Segmentos() {
  return (
    <section id="segmentos" className="scroll-mt-24 bg-[var(--pp-bg)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Segmentos" tom="gold" titulo="Feito para diferentes tipos de operação gastronômica"
          desc="Do burger ao sushi, da cafeteria à padaria — o Pedido Prime se adapta ao seu negócio." />
        <Reveal className="mt-12 flex flex-wrap justify-center gap-3">
          {SEGMENTOS.map((s) => (
            <span key={s} className="rounded-full border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--pp-text-body)] shadow-sm">{s}</span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
