import { Activity, SlidersHorizontal, Wrench } from "lucide-react";
import { PageHeader } from "../../components/Prime";
import AdminTabs from "./AdminTabs.jsx";
import { ToneBadge } from "./ambientes/StatusBadge.jsx";
import LegacyMaintenancePanel from "./manutencao/LegacyMaintenancePanel.jsx";
import MaintenanceOverview from "./manutencao/MaintenanceOverview.jsx";
import { defaultMaintenanceDataSource } from "./manutencao/maintenanceDataSource.js";
import { PREVIEW_LABEL } from "./manutencao/maintenanceStatus.js";
import { useMaintenanceSnapshot } from "./manutencao/useMaintenanceSnapshot.js";

// ════════════════════════════════════════════════════════════
//  Manutenção — shell da página (PDB-I3-FE2)
//
//  Duas abas:
//   • "Visão operacional" — acompanhamento visual do processo de atualização
//                           HML → Produção: estado, fase, proteções, executor,
//                           progresso, migrations, linha do tempo e recuperação.
//                           Consome UM data source (hoje: fixture local — ver
//                           manutencao/maintenanceDataSource.js). Nenhuma rede,
//                           Supabase ou mutação nesta aba.
//   • "Controle atual"    — painel ao vivo já existente (B15-A2:
//                           /api/maintenance e /api/releases), preservado. Só
//                           monta — e só consulta a rede — quando a aba é aberta
//                           (AdminTabs renderiza só o painel ativo).
// ════════════════════════════════════════════════════════════

const ABAS = [
  { id: "visao-operacional", label: "Visão operacional", Icone: Activity },
  { id: "controle-atual", label: "Controle atual", Icone: SlidersHorizontal },
];

function indicadoresDoCabecalho(viewModel) {
  if (viewModel.state !== "ready") return [];
  return [
    viewModel.source.isPreview
      ? { valor: "Fonte:", rotulo: "Prévia (dados de exemplo)", tom: "neutro" }
      : { valor: "Fonte:", rotulo: viewModel.connection.label, tom: viewModel.connection.state === "live" ? "ok" : "neutro" },
    { valor: viewModel.source.isPreview ? "Referência visual:" : "Última atualização:", rotulo: viewModel.lastUpdatedLabel, tom: "neutro" },
  ];
}

export default function MaintenanceAdmin({ dataSource = defaultMaintenanceDataSource }) {
  const { viewModel, retry } = useMaintenanceSnapshot(dataSource);
  const isPreview = viewModel.state === "ready" && viewModel.source.isPreview;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<Wrench className="h-5 w-5" aria-hidden="true" />}
        titulo="Manutenção"
        descricao="Acompanhe as etapas, proteções e o progresso das atualizações do sistema."
        indicadores={indicadoresDoCabecalho(viewModel)}
        acao={isPreview ? <ToneBadge tone="brand" data-testid="preview-badge">{PREVIEW_LABEL}</ToneBadge> : null}
      />

      <AdminTabs
        tabs={ABAS}
        ariaLabel="Seções de Manutenção"
        renderPanel={(aba) => (aba === "visao-operacional"
          ? <MaintenanceOverview viewModel={viewModel} onRetry={retry} />
          : <LegacyMaintenancePanel />)}
      />
    </div>
  );
}
