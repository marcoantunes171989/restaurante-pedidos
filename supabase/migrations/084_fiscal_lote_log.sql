-- ════════════════════════════════════════════════════════════
--  084 — Histórico das atualizações fiscais em lote (para reverter)
--
--  Cada linha registra a alteração de UM campo de vínculo fiscal em UM
--  produto: valor anterior → posterior, com data e usuário. As linhas de
--  um mesmo lote compartilham `lote_id`, permitindo reverter o lote
--  inteiro ou item a item. Também serve como trilha de auditoria detalhada.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_fiscal_lote_log (
  id             bigint generated always as identity primary key,
  loja_id        bigint,
  lote_id        text not null,
  produto_id     bigint not null,
  produto_nome   text,
  campo          text not null,        -- ncmId | cfopId | pisId | cofinsId | ipiId | cestId
  valor_anterior bigint,               -- id anterior (null = estava vazio)
  valor_posterior bigint,              -- id novo (null = vínculo removido)
  usuario_id     bigint,
  usuario_nome   text,
  criado_em      timestamptz not null default now(),
  revertido      boolean not null default false,
  revertido_em   timestamptz
);
create index if not exists idx_tab_fiscal_lote_log_loja on public.tab_fiscal_lote_log (loja_id);
create index if not exists idx_tab_fiscal_lote_log_lote on public.tab_fiscal_lote_log (lote_id);

alter table public.tab_fiscal_lote_log enable row level security;
drop policy if exists "tab_fiscal_lote_log_all" on public.tab_fiscal_lote_log;
create policy "tab_fiscal_lote_log_all" on public.tab_fiscal_lote_log for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_fiscal_lote_log') then
    alter publication supabase_realtime add table public.tab_fiscal_lote_log;
  end if;
end $$;
