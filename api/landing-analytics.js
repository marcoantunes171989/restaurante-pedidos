/* global process */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://rwnzggjxhxnfrhstbxkm.supabase.co";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = () => process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const clean = (v, max = 200) => v == null ? null : String(v).trim().slice(0, max) || null;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return clean(typeof forwarded === "string" ? forwarded.split(",")[0] : req.headers["x-real-ip"], 64);
}

async function isSuperAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !serviceKey()) return false;
  const userResponse = await fetch(`${baseUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey(), authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const email = clean(user?.email, 160)?.toLowerCase();
  if (!email) return false;
  const response = await fetch(`${baseUrl()}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(email)}&select=ativo,super_admin,loja_id,ids_acesso&limit=1`, {
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
  });
  if (!response.ok) return false;
  const rows = await response.json();
  const operator = rows?.[0];
  if (!operator || operator.ativo === false) return false;
  // Conta-raiz criada pela migration 013. O e-mail vem do JWT validado pelo
  // Supabase, nunca de um header fornecido diretamente pelo navegador.
  if (email === "admin@restaurante.com") return true;
  return operator.super_admin === true
    || (operator.loja_id == null && Array.isArray(operator.ids_acesso) && operator.ids_acesso.includes("admin"));
}

async function insertVisit(req, body) {
  const row = {
    visitor_id: clean(body.visitorId, 80), session_id: clean(body.sessionId, 80),
    path: clean(body.path, 300) || "/", referrer: clean(body.referrer, 500),
    ip_address: clientIp(req),
    city: clean(req.headers["x-vercel-ip-city"] ? decodeURIComponent(req.headers["x-vercel-ip-city"]) : null, 120),
    state: clean(req.headers["x-vercel-ip-country-region"], 80),
    country: clean(req.headers["x-vercel-ip-country"], 8),
    device_type: clean(body.deviceType, 40), device_name: clean(body.deviceName, 120),
    os: clean(body.os, 80), browser: clean(body.browser, 80), browser_version: clean(body.browserVersion, 40),
    screen_width: Number(body.screenWidth) || null, screen_height: Number(body.screenHeight) || null,
    language: clean(body.language, 30), user_agent: clean(req.headers["user-agent"], 500),
  };
  const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits`, {
    method: "POST",
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  return response.ok;
}

function countBy(rows, key, fallback = "Não identificado") {
  const map = new Map();
  rows.forEach((row) => { const label = row[key] || fallback; map.set(label, (map.get(label) || 0) + 1); });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    if (!serviceKey()) return json(res, 202, { ok: false, skipped: true });
    let body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const ok = await insertVisit(req, body).catch(() => false);
    return json(res, 202, { ok });
  }
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  if (!(await isSuperAdmin(req))) return json(res, 403, { error: "Acesso exclusivo do Super Admin." });
  const end = new Date(req.query?.to || Date.now());
  const start = new Date(req.query?.from || (Date.now() - 30 * 86400000));
  const query = new URLSearchParams({
    select: "id,visitor_id,session_id,path,referrer,ip_address,city,state,country,device_type,device_name,os,browser,browser_version,screen_width,screen_height,created_at",
    created_at: `gte.${start.toISOString()}`, order: "created_at.desc", limit: "5000",
  });
  const response = await fetch(`${baseUrl()}/rest/v1/tab_landing_visits?${query}`, {
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, accept: "application/json", Prefer: `count=exact` },
  });
  if (!response.ok) return json(res, 503, { error: "Métricas indisponíveis. Aplique a migration 114." });
  const all = (await response.json()).filter((r) => new Date(r.created_at) <= end);
  const unique = new Set(all.map((r) => r.visitor_id).filter(Boolean)).size;
  const byDayMap = new Map();
  all.forEach((r) => { const d = r.created_at.slice(0, 10); byDayMap.set(d, (byDayMap.get(d) || 0) + 1); });
  return json(res, 200, {
    total: all.length, unique, sessions: new Set(all.map((r) => r.session_id).filter(Boolean)).size,
    devices: countBy(all, "device_type"), browsers: countBy(all, "browser"), systems: countBy(all, "os"),
    locations: countBy(all.map((r) => ({ location: [r.city, r.state, r.country].filter(Boolean).join(" / ") })), "location"),
    byDay: [...byDayMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
    visits: all.slice(0, 200), capped: all.length >= 5000,
  });
}
