import { describe, expect, it } from "vitest";
import {
  LOGICAL_MANIFEST_VERSION,
  LOGICAL_OPERATIONS,
  LOGICAL_OPTIONAL_ARTIFACT_KINDS,
  LOGICAL_REQUIRED_ARTIFACT_KINDS,
  assertCommandPlanSafe,
  buildLogicalSnapshotPlan,
  canonicalizeManifest,
  computeManifestDigest,
} from "../../server/db-backup-logical.js";
import {
  buildIntegrityEvidence,
  evaluateL3Evidence,
  satisfiesPreMigrationBackup,
  verifyLogicalSnapshotL2,
} from "../../server/db-backup-verification.js";
import {
  CORRELATION_ID,
  HML_REF,
  MIN,
  NOW,
  OTHER_CORRELATION_ID,
  PLAN_ID,
  QUIESCENCE_MS,
  binding,
  editArtifact,
  iso,
  sha,
  validSnapshot,
} from "./helpers/db-backup-fixtures.js";

function verify(snapshot, overrides = {}) {
  return verifyLogicalSnapshotL2({
    manifest: snapshot.manifest,
    observations: snapshot.observations,
    expected: snapshot.binding,
    nowMs: NOW,
    ...overrides,
  });
}

describe("db-backup-logical — plano, command plan e manifest", () => {
  it("plano cobre artefatos obrigatórios e é database-only", () => {
    const { plan } = validSnapshot();
    expect(plan.manifestVersion).toBe(LOGICAL_MANIFEST_VERSION);
    expect(plan.mode).toBe("LOGICAL_SNAPSHOT");
    expect(plan.scope).toBe("DATABASE_RECOVERY");
    expect(plan.excludedScope).toBe("FULL_APPLICATION_ASSET_RECOVERY");
    expect(plan.storageObjectsIncluded).toBe(false);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.artifacts.map((a) => a.kind)).toEqual(LOGICAL_REQUIRED_ARTIFACT_KINDS);
    expect(plan.artifacts.every((a) => a.required)).toBe(true);
    expect(LOGICAL_OPTIONAL_ARTIFACT_KINDS).toEqual(["AUTH_STORAGE_CUSTOMIZATION"]);
    expect(LOGICAL_OPERATIONS).toContain("OPTIONAL_AUTH_STORAGE_DIFF");
  });

  it("customização auth/storage só entra quando explicitamente exigida (e vira obrigatória)", () => {
    const without = validSnapshot().plan;
    expect(without.artifacts.some((a) => a.kind === "AUTH_STORAGE_CUSTOMIZATION")).toBe(false);
    const withIt = validSnapshot({ requireAuthStorageCustomization: true }).plan;
    const extra = withIt.artifacts.find((a) => a.kind === "AUTH_STORAGE_CUSTOMIZATION");
    expect(extra).toMatchObject({ operation: "OPTIONAL_AUTH_STORAGE_DIFF", required: true });
  });

  it("command plan usa só referências de credencial BACKUP_CREATE do ambiente", () => {
    const { plan } = validSnapshot();
    const refs = plan.artifacts.flatMap((a) => a.command.args.filter((arg) => arg && typeof arg === "object" && "credentialRef" in arg));
    expect(refs).toHaveLength(plan.artifacts.length);
    for (const ref of refs) expect(ref.credentialRef).toBe("PDB_PROD_BACKUP_CREATE_CREDENTIAL");
    expect(assertCommandPlanSafe(plan.artifacts.map((a) => a.command), { environment: "PROD" }).ok).toBe(true);
  });

  it("command plan rejeita credencial de outro ambiente ou de outra autoridade", () => {
    const wrongEnv = [{ tool: "supabase", args: ["db", "dump", { credentialRef: "PDB_HML_BACKUP_CREATE_CREDENTIAL" }] }];
    expect(assertCommandPlanSafe(wrongEnv, { environment: "PROD" }).failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    const restoreRef = [{ tool: "supabase", args: ["db", { credentialRef: "PDB_PROD_RESTORE_CREDENTIAL" }] }];
    expect(assertCommandPlanSafe(restoreRef, { environment: "PROD" }).failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
    const readRef = [{ tool: "pg_dump", args: [{ credentialRef: "PDB_PROD_BACKUP_READ_CREDENTIAL" }] }];
    expect(assertCommandPlanSafe(readRef, { environment: "PROD" }).failureCode).toBe("CREDENTIAL_AUTHORITY_MISMATCH");
  });

  it("plano BLOQUEIA (não embute) quando um argumento traria segredo literal", () => {
    const literalUrl = [{ tool: "pg_dump", args: ["--dbname", "postgres://user:hunter2@db.example.com:5432/postgres"] }];
    expect(assertCommandPlanSafe(literalUrl, { environment: "PROD" }).failureCode).toBe("BACKUP_SECRET_MATERIAL");
    const shape = [{ tool: "pg_dump", args: [{ password: "x" }] }];
    expect(assertCommandPlanSafe(shape, { environment: "PROD" }).failureCode).toBe("BACKUP_SECRET_MATERIAL");
    const unsafeOut = [{ tool: "pg_dump", args: [{ outputFile: "../../etc/passwd" }] }];
    expect(assertCommandPlanSafe(unsafeOut, { environment: "PROD" }).failureCode).toBe("BACKUP_INPUT_INVALID");
    const badTool = [{ tool: "bash", args: [] }];
    expect(assertCommandPlanSafe(badTool, { environment: "PROD" }).failureCode).toBe("BACKUP_INPUT_INVALID");
  });

  it("plano falha fechado com binding incompleto ou identidade errada", () => {
    expect(buildLogicalSnapshotPlan({ ...binding(), correlationId: "nope" }).failureCode).toBe("BACKUP_BINDING_MISSING");
    expect(buildLogicalSnapshotPlan({ ...binding(), projectRef: HML_REF }).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    expect(buildLogicalSnapshotPlan({ ...binding(), quiescenceAt: "x" }).failureCode).toBe("BACKUP_QUIESCENCE_INVALID");
    expect(buildLogicalSnapshotPlan({ ...binding(), targetReleaseSha: "abc" }).failureCode).toBe("BACKUP_BINDING_MISSING");
  });

  it("manifest é determinístico (ordem de chaves/artefatos fixa)", () => {
    const { manifest } = validSnapshot();
    const shuffled = { ...manifest, artifacts: [...manifest.artifacts].reverse() };
    expect(JSON.stringify(canonicalizeManifest(shuffled))).toBe(JSON.stringify(canonicalizeManifest(manifest)));
    expect(computeManifestDigest(shuffled)).toBe(computeManifestDigest(manifest));
    expect(computeManifestDigest(manifest)).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.artifacts[0])).toEqual(expect.arrayContaining([
      "kind", "filename", "required", "size", "sha256", "createdAt", "tool", "toolVersion",
      "postgresVersion", "contentType", "format", "status",
    ]));
  });
});

