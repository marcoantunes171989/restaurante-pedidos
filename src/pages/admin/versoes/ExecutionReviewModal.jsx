import { useId } from "react";
import { ArrowRight, Play } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import ReleaseDrawer from "../ambientes/ReleaseDrawer.jsx";
import { StatusBadge, ToneBadge } from "../ambientes/StatusBadge.jsx";
import FieldGrid from "../manutencao/FieldGrid.jsx";
import { buildExecutePayload, createExecuteFormState } from "./actionForms.js";

function Celula({ rotulo, children, testId }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E5E7EB] p-3" data-cell={testId}>
      <p className="text-[12px] text-[#6B7280]">{rotulo}</p>
      <div className="mt-1 space-y-1 text-sm font-semibold text-[#111111]">{children}</div>
    </div>
  );
}

/**
 * "Revisar execução" — preview SOMENTE LEITURA do que aconteceria ao executar a
 * atualização HML → PROD. "Executar atualização" só habilita com a capability
 * `canExecute` E um handler explícito (`onExecute`) — que nenhuma tela desta
 * etapa passa. O motivo fica sempre visível e associado (aria-describedby).
 */
export default function ExecutionReviewModal({ review, onFechar, onExecute = null }) {
  const resumoId = useId();
  const motivoId = useId();
  const podeExecutar = review.capabilities.canExecute && typeof onExecute === "function";
  const bloqueios = review.readiness.blockers.length;

  const resumo = `Origem ${review.source} → destino ${review.target}. Release alvo ${review.targetSha}. ${review.migrations.label}. `
    + `${review.readiness.pendingCount} de ${review.readiness.total} validações ainda precisam de atenção`
    + `${bloqueios > 0 ? `, ${bloqueios} com bloqueio` : ""}.`;

  const campos = [
    { label: "Versão / release", value: review.releaseLabel },
    { label: "Release alvo (SHA)", value: review.targetSha, mono: true },
    { label: "Aprovação", value: review.approval },
    { label: "Migrations", value: review.migrations.label },
  ];

  return (
    <ReleaseDrawer
      variante="modal"
      titulo={review.text.title}
      descricao="Somente leitura — nada é executado."
      descritoPor={resumoId}
      onFechar={onFechar}
      rodape={(
        <div className="space-y-2">
          <p id={motivoId} className="text-[12px] leading-4 text-[#4B5563]" data-testid="execute-reason">{review.capabilities.executeHelp}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <PrimeButton variante="ghost" className="min-h-11" onClick={onFechar}>Fechar</PrimeButton>
            <PrimeButton
              className="min-h-11"
              disabled={!podeExecutar}
              aria-describedby={podeExecutar ? undefined : motivoId}
              onClick={podeExecutar ? () => onExecute(buildExecutePayload(createExecuteFormState(review))) : undefined}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Executar atualização
            </PrimeButton>
          </div>
        </div>
      )}
    >
      <div className="space-y-2">
        <p className="text-[13px] leading-5 text-[#111111]">{review.text.intro}</p>
        <p id={resumoId} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-[13px] leading-5 text-[#111111]" data-testid="execution-summary">
          {resumo}
        </p>
        {review.isPreview && <ToneBadge tone="brand" data-testid="review-preview-badge">Prévia — plano ainda não criado</ToneBadge>}
      </div>

      <section aria-label="Origem e destino">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#111111]" data-testid="review-flow">
          <span>{review.source}</span>
          <ArrowRight className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
          <span>{review.target}</span>
        </div>
        <div className="mt-3"><FieldGrid fields={campos} /></div>
      </section>

      <section aria-label="Validações (readiness)" data-testid="review-readiness">
        <h3 className="text-sm font-bold text-[#111111]">Validações</h3>
        <p className="mt-1 text-[13px] leading-5 text-[#4B5563]">{review.readiness.headline}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {review.readiness.summaryItems.map((i) => (
            <ToneBadge key={i.status} tone={i.tone}>{i.count} {i.label}</ToneBadge>
          ))}
        </div>
        {bloqueios > 0 && (
          <ul className="mt-3 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]" aria-label="Bloqueadores" data-testid="review-blockers">
            {review.readiness.blockers.map((g) => (
              <li key={g.id} className="space-y-1.5 px-3 py-2.5" data-blocker={g.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#111111]">{g.title}</span>
                  <StatusBadge status={g.status} />
                </div>
                {g.reason && <p className="text-[13px] leading-5 text-[#4B5563]">{g.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Proteções e manutenção">
        <h3 className="text-sm font-bold text-[#111111]">Proteções e manutenção</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Celula rotulo="Backup" testId="backup"><StatusBadge status={review.backup.status} /></Celula>
          <Celula rotulo="Sessões ativas" testId="sessoes">
            <StatusBadge status={review.sessions.status} />
            <p className="text-[12px] font-normal text-[#6B7280]">{review.sessions.valueLabel}</p>
          </Celula>
          <Celula rotulo="Write fence" testId="write-fence">
            <StatusBadge status={review.writeFence.status} />
            {review.writeFence.reason && <p className="text-[12px] font-normal text-[#6B7280]">{review.writeFence.reason}</p>}
          </Celula>
          <Celula rotulo="Manutenção" testId="manutencao">
            <p>{review.maintenance.phaseLabel}</p>
            <StatusBadge status={review.maintenance.execution} />
          </Celula>
        </div>
      </section>

      <section aria-label="Migrations da atualização" data-testid="review-migrations">
        <h3 className="text-sm font-bold text-[#111111]">Migrations ({review.migrations.count})</h3>
        {review.migrations.isEmpty ? (
          <p className="mt-2 text-[13px] text-[#6B7280]">Nenhuma migration em preparação.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
            {review.migrations.items.map((m) => (
              <li key={m.key} className="space-y-1.5 px-3 py-2.5">
                <p className="break-all font-mono text-[13px] font-semibold text-[#111111]"><span className="text-[#6B7280]">{m.order}.</span> {m.filename}</p>
                <StatusBadge status={m.classification} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ReleaseDrawer>
  );
}
