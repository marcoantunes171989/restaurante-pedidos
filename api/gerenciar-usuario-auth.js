// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/gerenciar-usuario-auth
//  Cria / atualiza / exclui usuários no Supabase Auth (auth.users)
//  E na tabela tab_usuarios — para o login (AUTH_MODE=supabase) e o
//  cadastro no Admin ficarem consistentes com o banco real.
//
//  A SERVICE ROLE KEY fica SÓ no servidor (env na Vercel), nunca no front.
//  Vercel → Settings → Environment Variables →
//    SUPABASE_SERVICE_ROLE_KEY = <service_role do projeto>
//  (Production + Preview) → Redeploy.
//
//  Segurança: exige JWT válido + usuário ativo com acesso "admin"
//  (ou super_admin). Operador de loja só gerencia a própria loja.
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

async function rest(path, { method = "GET", body, prefer } = {}) {
  const key = serviceKey();
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
    "content-type": "application/json",
  };
  if (prefer) headers.prefer = prefer;
  const r = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await r.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!r.ok) {
    const msg = data?.message || data?.error || data?.hint || `REST HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
}

function filtroEmail(email) {
  // ilike sem wildcard = match case-insensitive (e-mails legados com casing misto).
  return `email=ilike.${encodeURIComponent(String(email || "").trim().toLowerCase())}`;
}

async function restSelectUsuarioPorEmail(email) {
  const rows = await rest(
    `/tab_usuarios?${filtroEmail(email)}&select=id,email,loja_id,ativo,super_admin,ids_acesso,nome,perfil,cargo_id`,
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function upsertTabUsuario(row) {
  const rows = await rest("/tab_usuarios?on_conflict=email&select=*", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [row],
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateTabUsuarioPorId(id, campos) {
  const rows = await rest(`/tab_usuarios?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: campos,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function deleteTabUsuarioPorEmail(email) {
  await rest(`/tab_usuarios?${filtroEmail(email)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
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
  // Filtro direto (GoTrue) — evita paginar todos os usuários.
  try {
    const data = await authAdmin(`/admin/users?email=${encodeURIComponent(alvo)}`);
    const users = data?.users || (data?.id ? [data] : []);
    const hit = users.find((u) => (u.email || "").toLowerCase() === alvo);
    if (hit) return hit;
  } catch { /* fallback paginado */ }
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

// Fase 7.2.1: NUNCA grava `senha` (texto claro) no tab_usuarios. A credencial
// vai só para senha_hash, via a RPC app_definir_senha_hash (ver definirSenhaHash).
function montarRowApp({ email, nome, lojaId, perfil, cargoId, ativo, idsAcesso, permissoesAcoes }) {
  const row = {
    email: email != null ? String(email).trim().toLowerCase() : undefined,
    nome: nome != null ? (String(nome).trim() || undefined) : undefined,
    perfil: perfil != null ? (String(perfil).trim() || "Operador") : undefined,
    ativo: typeof ativo === "boolean" ? ativo : undefined,
    ids_acesso: Array.isArray(idsAcesso) ? idsAcesso : undefined,
    permissoes_acoes: permissoesAcoes != null && typeof permissoesAcoes === "object" ? permissoesAcoes : undefined,
  };
  if (lojaId != null && lojaId !== "") row.loja_id = lojaId;
  if (cargoId != null && cargoId !== "") row.cargo_id = Number(cargoId);
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

// Fase 7.2.1: grava a senha SOMENTE como hash (bcrypt), via RPC service-role.
// Nunca escreve texto claro no banco. Lança se falhar (o login depende do hash).
async function definirSenhaHash(id, senha) {
  if (id == null || senha == null || String(senha) === "") return;
  const out = await rest("/rpc/app_definir_senha_hash", {
    method: "POST",
    body: { p_id: Number(id), p_senha: String(senha) },
  });
  if (out && out.ok === false) {
    throw new Error(`Falha ao gravar a credencial (hash): ${out.code || "erro"}`);
  }
}

async function restSelectUsuarioPorId(id) {
  if (id == null || id === "") return null;
  const rows = await rest(
    `/tab_usuarios?id=eq.${encodeURIComponent(id)}&select=id,email,loja_id,ativo,super_admin,ids_acesso,nome,perfil,cargo_id,permissoes_acoes`,
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
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
    const perfil = body.perfil != null ? String(body.perfil) : "Operador";
    const cargoId = body.cargoId != null && body.cargoId !== "" ? body.cargoId : null;
    const ativo = typeof body.ativo === "boolean" ? body.ativo : undefined;
    const idsAcesso = Array.isArray(body.idsAcesso) ? body.idsAcesso : undefined;
    const permissoesAcoes = body.permissoesAcoes != null && typeof body.permissoesAcoes === "object"
      ? body.permissoesAcoes
      : undefined;
    const usuarioId = body.usuarioId != null && body.usuarioId !== "" ? body.usuarioId : null;
    // persistirPerfil=false → só Auth (compat); padrão true grava tab_usuarios.
    const persistirPerfil = body.persistirPerfil !== false;

    if (!["criar", "atualizar", "excluir", "perfil"].includes(acao)) {
      return json(res, 400, { error: "Ação inválida." });
    }
    // "perfil" pode vir só com usuarioId (ex.: só ids_acesso / ativo).
    if (acao !== "perfil" && (!email || !email.includes("@"))) {
      return json(res, 400, { error: "E-mail inválido." });
    }

    if (acao === "criar") {
      if (!podeGerenciarLoja(operador, lojaId)) {
        return json(res, 403, { error: "Só é possível cadastrar usuários da sua empresa." });
      }
      const errSenha = validarSenha(senha);
      if (errSenha) return json(res, 400, { error: errSenha });

      let authId = null;
      const existente = await encontrarAuthPorEmail(email);
      if (existente) {
        await authAdmin(`/admin/users/${existente.id}`, {
          method: "PUT",
          body: {
            password: senha,
            email_confirm: true,
            user_metadata: { ...(existente.user_metadata || {}), nome, loja_id: lojaId },
          },
        });
        authId = existente.id;
      } else {
        const criado = await authAdmin("/admin/users", {
          method: "POST",
          body: {
            email,
            password: senha,
            email_confirm: true,
            user_metadata: { nome, loja_id: lojaId },
          },
        });
        authId = criado?.id || criado?.user?.id || null;
      }

      let usuario = null;
      if (persistirPerfil) {
        usuario = await upsertTabUsuario(montarRowApp({
          email, senha, nome, lojaId, perfil, cargoId,
          ativo: ativo !== false,
          idsAcesso: Array.isArray(idsAcesso) ? idsAcesso : [],
          permissoesAcoes: permissoesAcoes || {},
        }));
        // Credencial → apenas hash (bcrypt), nunca texto claro.
        if (usuario?.id) await definirSenhaHash(usuario.id, senha);
      }
      return json(res, 200, { ok: true, id: authId, atualizado: !!existente, usuario });
    }

    // Atualiza só tab_usuarios (cadastro / permissões / ativo) — senha opcional.
    if (acao === "perfil") {
      const rowApp = usuarioId
        ? await restSelectUsuarioPorId(usuarioId)
        : await restSelectUsuarioPorEmail(emailAnterior || email);
      if (!rowApp) return json(res, 404, { error: "Usuário não encontrado no banco." });
      if (!podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
        return json(res, 403, { error: "Só é possível editar usuários da sua empresa." });
      }
      if (senha) {
        const errSenha = validarSenha(senha);
        if (errSenha) return json(res, 400, { error: errSenha });
      }
      const emailNovo = email && email.includes("@") ? email : rowApp.email;
      const campos = montarRowApp({
        email: emailNovo,
        nome: nome || undefined,
        lojaId: lojaId != null ? lojaId : undefined,
        perfil: body.perfil != null ? perfil : undefined,
        cargoId: cargoId != null ? cargoId : undefined,
        ativo,
        idsAcesso,
        permissoesAcoes,
      });
      if (!Object.keys(campos).length) {
        return json(res, 400, { error: "Nenhum campo para atualizar." });
      }
      let usuario;
      try {
        usuario = await updateTabUsuarioPorId(rowApp.id, campos);
      } catch (e) {
        // Coluna permissoes_acoes pode não existir ainda.
        if (campos.permissoes_acoes != null && /permissoes_acoes|column/i.test(String(e.message || ""))) {
          const { permissoes_acoes, ...rest } = campos;
          usuario = await updateTabUsuarioPorId(rowApp.id, rest);
        } else {
          throw e;
        }
      }
      // Credencial (se enviada) → apenas hash (bcrypt), nunca texto claro.
      if (senha && (usuario?.id || rowApp?.id)) await definirSenhaHash(usuario?.id ?? rowApp.id, senha);
      // Alinha Auth se senha/e-mail/nome mudaram (best-effort).
      if (senha || (emailNovo && emailNovo !== String(rowApp.email || "").toLowerCase()) || nome) {
        try {
          let authUser = await encontrarAuthPorEmail(rowApp.email);
          if (!authUser && emailNovo !== rowApp.email) authUser = await encontrarAuthPorEmail(emailNovo);
          if (authUser?.id) {
            const patch = {
              email_confirm: true,
              user_metadata: {
                ...(authUser.user_metadata || {}),
                nome: nome || rowApp.nome,
                loja_id: rowApp.loja_id,
              },
            };
            if (senha) patch.password = senha;
            if (emailNovo && emailNovo !== String(authUser.email || "").toLowerCase()) patch.email = emailNovo;
            await authAdmin(`/admin/users/${authUser.id}`, { method: "PUT", body: patch });
          } else if (senha) {
            await authAdmin("/admin/users", {
              method: "POST",
              body: {
                email: emailNovo,
                password: senha,
                email_confirm: true,
                user_metadata: { nome: nome || rowApp.nome, loja_id: rowApp.loja_id },
              },
            });
          }
        } catch (e) {
          console.warn("[gerenciar-usuario-auth] Auth best-effort (perfil):", e?.message || e);
        }
      }
      return json(res, 200, { ok: true, usuario });
    }

    if (acao === "atualizar") {
      const emailBusca = emailAnterior || email;
      const rowApp = await restSelectUsuarioPorEmail(emailBusca);
      if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
        return json(res, 403, { error: "Só é possível editar usuários da sua empresa." });
      }
      const lojaEfetiva = lojaId != null ? lojaId : (rowApp?.loja_id ?? null);
      if (lojaEfetiva != null && !podeGerenciarLoja(operador, lojaEfetiva)) {
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

      let authId = null;
      if (!authUser) {
        if (!senha) return json(res, 400, { error: "Informe a senha para criar o login deste usuário." });
        const criado = await authAdmin("/admin/users", {
          method: "POST",
          body: {
            email,
            password: senha,
            email_confirm: true,
            user_metadata: { nome, loja_id: lojaEfetiva },
          },
        });
        authId = criado?.id || criado?.user?.id || null;
      } else {
        const patch = {
          email_confirm: true,
          user_metadata: {
            ...(authUser.user_metadata || {}),
            nome,
            loja_id: lojaEfetiva ?? authUser.user_metadata?.loja_id,
          },
        };
        if (senha) patch.password = senha;
        if (email && email !== (authUser.email || "").toLowerCase()) patch.email = email;
        await authAdmin(`/admin/users/${authUser.id}`, { method: "PUT", body: patch });
        authId = authUser.id;
      }

      let usuario = null;
      if (persistirPerfil) {
        const campos = montarRowApp({
          email,
          nome: nome || rowApp?.nome,
          lojaId: lojaEfetiva,
          perfil: body.perfil != null ? perfil : (rowApp?.perfil || perfil),
          cargoId: cargoId != null ? cargoId : rowApp?.cargo_id,
          ativo: typeof ativo === "boolean" ? ativo : (rowApp?.ativo !== false),
          idsAcesso: Array.isArray(idsAcesso) ? idsAcesso : (rowApp?.ids_acesso || []),
          permissoesAcoes: permissoesAcoes != null ? permissoesAcoes : undefined,
        });
        if (rowApp?.id) {
          try {
            usuario = await updateTabUsuarioPorId(rowApp.id, campos);
          } catch (e) {
            if (campos.permissoes_acoes != null && /permissoes_acoes|column/i.test(String(e.message || ""))) {
              const { permissoes_acoes, ...rest } = campos;
              usuario = await updateTabUsuarioPorId(rowApp.id, rest);
            } else throw e;
          }
        } else {
          if (!senha) {
            return json(res, 400, { error: "Informe a senha para criar o registro do usuário no banco." });
          }
          usuario = await upsertTabUsuario(campos);
        }
        // Credencial (se enviada) → apenas hash (bcrypt), nunca texto claro.
        if (senha && usuario?.id) await definirSenhaHash(usuario.id, senha);
      }
      return json(res, 200, { ok: true, id: authId, usuario });
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
    if (persistirPerfil) {
      await deleteTabUsuarioPorEmail(email);
    }
    return json(res, 200, { ok: true, removido: !!authUser, perfilRemovido: persistirPerfil });
  } catch (e) {
    console.error("[gerenciar-usuario-auth]", e);
    return json(res, e.status && e.status < 500 ? e.status : 500, {
      error: e.message || "Falha ao sincronizar login no Auth.",
    });
  }
}
