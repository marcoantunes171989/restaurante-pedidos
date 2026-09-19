import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { StatusBadge, ToneBadge } from "./StatusBadge.jsx";

// Motivo/ajuda de um gate — reutilizado depois pelo backend (title/status/
// summary/reason/helpText já chegam prontos no view-model).
export function BlockedReason({ gate, id }) {
  return (
    <div id={id} className="mt-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3 text-[13px] leading-5" data-testid={`reason-${gate.id}`}>
      {gate.reason && (
        <p className="text-[#111111]">
          <span className="font-semibold">{gate.status.reasonLabel}</span>
          {gate.reason}
        </p>
      )}
      {gate.helpText && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[#4B5563]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{gate.helpText}</span>
        </p>
      )}
    </div>
  );
}

function GateHeader({ gate }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#111111]">{gate.title}</p>
        {gate.summary && <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">{gate.summary}</p>}
      </div>
      <StatusBadge status={gate.status} className="shrink-0" />
    </div>
  );
}

// Um gate de readiness. Com motivo/ajuda vira expansível (teclado + aria).
export function ReadinessItem({ gate, defaultOpen = false }) {
  const [aberto, setAberto] = useState(defaultOpen);
  const detalhesId = `gate-detalhes-${useId()}`; // único mesmo com o gate na página e no drawer

  return (
    <li className="border-t border-[#E5E7EB] first:border-t-0" data-gate={gate.id} data-status={gate.status.key}>
      {gate.hasDetails ? (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={detalhesId}
            className="flex w-full items-start gap-2 rounded-lg px-1 py-3 text-left transition hover:bg-[#F9FAFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
          >
            <GateHeader gate={gate} />
            <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-[#6B7280] transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {aberto && <div className="pb-3"><BlockedReason gate={gate} id={detalhesId} /></div>}
        </>
      ) : (
        <div className="flex items-start gap-2 px-1 py-3"><GateHeader gate={gate} /></div>
      )}
    </li>
  );
}

// Painel "Readiness da atualização". Sem READY global — só contagens.
export default function ReadinessPanel({ readiness }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Readiness da atualização">
      <h2 className="text-[15px] font-bold text-[#012E46]">Readiness da atualização</h2>
      <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]" data-testid="readiness-headline">{readiness.headline}</p>

      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Resumo das validações" data-testid="readiness-summary">
        {readiness.summaryItems.map((item) => (
          <li key={item.status} data-summary={item.status}>
            <ToneBadge tone={item.tone}>
              <b className="font-bold">{item.count}</b> {item.label}
            </ToneBadge>
          </li>
        ))}
      </ul>

      {readiness.gates.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#D1D5DB] px-3 py-6 text-center text-[13px] text-[#6B7280]">
          Nenhuma validação disponível.
        </p>
      ) : (
        <ul className="mt-3" aria-label="Validações da atualização">
          {readiness.gates.map((gate) => <ReadinessItem key={gate.id} gate={gate} />)}
        </ul>
      )}
    </section>
  );
}
