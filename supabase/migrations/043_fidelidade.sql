-- ════════════════════════════════════════════════════════════
--  043 — Programa de Fidelidade (regras, transações, recompensas)
--  ADITIVO. Pontos por valor gasto; recompensas por pontos.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_fidelidade_regras (
  id              bigint primary key generated always as identity,
  loja_id         bigint,
  nome            text not null default 'Programa de Fidelidade',
  valor_por_ponto numeric(10,2) not null default 1,   -- R$ que vale 1 ponto
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.tab_fidelidade_recompensas (
  id                bigint primary key generated always as identity,
  loja_id           bigint,
  nome              text not null,
  descricao         text,
  pontos_necessarios integer not null default 0,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);

create table if not exists public.tab_fidelidade_transacoes (
  id          bigint primary key generated always as identity,
  loja_id     bigint,
  cliente_id  bigint,
  order_id    bigint,
  pontos      integer not null default 0,            -- positivo = ganho, negativo = resgate
  tipo        text not null default 'earn',          -- earn | redeem | adjust
  descricao   text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_tab_fid_regras_loja   on public.tab_fidelidade_regras (loja_id);
create index if not exists idx_tab_fid_recomp_loja   on public.tab_fidelidade_recompensas (loja_id);
create index if not exists idx_tab_fid_trans_loja    on public.tab_fidelidade_transacoes (loja_id);
create index if not exists idx_tab_fid_trans_cliente on public.tab_fidelidade_transacoes (cliente_id);

alter table public.tab_fidelidade_regras       enable row level security;
alter table public.tab_fidelidade_recompensas  enable row level security;
alter table public.tab_fidelidade_transacoes   enable row level security;
drop policy if exists "tab_fid_regras_all"  on public.tab_fidelidade_regras;
drop policy if exists "tab_fid_recomp_all"  on public.tab_fidelidade_recompensas;
drop policy if exists "tab_fid_trans_all"   on public.tab_fidelidade_transacoes;
create policy "tab_fid_regras_all"  on public.tab_fidelidade_regras      for all using (true) with check (true);
create policy "tab_fid_recomp_all"  on public.tab_fidelidade_recompensas for all using (true) with check (true);
create policy "tab_fid_trans_all"   on public.tab_fidelidade_transacoes  for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fidelidade_transacoes') then
    alter publication supabase_realtime add table public.tab_fidelidade_transacoes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fidelidade_recompensas') then
    alter publication supabase_realtime add table public.tab_fidelidade_recompensas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fidelidade_regras') then
    alter publication supabase_realtime add table public.tab_fidelidade_regras;
  end if;
end $$;
