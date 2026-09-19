import { useDataSourceViewModel } from "../ambientes/useReleaseEnvironments.js";
import { buildMaintenancePageViewModel } from "./maintenanceViewModels.js";

/** Snapshot do data source (fixture hoje, live amanhã) → view-model da tela. */
export function useMaintenanceSnapshot(dataSource) {
  return useDataSourceViewModel(dataSource, buildMaintenancePageViewModel);
}
