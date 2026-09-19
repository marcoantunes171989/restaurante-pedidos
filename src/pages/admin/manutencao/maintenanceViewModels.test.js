import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAINTENANCE_FIXTURE } from "./maintenanceFixture.js";
import {
  applyMaintenancePatch,
  createFixtureDataSource,
  createPatchableDataSource,
  defaultMaintenanceDataSource,
} from "./maintenanceDataSource.js";
import { PHASE_STEPS, resolveLegacyPhase, resolvePhaseStepId } from "./maintenanceStatus.js";
import {
  buildCapabilitiesViewModel,
  buildMaintenancePageViewModel,
  buildPhaseStepperViewModel,
  buildTimelineViewModel,
  formatElapsed,
} from "./maintenanceViewModels.js";

const dir = dirname(fileURLToPath(import.meta.url));
const snap = (patch = {}) => applyMaintenancePatch(MAINTENANCE_FIXTURE, patch);
const page = (patch) => buildMaintenancePageViewModel(snap(patch));
const stateOf = (vm, id) => vm.stepper.steps.find((s) => s.id === id).state.key;
const protection = (vm, id) => vm.protections.byId[id];

describe("fixture principal — estado seguro e ocioso", () => {
  const vm = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);

  it("é NORMAL, sem execução, e não é live", () => {
    expect(vm.state).toBe("ready");
    expect(vm.source).toMatchObject({ kind: "fixture", isPreview: true });
    expect(vm.hero.state.label).toBe("Normal");
    expect(vm.hero.phaseTechnicalName).toBe("NORMAL");
    expect(vm.hero.environmentLabel).toBe("Produção");
    expect(vm.hero.execution.label).toBe("Nenhuma em andamento");
    expect(vm.hero.plan.label).toBe("Aguardando validações");
    expect(vm.hero.isIdle).toBe(true);
    expect(vm.connection.state).toBe("preview");
    expect(vm.connection.label).toBe("Prévia — dados de demonstração");
  });

  it("não usa horário falso: 'Prévia estática'", () => {
    expect(vm.lastUpdatedLabel).toBe("Prévia estática");
    expect(MAINTENANCE_FIXTURE.lastUpdatedAt).toBeNull();
  });

  it("nenhuma capability crítica; só ver detalhes", () => {
    expect(vm.capabilities).toMatchObject({ canStart: false, canCancel: false, canRetry: false, canReconcile: false, canViewDetails: true });
  });

  it("sem falha, sem eventos, sem progresso", () => {
    expect(vm.failure).toBeNull();
    expect(vm.timeline.isEmpty).toBe(true);
    expect(vm.timeline.emptyTitle).toBe("Nenhuma execução registrada nesta prévia.");
    expect(vm.progress.isIdle).toBe(true);
    expect(vm.progress.showBars).toBe(false);
    expect(vm.progress.summary).toBeNull();
    expect(vm.progress.idleMessage).toBe("Nenhuma atualização em andamento.");
  });

  it("fixture e snapshots são imutáveis", () => {
    expect(Object.isFrozen(MAINTENANCE_FIXTURE)).toBe(true);
  });

  it("migrations 160/161/162 'em preparação', nunca aplicadas", () => {
    expect(vm.migrations.items.map((m) => m.id)).toEqual(["160", "161", "162"]);
    expect(vm.migrations.headline).toBe("3 migrations em preparação");
    vm.migrations.items.forEach((m) => {
      expect(m.state.key).toBe("IN_PREPARATION");
      expect(m.state.label).toBe("Em preparação");
    });
    expect(vm.migrations.hasAmbiguous).toBe(false);
  });
});

