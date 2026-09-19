// ════════════════════════════════════════════════════════════
//  PDB-I2C1 — Store de execuções DB + lock exclusivo de ambiente.
//
//  Espelha app_db_release_executions (migration 160) atrás de uma PORTA
//  injetável. Este módulo não conecta em nada: sem fetch, sem ambiente de
//  processo, sem DB live. Só há implementação em memória (testes). O
//  transport de produção é escopo de I2D.
//
//  CONTRATO DE ATOMICIDADE (o que uma realização real DEVE garantir):
//   • claimEnvironment({lock, execution}) é UMA operação atômica
//     all-or-nothing: cria o lock do ambiente E a execução juntos, ou nada.
//     Nunca "lock sem execução" nem "execução sem lock".
//   • Realização real exige transação/RPC única, ou INSERT protegido por
//     índice único parcial (1 execução não-terminal por ambiente) +
//     unique(plan_id, correlation_id). Dois writes PostgREST independentes
//     NÃO satisfazem o contrato.
//   • heartbeat/transição são CAS: condicionados a (status, executor_id,
//     heartbeat_at) lidos antes — escrita obsoleta vira *_CONFLICT.
//   • Sem DELETE de execução. Lock só sai por releaseLock do dono exato.
//
//  GAP DE SCHEMA (migration 160 não tem; NÃO criamos migration 162 aqui):
//   colunas persistidas = PERSISTED_EXECUTION_COLUMNS. Campos que existem só
//   no adapter (ADAPTER_ONLY_EXECUTION_FIELDS) não são persistidos ainda:
//   leaseGeneration, lockKey/projectRef (derivável do environment) e o
//   binding planHash/SHAs (derivável via plan_id). Falta também: índice
//   único parcial por ambiente e unique(plan_id, correlation_id).
// ════════════════════════════════════════════════════════════

import {
  isActiveExecutionStatus,
} from "./db-release-executor-contract.js";

export const PERSISTED_EXECUTION_COLUMNS = Object.freeze([
  "id",
  "plan_id",
  "environment",
  "status",
  "correlation_id",
  "executor_id",
  "started_at",
  "completed_at",
  "heartbeat_at",
  "failure_code",
  "failure_message",
  "created_at",
]);

export const ADAPTER_ONLY_EXECUTION_FIELDS = Object.freeze([
  "projectRef",
  "leaseGeneration",
  "lockKey",
  "planHash",
  "targetReleaseSha",
  "baseSha",
]);

export const EXECUTION_STORE_PORT = Object.freeze([
  "getExecution",
  "findExecutionByCorrelation",
  "listExecutionsForPlan",
  "readEnvironmentLock",
  "claimEnvironment",
  "heartbeatLease",
  "conditionalTransition",
  "releaseLock",
]);

export function isExecutionStore(store) {
  return Boolean(store) && EXECUTION_STORE_PORT.every((name) => typeof store[name] === "function");
}

/** Domínio → linha de app_db_release_executions (somente colunas reais). */
export function toExecutionRow(execution) {
  if (!execution) return null;
  return {
    id: execution.id,
    plan_id: execution.planId,
    environment: execution.environment,
    status: execution.status,
    correlation_id: execution.correlationId ?? null,
    executor_id: execution.workerId ?? null,
    started_at: execution.startedAt ?? null,
    completed_at: execution.completedAt ?? null,
    heartbeat_at: execution.heartbeatAt ?? null,
    failure_code: execution.failureCode ?? null,
    failure_message: execution.failureMessage ?? null,
    created_at: execution.claimedAt ?? null,
  };
}

