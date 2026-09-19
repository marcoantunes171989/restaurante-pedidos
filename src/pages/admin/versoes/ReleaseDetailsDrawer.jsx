import ReleaseDrawer from "../ambientes/ReleaseDrawer.jsx";
import { StatusBadge, ToneBadge } from "../ambientes/StatusBadge.jsx";
import FieldGrid from "../manutencao/FieldGrid.jsx";

// Detalhes de uma release (somente leitura). Drawer local: nada é enviado.
export default function ReleaseDetailsDrawer({ release, exampleLabel, onFechar }) {
  const fields = [
    { label: "Versão", value: release.version.label },
    { label: "Release", value: release.releaseNumberLabel },
    { label: "ID da release", value: release.releaseId, mono: true },
    { label: "Commit (SHA)", value: release.sha, mono: true },
    { label: "Build", value: release.buildLabel, mono: Boolean(release.build) },
    { label: "Baseline do banco", value: release.databaseBaseline.label, mono: true },
    { label: "Origem", value: release.source },
    { label: "Destino", value: release.target },
    { label: "Criada em", value: release.createdAtLabel },
    { label: "Publicada em", value: release.publishedAtLabel },
    { label: "Publicada por", value: release.publishedBy },
    { label: "Release anterior", value: release.previousReleaseLabel },
  ];
  return (
    <ReleaseDrawer
      titulo={release.title}
      descricao="Detalhes da release. Somente leitura — nada é executado a partir daqui."
      onFechar={onFechar}
    >
      <div className="flex flex-wrap items-center gap-2" data-testid="release-details-badges">
        <span className="text-[12px] text-[#6B7280]">Status</span>
        <StatusBadge status={release.status} />
        {release.isExample && <ToneBadge tone="brand" data-testid="example-badge">{exampleLabel}</ToneBadge>}
      </div>

      <section aria-label="Dados da release"><FieldGrid fields={fields} /></section>

      <section aria-label="Migrations da release">
        <h3 className="text-sm font-bold text-[#111111]">Migrations ({release.migrations.count})</h3>
        {release.migrations.count === 0 ? (
          <p className="mt-2 text-[13px] text-[#6B7280]">Nenhuma migration nesta release.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
            {release.migrations.items.map((m) => (
              <li key={m} className="break-all px-3 py-2 font-mono text-[13px] text-[#111111]">{m}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Release notes">
        <h3 className="text-sm font-bold text-[#111111]">Release notes</h3>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-5 text-[#111111]" data-testid="release-notes">{release.releaseNotes}</p>
      </section>
    </ReleaseDrawer>
  );
}
