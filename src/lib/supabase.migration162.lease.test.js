import { describe, expect, it } from "vitest";
import {
  ACTIVE_EXECUTION_STATUSES,
  EXECUTOR_HEARTBEAT_INTERVAL_SECONDS,
  EXECUTOR_LEASE_TTL_SECONDS,
  LOCK_RELEASABLE_EXECUTION_STATUSES,
} from "../../server/db-release-executor-contract.js";
import { EXECUTION_PIPELINE_EDGES } from "../../server/db-release-pipeline-contract.js";
import {
  RUNTIME_MIGRATION,
  parseFunctionDefs,
  readMigration,
  stripComments,
} from "../../tests/server/helpers/migration-sql.js";

const sql = readMigration(RUNTIME_MIGRATION);
const code = stripComments(sql);
const defs = parseFunctionDefs([RUNTIME_MIGRATION]);
const body = (name) => stripComments(defs.find((def) => def.name === name).body);
const inList = (text) => {
  const list = /in \(([^)]*)\)/i.exec(text);
  return list ? [...list[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]) : [];
};
/** Cláusulas SET de todos os UPDATE do corpo (sem o WHERE/CAS). */
const setClauses = (text) => [...text.matchAll(/update\s+[\w.]+(?:\s+as\s+\w+)?\s+set\s+([\s\S]*?)\s+where\b/gi)].map((match) => match[1]);

