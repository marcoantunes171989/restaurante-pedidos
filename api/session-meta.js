// ════════════════════════════════════════════════════════════
//  GET /api/session-meta
//  Retorna IP do cliente (headers Vercel/proxy) e localização
//  aproximada via lookup público (best-effort, timeout curto).
//  Sem secrets. Não exige autenticação — só metadados de rede.
// ════════════════════════════════════════════════════════════

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function ipFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (real) return String(real).trim();
  return req.socket?.remoteAddress || null;
}

async function geoFromIp(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return {};
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null;
  try {
    // ipapi.co — sem chave, uso moderado; falha silenciosa
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl?.signal,
      headers: { accept: "application/json" },
    });
    if (!r.ok) return {};
    const d = await r.json();
    if (d?.error) return {};
    return {
      city: d.city || null,
      region: d.region || d.region_code || null,
      country: d.country_name || d.country || null,
    };
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const ip = ipFromReq(req);
  const geo = await geoFromIp(ip);
  return json(res, 200, {
    ip: ip || null,
    city: geo.city || null,
    region: geo.region || null,
    state: geo.region || null,
    country: geo.country || null,
  });
}
