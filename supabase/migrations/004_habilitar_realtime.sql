-- ============================================================
-- MIGRATION 004 — Habilitar Realtime na tab_pedidos
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Adiciona tab_pedidos na publicação do Realtime do Supabase
alter publication supabase_realtime add table tab_pedidos;

-- Opcional: habilitar também para produtos (para admin ver novos produtos em tempo real)
-- alter publication supabase_realtime add table tab_produtos;
