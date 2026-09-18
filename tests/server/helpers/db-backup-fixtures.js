// Fixtures determinísticos do PDB-I2B. Sem rede, sem segredo, sem processo.
import crypto from "node:crypto";
import { KNOWN_PROJECT_REFS } from "../../../server/db-backup-contract.js";
import {
  buildLogicalSnapshotPlan,
  createManifestSkeleton,
  withArtifactResult,
} from "../../../server/db-backup-logical.js";

export const NOW = Date.UTC(2026, 8, 18, 19, 0, 0);
export const MIN = 60_000;
export const iso = (ms) => new Date(ms).toISOString();

export const PLAN_ID = "11111111-1111-4111-8111-111111111111";
export const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
export const CORRELATION_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_CORRELATION_ID = "44444444-4444-4444-8444-444444444444";
export const RELEASE_SHA = "a".repeat(40);
export const QUIESCENCE_MS = NOW - 10 * MIN;
export const QUIESCENCE_AT = iso(QUIESCENCE_MS);

export const HML_REF = KNOWN_PROJECT_REFS.HML;
export const PROD_REF = KNOWN_PROJECT_REFS.PROD;

export function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function binding(overrides = {}) {
  return {
    planId: PLAN_ID,
    executionId: EXECUTION_ID,
    correlationId: CORRELATION_ID,
    targetReleaseSha: RELEASE_SHA,
    environment: "PROD",
    projectRef: PROD_REF,
    quiescenceAt: QUIESCENCE_AT,
    ...overrides,
  };
}

export function capabilities(overrides = {}) {
  return {
    environment: "PROD",
    projectRef: PROD_REF,
    providerSource: "FIXTURE",
    observedAt: iso(NOW - 5_000),
    logicalSnapshotSupported: true,
    pitrSupported: false,
    pitrEnabled: false,
    managedDailySupported: true,
    physicalBackupSupported: false,
    recoveryPointRangeKnown: false,
    restorePitrSupported: false,
    restoreLogicalSupported: false,
    ...overrides,
  };
}

export function pitrEvidence(overrides = {}) {
  return {
    environment: "PROD",
    projectRef: PROD_REF,
    providerSource: "FIXTURE",
    observedAt: iso(NOW - 5_000),
    pitrEnabled: true,
    walgEnabled: true,
    earliestRecoveryAt: iso(NOW - 24 * 60 * MIN),
    latestRecoveryAt: iso(NOW - 60_000),
    backups: [{ backupId: "b-1", status: "COMPLETED", insertedAt: iso(NOW - 60 * MIN), physical: true }],
    ...overrides,
  };
}

export const KIND_CONTENT = {
  ROLES: "-- roles\nCREATE ROLE app;\n",
  SCHEMA: "-- schema\nCREATE TABLE t(id int);\n",
  DATA: "-- data\nCOPY t FROM stdin;\n",
  MIGRATION_HISTORY: "-- history\nCOPY schema_migrations FROM stdin;\n",
  AUTH_STORAGE_CUSTOMIZATION: "-- auth/storage diff\n",
};

/** Manifest + observations válidos (L2 verificável) para o binding informado. */
export function validSnapshot({ bindingOverrides = {}, requireAuthStorageCustomization = false } = {}) {
  const b = binding(bindingOverrides);
  const planned = buildLogicalSnapshotPlan({ ...b, requireAuthStorageCustomization });
  if (!planned.ok) throw new Error(`fixture plan failed: ${planned.failureCode}`);
  let manifest = createManifestSkeleton(planned.plan);
  const observations = {};
  const startedAt = iso(QUIESCENCE_MS + MIN);
  manifest = {
    ...manifest,
    snapshotStartedAt: startedAt,
    snapshotCompletedAt: iso(QUIESCENCE_MS + 5 * MIN),
  };
  for (const artifact of manifest.artifacts) {
    const content = KIND_CONTENT[artifact.kind];
    manifest = withArtifactResult(manifest, artifact.kind, {
      size: content.length,
      sha256: sha(content),
      createdAt: iso(QUIESCENCE_MS + 2 * MIN),
      toolVersion: "fixture-1.0",
      postgresVersion: "17.6",
      status: "COMPLETE",
    });
    observations[artifact.kind] = {
      exists: true,
      size: content.length,
      sha256: sha(content),
      formatCheck: { method: "SQL_TERMINATOR", ok: true },
    };
  }
  return { binding: b, plan: planned.plan, manifest, observations };
}

/** Clona superficialmente com edição de um artefato. */
export function editArtifact(manifest, kind, patch) {
  return {
    ...manifest,
    artifacts: manifest.artifacts.map((a) => (a.kind === kind ? { ...a, ...patch } : a)),
  };
}