describe("stepper — 9 etapas", () => {
  it("tem 9 etapas, a 1ª e a 9ª com nome técnico NORMAL mas ids distintos", () => {
    const { steps } = buildPhaseStepperViewModel(MAINTENANCE_FIXTURE);
    expect(steps).toHaveLength(9);
    expect(steps.map((s) => s.technicalName)).toEqual([
      "NORMAL", "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "NORMAL",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "Normal", "Aviso", "Proteção", "Drenagem", "Quiescência", "Backup", "Atualização", "Verificação", "Normalizado",
    ]);
    expect(new Set(steps.map((s) => s.id)).size).toBe(9);
    expect(steps[0].kind).toBe("start");
    expect(steps[8].kind).toBe("end");
  });

  it("cada etapa tem label, technicalName, description, state, order e helpText", () => {
    buildPhaseStepperViewModel(MAINTENANCE_FIXTURE).steps.forEach((s, i) => {
      expect(s.label).toBeTruthy();
      expect(s.technicalName).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.helpText.length).toBeGreaterThan(10);
      expect(s.state.label).toBeTruthy();
      expect(s.index).toBe(i + 1);
    });
  });

  it("NORMAL ocioso: a 1ª é atual e as demais pendentes (nada concluído)", () => {
    const vm = buildPhaseStepperViewModel(MAINTENANCE_FIXTURE);
    expect(vm.steps.map((s) => s.state.key)).toEqual(["current", ...Array(8).fill("pending")]);
    expect(vm.currentId).toBe("NORMAL_START");
    expect(vm.completedCount).toBe(0);
    expect(vm.steps.find((s) => s.id === "BACKING_UP").state.key).not.toBe("done");
    expect(vm.steps.find((s) => s.id === "MIGRATING").state.key).not.toBe("done");
    expect(vm.steps.find((s) => s.id === "SMOKE").state.key).not.toBe("done");
  });

  it("fase em andamento (fixture unitária isolada): anteriores done, atual current, seguintes pending", () => {
    const vm = page({ maintenance: { phase: "DRAINING" }, execution: { status: "RUNNING" } });
    expect(vm.stepper.steps.map((s) => s.state.key)).toEqual([
      "done", "done", "done", "current", "pending", "pending", "pending", "pending", "pending",
    ]);
    expect(vm.stepper.currentLabel).toBe("Drenagem");
    expect(vm.hero.state.label).toBe("Drenagem");
    expect(vm.hero.state.tone).toBe("brand");
    expect(vm.hero.isIdle).toBe(false);
  });

  // PDB-I3-FE3 — RELEASING (APP_RELEASE legado) NÃO é MIGRATING.
  it("RELEASING não é MIGRATING: nenhuma etapa do stepper é marcada como atual", () => {
    const vm = page({ maintenance: { phase: "RELEASING" }, execution: { status: "RUNNING" } });
    expect(vm.stepper.currentId).toBeNull();
    expect(vm.stepper.currentId).not.toBe("MIGRATING");
    expect(vm.stepper.currentIndex).toBe(-1);
    expect(vm.stepper.steps.map((s) => s.state.key)).not.toContain("current");
    expect(stateOf(vm, "MIGRATING")).toBe("pending");
  });

  it("RELEASING: rótulo próprio 'Liberação', nome técnico preservado e escopo APP_RELEASE explícito", () => {
    const vm = page({ maintenance: { phase: "RELEASING" }, execution: { status: "RUNNING" } });
    expect(vm.stepper.currentLabel).toBe("Liberação");
    expect(vm.stepper.currentLabel).not.toBe("Atualização");
    expect(vm.stepper.technicalPhase).toBe("RELEASING");
    expect(vm.hero.phaseTechnicalName).toBe("RELEASING");
    expect(vm.hero.state.label).toBe("Liberação");
    expect(vm.stepper.legacyPhase).toMatchObject({ technicalName: "RELEASING", scope: "APP_RELEASE", label: "Liberação" });
    expect(vm.stepper.legacyPhase.helpText).toMatch(/não faz parte da sequência de atualização do banco/i);
    // reconhecida (fluxo legado) — não é "fase não reconhecida"
    expect(vm.stepper.hasUnknownPhase).toBe(false);
  });

  it("RELEASING não entra na sequência DB_MIGRATION nem no rótulo da etapa MIGRATING", () => {
    expect(PHASE_STEPS.map((s) => s.technicalName)).not.toContain("RELEASING");
    expect(PHASE_STEPS.find((s) => s.id === "MIGRATING").label).toBe("Atualização");
    expect(resolvePhaseStepId("RELEASING")).toBeNull();
    expect(resolveLegacyPhase("RELEASING").technicalName).toBe("RELEASING");
    expect(resolveLegacyPhase("MIGRATING")).toBeNull();
  });

  it("MIGRATING continua sendo 'Atualização'", () => {
    const vm = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "RUNNING" } });
    expect(vm.stepper.currentId).toBe("MIGRATING");
    expect(vm.stepper.currentLabel).toBe("Atualização");
    expect(vm.stepper.legacyPhase).toBeNull();
  });

  it("linha do tempo: evento em RELEASING mostra 'Liberação', não 'Atualização'", () => {
    const vm = buildTimelineViewModel({ timeline: [{ id: "1", timestamp: "2026-10-01T12:00:00.000Z", phase: "RELEASING", type: "PHASE", title: "Liberação", status: "RUNNING" }] });
    expect(vm.items[0].phaseLabel).toBe("Liberação");
  });

  it("fase realmente desconhecida continua 'não reconhecida'", () => {
    const vm = page({ maintenance: { phase: "XYZ" } });
    expect(vm.stepper.hasUnknownPhase).toBe(true);
    expect(vm.stepper.legacyPhase).toBeNull();
  });

  it("NORMAL + execução concluída = normalização final (a 9ª), todas as anteriores done", () => {
    const vm = page({ execution: { status: "SUCCEEDED" } });
    expect(vm.stepper.currentId).toBe("NORMAL_END");
    expect(vm.stepper.steps.every((s) => s.state.key === "done")).toBe(true);
    expect(vm.stepper.steps[8].label).toBe("Normalizado");
  });

  it("fase desconhecida: nada é marcado como atual (fail-closed)", () => {
    const vm = page({ maintenance: { phase: "ALGO_NOVO" } });
    expect(vm.stepper.hasUnknownPhase).toBe(true);
    expect(vm.stepper.currentId).toBeNull();
    expect(vm.stepper.steps.every((s) => s.state.key === "pending")).toBe(true);
    expect(vm.hero.state.label).toBe("Fase não reconhecida");
  });

  it("todas as etapas cobrem os ids esperados", () => {
    expect(PHASE_STEPS.map((s) => s.id)).toEqual([
      "NORMAL_START", "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "NORMAL_END",
    ]);
  });
});

