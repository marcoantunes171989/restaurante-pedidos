/**
 * Validação e legendas de cupom de desconto no PDV.
 * Espelha as regras do RPC cupom_validar (migrations 075/076) para o modo local
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
  horario: { tom: "aviso", texto: "Cupom fora do horário permitido" },
  canal: { tom: "aviso", texto: "Cupom não válido para este canal" },
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
  if (/inativ|desativ/.test(m)) return "inativo";
  if (/ainda não|ainda nao|não está válido|nao esta valido|não vigora/.test(m)) return "ainda_nao";
  if (/horário|horario|às |as \d|a partir das|até as|ate as/.test(m)) return "horario";
  if (/interno|externo|delivery|canal|mesa\)/.test(m) && /válido|valido|apenas/.test(m)) return "canal";
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
  if ((status === "horario" || status === "canal" || status === "erro") && extras.motivo) {
    return { ...base, texto: extras.motivo };
  }
  return base;
}

/** Normaliza "HH:MM" / "HH:MM:SS" → minutos desde 00:00, ou null. */
export function minutosDoHorario(h) {
  if (h == null || h === "") return null;
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Verifica se `agora` está dentro da janela diária [horaInicio, horaFim].
 * Suporta janela que atravessa a meia-noite.
 */
export function dentroDoHorarioCupom({ horaInicio, horaFim, agora = new Date() } = {}) {
  const ini = minutosDoHorario(horaInicio);
  const fim = minutosDoHorario(horaFim);
  if (ini == null && fim == null) return true;
  const atual = agora.getHours() * 60 + agora.getMinutes();
  if (ini != null && fim != null) {
    if (ini <= fim) return atual >= ini && atual <= fim;
    return atual >= ini || atual <= fim;
  }
  if (ini != null) return atual >= ini;
  return atual <= fim;
}

function rotuloHora(h) {
  const m = minutosDoHorario(h);
  if (m == null) return "";
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Validação local (sem banco) — mesma semântica do RPC cupom_validar (076).
 * @param {object} opts
 * @param {'interno'|'externo'} [opts.canalConta='interno'] canal da conta no PDV
 */
export function validarCupomLocal({
  cupons = [],
  codigo,
  valorConta = 0,
  agora = new Date(),
  canalConta = "interno",
} = {}) {
  const cod = String(codigo || "").trim().toUpperCase();
  if (!cod) return { ok: false, status: "vazio", motivo: "Informe o código do cupom." };

  const c = cupons.find((x) => String(x.codigo || "").toUpperCase() === cod);
  if (!c) return { ok: false, status: "nao_encontrado", motivo: "Cupom inválido — código não encontrado." };
  if (!c.ativo) return { ok: false, status: "inativo", motivo: "Cupom inválido — desativado." };

  const canalCupom = (c.canal || "ambos").toLowerCase();
  const canal = canalConta === "externo" ? "externo" : "interno";
  if (canalCupom === "interno" && canal === "externo") {
    return {
      ok: false,
      status: "canal",
      motivo: "Este cupom é válido apenas para consumo interno (mesa).",
    };
  }
  if (canalCupom === "externo" && canal === "interno") {
    return {
      ok: false,
      status: "canal",
      motivo: "Este cupom é válido apenas para pedidos externos (delivery).",
    };
  }

  if (c.inicioEm) {
    const ini = new Date(c.inicioEm);
    if (!Number.isNaN(ini.getTime()) && agora < ini) {
      return { ok: false, status: "ainda_nao", motivo: "Fora do prazo — ainda não vigora." };
    }
  }
  if (c.fimEm) {
    const fim = new Date(c.fimEm);
    if (!Number.isNaN(fim.getTime()) && agora > fim) {
      return { ok: false, status: "expirado", motivo: "Fora do prazo — cupom expirado." };
    }
  }

  if (!dentroDoHorarioCupom({ horaInicio: c.horaInicio, horaFim: c.horaFim, agora })) {
    const hi = rotuloHora(c.horaInicio);
    const hf = rotuloHora(c.horaFim);
    let motivo = "Cupom fora do horário permitido.";
    if (hi && hf) motivo = `Cupom fora do horário permitido (${hi} às ${hf}).`;
    else if (hi) motivo = `Cupom disponível a partir das ${hi}.`;
    else if (hf) motivo = `Cupom disponível até as ${hf}.`;
    return { ok: false, status: "horario", motivo };
  }

  const restantes = c.quantidadeTotal == null
    ? null
    : Math.max(0, Number(c.quantidadeTotal) - (Number(c.quantidadeUsada) || 0));
  if (restantes != null && restantes <= 0) {
    return { ok: false, status: "esgotado", motivo: "Quantidade esgotada." };
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
    canal: canalCupom,
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
