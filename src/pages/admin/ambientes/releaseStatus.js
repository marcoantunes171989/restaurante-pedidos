import {
  CheckCircle2, Clock, Lock, CircleHelp, History, XCircle, Circle, CircleDot, ShieldCheck,
} from "lucide-react";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE1 — FONTE ÚNICA de status, tons e rótulos da tela
//  Ambientes & Releases. Nenhum componente decide cor/rótulo por conta
//  própria: tudo passa por aqui (VERIFIED → positivo, BLOCKED → atenção…).
//  Vermelho existe SOMENTE para falha real (FAILED) — pendência nunca é erro.
// ════════════════════════════════════════════════════════════

// ── Tons visuais (classes Tailwind com a paleta oficial) ─────
export const TONES = {
  positive: "border-[#B8DFC4] bg-[#F0FDF4] text-[#166534]",
  neutral: "border-[#D1D5DB] bg-[#F9FAFB] text-[#4B5563]",
  muted: "border-dashed border-[#D1D5DB] bg-white text-[#4B5563]",
  attention: "border-[#F9D8AE] bg-[#FFF7ED] text-[#9A5B12]",
  danger: "border-[#F3C1CE] bg-[#FDF0F3] text-[#9F1239]",
  brand: "border-[#AFC2CC] bg-[#F0F6F8] text-[#012E46]",
  // Estado ambíguo/que exige análise humana (PDB-I3-FE2): borda dupla e fundo
  // mais forte que `danger`, para nunca se confundir com uma falha conhecida.
  critical: "border-2 border-[#9F1239] bg-[#FFE4E9] text-[#7F1D1D]",
};

// ── Gates de readiness ───────────────────────────────────────
export const GATE_STATUS = {
  VERIFIED: { label: "Verificado", tone: "positive", Icon: CheckCircle2, order: 5, reasonLabel: "Detalhe: " },
  PENDING: { label: "Pendente", tone: "neutral", Icon: Clock, order: 3, reasonLabel: "Detalhe: " },
  BLOCKED: { label: "Bloqueado", tone: "attention", Icon: Lock, order: 0, reasonLabel: "Por que está bloqueado: " },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp, order: 2, reasonLabel: "Detalhe: " },
  STALE: { label: "Desatualizado", tone: "attention", Icon: History, order: 1, reasonLabel: "Detalhe: " },
  FAILED: { label: "Falhou", tone: "danger", Icon: XCircle, order: -1, reasonLabel: "O que falhou: " },
};

// Status desconhecido/ausente nunca vira "verificado": cai em UNKNOWN.
export const GATE_STATUS_FALLBACK = "UNKNOWN";

export function resolveGateStatus(status) {
  return Object.prototype.hasOwnProperty.call(GATE_STATUS, status) ? status : GATE_STATUS_FALLBACK;
}

// Ordem de exibição das contagens do resumo de readiness.
export const READINESS_SUMMARY_ORDER = ["VERIFIED", "PENDING", "BLOCKED", "UNKNOWN", "STALE", "FAILED"];
// Sempre exibidos no resumo (mesmo com 0); os demais só quando > 0.
export const READINESS_SUMMARY_ALWAYS = ["VERIFIED", "PENDING", "BLOCKED"];
export const READINESS_SUMMARY_LABEL = {
  VERIFIED: ["verificada", "verificadas"],
  PENDING: ["pendente", "pendentes"],
  BLOCKED: ["bloqueada", "bloqueadas"],
  UNKNOWN: ["não verificada", "não verificadas"],
  STALE: ["desatualizada", "desatualizadas"],
  FAILED: ["com falha", "com falha"],
};

