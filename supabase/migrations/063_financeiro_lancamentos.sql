-- ════════════════════════════════════════════════════════════
--  063_financeiro_lancamentos.sql
--  Módulo Financeiro — lançamentos (receitas/despesas) e contas a
--  pagar/receber por EMPRESA. Base do menu Financeiro → Lançamentos.
--    tipo:   receita | despesa
--    status: pendente | pago | cancelado
--  "Contas a receber" = tipo receita + status pendente;
--  "Contas a pagar"   = tipo despesa + status pendente;
--  vencimento < hoje e status pendente = conta vencida.
--
--  Front-end TOLERANTE: sem esta migration a tela "Lançamentos" abre
--  vazia (fetchLancamentos cai no catch e retorna []); o salvamento
--  só funciona após aplicar este arquivo no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_lancamentos (
  id              bigserial primary key,
  loja_id         bigint,
  data            date not null default current_date,
  vencimento      date,
  descricao       text not null,
  tipo            text not null default 'despesa' check (tipo in ('receita','despesa')),
  categoria       text,
  valor           numeric(12,2) not null default 0,
  status          text not null default 'pendente' check (status in ('pendente','pago','cancelado')),
  forma_pagamento text,
  observacao      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_lancamentos_loja   on public.tab_lancamentos (loja_id);
create index if not exists idx_lancamentos_data    on public.tab_lancamentos (data);
create index if not exists idx_lancamentos_status  on public.tab_lancamentos (status);

alter table public.tab_lancamentos enable row level security;

-- CRUD para usuários autenticados (a empresa é filtrada no front por loja_id,
-- no mesmo padrão dos demais cadastros internos do sistema).
drop policy if exists "lancamentos_all" on public.tab_lancamentos;
create policy "lancamentos_all" on public.tab_lancamentos for all using (true) with check (true);
