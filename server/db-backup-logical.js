// ════════════════════════════════════════════════════════════
//  PDB-I2B — Contrato do snapshot lógico (plano + manifest + command plan).
//
//  NADA é executado aqui: nenhum processo, nenhuma conexão, nenhuma CLI.
//  O command plan é uma ESPECIFICAÇÃO pura de operações futuras. Credenciais
//  aparecem apenas como { credentialRef } (nome de referência), nunca valor.
//  Se um plano seguro não puder ser expresso sem segredo → BLOQUEIA.
//
//  Escopo: DATABASE_RECOVERY. Objetos do Supabase Storage NÃO entram.
//  auth/storage: só o diff de customização, quando explicitamente exigido —
//  o dump de schema padrão não é tratado como captura de tudo de auth/storage.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import {
  BACKUP_MODE,
  BACKUP_RECOVERY_SCOPE,
  RECOVERY_SCOPES,
  SHA1_RE,
  SHA256_RE,
  STORAGE_OBJECTS_INCLUDED,
  CREDENTIAL_REF_RE,
  checkBackupIdentity,
  containsSecretMaterial,
  credentialRefName,
  describeCredential,
  failure,
  isUuid,
  parseIsoMs,
  toIso,
} from "./db-backup-contract.js";

export const LOGICAL_MANIFEST_VERSION = 1;
export const LOGICAL_COMMAND_PLAN_VERSION = 1;

export const LOGICAL_ARTIFACT_KINDS = Object.freeze([
  "ROLES",
  "SCHEMA",
  "DATA",
  "MIGRATION_HISTORY",
  "AUTH_STORAGE_CUSTOMIZATION",
]);

export const LOGICAL_REQUIRED_ARTIFACT_KINDS = Object.freeze([
  "ROLES",
  "SCHEMA",
  "DATA",
  "MIGRATION_HISTORY",
]);

export const LOGICAL_OPTIONAL_ARTIFACT_KINDS = Object.freeze(["AUTH_STORAGE_CUSTOMIZATION"]);

export const LOGICAL_ARTIFACT_STATUSES = Object.freeze(["PENDING", "COMPLETE", "FAILED"]);

export const LOGICAL_OPERATIONS = Object.freeze([
  "ROLE_DUMP",
  "SCHEMA_DUMP",
  "DATA_DUMP",
  "MIGRATION_HISTORY_DUMP",
  "OPTIONAL_AUTH_STORAGE_DIFF",
]);

/** Métodos de evidência de formato/list/parse aceitos pelo verificador L2. */
export const FORMAT_CHECK_METHODS = Object.freeze([
  "SQL_TERMINATOR",
  "SQL_STRUCTURE_PARSE",
  "PG_RESTORE_LIST",
]);

const SPECS = Object.freeze({
  ROLES: Object.freeze({
    operation: "ROLE_DUMP",
    suffix: "roles.sql",
    tool: "supabase",
    format: "sql-plain",
    contentType: "application/sql",
  }),
  SCHEMA: Object.freeze({
    operation: "SCHEMA_DUMP",
    suffix: "schema.sql",
    tool: "supabase",
    format: "sql-plain",
    contentType: "application/sql",
  }),
  DATA: Object.freeze({
    operation: "DATA_DUMP",
    suffix: "data.sql",
    tool: "supabase",
    format: "sql-plain",
    contentType: "application/sql",
  }),
  MIGRATION_HISTORY: Object.freeze({
    operation: "MIGRATION_HISTORY_DUMP",
    suffix: "migration-history.sql",
    tool: "pg_dump",
    format: "sql-plain",
    contentType: "application/sql",
  }),
  AUTH_STORAGE_CUSTOMIZATION: Object.freeze({
    operation: "OPTIONAL_AUTH_STORAGE_DIFF",
    suffix: "auth-storage-customization.sql",
    tool: "pg_dump",
    format: "sql-plain",
    contentType: "application/sql",
  }),
});

export function logicalArtifactSpec(kind) {
  return SPECS[kind] || null;
}

const FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,160}$/;

export function isSafeArtifactFilename(name) {
  return typeof name === "string" && FILENAME_RE.test(name) && !name.includes("..");
}

function artifactFilename({ environment, correlationId, kind }) {
  return `${environment.toLowerCase()}-${correlationId.toLowerCase()}-${SPECS[kind].suffix}`;
}

