// Peças puras do cadastro fiscal do produto (testáveis fora do App).

/** Percentual de crédito do Simples digitado ("1,25", "3") → número de 0,01 a 5, ou null se inválido. */
export function percentualCreditoSimples(texto) {
  const v = Number(String(texto ?? "").replace(",", "."));
  return Number.isFinite(v) && v > 0 && v <= 5 ? v : null;
}

/** Novo JSONB fiscal do produto com o crédito do Simples, mesclando (não apaga origem, unidade etc.). */
export function fiscalComCredito(fiscalAtual, percentual) {
  const base = fiscalAtual && typeof fiscalAtual === "object" ? fiscalAtual : {};
  return { ...base, creditoSnAliquota: percentual };
}

/**
 * Vínculos fiscais do formulário do produto no formato de coluna do banco. Só entra a chave que o formulário enviou
 * (undefined = não mexe; null = desvincula). Sem isso, NCM/CFOP/PIS/COFINS/IPI/CEST e a configuração fiscal da loja
 * apareciam salvos na tela e voltavam ao valor antigo depois de recarregar.
 */
export function patchVinculosFiscais(dados = {}) {
  const mapa = { ncmId: "ncm_id", cfopId: "cfop_id", pisId: "pis_id", cofinsId: "cofins_id", ipiId: "ipi_id", cestId: "cest_id", lojaFiscalRegraId: "loja_fiscal_regra_id" };
  const patch = {};
  for (const [campo, coluna] of Object.entries(mapa)) {
    if (dados[campo] !== undefined) patch[coluna] = dados[campo] ?? null;
  }
  return patch;
}
