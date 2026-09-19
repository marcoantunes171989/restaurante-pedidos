import { describe, expect, it } from "vitest";
import {
  DB_HAPPY_PATH,
  DB_STRUCTURAL_EDGES_RESERVED,
  LOGIN_GATE_STATES,
} from "../../server/db-release-contract.js";
import { DB_MAINTENANCE_TRANSITION_EDGES, RUNTIME_RPC_SPECS } from "../../server/db-release-runtime-rpc.js";
import {
  RUNTIME_MIGRATION,
  finalDefinition,
  parseFunctionDefs,
  readMigration,
  stripComments,
} from "../../tests/server/helpers/migration-sql.js";

const sql = readMigration(RUNTIME_MIGRATION);
const code = stripComments(sql);
const defs = parseFunctionDefs([RUNTIME_MIGRATION]);
const body = (name) => stripComments(defs.find((def) => def.name === name).body);
const before162 = parseFunctionDefs(
  ["153_maintenance_release_orchestration_core.sql", "155_maintenance_fence_drain_quiescence_reconciliation.sql",
    "158_maintenance_smoke_recovery_reconciliation.sql", "159_maintenance_abort_reopen_orchestration.sql",
    "160_db_release_orchestrator_foundation.sql"],
);

const transition = body("app_maintenance_db_orchestration_transition");
const start = body("app_maintenance_db_orchestration_start");
const loginGate = body("app_maintenance_db_orchestration_login_gate");
const abort = body("app_maintenance_db_orchestration_abort_to_normal");
const safe = body("app_db_release_binding_release_safe_internal");
const bindingGuard = body("app_maintenance_orchestration_binding_guard");
const loginGuard = body("app_maintenance_login_gate_guard");

