import { useState } from "react";
import { CornerDownRight, Eye, Undo2 } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import PreviewNotice from "../PreviewNotice.jsx";
import { EnvironmentsError } from "../ambientes/PageStates.jsx";
import { StatusBadge, ToneBadge } from "../ambientes/StatusBadge.jsx";
import ReleaseOverlays from "./ReleaseOverlays.jsx";

function Meta({ rotulo, children, mono = false }) {
  return (
    <span className="min-w-0 text-[12px] text-[#6B7280]">
      {rotulo}: <span className={`font-semibold text-[#111111] ${mono ? "font-mono" : ""}`}>{children}</span>
    </span>
  );
}

// Um fato do histórico. Somente leitura: não há edição nem exclusão — o
// histórico é uma sequência imutável.
function HistoryEntry({ entry, podeAvaliar, onDetalhes, onAvaliar }) {
  const { Icon } = entry.type;
  return (
    <li className="relative pl-6" data-entry={entry.id} data-type={entry.type.key}>
      <span className="absolute left-0 top-3.5 h-px w-4 bg-[#D1D5DB]" aria-hidden="true" />
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#111111]">
            <Icon className="h-4 w-4 shrink-0 text-[#012E46]" aria-hidden="true" />
            {entry.releaseNumberLabel || entry.type.label}
          </span>
          {entry.releaseNumberLabel && <ToneBadge tone={entry.type.tone}>{entry.type.label}</ToneBadge>}
          {entry.status && <StatusBadge status={entry.status} />}
          {entry.isExample && <ToneBadge tone="brand" data-testid="example-badge">Exemplo</ToneBadge>}
        </div>

        {entry.rollbackOf && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] font-semibold leading-5 text-[#9A5B12]" data-testid="rollback-relation">
            <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {entry.rollbackOf.label}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Meta rotulo="Registrado em">{entry.createdAtLabel}</Meta>
          <Meta rotulo="Ator">{entry.actor}</Meta>
          {entry.durationLabel && <Meta rotulo="Duração">{entry.durationLabel}</Meta>}
          {entry.sha !== "—" && <Meta rotulo="Commit" mono>{entry.shaShort}</Meta>}
          {entry.databaseBaselineLabel !== "Desconhecido" && <Meta rotulo="Banco" mono>{entry.databaseBaselineLabel}</Meta>}
          {entry.target !== "—" && <Meta rotulo="Destino">{entry.target}</Meta>}
        </div>
        {entry.previousReleaseLabel && <p className="mt-1 text-[12px] text-[#6B7280]">Release anterior: {entry.previousReleaseLabel}</p>}
        {entry.notes && <p className="mt-1.5 text-[13px] leading-5 text-[#4B5563]">{entry.notes}</p>}

        {entry.hasRelease && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <PrimeButton variante="ghost" className="min-h-11" onClick={onDetalhes} aria-label={`Ver release de ${entry.version.label} ${entry.releaseNumberLabel}`}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              Ver release
            </PrimeButton>
            <PrimeButton variante="ghost" className="min-h-11" disabled={!podeAvaliar} onClick={onAvaliar} aria-label={`Avaliar reversão de ${entry.version.label} ${entry.releaseNumberLabel}`}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Avaliar reversão
            </PrimeButton>
          </div>
        )}
      </div>
    </li>
  );
}

// Aba "Histórico": versões → releases → publicações, falhas e reversões, do
// mais recente ao mais antigo, agrupado por versão. Somente leitura.
export default function HistoryTab({ versions, onRetry = null }) {
  const [overlay, setOverlay] = useState(null);

  if (versions.state === "loading") {
    return <p role="status" className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-10 text-center text-sm text-[#6B7280]" data-state="loading">Carregando o histórico…</p>;
  }
  if (versions.state === "error") return <EnvironmentsError message={versions.errorMessage} onRetry={onRetry} />;

  const { history } = versions;
  const podeAvaliarGeral = versions.capabilities.canEvaluateReversal;
  return (
    <div className="space-y-5" data-state="ready" data-tab="historico" data-source={versions.source.kind}>
      {versions.source.isPreview && (
        <PreviewNotice label={versions.source.label}>
          {" · Interface em integração. Os registros abaixo são de exemplo e nenhuma ação é executada por esta tela."}
        </PreviewNotice>
      )}

      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Histórico de versões e releases" data-testid="history-section">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold text-[#012E46]">Histórico</h2>
          {history.isExample && <ToneBadge tone="brand" data-testid="example-section-badge">{history.exampleLabel}</ToneBadge>}
        </div>
        <p className="mt-1 text-[13px] leading-5 text-[#6B7280]" data-testid="history-order-note">{history.orderNote}</p>
        {history.isExample && <p className="mt-1 text-[13px] leading-5 text-[#6B7280]" data-testid="example-notice">{history.exampleNotice}</p>}

        {history.isEmpty ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-10 text-center" data-testid="history-empty">
            <p className="text-sm font-semibold text-[#111111]">{history.emptyTitle}</p>
            <p className="mt-1 text-[13px] text-[#6B7280]">{history.emptyText}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {history.groups.map((g) => (
              <section key={g.key} aria-label={`Histórico da versão ${g.version.label}`} data-history-version={g.version.raw ?? ""}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-base font-bold text-[#012E46]">{g.version.label}</h3>
                  <span className="text-[13px] text-[#6B7280]">{g.countLabel}</span>
                </div>
                <ol className="mt-2.5 space-y-2.5 border-l border-[#D1D5DB]" aria-label={`Eventos da versão ${g.version.label}`}>
                  {g.entries.map((e) => (
                    <HistoryEntry
                      key={e.id}
                      entry={e}
                      podeAvaliar={podeAvaliarGeral && e.canEvaluateReversal}
                      onDetalhes={() => setOverlay({ kind: "details", releaseId: e.releaseId })}
                      onAvaliar={() => setOverlay({ kind: "reversal", releaseId: e.releaseId })}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>

      <ReleaseOverlays overlay={overlay} versions={versions} onFechar={() => setOverlay(null)} />
    </div>
  );
}
