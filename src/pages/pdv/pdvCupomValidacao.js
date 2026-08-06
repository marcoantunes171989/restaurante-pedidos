/**
 * Validação e legendas de cupom de desconto no PDV.
 * Espelha as regras do RPC cupom_validar (migration 075) para o modo local
 * e normaliza os motivos do banco em status estáveis para a UI.
 */

import { formatCurrency } from "./pdvHelpers";

/** Status → legenda curta exibida sob o campo no PDV. */
export const CUPOM_LEGENDA = {
  vazio: { tom: "neutro", texto: "Digite o código em maiúsculas e toque em Aplicar." },
  digitando: { tom: "neutro", texto: "Informe o código completo para validar." },
  validando: { tom: "neutro", texto: "Validando cupom…" },
  valido: { tom: "ok", texto: "Cupom válido" },
  nao_encontrado: { tom: "erro", texto: "Cupom inválido — código não encontrado" },
  inativo: { tom: "erro", texto: "Cupom inválido — desativado" },
  ainda_nao: { tom: "aviso", texto: "Fora do prazo — ainda não vigora" },
  expirado: { tom: "aviso", texto: "Fora do prazo — cupom expirado" },
  esgotado: { tom: "erro", texto: "Quantidade esgotada" },
  minimo: { tom: "aviso", texto: "Consumo mínimo não atingido" },
  erro: { tom: "erro", texto: "Não foi possível validar o cupom" },
};

/**
 * Classifica o motivo (string do banco ou local) em um status de legenda.
 */
export function classificarMotivoCupom(motivo = "") {
  const m = String(motivo || "").toLowerCase();
  if (!m) return "erro";
  if (/não encontrado|nao encontrado|não existe|inexistente/.test(m)) return "nao_encontrado";
  if (/inativ/.test(m)) return "inativo";
  if (/ainda não|ainda nao|não está válido|nao esta valido|não vigora/.test(m)) return "ainda_nao";
  if (/expir|fora do prazo|vencid/.test(m)) return "expirado";
  if (/esgot|quantidade|indisponível no momento|indisponivel no momento/.test(m)) return "esgotado";
  if (/mínimo|minimo|consumo/.test(m)) return "minimo";
  if (/inválid|invalid/.test(m)) return "nao_encontrado";
  return "erro";
}

export function legendaCupom(status, extras = {}) {
  const base = CUPOM_LEGENDA[status] || CUPOM_LEGENDA.erro;
  if (status === "valido" && extras.desconto != null) {
    return {
      ...base,
      texto: extras.restantes != null
        ? `Cupom válido · −${formatCurrency(extras.desconto)} · ${extras.restantes} restante(s)`
        : `Cupom válido · −${formatCurrency(extras.desconto)}`,
    };
  }
  if (status === "minimo" && extras.minimoCompra != null) {
    return { ...base, texto: `Consumo mínimo de ${formatCurrency(extras.minimoCompra)}` };
  }
  if (status === "erro" && extras.motivo) {
    return { ...base, texto: extras.motivo };
  }
  return base;
}

/**
 * Validação local (sem banco) — mesma semântica do RPC cupom_validar.
 */
export function validarCupomLocal({ cupons = [], codigo, valorConta = 0, agora = new Date() } = {}) {
  const cod = String(codigo || "").trim().toUpperCase();
  if (!cod) return { ok: false, status: "vazio", motivo: "Informe o código do cupom." };

  const c = cupons.find((x) => String(x.codigo || "").toUpperCase() === cod);
  if (!c) return { ok: false, status: "nao_encontrado", motivo: "Cupom não encontrado." };
  if (!c.ativo) return { ok: false, status: "inativo", motivo: "Cupom inativo." };

  if (c.inicioEm) {
    const ini = new Date(c.inicioEm);
    if (!Number.isNaN(ini.getTime()) && agora < ini) {
      return { ok: false, status: "ainda_nao", motivo: "Cupom ainda não está válido." };
    }
  }
  if (c.fimEm) {
    const fim = new Date(c.fimEm);
    if (!Number.isNaN(fim.getTime()) && agora > fim) {
      return { ok: false, status: "expirado", motivo: "Cupom expirado." };
    }
  }

  const restantes = c.quantidadeTotal == null
    ? null
    : Math.max(0, Number(c.quantidadeTotal) - (Number(c.quantidadeUsada) || 0));
  if (restantes != null && restantes <= 0) {
    return { ok: false, status: "esgotado", motivo: "Cupom esgotado." };
  }

  const minimo = Number(c.minimoCompra) || 0;
  if (Number(valorConta) < minimo) {
    return {
      ok: false,
      status: "minimo",
      motivo: `Consumo mínimo de ${formatCurrency(minimo)} para usar este cupom.`,
      minimoCompra: minimo,
    };
  }

  const bruto = c.tipo === "valor"
    ? Number(c.valor) || 0
    : (Number(valorConta) * (Number(c.valor) || 0)) / 100;
  const desconto = Math.min(Math.max(bruto, 0), Number(valorConta) || 0);

  return {
    ok: true,
    status: "valido",
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    tipo: c.tipo,
    valor: c.valor,
    desconto,
    restantes,
  };
}

/** Normaliza resposta do banco (RPC) para o formato do PDV. */
export function normalizarRespostaCupom(r) {
  if (!r) return { ok: false, status: "erro", motivo: "Não foi possível validar o cupom." };
  if (r.ok) {
    return {
      ...r,
      status: "valido",
      desconto: Number(r.desconto) || 0,
    };
  }
  const status = r.status || classificarMotivoCupom(r.motivo);
  return { ...r, ok: false, status };
}
