/* global process */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  containsSecretMaterial,
  describeCredential,
  findSecretMaterial,
} from "../../server/db-backup-contract.js";
import { buildLogicalSnapshotPlan } from "../../server/db-backup-logical.js";
import { createBackupProvider } from "../../server/db-backup-provider.js";
import { createBackupStore, createMemoryBackupTransport } from "../../server/db-backup-store.js";
import { evaluateBackupVerification, prepareBackupPlan } from "../../server/db-backup.js";
import { selectBackupStrategy } from "../../server/db-backup-strategy.js";
import {
  CORRELATION_ID,
  EXECUTION_ID,
  NOW,
  PLAN_ID,
  PROD_REF,
  QUIESCENCE_AT,
  RELEASE_SHA,
  binding,
  capabilities,
  validSnapshot,
} from "./helpers/db-backup-fixtures.js";

const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../server");
const BACKUP_FILES = readdirSync(SERVER_DIR)
  .filter((name) => /^db-backup.*\.js$/.test(name))
  .sort();

// Padrões independentes da implementação (fixados pelo teste).
const LEAK_PATTERNS = [
  /postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@/i,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bsbp_[A-Za-z0-9]{16,}/,
  /\bsb_secret_[A-Za-z0-9_-]{8,}/,
  /\b(ghp|github_pat)_[A-Za-z0-9_]{16,}/,
  /"(password|passwd|pwd)"\s*:\s*"[^"]+"/i,
  /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /"(service_?role|api_?key|apikey|token|secret|authorization)"\s*:/i,
];

function expectNoLeak(value) {
  const text = JSON.stringify(value);
  for (const pattern of LEAK_PATTERNS) expect(text).not.toMatch(pattern);
}

describe("db-backup — nenhum I/O, processo ou ambiente nos módulos", () => {
  it("existem os módulos esperados", () => {
    expect(BACKUP_FILES).toEqual([
      "db-backup-contract.js",
      "db-backup-logical.js",
      "db-backup-provider-evidence.js",
      "db-backup-provider.js",
      "db-backup-store.js",
      "db-backup-strategy.js",
      "db-backup-verification.js",
      "db-backup.js",
    ]);
  });

  for (const name of BACKUP_FILES) {
    it(`${name}: sem fetch, process.env, child_process, spawn/exec, Management API ou endpoint de restore`, () => {
      const source = readFileSync(resolve(SERVER_DIR, name), "utf8");
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/child_process/);
      expect(source).not.toMatch(/\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/);
      expect(source).not.toMatch(/api\.supabase\.com/);
      expect(source).not.toMatch(/\/database\/backups/);
      expect(source).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
      expect(source).not.toMatch(/createClient\s*\(/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN/);
      expect(source).not.toMatch(/apply_migration|pg_restore|psql\s+-/);
    });
  }

  it("api/ não ganhou função de backup/restore", () => {
    const api = readdirSync(resolve(SERVER_DIR, "../api"));
    expect(api.filter((name) => /backup|restore/i.test(name))).toEqual([]);
  });
});

describe("db-backup — detecção de material secreto", () => {
  it("detecta chaves e valores secretos, sem devolver o valor", () => {
    expect(containsSecretMaterial({ password: "x" })).toBe(true);
    expect(containsSecretMaterial({ nested: { serviceRole: "x" } })).toBe(true);
    expect(containsSecretMaterial({ note: "postgres://user:hunter2@host/db" })).toBe(true);
    expect(containsSecretMaterial({ note: "Bearer abcdef123456" })).toBe(true);
    expect(containsSecretMaterial({ note: "sbp_0123456789abcdef0123" })).toBe(true);
    expect(containsSecretMaterial(["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"])).toBe(true);
    expect(containsSecretMaterial({ note: "conn?password=abc123" })).toBe(true);
    expect(findSecretMaterial({ a: { token: "hunter2" } })).toEqual(["$.a.token"]);
    expect(JSON.stringify(findSecretMaterial({ a: { token: "hunter2" } }))).not.toContain("hunter2");
    expect(containsSecretMaterial({ mode: "LOGICAL_SNAPSHOT", refName: "PDB_PROD_BACKUP_CREATE_CREDENTIAL" })).toBe(false);
    expect(containsSecretMaterial(null)).toBe(false);
  });
});

