-- Migration 020: adiciona campo ativo em tab_comandas
-- Permite inativar comandas com histórico de pedidos sem perder referências.
ALTER TABLE tab_comandas ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
UPDATE tab_comandas SET ativo = TRUE WHERE ativo IS NULL;
