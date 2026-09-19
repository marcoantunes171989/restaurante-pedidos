import { CircleSlash } from "lucide-react";
import FieldGrid from "./FieldGrid.jsx";

function Bar({ label, value }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-[#111111]">{label}</span>
        <span className="tabular-nums text-[#4B5563]">{value === null ? "Não informado" : `${value}%`}</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#E5E7EB]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : value}
        aria-valuetext={value === null ? "Não informado" : `${value}%`}
      >
        <div className="h-full rounded-full bg-[#012E46]" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

// Progresso e resumo da execução. Sem execução: estado ocioso — NUNCA "0%"
// nem barra vazia (pareceria algo rodando). Os valores vêm do adapter; esta
// tela não tem timer nem contador próprio.
export default function ExecutionProgress({ progress }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Progresso da atualização" data-testid="execution-progress" data-idle={progress.isIdle ? "true" : "false"}>
      <h2 className="text-[15px] font-bold text-[#012E46]">Progresso</h2>

      {progress.isIdle ? (
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-7 text-center" data-testid="progress-idle">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
            <CircleSlash className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#111111]">{progress.idleMessage}</p>
          <p className="max-w-xs text-[13px] leading-5 text-[#6B7280]">O progresso e o resumo da execução aparecerão aqui quando uma atualização for iniciada.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {progress.showBars && (
            <div className="space-y-3">
              <Bar label="Progresso geral" value={progress.overall} />
              <Bar label="Progresso da etapa" value={progress.phase} />
            </div>
          )}
          {progress.isIndeterminate && (
            <p className="text-[13px] text-[#4B5563]" data-testid="progress-indeterminate">Em andamento — o progresso ainda não foi informado.</p>
          )}
          <FieldGrid fields={progress.summary} />
        </div>
      )}
    </section>
  );
}