/** Linha persistida + campos de adapter → domínio. */
export function fromExecutionRow(row, adapter = {}) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    environment: row.environment,
    status: row.status,
    correlationId: row.correlation_id ?? null,
    workerId: row.executor_id ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    heartbeatAt: row.heartbeat_at ?? null,
    failureCode: row.failure_code ?? null,
    failureMessage: row.failure_message ?? null,
    claimedAt: row.created_at ?? null,
    projectRef: adapter.projectRef ?? null,
    leaseGeneration: adapter.leaseGeneration ?? null,
    planHash: adapter.planHash ?? null,
    targetReleaseSha: adapter.targetReleaseSha ?? null,
    baseSha: adapter.baseSha ?? null,
  };
}

const TRANSITION_PATCH_KEYS = Object.freeze([
  "status",
  "startedAt",
  "completedAt",
  "failureCode",
  "failureMessage",
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

/**
 * Store em memória. `faults` simula backends NÃO-atômicos/instáveis:
 *   unavailable: true            → nada é escrito (STORE_UNAVAILABLE)
 *   partialClaim: "LOCK_ONLY"    → grava só o lock e devolve CLAIM_AMBIGUOUS
 *   partialClaim: "EXECUTION_ONLY" → grava só a execução, CLAIM_AMBIGUOUS
 *   throwOnClaim: true           → lança depois de gravar (lock+execução)
 *   failReleaseLock: true        → releaseLock falha (compensação impossível)
 *   failTransition: true         → conditionalTransition falha
 * Cada método é síncrono por dentro (check-and-set sem await): atômico.
 */
export function createMemoryExecutionStore({ faults = {} } = {}) {
  const executions = new Map();
  const locks = new Map();
  const counters = { claimWrites: 0, heartbeatWrites: 0, transitionWrites: 0, lockReleases: 0 };
  const activeFaults = { ...faults };

  async function tick() {
    await Promise.resolve();
  }

  const store = {
    counters,
    faults: activeFaults,

    async getExecution(executionId) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      return { ok: true, execution: clone(executions.get(executionId) ?? null) };
    },

    async findExecutionByCorrelation({ planId, correlationId } = {}) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      for (const execution of executions.values()) {
        if (execution.planId === planId && execution.correlationId === correlationId) {
          return { ok: true, execution: clone(execution) };
        }
      }
      return { ok: true, execution: null };
    },

    async listExecutionsForPlan(planId) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      const rows = [...executions.values()].filter((execution) => execution.planId === planId);
      return { ok: true, executions: clone(rows) };
    },

    async readEnvironmentLock(lockKey) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      return { ok: true, lock: clone(locks.get(lockKey) ?? null) };
    },

    async claimEnvironment({ lock, execution } = {}) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      if (
        !lock || !execution
        || lock.executionId !== execution.id
        || lock.workerId !== execution.workerId
        || lock.leaseGeneration !== execution.leaseGeneration
        || lock.environment !== execution.environment
        || lock.projectRef !== execution.projectRef
      ) {
        return { ok: false, code: "CLAIM_BINDING_INVALID" };
      }
      // ── seção atômica (sem await) ──
      for (const existing of executions.values()) {
        if (existing.planId === execution.planId && existing.correlationId === execution.correlationId) {
          return { ok: false, code: "CORRELATION_EXISTS", execution: clone(existing) };
        }
      }
      const held = locks.get(lock.lockKey);
      if (held) {
        return {
          ok: false,
          code: "LOCK_HELD",
          lock: clone(held),
          holder: clone(executions.get(held.executionId) ?? null),
        };
      }
      if (activeFaults.partialClaim === "LOCK_ONLY") {
        locks.set(lock.lockKey, clone(lock));
        return { ok: false, code: "CLAIM_AMBIGUOUS" };
      }
      if (activeFaults.partialClaim === "EXECUTION_ONLY") {
        executions.set(execution.id, clone(execution));
        return { ok: false, code: "CLAIM_AMBIGUOUS" };
      }
      locks.set(lock.lockKey, clone(lock));
      executions.set(execution.id, clone(execution));
      counters.claimWrites += 1;
      if (activeFaults.throwOnClaim) throw new Error("STORE_CONNECTION_LOST_AFTER_WRITE");
      return { ok: true, execution: clone(execution), lock: clone(lock) };
    },

    /**
     * Único efeito: heartbeatAt. Nunca altera plano/SHA/ambiente/status.
     * CAS: id + executor + geração + status ativo + heartbeat lido antes +
     * lock do mesmo dono.
     */
    async heartbeatLease({
      executionId,
      workerId,
      leaseGeneration,
      expectedHeartbeatAt,
      heartbeatAt,
    } = {}) {
      await tick();
      if (activeFaults.unavailable) return { ok: false, code: "STORE_UNAVAILABLE" };
      const execution = executions.get(executionId);
      if (!execution) return { ok: false, code: "EXECUTION_NOT_FOUND" };
      if (
        execution.workerId !== workerId
        || execution.leaseGeneration !== leaseGeneration
        || !isActiveExecutionStatus(execution.status)
        || execution.heartbeatAt !== expectedHeartbeatAt
      ) {
        return { ok: false, code: "HEARTBEAT_CONFLICT" };
      }
      const lock = [...locks.values()].find((item) => item.executionId === executionId);
      if (!lock || lock.workerId !== workerId || lock.leaseGeneration !== leaseGeneration) {
        return { ok: false, code: "HEARTBEAT_CONFLICT" };
      }
      execution.heartbeatAt = heartbeatAt;
      counters.heartbeatWrites += 1;
      return { ok: true, execution: clone(execution) };
    },

    /** CAS por (status, heartbeatAt). Patch restrito a TRANSITION_PATCH_KEYS. */
    async conditionalTransition({ executionId, fromStatus, expectedHeartbeatAt, patch } = {}) {
      await tick();
      if (activeFaults.unavailable || activeFaults.failTransition) {
        return { ok: false, code: "STORE_UNAVAILABLE" };
      }
      const execution = executions.get(executionId);
      if (!execution) return { ok: false, code: "EXECUTION_NOT_FOUND" };
      if (execution.status !== fromStatus || execution.heartbeatAt !== expectedHeartbeatAt) {
        return { ok: false, code: "TRANSITION_CONFLICT" };
      }
      const keys = Object.keys(patch || {});
      if (keys.length === 0 || keys.some((key) => !TRANSITION_PATCH_KEYS.includes(key))) {
        return { ok: false, code: "TRANSITION_PATCH_INVALID" };
      }
      Object.assign(execution, patch);
      counters.transitionWrites += 1;
      return { ok: true, execution: clone(execution) };
    },

    /** Só o dono exato (execução + worker + geração) libera o lock. */
    async releaseLock({ lockKey, executionId, workerId, leaseGeneration } = {}) {
      await tick();
      if (activeFaults.unavailable || activeFaults.failReleaseLock) {
        return { ok: false, code: "STORE_UNAVAILABLE" };
      }
      const held = locks.get(lockKey);
      if (!held) return { ok: false, code: "LOCK_NOT_HELD" };
      if (
        held.executionId !== executionId
        || held.workerId !== workerId
        || held.leaseGeneration !== leaseGeneration
      ) {
        return { ok: false, code: "LOCK_OWNER_MISMATCH" };
      }
      locks.delete(lockKey);
      counters.lockReleases += 1;
      return { ok: true };
    },

    // ── utilitários de teste (fora da porta) ──
    snapshot() {
      return { executions: clone([...executions.values()]), locks: clone([...locks.values()]) };
    },
    /** Testes: simula relógio/worker morto sem passar pela porta. */
    __setHeartbeatForTest(executionId, heartbeatAt) {
      const execution = executions.get(executionId);
      if (execution) execution.heartbeatAt = heartbeatAt;
    },
    __setStatusForTest(executionId, status) {
      const execution = executions.get(executionId);
      if (execution) execution.status = status;
    },
  };
  return store;
}
