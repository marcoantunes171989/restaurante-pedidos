import { Info } from "lucide-react";
import EnvironmentCard from "./EnvironmentCard.jsx";
import MigrationTable from "./MigrationTable.jsx";
import ReadinessPanel from "./ReadinessPanel.jsx";
import ReleaseActions from "./ReleaseActions.jsx";
import ReleaseFlow from "./ReleaseFlow.jsx";
import ReleasePlanCard from "./ReleasePlanCard.jsx";
import SafetySummary from "./SafetySummary.jsx";
import { EnvironmentsError, EnvironmentsSkeleton } from "./PageStates.jsx";

// Visão geral (Homologação × Produção). Puramente apresentacional: recebe o
// view-model pronto e nunca conhece a origem dos dados (fixture ou live).
export default function EnvironmentsOverview({ viewModel, onRetry = null }) {
  if (viewModel.state === "loading") return <EnvironmentsSkeleton />;
  if (viewModel.state === "error") return <EnvironmentsError message={viewModel.errorMessage} onRetry={onRetry} />;

  return (
    <div className="space-y-5" data-state="ready" data-source={viewModel.source.kind}>
      {viewModel.source.isPreview && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-[#AFC2CC] bg-[#F0F6F8] px-3.5 py-2.5 text-[13px] leading-5 text-[#012E46]"
          data-testid="preview-notice"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0">
            <b className="font-semibold">{viewModel.source.label}</b>
            {" · Interface em integração. Os dados são de exemplo e nenhuma ação é executada por esta tela."}
          </p>
        </div>
      )}

      {viewModel.environments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D1D5DB] bg-white px-4 py-10 text-center text-sm text-[#6B7280]">
          Nenhum ambiente informado.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {viewModel.environments.map((env) => <EnvironmentCard key={env.environment} env={env} />)}
        </div>
      )}

      <ReleaseActions
        capabilities={viewModel.capabilities}
        readiness={viewModel.readiness}
        plan={viewModel.plan}
        migrations={viewModel.migrations}
        flow={viewModel.flow}
        safety={viewModel.safety}
      />

      <ReleaseFlow flow={viewModel.flow} />

      <MigrationTable migrations={viewModel.migrations} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
        <ReadinessPanel readiness={viewModel.readiness} />
        <div className="space-y-4">
          <ReleasePlanCard plan={viewModel.plan} />
          <SafetySummary safety={viewModel.safety} />
        </div>
      </div>
    </div>
  );
}
