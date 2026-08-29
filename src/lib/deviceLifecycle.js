import { registrarDispositivo } from "./supabase.js";
import { obterDeviceIdEstavel } from "./accessControl/deviceInfo.js";

// Metadados do aparelho reportados ao registrar/atualizar tab_dispositivos
// (heartbeat periódico, associação explícita de mesa e cleanup de logout em
// App.jsx usam o mesmo cálculo).
export function infoAparelhoAtual() {
  const versao = (typeof __APP_VERSION__ !== "undefined") ? __APP_VERSION__ : "local";
  const standalone = !!(window.matchMedia?.("(display-mode: standalone)")?.matches || window.matchMedia?.("(display-mode: fullscreen)")?.matches || window.navigator.standalone);
  const plataforma = (navigator.userAgent || "").slice(0, 180);
  return { versao, standalone, plataforma };
}

// Libera a mesa deste aparelho (mesa:null) no início do logout — ANTES de
// encerrarSessaoAcesso()/logoutSupabaseAuth() invalidarem a prova de sessão
// (session_token/JWT) que app_dispositivo_registrar exige (migration 125).
// Sem mesa associada, não faz chamada nenhuma. Best-effort: uma falha aqui
// (ex.: sessão já expirada) NUNCA pode impedir o logout de segurança — só
// loga um aviso; o TTL de 5 min da checagem de exclusividade (migration
// 125) é o fallback operacional se a mesa ficar presa.
export async function liberarMesaDispositivoNoLogout({ tableNumber, lojaId }) {
  if (!(tableNumber && Number(tableNumber) > 0)) return;
  const id = obterDeviceIdEstavel();
  if (!id) return;
  try {
    const { versao, standalone, plataforma } = infoAparelhoAtual();
    await registrarDispositivo({ deviceId: id, versao, lojaId, plataforma, standalone, mesa: null });
  } catch (e) {
    console.warn("[tablet] não foi possível liberar a mesa no logout:", e?.message || e);
  }
}
