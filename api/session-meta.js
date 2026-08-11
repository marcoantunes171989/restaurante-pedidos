// ════════════════════════════════════════════════════════════
//  GET /api/session-meta
//  Retorna IP do cliente (headers Vercel/proxy) e localização
//  aproximada. Prioriza headers da Vercel/Cloudflare; fallback
//  para lookup público (best-effort, timeout curto).
//  Sem secrets. Não exige autenticação — só metadados de rede.
// ════════════════════════════════════════════════════════════

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function header(req, name) {
  const v = req.headers[name];
  if (v == null || v === "") return null;
  const raw = Array.isArray(v) ? String(v[0]) : String(v);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function ipFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (real) return String(real).trim();
  const vercel = header(req, "x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const s = String(ip).replace(/^::ffff:/, "");
  if (s === "127.0.0.1" || s === "::1") return true;
  if (s.startsWith("10.") || s.startsWith("192.168.") || s.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(s)) return true;
  return false;
}

/** Geo imediato dos headers da edge (Vercel / Cloudflare). */
function geoFromEdgeHeaders(req) {
  const city =
    header(req, "x-vercel-ip-city") ||
    header(req, "cf-ipcity") ||
    null;
  const region =
    header(req, "x-vercel-ip-country-region") ||
    header(req, "cf-region") ||
    header(req, "cf-region-code") ||
    null;
  const country =
    header(req, "x-vercel-ip-country") ||
    header(req, "cf-ipcountry") ||
    null;
  if (!city && !region && !country) return {};
  return {
    city: city || null,
    region: region || null,
    country: country && country !== "XX" ? country : null,
  };
}

async function fetchJson(url, ms = 1600) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    const r = await fetch(url, {
      signal: ctrl?.signal,
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function geoFromIp(ip) {
  if (isPrivateIp(ip)) return {};

  // 1) ipapi.co
  const a = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  if (a && !a.error && (a.city || a.region || a.country_name || a.country)) {
    return {
      city: a.city || null,
      region: a.region || a.region_code || null,
      country: a.country_name || a.country || null,
    };
  }

  // 2) ipwho.is (fallback)
  const b = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (b && b.success !== false && (b.city || b.region || b.country)) {
    return {
      city: b.city || null,
      region: b.region || b.region_code || null,
      country: b.country || null,
    };
  }

  return {};
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const ip = ipFromReq(req);
  const edge = geoFromEdgeHeaders(req);
  const needLookup = !edge.city && !edge.region;
  const lookup = needLookup ? await geoFromIp(ip) : {};
  const city = edge.city || lookup.city || null;
  const region = edge.region || lookup.region || null;
  const country = edge.country || lookup.country || null;
  return json(res, 200, {
    ip: ip || null,
    city,
    region,
    state: region,
    country,
  });
}
