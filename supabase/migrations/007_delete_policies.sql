-- ============================================================
-- MIGRATION 007 — Policies de DELETE (exclusões no admin)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Permite excluir produtos (já existe policy em 003, mas garante)
DROP POLICY IF EXISTS "produtos_excluir" ON tab_produtos;
CREATE POLICY "produtos_excluir" ON tab_produtos FOR DELETE USING (true);

-- Permite excluir usuários
DROP POLICY IF EXISTS "usuarios_excluir" ON tab_usuarios;
CREATE POLICY "usuarios_excluir" ON tab_usuarios FOR DELETE USING (true);

-- Permite excluir formas de pagamento
DROP POLICY IF EXISTS "fp_delete" ON tab_formas_pagamento;
CREATE POLICY "fp_delete" ON tab_formas_pagamento FOR DELETE USING (true);
