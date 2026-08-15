import { supabase } from "../supabase.js";
import {
  ACCESS_EVENT,
  ACCESS_SECURITY_TYPES,
  ACCESS_SESSION_KEY,
  MSG_DISPOSITIVO_BLOQUEADO,
} from "./constants.js";
import { coletarInfoDispositivo, obterDeviceIdEstavel } from "./deviceInfo.js";

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

/** Verifica se o aparelho atual está bloqueado (antes do login). */
export async function verificarDispositivoBloqueado(deviceId = obterDeviceIdEstavel()) {
  if (!deviceId) return { blocked: false };
  if (!supabase) {
    try {
      const r = await fetch("/api/device-block-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (!r.ok) return { blocked: false };
      return await r.json();
    } catch {
      return { blocked: false };
    }
  }
  const { data, error } = await supabase.rpc("app_dispositivo_esta_bloqueado", {
    p_device_id: deviceId,
  });
  if (error) {
    console.warn("[access-control] check bloqueio:", error.message);
    return { blocked: false };
  }
  const blocked = !!(data && (data.blocked === true || data.blocked === "true"));
  return {
    blocked,
    motivo: data?.motivo || null,
    mensagem: data?.mensagem || MSG_DISPOSITIVO_BLOQUEADO,
  };
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
    p_device_id: device.deviceId || obterDeviceIdEstavel(),
  });
  if (error) {
    if (/device_blocked/i.test(error.message || "")) {
      const err = new Error(MSG_DISPOSITIVO_BLOQUEADO);
      err.code = "DEVICE_BLOCKED";
      throw err;
    }
    console.warn("[access-control] iniciar sessão:", error.message);
    return null;
  }
  return data;
}

/**
 * Super Admin: troca a empresa em foco sem misturar o tempo das sessões.
 * O banco encerra o contexto anterior e abre um novo período no instante da seleção.
 */
export async function trocarContextoSessaoAcesso(lojaId = null) {
  if (!supabase) return null;
  let tokenAtual = null;
  try { tokenAtual = sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
  if (!tokenAtual) return iniciarSessaoAcesso({ loginMethod: "company_context" });
  const novoSessionToken = novoToken();
  const { data, error } = await supabase.rpc("app_sessao_trocar_contexto", {
    p_session_token: tokenAtual,
    p_new_session_token: novoSessionToken,
    p_loja_id: lojaId != null ? Number(lojaId) : null,
  });
  if (error) {
    console.warn("[access-control] trocar contexto:", error.message);
    return null;
  }
  if (data?.changed) {
    try { sessionStorage.setItem(ACCESS_SESSION_KEY, novoSessionToken); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent("pp:access-context-changed")); } catch { /* ignore */ }
  }
  return data?.session_id || null;
}

/**
 * Heartbeat de presença.
 * @returns {Promise<{ status: 'active'|'closed'|'missing'|'error', alive: boolean }>}
 */
export async function heartbeatSessaoAcesso() {
  if (!supabase) return { status: "missing", alive: false };
  let token = null;
  try { token = sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
  if (!token) return { status: "missing", alive: false };
  const { data, error } = await supabase.rpc("app_sessao_heartbeat", {
    p_session_token: token,
  });
  if (error) {
    console.warn("[access-control] heartbeat:", error.message);
    // Compat: migration 098 devolvia boolean — trata true/false
    return { status: "error", alive: false };
  }
  // Fase 2 (099): text active|closed|missing
  // Fase 1 (098): boolean
  if (data === true) return { status: "active", alive: true };
  if (data === false) return { status: "missing", alive: false };
  const status = typeof data === "string" ? data : "error";
  return { status, alive: status === "active" };
}

/** Admin encerra sessão de outro usuário (ou a própria) remotamente. */
export async function encerrarSessaoRemota(sessionId) {
  if (!supabase) throw new Error("Supabase indisponível");
  if (!sessionId) throw new Error("Sessão inválida");
  const { data, error } = await supabase.rpc("app_sessao_encerrar_remota", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data || { ok: true };
}

/** Admin bloqueia aparelho (derruba sessões ativas na hora). */
export async function bloquearDispositivoAcesso(params = {}) {
  if (!supabase) throw new Error("Supabase indisponível");
  const deviceId = params.deviceId || null;
  if (!deviceId && !params.sessionId) throw new Error("Dispositivo inválido");
  const { data, error } = await supabase.rpc("app_dispositivo_bloquear", {
    p_device_id: deviceId || "",
    p_motivo: params.motivo || null,
    p_session_id: params.sessionId || null,
    p_user_id: params.userId != null ? Number(params.userId) : null,
    p_loja_id: params.lojaId != null ? Number(params.lojaId) : null,
    p_device_label: params.deviceLabel || null,
    p_os: params.os || null,
    p_browser: params.browser || null,
    p_ip: params.ip || null,
  });
  if (error) throw error;
  return data || { ok: true };
}

export async function desbloquearDispositivoAcesso(blockId) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("app_dispositivo_desbloquear", {
    p_block_id: blockId,
  });
  if (error) throw error;
  return data || { ok: true };
}

export async function listarDispositivosBloqueados(params = {}) {
  if (!supabase) return { rows: [], total: 0 };
  const { data, error } = await supabase.rpc("app_listar_dispositivos_bloqueados", {
    p_loja_id: params.lojaId != null ? Number(params.lojaId) : null,
    p_somente_ativos: params.somenteAtivos !== false,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []).map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    lojaId: r.loja_id,
    userId: r.user_id,
    motivo: r.motivo,
    deviceLabel: r.device_label,
    os: r.os,
    browser: r.browser,
    ipAddress: r.ip_address,
    blockedBy: r.blocked_by,
    blockedAt: r.blocked_at,
    unblockedAt: r.unblocked_at,
    ativo: !!r.ativo,
    usuarioNome: r.usuario_nome,
    bloqueadoPorNome: r.bloqueado_por_nome,
    lojaNome: r.loja_nome,
    totalCount: Number(r.total_count) || 0,
  }));
  return { rows, total: rows[0]?.totalCount ?? rows.length };
}

