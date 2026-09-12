import { createContext, useContext } from "react";

// ════════════════════════════════════════════════════════════
//  Microgate 08-B5-B — Context React do estado de manutenção.
//
//  NÃO chama useMaintenanceState, NÃO faz fetch, timer, polling,
//  Supabase nem escrita. Apenas recebe o resultado já existente
//  da chamada única em App.jsx e o distribui para consumidores
//  futuros (gates B11/B12/B13). Sem default state falso.
// ════════════════════════════════════════════════════════════

/* eslint-disable react-refresh/only-export-components --
   Provider e hook consumidor no mesmo módulo (contrato B5-B).
   Separar exigiria um quinto arquivo fora do escopo. */

const MaintenanceStateContext = createContext(undefined);

export function MaintenanceStateProvider({ value, children }) {
  return (
    <MaintenanceStateContext.Provider value={value}>
      {children}
    </MaintenanceStateContext.Provider>
  );
}

export function useMaintenanceStateContext() {
  const value = useContext(MaintenanceStateContext);
  if (value === undefined) {
    throw new Error(
      "useMaintenanceStateContext deve ser usado dentro de MaintenanceStateProvider.",
    );
  }
  return value;
}