describe("FAILED × RECOVERY_REQUIRED", () => {
  it("FAILED: falha conhecida (danger), etapa atual 'failed'", () => {
    const vm = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "FAILED" } });
    expect(vm.failure).toMatchObject({ kind: "FAILED", tone: "danger", isFailed: true, isRecovery: false });
    expect(vm.failure.message).toContain("falhou em uma etapa conhecida");
    expect(stateOf(vm, "MIGRATING")).toBe("failed");
    expect(vm.hero.state.tone).toBe("danger");
  });

  it("RECOVERY_REQUIRED: estado ambíguo (critical), texto de reconciliação", () => {
    const vm = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } });
    expect(vm.failure).toMatchObject({ kind: "RECOVERY_REQUIRED", tone: "critical", isRecovery: true, isFailed: false });
    expect(vm.failure.message).toBe("A atualização foi interrompida e requer reconciliação técnica antes de liberar o sistema.");
    expect(stateOf(vm, "MIGRATING")).toBe("recovery");
    expect(vm.hero.state.tone).toBe("critical");
  });

  it("FAILED e RECOVERY_REQUIRED têm tom, ícone e rótulo distintos", () => {
    const f = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "FAILED" } });
    const r = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } });
    expect(f.failure.tone).not.toBe(r.failure.tone);
    expect(f.failure.Icon).not.toBe(r.failure.Icon);
    expect(f.hero.state.label).not.toBe(r.hero.state.label);
  });

  it("migration AMBIGUOUS força RECOVERY_REQUIRED mesmo sem o executor reportar (fail-closed)", () => {
    const vm = page({
      maintenance: { phase: "MIGRATING" },
      execution: { status: "RUNNING" },
      migrations: [
        { order: 1, id: "160", filename: "160.sql", state: "SUCCESS" },
        { order: 2, id: "161", filename: "161.sql", state: "AMBIGUOUS" },
      ],
    });
    expect(vm.failure.kind).toBe("RECOVERY_REQUIRED");
    expect(vm.migrations.hasAmbiguous).toBe(true);
  });

  // PDB-I3-FE3 — indicador DERIVADO; o status bruto do backend não é fabricado.
  it("AMBIGUOUS: requiresRecovery derivado = true, status bruto do executor e da migration preservados", () => {
    const vm = page({
      maintenance: { phase: "MIGRATING" },
      execution: { status: "RUNNING" },
      migrations: [
        { order: 1, id: "160", filename: "160.sql", state: "SUCCESS" },
        { order: 2, id: "161", filename: "161.sql", state: "AMBIGUOUS" },
      ],
    });
    expect(vm.recovery.requiresRecovery).toBe(true);
    expect(vm.recovery.isDerived).toBe(true);
    expect(vm.recovery.reasons).toEqual(["MIGRATION_AMBIGUOUS"]);
    // bruto preservado
    expect(vm.recovery.rawExecutionStatus).toBe("RUNNING");
    expect(vm.hero.rawExecutionStatus).toBe("RUNNING");
    expect(vm.hero.execution.key).toBe("RUNNING");
    expect(vm.hero.execution.label).toBe("Em andamento");
    expect(vm.migrations.items[1].state.key).toBe("AMBIGUOUS");
    expect(vm.migrations.items[0].state.key).toBe("SUCCESS");
    // aviso visual derivado, deixando claro que o executor não foi alterado
    expect(vm.failure.isDerived).toBe(true);
    expect(vm.failure.title).toBe("Requer reconciliação técnica");
    expect(vm.failure.rawExecutionStatus).toBe("RUNNING");
    expect(vm.failure.derivedNote).toMatch(/status registrado pelo executor não foi alterado/i);
    // o stepper NÃO é reescrito para "recovery" por causa da migration (isso é do executor)
    expect(vm.stepper.steps.map((s) => s.state.key)).not.toContain("recovery");
  });

  it("execução RECOVERY_REQUIRED reportada pelo executor: requiresRecovery, sem 'derivada'", () => {
    const vm = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } });
    expect(vm.recovery.requiresRecovery).toBe(true);
    expect(vm.recovery.isDerived).toBe(false);
    expect(vm.recovery.rawExecutionStatus).toBe("RECOVERY_REQUIRED");
    expect(vm.failure.derivedNote).toBeNull();
  });

  it("sem AMBIGUOUS nem RECOVERY_REQUIRED: requiresRecovery = false; FAILED não vira recuperação", () => {
    const ok = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "RUNNING" } });
    expect(ok.recovery.requiresRecovery).toBe(false);
    const falha = page({ maintenance: { phase: "MIGRATING" }, execution: { status: "FAILED" } });
    expect(falha.recovery.requiresRecovery).toBe(false);
    expect(falha.failure.kind).toBe("FAILED");
    expect(falha.failure.rawExecutionStatus).toBe("FAILED");
  });

  it("fixture principal: sem recuperação", () => {
    expect(buildMaintenancePageViewModel(MAINTENANCE_FIXTURE).recovery.requiresRecovery).toBe(false);
  });

  it("estados de migration: AMBIGUOUS é crítico e distinto de FAILED", () => {
    const vm = page({
      execution: { status: "RUNNING" },
      migrations: ["PENDING", "RUNNING", "SUCCESS", "FAILED", "AMBIGUOUS", "SKIPPED", "XYZ"].map((state, i) => ({
        order: i + 1, id: String(i), filename: `m${i}.sql`, state,
      })),
    });
    const by = Object.fromEntries(vm.migrations.items.map((m) => [m.id, m]));
    expect(vm.migrations.items.map((m) => m.state.key)).toEqual(["PENDING", "RUNNING", "SUCCESS", "FAILED", "AMBIGUOUS", "SKIPPED", "UNKNOWN"]);
    expect(by[4].state.tone).toBe("critical");
    expect(by[3].state.tone).toBe("danger");
    expect(by[4].state.label).not.toBe(by[3].state.label);
    expect(by[4].isCritical).toBe(true);
    expect(by[4].note).toContain("Não reexecute");
    expect(by[6].state.key).toBe("UNKNOWN"); // desconhecido nunca vira aplicada
  });
});

