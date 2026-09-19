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
 * Lê o snapshot de um data source (fixture hoje, live amanhã) e devolve o
 * view-model da tela. Genérico: Ambientes & Releases e Manutenção compartilham
 * o MESMO contrato de data source (getSnapshot/subscribe/retry?) — só muda o
 * `build` (snapshot → view-model). Sem efeitos, sem rede, sem loading artificial.
 */
export function useDataSourceViewModel(dataSource, build) {
  const source = safeSource(dataSource);
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const viewModel = useMemo(() => build(snapshot), [build, snapshot]);
  const retry = typeof dataSource?.retry === "function" ? () => dataSource.retry() : null;
  return { viewModel, retry };
}

export function useReleaseEnvironments(dataSource) {
  return useDataSourceViewModel(dataSource, buildReleaseEnvironmentsPageViewModel);
}
