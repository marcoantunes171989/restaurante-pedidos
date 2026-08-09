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

async function operadorDoToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const { data: u } = await admin
    .from("tab_usuarios")
    .select("id, email, loja_id, ativo, super_admin, ids_acesso")
    .ilike("email", data.user.email)
    .maybeSingle();
  if (!u || u.ativo === false) return null;
  const ids = Array.isArray(u.ids_acesso) ? u.ids_acesso : [];
  if (!u.super_admin && !ids.includes("admin")) return null;
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

function montarRowApp(p: {
  email: string; senha?: string; nome: string; lojaId: unknown;
  perfil: string; cargoId: unknown; ativo: boolean; idsAcesso: unknown[];
}) {
  const row: Record<string, unknown> = {
    email: p.email,
    nome: p.nome || p.email,
    perfil: p.perfil || "Operador",
    ativo: p.ativo !== false,
    ids_acesso: Array.isArray(p.idsAcesso) ? p.idsAcesso : [],
  };
  if (p.senha != null && p.senha !== "") row.senha = p.senha;
  if (p.lojaId != null && p.lojaId !== "") row.loja_id = p.lojaId;
  if (p.cargoId != null && p.cargoId !== "") row.cargo_id = Number(p.cargoId);
  return row;
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
          montarRowApp({ email, senha, nome, lojaId, perfil, cargoId, ativo, idsAcesso }),
          { onConflict: "email" },
        ).select().single();
        if (error) throw error;
        usuario = data;
      }
      return json({ ok: true, id: authId, atualizado: !!existente, usuario });
    }

    if (acao === "atualizar") {
      const emailBusca = emailAnterior || email;
      const { data: rowApp } = await admin.from("tab_usuarios")
        .select("id, loja_id, nome, perfil, cargo_id, ids_acesso")
        .ilike("email", emailBusca).maybeSingle();
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
          senha: senha || undefined,
          nome: nome || rowApp?.nome || email,
          lojaId: lojaEfetiva,
          perfil: body?.perfil != null ? perfil : (rowApp?.perfil || perfil),
          cargoId: cargoId != null ? cargoId : rowApp?.cargo_id,
          ativo,
          idsAcesso: Array.isArray(body?.idsAcesso) ? idsAcesso : (rowApp?.ids_acesso || []),
        });
        if (rowApp?.id) {
          const { data, error } = await admin.from("tab_usuarios").update(campos).eq("id", rowApp.id).select().single();
          if (error) throw error;
          usuario = data;
        } else {
          if (!senha) return json({ error: "Informe a senha para criar o registro do usuário no banco." }, 400);
          const { data, error } = await admin.from("tab_usuarios").upsert(campos, { onConflict: "email" }).select().single();
          if (error) throw error;
          usuario = data;
        }
      }
      return json({ ok: true, id: authId, usuario });
    }

    const { data: rowApp } = await admin.from("tab_usuarios").select("loja_id").ilike("email", email).maybeSingle();
    if (rowApp && !podeGerenciarLoja(operador, rowApp.loja_id) && !operador.superAdmin) {
      return json({ error: "Só é possível excluir usuários da sua empresa." }, 403);
    }
    const authUser = await encontrarAuthPorEmail(email);
    if (authUser) {
      const { error } = await admin.auth.admin.deleteUser(authUser.id);
      if (error) throw error;
    }
    if (persistirPerfil) {
      const { error } = await admin.from("tab_usuarios").delete().ilike("email", email);
      if (error) throw error;
    }
    return json({ ok: true, removido: !!authUser, perfilRemovido: persistirPerfil });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao sincronizar login no Auth.";
    console.error("[gerenciar-usuario-auth]", msg);
    return json({ error: msg }, 500);
  }
});