describe("proteções — nunca inventam zero", () => {
  const vm = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);

  it("estado padrão das 6 proteções", () => {
    expect(vm.protections.items.map((i) => i.id)).toEqual(["loginGate", "writeFence", "activeSessions", "inFlightOperations", "executionLock", "backup"]);
    expect(protection(vm, "loginGate").status.label).toBe("Aberto");
    expect(protection(vm, "writeFence").status.label).toBe("Em preparação · não validado");
    expect(protection(vm, "writeFence").reason).toBe("Existem pendências de cobertura antes da liberação.");
    expect(protection(vm, "activeSessions").status.label).toBe("Aguardando integração");
    expect(protection(vm, "inFlightOperations").status.label).toBe("Aguardando integração");
    expect(protection(vm, "executionLock").status.label).toBe("Aguardando executor");
    expect(protection(vm, "backup").status.label).toBe("Não iniciado");
  });

  it("sessões/operações: valor 'Não verificado', jamais '0'", () => {
    ["activeSessions", "inFlightOperations"].forEach((id) => {
      const item = protection(vm, id);
      expect(item.valueLabel).toBe("Não verificado");
      item.fields.forEach((f) => expect(f.value).not.toMatch(/^0\b/));
    });
  });

  it("'zero' declarado SEM prova cai em não verificado", () => {
    const v = page({
      protections: {
        activeSessions: { status: "PROVEN_ZERO", count: 0, proofGeneratedAt: null },
        inFlightOperations: { status: "PROVEN_ZERO", count: 0, coverage: "FULL", observedAt: null },
      },
    });
    expect(protection(v, "activeSessions").status.key).toBe("UNKNOWN");
    expect(protection(v, "inFlightOperations").status.key).toBe("UNKNOWN");
    expect(protection(v, "activeSessions").valueLabel).toBe("Não verificado");
  });

  it("zero COM prova (e cobertura completa) é comprovado", () => {
    const v = page({
      protections: {
        activeSessions: { status: "PROVEN_ZERO", count: 0, proofGeneratedAt: "2026-10-01T12:00:00.000Z", heartbeatAfterClosureCount: 0 },
        inFlightOperations: { status: "PROVEN_ZERO", count: 0, coverage: "FULL", observedAt: "2026-10-01T12:00:00.000Z" },
      },
    });
    expect(protection(v, "activeSessions").status.key).toBe("PROVEN_ZERO");
    expect(protection(v, "activeSessions").valueLabel).toBe("0 sessões (comprovado)");
    expect(protection(v, "inFlightOperations").valueLabel).toBe("0 operações (comprovado)");
  });

  it("zero em operações com cobertura parcial NÃO é comprovado", () => {
    const v = page({ protections: { inFlightOperations: { status: "PROVEN_ZERO", count: 0, coverage: "PARTIAL", observedAt: "2026-10-01T12:00:00.000Z" } } });
    expect(protection(v, "inFlightOperations").status.key).toBe("PARTIAL");
  });

  it("registros ativos exigem contagem > 0", () => {
    const ok = page({ protections: { activeSessions: { status: "ACTIVE", count: 3 } } });
    expect(protection(ok, "activeSessions").valueLabel).toBe("3 sessões ativas");
    const ruim = page({ protections: { activeSessions: { status: "ACTIVE", count: null } } });
    expect(protection(ruim, "activeSessions").status.key).toBe("UNKNOWN");
  });

  it("status desconhecido cai em 'Não verificado' em todas as proteções", () => {
    const v = page({
      protections: {
        loginGate: { status: "???" }, writeFence: { status: "???" }, activeSessions: { status: "???" },
        inFlightOperations: { status: "???" }, executionLock: { status: "???" }, backup: { status: "???" },
      },
    });
    v.protections.items.forEach((i) => expect(i.status.label).toBe("Não verificado"));
  });

  it("todas as proteções expõem os campos preparados (com placeholders honestos)", () => {
    const labels = (id) => protection(vm, id).fields.map((f) => f.label);
    expect(labels("activeSessions")).toEqual(expect.arrayContaining(["Sessões ativas", "Prova gerada em", "Heartbeats após o fechamento"]));
    expect(labels("inFlightOperations")).toEqual(expect.arrayContaining(["Operações", "Cobertura", "Observado em"]));
    expect(labels("backup")).toEqual(expect.arrayContaining(["Modo", "Nível de verificação", "Criado em", "Verificado em", "Artefatos", "Ponto de recuperação"]));
  });
});

