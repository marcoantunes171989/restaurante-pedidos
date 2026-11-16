// ════════════════════════════════════════════════════════════
//  Meios de pagamento da NF-e/NFC-e (tag tPag, id YA02).
//  Fonte: MOC 7.0 — Anexo I, Leiaute e Regras de Validação da NF-e e da
//  NFC-e (versão 7.00, nov/2020), item 398.12 (atualizado na NT 2016.002 e
//  NT 2020.006). 91 = pagamento posterior: NT 2025.001 (regras YA04-10/YA05-10).
//  Código fora da tabela aparece como "Meio NN" (nunca inventamos nome).
// ════════════════════════════════════════════════════════════

export const MEIOS_PAGAMENTO_TPAG = Object.freeze({
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "05": "Crédito Loja",
  "10": "Vale Alimentação",
  "11": "Vale Refeição",
  "12": "Vale Presente",
  "13": "Vale Combustível",
  "15": "Boleto Bancário",
  "16": "Depósito Bancário",
  "17": "Pagamento Instantâneo (PIX)",
  "18": "Transferência bancária, Carteira Digital",
  "19": "Programa de fidelidade, Cashback, Crédito Virtual",
  "90": "Sem pagamento",
  "91": "Pagamento posterior",
  "99": "Outros",
});

/** Nome do meio de pagamento; com tPag 99 e xPag informado, usa o xPag do XML. */
export function nomeMeioPagamento(tPag, xPag = null) {
  const c = String(tPag ?? "").padStart(2, "0");
  if (c === "99" && xPag) return String(xPag);
  return MEIOS_PAGAMENTO_TPAG[c] || `Meio ${c}`;
}
