import { History } from "lucide-react";
import { StatusBadge } from "../ambientes/StatusBadge.jsx";
import { TONES } from "../ambientes/releaseStatus.js";

function TimelineItem({ event, last }) {
  const { Icon } = event.status;
  return (
    <li
      className={`relative flex gap-3 ${last ? "" : "pb-5 before:absolute before:left-4 before:top-9 before:-bottom-1 before:w-px before:bg-[#D1D5DB]"}`}
      data-event={event.id}
      data-status={event.status.key}
    >
      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white ${TONES[event.status.tone]}`} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-[#111111]">{event.title}</p>
          <StatusBadge status={event.status} />
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-[#6B7280]">
          {event.timestampLabel} · {event.phaseLabel} · {event.typeLabel}
          {event.actor && <> · {event.actor}</>}
        </p>
        {event.description && <p className="mt-1 text-[13px] leading-5 text-[#4B5563]">{event.description}</p>}
        {event.hasMetadata && (
          <details className="mt-1.5">
            <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-md text-[13px] font-semibold text-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]">
              Ver metadados
            </summary>
            <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 sm:grid-cols-2">
              {event.metadata.map((m) => (
                <div key={m.key} className="min-w-0">
                  <dt className="text-[12px] text-[#6B7280]">{m.key}</dt>
                  <dd className="break-words font-mono text-[12px] font-semibold text-[#111111]">{m.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </li>
  );
}

// Linha do tempo cronológica. Vazia por padrão: a prévia NÃO registra eventos
// — eles aparecem sozinhos quando o snapshot/patches trouxerem execução real.
export default function MaintenanceTimeline({ timeline }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Linha do tempo" data-testid="maintenance-timeline">
      <h2 className="text-[15px] font-bold text-[#012E46]">Linha do tempo</h2>

      {timeline.isEmpty ? (
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-9 text-center" data-testid="timeline-empty">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
            <History className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#111111]">{timeline.emptyTitle}</p>
          <p className="max-w-sm text-[13px] leading-5 text-[#6B7280]">{timeline.emptyText}</p>
        </div>
      ) : (
        <ol className="mt-4" aria-label="Eventos da atualização em ordem cronológica">
          {timeline.items.map((event, i) => <TimelineItem key={event.id} event={event} last={i === timeline.items.length - 1} />)}
        </ol>
      )}
    </section>
  );
}
