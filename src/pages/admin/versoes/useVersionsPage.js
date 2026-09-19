import { useDataSourceViewModel } from "../ambientes/useReleaseEnvironments.js";
import { buildVersionsPageViewModel } from "./versionViewModels.js";

/** Snapshot do data source (fixture hoje, live amanhã) → view-model de Versões & Releases. */
export function useVersionsPage(dataSource) {
  return useDataSourceViewModel(dataSource, buildVersionsPageViewModel);
}
