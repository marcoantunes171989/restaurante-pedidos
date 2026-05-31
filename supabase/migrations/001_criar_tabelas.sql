-- ============================================================
-- MIGRATION 001 — Criar tabelas (padrão PT-BR)
-- Padrão: tab_nome_tabela  |  colunas em português
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Tabela de produtos ───────────────────────────────────────
create table if not exists tab_produtos (
  id              bigint       primary key generated always as identity,
  nome            text         not null,
  categoria       text         not null,
  preco           numeric(10,2) not null default 0,
  custo           numeric(10,2) not null default 0,
  ativo           boolean      not null default true,
  tempo_preparo   text,
  descricao       text,
  destaque        text,
  url_imagem      text,
  ingredientes    text[]       not null default '{}',
  criado_em       timestamptz  not null default now(),
  atualizado_em   timestamptz  not null default now()
);

-- ── Tabela de usuários do sistema ────────────────────────────
create table if not exists tab_usuarios (
  id              bigint       primary key generated always as identity,
  nome            text         not null,
  email           text         not null unique,
  senha           text         not null,
  perfil          text         not null default 'Operador',
  ativo           boolean      not null default true,
  ids_acesso      text[]       not null default '{}',
  criado_em       timestamptz  not null default now()
);

-- ── Tabela de permissões de acesso ───────────────────────────
create table if not exists tab_acessos (
  id              text         primary key,
  rotulo          text         not null,
  descricao       text,
  tipo            text         not null default 'Operacional',
  ativo           boolean      not null default true,
  criado_em       timestamptz  not null default now()
);

-- ── Tabela de pedidos ────────────────────────────────────────
create table if not exists tab_pedidos (
  id              text         primary key,
  mesa            text         not null,
  comanda         text         not null,
  cliente         text         not null default 'Visitante',
  status          text         not null default 'recebido'
                    check (status in ('recebido', 'preparando', 'finalizado')),
  status_pagamento text        not null default 'aberto'
                    check (status_pagamento in ('aberto', 'solicitado', 'pago')),
  itens           jsonb        not null default '[]',
  criado_em       timestamptz  not null default now(),
  atualizado_em   timestamptz  not null default now()
);

-- ── Trigger: atualiza atualizado_em automaticamente ──────────
create or replace function fn_atualizar_timestamp()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_produtos_atualizado_em
  before update on tab_produtos
  for each row execute function fn_atualizar_timestamp();

create trigger trg_pedidos_atualizado_em
  before update on tab_pedidos
  for each row execute function fn_atualizar_timestamp();
