import { useState } from "react";
import { CalendarClock, ClipboardCheck, Eye, ListChecks, Play } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import ReleaseDrawer from "./ReleaseDrawer.jsx";
import { ReadinessItem } from "./ReadinessPanel.jsx";
import { PlanFields } from "./ReleasePlanCard.jsx";
import { StatusBadge, ToneBadge } from "./StatusBadge.jsx";
import SafetySummary from "./SafetySummary.jsx";
import ExecutionReviewModal from "../versoes/ExecutionReviewModal.jsx";
import ScheduleModal from "../versoes/ScheduleModal.jsx";

function PendingDrawer({ readiness, onFechar }) {
  const bloqueadores = readiness.blockers;
  const outras = readiness.otherPending;
  return (
    <ReleaseDrawer
      titulo="Pendências da atualização"
      descricao={`${readiness.pending.length} de ${readiness.total} validações ainda não foram verificadas.`}
      onFechar={onFechar}
    >
      {readiness.pending.length === 0 && (
        <p className="rounded-xl border border-dashed border-[#D1D5DB] px-3 py-8 text-center text-[13px] text-[#6B7280]">
          Nenhuma pendência registrada.
        </p>
      )}
      {bloqueadores.length > 0 && (
        <section aria-label="Bloqueadores">
          <h3 className="text-sm font-bold text-[#111111]">Bloqueadores</h3>
          <ul className="mt-1">{bloqueadores.map((g) => <ReadinessItem key={g.id} gate={g} defaultOpen />)}</ul>
        </section>
      )}
      {outras.length > 0 && (
        <section aria-label="Outras pendências">
          <h3 className="text-sm font-bold text-[#111111]">Outras pendências</h3>
          <ul className="mt-1">{outras.map((g) => <ReadinessItem key={g.id} gate={g} defaultOpen />)}</ul>
        </section>
      )}
    </ReleaseDrawer>
  );
}

function PlanDrawer({ plan, migrations, flow, safety, onFechar }) {
  return (
    <ReleaseDrawer
      titulo="Plano de atualização"
      descricao="Detalhes do que será atualizado e do fluxo esperado."
      onFechar={onFechar}
    >
      {plan.isPreview && (
        <p className="rounded-xl border border-[#AFC2CC] bg-[#F0F6F8] px-3 py-2 text-[13px] leading-5 text-[#012E46]">
          Prévia: este plano ainda não foi criado. Nada é executado a partir desta tela.
        </p>
      )}
      <section aria-label="Dados do plano"><PlanFields plan={plan} /></section>

      <section aria-label="Migrations do plano">
        <h3 className="text-sm font-bold text-[#111111]">Migrations do plano ({migrations.count})</h3>
        {migrations.isEmpty ? (
          <p className="mt-2 text-[13px] text-[#6B7280]">Nenhuma migration em preparação.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
            {migrations.items.map((m) => (
              <li key={m.key} className="space-y-2 px-3 py-3">
                <p className="break-all font-mono text-[13px] font-semibold text-[#111111]">
                  <span className="text-[#6B7280]">{m.order}.</span> {m.filename}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={m.classification} />
                  <StatusBadge status={m.status} />
                </div>
                {m.identity.hasIdentity && (
                  <p className="font-mono text-[12px] text-[#4B5563]">blob {m.identity.gitBlobShort} · sha {m.identity.sha256Short}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Fluxo esperado">
        <h3 className="text-sm font-bold text-[#111111]">Fluxo esperado</h3>
        <ol className="mt-2 space-y-1.5">
          {flow.steps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[#111111]"><span className="text-[#6B7280]">{s.index}.</span> {s.label}</span>
              <ToneBadge tone={s.state.tone} Icon={s.state.Icon}>{s.state.label}</ToneBadge>
            </li>
          ))}
        </ol>
      </section>

      <SafetySummary safety={safety} />
    </ReleaseDrawer>
  );
}

/**
 * Área de ações. A autoridade vem SEMPRE de `capabilities` (fail-closed):
 * Executar só habilita com capability `true` E um handler explícito
 * (`onExecute`). A tela desta etapa não passa handler algum, então permanece
 * indisponível mesmo que a capability venha `true`.
 *
 * PDB-I3-FE3 — duas ações NÃO mutáveis abrem prévias locais (só leitura):
 *  • "Revisar execução"    → ExecutionReviewModal (o que aconteceria ao executar);
 *  • "Agendar atualização" → ScheduleModal (formulário de prévia; nada é enviado).
 * Ambas dependem de `canViewPlan` e das props `executionReview`/`scheduleForm`
 * (view-models). Sem `scheduleForm`, "Agendar" mantém o comportamento anterior:
 * só habilita com capability + `onSchedule`.
 */
export default function ReleaseActions({
  capabilities, readiness, plan, migrations, flow, safety, onExecute = null, onSchedule = null,
  executionReview = null, scheduleForm = null,
}) {
  const [drawer, setDrawer] = useState(null); // null | "plan" | "pending" | "review" | "schedule"
  const fechar = () => setDrawer(null);

  const podeExecutar = capabilities.canExecute && typeof onExecute === "function";
  const previaDeAgenda = scheduleForm !== null;
  const podeAgendar = previaDeAgenda
    ? capabilities.canViewPlan
    : capabilities.canSchedule && typeof onSchedule === "function";
  const podeRevisar = executionReview !== null && capabilities.canViewPlan;
  const ajudaId = "acoes-ajuda";

  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Ações da atualização">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#012E46]">Ações</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
            {readiness.pending.length > 0
              ? `${readiness.pending.length} de ${readiness.total} validações ainda precisam de atenção.`
              : "Todas as validações foram verificadas."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap">
          <PrimeButton variante="ghost" className="min-h-11" disabled={!capabilities.canViewPlan} onClick={() => setDrawer("plan")}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Ver plano
          </PrimeButton>
          <PrimeButton variante="ghost" className="min-h-11" disabled={!capabilities.canViewReadiness} onClick={() => setDrawer("pending")}>
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Ver pendências
          </PrimeButton>
          {executionReview !== null && (
            <PrimeButton variante="ghost" className="min-h-11" disabled={!podeRevisar} onClick={() => setDrawer("review")}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Revisar execução
            </PrimeButton>
          )}
          <PrimeButton
            variante="ghost"
            className="min-h-11"
            disabled={!podeAgendar}
            aria-describedby={podeAgendar ? undefined : ajudaId}
            onClick={podeAgendar ? (previaDeAgenda ? () => setDrawer("schedule") : onSchedule) : undefined}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Agendar atualização
          </PrimeButton>
          <PrimeButton
            className="min-h-11"
            disabled={!podeExecutar}
            aria-describedby={podeExecutar ? undefined : ajudaId}
            onClick={podeExecutar ? onExecute : undefined}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Executar atualização
          </PrimeButton>
        </div>
      </div>
      {(!podeExecutar || !podeAgendar) && (
        <p id={ajudaId} className="mt-3 text-[13px] leading-5 text-[#4B5563]">{capabilities.executeHelp}</p>
      )}

      {drawer === "pending" && <PendingDrawer readiness={readiness} onFechar={fechar} />}
      {drawer === "review" && executionReview && <ExecutionReviewModal review={executionReview} onFechar={fechar} />}
      {drawer === "schedule" && scheduleForm && <ScheduleModal form={scheduleForm} onFechar={fechar} />}
      {drawer === "plan" && <PlanDrawer plan={plan} migrations={migrations} flow={flow} safety={safety} onFechar={fechar} />}
    </section>
  );
}
