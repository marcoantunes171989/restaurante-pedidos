// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — Adapter/normalizador de Versões, Releases e Histórico.
//
//  fixture (ou, no futuro, resposta live) → normalizeVersionSnapshot →
//  snapshot normalizado → view-models → componentes.
//
//  O front define o SEU contrato (versionFixture.js); o backend NÃO precisa
//  devolver exatamente esse JSON. Um adapter live futuro só precisa entregar
//  algo que este normalizador entenda — ele aceita camelCase e snake_case,
//  descarta itens inválidos e nunca inventa um valor: campo ausente vira null.
//  Este arquivo NÃO importa fetch, Supabase nem nada de server/ — e nunca deve.
// ════════════════════════════════════════════════════════════

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Primeira chave presente (camelCase primeiro, depois aliases snake_case). */
function pick(obj, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) return obj[key];
  }
  return null;
}

const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const int = (v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const upper = (v) => {
  const s = str(v);
  return s === null ? null : s.toUpperCase();
};
const baseline = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (s === null || s.toUpperCase() === "UNKNOWN") return null;
  return /^\d+$/.test(s) ? Number(s) : s;
};

export function normalizeRelease(raw) {
  if (!isObject(raw)) return null;
  const releaseId = str(pick(raw, "releaseId", "release_id", "id"));
  if (releaseId === null) return null; // sem identidade não há release
  const migrations = pick(raw, "migrations");
  return {
    releaseId,
    version: str(pick(raw, "version", "versao")),
    releaseNumber: int(pick(raw, "releaseNumber", "release_number")),
    status: upper(pick(raw, "status")),
    sha: str(pick(raw, "sha", "commit_sha", "commitSha")),
    build: str(pick(raw, "build")),
    databaseBaseline: baseline(pick(raw, "databaseBaseline", "database_baseline")),
    migrations: Array.isArray(migrations) ? migrations.map(str).filter(Boolean) : [],
    createdAt: str(pick(raw, "createdAt", "created_at")),
    publishedAt: str(pick(raw, "publishedAt", "published_at")),
    publishedBy: str(pick(raw, "publishedBy", "published_by")),
    releaseNotes: str(pick(raw, "releaseNotes", "release_notes", "notes")),
    previousReleaseId: str(pick(raw, "previousReleaseId", "previous_release_id")),
    source: str(pick(raw, "source")),
    target: str(pick(raw, "target")),
  };
}

export function normalizeHistoryEntry(raw, index = 0) {
  if (!isObject(raw)) return null;
  return {
    id: str(pick(raw, "id")) || `history-${index}`,
    version: str(pick(raw, "version", "versao")),
    releaseNumber: int(pick(raw, "releaseNumber", "release_number")),
    releaseId: str(pick(raw, "releaseId", "release_id")),
    type: upper(pick(raw, "type")),
    status: upper(pick(raw, "status")),
    source: str(pick(raw, "source")),
    target: str(pick(raw, "target")),
    sha: str(pick(raw, "sha", "commit_sha", "commitSha")),
    databaseBaseline: baseline(pick(raw, "databaseBaseline", "database_baseline")),
    createdAt: str(pick(raw, "createdAt", "created_at")),
    publishedAt: str(pick(raw, "publishedAt", "published_at")),
    actor: str(pick(raw, "actor")),
    duration: (() => { const n = pick(raw, "duration"); return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null; })(),
    previousReleaseId: str(pick(raw, "previousReleaseId", "previous_release_id")),
    rollbackOfReleaseId: str(pick(raw, "rollbackOfReleaseId", "rollback_of_release_id")),
    notes: str(pick(raw, "notes", "release_notes")),
  };
}

const VALID_STATUS = ["loading", "ready", "error"];

/**
 * Snapshot bruto → snapshot normalizado. Inválido → { status: "error" } (o
 * view-model mostra o estado de erro). Capabilities são fail-closed: só `true`
 * estrito habilita.
 */
export function normalizeVersionSnapshot(raw) {
  if (!isObject(raw) || !VALID_STATUS.includes(raw.status)) return Object.freeze({ status: "error" });
  const productVersion = isObject(raw.productVersion) ? raw.productVersion : {};
  const source = isObject(raw.source) ? raw.source : {};
  const caps = isObject(raw.capabilities) ? raw.capabilities : {};
  return Object.freeze({
    status: raw.status,
    source: { kind: str(source.kind) || "unknown", label: str(source.label) || "Fonte não identificada" },
    connectionState: str(raw.connectionState),
    productVersion: { current: str(productVersion.current), source: str(productVersion.source) },
    releases: (Array.isArray(raw.releases) ? raw.releases : []).map(normalizeRelease).filter(Boolean),
    history: (Array.isArray(raw.history) ? raw.history : []).map(normalizeHistoryEntry).filter(Boolean),
    capabilities: {
      canEvaluateReversal: caps.canEvaluateReversal === true,
      canExecuteReversal: caps.canExecuteReversal === true,
    },
  });
}
