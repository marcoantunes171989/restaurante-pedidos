-- ════════════════════════════════════════════════════════════
--  028 — Cadastro de clientes (pedidos externos / CRM)
--  Clientes que pedem pelo link de divulgação informam nome + telefone.
--  O telefone identifica o cliente (auto-carrega o nome no próximo pedido).
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_clientes (
  id        bigint primary key generated always as identity,
  nome      text not null,
  telefone  text not null,
  loja_id   bigint,
  criado_em timestamptz not null default now()
);

-- Um telefone por empresa (permite o mesmo telefone em empresas diferentes)
create unique index if not exists idx_tab_clientes_tel_loja
  on public.tab_clientes (telefone, loja_id);
create index if not exists idx_tab_clientes_loja on public.tab_clientes (loja_id);

alter table public.tab_clientes enable row level security;
drop policy if exists "tab_clientes_all" on public.tab_clientes;
create policy "tab_clientes_all" on public.tab_clientes for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_clientes') then
    alter publication supabase_realtime add table public.tab_clientes;
  end if;
end $$;

-- Telefone do cliente no pedido (vincula pedido ao cliente p/ o CRM)
alter table public.tab_pedidos add column if not exists cliente_telefone text;
create index if not exists idx_tab_pedidos_cli_tel on public.tab_pedidos (cliente_telefone);
