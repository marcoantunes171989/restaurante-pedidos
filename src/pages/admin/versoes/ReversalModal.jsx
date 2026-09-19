import { useId, useMemo, useState } from "react";
import { Database, Info, TriangleAlert, Undo2 } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import ReleaseDrawer from "../ambientes/ReleaseDrawer.jsx";
import { StatusBadge, ToneBadge } from "../ambientes/StatusBadge.jsx";
import { TONES } from "../ambientes/releaseStatus.js";
import { CheckboxField, SelectField, TextAreaField } from "./FormFields.jsx";
import {
  REVERSAL_FIELDS,
  buildReversalPayload,
  createReversalFormState,
  validateReversalForm,
} from "./actionForms.js";
import { EXAMPLE_LABEL } from "./versionStatus.js";
import { buildReversalViewModel } from "./versionViewModels.js";

function Linha({ rotulo, children, testId }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3" data-row={testId}>
      <dt className="text-[12px] text-[#6B7280]">{rotulo}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold text-[#111111]">{children}</dd>
    </div>
  );
}

function Conceito({ Icon, titulo, texto }) {
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3" aria-label={titulo}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#012E46]">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {titulo}
      </h3>
      <p className="mt-1 text-[13px] leading-5 text-[#111111]">{texto}</p>
    </section>
  );
}

/**
 * "Avaliar reversão" — modal de ANÁLISE. Nada é executado: a release de destino
 * só é escolhida entre as do snapshot (exemplo hoje), a avaliação é derivada
 * localmente e o botão final ("Executar reversão") só habilita com a capability
 * `canExecuteReversal` E um handler explícito (`onExecute`) — que nenhuma tela
 * desta etapa passa. Não altera versão local, não roda timer, não mostra
 * "reversão concluída".
 */
