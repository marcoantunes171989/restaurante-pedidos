-- ════════════════════════════════════════════════════════════
--  064 — Notificações push operacionais (Web Push + VAPID)
--  ADITIVO: cria 3 tabelas novas + 1 função helper + triggers.
--  Não altera tabelas existentes, não altera o hook de auth
--  (migration 047) nem as policies já aplicadas (048/049).
--
--  Pré-requisitos assumidos (já existentes neste projeto):
--    • AUTH_MODE = 'supabase' ativo (login via Supabase Auth)
--    • public.app_loja_id() / public.app_is_super() (migration 047)
--    • extensões pg_net e supabase_vault disponíveis (Database → Extensions)
--
--  Depois de aplicar esta migration:
--    1) supabase functions deploy notificacoes-push --no-verify-jwt
--    2) supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
--       (gere o par com: npx web-push generate-vapid-keys)
--    3) Configure VITE_VAPID_PUBLIC_KEY=<a mesma chave pública> nas env vars
--       do frontend (Vercel) — é uma chave PÚBLICA, segura de expor.
-- ════════════════════════════════════════════════════════════

-- ── Extensões necessárias para o trigger chamar a Edge Function ──
create extension if not exists pg_net with schema extensions;

-- ── Helper: resolve o id em tab_usuarios do usuário autenticado atual,
--    pelo e-mail do JWT (mesmo padrão de app_loja_id()/app_is_super(),
--    migration 047 — não duplica lógica, só resolve o "quem sou eu"
--    para as tabelas novas). Puramente aditivo, não mexe no hook. ──
create or replace function public.app_usuario_id()
returns bigint
language sql
stable
as $$
  select id from public.tab_usuarios
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1
$$;

-- ════════════════════════════════════════════════════════════
--  tab_push_subscriptions — uma linha por dispositivo/navegador
--  inscrito. usuario_id/loja_id vêm do JWT por padrão (o cliente
--  nunca precisa enviá-los, RLS + default cuidam disso).
-- ════════════════════════════════════════════════════════════
create table if not exists public.tab_push_subscriptions (
  id            bigint       primary key generated always as identity,
  usuario_id    bigint       not null default public.app_usuario_id() references public.tab_usuarios(id) on delete cascade,
  loja_id       bigint       not null default public.app_loja_id(),
  device_id     text,
  endpoint      text         not null unique,
  p256dh        text         not null,
  auth_chave    text         not null,
  plataforma    text,
  ativo         boolean      not null default true,
  criado_em     timestamptz  not null default now(),
  atualizado_em timestamptz  not null default now(),
  last_seen_at  timestamptz  not null default now()
);
create index if not exists idx_push_subs_usuario on public.tab_push_subscriptions (usuario_id, ativo);
create index if not exists idx_push_subs_loja    on public.tab_push_subscriptions (loja_id, ativo);

-- Reaproveita fn_atualizar_timestamp() (migration 001, já usada por
-- tab_produtos/tab_pedidos) em vez de criar uma função equivalente nova.
drop trigger if exists trg_push_subs_atualizado_em on public.tab_push_subscriptions;
create trigger trg_push_subs_atualizado_em
  before update on public.tab_push_subscriptions
  for each row execute function public.fn_atualizar_timestamp();

alter table public.tab_push_subscriptions enable row level security;
drop policy if exists "push_subs_dono" on public.tab_push_subscriptions;
create policy "push_subs_dono" on public.tab_push_subscriptions for all
  using (public.app_is_super() or usuario_id = public.app_usuario_id())
  with check (public.app_is_super() or usuario_id = public.app_usuario_id());

-- Service role (Edge Function) precisa ler/atualizar todas as assinaturas
-- para enviar push e desativar assinaturas expiradas — já tem bypass de
-- RLS nativo por padrão, este grant só documenta a intenção.
grant select, insert, update, delete on public.tab_push_subscriptions to service_role;

-- ════════════════════════════════════════════════════════════
--  tab_notificacoes — uma linha por (evento, destinatário). O
--  event_id identifica o EVENTO de origem (ex.: "pedido_criado:PED-123");
--  a dupla (event_id, usuario_id) é única → idempotência natural entre
--  Realtime e Push (ON CONFLICT DO NOTHING na Edge Function).
-- ════════════════════════════════════════════════════════════
create table if not exists public.tab_notificacoes (
  id          bigint       primary key generated always as identity,
  loja_id     bigint       not null,
  usuario_id  bigint       not null references public.tab_usuarios(id) on delete cascade,
  event_id    text         not null,
  tipo        text         not null check (tipo in ('novo_pedido', 'caixa_aguardando')),
  pedido_id   text,
  titulo      text         not null,
  corpo       text         not null,
  rota        text,
  lido_em     timestamptz,
  criado_em   timestamptz  not null default now(),
  unique (event_id, usuario_id)
);
create index if not exists idx_notificacoes_usuario on public.tab_notificacoes (usuario_id, criado_em desc);
create index if not exists idx_notificacoes_nao_lidas on public.tab_notificacoes (usuario_id) where lido_em is null;

