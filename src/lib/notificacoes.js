// ════════════════════════════════════════════════════════════
//  Serviço central de notificações push (Web Push + VAPID)
//
//  Detecta capacidade real do dispositivo/navegador, só pede permissão
//  quando o usuário CLICA em "Ativar notificações" (nunca automático ao
//  carregar a página) e mantém a assinatura sincronizada com
//  tab_push_subscriptions (migration 064). O envio em si acontece
//  sempre no servidor (Edge Function notificacoes-push) — este arquivo
//  nunca fala com nenhum serviço de push diretamente.
// ════════════════════════════════════════════════════════════
import {
  upsertPushSubscription, desativarPushSubscription, removerPushSubscription,
  fetchPreferenciasNotificacao, salvarPreferenciasNotificacao,
} from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// Mesmo gerador de ID de aparelho já usado por tab_dispositivos
// (src/App.jsx `obterDeviceId`) — chave própria no localStorage para não
// colidir, mas idêntico em forma (reaproveita o padrão, não duplica a
// ideia com outro esquema).
function obterDeviceId() {
  try {
    let id = localStorage.getItem("pp_device_id");
    if (!id) { id = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem("pp_device_id", id); }
    return id;
  } catch { return null; }
}

function urlBase64ParaUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function ehStandalone() {
  if (typeof navigator !== "undefined" && typeof navigator.standalone === "boolean") return navigator.standalone; // iOS
  if (typeof window === "undefined") return false;
  return !!(window.matchMedia?.("(display-mode: standalone)")?.matches || window.matchMedia?.("(display-mode: fullscreen)")?.matches);
}

/** Checagem completa de capacidade — usada tanto pelo sino (para saber se
 * deve nem tentar) quanto pela tela de Configurações (para explicar o
 * status ao usuário). Nunca lança exceção — sempre retorna um objeto. */
export function capacidadesPush() {
  const https = typeof window !== "undefined" && (window.location.protocol === "https:" || window.location.hostname === "localhost");
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const notification = typeof window !== "undefined" && "Notification" in window;
  const pushManager = typeof window !== "undefined" && "PushManager" in window;
  const pushSubscription = typeof window !== "undefined" && "PushSubscription" in window;
  const instalado = ehStandalone();
  const vapidConfigurada = !!VAPID_PUBLIC_KEY;
  const suportado = https && serviceWorker && notification && pushManager && pushSubscription;
  return { https, serviceWorker, notification, pushManager, pushSubscription, instalado, vapidConfigurada, suportado };
}

export function permissaoAtual() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function swEstaAtivo() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && (reg.active || reg.waiting || reg.installing));
  } catch { return false; }
}

export async function obterAssinaturaAtual() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

function subscriptionParaLinha(sub, plataforma) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || "",
    authChave: json.keys?.auth || "",
    plataforma,
    deviceId: obterDeviceId(),
  };
}

/** Só deve ser chamada a partir de um clique real do usuário (gesture) —
 * nunca automaticamente ao carregar a tela. Retorna { ok, motivo }. */
export async function ativarNotificacoes() {
  const cap = capacidadesPush();
  if (!cap.instalado) return { ok: false, motivo: "nao_instalado" };
  if (!cap.suportado) return { ok: false, motivo: "sem_suporte" };
  if (!cap.vapidConfigurada) return { ok: false, motivo: "vapid_ausente" };

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, motivo: permissao === "denied" ? "negada" : "cancelada" };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const plataforma = (navigator.userAgent || "").slice(0, 180);
    await upsertPushSubscription(subscriptionParaLinha(sub, plataforma));
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "erro_assinatura", erro: e?.message || String(e) };
  }
}

export async function desativarNotificacoes() {
  try {
    const sub = await obterAssinaturaAtual();
    if (sub) {
      await desativarPushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message || String(e) };
  }
}

/** "Remover este dispositivo" — diferente de desativar: apaga o
 * registro por completo (não fica reaparecendo desativado na lista). */
export async function removerEsteDispositivo() {
  const sub = await obterAssinaturaAtual();
  if (sub) {
    try { await removerPushSubscription(sub.endpoint); } catch { /* segue mesmo assim */ }
    try { await sub.unsubscribe(); } catch { /* segue mesmo assim */ }
  }
}

export async function carregarPreferencias() {
  try { return await fetchPreferenciasNotificacao(); }
  catch { return { pushAtivo: true, alertaNovoPedido: true, alertaCaixa: true, som: true, alertasVisuais: true }; }
}
export async function atualizarPreferencias(prefs) {
  await salvarPreferenciasNotificacao(prefs);
}

// ── Sincronização entre abas (mesma origem) — quando uma aba marca como
//    lida ou recebe notificação nova, as outras atualizam sem precisar
//    de outro round-trip ao banco. Realtime já cobre a maior parte disso
//    entre DISPOSITIVOS; o BroadcastChannel cobre o caso "mesma aba
//    lógica, várias janelas" instantaneamente, sem round-trip de rede. ──
let canal = null;
function obterCanal() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!canal) canal = new BroadcastChannel("pp_notificacoes");
  return canal;
}
export function avisarOutrasAbas(tipo) {
  try { obterCanal()?.postMessage({ tipo, ts: Date.now() }); } catch { /* BroadcastChannel indisponível — Realtime ainda cobre */ }
}
export function ouvirOutrasAbas(callback) {
  const c = obterCanal();
  if (!c) return () => {};
  const handler = (ev) => callback(ev.data);
  c.addEventListener("message", handler);
  return () => c.removeEventListener("message", handler);
}
