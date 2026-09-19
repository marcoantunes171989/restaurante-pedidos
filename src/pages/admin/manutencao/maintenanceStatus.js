import {
  Ban, Circle, CircleCheck, CircleDot, CircleHelp, CircleX, Clock, Flag, History, Hourglass,
  Lock, LockOpen, ShieldCheck, TriangleAlert, WifiOff, Wifi, Radio, Eye,
} from "lucide-react";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE2 — FONTE ÚNICA de status, tons, rótulos e textos da tela
//  Manutenção. Segue a convenção do FE1 (ambientes/releaseStatus.js) e REUSA
//  seus tons (TONES) — nenhum componente decide cor/rótulo por conta própria.
//
//  Regras de honestidade (fail-closed):
//   • status desconhecido/ausente cai em "não verificado" — nunca em "ok";
//   • "zero" (sessões/operações) só existe com PROVA (ver view-models);
//   • vermelho "danger" = falha CONHECIDA; "critical" = estado ambíguo que exige
//     análise humana (RECOVERY_REQUIRED / migration AMBIGUOUS) — nunca iguais.
// ════════════════════════════════════════════════════════════

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function resolver(mapa, valor, fallback) {
  return has(mapa, valor) ? valor : fallback;
}

// ── Fases do ciclo (pipeline de 9 etapas) ────────────────────
// A 1ª e a 9ª etapas compartilham o nome técnico NORMAL: a primeira é o ponto
// de partida, a última é a normalização final. Ids distintos as diferenciam.
export const PHASE_STEPS = [
  {
    id: "NORMAL_START",
    technicalName: "NORMAL",
    label: "Normal",
    kind: "start",
    description: "Operação normal: clientes acessam o sistema e nenhuma atualização está em andamento.",
    helpText: "É o ponto de partida. Nada é alterado enquanto o sistema está neste estado.",
  },
  {
    id: "NOTICE",
    technicalName: "NOTICE",
    label: "Aviso",
    kind: "step",
    description: "Os usuários recebem um aviso de que o sistema entrará em atualização em breve.",
    helpText: "O acesso continua liberado enquanto o aviso é exibido.",
  },
  {
    id: "FENCING",
    technicalName: "FENCING",
    label: "Proteção",
    kind: "step",
    description: "Novos acessos são bloqueados e as alterações nos dados passam a ser barradas nas etapas críticas.",
    helpText: "É a primeira etapa que restringe o sistema.",
  },
  {
    id: "DRAINING",
    technicalName: "DRAINING",
    label: "Drenagem",
    kind: "step",
    description: "Sessões e operações que já estavam em andamento são concluídas ou encerradas com segurança.",
    helpText: "Nenhuma operação nova é aceita nesta etapa.",
  },
  {
    id: "QUIESCENT",
    technicalName: "QUIESCENT",
    label: "Quiescência",
    kind: "step",
    description: "O sistema chega ao repouso: nenhuma sessão ativa e nenhuma operação em andamento.",
    helpText: "Só com essa comprovação a atualização pode avançar.",
  },
  {
    id: "BACKING_UP",
    technicalName: "BACKING_UP",
    label: "Backup",
    kind: "step",
    description: "Um backup é gerado e sua integridade é verificada antes de qualquer alteração no banco.",
    helpText: "Define o ponto de recuperação caso algo dê errado.",
  },
  {
    id: "MIGRATING",
    technicalName: "MIGRATING",
    label: "Atualização",
    kind: "step",
    description: "As migrations (alterações na estrutura do banco) são aplicadas uma a uma, na ordem.",
    helpText: "Cada migration é registrada; um resultado incerto exige reconciliação técnica.",
  },
  {
    id: "SMOKE",
    technicalName: "SMOKE",
    label: "Verificação",
    kind: "step",
    description: "Testes rápidos (smoke tests) confirmam que o sistema continua funcionando após a atualização.",
    helpText: "Se a verificação falhar, o acesso não é liberado.",
  },
  {
    id: "NORMAL_END",
    technicalName: "NORMAL",
    label: "Normalizado",
    kind: "end",
    description: "Concluída a verificação, o sistema volta ao estado normal e o acesso é liberado automaticamente.",
    helpText: "Marca o fim seguro da atualização.",
  },
];

