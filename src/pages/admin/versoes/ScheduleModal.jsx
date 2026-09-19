import { useId, useState } from "react";
import { CalendarClock } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import ReleaseDrawer from "../ambientes/ReleaseDrawer.jsx";
import { ToneBadge } from "../ambientes/StatusBadge.jsx";
import { PREVIEW_LABEL } from "./versionStatus.js";
import { CheckboxField, InputField, SelectField, TextAreaField } from "./FormFields.jsx";
import {
  DISPLAY_TIMEZONES,
  SCHEDULE_FIELDS,
  SCHEDULE_TARGET_ENVIRONMENTS,
  buildSchedulePayload,
  createScheduleFormState,
  validateScheduleForm,
} from "./actionForms.js";

/**
 * "Agendar atualização" — FORMULÁRIO DE PRÉVIA. Abrir e preencher não é
 * mutação: o estado vive só neste componente e nada é enviado. O botão
 * "Confirmar agendamento" só habilita com a capability `canSchedule` E um
 * handler explícito (`onConfirm`) — que nenhuma tela desta etapa passa.
 * Erros de formulário são locais e acessíveis (role="alert" + aria-describedby);
 * regras de negócio pertencem ao backend.
 */
export default function ScheduleModal({ form, onFechar, onConfirm = null }) {
  const motivoId = useId();
  const [estado, setEstado] = useState(() => createScheduleFormState());
  const [tocados, setTocados] = useState({});

  const { errors } = validateScheduleForm(estado);
  const erroDe = (campo) => (tocados[campo] ? errors[campo] || null : null);
  const mudar = (campo) => (valor) => setEstado((s) => ({ ...s, [campo]: valor }));
  const tocar = (campo) => () => setTocados((t) => ({ ...t, [campo]: true }));
  const podeConfirmar = form.capabilities.canSchedule && typeof onConfirm === "function";
  const F = SCHEDULE_FIELDS;

  return (
    <ReleaseDrawer
      variante="modal"
      titulo={form.text.title}
      descricao="Formulário de prévia — nada é agendado."
      onFechar={onFechar}
      rodape={(
        <div className="space-y-2">
          <p id={motivoId} className="text-[12px] leading-4 text-[#4B5563]" data-testid="schedule-reason">{form.capabilities.confirmHelp}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <PrimeButton variante="ghost" className="min-h-11" onClick={onFechar}>Fechar</PrimeButton>
            <PrimeButton
              className="min-h-11"
              disabled={!podeConfirmar}
              aria-describedby={podeConfirmar ? undefined : motivoId}
              onClick={podeConfirmar ? () => onConfirm(buildSchedulePayload(estado)) : undefined}
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Confirmar agendamento
            </PrimeButton>
          </div>
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone="brand" data-testid="schedule-preview-badge">{PREVIEW_LABEL}</ToneBadge>
        <p className="text-[13px] leading-5 text-[#111111]">{form.text.intro}</p>
      </div>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Dados do agendamento" data-testid="schedule-form">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label={F.date.label} name="date" type="date" obrigatorio
            value={estado.date} onChange={mudar("date")} onBlur={tocar("date")} erro={erroDe("date")}
          />
          <InputField
            label={F.time.label} name="time" type="time" obrigatorio
            value={estado.time} onChange={mudar("time")} onBlur={tocar("time")} erro={erroDe("time")}
          />
        </div>
        <SelectField
          label={F.timezone.label} name="timezone" obrigatorio
          value={estado.timezone} onChange={mudar("timezone")} onBlur={tocar("timezone")}
          options={DISPLAY_TIMEZONES} ajuda="Apenas para exibição do horário." erro={erroDe("timezone")}
        />
        <SelectField
          label={F.releaseId.label} name="releaseId" obrigatorio
          value={estado.releaseId} onChange={mudar("releaseId")} onBlur={tocar("releaseId")}
          options={form.releaseOptions} placeholder="Selecione a release" erro={erroDe("releaseId")}
        />
        <SelectField
          label={F.targetEnvironment.label} name="targetEnvironment" obrigatorio
          value={estado.targetEnvironment} onChange={mudar("targetEnvironment")} onBlur={tocar("targetEnvironment")}
          options={SCHEDULE_TARGET_ENVIRONMENTS} erro={erroDe("targetEnvironment")}
        />
        <TextAreaField
          label={F.notes.label} name="notes" maxLength={F.notes.maxLength}
          value={estado.notes} onChange={mudar("notes")} onBlur={tocar("notes")} erro={erroDe("notes")}
          ajuda={`Opcional. Até ${F.notes.maxLength} caracteres. Fica apenas neste formulário.`}
        />
        <CheckboxField
          label={F.approvalAck.label} name="approvalAck" obrigatorio
          checked={estado.approvalAck} onChange={(v) => { mudar("approvalAck")(v); tocar("approvalAck")(); }} onBlur={tocar("approvalAck")}
          erro={erroDe("approvalAck")}
        />
      </form>
    </ReleaseDrawer>
  );
}