describe("db-backup — nada de segredo em objetos públicos/relatórios", () => {
  it("plano lógico + command plan", () => {
    const planned = buildLogicalSnapshotPlan({ ...binding(), requireAuthStorageCustomization: true });
    expect(planned.ok).toBe(true);
    expectNoLeak(planned);
    expect(containsSecretMaterial(planned.plan)).toBe(false);
  });

  it("descritores de credencial, estratégia e capabilities", () => {
    expectNoLeak(["BACKUP_READ", "BACKUP_CREATE", "RESTORE"].map((a) => describeCredential(a, "PROD")));
    expectNoLeak(selectBackupStrategy(capabilities(), { nowMs: NOW }));
  });

  it("plano de backup completo, manifest e evidência de integridade", () => {
    expectNoLeak(prepareBackupPlan({ capabilities: capabilities(), binding: binding(), nowMs: NOW }));
    const snap = validSnapshot();
    const evaluation = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: snap.binding, manifest: snap.manifest, observations: snap.observations, nowMs: NOW,
    });
    expectNoLeak(evaluation);
    expectNoLeak(snap.manifest);
  });

  it("entradas com segredo são bloqueadas e o valor não é ecoado nos erros", async () => {
    const secret = "postgres://admin:S3cr3tP4ss@db.example.com:5432/postgres";
    const store = createBackupStore({ transport: createMemoryBackupTransport() });
    const result = await store.createRun({
      mode: "LOGICAL_SNAPSHOT",
      planId: PLAN_ID,
      executionId: EXECUTION_ID,
      environment: "PROD",
      projectRef: PROD_REF,
      correlationId: CORRELATION_ID,
      targetReleaseSha: RELEASE_SHA,
      quiescenceAt: QUIESCENCE_AT,
      providerMetadata: { note: secret },
    });
    expect(result.failureCode).toBe("BACKUP_SECRET_MATERIAL");
    expect(JSON.stringify(result)).not.toContain("S3cr3tP4ss");

    const snap = validSnapshot();
    const tainted = { ...snap.manifest, note: secret };
    const verified = evaluateBackupVerification({
      mode: "LOGICAL_SNAPSHOT", binding: snap.binding, manifest: tainted, observations: snap.observations, nowMs: NOW,
    });
    expect(JSON.stringify(verified)).not.toContain("S3cr3tP4ss");
    expect(verified.verification?.verified ?? false).toBe(false);

    const provider = createBackupProvider({
      environment: "PROD",
      projectRef: PROD_REF,
      impl: { getBackupStatus: async () => ({ ok: true, detail: secret }) },
    });
    const status = await provider.getBackupStatus();
    expect(status.failureCode).toBe("BACKUP_SECRET_MATERIAL");
    expect(JSON.stringify(status)).not.toContain("S3cr3tP4ss");
  });

  it("valores de ambiente nunca são lidos: nomes de referência não dependem de process.env", () => {
    const before = describeCredential("BACKUP_CREATE", "PROD");
    const saved = process.env.PDB_PROD_BACKUP_CREATE_CREDENTIAL;
    process.env.PDB_PROD_BACKUP_CREATE_CREDENTIAL = "sentinel-value-must-not-appear";
    try {
      const after = describeCredential("BACKUP_CREATE", "PROD");
      const planned = buildLogicalSnapshotPlan(binding());
      expect(after).toEqual(before);
      expect(JSON.stringify(planned)).not.toContain("sentinel-value-must-not-appear");
      expect(JSON.stringify(after)).not.toContain("sentinel-value-must-not-appear");
    } finally {
      if (saved === undefined) delete process.env.PDB_PROD_BACKUP_CREATE_CREDENTIAL;
      else process.env.PDB_PROD_BACKUP_CREATE_CREDENTIAL = saved;
    }
  });
});
