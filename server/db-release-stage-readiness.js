// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Readiness por ESTÁGIO (evita dependência circular).
//
//  O readiness GLOBAL (`ready=true`) continua significando "todo gate
//  aplicável pré-migration está VERIFIED" — inalterado. Mas gates como
//  LOCK_ACQUIRED, LOGIN_GATE_CLOSED, ACTIVE_SESSION_COUNT_ZERO,
//  IN_FLIGHT_OPERATION_COUNT_ZERO, WRITE_FENCE_ACTIVE e BACKUP_VERIFIED só
//  podem ficar VERIFIED DEPOIS que a execução começa. Exigir `ready` para
//  fazer o claim seria circular. Por isso a orquestração usa perfis:
//
//  (contagens: imediato / agendado — o agendado soma SCHEDULE_WINDOW_VALID)
//    CLAIMABLE         (I2C1) evidência válida ANTES da posse         (9 / 10)
//    READY_TO_QUIESCE  (I2C2) + LOCK_ACQUIRED, EXECUTOR_HEALTHY       (11 / 12)
//                     = posse/lease do executor; pode iniciar NOTICE/FENCING.
//    READY_TO_BACKUP   (I2C2) + LOGIN_GATE_CLOSED, WRITE_FENCE_ACTIVE
//                       (com COBERTURA completa), ACTIVE_SESSION_COUNT_ZERO
//                       (prova canônica da geração atual), IN_FLIGHT_OPERATION
//                       _COUNT_ZERO (coverage autoritativa)           (15 / 16)
//                     NÃO exige BACKUP_VERIFIED.
//    READY_TO_MIGRATE  (I2C2) + BACKUP_VERIFIED = readiness GLOBAL   (16 / 17).
//                     É o primeiro
//                     ponto onde `ready=true` pode legitimamente existir.
//
//  Cada perfil é estritamente superconjunto do anterior: nenhum gate é
//  enfraquecido, nenhum gate desconhecido/stale é tratado como especial.
//  CLAIMABLE ≠ DB_RELEASE_READY. CLAIMABLE nunca autoriza MIGRATING.
//  Além dos gates, o executor exige (fora deste módulo) binding de manutenção
//  (db_plan_id/target/plan_kind) e geração de prova de sessão == geração atual.
//  Puro: sem fetch, sem processo, sem DB, sem timer.
// ════════════════════════════════════════════════════════════

import {
  ALWAYS_REQUIRED_READINESS_GATES,
  CANONICAL_READINESS_GATES,
  READINESS_APPLICABILITY,
} from "./db-release-contract.js";
import {
  applyGateFreshness,
  computeOverallReadiness,
  deriveGatesFromEvidence,
} from "./db-release-readiness.js";
import { SCHEDULE_CLAIM_WINDOW_MS } from "./db-release-executor-contract.js";
import { EXECUTION_EVIDENCE_FRESHNESS_MS } from "./db-release-executor-lease.js";
import { parseIsoMs, toIso } from "./db-backup-contract.js";

export const READINESS_STAGES = Object.freeze([
  "CLAIMABLE",
  "READY_TO_QUIESCE",
  "READY_TO_BACKUP",
  "READY_TO_MIGRATE",
]);

/** Evidência que precisa estar válida ANTES de adquirir ownership. */
export const CLAIMABLE_GATES = Object.freeze([
  "GIT_SHA_MATCH",
  "HML_VALIDATED",
  "PROD_BASELINE_VERIFIED",
  "MIGRATION_SET_FROZEN",
  "MIGRATION_IDENTITY_VERIFIED",
  "SCHEMA_SAFETY_PASS",
  "NO_DML",
  "NO_DESTRUCTIVE_DDL",
  "HUMAN_APPROVAL_VALID",
  "SCHEDULE_WINDOW_VALID",
]);

/** Estabelecidos SOMENTE depois do claim — nunca exigidos por ele. */
export const POST_CLAIM_GATES = Object.freeze([
  "LOCK_ACQUIRED",
  "EXECUTOR_HEALTHY",
  "LOGIN_GATE_CLOSED",
  "WRITE_FENCE_ACTIVE",
  "ACTIVE_SESSION_COUNT_ZERO",
  "IN_FLIGHT_OPERATION_COUNT_ZERO",
  "BACKUP_VERIFIED",
]);

const QUIESCE_ADDS = ["LOCK_ACQUIRED", "EXECUTOR_HEALTHY"];
const BACKUP_ADDS = [
  "LOGIN_GATE_CLOSED",
  "WRITE_FENCE_ACTIVE",
  "ACTIVE_SESSION_COUNT_ZERO",
  "IN_FLIGHT_OPERATION_COUNT_ZERO",
];
const MIGRATE_ADDS = ["BACKUP_VERIFIED"];

