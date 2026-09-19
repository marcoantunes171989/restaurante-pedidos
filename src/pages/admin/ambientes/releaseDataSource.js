import { RELEASE_ENVIRONMENTS_FIXTURE } from "./releaseFixture.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE1 — Contrato de data source da tela Ambientes & Releases.
//
//  Um data source é um store externo minúsculo:
//
//    {
//      kind: "fixture" | "live",
//      getSnapshot(): Snapshot      // SÍNCRONO; mesma referência enquanto nada mudou
//      subscribe(listener): () => void   // notifica quando o snapshot mudar
//      retry?(): void               // opcional — habilita "Tentar novamente"
//    }
//
//  Snapshot = { status: "loading" | "ready" | "error", source, connectionState,
//  lastUpdatedAt, currentPhase, executionProgress, environments, migrations,
//  gates, plan, flow, capabilities } (ver releaseFixture.js).
//
//  Hoje só existe o adapter de FIXTURE (nenhuma rede). A troca futura é
//  fixture adapter → live adapter (REST / Realtime / readiness do servidor /
//  executor) devolvendo o MESMO formato de snapshot: os view-models e os
//  componentes não mudam. Este arquivo NÃO importa fetch, Supabase nem nada
//  de server/ — e nunca deve importar.
// ════════════════════════════════════════════════════════════

const NOOP_UNSUBSCRIBE = () => {};

/** Adapter de fixture: snapshot fixo e estável, sem I/O e sem assinatura. */
export function createFixtureDataSource(snapshot = RELEASE_ENVIRONMENTS_FIXTURE) {
  return {
    kind: "fixture",
    getSnapshot: () => snapshot,
    subscribe: () => NOOP_UNSUBSCRIBE,
  };
}

/** Instância padrão da tela (compartilhada — o snapshot é imutável). */
export const defaultReleaseDataSource = createFixtureDataSource();
