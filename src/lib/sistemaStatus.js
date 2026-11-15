// ════════════════════════════════════════════════════════════
//  Aviso "Sistema em atualização" (migration 172 — tab_sistema_status).
//  Fail-open: se a tabela não existir ou a leitura falhar, o sistema
//  segue normal (nunca trava o app por erro de leitura do aviso).
// ════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export const MANUTENCAO_TITULO = "Sistema em atualização";
export const MANUTENCAO_MENSAGEM_PADRAO =
  "Estamos aplicando melhorias no Pedido Prime. O acesso volta sozinho assim que a atualização terminar — não é preciso fazer nada. Seus dados e pedidos estão seguros.";
export const MANUTENCAO_INTERVALO_MS = 30 * 1000;

export const STATUS_SISTEMA_NORMAL = Object.freeze({ emManutencao: false, mensagem: null, previsaoFim: null });

/** Converte a linha do banco no formato do app (sempre um objeto válido). */
export function normalizarStatusSistema(linha) {
  if (!linha || linha.em_manutencao !== true) return STATUS_SISTEMA_NORMAL;
  const mensagem = typeof linha.mensagem === "string" && linha.mensagem.trim() ? linha.mensagem.trim() : null;
  const fim = linha.previsao_fim ? new Date(linha.previsao_fim) : null;
  return {
    emManutencao: true,
    mensagem,
    previsaoFim: fim && !Number.isNaN(fim.getTime()) ? fim.toISOString() : null,
  };
}

/** Bloqueia todos durante a manutenção, exceto o super admin (que confere a publicação). */
export function deveBloquearPorManutencao(status, user) {
  if (!status?.emManutencao) return false;
  return !user?.superAdmin;
}

/** Texto de previsão ("Previsão de retorno: 14:30") ou null. */
export function textoPrevisaoRetorno(previsaoFim, agora = new Date()) {
  if (!previsaoFim) return null;
  const fim = new Date(previsaoFim);
  if (Number.isNaN(fim.getTime())) return null;
  if (fim.getTime() <= agora.getTime()) return "Finalizando — falta pouco.";
  const hora = fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `Previsão de retorno: ${hora}`;
}

export async function buscarStatusSistema() {
  try {
    const { data, error } = await supabase
      .from("tab_sistema_status")
      .select("em_manutencao, mensagem, previsao_fim")
      .eq("id", 1)
      .maybeSingle();
    if (error) return STATUS_SISTEMA_NORMAL;
    return normalizarStatusSistema(data);
  } catch {
    return STATUS_SISTEMA_NORMAL;
  }
}