// Fases legadas do banco (B15) que mapeiam para uma etapa do pipeline novo.
export const PHASE_ALIASES = { RELEASING: "MIGRATING" };

/** Nome técnico da fase → id da etapa (a 1ª NORMAL é resolvida no view-model). */
export function resolvePhaseStepId(phase) {
  const technical = has(PHASE_ALIASES, phase) ? PHASE_ALIASES[phase] : phase;
  if (technical === "NORMAL") return "NORMAL_START";
  return PHASE_STEPS.some((s) => s.id === technical) ? technical : null;
}

export const PHASE_STEP_STATE = {
  done: { label: "Concluída", tone: "positive", Icon: CircleCheck },
  current: { label: "Atual", tone: "brand", Icon: CircleDot },
  pending: { label: "Pendente", tone: "neutral", Icon: Circle },
  failed: { label: "Falhou", tone: "danger", Icon: CircleX },
  recovery: { label: "Requer reconciliação", tone: "critical", Icon: TriangleAlert },
};

// A etapa final pendente é uma bandeira (chegada), não um círculo vazio.
export const END_STEP_PENDING_ICON = Flag;

// ── Execução ─────────────────────────────────────────────────
export const EXECUTION_STATUS = {
  NONE: { label: "Nenhuma em andamento", tone: "neutral", Icon: Circle },
  QUEUED: { label: "Na fila", tone: "brand", Icon: Hourglass },
  RUNNING: { label: "Em andamento", tone: "brand", Icon: CircleDot },
  SUCCEEDED: { label: "Concluída", tone: "positive", Icon: CircleCheck },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  RECOVERY_REQUIRED: { label: "Requer reconciliação", tone: "critical", Icon: TriangleAlert },
  CANCELED: { label: "Cancelada", tone: "neutral", Icon: Ban },
  UNKNOWN: { label: "Não verificada", tone: "muted", Icon: CircleHelp },
};
const EXECUTION_ALIASES = { IDLE: "NONE" };

export function resolveExecutionStatus(status) {
  const key = has(EXECUTION_ALIASES, status) ? EXECUTION_ALIASES[status] : status;
  return resolver(EXECUTION_STATUS, key, "UNKNOWN");
}

// Indicador do hero: verde/protegido quando normal; azul quando em atualização.
export const HERO_INDICATOR = {
  positive: { tone: "positive", Icon: ShieldCheck },
  brand: { tone: "brand", Icon: CircleDot },
};

// Falha conhecida × estado ambíguo — nunca o mesmo visual nem o mesmo texto.
export const FAILURE_VIEW = {
  FAILED: { title: "A atualização falhou", tone: "danger", Icon: CircleX },
  RECOVERY_REQUIRED: { title: "Requer reconciliação técnica", tone: "critical", Icon: TriangleAlert },
};

