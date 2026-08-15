export function numeroFidelidade(valor, fallback = 0) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : fallback;
}

export function fidelidadeHabilitada(regra) {
  return !!regra
    && regra.ativo !== false
    && numeroFidelidade(regra.valorPorPonto) > 0
    && numeroFidelidade(regra.pontosPorReal) > 0;
}