// ── Command plan (sem execução) ──────────────────────────────
function commandFor(kind, { credentialRef, filename }) {
  const cred = { credentialRef };
  const out = { outputFile: filename };
  switch (kind) {
    case "ROLES":
      return { tool: "supabase", args: ["db", "dump", "--role-only", "--db-url", cred, "--file", out] };
    case "SCHEMA":
      return { tool: "supabase", args: ["db", "dump", "--db-url", cred, "--file", out] };
    case "DATA":
      return { tool: "supabase", args: ["db", "dump", "--data-only", "--use-copy", "--db-url", cred, "--file", out] };
    case "MIGRATION_HISTORY":
      return {
        tool: "pg_dump",
        args: ["--data-only", "--table=supabase_migrations.schema_migrations", "--no-owner", "--file", out, "--dbname", cred],
      };
    case "AUTH_STORAGE_CUSTOMIZATION":
      return {
        tool: "pg_dump",
        args: ["--schema-only", "--schema=auth", "--schema=storage", "--no-owner", "--file", out, "--dbname", cred],
      };
    default:
      return null;
  }
}

/**
 * Prova estrutural de que o command plan não carrega segredo: cada argumento
 * é literal seguro, { credentialRef } BACKUP_CREATE do ambiente, ou
 * { outputFile } com nome seguro.
 */
export function assertCommandPlanSafe(commands, { environment } = {}) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return failure("BACKUP_INPUT_INVALID", "COMMAND_PLAN_EMPTY");
  }
  const expectedRef = credentialRefName("BACKUP_CREATE", environment);
  for (const command of commands) {
    if (!command || !Array.isArray(command.args) || typeof command.tool !== "string") {
      return failure("BACKUP_INPUT_INVALID", "COMMAND_SHAPE_INVALID");
    }
    if (!["supabase", "pg_dump", "psql"].includes(command.tool)) {
      return failure("BACKUP_INPUT_INVALID", "COMMAND_TOOL_NOT_ALLOWED");
    }
    for (const arg of command.args) {
      if (typeof arg === "string") {
        if (containsSecretMaterial(arg) || /[\r\n\0]/.test(arg)) {
          return failure("BACKUP_SECRET_MATERIAL", "LITERAL_ARG_UNSAFE");
        }
        continue;
      }
      if (arg && typeof arg === "object" && Object.keys(arg).length === 1) {
        if (typeof arg.credentialRef === "string") {
          if (!CREDENTIAL_REF_RE.test(arg.credentialRef) || arg.credentialRef !== expectedRef) {
            return failure("CREDENTIAL_AUTHORITY_MISMATCH", "CREDENTIAL_REF_NOT_BACKUP_CREATE_FOR_ENVIRONMENT");
          }
          continue;
        }
        if (typeof arg.outputFile === "string") {
          if (!isSafeArtifactFilename(arg.outputFile)) {
            return failure("BACKUP_INPUT_INVALID", "OUTPUT_FILE_UNSAFE");
          }
          continue;
        }
      }
      return failure("BACKUP_SECRET_MATERIAL", "ARG_SHAPE_NOT_ALLOWED");
    }
  }
  return { ok: true, failureCode: null, reason: null };
}

function validateBindingInput(input) {
  const identity = checkBackupIdentity({
    environment: input.environment,
    projectRef: input.projectRef,
    expectedProjectRef: input.expectedProjectRef,
  });
  if (!identity.ok) return failure(identity.failureCode, identity.reason);
  if (!isUuid(input.correlationId)) return failure("BACKUP_BINDING_MISSING", "CORRELATION_ID_INVALID");
  if (!isUuid(input.planId)) return failure("BACKUP_BINDING_MISSING", "PLAN_ID_INVALID");
  if (!isUuid(input.executionId)) return failure("BACKUP_BINDING_MISSING", "EXECUTION_ID_INVALID");
  if (!SHA1_RE.test(input.targetReleaseSha || "")) {
    return failure("BACKUP_BINDING_MISSING", "TARGET_RELEASE_SHA_INVALID");
  }
  const quiescenceMs = parseIsoMs(input.quiescenceAt);
  if (quiescenceMs == null) return failure("BACKUP_QUIESCENCE_INVALID", "QUIESCENCE_AT_INVALID");
  return { ok: true, quiescenceMs };
}

/**
 * Plano do snapshot lógico. Puro: descreve o conjunto futuro de artefatos e o
 * command plan, sem spawn, sem conexão, sem credencial.
 */
