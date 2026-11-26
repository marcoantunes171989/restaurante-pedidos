// ════════════════════════════════════════════════════════════
//  NFC-e de ENTREGA A DOMICÍLIO — parâmetros por loja. Desligado por padrão.
//  Venda não presencial leva o endereço do cliente (Ajuste SINIEF 09/26). Na NFC-e: indPres = 4,
//  destinatário identificado (rejeição 787) e com endereço (788). Modalidade do frete diferente de 9
//  só nesse caso (753). Documento 27 (Fiscal), seção 9: o que ainda não foi provado na SEFAZ.
//  Não cobre marketplace/intermediador (iFood etc.): o XML sai sempre com indIntermed = 0.
// ════════════════════════════════════════════════════════════

// 3 = a própria loja leva; 0 = a loja contrata um terceiro; 9 = sem ocorrência de transporte.
export const MODALIDADES_FRETE = [
  ["3", "Entrega própria da loja (transporte próprio)"],
  ["0", "Terceiro contratado pela loja"],
  ["9", "Sem ocorrência de transporte"],
];

export function normalizarEntregaNfce(config) {
  const c = config || {};
  return {
    ativo: c.ativo === true,
    modFrete: MODALIDADES_FRETE.some(([v]) => v === String(c.modFrete)) ? String(c.modFrete) : "3",
    informarTransportador: c.informarTransportador !== false,
  };
}

/**
 * Grupo transp da nota de entrega. Como transportador só vai a própria loja (CNPJ e razão social do emitente), e só na
 * entrega própria (3): dados de um terceiro ainda não são cadastrados.
 */
export function transporteDaEntrega(config, { documento = "", emitente = {} } = {}) {
  const c = normalizarEntregaNfce(config);
  if (!c.informarTransportador || c.modFrete !== "3") return { modFrete: c.modFrete };
  return {
    modFrete: c.modFrete,
    transporta: {
      ...(String(documento).length === 11 ? { CPF: documento } : { CNPJ: documento }),
      xNome: emitente.razaoSocial, UF: emitente.uf,
    },
  };
}
