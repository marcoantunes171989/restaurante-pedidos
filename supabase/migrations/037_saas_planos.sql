-- ════════════════════════════════════════════════════════════
--  037 — SaaS: Planos, Módulos, Vínculos e Assinaturas
--  ADITIVO e NÃO-DESTRUTIVO. Nenhuma tabela existente é alterada
--  de forma que afete dados atuais. Sem assinatura cadastrada, o
--  app trata a empresa como acesso TOTAL (comportamento de hoje).
-- ════════════════════════════════════════════════════════════

-- ── Catálogo de planos ──────────────────────────────────────
create table if not exists public.tab_planos (
  id               bigint primary key generated always as identity,
  nome             text not null,
  slug             text unique not null,
  descricao        text,
  preco_base       numeric(10,2),
  is_personalizado boolean not null default false,
  ordem            integer not null default 0,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- ── Catálogo de módulos do sistema ──────────────────────────
create table if not exists public.tab_modulos (
  id          bigint primary key generated always as identity,
  nome        text not null,
  slug        text unique not null,
  descricao   text,
  icone       text,
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ── Vínculo plano × módulo ──────────────────────────────────
create table if not exists public.tab_plano_modulos (
  id           bigint primary key generated always as identity,
  plano_id     bigint not null references public.tab_planos(id)  on delete cascade,
  modulo_id    bigint not null references public.tab_modulos(id) on delete cascade,
  pode_acessar boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (plano_id, modulo_id)
);

-- ── Assinatura por empresa (loja) ───────────────────────────
create table if not exists public.tab_assinaturas (
  id              bigint primary key generated always as identity,
  loja_id         bigint not null references public.tab_lojas(id) on delete cascade,
  plano_id        bigint references public.tab_planos(id),
  status          text not null default 'active',  -- trial | active | overdue | blocked | canceled
  data_inicio     date,
  data_fim        date,
  data_trial_fim  date,
  preco_mensal    numeric(10,2),
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (loja_id)
);

create index if not exists idx_tab_plano_modulos_plano on public.tab_plano_modulos (plano_id);
create index if not exists idx_tab_assinaturas_loja    on public.tab_assinaturas (loja_id);

-- ── RLS permissiva (consistente com o restante do projeto) ──
alter table public.tab_planos        enable row level security;
alter table public.tab_modulos       enable row level security;
alter table public.tab_plano_modulos enable row level security;
alter table public.tab_assinaturas   enable row level security;
drop policy if exists "tab_planos_all"        on public.tab_planos;
drop policy if exists "tab_modulos_all"       on public.tab_modulos;
drop policy if exists "tab_plano_modulos_all" on public.tab_plano_modulos;
drop policy if exists "tab_assinaturas_all"   on public.tab_assinaturas;
create policy "tab_planos_all"        on public.tab_planos        for all using (true) with check (true);
create policy "tab_modulos_all"       on public.tab_modulos       for all using (true) with check (true);
create policy "tab_plano_modulos_all" on public.tab_plano_modulos for all using (true) with check (true);
create policy "tab_assinaturas_all"   on public.tab_assinaturas   for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_planos') then
    alter publication supabase_realtime add table public.tab_planos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_modulos') then
    alter publication supabase_realtime add table public.tab_modulos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_plano_modulos') then
    alter publication supabase_realtime add table public.tab_plano_modulos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_assinaturas') then
    alter publication supabase_realtime add table public.tab_assinaturas;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  SEED — planos, módulos e vínculos (idempotente por slug)
-- ════════════════════════════════════════════════════════════
insert into public.tab_planos (nome, slug, descricao, preco_base, is_personalizado, ordem) values
  ('Start',         'start',         'Para quem está começando a digitalizar o atendimento.', 149, false, 1),
  ('Profissional',  'profissional',  'Operação completa de salão: mesas, comandas e cozinha.', 249, false, 2),
  ('Prime',         'prime',         'Gestão avançada: caixa, promoções, fidelidade e relatórios.', 399, false, 3),
  ('Personalizado', 'personalizado', 'Multiempresa e funcionalidades sob medida.', null, true, 4)
on conflict (slug) do nothing;

insert into public.tab_modulos (nome, slug, ordem) values
  ('Dashboard','dashboard',1), ('Relatórios','relatorios',2), ('CRM / Clientes','crm',3),
  ('Mesas','mesas',4), ('Comandas e QR Code','comandas',5),
  ('Pedido no Tablet','tablet',6), ('Cozinha','kitchen',7), ('Painel de Pedidos','panel',8),
  ('Caixa / Pagamento','cashier',9),
  ('Produtos','products',10), ('Categorias','categorias',11), ('Cardápio Externo','cardapioext',12),
  ('Formas de Pagamento','pagamento',13), ('Configurações','config',14), ('Minha Empresa','minhaempresa',15),
  ('Usuários','users',16), ('Cargos / Perfis','cargos',17), ('Permissões','access',18), ('Usuário x Acesso','link',19),
  ('Empresas','lojas',20), ('Licenças de Uso','licencas',21), ('Controle de Versões','versoes',22),
  ('Promoções','promocoes',23), ('Fechamento de Caixa','caixa',24), ('Fidelidade','fidelidade',25),
  ('Produtos em Destaque','destaque',26), ('Auditoria','auditoria',27), ('Chamados de Mesa','chamados',28),
  ('Setores de Cozinha','setores',29)
on conflict (slug) do nothing;

-- Start
insert into public.tab_plano_modulos (plano_id, modulo_id, pode_acessar)
select p.id, m.id, true from public.tab_planos p, public.tab_modulos m
where p.slug='start' and m.slug in ('dashboard','products','categorias','cardapioext','pagamento','users','config','minhaempresa')
on conflict (plano_id, modulo_id) do nothing;

-- Profissional (Start + operação de salão)
insert into public.tab_plano_modulos (plano_id, modulo_id, pode_acessar)
select p.id, m.id, true from public.tab_planos p, public.tab_modulos m
where p.slug='profissional' and m.slug in
  ('dashboard','products','categorias','cardapioext','pagamento','users','config','minhaempresa',
   'relatorios','crm','mesas','comandas','tablet','kitchen','panel','cashier','cargos','access','link')
on conflict (plano_id, modulo_id) do nothing;

-- Prime (Profissional + gestão avançada)
insert into public.tab_plano_modulos (plano_id, modulo_id, pode_acessar)
select p.id, m.id, true from public.tab_planos p, public.tab_modulos m
where p.slug='prime' and m.slug in
  ('dashboard','products','categorias','cardapioext','pagamento','users','config','minhaempresa',
   'relatorios','crm','mesas','comandas','tablet','kitchen','panel','cashier','cargos','access','link',
   'promocoes','caixa','fidelidade','destaque')
on conflict (plano_id, modulo_id) do nothing;

-- Personalizado (todos os módulos)
insert into public.tab_plano_modulos (plano_id, modulo_id, pode_acessar)
select p.id, m.id, true from public.tab_planos p, public.tab_modulos m
where p.slug='personalizado'
on conflict (plano_id, modulo_id) do nothing;
