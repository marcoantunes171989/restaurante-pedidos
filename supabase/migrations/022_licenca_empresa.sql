-- Migration 022: controle de licença de uso por empresa
-- Adiciona o campo licenca_bloqueada em tab_lojas.
-- Quando TRUE, nenhum usuário da empresa consegue logar (licença suspensa).
-- !!! EXECUTAR NO SUPABASE para habilitar o controle de licença !!!
ALTER TABLE tab_lojas ADD COLUMN IF NOT EXISTS licenca_bloqueada BOOLEAN DEFAULT FALSE;
UPDATE tab_lojas SET licenca_bloqueada = FALSE WHERE licenca_bloqueada IS NULL;
