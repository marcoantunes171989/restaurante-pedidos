// ════════════════════════════════════════════════════════════
//  Painel de Controle de Atualização (migration 173).
//  Só o super admin usa. Liga/desliga o aviso "Sistema em atualização"
//  (tab_sistema_status, migration 172). O banco recusa o bloqueio se houver
//  usuário online (não super admin) — nunca bloqueia quem está trabalhando.
// ════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export const CONTROLE_ATUALIZACAO_INTERVALO_MS = 15 * 1000;
export const MINUTOS_OPCOES = Object.freeze([5, 15, 30, 60]);
export const MENSAGEM_MAX = 500;

export async function buscarStatusControle() {
  const { data, error } = await supabase
    .from("tab_sistema_status")
    .select("em_manutencao, mensagem, previsao_fim, atualizado_em, atualizado_por")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    emManutencao: data.em_manutencao === true,
    mensagem: data.mensagem || null,
    previsaoFim: data.previsao_fim || null,
    atualizadoEm: data.atualizado_em || null,
    atualizadoPor: data.atualizado_por || null,
  };
}

export async function listarUsuariosOnline() {
  const { data, error } = await supabase.rpc("app_sistema_usuarios_online");
  if (error) throw error;
  return (data || []).map((r) => ({
    userId: r.user_id,
    nome: r.usuario_nome || "",
    email: r.usuario_email || "",
    loja: r.loja_nome || "",
    dispositivo: r.device_type || "",
    ultimaAtividade: r.last_activity_at || null,
  }));
}

/** Resultado normalizado de ligarBloqueio (puro, testável). */
export function interpretarResultadoLigar(data) {
  if (data && data.ok === true) return { ok: true, online: 0, previsaoFim: data.previsao_fim || null };
  if (data && data.motivo === "usuarios_online") {
    return { ok: false, motivo: "usuarios_online", online: Number(data.online) || 0 };
  }
  return { ok: false, motivo: "desconhecido", online: 0 };
}

export async function ligarBloqueio({ mensagem = null, minutos = 15 } = {}) {
  const texto = typeof mensagem === "string" && mensagem.trim() ? mensagem.trim().slice(0, MENSAGEM_MAX) : null;
  const { data, error } = await supabase.rpc("app_sistema_manutencao_ligar", {
    p_mensagem: texto,
    p_minutos: Number(minutos) || 15,
  });
  if (error) throw error;
  return interpretarResultadoLigar(data);
}

export async function desligarBloqueio() {
  const { data, error } = await supabase.rpc("app_sistema_manutencao_desligar");
  if (error) throw error;
  return data?.ok === true;
}

/** Mensagem amigável para erros das RPCs (tabela/função ausente, sem permissão). */
export function mensagemErroControle(err) {
  const code = err?.code || "";
  const msg = String(err?.message || "");
  if (code === "42501" || /forbidden/i.test(msg)) return "Só o administrador geral pode usar este painel.";
  if (code === "PGRST202" || code === "42883" || /function .* does not exist|Could not find the function/i.test(msg)) {
    return "O banco ainda não tem a migration 173. Rode o script no Supabase e tente de novo.";
  }
  if (code === "42P01" || code === "PGRST205" || /tab_sistema_status/.test(msg)) {
    return "O banco ainda não tem a migration 172 (tab_sistema_status).";
  }
  return "Não foi possível falar com o banco agora. Tente de novo.";
}
