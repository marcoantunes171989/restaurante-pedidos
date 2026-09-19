import { useMemo, useSyncExternalStore } from "react";
import { buildReleaseEnvironmentsPageViewModel } from "./releaseViewModels.js";

const NOOP_UNSUBSCRIBE = () => {};
const ERROR_SNAPSHOT = Object.freeze({ status: "error" });

/** Data source malformado nunca quebra a tela: vira estado de erro. */
function safeSource(dataSource) {
  const ok = dataSource && typeof dataSource.getSnapshot === "function" && typeof dataSource.subscribe === "function";
  return ok
    ? dataSource
    : { getSnapshot: () => ERROR_SNAPSHOT, subscribe: () => NOOP_UNSUBSCRIBE };
}

/**
 * Lê o snapshot do data source (fixture hoje, live amanhã) e devolve o
 * view-model da página. Sem efeitos, sem rede, sem loading artificial: o
 * adapter de fixture é síncrono e já nasce em "ready".
 */
export function useReleaseEnvironments(dataSource) {
  const source = safeSource(dataSource);
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const viewModel = useMemo(() => buildReleaseEnvironmentsPageViewModel(snapshot), [snapshot]);
  const retry = typeof dataSource?.retry === "function" ? () => dataSource.retry() : null;
  return { viewModel, retry };
}
