-- ════════════════════════════════════════════════════════════
--  082 — Cadastros fiscais normalizados (Fase 2: CFOP, PIS, COFINS,
--        IPI e CEST) + vínculos no produto por chave estrangeira.
--
--  Complementa a 081 (NCM + ICMS). Cada regra é cadastrada uma vez e
--  reutilizada em vários produtos:
--
--      Produto ├── NCM → Regra de ICMS
--              ├── CFOP
--              ├── PIS · COFINS · IPI
--              └── CEST
-- ════════════════════════════════════════════════════════════

-- ── CFOP ───────────────────────────────────────────────────
create table if not exists public.tab_fiscal_cfop (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text not null,
  descricao     text,
  tipo          text,            -- Entrada | Saída
  operacao      text,            -- Interna | Interestadual | Exterior
  finalidade    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_cfop_loja on public.tab_fiscal_cfop (loja_id);

-- ── PIS / COFINS / IPI (mesma estrutura) ───────────────────
create table if not exists public.tab_fiscal_pis (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text,
  descricao     text not null,
  cst           text,
  tipo_calculo  text,            -- Percentual | Valor
  aliquota      numeric(6,2) not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_pis_loja on public.tab_fiscal_pis (loja_id);

create table if not exists public.tab_fiscal_cofins (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text,
  descricao     text not null,
  cst           text,
  tipo_calculo  text,
  aliquota      numeric(6,2) not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_cofins_loja on public.tab_fiscal_cofins (loja_id);

create table if not exists public.tab_fiscal_ipi (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text,
  descricao     text not null,
  cst           text,
  tipo_calculo  text,
  aliquota      numeric(6,2) not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_ipi_loja on public.tab_fiscal_ipi (loja_id);

-- ── CEST ───────────────────────────────────────────────────
create table if not exists public.tab_fiscal_cest (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text not null,
  descricao     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_cest_loja on public.tab_fiscal_cest (loja_id);

-- ── Vínculos no produto (FK, on delete set null) ───────────
alter table public.tab_produtos
  add column if not exists cfop_id   bigint references public.tab_fiscal_cfop(id)   on delete set null,
  add column if not exists pis_id    bigint references public.tab_fiscal_pis(id)    on delete set null,
  add column if not exists cofins_id bigint references public.tab_fiscal_cofins(id) on delete set null,
  add column if not exists ipi_id    bigint references public.tab_fiscal_ipi(id)    on delete set null,
  add column if not exists cest_id   bigint references public.tab_fiscal_cest(id)   on delete set null;

-- ── RLS ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['tab_fiscal_cfop','tab_fiscal_pis','tab_fiscal_cofins','tab_fiscal_ipi','tab_fiscal_cest']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_all" on public.%I', t, t);
    execute format('create policy "%s_all" on public.%I for all using (true) with check (true)', t, t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
