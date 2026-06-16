-- ════════════════════════════════════════════════════════════
--  036 — Movimentações de estoque (baixa na conta)
--  Registra, a cada baixa de comanda no caixa, a quantidade vendida
--  e o estoque ANTES e DEPOIS de cada produto. Base para o relatório
--  gerencial de estoque (anterior x posterior, maior x menor estoque).
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_estoque_mov (
  id             bigint primary key generated always as identity,
  loja_id        bigint,
  produto_id     bigint,
  produto_nome   text not null,
  quantidade     integer not null,
  estoque_antes  integer not null,
  estoque_depois integer not null,
  comandas       text,
  origem         text not null default 'baixa_caixa',
  criado_em      timestamptz not null default now()
);

create index if not exists idx_tab_estoque_mov_loja on public.tab_estoque_mov (loja_id);
create index if not exists idx_tab_estoque_mov_data on public.tab_estoque_mov (criado_em);

alter table public.tab_estoque_mov enable row level security;
drop policy if exists "tab_estoque_mov_all" on public.tab_estoque_mov;
create policy "tab_estoque_mov_all" on public.tab_estoque_mov for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_estoque_mov') then
    alter publication supabase_realtime add table public.tab_estoque_mov;
  end if;
end $$;
