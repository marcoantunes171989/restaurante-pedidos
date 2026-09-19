import {
  Ban, CalendarClock, Circle, CircleCheck, CircleDot, CircleHelp, CircleX, ClipboardCheck, FilePen,
  History, PackageCheck, PackagePlus, ShieldCheck, Tag, TriangleAlert, Undo2,
} from "lucide-react";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — FONTE ÚNICA de status, tons, rótulos e textos de
//  Versões & Releases / Histórico / Reversão. Segue a convenção do FE1
//  (ambientes/releaseStatus.js) e do FE2 (manutencao/maintenanceStatus.js) e
//  REUSA os tons de `TONES` — nenhum componente decide cor/rótulo sozinho.
//
//  Regras (fail-closed): status desconhecido/ausente cai em "não verificado";
//  vermelho ("danger") só para falha real; "critical" = exige análise humana.
// ════════════════════════════════════════════════════════════

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const resolver = (mapa, valor, fallback) => (has(mapa, valor) ? valor : fallback);

// ── Rótulo da prévia (dados de exemplo) ──────────────────────
export const EXAMPLE_LABEL = "EXEMPLO / PRÉVIA";
export const EXAMPLE_NOTICE = "Registros ilustrativos para demonstração. Não são releases reais e nenhuma ação é executada por esta tela.";
export const PREVIEW_LABEL = "Prévia da funcionalidade";
export const LOAD_ERROR_TEXT = "Não foi possível carregar as versões e releases.";

// ── Versão do produto ────────────────────────────────────────
export const VERSION_NOT_CONFIGURED_TEXT = "Versão do produto ainda não configurada";
export const VERSION_NOT_CONFIGURED_HELP = "Quando uma versão for definida, ela aparecerá aqui no formato MAJOR.MINOR.PATCH.";
export const VERSION_INVALID_TEXT = "Versão inválida";

/** Padrão de versão do produto: MAJOR.MINOR.PATCH (sem quarta casa). */
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const VERSION_SEMANTICS = [
  { part: "MAJOR", example: "2.0.0", text: "Mudança estrutural ou incompatível relevante." },
  { part: "MINOR", example: "1.1.0", text: "Nova funcionalidade compatível." },
  { part: "PATCH", example: "1.1.1", text: "Correção ou ajuste compatível." },
];

export const VERSION_POLICY = Object.freeze({
  title: "Modelo de versionamento",
  versionFormat: "MAJOR.MINOR.PATCH",
  versionExamples: ["1.0.0", "1.1.0", "1.1.1", "2.0.0"],
  releaseRule: "Sequencial por versão: a numeração recomeça em 001 quando uma nova versão é iniciada.",
  releaseExample: "v1.4.2 → Release 001, 002, 003",
  buildRule: "Campo opcional: identifica o artefato gerado (ex.: commit) e não substitui a versão.",
});

// ── Status de release ────────────────────────────────────────
export const RELEASE_STATUS = {
  DRAFT: { label: "Rascunho", tone: "neutral", Icon: FilePen },
  VALIDATED: { label: "Validada", tone: "brand", Icon: ClipboardCheck },
  APPROVED: { label: "Aprovada", tone: "positive", Icon: ShieldCheck },
  SCHEDULED: { label: "Agendada", tone: "brand", Icon: CalendarClock },
  RUNNING: { label: "Em execução", tone: "brand", Icon: CircleDot },
  SUCCEEDED: { label: "Publicada", tone: "positive", Icon: CircleCheck },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  SUPERSEDED: { label: "Substituída", tone: "muted", Icon: History },
  ROLLED_BACK: { label: "Revertida", tone: "attention", Icon: Undo2 },
  UNKNOWN: { label: "Não verificada", tone: "muted", Icon: CircleHelp },
};
export const RELEASE_STATUS_ORDER = [
  "DRAFT", "VALIDATED", "APPROVED", "SCHEDULED", "RUNNING", "SUCCEEDED", "FAILED", "SUPERSEDED", "ROLLED_BACK",
];
export const resolveReleaseStatus = (s) => resolver(RELEASE_STATUS, s, "UNKNOWN");

// Releases que já foram efetivamente publicadas (podem ser destino de reversão).
export const PUBLISHED_RELEASE_STATUSES = ["SUCCEEDED", "SUPERSEDED", "ROLLED_BACK"];

// ── Status de versão ─────────────────────────────────────────
export const VERSION_STATUS = {
  PLANNED: { label: "Planejada", tone: "neutral", Icon: Circle },
  IN_PROGRESS: { label: "Em preparação", tone: "brand", Icon: CircleDot },
  PUBLISHED: { label: "Publicada", tone: "positive", Icon: CircleCheck },
  SUPERSEDED: { label: "Substituída", tone: "muted", Icon: History },
  UNKNOWN: { label: "Não verificada", tone: "muted", Icon: CircleHelp },
};
export const resolveVersionStatus = (s) => resolver(VERSION_STATUS, s, "UNKNOWN");

