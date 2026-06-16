-- ════════════════════════════════════════════════════════════
--  039 — Promoções (marketing por empresa)
--  ADITIVO. Tabela nova, isolada por loja_id. Não altera dados atuais.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_promocoes (
  id               bigint primary key generated always as identity,
  loja_id          bigint,
  nome             text not null,
  descricao        text,
  tipo             text not null default 'percentual', -- percentual | valor | combo | destaque | horario
  desconto_percent numeric(5,2),
  desconto_valor   numeric(10,2),
  produto_id       bigint,
  categoria_id     bigint,
  data_inicio      date,
  data_fim         date,
  hora_inicio      time,
  hora_fim         time,
  dias_semana      jsonb,                 -- ex.: [0,1,2,3,4,5,6] (0=domingo)
  mostrar_cardapio boolean not null default true,
  mostrar_tablet   boolean not null default true,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index if not exists idx_tab_promocoes_loja on public.tab_promocoes (loja_id);

alter table public.tab_promocoes enable row level security;
drop policy if exists "tab_promocoes_all" on public.tab_promocoes;
create policy "tab_promocoes_all" on public.tab_promocoes for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_promocoes') then
    alter publication supabase_realtime add table public.tab_promocoes;
  end if;
end $$;
