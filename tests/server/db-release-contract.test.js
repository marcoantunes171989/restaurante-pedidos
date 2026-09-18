import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_HAPPY_PATH,
  APP_STRUCTURAL_EDGES,
  BACKUP_STATUSES,
  CONTROL_PLANE_TABLES,
  DB_ENVIRONMENTS,
  DB_HAPPY_PATH,
  DB_MAINTENANCE_EVENT_TYPES,
  DB_PLAN_STATUSES,
  EXECUTION_STATUSES,
  EXECUTION_STEP_STATUSES,
  EXECUTION_STEP_TYPES,
  LEGACY_MAINTENANCE_EVENT_TYPES,
  LEGACY_MAINTENANCE_PHASES,
  LOGIN_GATE_STATES,
  MAINTENANCE_EVENT_TYPES,
  MAINTENANCE_PHASES,
  PLAN_KINDS,
  REQUIRED_READINESS_GATES,
  SCHEMA_CLASSIFICATIONS,
  SCHEMA_VALIDATION_RESULTS,
  SHA1_RE,
  SHA256_RE,
  appAndDbBindingCannotCoexist,
  isAppHappyPathEdge,
  isAppReleaseBinding,
  isAppStructuralEdge,
  isBackupStatus,
  isDbHappyPathEdge,
  isDbMigrationBinding,
  isDbPlanStatus,
  isExecutionStatus,
  isLoginGateState,
  isMaintenanceEventType,
  isMaintenancePhase,
  isPlanKind,
  isReservedDbStructuralEdge,
  isSchemaClassification,
  isUnboundLegacyState,
  isValidBindingState,
} from "../../server/db-release-contract.js";

const contractSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/db-release-contract.js"),
  "utf8",
);

describe("db-release-contract — frozen sets", () => {
  it("expõe plan kinds APP_RELEASE e DB_MIGRATION", () => {
    expect(PLAN_KINDS).toEqual(["APP_RELEASE", "DB_MIGRATION"]);
    expect(isPlanKind("APP_RELEASE")).toBe(true);
    expect(isPlanKind("DB_MIGRATION")).toBe(true);
    expect(isPlanKind("RELEASING")).toBe(false);
  });

  it("expõe login gate OPEN/CLOSED", () => {
    expect(LOGIN_GATE_STATES).toEqual(["OPEN", "CLOSED"]);
    expect(isLoginGateState("OPEN")).toBe(true);
    expect(isLoginGateState("CLOSED")).toBe(true);
    expect(isLoginGateState("FENCING")).toBe(false);
  });

  it("preserva as 11 phases legadas e adiciona BACKING_UP/MIGRATING", () => {
    expect(LEGACY_MAINTENANCE_PHASES).toHaveLength(11);
    expect(LEGACY_MAINTENANCE_PHASES).toContain("RELEASING");
    expect(LEGACY_MAINTENANCE_PHASES).not.toContain("BACKING_UP");
    expect(MAINTENANCE_PHASES).toEqual([...LEGACY_MAINTENANCE_PHASES, "BACKING_UP", "MIGRATING"]);
    expect(isMaintenancePhase("RELEASING")).toBe(true);
    expect(isMaintenancePhase("BACKING_UP")).toBe(true);
    expect(isMaintenancePhase("MIGRATING")).toBe(true);
  });

  it("congela statuses de plano, backup, execução e classificação", () => {
    expect(DB_PLAN_STATUSES).toEqual([
      "DRAFT",
      "VALIDATED",
      "APPROVED",
      "SCHEDULED",
      "RUNNING",
      "BLOCKED",
      "FAILED",
      "RECOVERY_REQUIRED",
      "SUCCEEDED",
      "CANCELED",
    ]);
    expect(BACKUP_STATUSES).toEqual([
      "REQUESTED",
      "RUNNING",
      "COMPLETED",
      "VERIFYING",
      "VERIFIED",
      "FAILED",
    ]);
    expect(EXECUTION_STATUSES).toEqual([
      "REQUESTED",
      "PREPARING",
      "DRAINING",
      "BACKING_UP",
      "MIGRATING",
      "VERIFYING",
      "RECOVERY_REQUIRED",
      "FAILED",
      "SUCCEEDED",
      "CANCELED",
    ]);
    expect(SCHEMA_CLASSIFICATIONS).toEqual(["SAFE_AUTO", "REVIEW_REQUIRED", "PROHIBITED"]);
    expect(SCHEMA_VALIDATION_RESULTS).toEqual(["PASS", "FAIL"]);
    expect(isDbPlanStatus("DRAFT")).toBe(true);
    expect(isBackupStatus("VERIFIED")).toBe(true);
    expect(isExecutionStatus("MIGRATING")).toBe(true);
    expect(isSchemaClassification("PROHIBITED")).toBe(true);
  });

  it("congela 7 readiness gates e ambientes HML/PROD", () => {
    expect(REQUIRED_READINESS_GATES).toHaveLength(7);
    expect(DB_ENVIRONMENTS).toEqual(["HML", "PROD"]);
    expect(CONTROL_PLANE_TABLES).toHaveLength(6);
  });

  it("estende event types sem remover os 18 legados", () => {
    expect(LEGACY_MAINTENANCE_EVENT_TYPES).toHaveLength(18);
    expect(DB_MAINTENANCE_EVENT_TYPES).toHaveLength(24);
    expect(MAINTENANCE_EVENT_TYPES).toHaveLength(42);
    expect(MAINTENANCE_EVENT_TYPES.slice(0, 18)).toEqual([...LEGACY_MAINTENANCE_EVENT_TYPES]);
    expect(isMaintenanceEventType("ORCHESTRATION_STARTED")).toBe(true);
    expect(isMaintenanceEventType("DB_RELEASE_SUCCEEDED")).toBe(true);
    expect(isMaintenanceEventType("RELEASE_STARTED")).toBe(true);
  });
});

