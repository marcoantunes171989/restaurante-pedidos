-- ============================================================
-- MIGRATION 001 — Criar tabelas
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Produtos do cardápio
create table if not exists products (
  id          bigint primary key generated always as identity,
  name        text        not null,
  category    text        not null,
  price       numeric(10,2) not null default 0,
  cost        numeric(10,2) not null default 0,
  active      boolean     not null default true,
  time        text,
  description text,
  badge       text,
  image_url   text,
  ingredients text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Usuários do sistema (separado do Auth do Supabase)
create table if not exists app_users (
  id          bigint primary key generated always as identity,
  name        text   not null,
  email       text   not null unique,
  password    text   not null,
  role        text   not null default 'Operador',
  active      boolean not null default true,
  access_ids  text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- Permissões/módulos de acesso
create table if not exists accesses (
  id          text primary key,
  label       text    not null,
  description text,
  type        text    not null default 'Operacional',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Pedidos (itens armazenados como JSONB)
create table if not exists orders (
  id             text primary key,
  table_name     text    not null,
  command        text    not null,
  customer       text    not null default 'Visitante',
  status         text    not null default 'received'
                   check (status in ('received','preparing','ready')),
  payment_status text    not null default 'open'
                   check (payment_status in ('open','requested','paid')),
  items          jsonb   not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Trigger: atualiza updated_at automaticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();
