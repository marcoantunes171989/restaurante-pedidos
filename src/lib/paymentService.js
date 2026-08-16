// ════════════════════════════════════════════════════════════
//  Fundação Financeira V2 — client service (ISOLADO)
//
//  NÃO substitui o fluxo atual (registrarPagamento/baixarComandas). É a
//  camada de acesso ao RPC transacional `app_registrar_pagamento_v2` (migration
//  118), atrás da flag PAYMENT_V2_ENABLED (default false).
//
//  - Quando PAYMENT_V2_ENABLED = false: nada muda no app.
//  - Quando true: os fluxos EXPLICITAMENTE preparados podem chamar
//    registrarPagamentoV2(...). A validação forte é SEMPRE do servidor (RPC);
//    as funções puras abaixo são conveniência/UX e são testáveis sem banco.
//
//  Domínio de valores: números com 2 casas; soma das alocações == valor bruto.
// ════════════════════════════════════════════════════════════

// Feature flag (build-time). Override por env VITE_PAYMENT_V2_ENABLED=true.
export const PAYMENT_V2_ENABLED = (() => {
  try {
    return String(import.meta.env?.VITE_PAYMENT_V2_ENABLED ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
})();

// Status/eventos canônicos (espelham os CHECKs da 118).
export const STATUS_PAGAMENTO_V2 = [
  "PENDING", "PROCESSING", "AUTHORIZED", "PAID", "DECLINED",
  "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "EXPIRED", "ERROR",
];
export const EVENTOS_PAGAMENTO_V2 = [
  "CREATED", "PROCESSING", "AUTHORIZED", "PAID", "DECLINED", "CANCELLED", "REFUNDED", "ERROR",
];

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// UUID v4 (idempotency key). Preferência: crypto.randomUUID (browsers/Node 19+);
// depois crypto.getRandomValues (CSPRNG); Math.random é o ÚLTIMO recurso.
export function novaIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* tenta getRandomValues */ }
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; // versão 4
      b[8] = (b[8] & 0x3f) | 0x80; // variante
      const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
      return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
    }
  } catch { /* último recurso abaixo */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Normaliza alocações do app → shape do RPC: { pedido_id, valor(2 casas) }.
// Aceita {pedidoId|pedido_id|id} e {valor|amount}.
export function normalizarAlocacoes(alocacoes = []) {
  return (Array.isArray(alocacoes) ? alocacoes : []).map((a) => ({
    pedido_id: String(a.pedido_id ?? a.pedidoId ?? a.id ?? "").trim(),
    valor: round2(a.valor ?? a.amount ?? 0),
  }));
}

export function somarAlocacoes(alocacoes = []) {
  return round2(normalizarAlocacoes(alocacoes).reduce((s, a) => s + a.valor, 0));
}

/**
 * Validação de conveniência (a autoridade é a RPC). Espelha as regras do
 * servidor para dar feedback imediato e evitar chamadas inúteis.
 * @returns {{ valido:boolean, erros:string[], valorLiquido:number, soma:number }}
 */
export function validarPagamentoV2({ valorBruto, valorTaxa = 0, alocacoes = [] } = {}) {
  const erros = [];
  const bruto = round2(valorBruto);
  const taxa = round2(valorTaxa);
  const liquido = round2(bruto - taxa);
  const itens = normalizarAlocacoes(alocacoes);
  const soma = round2(itens.reduce((s, a) => s + a.valor, 0));

  if (!(bruto > 0)) erros.push("valor_bruto deve ser maior que zero.");
  if (taxa < 0) erros.push("valor_taxa não pode ser negativo.");
  if (liquido < 0) erros.push("valor_liquido negativo (taxa maior que o bruto).");
  if (itens.length === 0) erros.push("informe ao menos uma alocação (pedido + valor).");
  if (itens.some((a) => !a.pedido_id)) erros.push("alocação sem pedido_id.");
  if (itens.some((a) => !(a.valor > 0))) erros.push("valor de alocação deve ser maior que zero.");
  if (itens.length > 0 && soma !== bruto) {
    erros.push(`soma das alocações (${soma}) difere do valor_bruto (${bruto}).`);
  }
  return { valido: erros.length === 0, erros, valorLiquido: liquido, soma };
}

// Mapeia códigos de erro da RPC (prefixo PAYMENT_V2_*) → mensagem amigável.
// Não vaza detalhe técnico. Ordem: mais específico primeiro.
export function mensagemErroPagamentoV2(msg = "") {
  const m = String(msg || "");
  if (/PAYMENT_V2_FORBIDDEN/.test(m)) return "Você não tem permissão para receber pagamentos.";
  if (/PAYMENT_V2_CAIXA_CROSS_TENANT/.test(m)) return "Caixa de outra empresa.";
  if (/PAYMENT_V2_CAIXA_FECHADO/.test(m)) return "O caixa não está aberto.";
  if (/PAYMENT_V2_CAIXA_INVALIDO/.test(m)) return "Caixa inválido.";
  if (/PAYMENT_V2_FORMA_CROSS_TENANT/.test(m)) return "Forma de pagamento de outra empresa.";
  if (/PAYMENT_V2_FORMA_INATIVA/.test(m)) return "Forma de pagamento inativa.";
  if (/PAYMENT_V2_FORMA_INVALIDA/.test(m)) return "Forma de pagamento inválida.";
  if (/PAYMENT_V2_PEDIDO_JA_PAGO/.test(m)) return "Há pedido já quitado na seleção.";
  if (/PAYMENT_V2_EXCEDE_SALDO/.test(m)) return "O valor excede o saldo em aberto do pedido.";
  if (/PAYMENT_V2_PEDIDO_VALOR_INVALIDO/.test(m)) return "O pedido tem itens com preço/quantidade inválidos.";
  if (/PAYMENT_V2_CROSS_TENANT/.test(m)) return "Operação não permitida para esta empresa.";
  if (/PAYMENT_V2_PEDIDO_INEXISTENTE/.test(m)) return "Pedido não encontrado.";
  if (/PAYMENT_V2_PEDIDO_CANCELADO/.test(m)) return "Há pedido cancelado na seleção.";
  if (/PAYMENT_V2_SOMA_INVALIDA/.test(m)) return "A soma dos valores não confere com o total.";
  if (/PAYMENT_V2_LOJA_INEXISTENTE|PAYMENT_V2_NO_TENANT/.test(m)) return "Empresa inválida ou sessão sem empresa.";
  if (/PAYMENT_V2_INVALID/.test(m)) return "Dados de pagamento inválidos.";
  return "Não foi possível registrar o pagamento. Tente novamente.";
}

/**
 * Chama a RPC transacional. NÃO é usada por fluxos legados — só por fluxos
 * explicitamente preparados (e apenas com PAYMENT_V2_ENABLED = true).
 *
 * @param supabase cliente supabase-js
 * @param dados { idempotencyKey?, alocacoes, valorBruto, lojaId?, tipo?, provider?,
 *                formaPagamentoId?, caixaId?, valorTaxa?, metadata?, registrarCaixa? }
 * @returns { ok, idempotente, id, status, ... }  (lança Error com .code em falha)
 */
export async function registrarPagamentoV2(supabase, dados = {}) {
  if (!supabase?.rpc) throw Object.assign(new Error("Cliente Supabase inválido."), { code: "NO_CLIENT" });
  const idem = dados.idempotencyKey || novaIdempotencyKey();
  const alocacoes = normalizarAlocacoes(dados.alocacoes);
  const bruto = round2(dados.valorBruto);

  // Guarda de conveniência (o servidor revalida tudo).
  const pre = validarPagamentoV2({ valorBruto: bruto, valorTaxa: dados.valorTaxa ?? 0, alocacoes });
  if (!pre.valido) throw Object.assign(new Error(pre.erros[0]), { code: "INVALID_INPUT", erros: pre.erros });

  const { data, error } = await supabase.rpc("app_registrar_pagamento_v2", {
    p_idempotency_key: idem,
    p_alocacoes: alocacoes,
    p_valor_bruto: bruto,
    p_loja_id: dados.lojaId ?? null,
    p_tipo: dados.tipo ?? "manual",
    p_provider: dados.provider ?? "manual",
    p_forma_pagamento_id: dados.formaPagamentoId ?? null,
    p_caixa_id: dados.caixaId ?? null,
    p_valor_taxa: round2(dados.valorTaxa ?? 0),
    p_metadata: dados.metadata ?? {},
    p_registrar_caixa: dados.registrarCaixa !== false,
  });

  if (error) {
    // A função inexistente = migration 118 pendente.
    if (error.code === "42883" || /function .*app_registrar_pagamento_v2/.test(error.message || "")) {
      throw Object.assign(new Error("Pagamentos V2 ainda não instalados no banco (migration 118 pendente)."), { code: "MIGRACAO_PENDENTE" });
    }
    throw Object.assign(new Error(mensagemErroPagamentoV2(error.message)), { code: "RPC_ERROR", detalhe: error.message });
  }
  return data;
}
