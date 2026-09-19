import {
  CONNECTION_STATE,
  DATABASE_STATUS,
  ENVIRONMENT_BADGES,
  ENVIRONMENT_STATUS,
  FLOW_STEPS,
  FLOW_STEP_STATE,
  GATE_STATUS,
  MIGRATION_CLASSIFICATION,
  MIGRATION_STATUS,
  READINESS_SUMMARY_ALWAYS,
  READINESS_SUMMARY_LABEL,
  READINESS_SUMMARY_ORDER,
  resolveFlowStepState,
  resolveGateStatus,
  resolveMigrationClassification,
} from "./releaseStatus.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE1 — View-models da tela Ambientes & Releases.
//  Funções PURAS: snapshot bruto (fixture hoje, live amanhã) → dados prontos
//  para os componentes. Nenhuma rede, nenhum efeito, nenhum estado. Toda
//  contagem/rótulo é DERIVADO daqui — nada é hardcoded nos componentes.
// ════════════════════════════════════════════════════════════

export const EXECUTE_UNAVAILABLE_TEXT = "Disponível após concluir as validações obrigatórias.";
export const SCHEDULE_UNAVAILABLE_TEXT = "Disponível após concluir as validações obrigatórias.";
export const LOAD_ERROR_TEXT = "Não foi possível carregar o estado dos ambientes.";

// Escopo da atualização — texto de política, não dado do ambiente.
export const SAFETY_SUMMARY = Object.freeze({
  updated: ["estrutura do banco", "funções", "índices", "constraints", "migrations versionadas"],
  notCopied: ["pedidos", "clientes", "produtos", "vendas", "dados operacionais de HML"],
});

const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value, fallback = "—") => {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
};

/** Abrevia hashes/SHAs para a visão principal (o completo fica nos detalhes). */
export function shortHash(value, size = 7) {
  if (typeof value !== "string" || value === "") return "—";
  return value.slice(0, size);
}

export function formatReferenceDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ── Capabilities (fail-closed: só `true` estrito habilita) ───
export function buildCapabilitiesViewModel(snapshot) {
  const raw = snapshot?.capabilities || {};
  return {
    canViewPlan: raw.canViewPlan === true,
    canViewReadiness: raw.canViewReadiness === true,
    canExecute: raw.canExecute === true,
    canSchedule: raw.canSchedule === true,
    canCancel: raw.canCancel === true,
    executeHelp: EXECUTE_UNAVAILABLE_TEXT,
    scheduleHelp: SCHEDULE_UNAVAILABLE_TEXT,
  };
}

// ── Ambientes ────────────────────────────────────────────────
function baselineView(raw) {
  const known = raw !== null && raw !== undefined && String(raw).trim() !== "" && String(raw).toUpperCase() !== "UNKNOWN";
  return { raw: known ? String(raw) : "UNKNOWN", known, label: known ? String(raw) : "Desconhecido" };
}

export function buildReleaseEnvironmentViewModel(snapshot) {
  return asArray(snapshot?.environments).map((env) => {
    const statusKey = Object.prototype.hasOwnProperty.call(ENVIRONMENT_STATUS, env?.status) ? env.status : "UNKNOWN";
    const dbKey = Object.prototype.hasOwnProperty.call(DATABASE_STATUS, env?.databaseStatus) ? env.databaseStatus : "BASELINE_UNVERIFIED";
    return {
      environment: text(env?.environment, "desconhecido"),
      label: text(env?.label, "Ambiente"),
      displayName: text(env?.displayName),
      isProduction: env?.environment === "producao",
      status: { key: statusKey, ...ENVIRONMENT_STATUS[statusKey] },
      branch: text(env?.branch),
      releaseSha: text(env?.releaseSha),
      databaseBaseline: baselineView(env?.databaseBaseline),
      lastValidatedLabel: formatDateTime(env?.lastValidatedAt) || "Sem registro",
      databaseStatus: { key: dbKey, ...DATABASE_STATUS[dbKey] },
      badges: asArray(env?.badges).map((key) => ({
        key,
        ...(ENVIRONMENT_BADGES[key] || { label: String(key), tone: "neutral", Icon: null }),
      })),
      alerts: asArray(env?.alerts).map((a, i) => ({ id: a?.id ?? `alert-${i}`, text: text(a?.text, "") })).filter((a) => a.text),
    };
  });
}

