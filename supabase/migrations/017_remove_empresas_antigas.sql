-- ============================================================
-- MIGRATION 017 — Remove empresas antigas de teste
-- Mantém: Matriz (CMD) + demos (SUS, RES, HAM, PIZ)
-- Remove: qualquer outra empresa (ex.: PZB, PDC, PR) e seus dados
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
DO $$
DECLARE v_ids bigint[];
BEGIN
  SELECT array_agg(id) INTO v_ids
    FROM tab_lojas
   WHERE prefixo NOT IN ('CMD','SUS','RES','HAM','PIZ');

  IF v_ids IS NOT NULL THEN
    DELETE FROM tab_pedidos          WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_produtos         WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_categorias       WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_formas_pagamento WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_usuarios         WHERE loja_id = ANY(v_ids) AND super_admin = false;
    DELETE FROM tab_lojas            WHERE id = ANY(v_ids);
  END IF;
END $$;

-- Conferência
SELECT nome, prefixo, ativo FROM tab_lojas ORDER BY id;
