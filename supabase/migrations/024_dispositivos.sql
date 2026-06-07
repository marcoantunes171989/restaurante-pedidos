-- ════════════════════════════════════════════════════════════
--  024 — Controle de versão por aparelho (tab_dispositivos)
--  Cada aparelho/app reporta sua versão atual; o painel admin
--  ("Controle de versões") consulta a versão liberada x a versão
--  aplicada em cada aparelho e quando foi a última atividade.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_dispositivos (
  device_id        text primary key,
  nome             text,
  versao           text,
  user_email       text,
  loja_id          bigint,
  plataforma       text,
  standalone       boolean default false,
  ultima_atividade timestamptz default now(),
  criado_em        timestamptz default now()
);

create index if not exists idx_tab_dispositivos_loja on public.tab_dispositivos (loja_id);
create index if not exists idx_tab_dispositivos_atividade on public.tab_dispositivos (ultima_atividade desc);

-- RLS permissiva (padrão do projeto; protegido pela anon key + uso interno)
alter table public.tab_dispositivos enable row level security;

drop policy if exists "tab_dispositivos_all" on public.tab_dispositivos;
create policy "tab_dispositivos_all" on public.tab_dispositivos
  for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.tab_dispositivos;