// ── Migrations ───────────────────────────────────────────────
export function buildMigrationViewModel(snapshot) {
  const items = asArray(snapshot?.migrations).map((m, i) => {
    const classificationKey = resolveMigrationClassification(m?.classification);
    const statusKey = Object.prototype.hasOwnProperty.call(MIGRATION_STATUS, m?.status) ? m.status : "UNKNOWN";
    const gitBlob = m?.identity?.gitBlob || null;
    const sha256 = m?.identity?.sha256 || null;
    return {
      key: text(m?.filename, `migration-${i}`),
      order: m?.order ?? i + 1,
      filename: text(m?.filename),
      kind: text(m?.kind),
      classification: { key: classificationKey, ...MIGRATION_CLASSIFICATION[classificationKey] },
      status: { key: statusKey, ...MIGRATION_STATUS[statusKey] },
      identity: {
        gitBlob,
        sha256,
        gitBlobShort: shortHash(gitBlob),
        sha256Short: shortHash(sha256),
        hasIdentity: Boolean(gitBlob || sha256),
      },
    };
  });
  const count = items.length;
  const kinds = [...new Set(items.map((m) => m.kind).filter((k) => k !== "—"))];
  return {
    items,
    count,
    isEmpty: count === 0,
    kindsLabel: kinds.join(" · "),
    headline: count === 0
      ? "Nenhuma migration em preparação"
      : `${count} ${count === 1 ? "migration" : "migrations"} em preparação`,
  };
}

// ── Readiness ────────────────────────────────────────────────
export function buildReadinessViewModel(snapshot) {
  const gates = asArray(snapshot?.gates).map((g, i) => {
    const statusKey = resolveGateStatus(g?.status);
    const reason = g?.reason || null;
    const helpText = g?.helpText || null;
    return {
      id: text(g?.id, `gate-${i}`),
      title: text(g?.title, "Validação"),
      status: { key: statusKey, ...GATE_STATUS[statusKey] },
      summary: text(g?.summary, ""),
      reason,
      helpText,
      hasDetails: Boolean(reason || helpText),
    };
  });

  const counts = Object.fromEntries(READINESS_SUMMARY_ORDER.map((k) => [k, 0]));
  gates.forEach((g) => { counts[g.status.key] += 1; });

  const summaryItems = READINESS_SUMMARY_ORDER
    .filter((key) => READINESS_SUMMARY_ALWAYS.includes(key) || counts[key] > 0)
    .map((key) => {
      const [singular, plural] = READINESS_SUMMARY_LABEL[key];
      return { status: key, count: counts[key], label: counts[key] === 1 ? singular : plural, tone: GATE_STATUS[key].tone };
    });

  // Pendências = tudo que não está VERIFIED, bloqueios primeiro.
  const pending = gates
    .filter((g) => g.status.key !== "VERIFIED")
    .sort((a, b) => a.status.order - b.status.order);

  const blockers = pending.filter((g) => g.status.key === "BLOCKED" || g.status.key === "FAILED");
  const otherPending = pending.filter((g) => !blockers.includes(g));

  let headline = "Todas as validações foram verificadas";
  if (gates.length === 0) headline = "Nenhuma validação disponível";
  else if (counts.FAILED > 0) headline = "Há validações com falha";
  else if (counts.BLOCKED > 0) headline = "Há validações bloqueadas";
  else if (pending.length > 0) headline = "Há validações pendentes";

  // Nunca há um "READY" global: a UI mostra só contagens e o que falta.
  return { gates, counts, total: gates.length, summaryItems, pending, blockers, otherPending, headline };
}

