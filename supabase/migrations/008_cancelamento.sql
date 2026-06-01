-- ============================================================
-- MIGRATION 008 — Cancelamento de pedidos com justificativa
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE tab_pedidos DROP CONSTRAINT IF EXISTS tab_pedidos_status_check;
ALTER TABLE tab_pedidos
  ADD CONSTRAINT tab_pedidos_status_check
  CHECK (status IN ('recebido', 'preparando', 'finalizado', 'entregue', 'cancelado'));

-- Motivo do cancelamento
ALTER TABLE tab_pedidos ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
