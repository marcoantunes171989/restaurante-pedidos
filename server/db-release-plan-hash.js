// ════════════════════════════════════════════════════════════
//  PDB-I1C2 — Hash determinístico da identidade de um plano DB.
//
//  Módulo puro: sem fetch, sem DB, sem process.env, sem executor.
//  Canonicalização (PLAN_HASH_CANONICAL_VERSION = 1):
//    UTF-8 JSON compacto (sem espaços), chaves em ordem alfabética.
//    Top-level:
//      baseSha, environment, migrations, targetReleaseSha, v
//    Cada migration:
//      bytes, classification, filename, gitBlob, order, sha256
//    migrations ordenadas por `order` crescente (1..N, contíguo).
//    gitBlob ausente serializa como null.
//    Hex em minúsculo. Inteiros em decimal JSON.
//  Hash: SHA-256 hex lowercase do canonical JSON.
//  Classification entra no hash para impedir aprovação com
//  semântica de segurança diferente.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import {
  SHA1_RE,
  SHA256_RE,
  isDbEnvironment,
  isSchemaClassification,
} from "./db-release-contract.js";

export const PLAN_HASH_CANONICAL_VERSION = 1;
export const PLAN_HASH_ALGORITHM = "sha256";
export const MIGRATION_FILENAME_RE = /^[0-9A-Za-z._-]+\.sql$/;

function jsonString(value) {
  return JSON.stringify(value);
}

export function canonicalizePlanIdentity({
  environment,
  targetReleaseSha,
  baseSha,
  migrations = [],
} = {}) {
  const items = Array.isArray(migrations) ? migrations : [];
  const serialized = items.map((row) => (
    `{"bytes":${row.bytes}`
    + `,"classification":${jsonString(row.classification)}`
    + `,"filename":${jsonString(row.filename)}`
    + `,"gitBlob":${row.gitBlob == null ? "null" : jsonString(row.gitBlob)}`
    + `,"order":${row.order}`
    + `,"sha256":${jsonString(row.sha256)}}`
  ));
  return `{"baseSha":${jsonString(baseSha)}`
    + `,"environment":${jsonString(environment)}`
    + `,"migrations":[${serialized.join(",")}]`
    + `,"targetReleaseSha":${jsonString(targetReleaseSha)}`
    + `,"v":${PLAN_HASH_CANONICAL_VERSION}}`;
}

export function computePlanHash(identity) {
  const canonical = canonicalizePlanIdentity(identity);
  return crypto.createHash(PLAN_HASH_ALGORITHM).update(canonical, "utf8").digest("hex");
}

function cleanHex(value, pattern) {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return pattern.test(hex) ? hex : null;
}

export function normalizeFrozenMigrations(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
  }
  if (input.length === 0) {
    return { ok: false, error: "MIGRATION_INVENTORY_EMPTY" };
  }

  const normalized = [];
  const orders = new Set();
  const filenames = new Set();
  const hashes = new Set();

  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    const order = Number(raw.order ?? raw.migrationOrder ?? raw.migration_order);
    if (!Number.isInteger(order) || order <= 0) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    const filename = typeof raw.filename === "string" ? raw.filename.trim() : "";
    if (!MIGRATION_FILENAME_RE.test(filename)) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    const sha256 = cleanHex(raw.sha256, SHA256_RE);
    if (!sha256) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    const bytes = Number(raw.bytes);
    if (!Number.isInteger(bytes) || bytes < 0) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    const classification = raw.classification;
    if (!isSchemaClassification(classification)) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    let gitBlob = raw.gitBlob ?? raw.git_blob ?? null;
    if (gitBlob != null) {
      gitBlob = cleanHex(gitBlob, SHA1_RE);
      if (!gitBlob) return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    if (orders.has(order) || filenames.has(filename) || hashes.has(sha256)) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
    orders.add(order);
    filenames.add(filename);
    hashes.add(sha256);
    normalized.push({
      order,
      filename,
      gitBlob,
      sha256,
      bytes,
      classification,
    });
  }

  normalized.sort((a, b) => a.order - b.order);
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index].order !== index + 1) {
      return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
    }
  }
  return { ok: true, migrations: normalized };
}

export function frozenPlanIdentity({ environment, targetReleaseSha, baseSha, migrations }) {
  if (!isDbEnvironment(environment)) return { ok: false, error: "ENVIRONMENT_INVALID" };
  const target = cleanHex(targetReleaseSha, SHA1_RE);
  const base = cleanHex(baseSha, SHA1_RE);
  if (!target || !base) return { ok: false, error: "SHA_INVALID" };
  const frozen = normalizeFrozenMigrations(migrations);
  if (!frozen.ok) return frozen;
  const identity = {
    environment,
    targetReleaseSha: target,
    baseSha: base,
    migrations: frozen.migrations,
  };
  return {
    ok: true,
    identity,
    canonical: canonicalizePlanIdentity(identity),
    planHash: computePlanHash(identity),
  };
}

export function draftPlanHash({ environment, targetReleaseSha, baseSha }) {
  if (!isDbEnvironment(environment)) return { ok: false, error: "ENVIRONMENT_INVALID" };
  const target = cleanHex(targetReleaseSha, SHA1_RE);
  const base = cleanHex(baseSha, SHA1_RE);
  if (!target || !base) return { ok: false, error: "SHA_INVALID" };
  const identity = {
    environment,
    targetReleaseSha: target,
    baseSha: base,
    migrations: [],
  };
  return {
    ok: true,
    identity,
    canonical: canonicalizePlanIdentity(identity),
    planHash: computePlanHash(identity),
  };
}
