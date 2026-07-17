// ════════════════════════════════════════════════════════════
//  Edge Function: notificacoes-push
//  Recebe o evento do trigger de tab_pedidos (novo pedido / entrou no
//  Caixa aguardando pagamento), decide os destinatários com a MESMA
//  regra de permissão operacional já usada no front (acessosOperacionais,
//  src/App.jsx), grava uma notificação por destinatário (idempotente via
//  ON CONFLICT) e envia Web Push (VAPID) para os dispositivos ativos de
//  cada um. Também atende o botão "Enviar notificação de teste".
//
//  Chamadores:
//    1) Trigger de tab_pedidos (pg_net, migration 064) — autentica com
//       o header x-webhook-secret (guardado no Vault, nunca no front).
//    2) Frontend, só para teste — autentica com o JWT normal do usuário
//       (supabase.functions.invoke já manda o Authorization automático).
//
//  Deploy (uma vez):
//    supabase functions deploy notificacoes-push --no-verify-jwt
//    supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
//  (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados automaticamente
//  pelo runtime — não precisam ser cadastrados manualmente.)
// ════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@pedidoprime.com.br";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Cliente com service role — só usado NESTA função (nunca no frontend).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Mesma derivação de acesso operacional do front (acessosOperacionais,
//    src/App.jsx) — replicada aqui porque a Edge Function decide os
//    destinatários no servidor, sem confiar em nada vindo do cliente. ──
const OP_MODULOS = ["op_pedidos", "op_cozinha", "op_bar", "op_caixa"] as const;
function acessosOperacionais(idsAcesso: string[] | null | undefined, superAdmin: boolean) {
  const ids = idsAcesso || [];
  const has = (id: string) => ids.includes(id);
  const total = !!superAdmin || has("admin") || OP_MODULOS.every(has);
  if (total) return { pedidos: true, cozinha: true, bar: true, caixa: true };
  const temOpEspecifico = has("op_managed") || OP_MODULOS.some(has);
  if (temOpEspecifico) return { pedidos: has("op_pedidos"), cozinha: has("op_cozinha"), bar: has("op_bar"), caixa: has("op_caixa") };
  // Legado: quem tinha "kitchen" via Pedidos/Cozinha/Bar; "cashier" via Caixa.
  return { pedidos: has("kitchen"), cozinha: has("kitchen"), bar: has("kitchen"), caixa: has("cashier") };
}

async function validarWebhook(req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-webhook-secret");
  if (!recebido) return false;
  const { data } = await admin.schema("vault").from("decrypted_secrets").select("decrypted_secret").eq("name", "notif_webhook_secret").maybeSingle();
  const esperado = (data as { decrypted_secret?: string } | null)?.decrypted_secret;
  return !!esperado && esperado === recebido;
}

// Usuário dono do JWT recebido (para o botão "Enviar notificação de teste").
async function usuarioDoToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const { data: u } = await admin.from("tab_usuarios").select("id, loja_id, ativo").eq("email", data.user.email).maybeSingle();
  return u && u.ativo ? u : null;
}

// "Pedido #N" — Nº sequencial do pedido NO DIA (mesma lógica do front,
// src/App.jsx `numeroPedido`), calculado no fuso America/Sao_Paulo (não
// dá para replicar 100% o fuso do navegador de cada admin; aproximação
// aceitável só para o texto da notificação, não afeta nenhuma regra).
async function numeroDoPedidoNoDia(lojaId: number, criadoEm: string): Promise<number> {
  const { count } = await admin
    .from("tab_pedidos")
    .select("id", { count: "exact", head: true })
    .eq("loja_id", lojaId)
    .gte("criado_em", diaInicioSp(criadoEm))
    .lte("criado_em", criadoEm);
  return count || 1;
}
function diaInicioSp(isoDate: string): string {
  const d = new Date(isoDate);
  // America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019).
  const spOffsetMs = 3 * 60 * 60 * 1000;
  const localMidnight = new Date(d.getTime() - spOffsetMs);
  localMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(localMidnight.getTime() + spOffsetMs).toISOString();
}