describe("backup — pendente × verificado", () => {
  const backup = (raw) => protection(page({ protections: { backup: raw } }), "backup");

  it("NOT_STARTED → 'Não iniciado', nenhum nível alcançado", () => {
    const b = protection(buildMaintenancePageViewModel(MAINTENANCE_FIXTURE), "backup");
    expect(b.status.label).toBe("Não iniciado");
    expect(b.levels.map((l) => l.reached)).toEqual([false, false, false]);
    expect(b.levelLabel).toBe("Nenhum");
  });

  it("VERIFIED sem L2 NÃO é apresentado como verificado", () => {
    expect(backup({ status: "VERIFIED", verificationLevel: null }).status.key).toBe("CREATED");
    expect(backup({ status: "VERIFIED", verificationLevel: "L1" }).status.key).toBe("CREATED");
    expect(backup({ status: "VERIFIED", verificationLevel: "L1" }).status.label).toBe("Criado · verificação pendente");
  });

  it("VERIFIED com L2 (ou L3) é verificado; níveis são cumulativos", () => {
    const l2 = backup({ status: "VERIFIED", verificationLevel: "L2", verifiedAt: "2026-10-01T12:00:00.000Z", artifactCount: 4, mode: "LOGICAL", recoveryPoint: "rp-1" });
    expect(l2.status.key).toBe("VERIFIED");
    expect(l2.levels.map((l) => l.reached)).toEqual([true, true, false]);
    expect(l2.fields.find((f) => f.label === "Artefatos").value).toBe("4");
    expect(backup({ status: "VERIFIED", verificationLevel: "L3" }).levels.map((l) => l.reached)).toEqual([true, true, true]);
  });

  it("L1/L2/L3 têm significado próprio", () => {
    const b = protection(buildMaintenancePageViewModel(MAINTENANCE_FIXTURE), "backup");
    expect(b.levels.map((l) => l.label)).toEqual([
      "L1 · Evidência do provedor", "L2 · Integridade do backup", "L3 · Rehearsal de restauração",
    ]);
  });

  it("nível inválido é ignorado", () => {
    expect(backup({ status: "CREATED", verificationLevel: "L9" }).levelLabel).toBe("Nenhum");
  });
});