describe("db-release-contract — state machines congeladas", () => {
  it("preserva o happy path APP QUIESCENT → RELEASING → SMOKE → NORMAL", () => {
    expect(isAppHappyPathEdge("QUIESCENT", "RELEASING")).toBe(true);
    expect(isAppHappyPathEdge("RELEASING", "SMOKE")).toBe(true);
    expect(isAppHappyPathEdge("SMOKE", "NORMAL")).toBe(true);
    expect(isAppHappyPathEdge("QUIESCENT", "BACKING_UP")).toBe(false);
    expect(APP_HAPPY_PATH.at(-3)).toEqual(["QUIESCENT", "RELEASING"]);
  });

  it("documenta o happy path DB QUIESCENT → BACKING_UP → MIGRATING → SMOKE → NORMAL", () => {
    expect(isDbHappyPathEdge("QUIESCENT", "BACKING_UP")).toBe(true);
    expect(isDbHappyPathEdge("BACKING_UP", "MIGRATING")).toBe(true);
    expect(isDbHappyPathEdge("MIGRATING", "SMOKE")).toBe(true);
    expect(isDbHappyPathEdge("QUIESCENT", "RELEASING")).toBe(false);
    expect(DB_HAPPY_PATH).not.toContainEqual(["QUIESCENT", "RELEASING"]);
  });

  it("não reutiliza RELEASING como MIGRATING", () => {
    expect(isAppHappyPathEdge("QUIESCENT", "MIGRATING")).toBe(false);
    expect(isDbHappyPathEdge("QUIESCENT", "RELEASING")).toBe(false);
    expect(isReservedDbStructuralEdge("QUIESCENT", "RELEASING")).toBe(false);
    expect(isReservedDbStructuralEdge("QUIESCENT", "BACKING_UP")).toBe(true);
  });

  it("preserva as 16 edges estruturais APP", () => {
    expect(APP_STRUCTURAL_EDGES).toHaveLength(16);
    expect(isAppStructuralEdge("QUIESCENT", "RELEASING")).toBe(true);
    expect(isAppStructuralEdge("QUIESCENT", "BACKING_UP")).toBe(false);
  });
});

describe("db-release-contract — binding", () => {
  it("aceita unbound legado", () => {
    expect(isUnboundLegacyState({})).toBe(true);
    expect(isValidBindingState({})).toBe(true);
  });

  it("aceita APP_RELEASE legado (plan_kind null) e explícito", () => {
    expect(
      isAppReleaseBinding({
        releaseId: "rel-1",
        targetSha: "a".repeat(40),
      }),
    ).toBe(true);
    expect(
      isAppReleaseBinding({
        releaseId: "rel-1",
        targetSha: "a".repeat(40),
        planKind: "APP_RELEASE",
      }),
    ).toBe(true);
  });

  it("aceita DB_MIGRATION e rejeita coexistência APP+DB", () => {
    expect(
      isDbMigrationBinding({
        dbPlanId: "plan-1",
        targetSha: "b".repeat(40),
        planKind: "DB_MIGRATION",
      }),
    ).toBe(true);
    expect(appAndDbBindingCannotCoexist({ releaseId: "rel-1", dbPlanId: "plan-1" })).toBe(false);
    expect(
      isValidBindingState({
        releaseId: "rel-1",
        targetSha: "a".repeat(40),
        dbPlanId: "plan-1",
        planKind: "DB_MIGRATION",
      }),
    ).toBe(false);
  });
});

describe("db-release-contract — pureza", () => {
  it("não acessa rede, DB nem segredo", () => {
    expect(contractSource).not.toMatch(/\bfetch\s*\(/);
    expect(contractSource).not.toMatch(/\bXMLHttpRequest\b/);
    expect(contractSource).not.toMatch(/\bWebSocket\b/);
    expect(contractSource).not.toMatch(/createClient\s*\(/);
    expect(contractSource).not.toMatch(/from ["']@supabase/);
    expect(contractSource).not.toMatch(/process\.env/);
    expect(contractSource).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(contractSource).not.toMatch(/Bearer\s+/);
    expect(contractSource).not.toMatch(/apply_migration/);
    expect(contractSource).not.toMatch(/execute_sql/);
  });

  it("exporta regex de identidade SHA-1/SHA-256", () => {
    expect(SHA1_RE.test("a".repeat(40))).toBe(true);
    expect(SHA1_RE.test("A".repeat(40))).toBe(false);
    expect(SHA256_RE.test("b".repeat(64))).toBe(true);
    expect(SHA256_RE.test("b".repeat(40))).toBe(false);
  });

  it("congela step types/status sem executor", () => {
    expect(EXECUTION_STEP_TYPES).toContain("BACKUP");
    expect(EXECUTION_STEP_TYPES).toContain("MIGRATE");
    expect(EXECUTION_STEP_STATUSES).toContain("PENDING");
    expect(contractSource).not.toMatch(/pg_dump/);
    expect(contractSource).not.toMatch(/createBackup/);
  });
});
