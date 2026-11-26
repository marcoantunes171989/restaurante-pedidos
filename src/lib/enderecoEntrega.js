// ════════════════════════════════════════════════════════════
//  Endereço de ENTREGA informado no cardápio público (migration 207).
//  Só é pedido quando a loja ligou. Sem a migration no banco, tudo fica
//  desligado e o cardápio e o caixa seguem como antes.
//  Dado pessoal: não é guardado no aparelho do cliente.
// ════════════════════════════════════════════════════════════

export const ENDERECO_VAZIO = Object.freeze({ CEP: "", xLgr: "", nro: "", xCpl: "", xBairro: "", xMun: "", UF: "", cMun: "" });

const so = (v) => String(v ?? "").replace(/\D/g, "");
const texto = (v) => String(v ?? "").trim();

/** Mesmas exigências da função do banco. Devolve a mensagem para o cliente, ou null. */
export function problemaDoEndereco(e = ENDERECO_VAZIO) {
  if (so(e.CEP).length !== 8) return "Informe o CEP da entrega (8 números).";
  if (texto(e.xLgr).length < 2) return "Informe a rua da entrega.";
  if (!texto(e.nro)) return "Informe o número do endereço (ou S/N).";
  if (texto(e.xBairro).length < 2) return "Informe o bairro da entrega.";
  if (texto(e.xMun).length < 2) return "Informe a cidade da entrega.";
  if (!/^[A-Za-z]{2}$/.test(texto(e.UF))) return "Informe a UF (2 letras).";
  return null;
}

/** Uma linha legível: "Rua, 10, ap 2 · Bairro · Cidade - UF · CEP 00000000". */
export function enderecoEmLinha(e) {
  if (!e) return "";
  return [
    [e.xLgr, e.nro, e.xCpl].map(texto).filter(Boolean).join(", "),
    texto(e.xBairro),
    [e.xMun, e.UF].map(texto).filter(Boolean).join(" - "),
    so(e.CEP) ? `CEP ${so(e.CEP)}` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * Completa os campos VAZIOS da nota do caixa com o que o cliente informou no pedido.
 * O que o operador já digitou não é trocado.
 */
export function completarComEnderecoDoPedido(nota, pedido) {
  if (!pedido?.endereco) return nota;
  const saida = { ...nota };
  const e = pedido.endereco;
  // O endereço entra inteiro ou não entra: misturar rua digitada com CEP do pedido geraria endereço errado.
  const campos = ["CEP", "xLgr", "nro", "xCpl", "xBairro", "xMun", "UF", "cMun"];
  if (campos.every((k) => !texto(nota[k]))) for (const k of campos) saida[k] = texto(e[k]);
  if (!texto(saida.nome) && pedido.cliente) saida.nome = texto(pedido.cliente);
  return saida;
}

/** A loja pede o endereço no cardápio? Qualquer falha = não. */
export async function lojaPedeEndereco(supabase, lojaId) {
  if (!supabase?.rpc || lojaId == null) return false;
  try {
    const { data, error } = await supabase.rpc("pub_loja_pede_endereco_entrega", { p_loja_id: lojaId });
    return !error && data === true;
  } catch { return false; }
}

/** Cria o pedido de entrega com o endereço (mesma transação no banco). Lança o erro do banco, como a criação comum. */
export async function criarPedidoEntrega(supabase, { lojaId, itens, endereco, comanda = null, cliente = null, telefone = null, formaPagamentoId = null, trocoPara = null, observacaoPedido = null }) {
  const { data, error } = await supabase.rpc("pub_criar_pedido_entrega", {
    p_loja_id: lojaId, p_itens: itens || [], p_endereco: endereco, p_comanda: comanda || null, p_cliente: cliente || null,
    p_telefone: telefone || null, p_forma_pagamento_id: formaPagamentoId || null, p_troco_para: trocoPara ?? null,
    p_observacao_pedido: observacaoPedido || null,
  });
  if (error) throw error;
  return data;
}

/** Endereço mais recente entre os pedidos da conta, ou null (sem função no banco, sem permissão ou sem endereço). */
export async function buscarEnderecoDosPedidos(supabase, pedidosIds = []) {
  const ids = (pedidosIds || []).filter(Boolean).map(String);
  if (!supabase?.rpc || !ids.length) return null;
  try {
    const { data, error } = await supabase.rpc("app_pedido_endereco_entrega", { p_pedido_ids: ids });
    if (error || !data?.ok) return null;
    return data.enderecos?.[0]?.endereco || null;
  } catch { return null; }
}