describe("db-backup-verification — L2 do snapshot lógico", () => {
  it("todos os artefatos válidos → VERIFIED em L2", () => {
    const result = verify(validSnapshot());
    expect(result.failures).toEqual([]);
    expect(result.verified).toBe(true);
    expect(result.level).toBe("L2");
    expect(result.manifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(satisfiesPreMigrationBackup({ mode: result.mode, level: result.level, verified: result.verified })).toBe(true);
  });

  it("artefato ausente na observação → falha", () => {
    const snap = validSnapshot();
    delete snap.observations.DATA;
    const result = verify(snap);
    expect(result.verified).toBe(false);
    expect(result.failureCode).toBe("BACKUP_ARTIFACT_MISSING");
  });

  it("artefato obrigatório ausente do manifest → falha (required não é decidido pelo manifest)", () => {
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, artifacts: snap.manifest.artifacts.filter((a) => a.kind !== "SCHEMA") };
    expect(verify(snap).failureCode).toBe("BACKUP_ARTIFACT_MISSING");
    const downgraded = validSnapshot();
    downgraded.manifest = editArtifact(downgraded.manifest, "ROLES", { required: false });
    expect(verify(downgraded).failures.some((f) => f.detail === "REQUIRED_FLAG_DOWNGRADED")).toBe(true);
  });

  it("size zero → falha", () => {
    const snap = validSnapshot();
    snap.manifest = editArtifact(snap.manifest, "DATA", { size: 0 });
    snap.observations.DATA = { ...snap.observations.DATA, size: 0 };
    const result = verify(snap);
    expect(result.verified).toBe(false);
    expect(result.failures.some((f) => f.detail === "ARTIFACT_EMPTY_OR_SIZE_INVALID" && f.kind === "DATA")).toBe(true);
  });

  it("size divergente entre manifest e observado → falha", () => {
    const snap = validSnapshot();
    snap.observations.SCHEMA = { ...snap.observations.SCHEMA, size: snap.observations.SCHEMA.size + 1 };
    expect(verify(snap).failures.some((f) => f.detail === "SIZE_MISMATCH")).toBe(true);
  });

  it("formato de hash inválido → falha (manifest ou observado)", () => {
    const badManifest = validSnapshot();
    badManifest.manifest = editArtifact(badManifest.manifest, "ROLES", { sha256: "XYZ" });
    expect(verify(badManifest).failureCode).toBe("BACKUP_HASH_MISMATCH");
    const upper = validSnapshot();
    upper.observations.ROLES = { ...upper.observations.ROLES, sha256: upper.observations.ROLES.sha256.toUpperCase() };
    expect(verify(upper).failureCode).toBe("BACKUP_HASH_MISMATCH");
  });

  it("hash observado diferente do esperado → falha", () => {
    const snap = validSnapshot();
    snap.observations.DATA = { ...snap.observations.DATA, sha256: sha("adulterado") };
    const result = verify(snap);
    expect(result.verified).toBe(false);
    expect(result.failures.some((f) => f.detail === "SHA256_DIFFERS")).toBe(true);
  });

  it("verificação de formato falha ou ausente → falha", () => {
    const failed = validSnapshot();
    failed.observations.SCHEMA = { ...failed.observations.SCHEMA, formatCheck: { method: "SQL_TERMINATOR", ok: false } };
    expect(verify(failed).failureCode).toBe("BACKUP_FORMAT_INVALID");
    const missing = validSnapshot();
    delete missing.observations.SCHEMA.formatCheck;
    expect(verify(missing).failureCode).toBe("BACKUP_FORMAT_INVALID");
    const unknownMethod = validSnapshot();
    unknownMethod.observations.SCHEMA = { ...unknownMethod.observations.SCHEMA, formatCheck: { method: "EXIT_CODE", ok: true } };
    expect(verify(unknownMethod).failureCode).toBe("BACKUP_FORMAT_INVALID");
  });

  it("exitCode=0 sozinho nunca verifica (sem hash/formato)", () => {
    const snap = validSnapshot();
    for (const kind of Object.keys(snap.observations)) {
      snap.observations[kind] = { exists: true, exitCode: 0 };
    }
    const result = verify(snap);
    expect(result.verified).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("projeto errado → falha", () => {
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, projectRef: HML_REF };
    expect(verify(snap).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
  });

  it("ambiente errado → falha", () => {
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, environment: "HML" };
    expect(verify(snap).failureCode).toBe("BACKUP_PROJECT_MISMATCH");
    const expectedHml = verifyLogicalSnapshotL2({
      manifest: snap.manifest.environment === "HML" ? validSnapshot().manifest : snap.manifest,
      observations: snap.observations,
      expected: binding({ environment: "HML", projectRef: HML_REF }),
      nowMs: NOW,
    });
    expect(expectedHml.verified).toBe(false);
  });

  it("correlação errada → falha", () => {
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, correlationId: OTHER_CORRELATION_ID };
    const result = verify(snap);
    expect(result.failureCode).toBe("BACKUP_CORRELATION_MISMATCH");
    expect(result.failures.some((f) => f.detail === "CORRELATION_ID")).toBe(true);
  });

  it("plano/execução/sha alvo não vinculados → falha (backup de outra execução)", () => {
    for (const [field, value] of [
      ["planId", "55555555-5555-4555-8555-555555555555"],
      ["executionId", "66666666-6666-4666-8666-666666666666"],
      ["targetReleaseSha", "c".repeat(40)],
    ]) {
      const snap = validSnapshot();
      snap.manifest = { ...snap.manifest, [field]: value };
      expect(verify(snap).failureCode).toBe("BACKUP_CORRELATION_MISMATCH");
    }
  });

  it("snapshot iniciado antes da quiescência → falha", () => {
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, snapshotStartedAt: iso(QUIESCENCE_MS - MIN) };
    expect(verify(snap).failureCode).toBe("BACKUP_SNAPSHOT_BEFORE_QUIESCENCE");
    const early = validSnapshot();
    early.manifest = editArtifact(early.manifest, "DATA", { createdAt: iso(QUIESCENCE_MS - MIN) });
    expect(verify(early).failures.some((f) => f.detail === "ARTIFACT_CREATED_BEFORE_QUIESCENCE")).toBe(true);
  });

  it("backup não vinculado à quiescência atual (stale) → falha", () => {
    const snap = validSnapshot();
    const requiesced = verifyLogicalSnapshotL2({
      manifest: snap.manifest,
      observations: snap.observations,
      expected: { ...snap.binding, quiescenceAt: iso(QUIESCENCE_MS + 3 * MIN) },
      nowMs: NOW,
    });
    expect(requiesced.verified).toBe(false);
    expect(requiesced.failures.some((f) => f.detail === "QUIESCENCE_GENERATION_CHANGED")).toBe(true);
  });

  it("snapshot concluído depois do início da migration → falha", () => {
    const snap = validSnapshot();
    const result = verify(snap, { expected: { ...snap.binding, migrationStartedAt: iso(QUIESCENCE_MS + 2 * MIN) } });
    expect(result.verified).toBe(false);
    expect(result.failureCode).toBe("BACKUP_EVIDENCE_STALE");
  });

  it("artefato FAILED ou PENDING → falha", () => {
    const failed = validSnapshot();
    failed.manifest = editArtifact(failed.manifest, "ROLES", { status: "FAILED" });
    expect(verify(failed).failureCode).toBe("BACKUP_CREATE_FAILED");
    const pending = validSnapshot();
    pending.manifest = editArtifact(pending.manifest, "ROLES", { status: "PENDING" });
    expect(verify(pending).failureCode).toBe("BACKUP_ARTIFACT_MISSING");
  });

  it("manifest estruturalmente inválido → falha sem digest", () => {
    expect(verifyLogicalSnapshotL2({ manifest: null, observations: {}, expected: binding(), nowMs: NOW }).verified).toBe(false);
    const snap = validSnapshot();
    snap.manifest = { ...snap.manifest, manifestVersion: 99 };
    const result = verify(snap);
    expect(result.failureCode).toBe("BACKUP_MANIFEST_INVALID");
    expect(result.manifestDigest).toBeNull();
    const dup = validSnapshot();
    dup.manifest = { ...dup.manifest, artifacts: [...dup.manifest.artifacts, dup.manifest.artifacts[0]] };
    expect(verify(dup).verified).toBe(false);
  });

  it("customização auth/storage exigida e ausente → impede L2; presente → passa", () => {
    const snap = validSnapshot();
    const required = verify(snap, { expected: { ...snap.binding, requireAuthStorageCustomization: true } });
    expect(required.verified).toBe(false);
    expect(required.failures.some((f) => f.kind === "AUTH_STORAGE_CUSTOMIZATION")).toBe(true);
    const full = validSnapshot({ requireAuthStorageCustomization: true });
    expect(verify(full, { expected: { ...full.binding, requireAuthStorageCustomization: true } }).verified).toBe(true);
  });

  it("evidência de integridade persistível é ligada ao binding e sem segredo", () => {
    const snap = validSnapshot();
    const verification = verify(snap);
    const built = buildIntegrityEvidence({ verification, manifest: snap.manifest, binding: snap.binding, nowMs: NOW });
    expect(built.ok).toBe(true);
    expect(built.evidence).toMatchObject({
      verificationLevel: "L2",
      result: "VERIFIED",
      mode: "LOGICAL_SNAPSHOT",
      scope: "DATABASE_RECOVERY",
      binding: { planId: PLAN_ID, correlationId: CORRELATION_ID, environment: "PROD" },
    });
    expect(built.evidence.artifacts).toHaveLength(4);
    expect(JSON.stringify(built.evidence)).not.toMatch(/password|token|secret/i);
  });
});

