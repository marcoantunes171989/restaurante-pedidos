import { MAINTENANCE_FIXTURE } from "./maintenanceFixture.js";

// ════════════════════════════════════════════════════════════
//  PDB-I3-FE2 — Contrato de data source da tela Manutenção.
//
//  Mesmo contrato do FE1 (ambientes/releaseDataSource.js): um store externo
//  minúsculo consumido por useSyncExternalStore.
//
//    {
//      kind: "fixture" | "live",
//      getSnapshot(): Snapshot         // SÍNCRONO; mesma referência enquanto nada mudou
//      subscribe(listener): () => void // notifica quando o snapshot mudar
//      retry?(): void                  // opcional — habilita "Tentar novamente"
//    }
//
//  Fluxo futuro:  backend → adapter → snapshot → view-model → UI.
//  A UI NUNCA conhece o formato bruto da API: só o snapshot (ver
//  maintenanceFixture.js) e, depois, o view-model.
//
//  Snapshot inicial + patches (Realtime): o adapter live entrega o snapshot
//  inicial e depois chama `applyPatch(patch)` a cada evento. `applyMaintenancePatch`
//  troca só as seções tocadas — o restante mantém a MESMA referência, então nada
//  precisa ser reconstruído do zero e o view-model continua sendo recalculado
//  apenas a partir do snapshot novo. Este arquivo NÃO importa fetch, Supabase
//  nem nada de server/ — e nunca deve importar.
// ════════════════════════════════════════════════════════════

const NOOP_UNSUBSCRIBE = () => {};

// Seções de objeto único: um patch faz merge raso por chave.
const SECTIONS = ["maintenance", "execution", "plan", "executor"];
// Proteções: cada uma é mesclada individualmente.
const PROTECTIONS = ["loginGate", "writeFence", "activeSessions", "inFlightOperations", "executionLock", "backup"];
// Campos de topo substituídos por inteiro.
const REPLACED = ["status", "mode", "source", "connectionState", "lastUpdatedAt", "capabilities"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Aplica um patch parcial a um snapshot e devolve um snapshot NOVO (o original
 * nunca é mutado). Seções ausentes do patch preservam a referência.
 *
 *  patch = {
 *    maintenance?, execution?, plan?, executor?,          // merge raso
 *    protections?: { loginGate?, writeFence?, … },        // merge raso por proteção
 *    timelineAppend?: Event[],                            // acrescenta (dedupe por id)
 *    migrations?: Migration[],                            // substitui a lista
 *    status?, mode?, source?, connectionState?, lastUpdatedAt?, capabilities?
 *  }
 */
export function applyMaintenancePatch(snapshot, patch) {
  if (!isObject(snapshot) || !isObject(patch)) return snapshot;
  const next = { ...snapshot };

  SECTIONS.forEach((key) => {
    if (isObject(patch[key])) next[key] = { ...snapshot[key], ...patch[key] };
  });

  if (isObject(patch.protections)) {
    const protections = { ...snapshot.protections };
    PROTECTIONS.forEach((key) => {
      if (isObject(patch.protections[key])) protections[key] = { ...snapshot.protections?.[key], ...patch.protections[key] };
    });
    next.protections = protections;
  }

  if (Array.isArray(patch.timelineAppend) && patch.timelineAppend.length > 0) {
    const atual = Array.isArray(snapshot.timeline) ? snapshot.timeline : [];
    const ids = new Set(atual.map((e) => e?.id));
    next.timeline = [...atual, ...patch.timelineAppend.filter((e) => !ids.has(e?.id))];
  }

  if (Array.isArray(patch.migrations)) next.migrations = patch.migrations;

  REPLACED.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  });

  return Object.freeze(next);
}

/** Adapter de fixture: snapshot fixo e estável, sem I/O e sem assinatura. */
export function createFixtureDataSource(snapshot = MAINTENANCE_FIXTURE) {
  return {
    kind: "fixture",
    getSnapshot: () => snapshot,
    subscribe: () => NOOP_UNSUBSCRIBE,
  };
}

/**
 * Store em memória alimentado por patches — o encaixe do futuro adapter
 * live/Realtime (snapshot inicial + `applyPatch` por evento). Sem I/O.
 */
export function createPatchableDataSource(initialSnapshot, { kind = "live" } = {}) {
  let atual = initialSnapshot;
  const ouvintes = new Set();
  return {
    kind,
    getSnapshot: () => atual,
    subscribe: (listener) => {
      ouvintes.add(listener);
      return () => ouvintes.delete(listener);
    },
    applyPatch(patch) {
      const proximo = applyMaintenancePatch(atual, patch);
      if (proximo === atual) return;
      atual = proximo;
      ouvintes.forEach((listener) => listener());
    },
  };
}

/** Instância padrão da tela (compartilhada — o snapshot é imutável). */
export const defaultMaintenanceDataSource = createFixtureDataSource();