export default function ReversalModal({ versions, sourceReleaseId, onFechar, onExecute = null }) {
  const resumoId = useId();
  const motivoId = useId();
  const [form, setForm] = useState(() => createReversalFormState());
  const [tocados, setTocados] = useState({});

  const vm = useMemo(
    () => buildReversalViewModel({
      releases: versions.releases,
      sourceReleaseId,
      targetReleaseId: form.targetReleaseId,
      reason: form.reason,
      capabilities: versions.capabilities,
    }),
    [versions.releases, versions.capabilities, sourceReleaseId, form.targetReleaseId, form.reason],
  );
  const { errors } = validateReversalForm(form);
  const erroDe = (campo) => (tocados[campo] ? errors[campo] || null : null);
  const mudar = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const tocar = (campo) => () => setTocados((t) => ({ ...t, [campo]: true }));

  if (!vm.found) {
    return (
      <ReleaseDrawer variante="modal" titulo="Avaliar reversão" onFechar={onFechar}>
        <p className="text-[13px] text-[#4B5563]">Release de origem não encontrada.</p>
      </ReleaseDrawer>
    );
  }

  const { text, sourceRelease: origem, targetRelease: destino } = vm;
  const podeExecutar = vm.capabilities.canExecuteReversal && typeof onExecute === "function";
  const opcoes = vm.candidates.map((r) => ({ value: r.releaseId, label: `${r.title} — ${r.status.label}` }));

  return (
    <ReleaseDrawer
      variante="modal"
      titulo={`${text.title} — ${origem.title}`}
      descricao="Análise local de compatibilidade. Nenhuma alteração é feita."
      descritoPor={resumoId}
      onFechar={onFechar}
      rodape={(
        <div className="space-y-2">
          <p id={motivoId} className="text-[12px] leading-4 text-[#4B5563]" data-testid="reversal-execute-reason">{vm.capabilities.executeHelp}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <PrimeButton variante="ghost" className="min-h-11" onClick={onFechar}>Fechar</PrimeButton>
            <PrimeButton
              className="min-h-11"
              disabled={!podeExecutar}
              aria-describedby={podeExecutar ? undefined : motivoId}
              onClick={podeExecutar ? () => onExecute(buildReversalPayload(sourceReleaseId, form)) : undefined}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Executar reversão
            </PrimeButton>
          </div>
        </div>
      )}
    >
      <div id={resumoId} className="space-y-2" data-testid="reversal-summary-text">
        <p className="text-[13px] leading-5 text-[#111111]">{text.intro}</p>
        <div className="flex flex-wrap items-center gap-2">
          {vm.isExample && <ToneBadge tone="brand" data-testid="example-badge">{EXAMPLE_LABEL}</ToneBadge>}
          <span className="text-[12px] text-[#6B7280]">{text.evaluationNote}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="reversal-concepts">
        <Conceito Icon={Undo2} titulo={text.appTitle} texto={text.appText} />
        <Conceito Icon={Database} titulo={text.dbTitle} texto={text.dbText} />
      </div>

      <div role="note" className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-5 ${TONES.brand}`} data-testid="data-preservation">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0">{text.dataPreservation}</p>
      </div>

      {!vm.hasCandidates ? (
        <p className="rounded-xl border border-dashed border-[#D1D5DB] px-3 py-6 text-center text-[13px] text-[#6B7280]" data-testid="reversal-no-candidates">
          Não há release anterior publicada para servir de destino.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Dados da avaliação">
          <SelectField
            label={REVERSAL_FIELDS.targetReleaseId.label} name="targetReleaseId" obrigatorio
            value={form.targetReleaseId} onChange={mudar("targetReleaseId")} onBlur={tocar("targetReleaseId")}
            options={opcoes} placeholder="Selecione a release de destino"
            ajuda="Somente releases já publicadas e anteriores à origem."
            erro={erroDe("targetReleaseId")}
          />
          <TextAreaField
            label={REVERSAL_FIELDS.reason.label} name="reason" obrigatorio
            value={form.reason} onChange={mudar("reason")} onBlur={tocar("reason")}
            maxLength={REVERSAL_FIELDS.reason.maxLength} erro={erroDe("reason")}
            ajuda="Fica apenas nesta análise; nada é enviado."
          />
          <CheckboxField
            label={REVERSAL_FIELDS.dataAck.label} name="dataAck" obrigatorio
            checked={form.dataAck} onChange={(v) => { mudar("dataAck")(v); tocar("dataAck")(); }} onBlur={tocar("dataAck")}
            erro={erroDe("dataAck")}
          />
        </form>
      )}

      <section aria-label="Resumo da avaliação">
        <h3 className="text-sm font-bold text-[#111111]">Resumo da avaliação</h3>
        <dl className="mt-2 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]" data-testid="reversal-summary">
          <Linha rotulo="Origem" testId="origem">
            <span className="inline-flex flex-wrap items-center gap-2">{origem.title}<StatusBadge status={origem.status} /></span>
          </Linha>
          <Linha rotulo="Destino" testId="destino">
            {destino
              ? <span className="inline-flex flex-wrap items-center gap-2">{destino.title}<StatusBadge status={destino.status} /></span>
              : <span className="font-normal text-[#6B7280]">Selecione uma release de destino.</span>}
          </Linha>
          <Linha rotulo="Código" testId="codigo">
            <span className="font-mono">{destino ? `${origem.shaShort} → ${destino.shaShort}` : "—"}</span>
          </Linha>
          <Linha rotulo="Banco" testId="banco">
            <span className="font-mono">{destino ? `baseline ${origem.databaseBaseline.label} → ${destino.databaseBaseline.label}` : "—"}</span>
          </Linha>
          <Linha rotulo="Compatibilidade" testId="compatibilidade">
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge status={vm.compatibility} />
              <StatusBadge status={vm.schemaCompatibility} />
            </span>
          </Linha>
          <Linha rotulo="Risco de dados" testId="risco-dados">
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge status={vm.dataRisk} />
            </span>
          </Linha>
          <Linha rotulo="Backup" testId="backup">
            {vm.backupRequirement ? <StatusBadge status={vm.backupRequirement} /> : <span className="font-normal text-[#6B7280]">—</span>}
          </Linha>
          <Linha rotulo="Recuperação do banco" testId="recuperacao"><StatusBadge status={vm.recoveryRequirement} /></Linha>
          <Linha rotulo="Aprovação" testId="aprovacao"><StatusBadge status={vm.approval} /></Linha>
          <Linha rotulo="Motivo" testId="motivo">
            {vm.reason.trim() ? vm.reason.trim() : <span className="font-normal text-[#6B7280]">Não informado</span>}
          </Linha>
        </dl>
      </section>

      <section aria-label="Alertas de risco" className="space-y-2" data-testid="reversal-alerts">
        {vm.alerts.map((a) => {
          const informativo = a.severity === "Informativo";
          const Icone = informativo ? Info : TriangleAlert;
          return (
            <div
              key={a.id}
              role={informativo ? "note" : "alert"}
              data-alert={a.id}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-5 ${TONES[a.tone]}`}
            >
              <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0"><b className="font-semibold">{a.severity}: {a.title}.</b> {a.text}</p>
            </div>
          );
        })}
      </section>
    </ReleaseDrawer>
  );
}
