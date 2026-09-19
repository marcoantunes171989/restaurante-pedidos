import { Database, GitBranch, GitCommit, ServerCog, TriangleAlert, CalendarCheck } from "lucide-react";
import { StatusBadge, ToneBadge } from "./StatusBadge.jsx";

function Fact({ Icon, label, children, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-[#6B7280]">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold text-[#111111] ${mono ? "font-mono tabular-nums" : ""}`}>{children}</dd>
    </div>
  );
}

// Card de ambiente (Homologação / Produção). Tudo vem do view-model.
export default function EnvironmentCard({ env }) {
  const baselineUnknown = !env.databaseBaseline.known;
  return (
    <article
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5"
      aria-label={`Ambiente ${env.label}`}
      data-environment={env.environment}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${env.isProduction ? "bg-[#012E46] text-white" : "border border-[#AFC2CC] bg-[#F0F6F8] text-[#012E46]"}`}
            aria-hidden="true"
          >
            <ServerCog className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#012E46]">{env.label}</h3>
            <p className="truncate text-[13px] text-[#6B7280]">{env.displayName}</p>
          </div>
        </div>
        <StatusBadge status={env.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-[#F3F4F6] pt-4">
        <Fact Icon={GitBranch} label="Branch" mono>{env.branch}</Fact>
        <Fact Icon={GitCommit} label="Release da aplicação" mono>{env.releaseSha}</Fact>
        <Fact Icon={Database} label="Baseline do banco">
          <span className={baselineUnknown ? "text-[#4B5563]" : ""} data-testid={`baseline-${env.environment}`}>
            {env.databaseBaseline.label}
          </span>
        </Fact>
        <Fact Icon={CalendarCheck} label="Última validação">{env.lastValidatedLabel}</Fact>
      </dl>

      <div className="flex flex-wrap gap-2" aria-label="Situação do banco">
        <StatusBadge status={env.databaseStatus} />
        {env.badges
          .filter((b) => b.label !== env.databaseStatus.label)
          .map((b) => <ToneBadge key={b.key} tone={b.tone} Icon={b.Icon}>{b.label}</ToneBadge>)}
      </div>

      {env.alerts.length > 0 && (
        <ul className="space-y-2">
          {env.alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex items-start gap-2 rounded-xl border border-[#F9D8AE] bg-[#FFF7ED] px-3 py-2 text-[13px] leading-5 text-[#9A5B12]"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{alert.text}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
