-- ════════════════════════════════════════════════════════════
--  027 — Cadastro de mesas (tab_mesas)
--  Permite registrar, ativar/inativar e excluir mesas de cada
--  empresa. Usadas no tablet (seleção por grid) e como referência
--  nas comandas locais.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_mesas (
  id          bigint  primary key generated always as identity,
  numero      int     not null,
  nome        text,                            -- label opcional (ex.: "Varanda", "VIP")
  capacidade  int,                             -- nº de lugares (opcional)
  loja_id     bigint,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Mesma mesa não pode ser cadastrada duas vezes na mesma loja
create unique index if not exists idx_tab_mesas_numero_loja
  on public.tab_mesas (numero, loja_id);

create index if not exists idx_tab_mesas_loja
  on public.tab_mesas (loja_id);

-- RLS permissiva (padrão do projeto; protegido pela anon key + uso interno)
alter table public.tab_mesas enable row level security;

drop policy if exists "tab_mesas_all" on public.tab_mesas;
create policy "tab_mesas_all" on public.tab_mesas
  for all using (true) with check (true);

-- Realtime idempotente (não falha se a tabela já estiver na publicação)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'tab_mesas'
  ) then
    alter publication supabase_realtime add table public.tab_mesas;
  end if;
end $$;
