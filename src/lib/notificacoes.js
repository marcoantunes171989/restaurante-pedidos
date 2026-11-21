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
  upsertPushSubscription, atualizarLojaPushSubscription, desativarPushSubscription, removerPushSubscription,
  fetchPreferenciasNotificacao, salvarPreferenciasNotificacao,
} from "./supabase";
import { detectarPlataforma, ehStandalone } from "./pwaDetection";

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
  const { so, navegador } = detectarPlataforma();
  const vapidConfigurada = !!VAPID_PUBLIC_KEY;
  const suportado = https && serviceWorker && notification && pushManager && pushSubscription;
  // iPhone/iPad (iOS 16.4+) só liberam Web Push para o app instalado na Tela
  // de Início. Nos demais (Android, Windows, Mac) funciona também na aba do
  // navegador — instalar é recomendado, mas não obrigatório.
  const instalacaoObrigatoria = so === "ios";
  return { https, serviceWorker, notification, pushManager, pushSubscription, instalado, vapidConfigurada, suportado, so, navegador, instalacaoObrigatoria };
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

// `serviceWorker.ready` nunca resolve se nenhum SW foi registrado (ex.: ambiente
// de desenvolvimento) — sem limite, o modal ficaria eternamente em "Carregando…".
function swPronto(ms = 4000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error("sw_indisponivel")), ms)),
  ]);
}

export async function obterAssinaturaAtual() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await swPronto();
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

function subscriptionParaLinha(sub, plataforma, lojaId = null) {
  const json = sub.toJSON();
  return {
    lojaId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || "",
    authChave: json.keys?.auth || "",
    plataforma,
    deviceId: obterDeviceId(),
  };
}

/** Só deve ser chamada a partir de um clique real do usuário (gesture) —
 * nunca automaticamente ao carregar a tela. Retorna { ok, motivo }. */
export async function ativarNotificacoes(lojaId = null) {
  const cap = capacidadesPush();
  if (cap.instalacaoObrigatoria && !cap.instalado) return { ok: false, motivo: "nao_instalado" };
  if (!cap.suportado) return { ok: false, motivo: "sem_suporte" };
  if (!cap.vapidConfigurada) return { ok: false, motivo: "vapid_ausente" };

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, motivo: permissao === "denied" ? "negada" : "cancelada" };

  try {
    const reg = await swPronto(8000);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const plataforma = (navigator.userAgent || "").slice(0, 180);
    await upsertPushSubscription(subscriptionParaLinha(sub, plataforma, lojaId));
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "erro_assinatura", erro: e?.message || String(e) };
  }
}

/** Mantém a loja em foco do aparelho em dia (chamada quando a loja muda).
 * Não faz nada se este aparelho não está registrado. Nunca lança. */
export async function sincronizarLojaDoAparelho(lojaId) {
  if (lojaId == null) return false;
  try {
    if (permissaoAtual() !== "granted") return false;
    const sub = await obterAssinaturaAtual();
    if (!sub) return false;
    await atualizarLojaPushSubscription(sub.endpoint, lojaId);
    return true;
  } catch { return false; }
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

const PREFS_PADRAO = { pushAtivo: true, alertaNovoPedido: true, alertaCaixa: true, som: true, alertasVisuais: true };
const CHAVE_PREFS = "pp_notif_prefs_v1";
export const EVENTO_PREFS_NOTIF = "pp-notif-prefs";

/** Última preferência conhecida neste aparelho (cache) — permite ao sino
 * tocar som/mostrar aviso sem depender de rede e funciona offline. */
export function prefsLocais() {
  try { return { ...PREFS_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_PREFS) || "{}") }; }
  catch { return { ...PREFS_PADRAO }; }
}
function guardarPrefsLocais(prefs) {
  try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs)); } catch { /* sem cache local — não quebra */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_PREFS_NOTIF, { detail: prefs })); } catch { /* idem */ }
}

export async function carregarPreferencias() {
  try { const p = await fetchPreferenciasNotificacao(); guardarPrefsLocais(p); return p; }
  catch { return prefsLocais(); }
}
export async function atualizarPreferencias(prefs) {
  await salvarPreferenciasNotificacao(prefs);
  guardarPrefsLocais(prefs);
}

/** Separa o que é NOVO e não lido em relação aos ids já vistos. Na primeira
 * carga (vistos === null) nada é "novo" — só registra o que já existia. */
export function avaliarNovas(vistos, lista) {
  const ids = new Set((lista || []).map((n) => n.id));
  if (vistos === null) return { vistos: ids, novas: [] };
  const novas = (lista || []).filter((n) => !n.lida && !vistos.has(n.id));
  return { vistos: new Set([...vistos, ...ids]), novas };
}

