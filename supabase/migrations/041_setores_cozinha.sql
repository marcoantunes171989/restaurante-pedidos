-- ════════════════════════════════════════════════════════════
--  041 — Setores de cozinha (bar, pizzaria, chapa, sobremesa…)
--  ADITIVO. Produtos podem ser direcionados a um setor; o painel da
--  cozinha filtra por setor. setor_id em produtos é opcional (null).
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_setores_cozinha (
  id          bigint primary key generated always as identity,
  loja_id     bigint,
  nome        text not null,
  descricao   text,
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_tab_setores_loja on public.tab_setores_cozinha (loja_id);

alter table public.tab_produtos add column if not exists setor_id bigint;

alter table public.tab_setores_cozinha enable row level security;
drop policy if exists "tab_setores_cozinha_all" on public.tab_setores_cozinha;
create policy "tab_setores_cozinha_all" on public.tab_setores_cozinha for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_setores_cozinha') then
    alter publication supabase_realtime add table public.tab_setores_cozinha;
  end if;
end $$;
