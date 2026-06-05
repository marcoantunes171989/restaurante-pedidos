-- Migration 023: logo da empresa (para as comandas QR)
-- Guarda a URL pública da logo (upload no Storage 'produto-imagens').
-- !!! EXECUTAR NO SUPABASE para habilitar o salvamento da logo !!!
ALTER TABLE tab_lojas ADD COLUMN IF NOT EXISTS logo_url TEXT;