export const PLAN_STATUS = {
  AWAITING_VALIDATION: { label: "Aguardando validações", tone: "neutral", Icon: Clock },
  CREATED: { label: "Plano criado", tone: "brand", Icon: CircleDot },
  APPROVED: { label: "Aprovado", tone: "positive", Icon: CircleCheck },
  EXECUTING: { label: "Em execução", tone: "brand", Icon: CircleDot },
  COMPLETED: { label: "Concluído", tone: "positive", Icon: CircleCheck },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

export const ENVIRONMENT_LABEL = { producao: "Produção", homologacao: "Homologação" };

// ── Proteções ────────────────────────────────────────────────
export const LOGIN_GATE_STATUS = {
  OPEN: { label: "Aberto", tone: "positive", Icon: LockOpen },
  CLOSING: { label: "Fechando", tone: "attention", Icon: Clock },
  CLOSED: { label: "Bloqueado", tone: "attention", Icon: Lock },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

export const WRITE_FENCE_STATUS = {
  INACTIVE: { label: "Inativo", tone: "neutral", Icon: LockOpen },
  NOT_VALIDATED: { label: "Em preparação · não validado", tone: "attention", Icon: Lock },
  ACTIVE: { label: "Ativo", tone: "brand", Icon: Lock },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

// Sessões ativas / operações em andamento compartilham os estados. PROVEN_ZERO
// só é aceito COM prova (view-model); sem ela vira UNKNOWN.
export const OBSERVATION_STATUS = {
  AWAITING_INTEGRATION: { label: "Aguardando integração", tone: "muted", Icon: Hourglass },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
  PROVEN_ZERO: { label: "Zero comprovado", tone: "positive", Icon: CircleCheck },
  ACTIVE: { label: "Há registros ativos", tone: "attention", Icon: Clock },
  PARTIAL: { label: "Cobertura parcial", tone: "attention", Icon: TriangleAlert },
  STALE: { label: "Prova desatualizada", tone: "attention", Icon: History },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
};

export const EXECUTION_LOCK_STATUS = {
  AWAITING_EXECUTOR: { label: "Aguardando executor", tone: "muted", Icon: Hourglass },
  FREE: { label: "Livre", tone: "positive", Icon: LockOpen },
  HELD: { label: "Em uso", tone: "brand", Icon: Lock },
  STALE: { label: "Lock expirado", tone: "attention", Icon: History },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

// Backup. VERIFIED só vale com verificação L2+ (ver view-model).
export const BACKUP_STATUS = {
  NOT_STARTED: { label: "Não iniciado", tone: "neutral", Icon: Circle },
  RUNNING: { label: "Em andamento", tone: "brand", Icon: CircleDot },
  CREATED: { label: "Criado · verificação pendente", tone: "attention", Icon: Clock },
  VERIFIED: { label: "Verificado", tone: "positive", Icon: ShieldCheck },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

export const BACKUP_LEVELS = [
  { id: "L1", label: "L1 · Evidência do provedor", help: "O provedor confirma que o backup existe." },
  { id: "L2", label: "L2 · Integridade do backup", help: "O conteúdo do backup foi conferido e está íntegro." },
  { id: "L3", label: "L3 · Rehearsal de restauração", help: "Uma restauração de teste foi executada com sucesso." },
];
export const BACKUP_VERIFIED_MIN_LEVEL = 2;

// ── Executor ─────────────────────────────────────────────────
export const EXECUTOR_STATUS = {
  IDLE: { label: "Aguardando", tone: "neutral", Icon: Hourglass },
  ACTIVE: { label: "Ativo", tone: "brand", Icon: CircleDot },
  STALE: { label: "Sem sinal recente", tone: "attention", Icon: History },
  LEASE_EXPIRED: { label: "Lease expirado", tone: "attention", Icon: TriangleAlert },
  UNKNOWN: { label: "Não verificado", tone: "muted", Icon: CircleHelp },
};

// ── Migrations da execução ───────────────────────────────────
export const MIGRATION_RUN_STATE = {
  IN_PREPARATION: { label: "Em preparação", tone: "neutral", Icon: Clock },
  PENDING: { label: "Pendente", tone: "neutral", Icon: Circle },
  RUNNING: { label: "Em andamento", tone: "brand", Icon: CircleDot },
  SUCCESS: { label: "Aplicada", tone: "positive", Icon: CircleCheck },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  AMBIGUOUS: { label: "Resultado incerto", tone: "critical", Icon: TriangleAlert },
  SKIPPED: { label: "Não executada", tone: "muted", Icon: Ban },
  UNKNOWN: { label: "Não verificada", tone: "muted", Icon: CircleHelp },
};
export const MIGRATION_RUN_NOTE = {
  AMBIGUOUS: "Não sabemos se esta migration foi aplicada. Não reexecute: requer reconciliação técnica.",
  FAILED: "A migration terminou com erro conhecido. Consulte a linha do tempo.",
  SKIPPED: "Não foi executada porque uma etapa anterior não foi concluída.",
};

// ── Linha do tempo ───────────────────────────────────────────
export const TIMELINE_STATUS = {
  SUCCESS: { label: "Concluído", tone: "positive", Icon: CircleCheck },
  RUNNING: { label: "Em andamento", tone: "brand", Icon: CircleDot },
  PENDING: { label: "Pendente", tone: "neutral", Icon: Circle },
  INFO: { label: "Informativo", tone: "neutral", Icon: CircleDot },
  FAILED: { label: "Falhou", tone: "danger", Icon: CircleX },
  AMBIGUOUS: { label: "Resultado incerto", tone: "critical", Icon: TriangleAlert },
};
export const TIMELINE_TYPE_LABEL = {
  PHASE: "Etapa",
  PROTECTION: "Proteção",
  BACKUP: "Backup",
  MIGRATION: "Migration",
  SMOKE: "Verificação",
  SYSTEM: "Sistema",
  ERROR: "Erro",
};

// ── Conexão / tempo real (contrato futuro) ───────────────────
export const CONNECTION_VIEW = {
  preview: { label: "Prévia — dados de demonstração", tone: "brand", Icon: Eye },
  connecting: { label: "Conectando…", tone: "brand", Icon: Radio },
  live: { label: "Ao vivo", tone: "positive", Icon: Wifi },
  stale: { label: "Dados desatualizados", tone: "attention", Icon: History },
  offline: { label: "Sem conexão", tone: "danger", Icon: WifiOff },
};

export function resolveConnection(state) {
  const key = typeof state === "string" ? state.toLowerCase() : state;
  return resolver(CONNECTION_VIEW, key, "offline");
}

// ── Resolvers fail-closed ────────────────────────────────────
export const resolveLoginGate = (s) => resolver(LOGIN_GATE_STATUS, s, "UNKNOWN");
export const resolveWriteFence = (s) => resolver(WRITE_FENCE_STATUS, s, "UNKNOWN");
export const resolveObservation = (s) => resolver(OBSERVATION_STATUS, s, "UNKNOWN");
export const resolveExecutionLock = (s) => resolver(EXECUTION_LOCK_STATUS, s, "UNKNOWN");
export const resolveBackup = (s) => resolver(BACKUP_STATUS, s, "UNKNOWN");
export const resolveExecutor = (s) => resolver(EXECUTOR_STATUS, s, "UNKNOWN");
export const resolvePlanStatus = (s) => resolver(PLAN_STATUS, s, "UNKNOWN");
export const resolveMigrationRun = (s) => resolver(MIGRATION_RUN_STATE, s, "UNKNOWN");
export const resolveTimelineStatus = (s) => resolver(TIMELINE_STATUS, s, "INFO");

// ── Textos de política / experiência do usuário ──────────────
export const PREVIEW_LABEL = "Prévia da funcionalidade";
export const PREVIEW_STATIC_LABEL = "Prévia estática";
export const LOAD_ERROR_TEXT = "Não foi possível carregar o estado da manutenção.";
export const IDLE_PROGRESS_TEXT = "Nenhuma atualização em andamento.";

export const MAINTENANCE_USER_MESSAGE = "Sistema em processo de atualização. Aguarde até a finalização.";
export const AUTO_REOPEN_TEXT = "Após a conclusão segura da atualização, o acesso será liberado automaticamente.";
export const RECOVERY_REQUIRED_TEXT = "A atualização foi interrompida e requer reconciliação técnica antes de liberar o sistema.";
export const FAILED_TEXT = "A atualização falhou em uma etapa conhecida. Consulte a linha do tempo para ver onde ocorreu.";

export const SAFETY_FLOW = [
  "Novos acessos são bloqueados",
  "Operações em andamento são drenadas",
  "O backup é validado",
  "As migrations são aplicadas",
  "Os smoke tests verificam o sistema",
  "O acesso é liberado",
];

// Motivos exibidos (sempre visíveis, sem depender de tooltip) quando uma ação
// está indisponível.
export const ACTION_UNAVAILABLE = {
  start: "Disponível após conclusão das validações de segurança.",
  cancel: "Disponível somente durante uma atualização em andamento.",
  retry: "Disponível apenas após uma falha conhecida.",
  reconcile: "Disponível apenas quando uma atualização exigir reconciliação técnica.",
  details: "Detalhes indisponíveis para este perfil.",
  notIntegrated: "Integração em preparação: a ação ainda não está conectada.",
};
