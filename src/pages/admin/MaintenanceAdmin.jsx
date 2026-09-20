import { useState } from "react";
import { Activity, ArrowLeft, SlidersHorizontal, Wrench } from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import { ADMIN_VERSOES_NAV } from "../../lib/adminVersionsNav.js";
import AdminTabs from "./AdminTabs.jsx";
import { ToneBadge } from "./ambientes/StatusBadge.jsx";
import AdminHelp from "./documentacao/AdminHelp.jsx";
import { HELP_CONTEXT_SECTIONS, HELP_DOCS } from "./documentacao/helpContent.js";
import { resolveContextSection } from "./documentacao/helpUtils.js";
import LegacyMaintenancePanel from "./manutencao/LegacyMaintenancePanel.jsx";
import MaintenanceOverview from "./manutencao/MaintenanceOverview.jsx";
import { LEGACY_MAINTENANCE_CAPABILITIES } from "./manutencao/legacyMaintenanceCapabilities.js";
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
//                           (AdminTabs renderiza só o painel ativo). Suas mutations
//                           (start/notice) ficam bloqueadas durante a prévia pela
//                           capability manutencao/legacyMaintenanceCapabilities.js.
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

export default function MaintenanceAdmin({
  dataSource = defaultMaintenanceDataSource,
  onVoltarParaVersoes = null,
  legacyCapabilities = LEGACY_MAINTENANCE_CAPABILITIES,
}) {
  const { viewModel, retry } = useMaintenanceSnapshot(dataSource);
  // Aba ativa: só para a ajuda contextual abrir no tópico da aba (PDB-I3-DOC1).
  const [abaAtiva, setAbaAtiva] = useState(ABAS[0].id);
  const isPreview = viewModel.state === "ready" && viewModel.source.isPreview;
  // Ajuda contextual + selo de prévia + atalho de volta à central (só navegação).
  const voltar = typeof onVoltarParaVersoes === "function";
  const acaoDoCabecalho = (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {isPreview && <ToneBadge tone="brand" data-testid="preview-badge">{PREVIEW_LABEL}</ToneBadge>}
      <div className="flex items-stretch gap-2">
        <AdminHelp doc={HELP_DOCS.manutencao} secaoContextual={resolveContextSection(HELP_DOCS.manutencao, HELP_CONTEXT_SECTIONS.manutencao, abaAtiva)} />
        {voltar && (
          <PrimeButton variante="ghost" className="min-h-11 min-w-0 flex-1 sm:flex-none" onClick={onVoltarParaVersoes}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {ADMIN_VERSOES_NAV.voltarParaCentral}
          </PrimeButton>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8" data-module="versoes-atualizacoes">
      <PageHeader
        icone={<Wrench className="h-5 w-5" aria-hidden="true" />}
        titulo="Manutenção"
        descricao="Acompanhe as etapas, proteções e o progresso das atualizações do sistema."
        indicadores={indicadoresDoCabecalho(viewModel)}
        acao={acaoDoCabecalho}
      />

      <AdminTabs
        tabs={ABAS}
        ariaLabel="Seções de Manutenção"
        onTabChange={setAbaAtiva}
        renderPanel={(aba) => (aba === "visao-operacional"
          ? <MaintenanceOverview viewModel={viewModel} onRetry={retry} />
          : <LegacyMaintenancePanel capabilities={legacyCapabilities} />)}
      />
    </div>
  );
}