export const STAGE_PROFILES = Object.freeze({
  CLAIMABLE: Object.freeze({
    implemented: true,
    gates: CLAIMABLE_GATES,
  }),
  READY_TO_QUIESCE: Object.freeze({
    implemented: true,
    gates: Object.freeze([...CLAIMABLE_GATES, ...QUIESCE_ADDS]),
  }),
  READY_TO_BACKUP: Object.freeze({
    implemented: true,
    gates: Object.freeze([...CLAIMABLE_GATES, ...QUIESCE_ADDS, ...BACKUP_ADDS]),
  }),
  READY_TO_MIGRATE: Object.freeze({
    implemented: true,
    gates: Object.freeze([...CLAIMABLE_GATES, ...QUIESCE_ADDS, ...BACKUP_ADDS, ...MIGRATE_ADDS]),
  }),
});

/** Gates que só o SERVIDOR injeta (ainda sem derivador canônico; I2D). */
export const SERVER_INJECTABLE_GATES = Object.freeze(["HML_VALIDATED", "PROD_BASELINE_VERIFIED"]);

const APPLICABILITY_BY_KEY = Object.freeze(
  Object.fromEntries(CANONICAL_READINESS_GATES.map((gate) => [gate.key, gate.applicability])),
);

export function stageGateKeys(stage, { scheduled = false } = {}) {
  const profile = STAGE_PROFILES[stage];
  if (!profile) return [];
  return profile.gates.filter((key) => (
    APPLICABILITY_BY_KEY[key] !== READINESS_APPLICABILITY.SCHEDULED || scheduled === true
  ));
}

/**
 * Avalia um perfil de estágio contra gates canônicos. Só VERIFIED satisfaz;
 * ausente/UNKNOWN/PENDING/STALE/FAILED/BLOCKED → bloqueia (fail-closed).
 * Gates fora do perfil são IGNORADOS — é exatamente o que evita o ciclo.
 * Perfis são superconjuntos crescentes; só `STAGE_PROFILE_RESERVED` (perfil
 * não implementado) é sempre insatisfeito — hoje nenhum perfil é reservado.
 */
export function evaluateStageReadiness({ stage, gates, scheduled = false } = {}) {
  const profile = STAGE_PROFILES[stage];
  if (!profile) {
    return {
      stage: stage ?? null,
      implemented: false,
      satisfied: false,
      claimable: false,
      reasonCode: "STAGE_UNKNOWN",
      requiredGates: [],
      blockers: [],
    };
  }
  const requiredGates = stageGateKeys(stage, { scheduled });
  if (!profile.implemented) {
    return {
      stage,
      implemented: false,
      satisfied: false,
      claimable: false,
      reasonCode: "STAGE_PROFILE_RESERVED",
      requiredGates,
      blockers: [],
    };
  }
  const list = Array.isArray(gates) ? gates : [];
  const byKey = new Map();
  const duplicates = new Set();
  for (const gate of list) {
    if (!gate?.key) continue;
    if (byKey.has(gate.key)) duplicates.add(gate.key);
    else byKey.set(gate.key, gate);
  }
  const blockers = [];
  for (const key of requiredGates) {
    const gate = byKey.get(key);
    if (duplicates.has(key)) {
      blockers.push({ key, status: "FAILED", reasonCode: "DUPLICATE_GATE_KEY" });
    } else if (!gate) {
      blockers.push({ key, status: "UNKNOWN", reasonCode: "MISSING_GATE_EVIDENCE" });
    } else if (gate.status !== "VERIFIED") {
      blockers.push({ key, status: gate.status, reasonCode: gate.reasonCode ?? "GATE_NOT_VERIFIED" });
    } else if (
      APPLICABILITY_BY_KEY[key] === READINESS_APPLICABILITY.SCHEDULED && gate.applicable === false
    ) {
      blockers.push({ key, status: "UNKNOWN", reasonCode: "GATE_NOT_APPLICABLE_TO_SCHEDULE" });
    }
  }
  const satisfied = blockers.length === 0;
  return {
    stage,
    implemented: true,
    satisfied,
    claimable: stage === "CLAIMABLE" && satisfied,
    reasonCode: satisfied ? "STAGE_SATISFIED" : "STAGE_BLOCKED",
    requiredGates,
    blockers,
  };
}

