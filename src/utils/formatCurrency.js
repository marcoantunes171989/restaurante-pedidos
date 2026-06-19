// Formata um valor numérico em Real brasileiro: 49.9 -> "R$ 49,90"
export function formatCurrencyBRL(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor) || 0);
}
