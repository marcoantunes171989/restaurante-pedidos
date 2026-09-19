import { ArrowRight } from "lucide-react";
import { ToneBadge } from "./StatusBadge.jsx";

function Field({ label, children, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-[#6B7280]">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-semibold text-[#111111] ${mono ? "font-mono tabular-nums" : ""}`}>{children}</dd>
    </div>
  );
}

// Campos do plano (reutilizado no card e no drawer "Ver plano").
export function PlanFields({ plan }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
      <Field label="Plano" mono>{plan.planId}</Field>
      <Field label="Tipo">{plan.kind}</Field>
      <Field label="Origem → destino">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {plan.sourceEnvironment}
          <ArrowRight className="h-3.5 w-3.5 text-[#6B7280]" aria-hidden="true" />
          {plan.targetEnvironment}
        </span>
      </Field>
      <Field label="Migrations">{plan.migrationCount}</Field>
      <Field label="Release alvo" mono>{plan.targetSha}</Field>
      <Field label="Release base" mono>{plan.baseSha}</Field>
      <Field label="Status">{plan.status}</Field>
      <Field label="Aprovação">{plan.approval}</Field>
      <Field label="Agendamento">{plan.schedule}</Field>
      <Field label="Criado em">{plan.createdAtLabel}</Field>
    </dl>
  );
}

export default function ReleasePlanCard({ plan }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Plano de atualização">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#012E46]">Plano de atualização</h2>
        {plan.isPreview && <ToneBadge tone="brand">Prévia</ToneBadge>}
      </div>
      <div className="mt-4"><PlanFields plan={plan} /></div>
    </section>
  );
}