describe("executor", () => {
  const executor = (raw) => page({ executor: raw }).executor;

  it("padrão: Aguardando, sem worker/heartbeat/lease inventados", () => {
    const e = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE).executor;
    expect(e.status.label).toBe("Aguardando");
    expect(e.worker).toBe("Nenhum worker ativo");
    expect(e.heartbeatLabel).toBe("Sem heartbeat");
    expect(e.leaseLabel).toBe("Sem lease");
    expect(e.description).toBe("Responsável por coordenar cada etapa da atualização.");
    expect(e.note).toBeNull();
  });

  it("STALE e LEASE_EXPIRED viram atenção com explicação", () => {
    const stale = executor({ status: "STALE", worker: "worker-1", heartbeatAt: "2026-10-01T12:00:00.000Z" });
    expect(stale.status.label).toBe("Sem sinal recente");
    expect(stale.status.tone).toBe("attention");
    expect(stale.worker).toBe("worker-1");
    expect(stale.note).toContain("não envia sinais recentes");
    const lease = executor({ status: "LEASE_EXPIRED" });
    expect(lease.status.label).toBe("Lease expirado");
    expect(lease.note).toContain("lease");
  });

  it("status desconhecido: 'Não verificado'", () => {
    expect(executor({ status: "???" }).status.label).toBe("Não verificado");
  });
});

describe("progresso", () => {
  it("ocioso: nunca '0%', sem barras", () => {
    const p = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE).progress;
    expect(p.isIdle).toBe(true);
    expect(p.showBars).toBe(false);
    expect(p.overall).toBeNull();
  });

  it("em execução: overall/phase suportados, clampados e arredondados", () => {
    const p = page({ execution: { status: "RUNNING", progress: { overall: 42.6, phase: 130 } } }).progress;
    expect(p.showBars).toBe(true);
    expect(p.overall).toBe(43);
    expect(p.phase).toBe(100);
    expect(p.isIndeterminate).toBe(false);
  });

  it("em execução sem valores: indeterminado, sem barra inventada", () => {
    const p = page({ execution: { status: "RUNNING" } }).progress;
    expect(p.showBars).toBe(false);
    expect(p.isIndeterminate).toBe(true);
  });

  it("resumo da execução: plano, execução, alvo, início, decorrido, migration atual e total", () => {
    const p = page({
      execution: {
        status: "RUNNING", planId: "plan-1", executionId: "exec-1", targetSha: "abcdef1234567890",
        startedAt: "2026-10-01T12:00:00.000Z", elapsedSeconds: 125, currentMigration: "161", migrationCount: 3,
        currentStep: "Atualização",
      },
    }).progress;
    const f = Object.fromEntries(p.summary.map((x) => [x.label, x.value]));
    expect(f.Plano).toBe("plan-1");
    expect(f.Execução).toBe("exec-1");
    expect(f["Release alvo"]).toBe("abcdef1");
    expect(f["Tempo decorrido"]).toBe("2 min 05 s");
    expect(f["Migration atual"]).toBe("161");
    expect(f.Migrations).toBe("3");
  });

  it("formatElapsed", () => {
    expect(formatElapsed(42)).toBe("42 s");
    expect(formatElapsed(125)).toBe("2 min 05 s");
    expect(formatElapsed(3720)).toBe("1 h 02 min");
    expect(formatElapsed(null)).toBeNull();
    expect(formatElapsed(-1)).toBeNull();
    expect(formatElapsed("x")).toBeNull();
  });
});

describe("timeline", () => {
  const evento = (over) => ({ id: "e", timestamp: "2026-10-01T12:00:00.000Z", phase: "NOTICE", type: "PHASE", title: "Aviso", description: "d", status: "SUCCESS", actor: "sistema", metadata: { a: 1 }, ...over });

  it("vazia por padrão (sem eventos falsos)", () => {
    expect(buildTimelineViewModel(MAINTENANCE_FIXTURE).items).toEqual([]);
    expect(MAINTENANCE_FIXTURE.timeline).toEqual([]);
  });

  it("contrato do item: timestamp, fase, tipo, título, descrição, status, ator, metadata", () => {
    const [item] = buildTimelineViewModel({ timeline: [evento()] }).items;
    expect(item).toMatchObject({
      id: "e", phaseLabel: "Aviso", typeLabel: "Etapa", title: "Aviso", description: "d", actor: "sistema", hasMetadata: true,
    });
    expect(item.status.label).toBe("Concluído");
    expect(item.timestampLabel).toMatch(/2026/);
    expect(item.metadata).toEqual([{ key: "a", value: "1" }]);
  });

  it("ordena cronologicamente de forma estável e ignora entradas inválidas", () => {
    const tl = buildTimelineViewModel({
      timeline: [
        evento({ id: "c", timestamp: "2026-10-01T12:03:00.000Z" }),
        null,
        evento({ id: "a", timestamp: "2026-10-01T12:01:00.000Z" }),
        evento({ id: "sem-hora", timestamp: null }),
        evento({ id: "b", timestamp: "2026-10-01T12:02:00.000Z" }),
      ],
    });
    expect(tl.items.map((i) => i.id)).toEqual(["a", "b", "c", "sem-hora"]);
    expect(tl.items[3].timestampLabel).toBe("Sem horário");
  });

  it("status AMBIGUOUS é crítico; status desconhecido é informativo", () => {
    const [a, b] = buildTimelineViewModel({ timeline: [evento({ id: "1", status: "AMBIGUOUS" }), evento({ id: "2", status: "???" })] }).items;
    expect(a.status.tone).toBe("critical");
    expect(b.status.key).toBe("INFO");
  });

  it("metadata só aceita valores primitivos (nada de objetos/HTML)", () => {
    const [item] = buildTimelineViewModel({ timeline: [evento({ metadata: { ok: "x", n: 2, b: true, obj: { z: 1 }, arr: [1], nul: null } })] }).items;
    expect(item.metadata.map((m) => m.key)).toEqual(["ok", "n", "b"]);
  });
});

