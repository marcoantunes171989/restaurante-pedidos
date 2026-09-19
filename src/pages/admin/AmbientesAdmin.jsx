import { useId, useRef, useState } from "react";
import { Layers, Rocket } from "lucide-react";
import { PageHeader } from "../../components/Prime";
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
//                           a aba é aberta.
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
  const [aba, setAba] = useState(ABAS[0].id);
  const baseId = useId();
  const abaRefs = useRef({});

  const idAba = (id) => `${baseId}-aba-${id}`;
  const idPainel = (id) => `${baseId}-painel-${id}`;

  function onKeyDownAbas(e) {
    const atual = ABAS.findIndex((a) => a.id === aba);
    let proximo = null;
    if (e.key === "ArrowRight") proximo = (atual + 1) % ABAS.length;
    else if (e.key === "ArrowLeft") proximo = (atual - 1 + ABAS.length) % ABAS.length;
    else if (e.key === "Home") proximo = 0;
    else if (e.key === "End") proximo = ABAS.length - 1;
    if (proximo === null) return;
    e.preventDefault();
    setAba(ABAS[proximo].id);
    abaRefs.current[ABAS[proximo].id]?.focus();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
        titulo="Ambientes & Releases"
        descricao="Acompanhe versões, validações e o processo de atualização entre Homologação e Produção."
        indicadores={indicadoresDoCabecalho(viewModel)}
      />

      <div
        role="tablist"
        aria-label="Seções de Ambientes & Releases"
        onKeyDown={onKeyDownAbas}
        className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-[#D1D5DB] bg-white p-1"
      >
        {ABAS.map(({ id, label, Icone }) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              ref={(el) => { abaRefs.current[id] = el; }}
              id={idAba(id)}
              type="button"
              role="tab"
              aria-selected={ativa}
              aria-controls={idPainel(id)}
              tabIndex={ativa ? 0 : -1}
              onClick={() => setAba(id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46] ${
                ativa ? "bg-[#012E46] text-white" : "text-[#012E46] hover:bg-[#F0F6F8]"
              }`}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div id={idPainel(aba)} role="tabpanel" aria-labelledby={idAba(aba)} tabIndex={-1} className="outline-none">
        {aba === "visao-geral"
          ? <EnvironmentsOverview viewModel={viewModel} onRetry={retry} />
          : <LiveVersionsPanel />}
      </div>
    </div>
  );
}
