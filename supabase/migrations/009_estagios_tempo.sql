-- ============================================================
-- MIGRATION 009 — Timestamps de cada estágio do pedido
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Momento em que entrou em preparo e em que ficou pronto
ALTER TABLE tab_pedidos ADD COLUMN IF NOT EXISTS preparo_em timestamptz;
ALTER TABLE tab_pedidos ADD COLUMN IF NOT EXISTS pronto_em  timestamptz;