// ── Plano de atualização ─────────────────────────────────────
export function buildReleasePlanViewModel(snapshot) {
  const plan = snapshot?.plan || {};
  const envLabel = (id) => {
    const env = asArray(snapshot?.environments).find((e) => e?.environment === id);
    return text(env?.label, text(id));
  };
  const migrationCount = plan.migrationCount ?? asArray(snapshot?.migrations).length;
  return {
    isPreview: snapshot?.source?.kind === "fixture" || plan.planId === "PREVIEW",
    planId: text(plan.planId),
    kind: text(plan.kind),
    sourceEnvironment: envLabel(plan.sourceEnvironment),
    targetEnvironment: envLabel(plan.targetEnvironment),
    // Ids técnicos (para o modelo de formulário de execução — PDB-I3-FE3).
    sourceEnvironmentId: plan.sourceEnvironment ?? null,
    targetEnvironmentId: plan.targetEnvironment ?? null,
    baseSha: text(plan.baseSha),
    targetSha: text(plan.targetSha),
    migrationCount,
    status: text(plan.status),
    approval: text(plan.approval),
    schedule: text(plan.schedule),
    createdAtLabel: formatDateTime(plan.createdAt) || "—",
  };
}

// ── Fluxo HML → PROD ─────────────────────────────────────────
export function buildReleaseFlowViewModel(snapshot) {
  const byId = new Map(asArray(snapshot?.flow).map((s) => [s?.id, s]));
  const steps = FLOW_STEPS.map((step, index) => {
    const raw = byId.get(step.id);
    const stateKey = resolveFlowStepState(raw?.state);
    return {
      id: step.id,
      index: index + 1,
      label: step.label,
      note: raw?.note || null,
      state: { key: stateKey, ...FLOW_STEP_STATE[stateKey] },
    };
  });
  return { steps, completedCount: steps.filter((s) => s.state.key === "done").length, total: steps.length };
}

// ── Página ───────────────────────────────────────────────────
const VALID_STATUS = ["loading", "ready", "error"];

/** Compõe todos os view-models. Snapshot inválido → estado de erro (fail-closed). */
export function buildReleaseEnvironmentsPageViewModel(snapshot) {
  const valid = snapshot && typeof snapshot === "object" && VALID_STATUS.includes(snapshot.status);
  const state = valid ? snapshot.status : "error";
  const kind = snapshot?.source?.kind || "unknown";
  const connectionKey = Object.prototype.hasOwnProperty.call(CONNECTION_STATE, snapshot?.connectionState)
    ? snapshot.connectionState
    : "offline";

  return {
    state,
    errorMessage: LOAD_ERROR_TEXT,
    source: {
      kind,
      isPreview: kind !== "live",
      label: text(snapshot?.source?.label, "Fonte não identificada"),
    },
    connection: { state: connectionKey, label: CONNECTION_STATE[connectionKey] },
    lastUpdatedAt: snapshot?.lastUpdatedAt ?? null,
    referenceDateLabel: formatReferenceDate(snapshot?.lastUpdatedAt),
    currentPhase: snapshot?.currentPhase ?? null,
    executionProgress: snapshot?.executionProgress ?? null,
    environments: state === "ready" ? buildReleaseEnvironmentViewModel(snapshot) : [],
    migrations: buildMigrationViewModel(state === "ready" ? snapshot : null),
    readiness: buildReadinessViewModel(state === "ready" ? snapshot : null),
    plan: buildReleasePlanViewModel(state === "ready" ? snapshot : null),
    flow: buildReleaseFlowViewModel(state === "ready" ? snapshot : null),
    capabilities: buildCapabilitiesViewModel(state === "ready" ? snapshot : null),
    safety: SAFETY_SUMMARY,
  };
}
