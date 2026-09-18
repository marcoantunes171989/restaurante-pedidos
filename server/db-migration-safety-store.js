// ════════════════════════════════════════════════════════════
//  PDB-I2A — Adapter de persistência de evidência de schema safety.
//
//  Espelha app_schema_validation_results (migration 160).
//  Sem fetch, sem DB live, sem apply_migration. I/O só via store
//  injetável (memória nos testes / futuro control plane).
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import { SCHEMA_VALIDATION_RESULTS, isSchemaClassification } from "./db-release-contract.js";
import {
  SCHEMA_SAFETY_VALIDATOR_VERSION,
  bindSafetyEvidence,
} from "./db-migration-safety.js";

export function toValidationResultRow(analysis, {
  planId = null,
  planMigrationId = null,
  validatedAt = null,
  id = null,
} = {}) {
  if (!analysis || typeof analysis !== "object") return null;
  const result = analysis.classification === "PROHIBITED" ? "FAIL" : "PASS";
  return {
    id: id || crypto.randomUUID(),
    plan_id: planId,
    plan_migration_id: planMigrationId,
    filename: analysis.filename,
    sha256: analysis.contentSha256 || analysis.identity?.sha256,
    git_blob: analysis.identity?.gitBlob ?? null,
    classification: analysis.classification,
    validator_version: analysis.validatorVersion || SCHEMA_SAFETY_VALIDATOR_VERSION,
    result,
    findings: Array.isArray(analysis.findings) ? analysis.findings : [],
    validated_at: validatedAt,
    created_at: validatedAt,
  };
}

export function rowsToSafetyEvidence(rows, { planHash = null, evaluatedAt = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, errorCode: "SCHEMA_SAFETY_EVIDENCE_MISSING", evaluatedAt };
  }
  const identities = [];
  const classifications = [];
  let dmlCount = 0;
  let destructiveDdlCount = 0;
  let dynamicSqlCount = 0;
  let uncertainCount = 0;
  for (const row of rows) {
    if (!isSchemaClassification(row.classification)) {
      return { ok: false, errorCode: "SCHEMA_SAFETY_EVIDENCE_INVALID", evaluatedAt };
    }
    if (row.validator_version !== SCHEMA_SAFETY_VALIDATOR_VERSION) {
      return { ok: false, errorCode: "SCHEMA_SAFETY_VALIDATOR_STALE", evaluatedAt };
    }
    if (!SCHEMA_VALIDATION_RESULTS.includes(row.result)) {
      return { ok: false, errorCode: "SCHEMA_SAFETY_EVIDENCE_INVALID", evaluatedAt };
    }
    identities.push({
      filename: row.filename,
      gitBlob: row.git_blob ?? null,
      sha256: row.sha256,
      bytes: row.bytes,
      classification: row.classification,
    });
    classifications.push(row.classification);
    dmlCount += Number(row.dml_count || 0);
    destructiveDdlCount += Number(row.destructive_ddl_count || 0);
    dynamicSqlCount += Number(row.dynamic_sql_count || 0);
    uncertainCount += Number(row.uncertain_count || 0);
    if (Array.isArray(row.findings)) {
      for (const item of row.findings) {
        if (item?.code === "TOP_LEVEL_DML" || item?.code === "DO_DML" || item?.code === "CREATE_TABLE_AS"
          || item?.code === "SELECT_INTO" || item?.code === "CREATE_MATERIALIZED_VIEW") {
          dmlCount += 1;
        }
        if (item?.code === "DROP_TABLE" || item?.code === "DROP_COLUMN" || item?.code === "ALTER_COLUMN_TYPE"
          || item?.code === "DESTRUCTIVE_DDL" || item?.code === "DESTRUCTIVE_CASCADE"
          || item?.code === "DROP_CONSTRAINT" || item?.code === "ALTER_TYPE") {
          destructiveDdlCount += 1;
        }
        if (String(item?.code || "").includes("DYNAMIC")) dynamicSqlCount += 1;
        if (item?.code === "SQL_UNPARSEABLE_OR_UNCERTAIN") uncertainCount += 1;
      }
    }
  }
  const hasProhibited = classifications.includes("PROHIBITED");
  const requiresReview = !hasProhibited && classifications.includes("REVIEW_REQUIRED");
  const allSafe = classifications.length > 0 && classifications.every((item) => item === "SAFE_AUTO");
  const overallClassification = hasProhibited
    ? "PROHIBITED"
    : (requiresReview ? "REVIEW_REQUIRED" : (allSafe ? "SAFE_AUTO" : "REVIEW_REQUIRED"));
  return bindSafetyEvidence({
    analysis: {
      validatorVersion: SCHEMA_SAFETY_VALIDATOR_VERSION,
      overallClassification,
      allSafe,
      requiresReview,
      hasProhibited,
      dmlCount,
      destructiveDdlCount,
      dynamicSqlCount,
      uncertainCount,
      results: rows.map((row) => ({
        identity: {
          filename: row.filename,
          gitBlob: row.git_blob ?? null,
          sha256: row.sha256,
          bytes: row.bytes,
        },
      })),
    },
    planHash,
    identities,
    evaluatedAt,
  });
}

export function createMemorySafetyStore() {
  const rows = [];
  return {
    rows,
    async insertValidationResults(records) {
      if (!Array.isArray(records) || records.length === 0) {
        return { ok: false, error: "SCHEMA_SAFETY_EVIDENCE_MISSING" };
      }
      for (const record of records) {
        rows.push({ ...record });
      }
      return { ok: true, count: records.length };
    },
    async listValidationResults({ planId = null, validatorVersion = SCHEMA_SAFETY_VALIDATOR_VERSION } = {}) {
      const filtered = rows.filter((row) => (
        (planId == null || row.plan_id === planId)
        && (validatorVersion == null || row.validator_version === validatorVersion)
      ));
      return { ok: true, rows: filtered.map((row) => ({ ...row })) };
    },
  };
}
