import { Reveal, SectionHeading, GlowOrb } from "../ui";
import { Icone } from "../icons";
import { LaptopFrame, TelaDashboard } from "../devices";
import { JORNADA_GESTOR } from "../content";

// Posições fixas (não geradas em runtime) para os cartões flutuarem em
// volta do notebook de forma equilibrada, sem colidir em nenhuma resolução
// suportada — coordenadas em % relativas ao container.
const POSICOES = [
  "left-[2%] top-[6%]", "right-[2%] top-[4%]", "left-[-2%] top-[38%]", "right-[-2%] top-[36%]",
  "left-[4%] bottom-[8%]", "right-[4%] bottom-[6%]", "left-[26%] top-[-6%]", "right-[24%] top-[-4%]",
  "left-[24%] bottom-[-6%]", "right-[22%] bottom-[-4%]",
];

// "Experiência do Gestor" — notebook central com o dashboard e cartões
// flutuantes de indicadores ao redor, todos "atualizados em tempo real".
// Fundo bege muito claro (paleta oficial) — sem bloco escuro pesado.
export default function JornadaGestor() {
  return (
    <section className="section relative overflow-hidden bg-[var(--pp-bg)]">
      <GlowOrb className="left-1/2 top-0 h-96 w-96 -translate-x-1/2" />
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Experiência do gestor" titulo="O restaurante inteiro, visível em uma única tela"
          desc="Vendas, lucro, produtos, clientes, mesas e financeiro — atualizados a cada pedido, sem precisar sair do painel." />

        <Reveal delay={140} className="relative mx-auto mt-16 max-w-2xl px-6 py-10 sm:px-16">
          <div className="mx-auto w-full max-w-md">
            <LaptopFrame><TelaDashboard /></LaptopFrame>
          </div>
          {JORNADA_GESTOR.map((c, i) => (
            <div key={c.label} className={`pp-float absolute hidden items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--pp-graphite)] shadow-[0_14px_30px_-20px_rgba(28,20,15,0.3)] sm:flex ${POSICOES[i % POSICOES.length]}`}
              style={{ animationDelay: `${-(i * 0.7)}s` }}>
              <Icone nome={c.icon} className="h-3.5 w-3.5 text-[var(--pp-primary-hover)]" /> {c.label}
            </div>
          ))}
        </Reveal>

        <Reveal delay={220} className="mx-auto mt-10 flex max-w-xl flex-wrap justify-center gap-2 sm:hidden">
          {JORNADA_GESTOR.map((c) => (
            <span key={c.label} className="flex items-center gap-1.5 rounded-full border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--pp-graphite)]">
              <Icone nome={c.icon} className="h-3.5 w-3.5 text-[var(--pp-primary-hover)]" /> {c.label}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
