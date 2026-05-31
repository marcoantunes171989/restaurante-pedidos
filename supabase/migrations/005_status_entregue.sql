-- ============================================================
-- MIGRATION 005 — Adiciona status "entregue" em tab_pedidos
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Remove o CHECK constraint antigo e adiciona com o novo status
ALTER TABLE tab_pedidos DROP CONSTRAINT IF EXISTS tab_pedidos_status_check;

ALTER TABLE tab_pedidos
  ADD CONSTRAINT tab_pedidos_status_check
  CHECK (status IN ('recebido', 'preparando', 'finalizado', 'entregue'));
