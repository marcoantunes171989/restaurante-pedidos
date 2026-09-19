import { ToneBadge } from "../ambientes/StatusBadge.jsx";
import { TONES } from "../ambientes/releaseStatus.js";

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-[#6B7280]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[#111111]">{children}</dd>
    </div>
  );
}

// Card principal de estado: fase atual, ambiente alvo, execução e plano, mais
// o estado da conexão (contrato futuro de tempo real). Só desenha o view-model.
export default function MaintenanceStatusHero({ hero, connection, lastUpdatedLabel }) {
  const { Icon } = hero.state;
  const Connection = connection.Icon;

  return (
    <section
      aria-label="Estado da manutenção"
      className="rounded-2xl border border-l-4 border-[#D1D5DB] border-l-[#F38525] bg-white p-4 sm:p-5"
      data-testid="maintenance-hero"
      data-idle={hero.isIdle ? "true" : "false"}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${TONES[hero.state.tone]}`}
            aria-hidden="true"
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#6B7280]">Estado da manutenção</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-bold leading-7 text-[#111111]" data-testid="hero-state">
              {hero.state.label}
              <span
                className="rounded-md border border-[#D1D5DB] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#4B5563]"
                title="Nome técnico da fase"
              >
                {hero.phaseTechnicalName}
              </span>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-3 xl:min-w-[32rem]">
          <Fact label="Ambiente alvo">{hero.environmentLabel}</Fact>
          <Fact label="Execução">
            <span data-testid="hero-execution"><ToneBadge tone={hero.execution.tone} Icon={hero.execution.Icon}>{hero.execution.label}</ToneBadge></span>
          </Fact>
          <Fact label="Plano">
            <span data-testid="hero-plan"><ToneBadge tone={hero.plan.tone} Icon={hero.plan.Icon}>{hero.plan.label}</ToneBadge></span>
          </Fact>
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#F3F4F6] pt-3.5">
        <span data-testid="connection-state" data-connection={connection.state}>
          <ToneBadge tone={connection.tone} Icon={Connection}>{connection.label}</ToneBadge>
        </span>
        <p className="text-[13px] text-[#6B7280]">
          Última atualização: <b className="font-semibold text-[#111111]" data-testid="last-updated">{lastUpdatedLabel}</b>
        </p>
      </div>
    </section>
  );
}
