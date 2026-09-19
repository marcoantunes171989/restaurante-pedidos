import { Layers, Rocket } from "lucide-react";
import { PageHeader } from "../../components/Prime";
import AdminTabs from "./AdminTabs.jsx";
import EnvironmentsOverview from "./ambientes/EnvironmentsOverview.jsx";
import LiveVersionsPanel from "./ambientes/LiveVersionsPanel.jsx";
import { defaultReleaseDataSource } from "./ambientes/releaseDataSource.js";
import { useReleaseEnvironments } from "./ambientes/useReleaseEnvironments.js";

// ════════════════════════════════════════════════════════════
//  Ambientes & Releases — shell da página (PDB-I3-FE1)
//
//  Duas abas:
//   • "Visão geral"       — Homologação × Produção, migrations, readiness,
//                           plano e fluxo. Consome UM data source (hoje: fixture
//                           local — ver ambientes/releaseDataSource.js). Nenhuma
//                           rede, Supabase ou mutação nesta aba.
//   • "Versões e deploys" — painel ao vivo já existente (GitHub/Vercel via
//                           /api/ambientes e /api/releases, somente leitura),
//                           preservado. Só monta — e só consulta a rede — quando
//                           a aba é aberta (AdminTabs renderiza só o painel ativo).
// ════════════════════════════════════════════════════════════

const ABAS = [
  { id: "visao-geral", label: "Visão geral", Icone: Layers },
  { id: "versoes", label: "Versões e deploys", Icone: Rocket },
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

export default function AmbientesAdmin({ dataSource = defaultReleaseDataSource }) {
  const { viewModel, retry } = useReleaseEnvironments(dataSource);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
        titulo="Ambientes & Releases"
        descricao="Acompanhe versões, validações e o processo de atualização entre Homologação e Produção."
        indicadores={indicadoresDoCabecalho(viewModel)}
      />

      <AdminTabs
        tabs={ABAS}
        ariaLabel="Seções de Ambientes & Releases"
        renderPanel={(aba) => (aba === "visao-geral"
          ? <EnvironmentsOverview viewModel={viewModel} onRetry={retry} />
          : <LiveVersionsPanel />)}
      />
    </div>
  );
}
