-- ============================================================
-- MIGRATION 011 — Multi-loja (multi-empresa)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Tabela de lojas/empresas
CREATE TABLE IF NOT EXISTS tab_lojas (
  id         bigint primary key generated always as identity,
  nome       text    not null,
  prefixo    text    not null unique,   -- iniciais para a comanda (ex.: PZB)
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Loja padrão (matriz) usando o prefixo atual CMD
INSERT INTO tab_lojas (nome, prefixo) VALUES ('Matriz', 'CMD')
ON CONFLICT (prefixo) DO NOTHING;

-- Vincula loja_id nas tabelas
ALTER TABLE tab_usuarios        ADD COLUMN IF NOT EXISTS loja_id bigint;
ALTER TABLE tab_produtos        ADD COLUMN IF NOT EXISTS loja_id bigint;
ALTER TABLE tab_pedidos         ADD COLUMN IF NOT EXISTS loja_id bigint;
ALTER TABLE tab_categorias      ADD COLUMN IF NOT EXISTS loja_id bigint;
ALTER TABLE tab_formas_pagamento ADD COLUMN IF NOT EXISTS loja_id bigint;

-- Atribui os dados existentes à matriz
UPDATE tab_usuarios        SET loja_id = (SELECT id FROM tab_lojas WHERE prefixo='CMD') WHERE loja_id IS NULL;
UPDATE tab_produtos        SET loja_id = (SELECT id FROM tab_lojas WHERE prefixo='CMD') WHERE loja_id IS NULL;
UPDATE tab_pedidos         SET loja_id = (SELECT id FROM tab_lojas WHERE prefixo='CMD') WHERE loja_id IS NULL;
UPDATE tab_categorias      SET loja_id = (SELECT id FROM tab_lojas WHERE prefixo='CMD') WHERE loja_id IS NULL;
UPDATE tab_formas_pagamento SET loja_id = (SELECT id FROM tab_lojas WHERE prefixo='CMD') WHERE loja_id IS NULL;

-- RLS da tabela de lojas
ALTER TABLE tab_lojas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lojas_select" ON tab_lojas FOR SELECT USING (true);
CREATE POLICY "lojas_insert" ON tab_lojas FOR INSERT WITH CHECK (true);
CREATE POLICY "lojas_update" ON tab_lojas FOR UPDATE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tab_lojas;
