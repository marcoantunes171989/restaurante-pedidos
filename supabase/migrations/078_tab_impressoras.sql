-- ════════════════════════════════════════════════════════════
--  078 — Cadastro de impressoras (Setor Impressoras) + vínculo
--  em categoria (obrigatório no app) e produto (opcional).
--  ADITIVO e idempotente.
--
--  Regra de roteamento de impressão:
--    1) impressora do PRODUTO (se preenchida)
--    2) impressora da CATEGORIA
--  Setor de produção continua separando a comanda na cozinha.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_impressoras (
  id              bigint primary key generated always as identity,
  loja_id         bigint,
  nome            text not null,
  destino         text not null,
  tipo            text not null default 'local'
                  check (tipo in ('local', 'rede', 'compartilhada')),
  observacao      text,
  impressao_auto  boolean not null default true,
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_tab_impressoras_loja
  on public.tab_impressoras (loja_id, ativo, ordem);

comment on table public.tab_impressoras is
  'Impressoras térmicas apontadas por driver local, IP ou compartilhamento de rede.';
comment on column public.tab_impressoras.destino is
  'Apontamento do driver: nome da impressora no SO, \\\servidor\fila, IP:porta, etc.';

alter table public.tab_impressoras enable row level security;
drop policy if exists "tab_impressoras_all" on public.tab_impressoras;
create policy "tab_impressoras_all"
  on public.tab_impressoras for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tab_impressoras'
  ) then
    alter publication supabase_realtime add table public.tab_impressoras;
  end if;
exception when others then null;
end $$;

-- Vínculos
alter table public.tab_categorias
  add column if not exists impressora_id bigint;

alter table public.tab_produtos
  add column if not exists impressora_id bigint;

create index if not exists idx_tab_categorias_impressora
  on public.tab_categorias (impressora_id);
create index if not exists idx_tab_produtos_impressora
  on public.tab_produtos (impressora_id);

-- Fila: guarda o id da impressora cadastrada e se a auto-impressão vale para o job
alter table public.tab_impressoes_cozinha
  add column if not exists impressora_id bigint;

alter table public.tab_impressoes_cozinha
  add column if not exists impressao_auto boolean not null default true;
