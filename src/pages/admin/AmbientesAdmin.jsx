import { useMemo } from "react";
import { History, Layers, Rocket, Tags, Wrench } from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import { ADMIN_VERSOES_NAV } from "../../lib/adminVersionsNav.js";
import AdminTabs from "./AdminTabs.jsx";
import EnvironmentsOverview from "./ambientes/EnvironmentsOverview.jsx";
import LiveVersionsPanel from "./ambientes/LiveVersionsPanel.jsx";
import { defaultReleaseDataSource } from "./ambientes/releaseDataSource.js";
import { useReleaseEnvironments } from "./ambientes/useReleaseEnvironments.js";
import { defaultMaintenanceDataSource } from "./manutencao/maintenanceDataSource.js";
import { useMaintenanceSnapshot } from "./manutencao/useMaintenanceSnapshot.js";
import HistoryTab from "./versoes/HistoryTab.jsx";
import VersionsReleasesTab from "./versoes/VersionsReleasesTab.jsx";
import { defaultVersionDataSource } from "./versoes/versionDataSource.js";
import { buildExecutionReviewViewModel, buildScheduleFormViewModel } from "./versoes/versionViewModels.js";
import { useVersionsPage } from "./versoes/useVersionsPage.js";

// ════════════════════════════════════════════════════════════
//  Versões & Atualizações — shell da central (PDB-I3-FE1 → FE3)
//  Rota: /admin/ambientes (a URL e as permissões NÃO mudam).
//
//  Quatro abas (só o painel ativo é montado — AdminTabs):
//   • "Visão geral"       — Ambientes (Homologação × Produção), migrations,
//                           readiness, plano, fluxo e as ações de prévia
//                           (Revisar execução / Agendar). Fixture local.
//   • "Versões & Releases" — versão do produto, modelo de versionamento e
//                           releases agrupadas por versão. Fixture local.
//   • "Deploys"           — painel ao vivo já existente (GitHub/Vercel via
//                           /api/ambientes e /api/releases, somente leitura),
//                           preservado. Só consulta a rede quando aberta.
//   • "Histórico"         — sequência imutável de versões, releases,
//                           publicações, falhas e reversões. Fixture local.
//
//  Toda a prévia segue: fixture → adapter → view-model → componentes. Nenhuma
//  rede, Supabase ou mutação fora da aba "Deploys".
// ════════════════════════════════════════════════════════════

const ABAS = [
  { id: "visao-geral", label: "Visão geral", Icone: Layers },
  { id: "versoes-releases", label: "Versões & Releases", Icone: Tags },
  { id: "deploys", label: "Deploys", Icone: Rocket },
  { id: "historico", label: "Histórico", Icone: History },
];

function indicadoresDoCabecalho(viewModel) {
  if (viewModel.state !== "ready") return [];
  const indicadores = [
    viewModel.source.isPreview
      ? { valor: "Fonte:", rotulo: "Prévia (dados de exemplo)", tom: "neutro" }
      : { valor: "Fonte:", rotulo: viewModel.connection.label, tom: viewModel.connection.state === "live" ? "ok" : "neutro" },
  ];
  if (viewModel.referenceDateLabel) {
    indicadores.push({
      valor: viewModel.source.isPreview ? "Referência visual:" : "Última atualização:",
      rotulo: viewModel.referenceDateLabel,
      tom: "neutro",
    });
  }
  return indicadores;
}

export default function AmbientesAdmin({
  dataSource = defaultReleaseDataSource,
  versionDataSource = defaultVersionDataSource,
  maintenanceDataSource = defaultMaintenanceDataSource,
  onAcompanharManutencao = null,
}) {
  const { viewModel, retry } = useReleaseEnvironments(dataSource);
  const { viewModel: versions, retry: retryVersions } = useVersionsPage(versionDataSource);
  const { viewModel: maintenance } = useMaintenanceSnapshot(maintenanceDataSource);

  // Revisão de execução e formulário de agendamento (prévias): combinam a
  // central, as proteções da Manutenção e as releases — tudo já em view-model.
  const executionReview = useMemo(
    () => (viewModel.state === "ready"
      ? buildExecutionReviewViewModel({ overview: viewModel, maintenance, releases: versions.releases })
      : null),
    [viewModel, maintenance, versions.releases],
  );
  const scheduleForm = useMemo(
    () => (viewModel.state === "ready" ? buildScheduleFormViewModel({ overview: viewModel, releases: versions.releases }) : null),
    [viewModel, versions.releases],
  );

  const renderPanel = (aba) => {
    if (aba === "visao-geral") {
      return <EnvironmentsOverview viewModel={viewModel} onRetry={retry} executionReview={executionReview} scheduleForm={scheduleForm} />;
    }
    if (aba === "versoes-releases") return <VersionsReleasesTab versions={versions} onRetry={retryVersions} />;
    if (aba === "historico") return <HistoryTab versions={versions} onRetry={retryVersions} />;
    return <LiveVersionsPanel />;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8" data-module="versoes-atualizacoes">
      <PageHeader
        icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
        titulo={ADMIN_VERSOES_NAV.modulo}
        descricao={ADMIN_VERSOES_NAV.descricao}
        indicadores={indicadoresDoCabecalho(viewModel)}
        acao={typeof onAcompanharManutencao === "function" ? (
          <PrimeButton variante="ghost" className="min-h-11 w-full sm:w-auto" onClick={onAcompanharManutencao}>
            <Wrench className="h-4 w-4" aria-hidden="true" />
            {ADMIN_VERSOES_NAV.acompanharManutencao}
          </PrimeButton>
        ) : null}
      />

      <AdminTabs tabs={ABAS} ariaLabel={`Seções de ${ADMIN_VERSOES_NAV.modulo}`} renderPanel={renderPanel} />
    </div>
  );
}
