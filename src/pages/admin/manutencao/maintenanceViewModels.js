import { formatDateTime, shortHash } from "../ambientes/releaseViewModels.js";
import {
  AUTO_REOPEN_TEXT,
  BACKUP_LEVELS,
  BACKUP_STATUS,
  BACKUP_VERIFIED_MIN_LEVEL,
  CONNECTION_VIEW,
  END_STEP_PENDING_ICON,
  ENVIRONMENT_LABEL,
  EXECUTION_STATUS,
  EXECUTOR_STATUS,
  FAILED_TEXT,
  IDLE_PROGRESS_TEXT,
  LOAD_ERROR_TEXT,
  LOGIN_GATE_STATUS,
  MAINTENANCE_USER_MESSAGE,
  MIGRATION_RUN_NOTE,
  MIGRATION_RUN_STATE,
  OBSERVATION_STATUS,
  PHASE_STEPS,
  PHASE_STEP_STATE,
  PLAN_STATUS,
  PREVIEW_STATIC_LABEL,
  RECOVERY_REQUIRED_TEXT,
  SAFETY_FLOW,
  TIMELINE_STATUS,
  TIMELINE_TYPE_LABEL,
  WRITE_FENCE_STATUS,
  EXECUTION_LOCK_STATUS,
  ACTION_UNAVAILABLE,
  FAILURE_VIEW,
  HERO_INDICATOR,
  resolveBackup,
  resolveConnection,
  resolveExecutionLock,
  resolveExecutionStatus,
  resolveExecutor,
  resolveLoginGate,
  resolveMigrationRun,
  resolveObservation,
  resolvePhaseStepId,
  resolvePlanStatus,
  resolveTimelineStatus,
  resolveWriteFence,
} from "./maintenanceStatus.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE2 — View-models da tela Manutenção.
//  Funções PURAS: snapshot bruto (fixture hoje, live amanhã) → dados prontos
//  para os componentes. Nenhuma rede, efeito, estado ou relógio (o "tempo
//  decorrido" vem do adapter; nada aqui chama Date.now()). Todo rótulo/tom é
//  DERIVADO daqui — os componentes só desenham.
// ════════════════════════════════════════════════════════════

const NOT_AVAILABLE = "Não disponível";
const NOT_VERIFIED = "Não verificado";

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (value, fallback = "—") => {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
};
const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const percent = (value) => {
  const n = finite(value);
  return n === null ? null : Math.min(100, Math.max(0, Math.round(n)));
};
const dateLabel = (iso, fallback = NOT_AVAILABLE) => formatDateTime(iso) || fallback;
const hasDate = (iso) => Boolean(formatDateTime(iso));
const field = (label, value, mono = false) => ({ label, value, mono });
const statusOf = (map, key) => ({ key, ...map[key] });

