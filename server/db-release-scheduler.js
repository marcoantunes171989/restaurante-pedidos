// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Scheduler de UMA iteração (puro, sem cron, sem timer).
//
//  Acha o plano agendado devido numa fonte injetada, valida a janela com o
//  relógio do servidor, e tenta o claim UMA vez pelo MESMO serviço usado
//  pela execução imediata. Nenhum loop, setInterval, cron, provider ou
//  rede. O runtime (cron/worker) é decisão de I2D.
//
//  Idempotência: a correlação da tentativa agendada é DETERMINÍSTICA
//  (plano + hash + agenda + geração + tentativa); reinvocar para o mesmo
//  plano devido cai no replay do claim → ALREADY_CLAIMED, sem nova
//  execução, sem novo lock, sem novo evento de auditoria.
//
//  Fonte injetada (deps.planSource): findDueScheduledPlan({ nowIso }) →
//    { ok: true, plan: <plano público SCHEDULED mais antigo vencido>|null }
//  Realização futura espelha findDueScheduledRelease (release-store):
//    status=eq.SCHEDULED & scheduled_at=lte.<now> & order=scheduled_at.asc & limit=1
// ════════════════════════════════════════════════════════════

import {
  claimDbReleaseExecution,
} from "./db-release-executor-claim.js";
import { deriveScheduledAttemptCorrelationId } from "./db-release-executor-contract.js";
import { deriveScheduleWindowGate } from "./db-release-stage-readiness.js";
import { toIso } from "./db-backup-contract.js";

export const SCHEDULER_OUTCOMES = Object.freeze([
  "NO_DUE_PLAN",
  "NOT_DUE",
  "SCHEDULE_WINDOW_EXPIRED",
  "SCHEDULE_INVALID",
  "CLAIMED",
  "ALREADY_CLAIMED",
  "CLAIM_BLOCKED",
  "CLAIM_DENIED",
  "SOURCE_UNAVAILABLE",
  "DEPENDENCY_MISSING",
]);

function result(outcome, extra = {}) {
  return {
    ok: extra.ok ?? (outcome === "CLAIMED" || outcome === "ALREADY_CLAIMED" || outcome === "NO_DUE_PLAN"),
    outcome,
    backupTriggered: false,
    maintenanceStarted: false,
    migrationApplied: false,
    ...extra,
  };
}

const BLOCKED_OUTCOMES = Object.freeze(["LOCKED", "STALE", "AMBIGUOUS", "RECONCILIATION_REQUIRED"]);

/**
 * deps: { planSource, clock?, worker:{id}, planStore, executionStore,
 *         collectEvidence, audit?, attempt? } — o restante é repassado ao claim.
 */
export async function runDbReleaseSchedulerIteration(deps = {}) {
  if (!deps.planSource || typeof deps.planSource.findDueScheduledPlan !== "function") {
    return result("DEPENDENCY_MISSING", { ok: false });
  }
  const clock = deps.clock ?? { nowMs: () => Date.now() };
  const nowMs = typeof clock.nowMs === "function" ? clock.nowMs() : NaN;
  if (!Number.isFinite(nowMs)) return result("DEPENDENCY_MISSING", { ok: false });

  let due;
  try {
    due = await deps.planSource.findDueScheduledPlan({ nowIso: toIso(nowMs) });
  } catch {
    due = null;
  }
  if (!due || due.ok !== true) return result("SOURCE_UNAVAILABLE", { ok: false });
  const plan = due.plan;
  if (!plan) return result("NO_DUE_PLAN");

  // Validação de janela ANTES de tentar claim (sem tocar em store/lock).
  const window = deriveScheduleWindowGate(plan, { nowMs });
  if (window.status === "PENDING") return result("NOT_DUE", { ok: false, planId: plan.id });
  if (window.status === "STALE") return result("SCHEDULE_WINDOW_EXPIRED", { ok: false, planId: plan.id });
  if (window.status !== "VERIFIED") return result("SCHEDULE_INVALID", { ok: false, planId: plan.id });

  const correlationId = deriveScheduledAttemptCorrelationId({
    planId: plan.id,
    planHash: plan.planHash,
    scheduledAt: plan.scheduledAt,
    readinessGeneration: plan.readinessGeneration,
    attempt: deps.attempt ?? 1,
  });

  // Uma única tentativa. Sem retry, sem loop.
  const claim = await claimDbReleaseExecution({
    intent: "SCHEDULED",
    planId: plan.id,
    correlationId,
    expected: {
      environment: plan.environment,
      planHash: plan.planHash,
      targetReleaseSha: plan.targetReleaseSha,
      baseSha: plan.baseSha,
      approvedAt: plan.approvedAt,
      readinessGeneration: plan.readinessGeneration,
    },
  }, { ...deps, clock });

  const base = { planId: plan.id, correlationId, claim };
  if (claim.ok) {
    return result(claim.replay ? "ALREADY_CLAIMED" : "CLAIMED", base);
  }
  if (claim.outcome === "ALREADY_CLAIMED") return result("ALREADY_CLAIMED", { ...base, ok: true });
  if (BLOCKED_OUTCOMES.includes(claim.outcome)) {
    return result("CLAIM_BLOCKED", { ...base, ok: false, code: claim.code });
  }
  return result("CLAIM_DENIED", { ...base, ok: false, code: claim.code });
}
