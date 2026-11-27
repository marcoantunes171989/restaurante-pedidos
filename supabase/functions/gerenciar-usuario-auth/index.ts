// ════════════════════════════════════════════════════════════
//  Edge Function: gerenciar-usuario-auth
//  Espelho da Vercel Function /api/gerenciar-usuario-auth.
//  Usa SERVICE_ROLE para criar/atualizar/excluir no Auth E em
//  tab_usuarios quando o admin cadastra no app.
//
//  Deploy (opcional se a rota Vercel já estiver ativa com a env):
//    supabase functions deploy gerenciar-usuario-auth
// ════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENHA_MIN = 6;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Perfis administrativos (gerenciam usuários da própria loja) — mesmo conjunto
// da leitura (app_listar_usuarios/095) e da Vercel Function.
const PERFIS_ADMIN = new Set([
  "admin", "administrador", "admin geral", "administrador geral",
  "gestor", "gerente",
]);
const ehPerfilAdmin = (p: unknown) => PERFIS_ADMIN.has(String(p ?? "").trim().toLowerCase());

// No `ilike`, `_` também é curinga: a linha só vale se o e-mail for exatamente o pedido.
// deno-lint-ignore no-explicit-any
async function usuarioPorEmail(email: string, colunas: string): Promise<any> {
  const alvo = email.trim().toLowerCase();
  if (!alvo) return null;
  const { data, error } = await admin.from("tab_usuarios").select(colunas).ilike("email", alvo);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return ((data || []) as any[]).find((r) => String(r.email || "").trim().toLowerCase() === alvo) || null;
}

async function operadorDoToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const u = await usuarioPorEmail(data.user.email, "id, email, loja_id, ativo, super_admin, ids_acesso, perfil");
  if (!u || u.ativo === false) return null;
  const ids = Array.isArray(u.ids_acesso) ? u.ids_acesso : [];
  // Admin por super_admin OU ids_acesso 'admin' OU perfil administrativo. O
  // isolamento por loja é garantido depois em podeGerenciarLoja.
  if (!u.super_admin && !ids.includes("admin") && !ehPerfilAdmin(u.perfil)) return null;
  return { email: data.user.email, lojaId: u.loja_id ?? null, superAdmin: !!u.super_admin };
}

async function encontrarAuthPorEmail(email: string) {
  const alvo = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => (u.email || "").toLowerCase() === alvo);
    if (hit) return hit;
    if (!data?.users?.length || data.users.length < 200) return null;
    page += 1;
    if (page > 50) return null;
  }
}

function podeGerenciarLoja(operador: { superAdmin: boolean; lojaId: unknown }, lojaIdAlvo: unknown) {
  if (operador.superAdmin) return true;
  if (lojaIdAlvo == null || lojaIdAlvo === "") return false;
  return String(operador.lojaId) === String(lojaIdAlvo);
}

const RECUSA_OUTRA_EMPRESA: Record<string, string> = {
  criar: "Só é possível cadastrar usuários da sua empresa.",
  atualizar: "Só é possível editar usuários da sua empresa.",
  excluir: "Só é possível excluir usuários da sua empresa.",
};

// Quem não é administrador geral só mexe em acessos da própria empresa. Confere a
// empresa pedida e cada conta que o pedido alcança (e-mail atual e e-mail novo).
// Mesma regra da rota Vercel. Devolve a recusa ou null.
async function recusaAoOperadorDeLoja(
  operador: { superAdmin: boolean; lojaId: unknown },
  p: { acao: string; lojaId: unknown; emails: string[] },
) {
  if (operador.superAdmin) return null;
  const outraEmpresa = RECUSA_OUTRA_EMPRESA[p.acao];
  if (p.lojaId != null && !podeGerenciarLoja(operador, p.lojaId)) return outraEmpresa;
  const alvos = [];
  for (const e of new Set(p.emails.filter((v) => v.includes("@")))) {
    const linha = await usuarioPorEmail(e, "email, loja_id, super_admin");
    if (linha) alvos.push(linha);
    else if (await encontrarAuthPorEmail(e)) {
      return "Só é possível usar um e-mail sem acesso anterior ou de um usuário da sua empresa. Fale com o administrador geral.";
    }
  }
  if (alvos.some((u) => !podeGerenciarLoja(operador, u.loja_id))) return outraEmpresa;
  if (alvos.some((u) => u.super_admin)) {
    return "Só é possível alterar um administrador geral com acesso de administrador geral.";
  }
  return null;
}

