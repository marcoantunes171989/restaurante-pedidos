import { describe, expect, it } from "vitest";
import {
  EXECUTOR_LEASE_TTL_SECONDS,
  SCHEDULE_CLAIM_WINDOW_MS,
  buildEnvironmentLockKey,
  validateWorkerId,
} from "../../server/db-release-executor-contract.js";
import {
  RUNTIME_MIGRATION,
  parseFunctionDefs,
  readMigration,
  stripComments,
} from "../../tests/server/helpers/migration-sql.js";

const sql = readMigration(RUNTIME_MIGRATION);
const code = stripComments(sql);
const defs = parseFunctionDefs([RUNTIME_MIGRATION]);
const fn = (name) => defs.find((def) => def.name === name);
const claim = fn("app_db_release_claim_execution");
const claimBody = stripComments(claim.body);
const at = (needle) => {
  const index = claimBody.indexOf(needle);
  expect(index, `trecho ausente no claim: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("claim atômico — plan CAS + execução + lock de ambiente em UMA transação", () => {
  it("é uma única função plpgsql SECURITY DEFINER, sem COMMIT/ROLLBACK/SAVEPOINT próprio", () => {
    expect(claim.header).toMatch(/language plpgsql/i);
    expect(claim.header).toMatch(/security definer/i);
    expect(claimBody).not.toMatch(/\b(commit|rollback|savepoint)\b/i);
  });

  it("ordem atômica: lock do ambiente < plano FOR UPDATE < replay < lock ocupado < INSERT execução < plan CAS < eventos", () => {
    const order = [
      "pg_advisory_xact_lock(",
      "from public.app_db_release_plans as p",
      "for update;",
      "e.correlation_id = p_correlation_id",
      "e.lock_released_at is null",
      "insert into public.app_db_release_executions",
      "update public.app_db_release_plans",
      "'DB_EXECUTION_CLAIMED'",
      "'DB_LOCK_ACQUIRED'",
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("plan CAS: status de origem + plan_hash + updated_at; falha => RAISE (reverte a execução inserida)", () => {
    const start = at("update public.app_db_release_plans");
    const cas = claimBody.slice(start, start + 420);
    expect(cas).toMatch(/set status = 'RUNNING'/);
    expect(cas).toMatch(/and status = v_from_status/);
    expect(cas).toMatch(/and plan_hash = p_expected_plan_hash/);
    expect(cas).toMatch(/and updated_at = p_expected_plan_updated_at/);
    expect(claimBody).toMatch(/get diagnostics v_row_count = row_count;\s*if v_row_count <> 1 then\s*raise exception/i);
  });

  it("execução nasce REQUESTED com lease/heartbeat do RELÓGIO DO SERVIDOR (nada de tempo do browser)", () => {
    expect(claimBody).toMatch(/v_now := clock_timestamp\(\)/);
    expect(claimBody).toMatch(/'REQUESTED'/);
    expect(claimBody).toMatch(/v_now \+ make_interval\(secs => p_lease_ttl_seconds\)/);
    const params = claim.stmt.slice(claim.stmt.indexOf("("), claim.stmt.indexOf(")\nreturns")).match(/\bp_[a-z_]+/g);
    expect(params).toEqual([
      "p_plan_id", "p_environment", "p_project_ref", "p_worker_id", "p_correlation_id",
      "p_intent", "p_expected_plan_hash", "p_expected_plan_updated_at", "p_lease_ttl_seconds",
    ]);
    expect(params.some((name) => /heartbeat|lease_generation|status|now/.test(name))).toBe(false);
  });
});

describe("claim — idempotência e vencedor único", () => {
  it("mesma tentativa (plano + correlação + mesmo worker/ambiente/projeto) => REPLAYED sem mutar", () => {
    const start = at("e.correlation_id = p_correlation_id");
    const replay = claimBody.slice(start, start + 900);
    expect(replay).toMatch(/v_existing\.executor_id = p_worker_id/);
    expect(replay).toMatch(/'outcome', 'REPLAYED'/);
    expect(claimBody.indexOf("'REPLAYED'")).toBeLessThan(claimBody.indexOf("insert into public.app_db_release_executions"));
  });

  it("outro worker NÃO rouba a tentativa: EXECUTION_OWNED_BY_OTHER_WORKER; outra correlação do mesmo plano: PLAN_EXECUTION_EXISTS", () => {
    expect(claimBody).toContain("EXECUTION_OWNED_BY_OTHER_WORKER");
    expect(claimBody).toContain("PLAN_EXECUTION_EXISTS");
  });

  it("concorrência: advisory lock por (ambiente, projeto) serializa; lock ocupado => LOCKED; unique_violation é rede de segurança", () => {
    expect(claimBody).toMatch(/'outcome', 'LOCKED'/);
    expect(claimBody).toMatch(/exception\s+when unique_violation then\s+return jsonb_build_object\('outcome', 'LOCKED'/i);
    // mesma chave do contrato JS (DB_RELEASE:<env>:<projectRef>), sem plan id
    const key = buildEnvironmentLockKey({ environment: "HML" });
    expect(key.lockKey).toBe("DB_RELEASE:HML:zzixvyspwszewhxzusot");
    expect(claimBody).toContain("'DB_RELEASE:' || p_environment || ':' || p_project_ref");
  });

  it("exclusividade por ambiente/projeto: HML e PROD independentes; índice único parcial sem plan_id", () => {
    expect(code).toMatch(/on public\.app_db_release_executions \(environment, project_ref\)\s+where lock_released_at is null/i);
    expect(code).toMatch(/environment = 'HML' and project_ref = 'zzixvyspwszewhxzusot'/);
    expect(code).toMatch(/environment = 'PROD' and project_ref = 'rwnzggjxhxnfrhstbxkm'/);
  });

  it("intenção x status espelha o contrato I2C1 (IMMEDIATE=APPROVED, SCHEDULED=SCHEDULED) e a janela de 15 min", () => {
    expect(claimBody).toMatch(/p_intent = 'IMMEDIATE' then\s+if v_plan\.status is distinct from 'APPROVED'/);
    expect(claimBody).toMatch(/v_plan\.status is distinct from 'SCHEDULED'/);
    expect(SCHEDULE_CLAIM_WINDOW_MS).toBe(15 * 60_000);
    expect(claimBody).toContain("interval '15 minutes'");
    expect(claimBody).toContain("SCHEDULE_NOT_DUE");
    expect(claimBody).toContain("SCHEDULE_WINDOW_EXPIRED");
  });
});

describe("invariantes plano <-> execução no banco (sem execução sem plan CAS / sem plano RUNNING sem execução)", () => {
  it("constraint trigger DEFERRED em executions: após INSERT o plano precisa estar RUNNING", () => {
    expect(code).toMatch(
      /create constraint trigger app_db_release_execution_plan_invariant_trg\s+after insert on public\.app_db_release_executions\s+deferrable initially deferred\s+for each row/i,
    );
    const body = stripComments(fn("app_db_release_execution_plan_invariant").body);
    expect(body).toMatch(/v_status is distinct from 'RUNNING'/);
    expect(body).toContain("EXECUTION_WITHOUT_PLAN_CAS");
  });

  it("trigger de plano: RUNNING só com execução dona do lock; RUNNING não reverte; SUCCEEDED exige execução SUCCEEDED", () => {
    expect(code).toMatch(/create trigger app_db_release_plan_guard_trg\s+before update on public\.app_db_release_plans/i);
    const body = stripComments(fn("app_db_release_plan_guard").body);
    expect(body).toMatch(/NEW\.status = 'RUNNING' and OLD\.status is distinct from 'RUNNING'/);
    expect(body).toMatch(/e\.lock_released_at is null/);
    expect(body).toContain("PLAN_RUNNING_WITHOUT_EXECUTION");
    expect(body).toContain("PLAN_RUNNING_CANNOT_REVERT");
    expect(body).toContain("PLAN_SUCCEEDED_WITHOUT_EXECUTION");
  });

  it("transação abortada não deixa plano RUNNING sem execução: execução é inserida ANTES do UPDATE do plano, tudo em uma função", () => {
    expect(claimBody.indexOf("insert into public.app_db_release_executions")).toBeLessThan(claimBody.indexOf("update public.app_db_release_plans"));
    // nenhuma outra função nova escreve status RUNNING no plano
    for (const def of defs.filter((item) => item.name !== "app_db_release_claim_execution")) {
      expect(stripComments(def.body), def.name).not.toMatch(/update public\.app_db_release_plans[\s\S]{0,80}set status = 'RUNNING'/i);
    }
  });
});

describe("claim — autoridade server-side e validação de ambiente/projeto/worker", () => {
  it("project_ref vem do mapeamento fixo (nunca do caller) e ambiente inválido é rejeitado", () => {
    expect(claimBody).toMatch(/p_project_ref is distinct from public\.app_db_release_project_ref_for_internal\(p_environment\)/);
    expect(claimBody).toContain("PROJECT_REF_MISMATCH");
    expect(claimBody).toContain("ENVIRONMENT_INVALID");
  });

  it("worker id: mesma regra do contrato JS (regex + material secreto)", () => {
    const regexLiteral = claimBody.match(/p_worker_id !~ '([^']+)'/);
    expect(regexLiteral).toBeTruthy();
    const sqlRegex = new RegExp(regexLiteral[1]);
    for (const candidate of ["worker-1", "exec.host:01", "a", "-bad", "", "x".repeat(201), "svc_token_1", "my-secret-worker", "bearer1"]) {
      const jsOk = validateWorkerId(candidate).ok;
      const sqlOk = sqlRegex.test(candidate) && !/(secret|token|bearer|password|authorization|service_role)/i.test(candidate);
      expect(sqlOk, candidate).toBe(jsOk);
    }
    expect(claimBody).toContain("WORKER_ID_INVALID");
  });

  it("TTL de lease: faixa aceita contém o TTL canônico de 120s", () => {
    expect(EXECUTOR_LEASE_TTL_SECONDS).toBe(120);
    expect(claimBody).toMatch(/p_lease_ttl_seconds < 30 or p_lease_ttl_seconds > 900/);
  });

  it("inacessível a browser: só service_role executa; nenhuma credencial é devolvida", () => {
    expect(code).toMatch(/revoke all on function public\.app_db_release_claim_execution\([^)]*\) from public, anon, authenticated, service_role;/);
    expect(code).toMatch(/grant execute on function public\.app_db_release_claim_execution\([^)]*\) to service_role;/);
    expect(claimBody).not.toMatch(/current_setting|auth.uid|request.jwt/i);
    const returned = claimBody.slice(claimBody.lastIndexOf("return jsonb_build_object"));
    expect(returned).not.toMatch(/token|secret|password|key/i);
  });
});
