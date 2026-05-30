-- ============================================================
-- MIGRATION 003 — Row Level Security (RLS)
-- Execute APÓS as migrations 001 e 002
-- Por enquanto: acesso público (anon) para leitura/escrita
-- Ajuste conforme necessidade de autenticação futura
-- ============================================================

-- Habilitar RLS em todas as tabelas
alter table products   enable row level security;
alter table app_users  enable row level security;
alter table accesses   enable row level security;
alter table orders     enable row level security;

-- ── products: leitura pública, escrita autenticada ───────────
create policy "products_select" on products
  for select using (true);

create policy "products_insert" on products
  for insert with check (true);

create policy "products_update" on products
  for update using (true);

create policy "products_delete" on products
  for delete using (true);

-- ── app_users: acesso total (autenticação gerenciada no app) ──
create policy "app_users_select" on app_users
  for select using (true);

create policy "app_users_insert" on app_users
  for insert with check (true);

create policy "app_users_update" on app_users
  for update using (true);

-- ── accesses: leitura pública, escrita autenticada ───────────
create policy "accesses_select" on accesses
  for select using (true);

create policy "accesses_insert" on accesses
  for insert with check (true);

create policy "accesses_update" on accesses
  for update using (true);

-- ── orders: acesso total ─────────────────────────────────────
create policy "orders_select" on orders
  for select using (true);

create policy "orders_insert" on orders
  for insert with check (true);

create policy "orders_update" on orders
  for update using (true);