async function enviarWebPushPara(usuarioId: number, payload: Record<string, unknown>) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { enviados: 0, motivo: "VAPID não configurada" };
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: subs } = await admin
    .from("tab_push_subscriptions")
    .select("id, endpoint, p256dh, auth_chave")
    .eq("usuario_id", usuarioId)
    .eq("ativo", true);

  let enviados = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_chave } },
        JSON.stringify(payload),
      );
      enviados++;
      await admin.from("tab_push_subscriptions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      // 404/410 = assinatura expirada/removida no navegador → desativa,
      // nunca tenta de novo (evita acumular erro a cada evento futuro).
      if (status === 404 || status === 410) {
        await admin.from("tab_push_subscriptions").update({ ativo: false }).eq("id", s.id);
      }
    }
  }
  return { enviados, total: subs?.length || 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();

    // ── Chamada de teste (usuário testando o próprio dispositivo) ──
    if (body?.teste === true) {
      const u = await usuarioDoToken(req);
      if (!u) return json({ error: "Não autenticado." }, 401);
      const resultado = await enviarWebPushPara(u.id, {
        title: "Pedido Prime",
        body: "Notificação de teste — se você está vendo isso, está tudo funcionando.",
        tag: `teste:${Date.now()}`,
        data: { tipo: "teste", rota: "/operacional" },
      });
      return json({ ok: true, ...resultado });
    }

    // ── Chamada do trigger (novo pedido / caixa aguardando) ──
    const autorizado = await validarWebhook(req);
    if (!autorizado) return json({ error: "Não autorizado." }, 401);

    const { evento, pedido_id: pedidoId, loja_id: lojaId, new_record: novo } = body || {};
    if (!evento || !pedidoId || !lojaId) return json({ ok: true, ignorado: "payload incompleto" });

    // Recarrega os usuários ativos da loja e filtra por permissão real.
    const { data: usuarios } = await admin
      .from("tab_usuarios")
      .select("id, ids_acesso, super_admin, ativo")
      .eq("loja_id", lojaId)
      .eq("ativo", true);

    const destinatarios = (usuarios || []).filter((u) => {
      const p = acessosOperacionais(u.ids_acesso, !!u.super_admin);
      return evento === "caixa_aguardando" ? p.caixa : (p.pedidos || p.cozinha || p.bar || p.caixa);
    });
    if (destinatarios.length === 0) return json({ ok: true, destinatarios: 0 });

    const numero = novo?.criado_em ? await numeroDoPedidoNoDia(lojaId, novo.criado_em) : "";
    const eventId = `${evento}:${pedidoId}`;
    const rota = evento === "caixa_aguardando" ? `/operacional/caixa?destacar=${encodeURIComponent(pedidoId)}` : `/operacional/pedidos?destacar=${encodeURIComponent(pedidoId)}`;
    const titulo = evento === "caixa_aguardando" ? "Pagamento aguardando" : "Novo pedido recebido";
    const corpo = evento === "caixa_aguardando" ? `Pedido #${numero} foi enviado para o Caixa` : `Pedido #${numero} aguardando atendimento`;

    // Preferências por usuário (linha ausente = tudo ligado por padrão).
    const { data: prefsRows } = await admin
      .from("tab_notificacao_prefs")
      .select("usuario_id, push_ativo, alerta_novo_pedido, alerta_caixa")
      .in("usuario_id", destinatarios.map((d) => d.id));
    const prefsPorUsuario = new Map((prefsRows || []).map((p) => [p.usuario_id, p]));

    const elegiveis = destinatarios.filter((d) => {
      const p = prefsPorUsuario.get(d.id);
      if (!p) return true; // sem preferência salva ainda → padrão ligado
      if (p.push_ativo === false) return false;
      return evento === "caixa_aguardando" ? p.alerta_caixa !== false : p.alerta_novo_pedido !== false;
    });
    if (elegiveis.length === 0) return json({ ok: true, destinatarios: destinatarios.length, elegiveis: 0 });

    // Insere 1 notificação por destinatário — ON CONFLICT (event_id,
    // usuario_id) DO NOTHING garante idempotência mesmo se o pg_net
    // reenviar o mesmo webhook (retry de rede). .select() só retorna as
    // linhas REALMENTE inseridas agora — só para essas envia push.
    const linhas = elegiveis.map((d) => ({
      loja_id: lojaId, usuario_id: d.id, event_id: eventId, tipo: evento,
      pedido_id: pedidoId, titulo, corpo, rota,
    }));
    const { data: inseridas, error: insErr } = await admin
      .from("tab_notificacoes")
      .upsert(linhas, { onConflict: "event_id,usuario_id", ignoreDuplicates: true })
      .select("usuario_id");
    if (insErr) return json({ error: insErr.message }, 500);

    let totalPush = 0;
    for (const row of inseridas || []) {
      const r = await enviarWebPushPara(row.usuario_id, { title: titulo, body: corpo, tag: eventId, data: { tipo: evento, pedidoId, rota, eventId } });
      totalPush += r.enviados || 0;
    }

    return json({ ok: true, destinatarios: destinatarios.length, notificacoesCriadas: inseridas?.length || 0, pushEnviados: totalPush });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
