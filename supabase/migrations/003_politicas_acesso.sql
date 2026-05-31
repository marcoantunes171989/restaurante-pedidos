-- ============================================================
-- MIGRATION 003 — Row Level Security (RLS)
-- Execute APÓS as migrations 001 e 002
-- ============================================================

-- Habilitar RLS em todas as tabelas
alter table tab_produtos  enable row level security;
alter table tab_usuarios  enable row level security;
alter table tab_acessos   enable row level security;
alter table tab_pedidos   enable row level security;

-- ── tab_produtos ─────────────────────────────────────────────
create policy "produtos_leitura_publica" on tab_produtos
  for select using (true);

create policy "produtos_inserir" on tab_produtos
  for insert with check (true);

create policy "produtos_atualizar" on tab_produtos
  for update using (true);

create policy "produtos_excluir" on tab_produtos
  for delete using (true);

-- ── tab_usuarios ─────────────────────────────────────────────
create policy "usuarios_leitura" on tab_usuarios
  for select using (true);

create policy "usuarios_inserir" on tab_usuarios
  for insert with check (true);

create policy "usuarios_atualizar" on tab_usuarios
  for update using (true);

-- ── tab_acessos ──────────────────────────────────────────────
create policy "acessos_leitura_publica" on tab_acessos
  for select using (true);

create policy "acessos_inserir" on tab_acessos
  for insert with check (true);

create policy "acessos_atualizar" on tab_acessos
  for update using (true);

-- ── tab_pedidos ──────────────────────────────────────────────
create policy "pedidos_leitura" on tab_pedidos
  for select using (true);

create policy "pedidos_inserir" on tab_pedidos
  for insert with check (true);

create policy "pedidos_atualizar" on tab_pedidos
  for update using (true);
