// ════════════════════════════════════════════════════════════
//  PDB-I2C2 — Store de STEPS de execução DB (app_db_release_execution_steps).
//
//  Porta injetável + implementação em memória (testes). Não conecta em nada:
//  sem fetch, sem ambiente, sem DB live. O transport real é escopo de I2D.
//
//  Schema real (migration 160): id, execution_id, step_order, step_type,
//  status, started_at, completed_at, evidence (jsonb), error_code,
//  error_message, created_at — unique(execution_id, step_order). NÃO existe
//  coluna de tentativas nem de "resultado de commit": esses metadados vão em
//  `evidence` (jsonb, sem chaves secretas) — nenhuma coluna é inventada.
//
//  CONTRATO:
//   • beginStep é INSERT-IF-ABSENT (unique execution+ordem): re-entrada devolve
//     o step existente (created:false), nunca duplica;
//   • finishStep é CAS por (status esperado): escrita obsoleta vira conflito;
//   • steps nunca são apagados.
// ════════════════════════════════════════════════════════════

import { EXECUTION_STEP_STATUSES, EXECUTION_STEP_TYPES } from "./db-release-contract.js";
import { containsSecretMaterial } from "./db-backup-contract.js";

export const PERSISTED_STEP_COLUMNS = Object.freeze([
  "id",
  "execution_id",
  "step_order",
  "step_type",
  "status",
  "started_at",
  "completed_at",
  "evidence",
  "error_code",
  "error_message",
  "created_at",
]);

export const STEP_STORE_PORT = Object.freeze(["getStep", "listSteps", "beginStep", "finishStep"]);

export function isStepStore(store) {
  return Boolean(store) && STEP_STORE_PORT.every((name) => typeof store[name] === "function");
}

/** Espelha app_db_release_execution_steps_evidence_secrets_check (top-level). */
const FORBIDDEN_EVIDENCE_KEYS = Object.freeze([
  "authorization", "Authorization", "service_role", "service_role_key", "password", "secret", "token", "api_key",
]);

export function evidenceIsPersistable(evidence) {
  if (evidence == null) return true;
  if (typeof evidence !== "object" || Array.isArray(evidence)) return false;
  if (Object.keys(evidence).some((key) => FORBIDDEN_EVIDENCE_KEYS.includes(key))) return false;
  return !containsSecretMaterial(evidence);
}

export function toStepRow(step) {
  if (!step) return null;
  return {
    id: step.id,
    execution_id: step.executionId,
    step_order: step.stepOrder,
    step_type: step.stepType,
    status: step.status,
    started_at: step.startedAt ?? null,
    completed_at: step.completedAt ?? null,
    evidence: step.evidence ?? null,
    error_code: step.errorCode ?? null,
    error_message: step.errorMessage ?? null,
    created_at: step.createdAt ?? null,
  };
}

export function fromStepRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    executionId: row.execution_id,
    stepOrder: row.step_order,
    stepType: row.step_type,
    status: row.status,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    evidence: row.evidence ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at ?? null,
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

/**
 * Store em memória. `faults`: unavailable → nada é escrito;
 * failFinish → finishStep falha (o step fica RUNNING).
 */
export function createMemoryStepStore({ faults = {}, newId } = {}) {
  const steps = new Map();
  const counters = { begins: 0, finishes: 0 };
  const activeFaults = { ...faults };
  let seq = 0;
  const key = (executionId, stepOrder) => `${executionId}#${stepOrder}`;
  const makeId = newId ?? (() => {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  });
  const tick = () => Promise.resolve();

  return {
    counters,
    faults: activeFaults,

    async getStep({ executionId, stepOrder } = {}) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      return { ok: true, step: clone(steps.get(key(executionId, stepOrder)) ?? null) };
    },

    async listSteps(executionId) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      const rows = [...steps.values()]
        .filter((step) => step.executionId === executionId)
        .sort((left, right) => left.stepOrder - right.stepOrder);
      return { ok: true, steps: clone(rows) };
    },

    async beginStep({ executionId, stepOrder, stepType, startedAt, evidence = null } = {}) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      if (!Number.isInteger(stepOrder) || stepOrder < 1) return { ok: false, code: "STEP_ORDER_INVALID" };
      if (!EXECUTION_STEP_TYPES.includes(stepType)) return { ok: false, code: "STEP_TYPE_INVALID" };
      if (!evidenceIsPersistable(evidence)) return { ok: false, code: "STEP_EVIDENCE_UNSAFE" };
      // ── seção atômica (sem await) ──
      const existing = steps.get(key(executionId, stepOrder));
      if (existing) return { ok: true, created: false, step: clone(existing) };
      const step = {
        id: makeId(),
        executionId,
        stepOrder,
        stepType,
        status: "RUNNING",
        startedAt: startedAt ?? null,
        completedAt: null,
        evidence: clone(evidence),
        errorCode: null,
        errorMessage: null,
        createdAt: startedAt ?? null,
      };
      steps.set(key(executionId, stepOrder), step);
      counters.begins += 1;
      return { ok: true, created: true, step: clone(step) };
    },

    async finishStep({
      executionId,
      stepOrder,
      fromStatus = "RUNNING",
      status,
      completedAt,
      evidence,
      errorCode = null,
      errorMessage = null,
    } = {}) {
      await tick();
      if (activeFaults.unavailable || activeFaults.failFinish) return { ok: false, code: "STORE_UNAVAILABLE" };
      if (!EXECUTION_STEP_STATUSES.includes(status) || status === "PENDING" || status === "RUNNING") {
        return { ok: false, code: "STEP_STATUS_INVALID" };
      }
      if (evidence !== undefined && !evidenceIsPersistable(evidence)) return { ok: false, code: "STEP_EVIDENCE_UNSAFE" };
      const step = steps.get(key(executionId, stepOrder));
      if (!step) return { ok: false, code: "STEP_NOT_FOUND" };
      if (step.status !== fromStatus) return { ok: false, code: "STEP_CONFLICT", step: clone(step) };
      step.status = status;
      step.completedAt = completedAt ?? null;
      if (evidence !== undefined) step.evidence = clone({ ...(step.evidence || {}), ...(evidence || {}) });
      step.errorCode = errorCode;
      step.errorMessage = errorMessage;
      counters.finishes += 1;
      return { ok: true, step: clone(step) };
    },

    snapshot() {
      return clone([...steps.values()]);
    },
  };
}