/** Segundos → "42 s", "5 min 03 s", "1 h 02 min". Sem valor → null. */
export function formatElapsed(seconds) {
  const total = finite(seconds);
  if (total === null || total < 0) return null;
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(r).padStart(2, "0")} s`;
  return `${r} s`;
}

// ── Capabilities (fail-closed: só `true` estrito habilita) ───
export function buildCapabilitiesViewModel(snapshot) {
  const raw = snapshot?.capabilities || {};
  return {
    canStart: raw.canStart === true,
    canCancel: raw.canCancel === true,
    canRetry: raw.canRetry === true,
    canReconcile: raw.canReconcile === true,
    canViewDetails: raw.canViewDetails === true,
    help: ACTION_UNAVAILABLE,
  };
}

// ── Fases (stepper) ──────────────────────────────────────────
export function buildPhaseStepperViewModel(snapshot) {
  const phaseStepId = resolvePhaseStepId(snapshot?.maintenance?.phase);
  const executionKey = resolveExecutionStatus(snapshot?.execution?.status);

  // NORMAL + execução concluída = normalização final (a 9ª etapa).
  const currentId = phaseStepId === "NORMAL_START" && executionKey === "SUCCEEDED" ? "NORMAL_END" : phaseStepId;
  const currentIndex = PHASE_STEPS.findIndex((s) => s.id === currentId);

  const steps = PHASE_STEPS.map((step, index) => {
    let stateKey = "pending";
    if (currentIndex >= 0) {
      if (index < currentIndex) stateKey = "done";
      else if (index === currentIndex) {
        if (executionKey === "FAILED") stateKey = "failed";
        else if (executionKey === "RECOVERY_REQUIRED") stateKey = "recovery";
        else stateKey = currentId === "NORMAL_END" ? "done" : "current";
      }
    }
    const state = statusOf(PHASE_STEP_STATE, stateKey);
    if (step.kind === "end" && stateKey === "pending") state.Icon = END_STEP_PENDING_ICON;
    return {
      ...step,
      index: index + 1,
      isCurrent: index === currentIndex,
      state,
    };
  });

  return {
    steps,
    total: steps.length,
    currentId: currentIndex >= 0 ? currentId : null,
    currentIndex,
    currentLabel: currentIndex >= 0 ? steps[currentIndex].label : "Não reconhecida",
    hasUnknownPhase: currentIndex < 0,
    completedCount: steps.filter((s) => s.state.key === "done").length,
  };
}

// ── Hero (estado da manutenção) ──────────────────────────────
function heroState(stepper, executionKey) {
  if (executionKey === "RECOVERY_REQUIRED" || executionKey === "FAILED") {
    return statusOf(EXECUTION_STATUS, executionKey);
  }
  if (stepper.hasUnknownPhase) return { ...statusOf(EXECUTION_STATUS, "UNKNOWN"), label: "Fase não reconhecida" };
  const indicator = HERO_INDICATOR[executionKey === "RUNNING" || executionKey === "QUEUED" ? "brand" : "positive"];
  const step = stepper.steps[stepper.currentIndex];
  return { key: step.id, label: step.label, ...indicator };
}

export function buildHeroViewModel(snapshot, stepper) {
  const executionKey = resolveExecutionStatus(snapshot?.execution?.status);
  const planKey = resolvePlanStatus(snapshot?.plan?.status);
  const environment = snapshot?.execution?.environment;
  const state = heroState(stepper, executionKey);
  return {
    state,
    phaseTechnicalName: text(snapshot?.maintenance?.phase),
    environmentLabel: ENVIRONMENT_LABEL[environment] || text(environment),
    execution: statusOf(EXECUTION_STATUS, executionKey),
    plan: statusOf(PLAN_STATUS, planKey),
    isIdle: executionKey === "NONE",
  };
}

// ── Proteções ────────────────────────────────────────────────
function loginGateItem(raw) {
  const key = resolveLoginGate(raw?.status);
  return {
    id: "loginGate",
    title: "Login",
    description: "Novos acessos serão temporariamente bloqueados durante a atualização.",
    status: statusOf(LOGIN_GATE_STATUS, key),
    valueLabel: null,
    reason: null,
    helpText: "O login só é fechado a partir da etapa de proteção.",
    fields: [field("Estado técnico", key, true)],
  };
}

function writeFenceItem(raw) {
  const key = resolveWriteFence(raw?.status);
  const pending = raw?.coveragePending === true || key === "NOT_VALIDATED";
  return {
    id: "writeFence",
    title: "Write Fence",
    description: "Bloqueia alterações nos dados durante as etapas críticas.",
    status: statusOf(WRITE_FENCE_STATUS, key),
    valueLabel: null,
    reason: pending ? "Existem pendências de cobertura antes da liberação." : null,
    helpText: pending ? "Enquanto houver caminhos sem proteção, a atualização em Produção permanece indisponível." : null,
    fields: [
      field("Estado técnico", key, true),
      field("Aplicação neste momento", raw?.active === true ? "Ativo" : raw?.active === false ? "Inativo" : NOT_VERIFIED),
      field("Cobertura", raw?.coveragePending === true ? "Com pendências" : raw?.coveragePending === false ? "Sem pendências" : "Não verificada"),
    ],
  };
}

// "Zero" só existe com PROVA: sem contagem 0 + carimbo de tempo (+ cobertura
// completa, quando aplicável) o estado cai em "não verificado" — nunca em 0.
function observationKey(raw, { proven }) {
  const key = resolveObservation(raw?.status);
  const count = finite(raw?.count);
  if (key === "PROVEN_ZERO") return proven(count) ? key : "UNKNOWN";
  if (key === "ACTIVE") return count !== null && count > 0 ? key : "UNKNOWN";
  return key;
}

function activeSessionsItem(raw) {
  const key = observationKey(raw, { proven: (count) => count === 0 && hasDate(raw?.proofGeneratedAt) });
  const count = finite(raw?.count);
  const valueLabel = key === "PROVEN_ZERO"
    ? "0 sessões (comprovado)"
    : key === "ACTIVE" ? `${count} ${count === 1 ? "sessão ativa" : "sessões ativas"}` : NOT_VERIFIED;
  const waiting = key === "AWAITING_INTEGRATION";
  return {
    id: "activeSessions",
    title: "Sessões ativas",
    description: "Sessões abertas precisam ser encerradas antes das etapas críticas.",
    status: statusOf(OBSERVATION_STATUS, key),
    valueLabel,
    reason: waiting ? "Esta verificação aparecerá quando a integração estiver disponível. Nenhuma contagem foi comprovada." : null,
    helpText: null,
    fields: [
      field("Sessões ativas", valueLabel),
      field("Prova gerada em", dateLabel(raw?.proofGeneratedAt, "Sem prova")),
      field("Heartbeats após o fechamento", finite(raw?.heartbeatAfterClosureCount) === null ? NOT_VERIFIED : String(raw.heartbeatAfterClosureCount)),
      field("Estado técnico", key, true),
    ],
  };
}

function inFlightItem(raw) {
  const coverage = raw?.coverage === "FULL" || raw?.coverage === "PARTIAL" ? raw.coverage : null;
  let key = observationKey(raw, { proven: (count) => count === 0 && hasDate(raw?.observedAt) && coverage === "FULL" });
  if (resolveObservation(raw?.status) === "PROVEN_ZERO" && coverage === "PARTIAL") key = "PARTIAL";
  const count = finite(raw?.count);
  const valueLabel = key === "PROVEN_ZERO"
    ? "0 operações (comprovado)"
    : key === "ACTIVE" ? `${count} ${count === 1 ? "operação" : "operações"} em andamento` : NOT_VERIFIED;
  const waiting = key === "AWAITING_INTEGRATION";
  return {
    id: "inFlightOperations",
    title: "Operações em andamento",
    description: "Pedidos e pagamentos em curso precisam terminar antes das etapas críticas.",
    status: statusOf(OBSERVATION_STATUS, key),
    valueLabel,
    reason: waiting ? "Esta verificação aparecerá quando a integração estiver disponível. Nenhuma contagem foi comprovada." : null,
    helpText: null,
    fields: [
      field("Operações", valueLabel),
      field("Cobertura", coverage === "FULL" ? "Completa" : coverage === "PARTIAL" ? "Parcial" : "Não informada"),
      field("Observado em", dateLabel(raw?.observedAt, "Sem observação")),
      field("Estado técnico", key, true),
    ],
  };
}

function executionLockItem(raw) {
  const key = resolveExecutionLock(raw?.status);
  return {
    id: "executionLock",
    title: "Lock de execução",
    description: "Impede duas atualizações simultâneas no mesmo ambiente.",
    status: statusOf(EXECUTION_LOCK_STATUS, key),
    valueLabel: null,
    reason: null,
    helpText: key === "AWAITING_EXECUTOR" ? "O lock só é adquirido quando um executor iniciar uma atualização." : null,
    fields: [
      field("Estado técnico", key, true),
      field("Titular", text(raw?.heldBy, "Ninguém")),
      field("Expira em", dateLabel(raw?.expiresAt)),
    ],
  };
}

function parseLevel(raw) {
  const match = /^L([123])$/.exec(typeof raw === "string" ? raw.trim().toUpperCase() : "");
  return match ? Number(match[1]) : null;
}

function backupItem(raw) {
  let key = resolveBackup(raw?.status);
  const level = parseLevel(raw?.verificationLevel);
  // VERIFIED exige verificação de integridade (L2+); senão vira "criado".
  if (key === "VERIFIED" && !(level !== null && level >= BACKUP_VERIFIED_MIN_LEVEL)) key = "CREATED";
  // Os níveis são cumulativos: alcançar L3 implica L2 e L1.
  const levels = BACKUP_LEVELS.map((l, i) => ({ ...l, reached: level !== null && level >= i + 1 }));
  const artifactCount = finite(raw?.artifactCount);
  return {
    id: "backup",
    title: "Backup",
    description: "Garante um ponto de recuperação antes de alterar o banco.",
    status: statusOf(BACKUP_STATUS, key),
    valueLabel: null,
    reason: key === "NOT_STARTED" ? "O backup só é gerado quando uma atualização for autorizada." : null,
    helpText: null,
    levels,
    levelLabel: level === null ? "Nenhum" : `L${level}`,
    fields: [
      field("Modo", text(raw?.mode, "Não definido")),
      field("Nível de verificação", level === null ? "Nenhum" : `L${level}`),
      field("Criado em", dateLabel(raw?.createdAt)),
      field("Verificado em", dateLabel(raw?.verifiedAt)),
      field("Artefatos", artifactCount === null ? NOT_AVAILABLE : String(artifactCount)),
      field("Ponto de recuperação", text(raw?.recoveryPoint, NOT_AVAILABLE), true),
      field("Estado técnico", key, true),
    ],
  };
}

export function buildProtectionsViewModel(snapshot) {
  const p = isObject(snapshot?.protections) ? snapshot.protections : {};
  const items = [
    loginGateItem(p.loginGate),
    writeFenceItem(p.writeFence),
    activeSessionsItem(p.activeSessions),
    inFlightItem(p.inFlightOperations),
    executionLockItem(p.executionLock),
    backupItem(p.backup),
  ];
  return { items, byId: Object.fromEntries(items.map((i) => [i.id, i])) };
}

// ── Executor ─────────────────────────────────────────────────
export function buildExecutorViewModel(snapshot) {
  const raw = snapshot?.executor || {};
  const key = resolveExecutor(raw.status);
  const notes = {
    STALE: "O executor não envia sinais recentes. A atualização não deve prosseguir sem verificação.",
    LEASE_EXPIRED: "O lease do executor expirou. Outro executor só pode assumir após reconciliação.",
  };
  return {
    title: "Executor",
    description: "Responsável por coordenar cada etapa da atualização.",
    status: statusOf(EXECUTOR_STATUS, key),
    worker: text(raw.worker, "Nenhum worker ativo"),
    heartbeatLabel: dateLabel(raw.heartbeatAt, "Sem heartbeat"),
    leaseLabel: dateLabel(raw.leaseExpiresAt, "Sem lease"),
    note: notes[key] || null,
  };
}

// ── Progresso e resumo da execução ───────────────────────────
export function buildProgressViewModel(snapshot, migrationCountFallback = 0) {
  const exec = snapshot?.execution || {};
  const key = resolveExecutionStatus(exec.status);
  const isIdle = key === "NONE";
  const overall = percent(exec.progress?.overall);
  const phase = percent(exec.progress?.phase);
  return {
    isIdle,
    idleMessage: IDLE_PROGRESS_TEXT,
    overall,
    phase,
    // "0%" só aparece quando há execução e o valor foi informado.
    showBars: !isIdle && (overall !== null || phase !== null),
    isIndeterminate: key === "RUNNING" && overall === null && phase === null,
    summary: isIdle
      ? null
      : [
        field("Plano", text(exec.planId), true),
        field("Execução", text(exec.executionId), true),
        field("Release alvo", shortHash(exec.targetSha), true),
        field("Início", dateLabel(exec.startedAt, "—")),
        field("Tempo decorrido", formatElapsed(exec.elapsedSeconds) || "—"),
        field("Etapa atual", text(exec.currentStep)),
        field("Migration atual", text(exec.currentMigration)),
        field("Migrations", String(finite(exec.migrationCount) ?? migrationCountFallback)),
      ],
  };
}

// ── Migrations da execução ───────────────────────────────────
export function buildMigrationsViewModel(snapshot) {
  const items = asArray(snapshot?.migrations).map((m, i) => {
    const key = resolveMigrationRun(m?.state);
    return {
      key: text(m?.filename, `migration-${i}`),
      order: finite(m?.order) ?? i + 1,
      id: text(m?.id, String(i + 1)),
      filename: text(m?.filename),
      state: statusOf(MIGRATION_RUN_STATE, key),
      note: MIGRATION_RUN_NOTE[key] || null,
      isCritical: key === "AMBIGUOUS",
    };
  });
  const count = items.length;
  const applied = items.filter((m) => m.state.key === "SUCCESS").length;
  const allPreparing = count > 0 && items.every((m) => m.state.key === "IN_PREPARATION");
  let headline = "Nenhuma migration nesta execução";
  if (count > 0) headline = allPreparing ? `${count} ${count === 1 ? "migration" : "migrations"} em preparação` : `${applied} de ${count} aplicadas`;
  return {
    items,
    count,
    isEmpty: count === 0,
    headline,
    hasAmbiguous: items.some((m) => m.isCritical),
  };
}

// ── Linha do tempo ───────────────────────────────────────────
function metadataEntries(metadata) {
  if (!isObject(metadata)) return [];
  return Object.entries(metadata)
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 12)
    .map(([k, v]) => ({ key: k, value: String(v) }));
}

export function buildTimelineViewModel(snapshot) {
  const stamp = (e) => {
    const t = Date.parse(e?.timestamp);
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  const items = asArray(snapshot?.timeline)
    .filter(isObject)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => stamp(a.e) - stamp(b.e) || a.i - b.i) // cronológico; estável
    .map(({ e, i }) => {
      const key = resolveTimelineStatus(e.status);
      const stepId = resolvePhaseStepId(e.phase);
      const metadata = metadataEntries(e.metadata);
      return {
        id: text(e.id, `event-${i}`),
        timestampLabel: dateLabel(e.timestamp, "Sem horário"),
        phaseLabel: stepId ? PHASE_STEPS.find((s) => s.id === stepId).label : text(e.phase, "—"),
        typeLabel: TIMELINE_TYPE_LABEL[e.type] || text(e.type, "Evento"),
        title: text(e.title, "Evento"),
        description: text(e.description, ""),
        status: statusOf(TIMELINE_STATUS, key),
        actor: text(e.actor, ""),
        metadata,
        hasMetadata: metadata.length > 0,
      };
    });
  return {
    items,
    count: items.length,
    isEmpty: items.length === 0,
    emptyTitle: "Nenhuma execução registrada nesta prévia.",
    emptyText: "Os eventos aparecerão automaticamente durante uma atualização.",
  };
}

// ── Falha × recuperação ──────────────────────────────────────
/**
 * FAILED = falha conhecida. RECOVERY_REQUIRED = estado possivelmente mutado /
 * ambíguo que exige análise. Uma migration AMBIGUOUS força RECOVERY_REQUIRED
 * (fail-closed) mesmo que o executor ainda não tenha reportado.
 */
export function buildFailureViewModel(snapshot, migrations) {
  const key = resolveExecutionStatus(snapshot?.execution?.status);
  if (key === "RECOVERY_REQUIRED" || migrations.hasAmbiguous) {
    return { kind: "RECOVERY_REQUIRED", isRecovery: true, isFailed: false, message: RECOVERY_REQUIRED_TEXT, ...FAILURE_VIEW.RECOVERY_REQUIRED };
  }
  if (key === "FAILED") {
    return { kind: "FAILED", isRecovery: false, isFailed: true, message: FAILED_TEXT, ...FAILURE_VIEW.FAILED };
  }
  return null;
}

// ── Experiência do usuário ───────────────────────────────────
export const USER_EXPERIENCE = Object.freeze({
  message: MAINTENANCE_USER_MESSAGE,
  autoReopen: AUTO_REOPEN_TEXT,
  safetyFlow: SAFETY_FLOW,
});

// ── Detalhes técnicos (drawer "Ver detalhes") ────────────────
export function buildDetailsViewModel(snapshot, stepper, protections, page) {
  const m = snapshot?.maintenance || {};
  const e = snapshot?.execution || {};
  return {
    sections: [
      {
        id: "maintenance",
        title: "Manutenção",
        fields: [
          field("Fase técnica", text(m.phase), true),
          field("Status", text(m.status), true),
          field("Epoch", text(m.epoch), true),
          field("Versão", text(m.version), true),
          field("Início", dateLabel(m.startedAt, "—")),
          field("Conclusão", dateLabel(m.completedAt, "—")),
        ],
      },
      {
        id: "execution",
        title: "Execução",
        fields: [
          field("Execução", text(e.executionId), true),
          field("Plano", text(e.planId), true),
          field("Correlação", text(e.correlationId), true),
          field("Release alvo", text(e.targetSha), true),
          field("Ambiente", text(e.environment), true),
          field("Status técnico", resolveExecutionStatus(e.status), true),
        ],
      },
      {
        id: "source",
        title: "Origem dos dados",
        fields: [
          field("Fonte", page.source.label),
          field("Modo", text(snapshot?.mode)),
          field("Conexão", page.connection.label),
          field("Última atualização", page.lastUpdatedLabel),
        ],
      },
    ],
    phases: stepper.steps.map((s) => ({ id: s.id, index: s.index, label: s.label, technicalName: s.technicalName })),
    backupLevels: protections.byId.backup.levels,
  };
}

// ── Página ───────────────────────────────────────────────────
const VALID_STATUS = ["loading", "ready", "error"];

/** Compõe todos os view-models. Snapshot inválido → estado de erro (fail-closed). */
export function buildMaintenancePageViewModel(snapshot) {
  const valid = snapshot && typeof snapshot === "object" && VALID_STATUS.includes(snapshot.status);
  const state = valid ? snapshot.status : "error";
  const data = state === "ready" ? snapshot : null;
  const kind = snapshot?.source?.kind || "unknown";
  const isPreview = kind !== "live";
  const connectionKey = resolveConnection(snapshot?.connectionState);

  const stepper = buildPhaseStepperViewModel(data);
  const migrations = buildMigrationsViewModel(data);
  const protections = buildProtectionsViewModel(data);

  const page = {
    state,
    errorMessage: LOAD_ERROR_TEXT,
    source: { kind, isPreview, label: text(snapshot?.source?.label, "Fonte não identificada") },
    connection: { state: connectionKey, ...CONNECTION_VIEW[connectionKey] },
    // Prévia nunca mostra horário: um relógio falso passaria por dado real.
    lastUpdatedLabel: isPreview ? PREVIEW_STATIC_LABEL : dateLabel(snapshot?.lastUpdatedAt, "—"),
    hero: buildHeroViewModel(data, stepper),
    stepper,
    protections,
    executor: buildExecutorViewModel(data),
    progress: buildProgressViewModel(data, migrations.count),
    migrations,
    timeline: buildTimelineViewModel(data),
    failure: buildFailureViewModel(data, migrations),
    capabilities: buildCapabilitiesViewModel(data),
    userExperience: USER_EXPERIENCE,
  };
  page.details = buildDetailsViewModel(data, stepper, protections, page);
  return page;
}