export function buildLogicalSnapshotPlan(input = {}) {
  const binding = validateBindingInput(input);
  if (!binding.ok) return binding;
  const requireAuthStorage = input.requireAuthStorageCustomization === true;
  const kinds = requireAuthStorage
    ? [...LOGICAL_REQUIRED_ARTIFACT_KINDS, "AUTH_STORAGE_CUSTOMIZATION"]
    : [...LOGICAL_REQUIRED_ARTIFACT_KINDS];
  const credential = describeCredential("BACKUP_CREATE", input.environment);

  const artifacts = kinds.map((kind) => {
    const spec = SPECS[kind];
    const filename = artifactFilename({
      environment: input.environment,
      correlationId: input.correlationId,
      kind,
    });
    return {
      kind,
      operation: spec.operation,
      filename,
      required: LOGICAL_REQUIRED_ARTIFACT_KINDS.includes(kind) || requireAuthStorage,
      tool: spec.tool,
      format: spec.format,
      contentType: spec.contentType,
      command: commandFor(kind, { credentialRef: credential.refName, filename }),
    };
  });

  const safety = assertCommandPlanSafe(artifacts.map((artifact) => artifact.command), {
    environment: input.environment,
  });
  if (!safety.ok) return safety;

  return {
    ok: true,
    failureCode: null,
    reason: null,
    plan: {
      manifestVersion: LOGICAL_MANIFEST_VERSION,
      commandPlanVersion: LOGICAL_COMMAND_PLAN_VERSION,
      mode: BACKUP_MODE.LOGICAL_SNAPSHOT,
      scope: BACKUP_RECOVERY_SCOPE,
      excludedScope: RECOVERY_SCOPES.FULL_APPLICATION_ASSET_RECOVERY,
      storageObjectsIncluded: STORAGE_OBJECTS_INCLUDED,
      environment: input.environment,
      projectRef: input.projectRef,
      planId: input.planId,
      executionId: input.executionId,
      correlationId: input.correlationId,
      targetReleaseSha: input.targetReleaseSha,
      quiescenceAt: toIso(binding.quiescenceMs),
      requireAuthStorageCustomization: requireAuthStorage,
      credential,
      artifacts,
      executionEnabled: false,
    },
  };
}

// ── Manifest determinístico ──────────────────────────────────
const ARTIFACT_ORDER = Object.freeze(Object.fromEntries(LOGICAL_ARTIFACT_KINDS.map((k, i) => [k, i])));

function sortedArtifacts(list) {
  return [...list].sort((a, b) => (ARTIFACT_ORDER[a.kind] ?? 99) - (ARTIFACT_ORDER[b.kind] ?? 99));
}

function manifestArtifactFromPlan(planArtifact) {
  return {
    kind: planArtifact.kind,
    filename: planArtifact.filename,
    required: planArtifact.required === true,
    size: null,
    sha256: null,
    createdAt: null,
    tool: planArtifact.tool,
    toolVersion: null,
    postgresVersion: null,
    contentType: planArtifact.contentType,
    format: planArtifact.format,
    status: "PENDING",
  };
}

/** Manifest inicial (todos os artefatos PENDING). Sem tamanho/hash: nada foi produzido. */
export function createManifestSkeleton(plan) {
  return {
    manifestVersion: LOGICAL_MANIFEST_VERSION,
    mode: BACKUP_MODE.LOGICAL_SNAPSHOT,
    scope: plan.scope,
    environment: plan.environment,
    projectRef: plan.projectRef,
    planId: plan.planId,
    executionId: plan.executionId,
    correlationId: plan.correlationId,
    targetReleaseSha: plan.targetReleaseSha,
    quiescenceAt: plan.quiescenceAt,
    snapshotStartedAt: null,
    snapshotCompletedAt: null,
    artifacts: sortedArtifacts(plan.artifacts.map(manifestArtifactFromPlan)),
  };
}

/** Registra o resultado de um artefato (imutável). Não calcula hash: só registra o informado. */
export function withArtifactResult(manifest, kind, result = {}) {
  return {
    ...manifest,
    artifacts: manifest.artifacts.map((artifact) => (
      artifact.kind === kind
        ? {
          ...artifact,
          size: result.size ?? artifact.size,
          sha256: result.sha256 ?? artifact.sha256,
          createdAt: result.createdAt ?? artifact.createdAt,
          toolVersion: result.toolVersion ?? artifact.toolVersion,
          postgresVersion: result.postgresVersion ?? artifact.postgresVersion,
          status: result.status ?? artifact.status,
        }
        : artifact
    )),
  };
}

