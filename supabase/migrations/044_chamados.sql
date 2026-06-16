-- ════════════════════════════════════════════════════════════
--  044 — Chamados de mesa (garçom, conta, ajuda, limpeza)
--  ADITIVO. Registra solicitações do cliente para o painel da equipe.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_chamados (
  id            bigint primary key generated always as identity,
  loja_id       bigint,
  mesa          text,
  comanda       text,
  tipo          text not null default 'garcom',   -- garcom | conta | ajuda | limpeza
  status        text not null default 'pendente', -- pendente | atendido | cancelado
  criado_em     timestamptz not null default now(),
  atendido_em   timestamptz,
  atendido_por  bigint
);

create index if not exists idx_tab_chamados_loja on public.tab_chamados (loja_id, status);

alter table public.tab_chamados enable row level security;
drop policy if exists "tab_chamados_all" on public.tab_chamados;
create policy "tab_chamados_all" on public.tab_chamados for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_chamados') then
    alter publication supabase_realtime add table public.tab_chamados;
  end if;
end $$;
