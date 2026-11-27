import { createContext, useContext } from "react";

/**
 * Situação da carga de pedidos e produtos, fornecida pelo App ao Dashboard e
 * aos Relatórios para os estados de carregando e erro.
 */
export const ContextoDadosVendas = createContext({
  carregando: false,
  erro: "",
  atualizadoEm: null,
  atualizar: null,
});

export function useDadosVendas() {
  return useContext(ContextoDadosVendas);
}
