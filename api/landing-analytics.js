/* global process */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const clean = (v, max = 200) => v == null ? null : String(v).trim().slice(0, max) || null;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return clean(typeof forwarded === "string" ? forwarded.split(",")[0] : req.headers["x-real-ip"], 64);
}

async function isSuperAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !serviceKey() || !baseUrl()) return false;
  const userResponse = await fetch(`${baseUrl()}/auth/v1/user`, {
    // A chave de serviço é usada somente como apikey no ambiente protegido da
    // função. O token do próprio usuário continua sendo quem autentica a sessão.
    // Isso evita incompatibilidade entre tokens novos e chaves públicas antigas.
    headers: { apikey: serviceKey(), authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const email = clean(user?.email, 160)?.toLowerCase();
  if (!email) return false;
  // Conta-raiz criada pela migration 013. Como o e-mail vem do JWT validado
  // diretamente pelo Supabase, não dependemos de uma segunda consulta para
  // reconhecer o administrador principal.
  if (email === "admin@restaurante.com") return true;
  const response = await fetch(`${baseUrl()}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(email)}&select=ativo,super_admin,loja_id,ids_acesso&limit=1`, {
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
  });
  if (!response.ok) return false;
  const rows = await response.json();
  const operator = rows?.[0];
  if (!operator || operator.ativo === false) return false;
  return operator.super_admin === true
    || (operator.loja_id == null && Array.isArray(operator.ids_acesso) && operator.ids_acesso.includes("admin"));
}

async function saveVisit(req, body) {
  const action = clean(body.action, 20) || "start";
  const sessionId = clean(body.sessionId, 80);
  if (!sessionId) return false;
  if (action === "heartbeat" || action === "end") {
    const now = new Date();
    const started = new Date(body.startedAt || now);
    const duration = Math.max(0, Math.round((now - started) / 1000));
    const changes = {
      session_id: sessionId,
      last_seen_at: now.toISOString(), duration_seconds: duration,
      ...(action === "end" ? { ended_at: now.toISOString() } : {}),
    };
    const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits?on_conflict=session_id`, {
      method: "POST",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(changes),
    });
    if (response.ok) return { ok: true };
    const detail = clean(await response.text().catch(() => ""), 240);
    return { ok: false, code: `heartbeat_${response.status}`, detail };
  }
  const startedAt = clean(body.startedAt, 40) || new Date().toISOString();
  const row = {
    visitor_id: clean(body.visitorId, 80), session_id: sessionId,
    path: clean(body.path, 300) || "/", referrer: clean(body.referrer, 500),
    ip_address: clientIp(req),
    city: clean(req.headers["x-vercel-ip-city"] ? decodeURIComponent(req.headers["x-vercel-ip-city"]) : null, 120),
    state: clean(req.headers["x-vercel-ip-country-region"], 80),
    country: clean(req.headers["x-vercel-ip-country"], 8),
    device_type: clean(body.deviceType, 40), device_name: clean(body.deviceName, 120),
    os: clean(body.os, 80), browser: clean(body.browser, 80), browser_version: clean(body.browserVersion, 40),
    screen_width: Number(body.screenWidth) || null, screen_height: Number(body.screenHeight) || null,
    language: clean(body.language, 30), user_agent: clean(req.headers["user-agent"], 500),
    started_at: startedAt, last_seen_at: startedAt, duration_seconds: 0,
  };
  const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits?on_conflict=session_id`, {
    method: "POST",
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (response.ok) return { ok: true };
  const detail = clean(await response.text().catch(() => ""), 240);
  return { ok: false, code: `start_${response.status}`, detail };
}

function countBy(rows, key, fallback = "Não identificado") {
  const map = new Map();
  rows.forEach((row) => { const label = row[key] || fallback; map.set(label, (map.get(label) || 0) + 1); });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    if (!serviceKey() || !baseUrl()) return json(res, 202, { ok: false, skipped: true });
    let body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const result = await saveVisit(req, body).catch(() => ({ ok: false, code: "unexpected_error" }));
    return json(res, 202, result);
  }
  if (req.method === "DELETE") {
    if (!(await isSuperAdmin(req))) return json(res, 403, { error: "Acesso exclusivo do Super Admin." });
    const id = clean(req.query?.id, 80);
    if (!id) return json(res, 400, { error: "Registro inválido." });
    const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, prefer: "return=minimal" },
    });
    return response.ok ? json(res, 200, { ok: true }) : json(res, 503, { error: "Não foi possível excluir." });
  }
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  if (!(await isSuperAdmin(req))) return json(res, 403, { error: "Acesso exclusivo do Super Admin." });
  const end = new Date(req.query?.to || Date.now());
  const start = new Date(req.query?.from || (Date.now() - 30 * 86400000));
  const page = Math.max(1, Number(req.query?.page) || 1);
  const pageSize = 10;
  const query = new URLSearchParams({
    select: "id,visitor_id,session_id,path,referrer,ip_address,city,state,country,device_type,device_name,os,browser,browser_version,screen_width,screen_height,created_at,started_at,last_seen_at,ended_at,duration_seconds",
    created_at: `gte.${start.toISOString()}`, order: "created_at.desc", limit: "5000",
  });
  const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits?${query}`, {
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, accept: "application/json", Prefer: `count=exact` },
  });
  if (!response.ok) return json(res, 503, { error: "Métricas indisponíveis. Aplique a migration 114." });
  const staleBefore = Date.now() - 45000;
  const sourceRows = (await response.json())
    .filter((r) => new Date(r.created_at) <= end)
    .map((r) => {
      if (r.ended_at || !r.last_seen_at || new Date(r.last_seen_at).getTime() >= staleBefore) return r;
      return { ...r, ended_at: r.last_seen_at, ended_inferred: true };
    });
  const search = clean(req.query?.q, 160)?.toLowerCase() || "";
  const deviceFilter = clean(req.query?.device, 60)?.toLowerCase() || "";
  const browserFilter = clean(req.query?.browser, 60)?.toLowerCase() || "";
  const statusFilter = clean(req.query?.status, 30)?.toLowerCase() || "";
  const searchable = (row) => [
    row.ip_address, row.city, row.state, row.country, row.device_type, row.device_name,
    row.os, row.browser, row.browser_version, row.path, row.referrer,
    row.started_at, row.ended_at, row.created_at, row.duration_seconds,
    row.screen_width && row.screen_height ? `${row.screen_width}x${row.screen_height}` : null,
  ].filter(Boolean).join(" ").toLowerCase();
  const all = sourceRows.filter((row) => {
    const active = !row.ended_at && row.last_seen_at && new Date(row.last_seen_at).getTime() >= staleBefore;
    return (!search || searchable(row).includes(search))
      && (!deviceFilter || String(row.device_type || "").toLowerCase() === deviceFilter)
      && (!browserFilter || String(row.browser || "").toLowerCase() === browserFilter)
      && (!statusFilter || (statusFilter === "active" ? active : !active));
  });
  const unique = new Set(all.map((r) => r.visitor_id).filter(Boolean)).size;
  const byDayMap = new Map();
  all.forEach((r) => { const d = r.created_at.slice(0, 10); byDayMap.set(d, (byDayMap.get(d) || 0) + 1); });
  const ips = countBy(all, "ip_address", "IP não identificado").map((item) => ({
    ...item,
    devices: new Set(all.filter((r) => (r.ip_address || "IP não identificado") === item.label).map((r) => r.device_name || r.device_type)).size,
  }));
  const offset = (page - 1) * pageSize;
  const durations = all.map((r) => Number(r.duration_seconds) || 0);
  const visitorCounts = new Map();
  all.forEach((r) => { if (r.visitor_id) visitorCounts.set(r.visitor_id, (visitorCounts.get(r.visitor_id) || 0) + 1); });
  const activeNow = all.filter((r) => !r.ended_at && r.last_seen_at && new Date(r.last_seen_at).getTime() >= staleBefore).length;
  const exportAll = String(req.query?.export || "") === "1";
  return json(res, 200, {
    total: all.length, unique, sessions: new Set(all.map((r) => r.session_id).filter(Boolean)).size,
    activeNow,
    averageDuration: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    returningVisitors: [...visitorCounts.values()].filter((value) => value > 1).length,
    shortSessions: durations.filter((value) => value <= 10).length,
    devices: countBy(all, "device_type"), browsers: countBy(all, "browser"), systems: countBy(all, "os"),
    locations: countBy(all.map((r) => ({ location: [r.city, r.state, r.country].filter(Boolean).join(" / ") })), "location"), ips,
    byDay: [...byDayMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
    filterOptions: {
      devices: [...new Set(sourceRows.map((r) => r.device_type).filter(Boolean))].sort(),
      browsers: [...new Set(sourceRows.map((r) => r.browser).filter(Boolean))].sort(),
    },
    visits: exportAll ? all : all.slice(offset, offset + pageSize), page, pageSize,
    totalPages: Math.max(1, Math.ceil(all.length / pageSize)), capped: sourceRows.length >= 5000,
  });
}
