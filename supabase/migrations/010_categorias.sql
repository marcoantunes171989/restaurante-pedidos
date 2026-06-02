-- ============================================================
-- MIGRATION 010 — Cadastro de categorias
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_categorias (
  id         bigint primary key generated always as identity,
  nome       text    not null unique,
  ativo      boolean not null default true,
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);

-- Categorias existentes (seed)
INSERT INTO tab_categorias (nome, ordem) VALUES
  ('Entradas',          1),
  ('Pratos principais', 2),
  ('Lanches',           3),
  ('Bebidas',           4),
  ('Sobremesas',        5)
ON CONFLICT (nome) DO NOTHING;

-- RLS
ALTER TABLE tab_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_select" ON tab_categorias FOR SELECT USING (true);
CREATE POLICY "cat_insert" ON tab_categorias FOR INSERT WITH CHECK (true);
CREATE POLICY "cat_update" ON tab_categorias FOR UPDATE USING (true);
CREATE POLICY "cat_delete" ON tab_categorias FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tab_categorias;
