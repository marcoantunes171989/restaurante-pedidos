// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/login-banco
//  Valida e-mail + senha contra tab_usuarios (fonte da verdade do
//  cadastro no Admin) e alinha o Supabase Auth para o signIn
//  do front funcionar com a mesma senha.
//
//  Fluxo do app:
//    1) POST /api/login-banco { email, senha }
//    2) front chama supabase.auth.signInWithPassword
//
//  Requer SUPABASE_SERVICE_ROLE_KEY na Vercel (Production + Preview).
// ════════════════════════════════════════════════════════════

const SENHA_MIN = 6;

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

async function authAdmin(path, { method = "GET", body } = {}) {
  const key = serviceKey();
  const url = `${supabaseUrl()}/auth/v1${path}`;
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await r.json(); } catch { /* vazio */ }
  if (!r.ok) {
    const msg = data?.msg || data?.error_description || data?.message || data?.error || `Auth Admin HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
}

// Fase 7.2.1: a validação da senha é feita SÓ pela RPC app_validar_login,
// que compara por hash (bcrypt) no servidor. A API nunca lê tab_usuarios.senha
// nem a senha_hash — só recebe o perfil operacional (sem credencial).
async function rpcValidarLogin(email, senha) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/app_validar_login`, {
    method: "POST",
    headers: {
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ p_email: email, p_senha: senha }),
  });
  let data = null;
  try { data = await r.json(); } catch { /* vazio */ }
  if (!r.ok) {
    throw new Error((data && (data.message || data.error)) || `RPC HTTP ${r.status}`);
  }
  return data && typeof data === "object" ? data : { ok: false, code: "INVALID_CREDENTIALS" };
}

async function encontrarAuthPorEmail(email) {
  const alvo = String(email || "").trim().toLowerCase();
  if (!alvo) return null;
  try {
    const data = await authAdmin(`/admin/users?email=${encodeURIComponent(alvo)}`);
    const users = data?.users || (data?.id ? [data] : []);
    const hit = users.find((u) => (u.email || "").toLowerCase() === alvo);
    if (hit) return hit;
  } catch { /* fallback */ }
  let page = 1;
  for (;;) {
    const data = await authAdmin(`/admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === alvo);
    if (hit) return hit;
    if (users.length < 200) return null;
    page += 1;
    if (page > 50) return null;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  if (!serviceKey()) {
    return json(res, 503, {
      error: "SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel.",
      code: "SERVICE_ROLE_MISSING",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const email = String(body.email || "").trim().toLowerCase();
  const senha = body.senha != null ? String(body.senha) : "";

  if (!email || !email.includes("@") || !senha) {
    return json(res, 400, { error: "Informe e-mail e senha.", code: "INVALID_INPUT" });
  }
  if (senha.length < SENHA_MIN) {
    return json(res, 401, { error: "E-mail ou senha incorretos.", code: "INVALID_CREDENTIALS" });
  }

  try {
    // Validação por hash, server-side (nunca lê a senha armazenada).
    const val = await rpcValidarLogin(email, senha);
    if (!val.ok) {
      if (val.code === "INACTIVE") {
        return json(res, 403, {
          error: "Usuário inativo, entre em contato com o administrador do sistema.",
          code: "INACTIVE",
        });
      }
      // Resposta genérica — não revela se o e-mail existe.
      return json(res, 401, { error: "E-mail ou senha incorretos.", code: "INVALID_CREDENTIALS" });
    }
    const row = val.usuario || {};

    // Credenciais OK no banco → login liberado. Auth é best-effort (JWT/RLS).
    const meta = {
      nome: row.nome || "",
      loja_id: row.loja_id ?? null,
      perfil: row.perfil || "",
    };

    let authId = null;
    let authAlinhado = false;
    try {
      let authUser = await encontrarAuthPorEmail(email);
      if (!authUser) {
        try {
          const criado = await authAdmin("/admin/users", {
            method: "POST",
            body: {
              email,
              password: senha,
              email_confirm: true,
              user_metadata: meta,
            },
          });
          authUser = { id: criado?.id || criado?.user?.id || null, user_metadata: meta };
        } catch (e) {
          if (!/already|registered|exists|duplicate/i.test(String(e.message || ""))) throw e;
          authUser = await encontrarAuthPorEmail(email);
          if (!authUser) throw e;
        }
      }
      if (authUser?.id) {
        await authAdmin(`/admin/users/${authUser.id}`, {
          method: "PUT",
          body: {
            password: senha,
            email_confirm: true,
            user_metadata: { ...(authUser.user_metadata || {}), ...meta },
          },
        });
        authId = authUser.id;
        authAlinhado = true;
      }
    } catch (e) {
      // Não bloqueia o login: senha já conferiu em tab_usuarios.
      console.warn("[login-banco] Auth não alinhado (login liberado pelo banco):", e?.message || e);
    }

    // Nunca devolver a senha ao cliente — remove-a do payload (fase 7.2).
    // A comparação já ocorreu no servidor (acima); o front só recebe o
    // perfil operacional.
    const usuarioSemSenha = { ...row };
    delete usuarioSemSenha.senha;

    return json(res, 200, {
      ok: true,
      email,
      authId,
      authAlinhado,
      usuarioId: row.id,
      usuario: usuarioSemSenha,
    });
  } catch (e) {
    console.error("[login-banco]", e);
    return json(res, 500, {
      error: "Não foi possível validar o acesso no banco.",
      code: "SERVER_ERROR",
    });
  }
}
