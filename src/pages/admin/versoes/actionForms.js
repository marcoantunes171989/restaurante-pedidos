// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — Modelos de formulário de Executar / Agendar / Reverter.
//
//  Camada SEPARADA da UI: define campos, estado inicial, validação LOCAL e o
//  payload NORMALIZADO que o backend receberá no futuro. Os componentes só
//  desenham a partir de FIELDS/estado; nenhum payload é montado em JSX.
//
//  Nesta etapa as funções `build*Payload` NÃO são chamadas por nenhuma UI — os
//  botões finais são desabilitados (capabilities = false) e não há handler nem
//  rede. Elas existem para fixar o contrato e são cobertas por testes.
//  Validação aqui é só de formulário (campos preenchidos/formato); regras de
//  negócio (janela, aprovação, compatibilidade) pertencem ao backend.
// ════════════════════════════════════════════════════════════

const trim = (v) => (typeof v === "string" ? v.trim() : "");

export const NOTES_MAX_LENGTH = 500;
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

export const DISPLAY_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
];
export const SCHEDULE_TARGET_ENVIRONMENTS = [
  { value: "producao", label: "Produção" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Agendamento ──────────────────────────────────────────────
export const SCHEDULE_FIELDS = Object.freeze({
  date: { id: "date", label: "Data", type: "date", required: true },
  time: { id: "time", label: "Horário", type: "time", required: true },
  timezone: { id: "timezone", label: "Fuso horário (exibição)", type: "select", required: true },
  releaseId: { id: "releaseId", label: "Release", type: "select", required: true },
  targetEnvironment: { id: "targetEnvironment", label: "Ambiente de destino", type: "select", required: true },
  notes: { id: "notes", label: "Observações", type: "textarea", required: false, maxLength: NOTES_MAX_LENGTH },
  approvalAck: {
    id: "approvalAck",
    label: "Estou ciente de que a atualização depende de aprovação humana e das validações obrigatórias.",
    type: "checkbox",
    required: true,
  },
});
export const SCHEDULE_FIELD_ORDER = ["date", "time", "timezone", "releaseId", "targetEnvironment", "notes", "approvalAck"];

export function createScheduleFormState(overrides = {}) {
  return {
    date: "",
    time: "",
    timezone: DISPLAY_TIMEZONES[0].value,
    releaseId: "",
    targetEnvironment: SCHEDULE_TARGET_ENVIRONMENTS[0].value,
    notes: "",
    approvalAck: false,
    ...overrides,
  };
}

/** → { errors: { [campo]: mensagem }, isValid } — só forma dos campos. */
export function validateScheduleForm(state) {
  const s = { ...createScheduleFormState(), ...(state || {}) };
  const errors = {};
  const date = trim(s.date);
  const time = trim(s.time);
  if (!date) errors.date = "Informe a data do agendamento.";
  else if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.date = "Informe uma data válida.";
  if (!time) errors.time = "Informe o horário do agendamento.";
  else if (!TIME_PATTERN.test(time)) errors.time = "Informe um horário válido (HH:MM).";
  if (!DISPLAY_TIMEZONES.some((t) => t.value === s.timezone)) errors.timezone = "Selecione o fuso horário.";
  if (!trim(s.releaseId)) errors.releaseId = "Selecione a release.";
  if (!SCHEDULE_TARGET_ENVIRONMENTS.some((e) => e.value === s.targetEnvironment)) errors.targetEnvironment = "Selecione o ambiente de destino.";
  if (String(s.notes ?? "").length > NOTES_MAX_LENGTH) errors.notes = `Use no máximo ${NOTES_MAX_LENGTH} caracteres.`;
  if (s.approvalAck !== true) errors.approvalAck = "Confirme a ciência da aprovação obrigatória.";
  return { errors, isValid: Object.keys(errors).length === 0 };
}

/** Payload normalizado (contrato futuro). null se o formulário for inválido. */
export function buildSchedulePayload(state) {
  const { isValid } = validateScheduleForm(state);
  if (!isValid) return null;
  const s = { ...createScheduleFormState(), ...state };
  return {
    scheduledLocalDateTime: `${trim(s.date)}T${trim(s.time)}`,
    timezone: s.timezone,
    releaseId: trim(s.releaseId),
    targetEnvironment: s.targetEnvironment,
    notes: trim(s.notes) || null,
    approvalAcknowledged: true,
  };
}

// ── Execução (revisão) ───────────────────────────────────────
export function createExecuteFormState(review) {
  return {
    planId: review?.planId ?? null,
    sourceEnvironment: review?.sourceEnvironmentId ?? null,
    targetEnvironment: review?.targetEnvironmentId ?? null,
    targetSha: review?.targetShaRaw ?? null,
    releaseId: review?.release?.releaseId ?? null,
  };
}

export function buildExecutePayload(state) {
  const s = state || {};
  if (!s.sourceEnvironment || !s.targetEnvironment || !s.targetSha) return null;
  return {
    planId: s.planId || null,
    sourceEnvironment: s.sourceEnvironment,
    targetEnvironment: s.targetEnvironment,
    targetSha: s.targetSha,
    releaseId: s.releaseId || null,
  };
}

// ── Reversão ─────────────────────────────────────────────────
export const REVERSAL_FIELDS = Object.freeze({
  targetReleaseId: { id: "targetReleaseId", label: "Release de destino", type: "select", required: true },
  reason: { id: "reason", label: "Motivo da reversão", type: "textarea", required: true, minLength: REASON_MIN_LENGTH, maxLength: REASON_MAX_LENGTH },
  dataAck: {
    id: "dataAck",
    label: "Estou ciente de que voltar a aplicação não restaura o banco de dados.",
    type: "checkbox",
    required: true,
  },
});
export const REVERSAL_FIELD_ORDER = ["targetReleaseId", "reason", "dataAck"];

export function createReversalFormState(overrides = {}) {
  return { targetReleaseId: "", reason: "", dataAck: false, ...overrides };
}

export function validateReversalForm(state) {
  const s = { ...createReversalFormState(), ...(state || {}) };
  const errors = {};
  if (!trim(s.targetReleaseId)) errors.targetReleaseId = "Selecione a release de destino.";
  const reason = trim(s.reason);
  if (!reason) errors.reason = "Descreva o motivo da reversão.";
  else if (reason.length < REASON_MIN_LENGTH) errors.reason = `Descreva o motivo com pelo menos ${REASON_MIN_LENGTH} caracteres.`;
  else if (reason.length > REASON_MAX_LENGTH) errors.reason = `Use no máximo ${REASON_MAX_LENGTH} caracteres.`;
  if (s.dataAck !== true) errors.dataAck = "Confirme a ciência de que o banco não é restaurado.";
  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function buildReversalPayload(sourceReleaseId, state) {
  const { isValid } = validateReversalForm(state);
  if (!isValid || !trim(sourceReleaseId)) return null;
  const s = { ...createReversalFormState(), ...state };
  return {
    sourceReleaseId: trim(sourceReleaseId),
    targetReleaseId: trim(s.targetReleaseId),
    reason: trim(s.reason),
    dataAcknowledged: true,
  };
}
