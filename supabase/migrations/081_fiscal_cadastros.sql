-- ════════════════════════════════════════════════════════════
--  081 — Cadastros fiscais normalizados (Fase 1: ICMS + NCM)
--
--  Arquitetura modular e reutilizável. Em vez de repetir tributação
--  produto a produto, as regras ficam em cadastros próprios e são
--  vinculadas por chave estrangeira:
--
--      Produto → NCM → Regra de ICMS
--
--  Alterar uma regra de ICMS uma única vez reflete em todos os NCMs
--  vinculados e, por consequência, em todos os produtos daquele NCM.
--
--  Fases seguintes (082+): CFOP, PIS, COFINS, IPI, CEST.
-- ════════════════════════════════════════════════════════════

-- ── Regras de ICMS ─────────────────────────────────────────
create table if not exists public.tab_fiscal_icms (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  nome          text not null,
  origem        text,
  cst           text,
  csosn         text,
  aliquota      numeric(6,2) not null default 0,
  reducao_base  numeric(6,2) not null default 0,
  icms_st       boolean not null default false,
  mva           numeric(6,2) not null default 0,
  fcp           numeric(6,2) not null default 0,
  uf_origem     text,
  uf_destino    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_icms_loja on public.tab_fiscal_icms (loja_id);

-- ── NCM (vincula uma regra de ICMS) ────────────────────────
create table if not exists public.tab_fiscal_ncm (
  id            bigint generated always as identity primary key,
  loja_id       bigint,
  codigo        text not null,
  descricao     text,
  ex_tipi       text,
  unidade       text,
  cest          text,
  icms_id       bigint references public.tab_fiscal_icms(id) on delete set null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_tab_fiscal_ncm_loja on public.tab_fiscal_ncm (loja_id);
create index if not exists idx_tab_fiscal_ncm_icms on public.tab_fiscal_ncm (icms_id);

-- ── Vínculo Produto → NCM ──────────────────────────────────
alter table public.tab_produtos
  add column if not exists ncm_id bigint references public.tab_fiscal_ncm(id) on delete set null;
create index if not exists idx_tab_produtos_ncm on public.tab_produtos (ncm_id);

-- ── RLS ────────────────────────────────────────────────────
alter table public.tab_fiscal_icms enable row level security;
alter table public.tab_fiscal_ncm  enable row level security;
drop policy if exists "tab_fiscal_icms_all" on public.tab_fiscal_icms;
drop policy if exists "tab_fiscal_ncm_all"  on public.tab_fiscal_ncm;
create policy "tab_fiscal_icms_all" on public.tab_fiscal_icms for all using (true) with check (true);
create policy "tab_fiscal_ncm_all"  on public.tab_fiscal_ncm  for all using (true) with check (true);

-- ── Realtime ───────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fiscal_icms') then
    alter publication supabase_realtime add table public.tab_fiscal_icms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fiscal_ncm') then
    alter publication supabase_realtime add table public.tab_fiscal_ncm;
  end if;
end $$;
