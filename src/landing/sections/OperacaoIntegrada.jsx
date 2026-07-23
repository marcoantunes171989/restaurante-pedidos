import { Reveal, SectionHeading } from "../ui";
import { Icone, IcoSeta } from "../icons";

// Colunas do diagrama — cada uma representa uma "estação" da operação,
// conectada por setas às colunas vizinhas. Layout em colunas (não
// isométrico literal) para permanecer legível e robusto em qualquer
// resolução, mantendo a mesma ideia do briefing: todos os papéis
// conectados, com o fluxo indicado visualmente.
const COLUNAS = [
  { titulo: "Cliente", nos: [{ icon: "clientes", label: "Cliente" }, { icon: "mesa", label: "Mesa" }] },
  { titulo: "Atendimento", nos: [{ icon: "qr", label: "QR Code" }, { icon: "tablet", label: "Garçom" }] },
  { titulo: "Produção", nos: [{ icon: "chef", label: "Cozinha" }, { icon: "bar", label: "Bar" }] },
  { titulo: "Gestão", nos: [{ icon: "caixa", label: "Caixa" }, { icon: "dashboard", label: "Gestor" }] },
];

function No({ icon, label }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 shadow-[0_10px_26px_-20px_rgba(28,20,15,0.3)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C63F1D]/8 text-[var(--pp-primary-hover)]"><Icone nome={icon} className="h-4 w-4" /></span>
      <span className="text-xs font-bold text-[var(--pp-graphite)]">{label}</span>
    </div>
  );
}

// "Operação Integrada" — cliente, garçom, mesa, QR Code, cozinha, bar,
// caixa e gestor, todos conectados no mesmo fluxo de dados.
export default function OperacaoIntegrada() {
  return (
    <section className="bg-[var(--pp-bg)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Operação integrada" titulo="Cliente, equipe e gestão — todos conectados no mesmo fluxo"
          desc="Cada papel da operação enxerga exatamente o que precisa, no momento certo, sem depender de comunicação manual entre setores." />
        <Reveal delay={120} className="mt-14 overflow-x-auto pb-2">
          <div className="mx-auto flex min-w-[640px] max-w-4xl items-center justify-center gap-2 sm:gap-4">
            {COLUNAS.map((col, i) => (
              <div key={col.titulo} className="flex items-center gap-2 sm:gap-4">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--pp-text-muted)]">{col.titulo}</p>
                  <div className="flex flex-col gap-2.5">
                    {col.nos.map((n) => <No key={n.label} {...n} />)}
                  </div>
                </div>
                {i < COLUNAS.length - 1 && (
                  <IcoSeta className="h-5 w-5 shrink-0 text-[#B8872A]" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
