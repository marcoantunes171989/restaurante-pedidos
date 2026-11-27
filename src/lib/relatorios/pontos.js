// ════════════════════════════════════════════════════════════
//  Pontos usados e vencidos (migration 228). O banco calcula validade, vencimento e totais;
//  aqui só pedimos, formatamos e exportamos. Só quem administra a empresa consulta.
// ════════════════════════════════════════════════════════════
import { POR_PAGINA, dataHora, semFuncao, textoDaNota } from "./historicos.js";

export const GRUPOS_DE_PONTOS = { usado: "Usados", vencido: "Vencidos" };

export const dia = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
/** "2026-11-27" (dia já no horário de Brasília) → "27/11/2026". */
export const diaDoRelatorio = (texto) => (/^\d{4}-\d{2}-\d{2}/.test(texto || "") ? `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}` : "—");

async function consultar(supabase, funcao, args) {
  const { data, error } = await supabase.rpc(funcao, args);
  if (semFuncao(error)) return { ausente: true };
  if (error) throw error;
  return data;
}

export const buscarPontos = (supabase, { lojaId, de = null, ate = null, grupo = "", busca = "", pagina = 1, porPagina = POR_PAGINA }) =>
  consultar(supabase, "app_pontos_relatorio", {
    p_loja_id: lojaId, p_de: de, p_ate: ate, p_tipo: grupo || null, p_busca: busca.trim() || null, p_pagina: pagina, p_por_pagina: porPagina,
  });

export const buscarHistoricoDoCliente = (supabase, lojaId, clienteId) => consultar(supabase, "app_pontos_cliente", { p_loja_id: lojaId, p_cliente_id: clienteId });

/** Pede ao banco que registre os vencimentos pendentes. Nunca atrapalha a tela: sem a migration ou sem rede, ignora. */
export async function registrarVencimentos(supabase, lojaId) {
  if (!supabase?.rpc || lojaId == null) return null;
  try {
    const { data, error } = await supabase.rpc("app_pontos_expirar", { p_loja_id: lojaId });
    return error ? null : data;
  } catch {
    return null;
  }
}

/** O que o lançamento representa, em uma palavra. Estornos vêm com o mesmo tipo e sinal contrário. */
export function rotuloDoLancamento({ tipo, pontos }) {
  const n = Number(pontos) || 0;
  if (tipo === "expire") return n > 0 ? "Vencimento desfeito" : "Vencimento";
  if (tipo === "redeem") return n > 0 ? "Estorno de uso" : "Uso";
  if (tipo === "earn") return n < 0 ? "Estorno de ganho" : "Ganho";
  return "Ajuste";
}
export const rotuloDaLinha = (l) => rotuloDoLancamento({ tipo: l.grupo === "vencido" ? "expire" : "redeem", pontos: l.pontos });
export const comSinal = (n) => `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${Math.abs(Number(n) || 0).toLocaleString("pt-BR")}`;

export const CABECALHO_PONTOS = ["Data", "Situação", "Cliente", "Telefone", "Pontos", "Valor em R$", "Pedidos", "Nota fiscal", "Cupom de desconto", "Descrição"];
export const linhaCsvDosPontos = (l) => [
  l.grupo === "vencido" ? dia(l.quando) : dataHora(l.quando), rotuloDaLinha(l), l.cliente || "", l.telefone || "", Number(l.pontos) || 0,
  l.valor == null ? "" : Number(l.valor), (l.pedidos || []).join(", "), l.vendaId ? textoDaNota(l.notas?.[0]) : "", l.cupom || "", l.descricao || "",
];