// ── Som dentro do app (quando o sistema está aberto) ──────────
// Dois tons curtos gerados por WebAudio (sem arquivo de áudio). Navegadores
// só liberam áudio depois de uma interação do usuário na página; se ainda
// estiver bloqueado, falha em silêncio (o aviso visual continua).
let audioCtx = null;
export function tocarSomAlerta() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime;
    [[880, 0], [1175, 0.18]].forEach(([freq, atraso]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + atraso);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + atraso + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.3);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0 + atraso); osc.stop(t0 + atraso + 0.32);
    });
    return true;
  } catch { return false; }
}

// ── Guia de ativação (puro — testável) ───────────────────────

/** Instrução curta de "como instalar" conforme o aparelho. */
export function instrucoesInstalacao(so, navegador) {
  if (so === "ios") return "Abra o Pedido Prime no Safari, toque em Compartilhar (quadrado com seta) e escolha “Adicionar à Tela de Início”. Depois abra o app pelo ícone novo.";
  if (so === "android") return "No menu ⋮ do navegador, escolha “Instalar aplicativo” (ou “Adicionar à tela inicial”) e abra o Pedido Prime pelo ícone novo.";
  if (navegador === "chrome" || navegador === "edge") return "Clique no ícone de instalar na barra de endereço (ou menu ⋮ → “Instalar Pedido Prime”) e abra o app instalado.";
  return "Use o menu do navegador para instalar ou adicionar o Pedido Prime à tela inicial.";
}

/**
 * Traduz o estado do aparelho em passos + um aviso claro para o usuário.
 * @returns {{ passos: {id:string, titulo:string, estado:'ok'|'pendente'|'opcional'|'bloqueado', detalhe?:string}[],
 *   aviso: {tipo:'info'|'warn'|'erro'|'ok', texto:string}|null, podeAtivar: boolean, mostrarInstalar: boolean }}
 */
export function avaliarAtivacao({ cap, permissao, inscrito }) {
  const c = cap || {};
  const ios = c.so === "ios";
  const semInstalar = !c.instalado;
  const bloqueadoPorIos = ios && semInstalar;

  let aviso;
  let podeAtivar = !!c.suportado && !!c.vapidConfigurada && permissao !== "denied" && !bloqueadoPorIos;

  if (bloqueadoPorIos) {
    aviso = { tipo: "warn", texto: "No iPhone/iPad as notificações só funcionam com o Pedido Prime instalado na Tela de Início (iOS 16.4 ou mais novo). Instale o app e abra-o pelo ícone para continuar." };
  } else if (!c.https) {
    aviso = { tipo: "erro", texto: "As notificações exigem conexão segura (https). Abra o Pedido Prime pelo endereço oficial." };
  } else if (!c.suportado) {
    aviso = { tipo: "erro", texto: "Este navegador/aparelho não suporta notificações push. Use o Chrome, Edge ou Safari atualizado — ou instale o app." };
  } else if (!c.vapidConfigurada) {
    aviso = { tipo: "erro", texto: "As notificações ainda não foram configuradas neste ambiente. Avise o administrador do sistema." };
  } else if (permissao === "denied") {
    aviso = { tipo: "erro", texto: "As notificações estão bloqueadas para o Pedido Prime. Libere nas permissões do site (cadeado na barra de endereço) ou nas configurações de notificação do aparelho e toque em “Verificar novamente”." };
  } else if (inscrito) {
    aviso = { tipo: "ok", texto: "Tudo pronto: este aparelho será avisado de novos pedidos. Use “Enviar notificação de teste” para conferir." };
  } else if (semInstalar) {
    aviso = { tipo: "info", texto: "Você já pode ativar as notificações aqui. Para não perder avisos com o navegador fechado, recomendamos instalar o Pedido Prime." };
  } else {
    aviso = { tipo: "info", texto: "Ative as notificações deste aparelho para ser avisado de novos pedidos mesmo com o app em segundo plano." };
  }

  const passos = [
    { id: "instalar", titulo: "Instalar o app", estado: c.instalado ? "ok" : ios ? "pendente" : "opcional",
      detalhe: c.instalado ? "Instalado" : ios ? "Obrigatório no iPhone/iPad" : "Recomendado" },
    { id: "permissao", titulo: "Permitir notificações", estado: permissao === "granted" ? "ok" : permissao === "denied" ? "bloqueado" : "pendente",
      detalhe: permissao === "granted" ? "Permitido" : permissao === "denied" ? "Bloqueado no navegador" : "Será pedido ao ativar" },
    { id: "ativar", titulo: "Ativar neste aparelho", estado: inscrito ? "ok" : "pendente", detalhe: inscrito ? "Ativo" : "Ligue a chave abaixo" },
    { id: "testar", titulo: "Enviar um teste", estado: inscrito ? "pendente" : "bloqueado", detalhe: inscrito ? "Confira o aviso e o som" : "Disponível após ativar" },
  ];
  return { passos, aviso, podeAtivar, mostrarInstalar: semInstalar };
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
