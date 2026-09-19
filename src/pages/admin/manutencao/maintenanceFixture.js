// ════════════════════════════════════════════════════════════
//  PDB-I3-FE2 — Fixture LOCAL da tela Manutenção.
//  Representa um estado SEGURO e OCIOSO: NORMAL, nenhuma execução, nada
//  comprovado. Não é leitura de HML/PROD e nada aqui vem de rede, Supabase ou
//  executor. Sem timestamps inventados (`lastUpdatedAt: null` → "Prévia
//  estática"), sem eventos, sem heartbeat, sem contadores: o que não foi
//  observado é `null`/AWAITING_INTEGRATION — nunca "0".
//
//  Trocar por dados reais = trocar o data source (maintenanceDataSource.js) por
//  um adapter que devolva ESTE mesmo formato; view-models e componentes não mudam.
// ════════════════════════════════════════════════════════════

/** Snapshot bruto no formato que qualquer data source (fixture/live) entrega. */
export const MAINTENANCE_FIXTURE = Object.freeze({
  status: "ready",
  mode: "PREVIEW",
  source: { kind: "fixture", label: "Prévia da funcionalidade" },
  connectionState: "preview",
  lastUpdatedAt: null,

  maintenance: {
    phase: "NORMAL",
    status: "NORMAL",
    epoch: null,
    version: null,
    startedAt: null,
    completedAt: null,
  },

  execution: {
    executionId: null,
    planId: null,
    correlationId: null,
    targetSha: null,
    environment: "producao",
    status: "NONE",
    progress: { overall: null, phase: null },
    currentStep: null,
    startedAt: null,
    elapsedSeconds: null,
    currentMigration: null,
    migrationCount: 3,
  },

  plan: { status: "AWAITING_VALIDATION" },

  protections: {
    loginGate: { status: "OPEN" },
    writeFence: { status: "NOT_VALIDATED", active: false, coveragePending: true },
    activeSessions: {
      status: "AWAITING_INTEGRATION",
      count: null,
      proofGeneratedAt: null,
      heartbeatAfterClosureCount: null,
    },
    inFlightOperations: {
      status: "AWAITING_INTEGRATION",
      count: null,
      coverage: null,
      observedAt: null,
    },
    executionLock: { status: "AWAITING_EXECUTOR", heldBy: null, expiresAt: null },
    backup: {
      status: "NOT_STARTED",
      mode: null,
      verificationLevel: null,
      createdAt: null,
      verifiedAt: null,
      artifactCount: null,
      recoveryPoint: null,
    },
  },

  executor: { status: "IDLE", worker: null, heartbeatAt: null, leaseExpiresAt: null },

  migrations: [
    { order: 1, id: "160", filename: "160_db_release_orchestrator_foundation.sql", state: "IN_PREPARATION" },
    { order: 2, id: "161", filename: "161_canonical_session_admission.sql", state: "IN_PREPARATION" },
    { order: 3, id: "162", filename: "162_db_release_runtime_hardening.sql", state: "IN_PREPARATION" },
  ],

  // Sem eventos: a prévia não registra execução alguma.
  timeline: [],

  // Autoridade das ações. Nesta etapa nada crítico é permitido.
  capabilities: {
    canStart: false,
    canCancel: false,
    canRetry: false,
    canReconcile: false,
    canViewDetails: true,
  },
});