/**
 * Escuta a própria sessão — logout imediato quando admin encerra/bloqueia.
 * @returns {() => void} cleanup
 */
export function escutarSessaoPropria(sessionId, onClosed) {
  if (!supabase || !sessionId || typeof onClosed !== "function") {
    return () => {};
  }
  const nome = `ch_sessao_propria_${Math.random().toString(36).slice(2)}`;
  let canal = supabase
    .channel(nome)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tab_user_sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload?.new?.status === "closed") onClosed(payload.new);
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(canal); } catch { /* ignore */ }
    canal = null;
  };
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
  const payload = {
    p_session_id: params.sessionId || null,
    p_tipos: params.tipos || (params.seguranca ? ACCESS_SECURITY_TYPES : null),
    p_desde: params.desde || null,
    p_ate: params.ate || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    // Empresa em foco (alertas / Segurança). Detalhe por sessionId ignora no SQL (migration 103).
    p_loja_id: params.lojaId != null ? Number(params.lojaId) : null,
  };
  let { data, error } = await supabase.rpc("app_listar_eventos_acesso", payload);
  // Antes da migration 103 a assinatura antiga não tem p_loja_id — fallback + filtro local.
  if (error && /p_loja_id|Could not find the function|schema cache/i.test(error.message || "")) {
    const { p_loja_id: _omit, ...legacy } = payload;
    ({ data, error } = await supabase.rpc("app_listar_eventos_acesso", legacy));
    if (!error && params.lojaId != null && !params.sessionId) {
      const alvo = Number(params.lojaId);
      data = (data || []).filter((e) => Number(e.loja_id) === alvo);
    }
  }
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

/** Inicia registro de permanência na tela atual. */
export async function iniciarPageStay({ route, screenKey, screenLabel } = {}) {
  if (!supabase || !screenKey) return null;
  let token = null;
  try { token = sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { /* ignore */ }
  if (!token) return null;
  const { data, error } = await supabase.rpc("app_page_stay_iniciar", {
    p_session_token: token,
    p_route: route || null,
    p_screen_key: screenKey,
    p_screen_label: screenLabel || screenKey,
  });
  if (error) {
    console.warn("[access-control] page stay iniciar:", error.message);
    return null;
  }
  return data;
}

export async function encerrarPageStay(stayId) {
  if (!supabase || !stayId) return false;
  const { data, error } = await supabase.rpc("app_page_stay_encerrar", {
    p_stay_id: stayId,
  });
  if (error) {
    console.warn("[access-control] page stay encerrar:", error.message);
    return false;
  }
  return !!data;
}

export async function listarPageStaysSessao(sessionId, limit = 40) {
  if (!supabase || !sessionId) return [];
  const { data, error } = await supabase.rpc("app_listar_page_stays_sessao", {
    p_session_id: sessionId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    screenKey: r.screen_key,
    screenLabel: r.screen_label,
    route: r.route,
    deviceType: r.device_type,
    os: r.os,
    browser: r.browser,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMs: Number(r.duration_ms) || 0,
  }));
}

export async function listarPermanenciaAcesso(params = {}) {
  if (!supabase) return { rows: [], total: 0 };
  const { data, error } = await supabase.rpc("app_listar_permanencia", {
    p_agrupar: params.agrupar || "tela",
    p_desde: params.desde || null,
    p_ate: params.ate || null,
    p_loja_id: params.lojaId != null ? Number(params.lojaId) : null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data || []).map((r) => ({
    chave: r.chave,
    rotulo: r.rotulo,
    tempoMs: Number(r.tempo_ms) || 0,
    visitas: Number(r.visitas) || 0,
    usuarios: Number(r.usuarios) || 0,
    detalhe: r.detalhe || "",
    totalCount: Number(r.total_count) || 0,
  }));
  return { rows, total: rows[0]?.totalCount ?? rows.length };
}

export async function excluirSessaoAcesso(sessionId) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("app_sessao_excluir", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data || { ok: true };
}

export async function excluirEventoAcesso(eventId) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("app_evento_acesso_excluir", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data || { ok: true };
}

/** Inscreve em mudanças de sessões/eventos/bloqueios da loja (tela admin ao vivo). */
export function escutarControleAcessos(onChange, { lojaId = null } = {}) {
  if (!supabase || typeof onChange !== "function") {
    return () => {};
  }
  const nome = `ch_controle_acessos_${Math.random().toString(36).slice(2)}`;
  const filtroLoja = lojaId != null ? `loja_id=eq.${Number(lojaId)}` : undefined;
  const filtroOpt = filtroLoja ? { filter: filtroLoja } : {};
  let canal = supabase.channel(nome)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tab_user_sessions", ...filtroOpt },
      () => onChange("session"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tab_access_events", ...filtroOpt },
      () => onChange("event"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tab_access_page_stays", ...filtroOpt },
      () => onChange("stay"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tab_dispositivos_bloqueados", ...filtroOpt },
      () => onChange("block"),
    );
  canal.subscribe();
  return () => {
    try { supabase.removeChannel(canal); } catch { /* ignore */ }
    canal = null;
  };
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
    deviceId: r.device_id || null,
    usuarioNome: r.usuario_nome,
    usuarioEmail: r.usuario_email,
    usuarioPerfil: r.usuario_perfil,
    lojaNome: r.loja_nome,
    totalCount: Number(r.total_count) || 0,
  };
}
