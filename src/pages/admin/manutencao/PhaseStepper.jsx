import { useId, useState } from "react";
import { Info } from "lucide-react";
import { ToneBadge } from "../ambientes/StatusBadge.jsx";
import { TONES } from "../ambientes/releaseStatus.js";

// Pipeline de 9 etapas (Normal → … → Normalizado). É EDUCATIVO: selecionar
// uma etapa só explica o que ela faz — nada avança sozinho, não há timer e
// nenhuma etapa é marcada como concluída sem dado. A etapa atual vem do
// view-model (e o estado vem dos dados, nunca só da cor: ícone + texto + sr-only).
//
// Layout: tiles em grade (3 → 5 colunas) abaixo de xl — nunca overflow —, e uma
// linha horizontal com conectores em xl+.
export default function PhaseStepper({ stepper }) {
  const painelId = useId();
  const [escolhida, setEscolhida] = useState(null); // null = acompanha a etapa atual
  const selecionadaId = escolhida ?? stepper.currentId ?? stepper.steps[0].id;
  const selecionada = stepper.steps.find((s) => s.id === selecionadaId) || stepper.steps[0];
  const Icone = selecionada.state.Icon;

  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Fluxo da atualização">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#012E46]">Fluxo da atualização</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
            Selecione uma etapa para entender o que ela faz. Conteúdo educativo — nada é executado.
          </p>
        </div>
        <p className="text-[13px] text-[#6B7280]" data-testid="phase-progress">
          {stepper.hasUnknownPhase
            ? "Fase atual não reconhecida"
            : stepper.legacyPhase
              ? <>Fase atual: <b className="font-semibold text-[#111111]">{stepper.legacyPhase.label}</b> · fluxo legado da aplicação</>
              : <>Etapa atual: <b className="font-semibold text-[#111111]">{stepper.currentLabel}</b> · {stepper.currentIndex + 1} de {stepper.total}</>}
        </p>
      </div>

      <ol
        className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9 xl:gap-1"
        aria-label="Etapas da atualização"
      >
        {stepper.steps.map((step, i) => {
          const ultima = i === stepper.steps.length - 1;
          const marcada = step.id === selecionadaId;
          const { Icon } = step.state;
          const conector = step.state.key === "done" ? "xl:before:bg-[#012E46]" : "xl:before:bg-[#D1D5DB]";
          return (
            <li
              key={step.id}
              aria-current={step.isCurrent ? "step" : undefined}
              data-step={step.id}
              data-state={step.state.key}
              className={`relative ${ultima ? "" : `xl:before:absolute xl:before:left-1/2 xl:before:top-[1.625rem] xl:before:h-px xl:before:w-[calc(100%+0.25rem)] ${conector}`}`}
            >
              <button
                type="button"
                onClick={() => setEscolhida(step.id)}
                aria-pressed={marcada}
                aria-controls={painelId}
                className={`relative z-10 flex h-full w-full flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46] ${
                  marcada
                    ? "border-[#012E46] bg-[#F0F6F8]"
                    : "border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] xl:border-transparent xl:bg-transparent"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white ${TONES[step.state.tone]} ${step.isCurrent ? "ring-4 ring-[#F38525]/30" : ""}`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  {step.kind !== "step" && (
                    <span className="block text-[11px] font-semibold leading-4 text-[#6B7280]">
                      {step.kind === "start" ? "Início" : "Final"}
                    </span>
                  )}
                  <span className="block text-[13px] font-semibold leading-4 text-[#111111]">
                    <span className="sr-only">Etapa {step.index} de {stepper.total}: </span>
                    {step.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[#6B7280]">{step.state.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {stepper.legacyPhase && (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-5 text-[#4B5563]" role="note" data-testid="legacy-phase-note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <b className="font-semibold text-[#111111]">{stepper.legacyPhase.label}</b>{" "}
            (<code className="font-mono text-[12px] font-semibold">{stepper.legacyPhase.technicalName}</code>): {stepper.legacyPhase.description}{" "}
            {stepper.legacyPhase.helpText} Nenhuma etapa abaixo foi marcada como atual.
          </span>
        </p>
      )}

      {stepper.hasUnknownPhase && (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-5 text-[#4B5563]" role="note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          A fase informada não é reconhecida por esta interface. Nenhuma etapa foi marcada como atual.
        </p>
      )}

      <div
        id={painelId}
        role="region"
        aria-live="polite"
        aria-label="Detalhes da etapa selecionada"
        className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
        data-testid="phase-detail"
        data-step={selecionada.id}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#111111]">{selecionada.index}. {selecionada.label}</h3>
          <ToneBadge tone={selecionada.state.tone} Icon={Icone}>{selecionada.state.label}</ToneBadge>
          <code className="rounded-md border border-[#D1D5DB] bg-white px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#4B5563]" title="Nome técnico">
            {selecionada.technicalName}
          </code>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-[#111111]">{selecionada.description}</p>
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-5 text-[#4B5563]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{selecionada.helpText}</span>
        </p>
      </div>
    </section>
  );
}