alter table public.tab_notificacoes enable row level security;
-- Leitura e "marcar como lida": só o próprio destinatário (ou super admin).
-- INSERT fica só para service_role (a Edge Function decide destinatários
-- com regra de negócio no servidor — o cliente nunca cria notificação).
drop policy if exists "notificacoes_select_dono" on public.tab_notificacoes;
create policy "notificacoes_select_dono" on public.tab_notificacoes for select
  using (public.app_is_super() or usuario_id = public.app_usuario_id());
drop policy if exists "notificacoes_update_dono" on public.tab_notificacoes;
create policy "notificacoes_update_dono" on public.tab_notificacoes for update
  using (public.app_is_super() or usuario_id = public.app_usuario_id())
  with check (public.app_is_super() or usuario_id = public.app_usuario_id());
grant select, insert, update on public.tab_notificacoes to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_notificacoes') then
    alter publication supabase_realtime add table public.tab_notificacoes;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  tab_notificacao_prefs — preferências de CONTEÚDO por usuário
--  (aplicam-se a todos os dispositivos dele). O que é por-DISPOSITIVO
--  é o próprio registro em tab_push_subscriptions (campo "ativo" —
--  cada linha É um dispositivo, então desativar ali já é "por
--  dispositivo"; estas aqui são "quais tipos de alerta eu quero").
-- ════════════════════════════════════════════════════════════
create table if not exists public.tab_notificacao_prefs (
  usuario_id          bigint      primary key default public.app_usuario_id() references public.tab_usuarios(id) on delete cascade,
  loja_id             bigint      not null default public.app_loja_id(),
  push_ativo          boolean     not null default true,   -- "Notificações do dispositivo"
  alerta_novo_pedido  boolean     not null default true,    -- "Alertas de novos pedidos"
  alerta_caixa        boolean     not null default true,    -- "Alertas do Caixa"
  som                 boolean     not null default true,    -- "Som das notificações"
  alertas_visuais     boolean     not null default true,    -- "Alertas visuais dentro do sistema"
  atualizado_em       timestamptz not null default now()
);
drop trigger if exists trg_notif_prefs_atualizado_em on public.tab_notificacao_prefs;
create trigger trg_notif_prefs_atualizado_em
  before update on public.tab_notificacao_prefs
  for each row execute function public.fn_atualizar_timestamp();

alter table public.tab_notificacao_prefs enable row level security;
drop policy if exists "notif_prefs_dono" on public.tab_notificacao_prefs;
create policy "notif_prefs_dono" on public.tab_notificacao_prefs for all
  using (public.app_is_super() or usuario_id = public.app_usuario_id())
  with check (public.app_is_super() or usuario_id = public.app_usuario_id());
grant select on public.tab_notificacao_prefs to service_role;

-- ════════════════════════════════════════════════════════════
--  Segredo do webhook: gerado UMA VEZ pelo próprio Postgres (pgcrypto,
--  já disponível por padrão) e guardado no Vault — nunca passa pelo
--  frontend nem precisa ser copiado manualmente. O trigger o lê do
--  Vault (roda como owner da função); a Edge Function o lê via Vault
--  usando a service role key (injetada automaticamente pelo runtime).
-- ════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notif_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'notif_webhook_secret');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  Trigger: novo pedido (INSERT) e "entrou no Caixa aguardando
--  pagamento" (UPDATE com transição real de status). Chama a Edge
--  Function via pg_net (assíncrono, não trava o INSERT/UPDATE do
--  pedido) — a Function decide destinatários e envia o Web Push.
-- ════════════════════════════════════════════════════════════
create or replace function public.fn_notificar_pedido_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento     text;
  v_secret     text;
  v_url        text := 'https://rwnzggjxhxnfrhstbxkm.supabase.co/functions/v1/notificacoes-push';
begin
  if tg_op = 'INSERT' then
    -- Só pedidos válidos e não cancelados; evita disparo em seed/import
    -- que já nasce cancelado ou sem loja_id.
    if new.status = 'cancelado' or new.loja_id is null then
      return new;
    end if;
    v_evento := 'novo_pedido';
  elsif tg_op = 'UPDATE' then
    -- Transição REAL old→new para "finalizado" (equivalente a "conta
    -- aberta" no Caixa) e ainda não pago — nunca em qualquer UPDATE comum.
    if old.status is distinct from 'finalizado'
       and new.status = 'finalizado'
       and new.status_pagamento is distinct from 'pago'
       and new.loja_id is not null then
      v_evento := 'caixa_aguardando';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notif_webhook_secret';
  if v_secret is null then
    return new; -- Vault não configurado ainda — não quebra o pedido, só não notifica.
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object(
      'evento', v_evento,
      'pedido_id', new.id,
      'loja_id', new.loja_id,
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      'new_record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notificar_pedido_insert on public.tab_pedidos;
create trigger trg_notificar_pedido_insert
  after insert on public.tab_pedidos
  for each row execute function public.fn_notificar_pedido_evento();

drop trigger if exists trg_notificar_pedido_update on public.tab_pedidos;
create trigger trg_notificar_pedido_update
  after update on public.tab_pedidos
  for each row execute function public.fn_notificar_pedido_evento();
