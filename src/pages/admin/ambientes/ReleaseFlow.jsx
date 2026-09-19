import { TONES } from "./releaseStatus.js";

// Fluxo Desenvolvimento → … → Produção. Só reflete o estado recebido: nenhum
// passo "avança" sozinho e nenhum é marcado como concluído sem dado.
export default function ReleaseFlow({ flow }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Fluxo de atualização">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#012E46]">Fluxo de atualização</h2>
        <p className="text-[13px] text-[#6B7280]" data-testid="flow-progress">
          {flow.completedCount} de {flow.total} etapas concluídas
        </p>
      </div>

      <ol className="mt-4 flex flex-col lg:flex-row" aria-label="Etapas do fluxo de atualização">
        {flow.steps.map((step, i) => {
          const ultimo = i === flow.steps.length - 1;
          const { Icon } = step.state;
          const conector = step.state.key === "done" ? "before:bg-[#012E46]" : "before:bg-[#D1D5DB]";
          return (
            <li
              key={step.id}
              aria-current={step.state.key === "current" ? "step" : undefined}
              data-step={step.id}
              data-state={step.state.key}
              className={`relative flex items-start gap-3 pb-5 last:pb-0 lg:flex-1 lg:flex-col lg:items-center lg:gap-2 lg:pb-0 lg:text-center ${
                ultimo
                  ? ""
                  : `before:absolute before:left-4 before:top-9 before:-bottom-1 before:w-px lg:before:bottom-auto lg:before:left-1/2 lg:before:top-4 lg:before:h-px lg:before:w-full ${conector}`
              }`}
            >
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${TONES[step.state.tone]} ${step.state.key === "current" ? "ring-4 ring-[#012E46]/10" : ""}`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 lg:px-1">
                <p className="text-sm font-semibold text-[#111111]">{step.label}</p>
                <p className="text-[12px] leading-4 text-[#6B7280]">
                  <span className="sr-only">Etapa {step.index}: </span>
                  {step.state.label}
                </p>
                {step.note && <p className="mt-0.5 text-[12px] leading-4 text-[#4B5563]">{step.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
