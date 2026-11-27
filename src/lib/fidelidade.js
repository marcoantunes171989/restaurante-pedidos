export function numeroFidelidade(valor, fallback = 0) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : fallback;
}

const centavos = (v) => Math.round((Number(v) || 0) * 100);

/** Pontos de um valor pago em reais: 1 ponto a cada `valorPorPonto`. Contas em centavos. */
export function pontosPor(valorEmReais, valorPorPonto) {
  const porPonto = centavos(numeroFidelidade(valorPorPonto));
  const valor = centavos(valorEmReais);
  return porPonto > 0 && valor > 0 ? Math.floor(valor / porPonto) : 0;
}

/**
 * Pontos de uma venda, sobre o TOTAL PAGO (itens + taxa + acréscimo − descontos e cupom), sem a parte paga com pontos.
 * O total é repartido entre os pedidos conforme `valorDoPedido`; a parte paga com pontos sai do primeiro cliente
 * identificado. Usada tanto no aviso do caixa quanto no crédito. Devolve { [telefone]: { valor, pontos } }.
 */
export function pontosDaVenda({ pedidos = [], total = 0, pagoComPontos = 0, valorPorPonto = 0, valorDoPedido }) {
  const pesos = pedidos.map((o) => Math.max(0, centavos(valorDoPedido(o))));
  const soma = pesos.reduce((s, p) => s + p, 0);
  const porTelefone = {};
  let repartido = 0;
  pedidos.forEach((o, i) => {
    const parte = i === pedidos.length - 1 ? centavos(total) - repartido : soma > 0 ? Math.round((centavos(total) * pesos[i]) / soma) : 0;
    repartido += parte;
    if (o.clienteTelefone) porTelefone[o.clienteTelefone] = (porTelefone[o.clienteTelefone] || 0) + parte;
  });
  const daConta = pedidos.map((o) => o.clienteTelefone).find(Boolean);
  if (daConta) porTelefone[daConta] -= centavos(pagoComPontos);
  return Object.fromEntries(Object.entries(porTelefone).map(([telefone, c]) => {
    const valor = Math.max(0, c) / 100;
    return [telefone, { valor, pontos: pontosPor(valor, valorPorPonto) }];
  }));
}

/** Pontos do cliente de um telefone (comparado só pelos dígitos) no resultado de pontosDaVenda. */
export function pontosDoCliente(porTelefone, telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  const achado = Object.entries(porTelefone || {}).find(([t]) => t.replace(/\D/g, "") === digitos);
  return achado ? achado[1].pontos : 0;
}

export function fidelidadeHabilitada(regra) {
  return !!regra
    && regra.ativo !== false
    && numeroFidelidade(regra.valorPorPonto) > 0
    && numeroFidelidade(regra.pontosPorReal) > 0;
}