const MANIFEST_KEY_ORDER = Object.freeze([
  "manifestVersion", "mode", "scope", "environment", "projectRef", "planId", "executionId",
  "correlationId", "targetReleaseSha", "quiescenceAt", "snapshotStartedAt", "snapshotCompletedAt", "artifacts",
]);
const ARTIFACT_KEY_ORDER = Object.freeze([
  "kind", "filename", "required", "size", "sha256", "createdAt", "tool", "toolVersion",
  "postgresVersion", "contentType", "format", "status",
]);

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key] ?? null]));
}

/** Forma canônica (ordem fixa de chaves e de artefatos) → mesmo manifest ⇒ mesmos bytes. */
export function canonicalizeManifest(manifest) {
  const base = pick(manifest, MANIFEST_KEY_ORDER);
  base.artifacts = sortedArtifacts(Array.isArray(manifest?.artifacts) ? manifest.artifacts : [])
    .map((artifact) => pick(artifact, ARTIFACT_KEY_ORDER));
  return base;
}

export function computeManifestDigest(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalizeManifest(manifest))).digest("hex");
}

/** Validação estrutural do manifest (independente do conteúdo dos artefatos). */
export function validateManifestStructure(manifest) {
  const problems = [];
  const push = (code, detail) => problems.push({ code, detail });
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return [{ code: "BACKUP_MANIFEST_INVALID", detail: "MANIFEST_NOT_OBJECT" }];
  }
  if (manifest.manifestVersion !== LOGICAL_MANIFEST_VERSION) push("BACKUP_MANIFEST_INVALID", "MANIFEST_VERSION");
  if (manifest.mode !== BACKUP_MODE.LOGICAL_SNAPSHOT) push("BACKUP_MANIFEST_INVALID", "MODE");
  if (manifest.scope !== BACKUP_RECOVERY_SCOPE) push("BACKUP_MANIFEST_INVALID", "SCOPE");
  if (!isUuid(manifest.correlationId)) push("BACKUP_MANIFEST_INVALID", "CORRELATION_ID");
  if (parseIsoMs(manifest.quiescenceAt) == null) push("BACKUP_MANIFEST_INVALID", "QUIESCENCE_AT");
  if (parseIsoMs(manifest.snapshotStartedAt) == null) push("BACKUP_MANIFEST_INVALID", "SNAPSHOT_STARTED_AT");
  if (parseIsoMs(manifest.snapshotCompletedAt) == null) push("BACKUP_MANIFEST_INVALID", "SNAPSHOT_COMPLETED_AT");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    push("BACKUP_MANIFEST_INVALID", "ARTIFACTS_EMPTY");
    return problems;
  }
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    if (!artifact || !LOGICAL_ARTIFACT_KINDS.includes(artifact.kind)) {
      push("BACKUP_MANIFEST_INVALID", "ARTIFACT_KIND_UNKNOWN");
      continue;
    }
    if (seen.has(artifact.kind)) push("BACKUP_MANIFEST_INVALID", `ARTIFACT_DUPLICATE:${artifact.kind}`);
    seen.add(artifact.kind);
    if (!isSafeArtifactFilename(artifact.filename)) push("BACKUP_MANIFEST_INVALID", `FILENAME:${artifact.kind}`);
    if (!LOGICAL_ARTIFACT_STATUSES.includes(artifact.status)) push("BACKUP_MANIFEST_INVALID", `STATUS:${artifact.kind}`);
    if (typeof artifact.tool !== "string" || !artifact.tool) push("BACKUP_MANIFEST_INVALID", `TOOL:${artifact.kind}`);
    if (typeof artifact.contentType !== "string" || !artifact.contentType) push("BACKUP_MANIFEST_INVALID", `CONTENT_TYPE:${artifact.kind}`);
    if (typeof artifact.format !== "string" || !artifact.format) push("BACKUP_MANIFEST_INVALID", `FORMAT:${artifact.kind}`);
  }
  if (containsSecretMaterial(manifest)) push("BACKUP_SECRET_MATERIAL", "MANIFEST_CARRIES_SECRET");
  return problems;
}

export { SHA256_RE };
