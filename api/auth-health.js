// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/auth-health  (fase 7.2.3, §24)
//  Diagnóstico de saúde da autenticação — SOMENTE booleanos.
//  Protegido: exige JWT de usuário ativo com acesso "admin" (ou super).
//
//  NUNCA retorna: service role key, tokens, usuários, hash, dados pessoais.
//  Retorna apenas:
//    { serviceRoleConfigured, serviceRoleFormat, adminApiReachable,
//      databaseRpcReachable, status }
// ════════════════════════════════════════════════════════════

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}
function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
}
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

// Classifica o FORMATO da chave sem revelar o valor.
function serviceRoleFormat() {
  const k = serviceKey();
  if (!k) return "ausente";
  if (k.startsWith("sb_secret_")) return "sb_secret";
  if (k.split(".").length === 3) return "legacy_jwt";
  return "desconhecido";
}

const PERFIS_ADMIN = new Set([
  "admin", "administrador", "admin geral", "administrador geral",
  "gestor", "gerente",
]);
const ehPerfilAdmin = (p) => PERFIS_ADMIN.has(String(p || "").trim().toLowerCase());

async function operadorAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // apikey só precisa ser válida (o Bearer identifica o usuário) — usa service
  // role para não depender da anon key no runtime da função.
  const apikey = serviceKey() || anonKey();
  const url = supabaseUrl();
  if (!token || !apikey || !url) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey, authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const user = await r.json();
    const email = String(user?.email || "").trim().toLowerCase();
    if (!email) return false;
    // Consulta mínima em tab_usuarios (com service role) — só flags de acesso.
    const q = await fetch(
      `${url}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(email)}&select=ativo,super_admin,ids_acesso,perfil&limit=1`,
      { headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, accept: "application/json" } },
    );
    if (!q.ok) return false;
    const rows = await q.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.ativo === false) return false;
    const ids = Array.isArray(row.ids_acesso) ? row.ids_acesso : [];
    return !!row.super_admin || ids.includes("admin") || ehPerfilAdmin(row.perfil);
  } catch {
    return false;
  }
}

async function adminApiReachable() {
  const url = supabaseUrl();
  if (!serviceKey() || !url) return false;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
    });
    return r.ok; // 401/403 (chave inválida) → false
  } catch {
    return false;
  }
}

async function databaseRpcReachable() {
  // Chama app_validar_login com credencial inexistente: reachable se HTTP ok
  // (retorna {ok:false}). Se o crypt/search_path estiver quebrado, a RPC dá 500.
  const url = supabaseUrl();
  if (!url || (!serviceKey() && !anonKey())) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/app_validar_login`, {
      method: "POST",
      headers: {
        apikey: serviceKey() || anonKey(),
        authorization: `Bearer ${serviceKey() || anonKey()}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ p_email: "health-check@invalido.local", p_senha: "x-health-check-x" }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.end();
  }
  if (!(await operadorAdmin(req))) {
    return json(res, 401, { error: "Acesso restrito a administradores." });
  }

  const serviceRoleConfigured = !!serviceKey();
  const [adminApi, dbRpc] = await Promise.all([adminApiReachable(), databaseRpcReachable()]);
  const status = serviceRoleConfigured && adminApi && dbRpc ? "healthy" : "degraded";

  return json(res, 200, {
    serviceRoleConfigured,
    serviceRoleFormat: serviceRoleFormat(),
    adminApiReachable: adminApi,
    databaseRpcReachable: dbRpc,
    status,
  });
}