// Fase 1 (gate R0H-C5C10D3): allowlist de colunas seguras — mesma allowlist
// da rota Vercel (api/gerenciar-usuario-auth.js). NUNCA inclui senha nem
// senha_hash — evita que um `.select()` sem lista de colunas devolva a
// credencial ao chamador.
const COLS_USUARIO_SEGURAS =
  "id,email,loja_id,ativo,super_admin,ids_acesso,nome,perfil,cargo_id,permissoes_acoes";

// Fase 1: NUNCA grava `senha` (texto claro) em tab_usuarios — a coluna foi
// neutralizada (NULL) pela migration 112 e deve permanecer assim. A
// credencial só é gravada como hash, via definirSenhaHash() (RPC existente
// app_definir_senha_hash) — nenhum mecanismo criptográfico novo é criado
// aqui, e o hash nunca é gerado no browser.
function montarRowApp(p: {
  email: string; nome: string; lojaId: unknown;
  perfil: string; cargoId: unknown; ativo: boolean; idsAcesso: unknown[];
}) {
  const row: Record<string, unknown> = {
    email: p.email,
    nome: p.nome || p.email,
    perfil: p.perfil || "Operador",
    ativo: p.ativo !== false,
    ids_acesso: Array.isArray(p.idsAcesso) ? p.idsAcesso : [],
  };
  if (p.lojaId != null && p.lojaId !== "") row.loja_id = p.lojaId;
  if (p.cargoId != null && p.cargoId !== "") row.cargo_id = Number(p.cargoId);
  return row;
}

