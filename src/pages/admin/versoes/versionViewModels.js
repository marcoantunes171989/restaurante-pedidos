import { formatDateTime, shortHash } from "../ambientes/releaseViewModels.js";
import { formatElapsed } from "../manutencao/maintenanceViewModels.js";
import {
  EXAMPLE_LABEL,
  EXAMPLE_NOTICE,
  EXECUTION_REVIEW_TEXT,
  HISTORY_TYPE,
  LOAD_ERROR_TEXT,
  PUBLISHED_RELEASE_STATUSES,
  RELEASE_STATUS,
  RELEASE_STATUS_ORDER,
  REVERSAL_APPROVAL,
  REVERSAL_BACKUP,
  REVERSAL_COMPATIBILITY,
  REVERSAL_DATA_RISK,
  REVERSAL_RECOVERY,
  REVERSAL_SCHEMA,
  REVERSAL_TEXT,
  SCHEDULE_TEXT,
  SEMVER_PATTERN,
  VERSION_INVALID_TEXT,
  VERSION_NOT_CONFIGURED_HELP,
  VERSION_NOT_CONFIGURED_TEXT,
  VERSION_POLICY,
  VERSION_SEMANTICS,
  VERSION_STATUS,
  resolveHistoryType,
  resolveReleaseStatus,
  resolveVersionStatus,
} from "./versionStatus.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — View-models de Versões, Releases, Histórico e Reversão.
//  Funções PURAS: snapshot NORMALIZADO (versionAdapter.js) → dados prontos para
//  os componentes. Sem rede, efeito, estado ou relógio. Todo rótulo/tom vem de
//  versionStatus.js — os componentes só desenham.
// ════════════════════════════════════════════════════════════