/** Janela [scheduledAt, scheduledAt + janela): fora dela não é claimable. */
export function deriveScheduleWindowGate(plan, { nowMs, claimedAtMs = null } = {}) {
  const key = "SCHEDULE_WINDOW_VALID";
  const base = (status, reasonCode, message, expiresAtMs = nowMs + EXECUTION_EVIDENCE_FRESHNESS_MS) => ({
    key,
    status,
    reasonCode,
    message,
    evidenceAt: toIso(nowMs),
    expiresAt: toIso(expiresAtMs),
  });
  // PDB-I2C2 — plano já RUNNING: a janela governa o INÍCIO (claim), não a
  // duração do pipeline. Vale se o claim ocorreu dentro de [agenda, agenda+janela).
  if (plan?.status === "RUNNING" && Number.isFinite(claimedAtMs)) {
    const runScheduledMs = parseIsoMs(plan.scheduledAt);
    if (runScheduledMs == null) {
      return base("FAILED", "SCHEDULE_INVALID", "Timestamp de agenda ausente ou inválido.");
    }
    if (claimedAtMs < runScheduledMs || claimedAtMs >= runScheduledMs + SCHEDULE_CLAIM_WINDOW_MS) {
      return base("BLOCKED", "SCHEDULE_CLAIM_OUTSIDE_WINDOW", "Claim ocorreu fora da janela de agenda.");
    }
    return base("VERIFIED", "SCHEDULE_CLAIMED_IN_WINDOW", "Execução foi reivindicada dentro da janela de agenda.");
  }
  if (!plan || plan.status !== "SCHEDULED") {
    return base("BLOCKED", "SCHEDULE_INTENT_MISSING", "Plano não está SCHEDULED.");
  }
  const scheduledMs = parseIsoMs(plan.scheduledAt);
  if (scheduledMs == null || !Number.isFinite(nowMs)) {
    return base("FAILED", "SCHEDULE_INVALID", "Timestamp de agenda ausente ou inválido.");
  }
  if (nowMs < scheduledMs) {
    return base("PENDING", "SCHEDULE_NOT_DUE", "Janela de agenda ainda não abriu.");
  }
  const endMs = scheduledMs + SCHEDULE_CLAIM_WINDOW_MS;
  if (nowMs >= endMs) {
    return base("STALE", "SCHEDULE_WINDOW_EXPIRED", "Janela de agenda expirou; reagendamento humano necessário.");
  }
  return base("VERIFIED", "SCHEDULE_WINDOW_OPEN", "Instante T dentro da janela de agenda.", endMs);
}

/**
 * Gates do estágio CLAIMABLE reavaliados no instante T a partir de evidência
 * colhida NO SERVIDOR. O plano vem do store (nunca do request). Gates que o
 * readiness ainda não sabe derivar (HML_VALIDATED, PROD_BASELINE_VERIFIED)
 * só entram por `gateOverrides` do coletor servidor, restritos à lista
 * SERVER_INJECTABLE_GATES — jamais do request.
 */
export function deriveClaimableGates({
  plan,
  evidence = {},
  gateOverrides = [],
  intent,
  nowMs,
} = {}) {
  // Ownership (evidence.execution) não existe antes do claim: nunca é usada aqui.
  const claimEvidence = { ...(evidence || {}) };
  delete claimEvidence.execution;
  return deriveGatesCore({ plan, evidence: claimEvidence, gateOverrides, scheduled: intent === "SCHEDULED", nowMs });
}

/**
 * PDB-I2C2 — gates canônicos para estágios PÓS-claim. Mesma derivação de
 * evidência, mas com o plano RUNNING, evidência de posse (lock/lease) e
 * evidência runtime (manutenção, sessões, in-flight, backup) do servidor.
 * `scheduled` vem do PLANO (agenda persistida), nunca do request.
 */
export function deriveExecutionStageGates({
  plan,
  execution = null,
  evidence = {},
  gateOverrides = [],
  nowMs,
} = {}) {
  const scheduled = Boolean(plan?.scheduledAt);
  const claimedAtMs = execution ? parseIsoMs(execution.claimedAt) : null;
  return deriveGatesCore({
    plan,
    evidence: evidence || {},
    gateOverrides,
    scheduled,
    nowMs,
    claimedAtMs,
    requireSessionGeneration: true,
  });
}

function deriveGatesCore({
  plan,
  evidence,
  gateOverrides,
  scheduled,
  nowMs,
  claimedAtMs = null,
  requireSessionGeneration = false,
}) {
  const planEvidence = plan
    ? { ok: true, ...plan, evaluatedAt: toIso(nowMs) }
    : { ok: false, errorCode: "PLAN_EVIDENCE_UNAVAILABLE" };
  const derived = deriveGatesFromEvidence(
    { ...evidence, plan: planEvidence },
    { releaseSha: plan?.targetReleaseSha, scheduled, nowMs, requireSessionGeneration },
  );
  const injected = new Map();
  for (const override of Array.isArray(gateOverrides) ? gateOverrides : []) {
    if (SERVER_INJECTABLE_GATES.includes(override?.key) && !injected.has(override.key)) {
      injected.set(override.key, override);
    }
  }
  return derived.map((gate) => {
    if (gate.key === "SCHEDULE_WINDOW_VALID" && scheduled) {
      return applyGateFreshness({
        ...deriveScheduleWindowGate(plan, { nowMs, claimedAtMs }),
        required: true,
        applicable: true,
      }, nowMs);
    }
    const override = injected.get(gate.key);
    if (override) {
      return applyGateFreshness({ ...override, required: true, applicable: true }, nowMs);
    }
    return gate;
  });
}

/** Sanidade: CLAIMABLE ∪ POST_CLAIM cobre exatamente as 17 gates canônicas. */
export function stagePartitionIsComplete() {
  const union = new Set([...CLAIMABLE_GATES, ...POST_CLAIM_GATES]);
  return union.size === CLAIMABLE_GATES.length + POST_CLAIM_GATES.length
    && ALWAYS_REQUIRED_READINESS_GATES.every((key) => union.has(key))
    && union.has("SCHEDULE_WINDOW_VALID")
    && union.size === CANONICAL_READINESS_GATES.length;
}

export { computeOverallReadiness };
