-- ════════════════════════════════════════════════════════════
--  Perfis fiscais reutilizáveis (módulo "Fiscal")
--
--  Em vez de preencher NCM/CEST/CFOP/CST/alíquotas produto a produto, o
--  lojista cadastra PERFIS FISCAIS nomeados (ex.: "Bebida — Simples
--  Nacional", "Alimento CST 102") e, no cadastro do produto (aba Fiscal),
--  seleciona um perfil para preencher os campos de uma vez.
--
--  Os campos ficam num JSONB flexível `dados` (mesmo formato do
--  tab_produtos.fiscal), então novos campos fiscais não exigem migration.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_fiscal_perfis (
  id           bigint generated always as identity primary key,
  loja_id      bigint,
  nome         text not null,
  dados        jsonb not null default '{}'::jsonb,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz
);

create index if not exists idx_tab_fiscal_perfis_loja on public.tab_fiscal_perfis (loja_id);

alter table public.tab_fiscal_perfis enable row level security;
drop policy if exists "tab_fiscal_perfis_all" on public.tab_fiscal_perfis;
create policy "tab_fiscal_perfis_all" on public.tab_fiscal_perfis for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fiscal_perfis') then
    alter publication supabase_realtime add table public.tab_fiscal_perfis;
  end if;
end $$;
