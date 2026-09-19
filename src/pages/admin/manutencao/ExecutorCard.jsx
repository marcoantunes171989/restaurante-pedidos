import { Cpu, Info } from "lucide-react";
import { StatusBadge } from "../ambientes/StatusBadge.jsx";
import FieldGrid from "./FieldGrid.jsx";

// Executor: quem coordena cada etapa. Worker/heartbeat/lease são campos
// preparados — sem dado aparecem como "Nenhum worker ativo"/"Sem heartbeat"/
// "Sem lease" (nunca um sinal de vida inventado).
export default function ExecutorCard({ executor }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Executor" data-testid="executor-card" data-status={executor.status.key}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
            <Cpu className="h-4 w-4" />
          </span>
          <h2 className="text-[15px] font-bold text-[#012E46]">{executor.title}</h2>
        </div>
        <StatusBadge status={executor.status} />
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#6B7280]">{executor.description}</p>

      <div className="mt-3.5">
        <FieldGrid
          className="sm:grid-cols-1"
          fields={[
            { label: "Worker", value: executor.worker },
            { label: "Heartbeat", value: executor.heartbeatLabel },
            { label: "Lease", value: executor.leaseLabel },
          ]}
        />
      </div>

      {executor.note && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[#F9D8AE] bg-[#FFF7ED] px-3 py-2 text-[13px] leading-5 text-[#9A5B12]" role="note" data-testid="executor-note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{executor.note}</span>
        </p>
      )}
    </section>
  );
}
