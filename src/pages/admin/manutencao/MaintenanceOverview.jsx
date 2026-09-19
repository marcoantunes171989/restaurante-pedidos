import PreviewNotice from "../PreviewNotice.jsx";
import { EnvironmentsError } from "../ambientes/PageStates.jsx";
import ExecutionProgress from "./ExecutionProgress.jsx";
import ExecutorCard from "./ExecutorCard.jsx";
import MaintenanceActions from "./MaintenanceActions.jsx";
import MaintenanceMigrations from "./MaintenanceMigrations.jsx";
import MaintenanceStatusHero from "./MaintenanceStatusHero.jsx";
import MaintenanceTimeline from "./MaintenanceTimeline.jsx";
import PhaseStepper from "./PhaseStepper.jsx";
import ProtectionsPanel from "./ProtectionsPanel.jsx";
import RecoveryNotice from "./RecoveryNotice.jsx";
import { SafetyFlowCard, UserMessageCard } from "./UserExperiencePanel.jsx";

// Skeleton estático (sem animação obrigatória). Hoje a fixture é síncrona e
// nunca passa por aqui; o estado existe para o adapter live.
function MaintenanceSkeleton() {
  const bloco = "rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] animate-pulse motion-reduce:animate-none";
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando manutenção" data-state="loading">
      <div className={`${bloco} h-32`} />
      <div className={`${bloco} h-56`} />
      <div className={`${bloco} h-72`} />
      <span className="sr-only">Carregando o estado da manutenção…</span>
    </div>
  );
}

// Visão operacional. Puramente apresentacional: recebe o view-model pronto e
// nunca conhece a origem dos dados (fixture ou live). Sem handlers de ação: a
// autoridade vem de `viewModel.capabilities` + handlers explícitos (futuro).
export default function MaintenanceOverview({ viewModel, onRetry = null, actionHandlers = {} }) {
  if (viewModel.state === "loading") return <MaintenanceSkeleton />;
  if (viewModel.state === "error") return <EnvironmentsError message={viewModel.errorMessage} onRetry={onRetry} />;

  return (
    <div className="space-y-5" data-state="ready" data-source={viewModel.source.kind}>
      {viewModel.source.isPreview && (
        <PreviewNotice label="Interface em integração.">
          {" Os dados são de exemplo e nenhuma ação é executada por esta tela."}
        </PreviewNotice>
      )}

      {viewModel.failure && <RecoveryNotice failure={viewModel.failure} />}

      <MaintenanceStatusHero hero={viewModel.hero} connection={viewModel.connection} lastUpdatedLabel={viewModel.lastUpdatedLabel} />

      <PhaseStepper stepper={viewModel.stepper} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-start">
        <div className="xl:col-span-2"><ProtectionsPanel protections={viewModel.protections} /></div>
        <div className="space-y-4">
          <ExecutorCard executor={viewModel.executor} />
          <ExecutionProgress progress={viewModel.progress} />
        </div>
      </div>

      <MaintenanceActions
        capabilities={viewModel.capabilities}
        failure={viewModel.failure}
        details={viewModel.details}
        {...actionHandlers}
      />

      <MaintenanceMigrations migrations={viewModel.migrations} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
        <MaintenanceTimeline timeline={viewModel.timeline} />
        <div className="space-y-4">
          <UserMessageCard userExperience={viewModel.userExperience} />
          <SafetyFlowCard userExperience={viewModel.userExperience} />
        </div>
      </div>
    </div>
  );
}
