import { useState } from "react";
import { Eye, Undo2 } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import PreviewNotice from "../PreviewNotice.jsx";
import { EnvironmentsError } from "../ambientes/PageStates.jsx";
import { StatusBadge, ToneBadge } from "../ambientes/StatusBadge.jsx";
import { ProductVersionCard, VersionPolicyCard } from "./ProductVersionCard.jsx";
import ReleaseOverlays from "./ReleaseOverlays.jsx";
import { buildReversalCandidates } from "./versionViewModels.js";

function Dado({ rotulo, children, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-[#6B7280]">{rotulo}</dt>
      <dd className={`mt-0.5 break-words text-[13px] font-semibold text-[#111111] ${mono ? "font-mono tabular-nums" : ""}`}>{children}</dd>
    </div>
  );
}

// Uma release: card em qualquer largura (rótulos sempre visíveis), com os dados
// em 2 colunas no celular e 4 a partir de md — nunca overflow horizontal.
function ReleaseRow({ release, podeAvaliar, onDetalhes, onAvaliar }) {
  return (
    <li className="rounded-xl border border-[#E5E7EB] bg-white p-3.5 sm:p-4" data-release={release.releaseId} data-status={release.status.key}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-bold text-[#111111]">{release.title}</h4>
        <StatusBadge status={release.status} />
        {release.isExample && <ToneBadge tone="brand" data-testid="example-badge">Exemplo</ToneBadge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-4">
        <Dado rotulo="Commit" mono>{release.shaShort}</Dado>
        <Dado rotulo="Banco (baseline)" mono>{release.databaseBaseline.label}</Dado>
        <Dado rotulo="Publicada em">{release.publishedAtLabel}</Dado>
        <Dado rotulo="Migrations">{release.migrations.label}</Dado>
      </dl>
      <p className="mt-2.5 line-clamp-2 text-[13px] leading-5 text-[#4B5563]" data-testid="release-notes-excerpt">{release.releaseNotes}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <PrimeButton variante="ghost" className="min-h-11" onClick={onDetalhes} aria-label={`Ver detalhes de ${release.title}`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ver detalhes
        </PrimeButton>
        <PrimeButton variante="ghost" className="min-h-11" disabled={!podeAvaliar} onClick={onAvaliar} aria-label={`Avaliar reversão de ${release.title}`}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Avaliar reversão
        </PrimeButton>
      </div>
    </li>
  );
}

function VersionGroup({ group, versions, onDetalhes, onAvaliar }) {
  const podeAvaliarGeral = versions.capabilities.canEvaluateReversal;
  return (
    <section className="space-y-2.5" aria-label={`Versão ${group.version.label}`} data-version={group.version.raw ?? ""}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-base font-bold text-[#012E46]">{group.version.label}</h3>
        <StatusBadge status={group.status} />
        <span className="text-[13px] text-[#6B7280]">{group.releaseCountLabel}</span>
      </div>
      <ul className="space-y-2.5">
        {group.releases.map((r) => (
          <ReleaseRow
            key={r.key}
            release={r}
            podeAvaliar={podeAvaliarGeral && buildReversalCandidates(versions.releases, r.releaseId).length > 0}
            onDetalhes={() => onDetalhes(r.releaseId)}
            onAvaliar={() => onAvaliar(r.releaseId)}
          />
        ))}
      </ul>
    </section>
  );
}

// Aba "Versões & Releases": versão do produto, modelo de versionamento e a
// lista de releases agrupadas por versão. Puramente apresentacional.
export default function VersionsReleasesTab({ versions, onRetry = null }) {
  const [overlay, setOverlay] = useState(null);
  const fechar = () => setOverlay(null);

  if (versions.state === "loading") {
    return <p role="status" className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-10 text-center text-sm text-[#6B7280]" data-state="loading">Carregando versões e releases…</p>;
  }
  if (versions.state === "error") return <EnvironmentsError message={versions.errorMessage} onRetry={onRetry} />;

  const { releases } = versions;
  return (
    <div className="space-y-5" data-state="ready" data-tab="versoes-releases" data-source={versions.source.kind}>
      {versions.source.isPreview && (
        <PreviewNotice label={versions.source.label}>
          {" · Interface em integração. Os registros abaixo são de exemplo e nenhuma ação é executada por esta tela."}
        </PreviewNotice>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-start">
        <ProductVersionCard productVersion={versions.productVersion} />
        <div className="xl:col-span-2"><VersionPolicyCard policy={versions.productVersion.policy} /></div>
      </div>

      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Estados de uma release" data-testid="status-legend">
        <h2 className="text-[15px] font-bold text-[#012E46]">Estados de uma release</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {versions.productVersion.policy.statuses.map((s) => (
            <li key={s.key} data-status-legend={s.key}><StatusBadge status={s} /></li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Releases" data-testid="releases-section">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold text-[#012E46]">Releases</h2>
          {releases.isExample && <ToneBadge tone="brand" data-testid="example-section-badge">{releases.exampleLabel}</ToneBadge>}
        </div>
        {releases.isExample && <p className="mt-1 text-[13px] leading-5 text-[#6B7280]" data-testid="example-notice">{releases.exampleNotice}</p>}

        {releases.isEmpty ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-10 text-center" data-testid="releases-empty">
            <p className="text-sm font-semibold text-[#111111]">{releases.emptyTitle}</p>
            <p className="mt-1 text-[13px] text-[#6B7280]">{releases.emptyText}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {releases.groups.map((g) => (
              <VersionGroup
                key={g.key}
                group={g}
                versions={versions}
                onDetalhes={(releaseId) => setOverlay({ kind: "details", releaseId })}
                onAvaliar={(releaseId) => setOverlay({ kind: "reversal", releaseId })}
              />
            ))}
          </div>
        )}
      </section>

      <ReleaseOverlays overlay={overlay} versions={versions} onFechar={fechar} />
    </div>
  );
}
