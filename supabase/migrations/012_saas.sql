-- ============================================================
-- MIGRATION 012 — SaaS (planos + onboarding self-service)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Plano e responsável por loja
ALTER TABLE tab_lojas ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'free';
ALTER TABLE tab_lojas ADD COLUMN IF NOT EXISTS email_responsavel text;

-- Super administrador do sistema (vê todas as lojas)
ALTER TABLE tab_usuarios ADD COLUMN IF NOT EXISTS super_admin boolean NOT NULL DEFAULT false;