describe("capabilities — fail-closed", () => {
  it("só `true` estrito habilita", () => {
    const vm = buildCapabilitiesViewModel({ capabilities: { canStart: "true", canCancel: 1, canRetry: {}, canReconcile: "yes", canViewDetails: 1 } });
    expect(vm).toMatchObject({ canStart: false, canCancel: false, canRetry: false, canReconcile: false, canViewDetails: false });
  });

  it("ausentes = tudo falso", () => {
    expect(buildCapabilitiesViewModel(null)).toMatchObject({ canStart: false, canCancel: false, canRetry: false, canReconcile: false, canViewDetails: false });
  });

  it("os motivos das ações estão no view-model", () => {
    const { help } = buildCapabilitiesViewModel(MAINTENANCE_FIXTURE);
    expect(help.start).toBe("Disponível após conclusão das validações de segurança.");
    expect(help.cancel.length).toBeGreaterThan(10);
    expect(help.reconcile.length).toBeGreaterThan(10);
  });
});

describe("conexão / tempo real", () => {
  it.each([
    ["preview", "Prévia — dados de demonstração"],
    ["connecting", "Conectando…"],
    ["live", "Ao vivo"],
    ["stale", "Dados desatualizados"],
    ["offline", "Sem conexão"],
    ["LIVE", "Ao vivo"],
  ])("%s → %s", (state, label) => {
    expect(page({ connectionState: state }).connection.label).toBe(label);
  });

  it("estado desconhecido cai em offline (nunca em live)", () => {
    expect(page({ connectionState: "???" }).connection.state).toBe("offline");
  });

  it("source live mostra a data real; prévia nunca mostra horário", () => {
    const live = page({ source: { kind: "live", label: "Estado ao vivo" }, connectionState: "live", lastUpdatedAt: "2026-10-01T12:00:00.000Z" });
    expect(live.source.isPreview).toBe(false);
    expect(live.lastUpdatedLabel).toMatch(/2026/);
    expect(page({ lastUpdatedAt: "2026-10-01T12:00:00.000Z" }).lastUpdatedLabel).toBe("Prévia estática");
  });
});

describe("página — snapshot inválido (fail-closed)", () => {
  it.each([[null], [undefined], [{}], [{ status: "weird" }], ["x"]])("%j → erro", (s) => {
    const vm = buildMaintenancePageViewModel(s);
    expect(vm.state).toBe("error");
    expect(vm.errorMessage).toBe("Não foi possível carregar o estado da manutenção.");
    expect(vm.capabilities.canStart).toBe(false);
  });

  it("loading e error nunca liberam ação", () => {
    expect(buildMaintenancePageViewModel({ ...MAINTENANCE_FIXTURE, status: "loading" }).state).toBe("loading");
    expect(buildMaintenancePageViewModel({ ...MAINTENANCE_FIXTURE, status: "loading" }).capabilities.canViewDetails).toBe(false);
  });
});

describe("experiência do usuário", () => {
  const { userExperience } = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);

  it("mensagem, reabertura automática e fluxo de segurança", () => {
    expect(userExperience.message).toBe("Sistema em processo de atualização. Aguarde até a finalização.");
    expect(userExperience.autoReopen).toBe("Após a conclusão segura da atualização, o acesso será liberado automaticamente.");
    expect(userExperience.safetyFlow).toEqual([
      "Novos acessos são bloqueados",
      "Operações em andamento são drenadas",
      "O backup é validado",
      "As migrations são aplicadas",
      "Os smoke tests verificam o sistema",
      "O acesso é liberado",
    ]);
  });
});

