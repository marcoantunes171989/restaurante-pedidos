-- ============================================================
-- MIGRATION 019 — Registro de comandas geradas (validação por empresa)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- Permite validar que a comanda usada no pedido foi realmente gerada
-- no sistema e pertence à empresa correta.
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_comandas (
  id         bigint primary key generated always as identity,
  codigo     text    not null unique,    -- ex.: PIZ-000001 (prefixo identifica a empresa)
  loja_id    bigint  not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_comandas_loja ON tab_comandas (loja_id);

-- RLS (permissiva como as demais tabelas — segurança por anon key + app)
ALTER TABLE tab_comandas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comandas_select ON tab_comandas;
DROP POLICY IF EXISTS comandas_insert ON tab_comandas;
DROP POLICY IF EXISTS comandas_update ON tab_comandas;
DROP POLICY IF EXISTS comandas_delete ON tab_comandas;
CREATE POLICY comandas_select ON tab_comandas FOR SELECT USING (true);
CREATE POLICY comandas_insert ON tab_comandas FOR INSERT WITH CHECK (true);
CREATE POLICY comandas_update ON tab_comandas FOR UPDATE USING (true);
CREATE POLICY comandas_delete ON tab_comandas FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE tab_comandas;

-- Seed: gera as comandas 000001..000030 para cada empresa existente,
-- para que os fluxos de demonstração já tenham comandas válidas.
INSERT INTO tab_comandas (codigo, loja_id)
SELECT l.prefixo || '-' || lpad(g::text, 6, '0'), l.id
  FROM tab_lojas l
  CROSS JOIN generate_series(1, 30) g
ON CONFLICT (codigo) DO NOTHING;
