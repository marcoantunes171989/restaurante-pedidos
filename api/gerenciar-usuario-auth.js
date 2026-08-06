// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/gerenciar-usuario-auth
//  Cria / atualiza / exclui usuários no Supabase Auth (auth.users)
//  quando o admin cadastra usuários no app. Sem isso, o login em
//  AUTH_MODE=supabase falha porque só existiria a linha em tab_usuarios.
//
//  A SERVICE ROLE KEY fica SÓ no servidor (env na Vercel), nunca no front.
//  Vercel → Settings → Environment Variables →
//    SUPABASE_SERVICE_ROLE_KEY = <service_role do projeto>
//  (Production + Preview) → Redeploy.
//
//  Segurança: exige JWT válido + usuário ativo com acesso "admin"
//  (ou super_admin). Operador de loja só gerencia e-mails da própria loja.
// ════════════════════════════════════════════════════════════

const SENHA_MIN = 6;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function supabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://rwnzggjxhxnfrhstbxkm.supabase.co";
}

function anonKey() {
  return process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
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
  try { data = await r.json(); } catch { /* vazio (ex.: DELETE) */ }
  if (!r.ok) {
    const msg = data?.msg || data?.error_description || data?.message || data?.error || `Auth Admin HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function restSelectUsuarioPorEmail(email) {
  const key = serviceKey();
  // ilike: e-mails antigos podem ter casing diferente do JWT.
  const filtro = `email=ilike.${encodeURIComponent(email)}`;
  const r = await fetch(`${supabaseUrl()}/rest/v1/tab_usuarios?${filtro}&select=id,email,loja_id,ativo,super_admin,ids_acesso`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function operadorDoToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const anon = anonKey();
  if (!anon) return null;
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const user = await r.json();
  const email = (user?.email || "").trim();
  if (!email) return null;
  const row = await restSelectUsuarioPorEmail(email);
  if (!row || row.ativo === false) return null;
  const ids = Array.isArray(row.ids_acesso) ? row.ids_acesso : [];
  const podeAdmin = !!row.super_admin || ids.includes("admin");
  if (!podeAdmin) return null;
  return {
    email,
    lojaId: row.loja_id ?? null,
    superAdmin: !!row.super_admin,
  };
}

async function encontrarAuthPorEmail(email) {
  const alvo = String(email || "").trim().toLowerCase();
  if (!alvo) return null;
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

function validarSenha(senha) {
  if (!senha || String(senha).length < SENHA_MIN) {
    return `Senha deve ter no mínimo ${SENHA_MIN} caracteres (exigência do login).`;
  }
  return null;
}

function podeGerenciarLoja(operador, lojaIdAlvo) {
  if (operador.superAdmin) return true;
  if (lojaIdAlvo == null || lojaIdAlvo === "") return false;
  return String(operador.lojaId) === String(lojaIdAlvo);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  if (!serviceKey()) {
    return json(res, 503, {
      error: "SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel. Defina em Settings → Environment Variables e faça redeploy.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  try {
    const operador = await operadorDoToken(req);
    if (!operador) return json(res, 401, { error: "Sem permissão para gerenciar usuários de login." });

    const acao = String(body.acao || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const emailAnterior = String(body.emailAnterior || "").trim().toLowerCase();
    const senha = body.senha != null ? String(body.senha) : "";
    const nome = String(body.nome || "").trim();
    const lojaId = body.lojaId != null && body.lojaId !== "" ? body.lojaId : null;

    if (!["criar", "atualizar", "excluir"].includes(acao)) {
      return json(res, 400, { error: "Ação inválida." });
    }
    if (!email || !email.includes("@")) {
      return json(res, 400, { error: "E-mail inválido." });
    }

    if (acao === "criar") {
      if (!podeGerenciarLoja(operador, lojaId)) {
        return json(res, 403, { error: "Só é possível cadastrar usuários da sua empresa." });
      }
      const errSenha = validarSenha(senha);
      if (errSenha) return json(res, 400, { error: errSenha });

      const existente = await encontrarAuthPorEmail(email);
      if (existente) {
        // Já existe no Auth: alinha a senha (idempotente) para o cadastro funcionar no login.
        await authAdmin(`/admin/users/${existente.id}`, {
          method: "PUT",
          body: {
            password: senha,
            email_confirm: true,
            user_metadata: { ...(existente.user_metadata || {}), nome, loja_id: lojaId },
          },
        });
        return json(res, 200, { ok: true, id: existente.id, atualizado: true });
      }

      const criado = await authAdmin("/admin/users", {
        method: "POST",
        body: {
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome, loja_id: lojaId },
        },
      });
      return json(res, 200, { ok: true, id: criado?.id || criado?.user?.id || null });
    }

    if (acao === "atualizar") {
      const emailBusca = emailAnterior || email;
      const rowApp = await restSelectUsuarioPorEmail(emailBusca);
      if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
        return json(res, 403, { error: "Só é possível editar usuários da sua empresa." });
      }
      if (lojaId != null && !podeGerenciarLoja(operador, lojaId)) {
        return json(res, 403, { error: "Só é possível editar usuários da sua empresa." });
      }
      if (senha) {
        const errSenha = validarSenha(senha);
        if (errSenha) return json(res, 400, { error: errSenha });
      }

      let authUser = await encontrarAuthPorEmail(emailBusca);
      if (!authUser && email !== emailBusca) {
        authUser = await encontrarAuthPorEmail(email);
      }

      if (!authUser) {
        // Usuário legado só em tab_usuarios — cria o Auth para liberar o login.
        if (!senha) return json(res, 400, { error: "Informe a senha para criar o login deste usuário." });
        const criado = await authAdmin("/admin/users", {
          method: "POST",
          body: {
            email,
            password: senha,
            email_confirm: true,
            user_metadata: { nome, loja_id: lojaId },
          },
        });
        return json(res, 200, { ok: true, id: criado?.id || criado?.user?.id || null, criado: true });
      }

      const patch = {
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata || {}), nome, loja_id: lojaId ?? authUser.user_metadata?.loja_id },
      };
      if (senha) patch.password = senha;
      if (email && email !== (authUser.email || "").toLowerCase()) patch.email = email;

      await authAdmin(`/admin/users/${authUser.id}`, { method: "PUT", body: patch });
      return json(res, 200, { ok: true, id: authUser.id });
    }

    // excluir
    const rowApp = await restSelectUsuarioPorEmail(email);
    if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
      return json(res, 403, { error: "Só é possível excluir usuários da sua empresa." });
    }
    const authUser = await encontrarAuthPorEmail(email);
    if (authUser) {
      await authAdmin(`/admin/users/${authUser.id}`, { method: "DELETE" });
    }
    return json(res, 200, { ok: true, removido: !!authUser });
  } catch (e) {
    console.error("[gerenciar-usuario-auth]", e);
    return json(res, e.status && e.status < 500 ? e.status : 500, {
      error: e.message || "Falha ao sincronizar login no Auth.",
    });
  }
}