describe("manutenção DB — arestas controladas", () => {
  const values = transition.slice(transition.indexOf("from (values"), transition.indexOf(") as edges"));
  const edges = [...values.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((match) => [match[1], match[2]]);

  it("14 edges DB exatas no SQL == contrato do transporte (nem mais, nem menos)", () => {
    expect(edges).toHaveLength(14);
    expect(edges.map((edge) => edge.join(">")).sort()).toEqual(DB_MAINTENANCE_TRANSITION_EDGES.map((edge) => edge.join(">")).sort());
  });

  it("cobre QUIESCENT→BACKING_UP, BACKING_UP→MIGRATING, MIGRATING→SMOKE, SMOKE→NORMAL e o caminho feliz DB (NORMAL→NOTICE vem do bind)", () => {
    for (const [from, to] of [["QUIESCENT", "BACKING_UP"], ["BACKING_UP", "MIGRATING"], ["MIGRATING", "SMOKE"], ["SMOKE", "NORMAL"]]) {
      expect(edges).toContainEqual([from, to]);
    }
    for (const [from, to] of DB_HAPPY_PATH.filter(([from]) => from !== "NORMAL")) expect(edges).toContainEqual([from, to]);
    for (const [from, to] of DB_STRUCTURAL_EDGES_RESERVED) expect(edges).toContainEqual([from, to]);
    expect(start).toMatch(/set phase = 'NOTICE'/);
  });

  it("nenhuma edge nova é solta globalmente: constraint de phase e transition_internal APP não são redefinidos", () => {
    expect(code).not.toMatch(/app_maintenance_state_phase_check/);
    expect(defs.map((def) => def.name)).not.toContain("app_maintenance_orchestration_transition_internal");
    expect(code).not.toMatch(/drop constraint app_maintenance_state_/);
  });

  it("CAS de fase + versão, barrier exclusiva, state FOR UPDATE e binding DB obrigatório", () => {
    expect(transition.indexOf("app_maintenance_cutover_barrier_internal(true)")).toBeLessThan(transition.indexOf("for update;"));
    expect(transition).toMatch(/v_phase is distinct from p_expected_phase/);
    expect(transition).toMatch(/v_version is distinct from p_expected_version/);
    expect(transition).toMatch(/v_plan_kind is distinct from 'DB_MIGRATION'/);
    expect(transition).toContain("VERSION_CONFLICT");
    expect(transition).toContain("INVALID_TRANSITION");
  });

  it("ownership exato da execução por fase (status compatível) e drain=0 antes de QUIESCENT/BACKING_UP", () => {
    expect(transition).toMatch(/when 'BACKING_UP' then 'BACKING_UP'/);
    expect(transition).toMatch(/when 'MIGRATING' then 'MIGRATING'/);
    expect(transition).toMatch(/when 'SMOKE' then 'VERIFYING'/);
    expect(transition).toMatch(/when 'NORMAL' then 'VERIFYING'/);
    expect(transition).toMatch(/if p_to_phase in \('QUIESCENT', 'BACKING_UP'\) then\s+perform public\.app_maintenance_operation_expire_internal\(\);/);
    expect(transition).toMatch(/app_maintenance_drain_in_flight_count_internal\(\)/);
    expect(transition).toMatch(/v_count is distinct from 0/);
  });

  it("BACKING_UP emite a prova de quiescência (QUIESCENCE_PROBE_PASSED) e cada aresta gera evento de auditoria", () => {
    expect(transition).toContain("'QUIESCENCE_PROBE_PASSED'");
    for (const event of ["FENCE_STARTED", "DRAIN_STARTED", "QUIESCENCE_REACHED", "SMOKE_STARTED", "MAINTENANCE_COMPLETED", "MAINTENANCE_FAILED", "DB_MAINTENANCE_PHASE_CHANGED"]) {
      expect(transition).toContain(`'${event}'`);
    }
  });
});

describe("manutenção DB — binding DB persistido (APP_RELEASE vs DB_MIGRATION)", () => {
  it("start: bind db_plan_id + plan_kind=DB_MIGRATION + target_sha e NORMAL→NOTICE, execução DRAINING dona", () => {
    expect(start).toMatch(/set db_plan_id = p_plan_id,\s*plan_kind = 'DB_MIGRATION',\s*target_sha = p_target_sha/);
    expect(start).toMatch(/v_exec\.status is distinct from 'DRAINING'/);
    expect(start).toMatch(/v_plan_status is distinct from 'RUNNING'/);
    expect(start).toContain("TARGET_MISMATCH");
    expect(start).toMatch(/v_login_gate is distinct from 'OPEN'/);
    expect(start).toMatch(/v_release_id is not null or v_db_plan_id is not null/);
  });

  it("start liga a execução ao plano e o transition usa o db_plan_id do estado como binding da execução", () => {
    expect(start).toMatch(/app_db_release_owner_lock_internal\(\s*p_execution_id, p_worker_id, p_lease_generation, p_plan_id/);
    expect(transition).toMatch(/app_db_release_owner_lock_internal\(\s*p_execution_id, p_worker_id, p_lease_generation, v_db_plan_id/);
  });

  it("APP_RELEASE preservado: a 162 só redefine o binding guard entre as funções de orquestração; ramos APP intactos", () => {
    const orchestration = defs.filter((def) => /^app_maintenance_orchestration_/.test(def.name)).map((def) => def.name);
    expect(orchestration).toEqual(["app_maintenance_orchestration_binding_guard"]);
    const rawGuard = defs.find((def) => def.name === "app_maintenance_orchestration_binding_guard").body;
    for (const marker of ["INITIAL BIND APP", "INITIAL BIND DB", "SUCCESS CLEAR", "FUTURE B17 REOPEN CLEAR"]) {
      expect(rawGuard).toContain(marker);
    }
    const original = stripComments(finalDefinition(before162, "app_maintenance_orchestration_binding_guard").body);
    // todo trecho APP do guard da 160 continua literalmente presente
    for (const fragment of [
      "NEW.plan_kind = 'DB_MIGRATION'",
      "(NEW.plan_kind is null or NEW.plan_kind = 'APP_RELEASE')",
      "OLD.release_id is not null and OLD.target_sha is not null and OLD.db_plan_id is null",
      "NEW.epoch > OLD.epoch",
    ]) {
      expect(original).toContain(fragment);
      expect(bindingGuard).toContain(fragment);
    }
  });

  it("as RPCs APP (release_id) continuam falhando fechado para binding DB (release_id NULL)", () => {
    const appFence = stripComments(finalDefinition(before162, "app_maintenance_orchestration_fence").body);
    expect(appFence).toMatch(/v_release_id is null or v_target_sha is null/);
    const appReopen = stripComments(finalDefinition(before162, "app_maintenance_orchestration_reopen").body);
    expect(appReopen).toMatch(/v_release_id is null or v_target_sha is null/);
  });
});

describe("login_gate — writer controlado", () => {
  it("valores OPEN|CLOSED do contrato; nenhuma função nova escreve login_gate fora das 3 RPCs de manutenção DB", () => {
    expect(LOGIN_GATE_STATES).toEqual(["OPEN", "CLOSED"]);
    const setClauses = (text) => [...text.matchAll(/update\s+[\w.]+(?:\s+as\s+\w+)?\s+set\s+([\s\S]*?)\s+where\b/gi)].map((match) => match[1]);
    const writers = defs
      .filter((def) => /\blogin_gate\s*=/i.test(setClauses(stripComments(def.body)).join("\n")))
      .map((def) => def.name)
      .sort();
    expect(writers).toEqual([
      "app_maintenance_db_orchestration_abort_to_normal",
      "app_maintenance_db_orchestration_login_gate",
      "app_maintenance_db_orchestration_transition",
    ]);
  });

  it("FAILED (DB) fecha o gate; retorno a NORMAL NÃO reabre; OPEN só em NORMAL sem binding com prova", () => {
    expect(transition).toMatch(/login_gate = case when p_to_phase = 'FAILED' then 'CLOSED' else login_gate end/);
    expect(abort).toMatch(/set phase = 'FAILED',\s*login_gate = 'CLOSED'/);
    expect(abort).not.toMatch(/login_gate = 'OPEN'/);
    expect(loginGate).toMatch(/v_phase is distinct from 'NORMAL' or v_plan_kind is not null/);
    expect(loginGate).toMatch(/app_db_release_binding_release_safe_internal\(v_exec\.plan_id, 'OPEN'\)/);
    expect(loginGate).toContain("DB_BINDING_RELEASE_UNSAFE");
  });

  it("CLOSED só em release DB de FENCING em diante; DRAINING+ exige CLOSED; sem escrita de browser (sem GRANT a anon/authenticated)", () => {
    expect(loginGate).toMatch(/v_phase not in \('FENCING', 'DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE', 'FAILED'\)/);
    expect(transition).toMatch(/p_to_phase in \('DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE'\)\s+and v_login_gate is distinct from 'CLOSED'/);
    expect(code).not.toMatch(/grant [a-z, ]*update[a-z, ]* on table public\.app_maintenance_state/i);
  });

  it("trigger de guard: DRAINING..FAILED de binding DB => CLOSED; retorno a NORMAL não reabre; OPEN só NORMAL sem binding", () => {
    expect(code).toMatch(/create trigger app_maintenance_login_gate_guard_trg\s+before update on public\.app_maintenance_state/i);
    expect(loginGuard).toMatch(/NEW\.phase in \('DRAINING', 'QUIESCENT', 'BACKING_UP', 'MIGRATING', 'SMOKE', 'RECOVERING', 'FAILED'\)/);
    expect(loginGuard).toContain("LOGIN_GATE_MUST_BE_CLOSED");
    expect(loginGuard).toContain("LOGIN_GATE_CLOSE_NOT_ALLOWED");
    expect(loginGuard).toContain("LOGIN_GATE_OPEN_NOT_ALLOWED");
    expect(loginGuard).toMatch(/OLD\.plan_kind = 'DB_MIGRATION'\s+and OLD\.phase is distinct from 'NORMAL'\s+and NEW\.phase = 'NORMAL'/);
  });
});

describe("reopen guard — FAILED→NORMAL nunca reabre binding DB com execução RECOVERY_REQUIRED/ambígua", () => {
  it("o predicado de segurança falha fechado: qualquer execução RECOVERY_REQUIRED do plano => false, antes de qualquer modo", () => {
    const rr = safe.indexOf("e.status = 'RECOVERY_REQUIRED'");
    expect(rr).toBeGreaterThan(0);
    expect(safe.slice(rr, rr + 200)).toMatch(/return false/);
    expect(rr).toBeLessThan(safe.indexOf("if p_mode = 'SUCCESS'"));
    expect(safe).toMatch(/p_mode not in \('SUCCESS', 'REOPEN', 'OPEN'\) then\s+return false/);
  });

  it("REOPEN só com execução NÃO mutada (mutation_started_at NULL) ou reconciliada por humano; SUCCESS exige VERIFYING + steps", () => {
    expect(safe).toMatch(/v_exec\.mutation_started_at is null\s+and v_exec\.status in \('REQUESTED', 'PREPARING', 'DRAINING', 'BACKING_UP', 'FAILED', 'CANCELED'\)/);
    expect(safe).toMatch(/v_exec\.reconciled_at is not null\s+and v_exec\.status in \('CANCELED', 'SUCCEEDED'\)/);
    expect(safe).toMatch(/return v_exec\.status = 'VERIFYING'\s+and v_exec\.mutation_started_at is not null\s+and v_steps_ok/);
    expect(safe).not.toMatch(/'RECOVERY_REQUIRED'\)\s*or/);
  });

  it("o trigger do binding bloqueia o reopen inseguro no banco (mesmo com bug em RPC): DB_BINDING_RELEASE_UNSAFE", () => {
    const reopenStart = bindingGuard.indexOf("OLD.phase in ('FAILED', 'CANCELED')");
    expect(reopenStart).toBeGreaterThan(0);
    const reopenBranch = bindingGuard.slice(reopenStart);
    expect(reopenBranch).toMatch(/app_db_release_binding_release_safe_internal\(OLD\.db_plan_id, 'REOPEN'\)/);
    expect(bindingGuard).toMatch(/app_db_release_binding_release_safe_internal\(OLD\.db_plan_id, 'SUCCESS'\)/);
    expect(bindingGuard).toMatch(/OLD\.plan_kind = 'DB_MIGRATION'\s+and OLD\.phase is distinct from 'NORMAL'\s+and NEW\.phase = 'NORMAL'/);
    expect(bindingGuard).toContain("DB_BINDING_RELEASE_UNSAFE");
  });

  it("o login gate também é protegido: OPEN é barrado enquanto houver execução RECOVERY_REQUIRED/mutada com lock retido", () => {
    const openBranch = loginGuard.slice(loginGuard.indexOf("if exists ("));
    expect(openBranch).toMatch(/e\.lock_released_at is null/);
    expect(openBranch).toMatch(/e\.status = 'RECOVERY_REQUIRED'/);
    expect(openBranch).toMatch(/e\.mutation_started_at is not null and e\.status not in \('VERIFYING', 'SUCCEEDED'\)/);
    expect(openBranch).toContain("LOGIN_GATE_OPEN_UNSAFE");
  });

  it("abort/reopen: fases pré-mutação apenas, prova REOPEN antes de qualquer UPDATE, login permanece CLOSED", () => {
    expect(abort).toMatch(/v_phase not in \('NOTICE', 'FENCING', 'DRAINING', 'QUIESCENT', 'BACKING_UP', 'FAILED', 'CANCELED'\)/);
    expect(abort.indexOf("app_db_release_binding_release_safe_internal(v_db_plan_id, 'REOPEN')")).toBeGreaterThan(0);
    expect(abort.indexOf("'REOPEN')")).toBeLessThan(abort.indexOf("update public.app_maintenance_state"));
    expect(abort).toMatch(/epoch = epoch \+ 1/);
    expect(abort).toContain("'MAINTENANCE_REOPENED'");
  });

  it("a RPC APP de reopen (159) já exigia release_id: o binding DB só reabre por este caminho protegido", () => {
    const appReopen = stripComments(finalDefinition(before162, "app_maintenance_orchestration_reopen").body);
    expect(appReopen).toMatch(/v_release_id is null or v_target_sha is null/);
    expect(defs.map((def) => def.name)).not.toContain("app_maintenance_orchestration_reopen");
  });
});

describe("contrato do transporte x SQL das RPCs de manutenção", () => {
  it("nomes e ordem dos parâmetros das RPCs do transporte == assinaturas da migration 162", () => {
    for (const spec of Object.values(RUNTIME_RPC_SPECS)) {
      const def = defs.find((item) => item.name === spec.name);
      expect(def, spec.name).toBeTruthy();
      const params = def.stmt.slice(def.stmt.indexOf("(") + 1, def.stmt.indexOf(")\nreturns"))
        .split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
      expect(params, spec.name).toEqual(spec.params.map((param) => param[0]));
    }
  });
});