const NOT_INFORMED = "—";
const asArray = (v) => (Array.isArray(v) ? v : []);
const text = (value, fallback = NOT_INFORMED) => {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
};
const statusOf = (map, key) => ({ key, ...map[key] });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ── Formato de versão e release ──────────────────────────────
/** "1.4.2" → { major, minor, patch }. Fora do padrão MAJOR.MINOR.PATCH → null. */
export function parseVersion(value) {
  const m = SEMVER_PATTERN.exec(typeof value === "string" ? value.trim() : "");
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

/** "1.4.2" → "v1.4.2". Inválida → null (a UI mostra "Versão inválida"). */
export function formatVersion(value) {
  const p = parseVersion(value);
  return p ? `v${p.major}.${p.minor}.${p.patch}` : null;
}

/** Ordem crescente por versão; versões inválidas ficam por último. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

/** 3 → "003". */
export function formatReleaseCode(number) {
  return Number.isInteger(number) && number >= 0 ? String(number).padStart(3, "0") : null;
}

/** 3 → "Release 003". */
export function formatReleaseNumber(number) {
  const code = formatReleaseCode(number);
  return code === null ? null : `Release ${code}`;
}

function versionView(raw) {
  const label = formatVersion(raw);
  if (label) return { raw, valid: true, label };
  return { raw: raw ?? null, valid: false, label: raw ? VERSION_INVALID_TEXT : "Versão não informada" };
}

// ── Versão do produto + modelo de versionamento ──────────────
export function buildProductVersionViewModel(snapshot) {
  const rawCurrent = snapshot?.productVersion?.current ?? null;
  const parsed = rawCurrent === null ? null : formatVersion(rawCurrent);
  const configured = parsed !== null;
  const invalid = rawCurrent !== null && !configured;
  return {
    configured,
    invalid,
    current: configured ? parsed : null,
    label: configured ? parsed : invalid ? VERSION_INVALID_TEXT : VERSION_NOT_CONFIGURED_TEXT,
    help: configured ? null : VERSION_NOT_CONFIGURED_HELP,
    sourceLabel: configured ? text(snapshot?.productVersion?.source, "Fonte não informada") : null,
    policy: {
      ...VERSION_POLICY,
      semantics: VERSION_SEMANTICS,
      statuses: RELEASE_STATUS_ORDER.map((key) => statusOf(RELEASE_STATUS, key)),
    },
  };
}

// ── Releases ─────────────────────────────────────────────────
function buildRelease(raw, index, ctx) {
  const version = versionView(raw?.version);
  const statusKey = resolveReleaseStatus(raw?.status);
  const numberLabel = formatReleaseNumber(raw?.releaseNumber);
  const migrations = asArray(raw?.migrations);
  const previous = ctx.rawById.get(raw?.previousReleaseId);
  const previousTitle = previous
    ? `${versionView(previous.version).label} · ${formatReleaseNumber(previous.releaseNumber) ?? "Release"}`
    : null;
  const notes = raw?.releaseNotes ?? null;
  const baselineKnown = raw?.databaseBaseline !== null && raw?.databaseBaseline !== undefined;
  return {
    key: text(raw?.releaseId, `release-${index}`),
    releaseId: text(raw?.releaseId, `release-${index}`),
    isExample: ctx.isExample,
    version,
    releaseNumber: raw?.releaseNumber ?? null,
    releaseNumberLabel: numberLabel ?? "Release sem número",
    releaseCode: formatReleaseCode(raw?.releaseNumber),
    title: `${version.label} · ${numberLabel ?? "Release sem número"}`,
    status: statusOf(RELEASE_STATUS, statusKey),
    isPublished: PUBLISHED_RELEASE_STATUSES.includes(statusKey),
    sha: text(raw?.sha),
    shaShort: shortHash(raw?.sha),
    build: raw?.build ?? null,
    buildLabel: text(raw?.build, "Não informado"),
    databaseBaseline: {
      raw: baselineKnown ? raw.databaseBaseline : null,
      known: baselineKnown,
      label: baselineKnown ? String(raw.databaseBaseline) : "Desconhecido",
    },
    migrations: {
      items: migrations,
      count: migrations.length,
      label: migrations.length === 0 ? "Nenhuma migration" : plural(migrations.length, "migration", "migrations"),
    },
    createdAtLabel: formatDateTime(raw?.createdAt) || NOT_INFORMED,
    publishedAtLabel: formatDateTime(raw?.publishedAt) || "Não publicada",
    publishedBy: text(raw?.publishedBy, "Não informado"),
    releaseNotes: text(notes, "Sem notas de release."),
    hasNotes: notes !== null,
    previousReleaseId: raw?.previousReleaseId ?? null,
    previousReleaseLabel: raw?.previousReleaseId ? (previousTitle ?? text(raw.previousReleaseId)) : "Nenhuma",
    source: text(raw?.source),
    target: text(raw?.target),
    createdAt: raw?.createdAt ?? null,
  };
}

function compareReleases(a, b) {
  return compareVersions(a.version.raw, b.version.raw)
    || (a.releaseNumber ?? 0) - (b.releaseNumber ?? 0)
    || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
}

function versionGroupStatus(releases, hasNewerPublishedVersion) {
  const keys = releases.map((r) => r.status.key);
  if (keys.includes("SUCCEEDED")) return hasNewerPublishedVersion ? "SUPERSEDED" : "PUBLISHED";
  if (keys.some((k) => ["DRAFT", "VALIDATED", "APPROVED", "SCHEDULED", "RUNNING"].includes(k))) return "IN_PROGRESS";
  if (keys.some((k) => k === "SUPERSEDED" || k === "ROLLED_BACK")) return "SUPERSEDED";
  return "UNKNOWN";
}

export function buildReleasesViewModel(snapshot) {
  const raws = asArray(snapshot?.releases);
  const isExample = snapshot?.source?.kind !== "live";
  const rawById = new Map(raws.map((r) => [r?.releaseId, r]));
  const items = raws.map((r, i) => buildRelease(r, i, { rawById, isExample })).sort(compareReleases);
  const byId = new Map(items.map((r) => [r.releaseId, r]));

  // Grupos por versão: mais nova primeiro; dentro do grupo, release mais nova primeiro.
  const groupMap = new Map();
  items.forEach((r) => {
    const key = r.version.raw ?? "__sem_versao__";
    if (!groupMap.has(key)) groupMap.set(key, { version: r.version, releases: [] });
    groupMap.get(key).releases.push(r);
  });
  const ordered = [...groupMap.values()]
    .map((g) => ({ ...g, releases: [...g.releases].sort((a, b) => compareReleases(b, a)) }))
    .sort((a, b) => compareVersions(b.version.raw, a.version.raw));
  const groups = ordered.map((g, i) => {
    const newerPublished = ordered.slice(0, i).some((n) => n.releases.some((r) => r.status.key === "SUCCEEDED"));
    const statusKey = resolveVersionStatus(versionGroupStatus(g.releases, newerPublished));
    return {
      key: g.version.raw ?? "__sem_versao__",
      version: g.version,
      status: statusOf(VERSION_STATUS, statusKey),
      releases: g.releases,
      releaseCountLabel: plural(g.releases.length, "release", "releases"),
    };
  });

  return {
    items,
    byId,
    groups,
    count: items.length,
    isEmpty: items.length === 0,
    isExample,
    exampleLabel: EXAMPLE_LABEL,
    exampleNotice: EXAMPLE_NOTICE,
    emptyTitle: "Nenhuma release registrada.",
    emptyText: "As releases aparecerão aqui, agrupadas por versão, quando forem criadas.",
  };
}

// ── Histórico (sequência imutável) ───────────────────────────
function buildHistoryEntry(raw, index, ctx) {
  const typeKey = resolveHistoryType(raw?.type);
  const statusKey = raw?.status ? resolveReleaseStatus(raw.status) : null;
  const release = ctx.releases.byId.get(raw?.releaseId) || null;
  const rollbackTarget = raw?.rollbackOfReleaseId ? ctx.releases.byId.get(raw.rollbackOfReleaseId) || null : null;
  const previous = raw?.previousReleaseId ? ctx.releases.byId.get(raw.previousReleaseId) || null : null;
  const numberLabel = formatReleaseNumber(raw?.releaseNumber);
  const duration = formatElapsed(raw?.duration);
  return {
    id: text(raw?.id, `history-${index}`),
    isExample: ctx.isExample,
    version: versionView(raw?.version),
    releaseNumber: raw?.releaseNumber ?? null,
    releaseNumberLabel: numberLabel,
    releaseId: raw?.releaseId ?? null,
    type: statusOf(HISTORY_TYPE, typeKey),
    isReversal: typeKey === "REVERSAL",
    status: statusKey ? statusOf(RELEASE_STATUS, statusKey) : null,
    source: text(raw?.source),
    target: text(raw?.target),
    sha: text(raw?.sha),
    shaShort: shortHash(raw?.sha),
    databaseBaselineLabel: raw?.databaseBaseline !== null && raw?.databaseBaseline !== undefined ? String(raw.databaseBaseline) : "Desconhecido",
    createdAt: raw?.createdAt ?? null,
    createdAtLabel: formatDateTime(raw?.createdAt) || "Sem data",
    publishedAtLabel: formatDateTime(raw?.publishedAt),
    actor: text(raw?.actor, "Não informado"),
    durationLabel: duration,
    previousReleaseId: raw?.previousReleaseId ?? null,
    previousReleaseLabel: raw?.previousReleaseId
      ? (previous ? previous.title : text(raw.previousReleaseId))
      : null,
    rollbackOfReleaseId: raw?.rollbackOfReleaseId ?? null,
    // Relação de reversão: "Reversão da Release 001 (v1.4.2)".
    rollbackOf: raw?.rollbackOfReleaseId
      ? {
        releaseId: raw.rollbackOfReleaseId,
        found: Boolean(rollbackTarget),
        label: rollbackTarget
          ? `Reversão da ${rollbackTarget.releaseNumberLabel} (${rollbackTarget.version.label})`
          : `Reversão de ${raw.rollbackOfReleaseId}`,
      }
      : null,
    notes: text(raw?.notes, ""),
    hasRelease: Boolean(release),
    canEvaluateReversal: Boolean(release) && buildReversalCandidates(ctx.releases, release.releaseId).length > 0,
  };
}

export function buildHistoryViewModel(snapshot, releases) {
  const isExample = snapshot?.source?.kind !== "live";
  const ctx = { releases, isExample };
  const entries = asArray(snapshot?.history)
    .map((raw, i) => ({ raw, i }))
    .sort((a, b) => String(a.raw?.createdAt ?? "").localeCompare(String(b.raw?.createdAt ?? "")) || a.i - b.i)
    .map(({ raw, i }) => buildHistoryEntry(raw, i, ctx));

  const groupMap = new Map();
  entries.forEach((e) => {
    const key = e.version.raw ?? "__sem_versao__";
    if (!groupMap.has(key)) groupMap.set(key, { key, version: e.version, entries: [] });
    groupMap.get(key).entries.push(e);
  });
  const groups = [...groupMap.values()]
    .sort((a, b) => compareVersions(b.version.raw, a.version.raw))
    .map((g) => {
      // Mais recente primeiro (Release 003, 002, 001); a criação da versão fica por último.
      const newestFirst = [...g.entries].reverse();
      const releaseEntries = newestFirst.filter((e) => e.type.key !== "VERSION_CREATED");
      const created = newestFirst.find((e) => e.type.key === "VERSION_CREATED") || null;
      return {
        key: g.key,
        version: g.version,
        entries: newestFirst,
        releaseEntries,
        versionCreatedEntry: created,
        countLabel: plural(releaseEntries.length, "evento", "eventos"),
      };
    });

  return {
    groups,
    entries,
    count: entries.length,
    isEmpty: entries.length === 0,
    isImmutable: true,
    isExample,
    exampleLabel: EXAMPLE_LABEL,
    exampleNotice: EXAMPLE_NOTICE,
    orderNote: "Sequência imutável: o histórico só recebe novos registros — nenhum item pode ser editado ou removido.",
    emptyTitle: "Nenhum registro no histórico.",
    emptyText: "Versões, releases, publicações, falhas e reversões aparecerão aqui à medida que acontecerem.",
  };
}

// ── Reversão (avaliação local, sem execução) ─────────────────
/** Releases publicadas ANTERIORES à origem, da mais recente para a mais antiga. */
export function buildReversalCandidates(releases, sourceReleaseId) {
  const source = releases?.byId?.get(sourceReleaseId);
  if (!source) return [];
  return asArray(releases.items)
    .filter((r) => r.releaseId !== source.releaseId && ["SUCCEEDED", "SUPERSEDED"].includes(r.status.key) && compareReleases(r, source) < 0)
    .sort((a, b) => compareReleases(b, a));
}

function evaluateReversalCompatibility(source, target) {
  if (!target) {
    return { code: "UNKNOWN", schema: "UNKNOWN", risk: "UNKNOWN", extraMigrations: [], reasons: [] };
  }
  const reasons = [];
  const older = compareReleases(target, source) < 0;
  const publishedTarget = ["SUCCEEDED", "SUPERSEDED"].includes(target.status.key);
  let code = "COMPATIBLE";
  if (!older) { code = "INCOMPATIBLE"; reasons.push("TARGET_NOT_OLDER"); }
  else if (!publishedTarget) { code = "INCOMPATIBLE"; reasons.push("TARGET_NOT_PUBLISHED"); }

  const targetMigrations = new Set(target.migrations.items);
  const extraMigrations = source.migrations.items.filter((m) => !targetMigrations.has(m));
  let schema = "COMPATIBLE";
  if (!source.databaseBaseline.known || !target.databaseBaseline.known) {
    schema = "UNKNOWN";
    reasons.push("BASELINE_UNKNOWN");
  } else if (extraMigrations.length > 0 || Number(source.databaseBaseline.raw) > Number(target.databaseBaseline.raw)) {
    schema = "REQUIRES_RECOVERY_PLAN";
    reasons.push("SCHEMA_CHANGED");
  }
  const risk = schema === "COMPATIBLE" ? "LOW" : schema === "REQUIRES_RECOVERY_PLAN" ? "HIGH" : "UNKNOWN";
  return { code, schema, risk, extraMigrations, reasons };
}

function reversalAlerts(evaluation, target) {
  const alerts = [{
    id: "data-preservation",
    severity: "Informativo",
    tone: "brand",
    title: "Dados de Produção",
    text: REVERSAL_TEXT.dataPreservation,
  }];
  if (!target) return alerts;
  if (evaluation.code === "INCOMPATIBLE") {
    alerts.push({
      id: "target-invalid",
      severity: "Atenção",
      tone: "attention",
      title: "Destino inadequado",
      text: "A release de destino precisa ser anterior à origem e já ter sido publicada.",
    });
  }
  if (evaluation.schema === "REQUIRES_RECOVERY_PLAN") {
    alerts.push({
      id: "schema-changed",
      severity: "Risco alto",
      tone: "critical",
      title: "Banco de dados alterado entre as releases",
      text: `${REVERSAL_TEXT.incompatibleSchema} ${plural(evaluation.extraMigrations.length, "migration existe", "migrations existem")} na origem e não no destino.`,
    });
  }
  if (evaluation.schema === "UNKNOWN") {
    alerts.push({
      id: "baseline-unknown",
      severity: "Atenção",
      tone: "attention",
      title: "Baseline do banco desconhecido",
      text: "Não é possível avaliar a compatibilidade do banco: o baseline de uma das releases não é conhecido.",
    });
  }
  return alerts;
}

/**
 * Avaliação de reversão — SOMENTE LEITURA. Compara origem × destino com os
 * dados do snapshot (exemplo hoje) e nunca executa, altera versão local nem
 * simula sucesso. `capabilities.canExecuteReversal` vem do snapshot (false).
 */
export function buildReversalViewModel({ releases, sourceReleaseId, targetReleaseId = null, reason = "", capabilities = {} }) {
  const source = releases?.byId?.get(sourceReleaseId) || null;
  const caps = {
    canEvaluateReversal: capabilities.canEvaluateReversal === true,
    canExecuteReversal: capabilities.canExecuteReversal === true,
    executeHelp: REVERSAL_TEXT.executeUnavailable,
  };
  if (!source) {
    return { found: false, capabilities: caps, sourceRelease: null, targetRelease: null, candidates: [] };
  }
  const candidates = buildReversalCandidates(releases, source.releaseId);
  const target = targetReleaseId ? releases.byId.get(targetReleaseId) || null : null;
  const evaluation = evaluateReversalCompatibility(source, target);
  const evaluated = Boolean(target);
  return {
    found: true,
    isExample: source.isExample,
    sourceRelease: source,
    targetRelease: target,
    candidates,
    hasCandidates: candidates.length > 0,
    evaluated,
    compatibility: statusOf(REVERSAL_COMPATIBILITY, evaluation.code),
    schemaCompatibility: statusOf(REVERSAL_SCHEMA, evaluation.schema),
    dataRisk: statusOf(REVERSAL_DATA_RISK, evaluation.risk),
    backupRequirement: evaluated ? statusOf(REVERSAL_BACKUP, evaluation.risk === "LOW" ? "RECOMMENDED" : "REQUIRED") : null,
    recoveryRequirement: statusOf(
      REVERSAL_RECOVERY,
      evaluation.schema === "COMPATIBLE" ? "NONE" : evaluation.schema === "REQUIRES_RECOVERY_PLAN" ? "SPECIFIC_PLAN" : "UNKNOWN",
    ),
    approval: statusOf(REVERSAL_APPROVAL, "PENDING"),
    extraMigrations: evaluation.extraMigrations,
    alerts: reversalAlerts(evaluation, target),
    reason: typeof reason === "string" ? reason : "",
    capabilities: caps,
    text: REVERSAL_TEXT,
  };
}

// ── Revisão de execução ──────────────────────────────────────
/**
 * Revisão da execução HML → PROD. Combina o view-model da central (plano,
 * migrations, readiness, capabilities) com as proteções da Manutenção (backup,
 * sessões, write fence). Só leitura: `canExecute` vem das capabilities e o
 * botão final é sempre desabilitado com o motivo visível.
 */
export function buildExecutionReviewViewModel({ overview, maintenance = null, releases = null }) {
  const plan = overview?.plan || {};
  const migrations = overview?.migrations || { items: [], count: 0, isEmpty: true };
  const readiness = overview?.readiness || { gates: [], summaryItems: [], blockers: [], pending: [], total: 0, headline: "Nenhuma validação disponível" };
  const caps = overview?.capabilities || {};
  const protections = maintenance?.state === "ready" ? maintenance.protections.byId : null;
  const unverified = { label: "Não verificado", tone: "muted", Icon: null, key: "UNKNOWN" };
  const protection = (id) => protections?.[id] || null;
  const shaRaw = plan.targetSha && plan.targetSha !== NOT_INFORMED ? plan.targetSha : null;
  const release = releases ? releases.items.find((r) => !r.isExample && shaRaw && r.sha === shaRaw) || null : null;

  return {
    // O plano da prévia ("PREVIEW") ainda não foi criado: não é um id real.
    planId: !plan.isPreview && plan.planId && plan.planId !== NOT_INFORMED ? plan.planId : null,
    isPreview: Boolean(plan.isPreview),
    sourceEnvironmentId: plan.sourceEnvironmentId ?? null,
    targetEnvironmentId: plan.targetEnvironmentId ?? null,
    source: text(plan.sourceEnvironment),
    target: text(plan.targetEnvironment),
    release,
    releaseLabel: release ? release.title : "Nenhuma release registrada associada a este plano.",
    targetSha: text(plan.targetSha),
    targetShaRaw: shaRaw,
    baseSha: text(plan.baseSha),
    migrations: {
      count: migrations.count,
      items: migrations.items,
      isEmpty: migrations.isEmpty,
      label: migrations.isEmpty ? "Nenhuma migration em preparação" : plural(migrations.count, "migration em preparação", "migrations em preparação"),
    },
    readiness: {
      headline: readiness.headline,
      total: readiness.total,
      pendingCount: readiness.pending.length,
      summaryItems: readiness.summaryItems,
      blockers: readiness.blockers,
    },
    backup: {
      status: protection("backup")?.status || unverified,
      reason: protection("backup")?.reason || null,
    },
    sessions: {
      status: protection("activeSessions")?.status || unverified,
      valueLabel: protection("activeSessions")?.valueLabel || "Não verificado",
    },
    writeFence: {
      status: protection("writeFence")?.status || unverified,
      reason: protection("writeFence")?.reason || null,
    },
    approval: text(plan.approval, "Pendente"),
    maintenance: maintenance?.state === "ready"
      ? {
        phaseLabel: maintenance.hero.state.label,
        execution: maintenance.hero.execution,
        plan: maintenance.hero.plan,
      }
      : { phaseLabel: "Não verificado", execution: unverified, plan: unverified },
    capabilities: {
      canExecute: caps.canExecute === true,
      executeHelp: EXECUTION_REVIEW_TEXT.executeUnavailable,
    },
    text: EXECUTION_REVIEW_TEXT,
  };
}

// ── Agendamento (opções do formulário de prévia) ─────────────
const SCHEDULABLE = ["DRAFT", "VALIDATED", "APPROVED"];

export function buildScheduleFormViewModel({ overview, releases = null }) {
  const caps = overview?.capabilities || {};
  const planSha = overview?.plan?.targetSha;
  const options = [];
  if (planSha && planSha !== NOT_INFORMED) {
    options.push({ value: "plan-current", label: `Plano atual da central — release alvo ${planSha}` });
  }
  asArray(releases?.items).filter((r) => SCHEDULABLE.includes(r.status.key)).forEach((r) => {
    options.push({ value: r.releaseId, label: `${r.title} — ${r.status.label}${r.isExample ? " (exemplo)" : ""}` });
  });
  return {
    releaseOptions: options,
    capabilities: {
      canSchedule: caps.canSchedule === true,
      confirmHelp: SCHEDULE_TEXT.confirmUnavailable,
    },
    text: SCHEDULE_TEXT,
  };
}

// ── Página ───────────────────────────────────────────────────
/** Compõe os view-models. Snapshot inválido → estado de erro (fail-closed). */
export function buildVersionsPageViewModel(snapshot) {
  const state = ["loading", "ready", "error"].includes(snapshot?.status) ? snapshot.status : "error";
  const data = state === "ready" ? snapshot : null;
  const kind = snapshot?.source?.kind || "unknown";
  const releases = buildReleasesViewModel(data);
  const caps = data?.capabilities || {};
  return {
    state,
    errorMessage: LOAD_ERROR_TEXT,
    source: { kind, isPreview: kind !== "live", label: text(snapshot?.source?.label, "Fonte não identificada") },
    productVersion: buildProductVersionViewModel(data),
    releases,
    history: buildHistoryViewModel(data, releases),
    capabilities: {
      canEvaluateReversal: caps.canEvaluateReversal === true,
      canExecuteReversal: caps.canExecuteReversal === true,
    },
  };
}
