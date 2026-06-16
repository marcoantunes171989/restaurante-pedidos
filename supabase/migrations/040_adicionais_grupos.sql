-- ════════════════════════════════════════════════════════════
--  040 — Adicionais e Variações estruturados (grupos de opções)
--  ADITIVO. Coexiste com tab_produtos.adicionais (jsonb) atual.
--  Pizzarias/hamburguerias/japonês: tamanho, ponto da carne, borda,
--  adicionais pagos, escolha de bebida do combo, etc.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_grupos_opcoes (
  id           bigint primary key generated always as identity,
  loja_id      bigint,
  produto_id   bigint not null,
  nome         text not null,
  min_select   integer not null default 0,
  max_select   integer not null default 1,
  obrigatorio  boolean not null default false,
  ordem        integer not null default 0,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.tab_opcoes (
  id           bigint primary key generated always as identity,
  loja_id      bigint,
  grupo_id     bigint not null references public.tab_grupos_opcoes(id) on delete cascade,
  nome         text not null,
  descricao    text,
  preco_delta  numeric(10,2) not null default 0,
  ordem        integer not null default 0,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_tab_grupos_opcoes_produto on public.tab_grupos_opcoes (produto_id);
create index if not exists idx_tab_grupos_opcoes_loja    on public.tab_grupos_opcoes (loja_id);
create index if not exists idx_tab_opcoes_grupo          on public.tab_opcoes (grupo_id);

alter table public.tab_grupos_opcoes enable row level security;
alter table public.tab_opcoes        enable row level security;
drop policy if exists "tab_grupos_opcoes_all" on public.tab_grupos_opcoes;
drop policy if exists "tab_opcoes_all"        on public.tab_opcoes;
create policy "tab_grupos_opcoes_all" on public.tab_grupos_opcoes for all using (true) with check (true);
create policy "tab_opcoes_all"        on public.tab_opcoes        for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_grupos_opcoes') then
    alter publication supabase_realtime add table public.tab_grupos_opcoes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_opcoes') then
    alter publication supabase_realtime add table public.tab_opcoes;
  end if;
end $$;