// ── Data source: snapshot + patches ──────────────────────────
describe("data source — fixture e patches (encaixe do futuro Realtime)", () => {
  it("fixture: getSnapshot estável, subscribe sem efeitos", () => {
    const ds = createFixtureDataSource();
    expect(ds.kind).toBe("fixture");
    expect(ds.getSnapshot()).toBe(MAINTENANCE_FIXTURE);
    expect(ds.getSnapshot()).toBe(ds.getSnapshot());
    expect(typeof ds.subscribe(() => {})).toBe("function");
    expect(defaultMaintenanceDataSource.kind).toBe("fixture");
  });

  it("patch não muta o original e preserva a referência das seções intocadas", () => {
    const next = applyMaintenancePatch(MAINTENANCE_FIXTURE, { maintenance: { phase: "NOTICE" }, protections: { loginGate: { status: "CLOSING" } } });
    expect(MAINTENANCE_FIXTURE.maintenance.phase).toBe("NORMAL");
    expect(next.maintenance.phase).toBe("NOTICE");
    expect(next.maintenance.status).toBe("NORMAL"); // merge raso
    expect(next.execution).toBe(MAINTENANCE_FIXTURE.execution);
    expect(next.executor).toBe(MAINTENANCE_FIXTURE.executor);
    expect(next.protections.writeFence).toBe(MAINTENANCE_FIXTURE.protections.writeFence);
    expect(next.protections.loginGate.status).toBe("CLOSING");
    expect(next.migrations).toBe(MAINTENANCE_FIXTURE.migrations);
  });

  it("timelineAppend acrescenta sem duplicar por id", () => {
    const e1 = { id: "1", timestamp: "2026-10-01T12:00:00.000Z", title: "A" };
    const s1 = applyMaintenancePatch(MAINTENANCE_FIXTURE, { timelineAppend: [e1] });
    const s2 = applyMaintenancePatch(s1, { timelineAppend: [e1, { id: "2", timestamp: "2026-10-01T12:01:00.000Z", title: "B" }] });
    expect(s2.timeline.map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("patch inválido devolve o mesmo snapshot", () => {
    expect(applyMaintenancePatch(MAINTENANCE_FIXTURE, null)).toBe(MAINTENANCE_FIXTURE);
    expect(applyMaintenancePatch(MAINTENANCE_FIXTURE, [])).toBe(MAINTENANCE_FIXTURE);
  });

  it("store patchable notifica os assinantes e respeita unsubscribe", () => {
    const ds = createPatchableDataSource(MAINTENANCE_FIXTURE);
    const ouvinte = () => { chamadas += 1; };
    let chamadas = 0;
    const off = ds.subscribe(ouvinte);
    ds.applyPatch({ maintenance: { phase: "FENCING" } });
    expect(chamadas).toBe(1);
    expect(ds.getSnapshot().maintenance.phase).toBe("FENCING");
    off();
    ds.applyPatch({ maintenance: { phase: "DRAINING" } });
    expect(chamadas).toBe(1);
  });
});

// ── Guarda de rede/segurança: a camada de prévia não toca backend ────
describe("guarda estática — a prévia não faz rede, Supabase nem execução", () => {
  const semComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // Tudo em manutencao/ exceto o painel legado (ao vivo, opt-in) e testes.
  const arquivos = readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) && f !== "LegacyMaintenancePanel.jsx");
  const codigo = (f) => semComentarios(readFileSync(resolve(dir, f), "utf8"));

  it("há arquivos de prévia para inspecionar", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(15);
  });

  it.each(arquivos)("%s não usa rede, Supabase, service role, HML/PROD nem timers", (f) => {
    const code = codigo(f);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/service[_-]?role/i);
    expect(code).not.toMatch(/rwnzggjxhxnfrhstbxkm|zzixvyspwszewhxzusot/);
    expect(code).not.toMatch(/["'`]\/api\//);
    expect(code).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(code).not.toMatch(/Date\.now|new Date\(\)/); // sem relógio artificial
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/apply_migration|execute_sql/);
  });

  it("nenhum arquivo da prévia importa server/ ou api/", () => {
    arquivos.forEach((f) => expect(codigo(f)).not.toMatch(/from\s+["'][^"']*\/(server|api)\//));
  });

  it("o shell só alcança a rede via LegacyMaintenancePanel (aba opt-in)", () => {
    const code = semComentarios(readFileSync(resolve(dir, "..", "MaintenanceAdmin.jsx"), "utf8"));
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/setInterval|setTimeout/);
  });

  it("componentes não decidem status por conta própria", () => {
    arquivos.filter((f) => f.endsWith(".jsx")).forEach((f) => {
      expect(codigo(f), f).not.toMatch(/["'](NONE|IDLE|RUNNING|SUCCEEDED|FAILED|RECOVERY_REQUIRED|AMBIGUOUS|VERIFIED|PROVEN_ZERO|OPEN|CLOSED|NOT_STARTED)["']/);
    });
  });
});