// ── Tipos de evento do histórico ─────────────────────────────
export const HISTORY_TYPE = {
  VERSION_CREATED: { label: "Versão criada", tone: "brand", Icon: Tag },
  RELEASE_CREATED: { label: "Release criada", tone: "neutral", Icon: PackagePlus },
  RELEASE_PUBLISHED: { label: "Release publicada", tone: "positive", Icon: PackageCheck },
  RELEASE_FAILED: { label: "Falha na release", tone: "danger", Icon: CircleX },
  REVERSAL: { label: "Reversão", tone: "attention", Icon: Undo2 },
  UNKNOWN: { label: "Evento", tone: "muted", Icon: CircleHelp },
};
export const resolveHistoryType = (t) => resolver(HISTORY_TYPE, t, "UNKNOWN");

// ── Reversão ─────────────────────────────────────────────────
export const REVERSAL_COMPATIBILITY = {
  COMPATIBLE: { label: "Compatível", tone: "positive", Icon: CircleCheck },
  INCOMPATIBLE: { label: "Incompatível", tone: "attention", Icon: TriangleAlert },
  UNKNOWN: { label: "Não avaliada", tone: "muted", Icon: CircleHelp },
};
export const REVERSAL_SCHEMA = {
  COMPATIBLE: { label: "Estrutura do banco compatível", tone: "positive", Icon: CircleCheck },
  REQUIRES_RECOVERY_PLAN: { label: "Estrutura do banco alterada", tone: "attention", Icon: TriangleAlert },
  UNKNOWN: { label: "Não avaliada", tone: "muted", Icon: CircleHelp },
};
// Risco alto exige análise humana → tom "critical" (borda dupla), nunca só cor.
export const REVERSAL_DATA_RISK = {
  LOW: { label: "Baixo", tone: "neutral", Icon: CircleCheck },
  MEDIUM: { label: "Médio", tone: "attention", Icon: TriangleAlert },
  HIGH: { label: "Alto", tone: "critical", Icon: TriangleAlert },
  UNKNOWN: { label: "Não avaliado", tone: "muted", Icon: CircleHelp },
};
export const REVERSAL_BACKUP = {
  REQUIRED: { label: "Obrigatório", tone: "attention", Icon: ShieldCheck },
  RECOMMENDED: { label: "Recomendado", tone: "neutral", Icon: ShieldCheck },
};
export const REVERSAL_RECOVERY = {
  NONE: { label: "Nenhuma identificada nesta análise", tone: "neutral", Icon: CircleCheck },
  SPECIFIC_PLAN: { label: "Plano específico ou migration corretiva", tone: "attention", Icon: TriangleAlert },
  UNKNOWN: { label: "Não avaliada", tone: "muted", Icon: CircleHelp },
};
export const REVERSAL_APPROVAL = {
  PENDING: { label: "Aprovação humana pendente", tone: "neutral", Icon: Ban },
};

export const REVERSAL_TEXT = Object.freeze({
  title: "Avaliar reversão",
  intro: "Reverter é uma operação que precisa ser analisada antes de qualquer execução. Esta tela apenas avalia — nada é alterado.",
  appTitle: "Reversão da aplicação",
  appText: "Retorna o código para uma release anterior compatível.",
  dbTitle: "Recuperação do banco",
  dbText: "É um processo separado e de alto controle. Voltar a aplicação não apaga nem restaura o banco de dados automaticamente.",
  dataPreservation: "Os dados de Produção não são automaticamente descartados ou substituídos ao retornar uma release.",
  incompatibleSchema: "Alterações incompatíveis de banco exigem plano específico de recuperação ou migration corretiva.",
  executeUnavailable: "Indisponível: a execução de reversão não está habilitada nesta prévia. Esta tela apenas avalia.",
  evaluationNote: "Análise local com dados de exemplo. Não consulta Homologação nem Produção.",
});

// ── Revisão de execução e agendamento ────────────────────────
export const EXECUTION_REVIEW_TEXT = Object.freeze({
  title: "Revisar execução",
  intro: "Confira o que aconteceria ao executar esta atualização. Esta revisão é somente leitura — nada é executado.",
  executeUnavailable: "Indisponível: a execução ainda não está habilitada. Conclua as validações obrigatórias e aguarde a integração.",
});
export const SCHEDULE_TEXT = Object.freeze({
  title: "Agendar atualização",
  intro: "Formulário de prévia: abrir e preencher não agenda nada. Nenhuma informação é enviada.",
  confirmUnavailable: "Indisponível: o agendamento ainda não está habilitado. Nenhuma informação é enviada.",
});