// ── Ambientes ────────────────────────────────────────────────
export const ENVIRONMENT_STATUS = {
  PREVIEW_AVAILABLE: { label: "Disponível (prévia)", tone: "brand", Icon: CircleDot },
  ONLINE: { label: "Online", tone: "positive", Icon: CheckCircle2 },
  DEGRADED: { label: "Degradado", tone: "attention", Icon: Clock },
  OFFLINE: { label: "Offline", tone: "danger", Icon: XCircle },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

export const DATABASE_STATUS = {
  BASELINE_AUDITED: { label: "Baseline auditado", tone: "positive", Icon: ShieldCheck },
  BASELINE_UNVERIFIED: { label: "Baseline não verificado", tone: "muted", Icon: CircleHelp },
};

// Selos livres dos cards de ambiente (chave → visual).
export const ENVIRONMENT_BADGES = {
  baseline_audited: { label: "Baseline auditado", tone: "positive", Icon: CheckCircle2 },
  integration_pending: { label: "Integração em preparação", tone: "neutral", Icon: Clock },
  baseline_unverified: { label: "Baseline não verificado", tone: "muted", Icon: CircleHelp },
};

// ── Migrations ───────────────────────────────────────────────
// Classificação do validador de segurança (server/db-migration-safety.js).
// PROHIBITED é POLÍTICA de segurança — nunca apresentado como erro.
export const MIGRATION_CLASSIFICATION = {
  PROHIBITED: {
    label: "Execução automática bloqueada",
    hint: "Política de segurança: esta migration nunca é aplicada automaticamente.",
    tone: "attention",
    Icon: Lock,
  },
  REVIEW_REQUIRED: {
    label: "Revisão obrigatória",
    hint: "Precisa de revisão humana antes de qualquer aplicação.",
    tone: "attention",
    Icon: Lock,
  },
  SAFE_AUTO: {
    label: "Aplicação automática permitida",
    hint: "Classificada como segura para aplicação automática.",
    tone: "positive",
    Icon: CheckCircle2,
  },
};

// Classificação ausente/desconhecida = fail-closed (revisão obrigatória).
export const MIGRATION_CLASSIFICATION_FALLBACK = "REVIEW_REQUIRED";

export function resolveMigrationClassification(classification) {
  return Object.prototype.hasOwnProperty.call(MIGRATION_CLASSIFICATION, classification)
    ? classification
    : MIGRATION_CLASSIFICATION_FALLBACK;
}

export const MIGRATION_STATUS = {
  NOT_APPLIED_HML: { label: "Não aplicada em HML", tone: "neutral", Icon: Clock },
  APPLIED_HML: { label: "Aplicada em HML", tone: "positive", Icon: CheckCircle2 },
  UNKNOWN: { label: "Não verificada", tone: "muted", Icon: CircleHelp },
};

// ── Fluxo HML → PROD ─────────────────────────────────────────
export const FLOW_STEPS = [
  { id: "desenvolvimento", label: "Desenvolvimento" },
  { id: "homologacao", label: "Homologação" },
  { id: "validacao", label: "Validação" },
  { id: "plano", label: "Plano" },
  { id: "backup", label: "Backup" },
  { id: "atualizacao", label: "Atualização" },
  { id: "smoke", label: "Smoke" },
  { id: "producao", label: "Produção" },
];

export const FLOW_STEP_STATE = {
  done: { label: "Concluído", tone: "positive", Icon: CheckCircle2 },
  current: { label: "Em andamento", tone: "brand", Icon: CircleDot },
  pending: { label: "Pendente", tone: "neutral", Icon: Circle },
  blocked: { label: "Bloqueado", tone: "attention", Icon: Lock },
};

export function resolveFlowStepState(state) {
  return Object.prototype.hasOwnProperty.call(FLOW_STEP_STATE, state) ? state : "pending";
}

// ── Estado de conexão (contrato futuro de realtime) ──────────
export const CONNECTION_STATE = {
  preview: "Prévia (dados de exemplo)",
  connecting: "Conectando",
  live: "Ao vivo",
  stale: "Desatualizado",
  offline: "Sem conexão",
};