describe("db-backup-verification — L3 apenas como contrato", () => {
  const validL3 = {
    rehearsalId: "77777777-7777-4777-8777-777777777777",
    isolated: true,
    restoredEnvironment: "REHEARSAL_ISOLATED",
    startedAt: iso(NOW - 10 * MIN),
    completedAt: iso(NOW - 5 * MIN),
    integrityChecks: [{ name: "row-counts", ok: true }],
    smokeResult: "PASSED",
    measuredRtoMs: 300_000,
    result: "PASSED",
  };

  it("L3 é modelado mas nunca executável nem habilita restore", () => {
    const evaluation = evaluateL3Evidence(validL3);
    expect(evaluation.structurallyValid).toBe(true);
    expect(evaluation.executedByThisModule).toBe(false);
    expect(evaluation.executable).toBe(false);
    expect(evaluation.autoBackupRestoreReady).toBe(false);
  });

  it("L3 não isolado ou incompleto é inválido", () => {
    expect(evaluateL3Evidence({ ...validL3, isolated: false }).structurallyValid).toBe(false);
    expect(evaluateL3Evidence({ ...validL3, integrityChecks: [] }).structurallyValid).toBe(false);
    expect(evaluateL3Evidence(null).structurallyValid).toBe(false);
    expect(evaluateL3Evidence({ ...validL3, result: "FAILED" }).claimedPassed).toBe(false);
  });

  it("nenhum nível diferente de L2 lógico satisfaz o backup pré-migration", () => {
    expect(satisfiesPreMigrationBackup({ mode: "LOGICAL_SNAPSHOT", level: "L1", verified: true })).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: "PITR_RECOVERY_POINT", level: "L2", verified: true })).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: "MANAGED_DAILY", level: "L3", verified: true })).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: "LOGICAL_SNAPSHOT", level: "L2", verified: false })).toBe(false);
    expect(satisfiesPreMigrationBackup({ mode: "LOGICAL_SNAPSHOT", level: "L2", verified: true })).toBe(true);
  });
});
