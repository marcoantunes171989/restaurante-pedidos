// ════════════════════════════════════════════════════════════
//  POST /api/access-event
//  Registra eventos de acesso que ocorrem ANTES da autenticação
//  (ex.: LOGIN_DENIED), usando service role no servidor.
// ════════════════════════════════════════════════════════════

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function supabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://rwnzggjxhxnfrhstbxkm.supabase.co";
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function ipFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.headers["x-real-ip"] || null;
}

async function restInsert(table, row) {
  const key = serviceKey();
  if (!key) return { ok: false, error: "missing_service_role" };
  const r = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: text || `http_${r.status}` };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const eventType = String(body.eventType || "").trim().toUpperCase();
  if (!eventType) return json(res, 400, { error: "event_type_required" });

  // Apenas eventos pré-auth permitidos neste endpoint
  const allowed = new Set(["LOGIN_DENIED"]);
  if (!allowed.has(eventType)) return json(res, 403, { error: "event_not_allowed" });

  const ip = ipFromReq(req);
  const row = {
    session_id: null,
    user_id: null,
    loja_id: body.lojaId != null ? Number(body.lojaId) : null,
    event_type: eventType,
    route: body.route || "/login",
    description: body.description || "Tentativa de login negada",
    metadata: {
      ...(body.metadata || {}),
      email: body.email ? String(body.email).toLowerCase().slice(0, 120) : null,
      ip: ip || null,
      user_agent: body.userAgent ? String(body.userAgent).slice(0, 500) : null,
    },
  };

  const result = await restInsert("tab_access_events", row);
  if (!result.ok) {
    // Tabela pode ainda não existir no ambiente — não quebra o login
    return json(res, 200, { ok: false, skipped: true, error: result.error });
  }
  return json(res, 200, { ok: true });
}
