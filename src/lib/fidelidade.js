export function numeroFidelidade(valor, fallback = 0) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : fallback;
}

const centavos = (v) => Math.round((Number(v) || 0) * 100);

/**
 * Quanto um saldo de pontos vale em reais, sempre para baixo no centavo (como o servidor confere).
 * Conta em inteiros: dividir e depois multiplicar por 100 perdia 1 centavo (58 pontos davam R$ 0,57).
 */
export function reaisDosPontos(pontos, pontosPorReal) {
  const porReal = centavos(numeroFidelidade(pontosPorReal)); // pontos por R$ 1,00, com duas casas
  const saldo = Math.floor(Number(pontos) || 0);
  return porReal > 0 && saldo > 0 ? Math.floor((saldo * 10000) / porReal) / 100 : 0;
}

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

/** Linha de tab_fidelidade_transacoes (como o banco devolve) no formato das telas. */
export function transacaoDoBanco(r) {
  return { id: r.id, lojaId: r.loja_id, clienteId: r.cliente_id, orderId: r.order_id, pontos: r.pontos, tipo: r.tipo, descricao: r.descricao ?? "", criadoEmISO: r.criado_em };
}

/** Lançamentos novos na frente, sem repetir os que o Realtime já trouxe. */
export function juntarTransacoes(novas, atuais) {
  const ids = new Set(novas.map((t) => t.id));
  return [...novas, ...atuais.filter((t) => !ids.has(t.id))];
}

const RECUSAS_DE_PONTOS = [
  ["saldo_de_pontos_insuficiente", (d) => `Saldo insuficiente${d ? `: o cliente tem ${d} ponto(s)` : ""}.`],
  ["recompensa_indisponivel", () => "Esta recompensa não está mais disponível. Atualize a tela."],
  ["cliente_nao_encontrado", () => "Cliente não encontrado. Atualize a tela."],
  ["forbidden", () => "Só quem administra a empresa pode lançar ou resgatar pontos."],
  ["parametro_invalido", (d) => `Valor não aceito${d ? ` em ${d}` : ""}.`],
];

/** Mensagem para o usuário quando o banco recusa um lançamento manual. */
export function mensagemDeRecusaDePontos(erro) {
  const texto = String(erro?.message || "");
  const achada = RECUSAS_DE_PONTOS.find(([codigo]) => texto.includes(codigo));
  return achada ? achada[1](String(erro?.details || "").trim()) : texto || "erro";
}

export function fidelidadeHabilitada(regra) {
  return !!regra
    && regra.ativo !== false
    && numeroFidelidade(regra.valorPorPonto) > 0
    && numeroFidelidade(regra.pontosPorReal) > 0;
}

