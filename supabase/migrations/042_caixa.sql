-- ════════════════════════════════════════════════════════════
--  042 — Fechamento de Caixa (sessão de caixa + movimentações)
--  ADITIVO. Abrir caixa, suprimento, sangria, fechar com diferença.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_caixas (
  id                bigint primary key generated always as identity,
  loja_id           bigint,
  aberto_por        bigint,
  fechado_por       bigint,
  valor_abertura    numeric(10,2) not null default 0,
  valor_fechamento  numeric(10,2),
  valor_esperado    numeric(10,2),
  diferenca         numeric(10,2),
  status            text not null default 'aberto',  -- aberto | fechado
  aberto_em         timestamptz not null default now(),
  fechado_em        timestamptz,
  observacoes       text
);

create table if not exists public.tab_caixa_mov (
  id                 bigint primary key generated always as identity,
  loja_id            bigint,
  caixa_id           bigint not null references public.tab_caixas(id) on delete cascade,
  tipo               text not null,                   -- venda | suprimento | sangria | ajuste
  valor              numeric(10,2) not null default 0,
  forma_pagamento_id bigint,
  descricao          text,
  usuario_id         bigint,
  criado_em          timestamptz not null default now()
);

create index if not exists idx_tab_caixas_loja      on public.tab_caixas (loja_id, status);
create index if not exists idx_tab_caixa_mov_caixa   on public.tab_caixa_mov (caixa_id);

alter table public.tab_caixas    enable row level security;
alter table public.tab_caixa_mov enable row level security;
drop policy if exists "tab_caixas_all"    on public.tab_caixas;
drop policy if exists "tab_caixa_mov_all" on public.tab_caixa_mov;
create policy "tab_caixas_all"    on public.tab_caixas    for all using (true) with check (true);
create policy "tab_caixa_mov_all" on public.tab_caixa_mov for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_caixas') then
    alter publication supabase_realtime add table public.tab_caixas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_caixa_mov') then
    alter publication supabase_realtime add table public.tab_caixa_mov;
  end if;
end $$;
