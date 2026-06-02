-- ============================================================
-- MIGRATION 013 — Define o administrador geral (super admin)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Garante a coluna (caso 012 não tenha sido executada)
ALTER TABLE tab_usuarios ADD COLUMN IF NOT EXISTS super_admin boolean NOT NULL DEFAULT false;

-- Eleva o usuário "Administrador" a administrador geral:
--  • super_admin = true  → cadastra empresas e usuários, vê todas as empresas
--  • loja_id = NULL      → não fica preso a nenhuma empresa específica
UPDATE tab_usuarios
   SET super_admin = true,
       loja_id     = NULL,
       ids_acesso  = ARRAY['tablet','kitchen','panel','cashier','admin']
 WHERE email = 'admin@restaurante.com';

-- Dica: para tornar OUTRO e-mail o administrador geral, troque o e-mail acima.
