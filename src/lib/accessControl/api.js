import { supabase } from "../supabase.js";
import { ACCESS_EVENT, ACCESS_SECURITY_TYPES, ACCESS_SESSION_KEY } from "./constants.js";
import { coletarInfoDispositivo } from "./deviceInfo.js";

function novoToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function obterSessionToken() {
  try {
    let t = sessionStorage.getItem(ACCESS_SESSION_KEY);
    if (!t) {
      t = novoToken();
      sessionStorage.setItem(ACCESS_SESSION_KEY, t);
    }
    return t;
  } catch {
    return novoToken();
  }
}

export function limparSessionToken() {
  try { sessionStorage.removeItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
}

async function buscarMetaIp() {
  try {
    const r = await fetch("/api/session-meta", { method: "GET", cache: "no-store" });
    if (!r.ok) return {};
    return await r.json();
  } catch {
    return {};
  }
}

/** Inicia (ou reativa) a sessão de acesso do usuário autenticado. */
export async function iniciarSessaoAcesso({ loginMethod = "password" } = {}) {
  if (!supabase) return null;
  const token = obterSessionToken();
  const device = coletarInfoDispositivo();
  const meta = await buscarMetaIp();

  const { data, error } = await supabase.rpc("app_sessao_iniciar", {
    p_session_token: token,
    p_ip: meta.ip || null,
    p_city: meta.city || null,
    p_state: meta.region || meta.state || null,
    p_country: meta.country || null,
    p_device_type: device.deviceType,
    p_device_name: device.deviceName,
    p_os: device.os,
    p_browser: device.browser,
    p_browser_version: device.browserVersion || null,
    p_is_pwa: !!device.isPwa,
    p_user_agent: device.userAgent,
    p_login_method: loginMethod,
  });
  if (error) {
    console.warn("[access-control] iniciar sessão:", error.message);
    return null;
  }
  return data;
}

export async function heartbeatSessaoAcesso() {
  if (!supabase) return false;
  let token = null;
  try { token = sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
  if (!token) return false;
  const { data, error } = await supabase.rpc("app_sessao_heartbeat", {
    p_session_token: token,
  });
  if (error) {
    console.warn("[access-control] heartbeat:", error.message);
    return false;
  }
  return !!data;
}

export async function encerrarSessaoAcesso({ eventType = ACCESS_EVENT.LOGOUT } = {}) {
  if (!supabase) return false;
  let token = null;
  try { token = sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
  if (!token) return false;
  const { data, error } = await supabase.rpc("app_sessao_encerrar", {
    p_session_token: token,
    p_event_type: eventType,
  });
  limparSessionToken();
  if (error) {
    console.warn("[access-control] encerrar sessão:", error.message);
    return false;
  }
  return !!data;
}

export async function listarSessoesAcesso(params = {}) {
  if (!supabase) return { rows: [], total: 0 };
  const {
    modo = "online",
    busca = null,
    status = null,
    lojaId = null,
    desde = null,
    ate = null,
    deviceType = null,
    limit = 50,
    offset = 0,
  } = params;

  const { data, error } = await supabase.rpc("app_listar_sessoes", {
    p_modo: modo,
    p_busca: busca || null,
    p_status: status || null,
    p_loja_id: lojaId != null ? Number(lojaId) : null,
    p_desde: desde || null,
    p_ate: ate || null,
    p_device_type: deviceType || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = (data || []).map(mapSessaoRow);
  const total = rows[0]?.totalCount ?? rows.length;
  return { rows, total };
}

export async function metricasSessoesAcesso(params = {}) {
  if (!supabase) {
    return { online: 0, sessoesHoje: 0, tempoMedioSeg: 0, dispositivos: 0, acessosNegados: 0 };
  }
  const { data, error } = await supabase.rpc("app_sessoes_metricas", {
    p_desde: params.desde || null,
    p_ate: params.ate || null,
    p_loja_id: params.lojaId != null ? Number(params.lojaId) : null,
  });
  if (error) throw error;
  const m = data || {};
  return {
    online: Number(m.online) || 0,
    sessoesHoje: Number(m.sessoes_hoje) || 0,
    tempoMedioSeg: Number(m.tempo_medio_seg) || 0,
    dispositivos: Number(m.dispositivos) || 0,
    acessosNegados: Number(m.acessos_negados) || 0,
  };
}

export async function listarEventosAcesso(params = {}) {
  if (!supabase) return { rows: [], total: 0 };
  const { data, error } = await supabase.rpc("app_listar_eventos_acesso", {
    p_session_id: params.sessionId || null,
    p_tipos: params.tipos || (params.seguranca ? ACCESS_SECURITY_TYPES : null),
    p_desde: params.desde || null,
    p_ate: params.ate || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []).map((e) => ({
    id: e.id,
    sessionId: e.session_id,
    userId: e.user_id,
    lojaId: e.loja_id,
    eventType: e.event_type,
    route: e.route,
    description: e.description,
    metadata: e.metadata,
    createdAt: e.created_at,
    usuarioNome: e.usuario_nome,
    totalCount: Number(e.total_count) || 0,
  }));
  return { rows, total: rows[0]?.totalCount ?? rows.length };
}

/** Best-effort: registra login negado via API (service role no servidor). */
export async function registrarLoginNegado({ email, motivo } = {}) {
  try {
    const device = coletarInfoDispositivo();
    await fetch("/api/access-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: ACCESS_EVENT.LOGIN_DENIED,
        email: email || null,
        description: motivo || "Tentativa de login negada",
        metadata: { os: device.os, browser: device.browser, deviceType: device.deviceType },
        userAgent: device.userAgent,
      }),
    });
  } catch { /* ignore */ }
}

function mapSessaoRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    lojaId: r.loja_id,
    sessionToken: r.session_token,
    loginAt: r.login_at,
    lastActivityAt: r.last_activity_at,
    logoutAt: r.logout_at,
    status: r.status,
    presence: r.presence,
    ipAddress: r.ip_address,
    city: r.city,
    state: r.state,
    country: r.country,
    deviceType: r.device_type,
    deviceName: r.device_name,
    os: r.os,
    browser: r.browser,
    browserVersion: r.browser_version,
    isPwa: !!r.is_pwa,
    userAgent: r.user_agent,
    loginMethod: r.login_method,
    usuarioNome: r.usuario_nome,
    usuarioEmail: r.usuario_email,
    usuarioPerfil: r.usuario_perfil,
    lojaNome: r.loja_nome,
    totalCount: Number(r.total_count) || 0,
  };
}