// Fase 1: grava a senha SOMENTE como hash (bcrypt), via a mesma RPC
// service-role já usada pela rota Vercel (app_definir_senha_hash, migration
// 112). Nunca escreve texto claro; nunca retorna o hash.
async function definirSenhaHash(id: number | string, senha: string) {
  if (id == null || !senha) return;
  const { data, error } = await admin.rpc("app_definir_senha_hash", {
    p_id: Number(id),
    p_senha: senha,
  });
  if (error) throw error;
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error(`Falha ao gravar a credencial (hash): ${(data as { code?: string }).code || "erro"}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const operador = await operadorDoToken(req);
    if (!operador) return json({ error: "Sem permissão para gerenciar usuários de login." }, 401);

    const body = await req.json();
    const acao = String(body?.acao || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const emailAnterior = String(body?.emailAnterior || "").trim().toLowerCase();
    const senha = body?.senha != null ? String(body.senha) : "";
    const nome = String(body?.nome || "").trim();
    const lojaId = body?.lojaId != null && body.lojaId !== "" ? body.lojaId : null;
    const perfil = body?.perfil != null ? String(body.perfil) : "Operador";
    const cargoId = body?.cargoId != null && body.cargoId !== "" ? body.cargoId : null;
    const ativo = body?.ativo !== false;
    const idsAcesso = Array.isArray(body?.idsAcesso) ? body.idsAcesso : [];
    const persistirPerfil = body?.persistirPerfil !== false;

    if (!["criar", "atualizar", "excluir"].includes(acao)) return json({ error: "Ação inválida." }, 400);
    if (!email || !email.includes("@")) return json({ error: "E-mail inválido." }, 400);
    // Curingas de busca não fazem parte de um e-mail válido aqui.
    if ([email, emailAnterior].some((e) => /[%*\\]/.test(e))) return json({ error: "E-mail inválido." }, 400);

    const recusa = await recusaAoOperadorDeLoja(operador, { acao, lojaId, emails: [email, emailAnterior] });
    if (recusa) return json({ error: recusa }, 403);

    if (acao === "criar") {
      if (!podeGerenciarLoja(operador, lojaId)) {
        return json({ error: "Só é possível cadastrar usuários da sua empresa." }, 403);
      }
      if (!senha || senha.length < SENHA_MIN) {
        return json({ error: `Senha deve ter no mínimo ${SENHA_MIN} caracteres (exigência do login).` }, 400);
      }
      let authId: string | null = null;
      const existente = await encontrarAuthPorEmail(email);
      if (existente) {
        const { error } = await admin.auth.admin.updateUserById(existente.id, {
          password: senha,
          email_confirm: true,
          user_metadata: { ...(existente.user_metadata || {}), nome, loja_id: lojaId },
        });
        if (error) throw error;
        authId = existente.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome, loja_id: lojaId },
        });
        if (error) throw error;
        authId = data.user?.id ?? null;
      }

      let usuario = null;
      if (persistirPerfil) {
        const { data, error } = await admin.from("tab_usuarios").upsert(
          montarRowApp({ email, nome, lojaId, perfil, cargoId, ativo, idsAcesso }),
          { onConflict: "email" },
        ).select(COLS_USUARIO_SEGURAS).single();
        if (error) throw error;
        usuario = data;
        // Credencial → apenas hash (bcrypt), nunca texto claro.
        if (usuario?.id && senha) await definirSenhaHash(usuario.id, senha);
      }
      return json({ ok: true, id: authId, atualizado: !!existente, usuario });
    }

    if (acao === "atualizar") {
      const emailBusca = emailAnterior || email;
      const rowApp = await usuarioPorEmail(emailBusca, "id, email, loja_id, nome, perfil, cargo_id, ids_acesso");
      if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
        return json({ error: "Só é possível editar usuários da sua empresa." }, 403);
      }
      const lojaEfetiva = lojaId != null ? lojaId : (rowApp?.loja_id ?? null);
      if (lojaEfetiva != null && !podeGerenciarLoja(operador, lojaEfetiva)) {
        return json({ error: "Só é possível editar usuários da sua empresa." }, 403);
      }
      if (senha && senha.length < SENHA_MIN) {
        return json({ error: `Senha deve ter no mínimo ${SENHA_MIN} caracteres (exigência do login).` }, 400);
      }

      let authUser = await encontrarAuthPorEmail(emailBusca);
      if (!authUser && email !== emailBusca) authUser = await encontrarAuthPorEmail(email);

      let authId: string | null = null;
      if (!authUser) {
        if (!senha) return json({ error: "Informe a senha para criar o login deste usuário." }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome, loja_id: lojaEfetiva },
        });
        if (error) throw error;
        authId = data.user?.id ?? null;
      } else {
        const patch: Record<string, unknown> = {
          email_confirm: true,
          user_metadata: { ...(authUser.user_metadata || {}), nome, loja_id: lojaEfetiva ?? authUser.user_metadata?.loja_id },
        };
        if (senha) patch.password = senha;
        if (email && email !== (authUser.email || "").toLowerCase()) patch.email = email;
        const { error } = await admin.auth.admin.updateUserById(authUser.id, patch);
        if (error) throw error;
        authId = authUser.id;
      }

      let usuario = null;
      if (persistirPerfil) {
        const campos = montarRowApp({
          email,
          nome: nome || rowApp?.nome || email,
          lojaId: lojaEfetiva,
          perfil: body?.perfil != null ? perfil : (rowApp?.perfil || perfil),
          cargoId: cargoId != null ? cargoId : rowApp?.cargo_id,
          ativo,
          idsAcesso: Array.isArray(body?.idsAcesso) ? idsAcesso : (rowApp?.ids_acesso || []),
        });
        if (rowApp?.id) {
          const { data, error } = await admin.from("tab_usuarios").update(campos).eq("id", rowApp.id)
            .select(COLS_USUARIO_SEGURAS).single();
          if (error) throw error;
          usuario = data;
        } else {
          if (!senha) return json({ error: "Informe a senha para criar o registro do usuário no banco." }, 400);
          const { data, error } = await admin.from("tab_usuarios").upsert(campos, { onConflict: "email" })
            .select(COLS_USUARIO_SEGURAS).single();
          if (error) throw error;
          usuario = data;
        }
        // Credencial (se enviada) → apenas hash (bcrypt), nunca texto claro.
        if (senha && usuario?.id) await definirSenhaHash(usuario.id, senha);
      }
      return json({ ok: true, id: authId, usuario });
    }

    const rowApp = await usuarioPorEmail(email, "id, email, loja_id");
    if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
      return json({ error: "Só é possível excluir usuários da sua empresa." }, 403);
    }
    const authUser = await encontrarAuthPorEmail(email);
    if (authUser) {
      const { error } = await admin.auth.admin.deleteUser(authUser.id);
      if (error) throw error;
    }
    if (persistirPerfil && rowApp) {
      const { error } = await admin.from("tab_usuarios").delete().eq("id", rowApp.id);
      if (error) throw error;
    }
    return json({ ok: true, removido: !!authUser, perfilRemovido: persistirPerfil });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao sincronizar login no Auth.";
    console.error("[gerenciar-usuario-auth]", msg);
    return json({ error: msg }, 500);
  }
});
