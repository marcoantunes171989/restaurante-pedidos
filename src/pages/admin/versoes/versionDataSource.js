import { normalizeVersionSnapshot } from "./versionAdapter.js";
import { VERSION_FIXTURE } from "./versionFixture.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — Contrato de data source de Versões & Releases.
//
//  Mesmo contrato do FE1/FE2 (ambientes/releaseDataSource.js): store externo
//  minúsculo consumido por useSyncExternalStore.
//
//    { kind: "fixture" | "live",
//      getSnapshot(): Snapshot,       // SÍNCRONO; mesma referência enquanto nada mudou
//      subscribe(listener): () => void,
//      retry?(): void }
//
//  Hoje só existe o adapter de FIXTURE (nenhuma rede). Futuro: um adapter live
//  entrega o mesmo snapshot NORMALIZADO (via normalizeVersionSnapshot) —
//  view-models e componentes não mudam. Nunca importar fetch/Supabase aqui.
// ════════════════════════════════════════════════════════════

const NOOP_UNSUBSCRIBE = () => {};

/** Adapter de fixture: snapshot normalizado UMA vez (referência estável), sem I/O. */
export function createFixtureVersionDataSource(raw = VERSION_FIXTURE) {
  const snapshot = normalizeVersionSnapshot(raw);
  return {
    kind: "fixture",
    getSnapshot: () => snapshot,
    subscribe: () => NOOP_UNSUBSCRIBE,
  };
}

export const defaultVersionDataSource = createFixtureVersionDataSource();