describe("lease — persistência, CAS de geração e relógio do servidor", () => {
  const heartbeat = body("app_db_release_heartbeat_execution");
  const owner = body("app_db_release_owner_lock_internal");

  it("geração monotônica por banco alvo (max+1) e única; heartbeat não altera a geração", () => {
    expect(body("app_db_release_claim_execution")).toMatch(/coalesce\(max\(e\.lease_generation\), 0\) \+ 1/);
    expect(code).toMatch(/unique \(environment, project_ref, lease_generation\)/);
    expect(setClauses(heartbeat).join("\n")).not.toMatch(/lease_generation\s*=/i);
  });

  it("heartbeat exige worker dono + lease_generation + execução ativa (CAS no UPDATE também)", () => {
    expect(heartbeat).toMatch(/app_db_release_owner_lock_internal\(\s*p_execution_id, p_worker_id, p_lease_generation/);
    const update = heartbeat.slice(heartbeat.indexOf("update public.app_db_release_executions"));
    expect(update).toMatch(/and executor_id = p_worker_id/);
    expect(update).toMatch(/and lease_generation = p_lease_generation/);
    expect(update).toMatch(/and lock_released_at is null/);
    const statuses = inList(update.slice(update.indexOf("and status in (")));
    expect(statuses).toEqual([...ACTIVE_EXECUTION_STATUSES]);
  });

  it("relógio autoritativo do servidor: sem parâmetro de tempo; estende a lease só para frente", () => {
    const header = defs.find((def) => def.name === "app_db_release_heartbeat_execution").stmt;
    expect(header.slice(header.indexOf("("), header.indexOf(")\nreturns"))).not.toMatch(/timestamp|_at\b/);
    expect(heartbeat).toMatch(/v_now := clock_timestamp\(\)/);
    expect(heartbeat).toMatch(/lease_expires_at = greatest\(lease_expires_at, v_now \+ make_interval\(secs => p_lease_ttl_seconds\)\)/);
  });

  it("worker/geração errados são rejeitados antes de qualquer escrita", () => {
    expect(owner).toContain("WORKER_MISMATCH");
    expect(owner).toContain("LEASE_GENERATION_MISMATCH");
    expect(owner.indexOf("WORKER_MISMATCH")).toBeLessThan(owner.indexOf("LEASE_GENERATION_MISMATCH"));
    expect(owner).toMatch(/for update;/);
  });

  it("TTL 120s / heartbeat 45s (contrato I2C1) cabem na faixa aceita pelo SQL", () => {
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBe(120);
    expect(EXECUTOR_HEARTBEAT_INTERVAL_SECONDS).toBe(45);
    expect(heartbeat).toMatch(/p_lease_ttl_seconds < 30 or p_lease_ttl_seconds > 900/);
  });
});

describe("lease vencida — sem takeover automático", () => {
  it("heartbeat com lease vencida NÃO revive: devolve LEASE_EXPIRED e grava evidência (uma vez)", () => {
    const heartbeat = body("app_db_release_heartbeat_execution");
    const expired = heartbeat.slice(heartbeat.indexOf("if v_exec.lease_expires_at <= v_now then"), heartbeat.indexOf("update public.app_db_release_executions"));
    expect(expired).toMatch(/DB_EXECUTOR_HEARTBEAT_STALE/);
    expect(expired).toMatch(/not exists \(/);
    expect(expired).toMatch(/'outcome', 'LEASE_EXPIRED'/);
    expect(expired).not.toMatch(/update public\./);
  });

  it("nenhuma função troca executor_id nem lease_generation (ownership só nasce no INSERT do claim)", () => {
    for (const def of defs) {
      const text = stripComments(def.body);
      const sets = setClauses(text).join("\n");
      expect(sets, def.name).not.toMatch(/\bexecutor_id\s*=/i);
      expect(sets, def.name).not.toMatch(/\blease_generation\s*=/i);
      expect(sets, def.name).not.toMatch(/\bproject_ref\s*=/i);
    }
    expect(code).not.toMatch(/executor_id\s*=\s*p_new_worker/i);
  });

  it("flag_stale: REQUESTED/PREPARING -> FAILED; demais -> RECOVERY_REQUIRED; ownership e lock preservados", () => {
    const flag = body("app_db_release_flag_stale_execution");
    expect(flag).toMatch(/v_exec\.status in \('REQUESTED', 'PREPARING'\) then\s+v_to := 'FAILED'/);
    expect(flag).toContain("LEASE_LOST_PRE_MUTATION");
    expect(flag).toContain("LEASE_LOST_AFTER_MUTATION");
    expect(flag).not.toMatch(/lock_released_at\s*=/);
    expect(flag).toMatch(/if v_exec\.lease_expires_at > v_now then\s+return jsonb_build_object\('outcome', 'LEASE_ALIVE'\)/);
    expect(flag).toContain("DB_RECOVERY_REQUIRED");
  });
});

describe("execução terminal / RECOVERY_REQUIRED", () => {
  it("terminal, FAILED e RECOVERY_REQUIRED não são revividos por heartbeat", () => {
    const heartbeat = body("app_db_release_heartbeat_execution");
    const guard = heartbeat.slice(heartbeat.indexOf("if v_exec.status not in ("), heartbeat.indexOf("v_now := clock_timestamp()"));
    expect(inList(guard)).toEqual([...ACTIVE_EXECUTION_STATUSES]);
    expect(guard).toContain("EXECUTION_TERMINAL");
    expect(ACTIVE_EXECUTION_STATUSES).not.toContain("RECOVERY_REQUIRED");
    expect(ACTIVE_EXECUTION_STATUSES).not.toContain("FAILED");
  });

  it("transição: as 21 arestas do pipeline I2C2 (nem mais, nem menos) e CAS por status+worker+geração", () => {
    const transition = body("app_db_release_transition_execution");
    const values = transition.slice(transition.indexOf("from (values"), transition.indexOf(") as edges"));
    const edges = [...values.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((match) => [match[1], match[2]]);
    expect(edges).toHaveLength(21);
    expect(edges.map((edge) => edge.join(">")).sort()).toEqual(EXECUTION_PIPELINE_EDGES.map((edge) => edge.join(">")).sort());
    const update = transition.slice(transition.indexOf("update public.app_db_release_executions as e"));
    expect(update).toMatch(/and e\.status = p_from_status/);
    expect(update).toMatch(/and e\.executor_id = p_worker_id/);
    expect(update).toMatch(/and e\.lease_generation = p_lease_generation/);
  });

  it("MIGRATING grava mutation_started_at; lease vencida só permite RECOVERY_REQUIRED", () => {
    const transition = body("app_db_release_transition_execution");
    expect(transition).toMatch(/when p_to_status = 'MIGRATING' and e\.mutation_started_at is null then v_now/);
    expect(transition).toMatch(/if p_to_status <> 'RECOVERY_REQUIRED' and v_exec\.lease_expires_at <= v_now then/);
    expect(transition).toMatch(/'outcome', 'LEASE_EXPIRED'/);
  });

  it("SUCCEEDED exige manutenção NORMAL/OPEN sem binding e passos SCHEMA_VALIDATE/SMOKE/MIGRATE/LOGIN_GATE_OPEN", () => {
    const transition = body("app_db_release_transition_execution");
    const success = transition.slice(transition.indexOf("if p_to_status = 'SUCCEEDED' then"), transition.indexOf("update public.app_db_release_executions as e"));
    expect(success).toMatch(/v_phase is distinct from 'NORMAL' or v_gate is distinct from 'OPEN' or v_kind is not null/);
    expect(success).toMatch(/app_db_release_binding_release_safe_internal\(v_exec\.plan_id, 'OPEN'\)/);
    expect(success).toMatch(/s\.step_order = 920/);
  });
});

describe("release do lock — dono exato e estado terminal/normalizado seguro", () => {
  const release = body("app_db_release_release_lock");

  it("só SUCCEEDED/CANCELED liberam (mesma lista do contrato I2C1); FAILED/RECOVERY_REQUIRED retêm", () => {
    expect(LOCK_RELEASABLE_EXECUTION_STATUSES).toEqual(["SUCCEEDED", "CANCELED"]);
    expect(release).toMatch(/v_exec\.status not in \('SUCCEEDED', 'CANCELED'\)/);
    expect(release).toContain("LOCK_RELEASE_NOT_ALLOWED");
  });

  it("nenhum worker libera a execução de outro: worker e geração exatos", () => {
    expect(release).toMatch(/v_exec\.executor_id is distinct from p_worker_id/);
    expect(release).toMatch(/v_exec\.lease_generation is distinct from p_lease_generation/);
    expect(release.indexOf("WORKER_MISMATCH")).toBeLessThan(release.indexOf("update public.app_db_release_executions"));
  });

  it("plano fora de RUNNING (SUCCEEDED exige plano SUCCEEDED) e binding de manutenção limpo antes de liberar", () => {
    expect(release).toMatch(/v_plan_status = 'RUNNING'/);
    expect(release).toMatch(/v_exec\.status = 'SUCCEEDED' and v_plan_status is distinct from 'SUCCEEDED'/);
    expect(release).toMatch(/s\.db_plan_id = v_exec\.plan_id/);
    expect(release).toContain("DB_LOCK_RELEASED");
  });

  it("RECOVERY_REQUIRED só sai por reconciliação humana (ator + resolução + evidência); liberar exige reconciliação", () => {
    const reconcile = body("app_db_release_reconcile_execution");
    expect(reconcile).toMatch(/p_actor_user_id is null/);
    expect(reconcile).toMatch(/v_exec\.status not in \('FAILED', 'RECOVERY_REQUIRED'\)/);
    expect(reconcile).toMatch(/when p_resolution = 'APPLIED_VERIFIED' then 'SUCCEEDED' else 'CANCELED'/);
    expect(reconcile).not.toMatch(/lock_released_at\s*=/);
    const released = body("app_db_release_release_reconciled_lock");
    expect(released).toMatch(/v_exec\.reconciled_at is null/);
    expect(released).toMatch(/v_exec\.status not in \('SUCCEEDED', 'CANCELED'\)/);
  });
});
