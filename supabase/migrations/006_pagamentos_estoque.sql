-- ============================================================
-- MIGRATION 006 — Formas de pagamento + Estoque
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Estoque nos produtos ─────────────────────────────────────
ALTER TABLE tab_produtos ADD COLUMN IF NOT EXISTS estoque integer NOT NULL DEFAULT 100;

-- ── Tabela de formas de pagamento ────────────────────────────
CREATE TABLE IF NOT EXISTS tab_formas_pagamento (
  id            bigint primary key generated always as identity,
  nome          text    not null,
  tipo          text    not null default 'outro',  -- dinheiro | cartao_credito | cartao_debito | pix | outro
  permite_troco boolean not null default false,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Dados iniciais
INSERT INTO tab_formas_pagamento (nome, tipo, permite_troco) VALUES
  ('Dinheiro',           'dinheiro',       true),
  ('Cartão de Crédito',  'cartao_credito', false),
  ('Cartão de Débito',   'cartao_debito',  false),
  ('PIX',                'pix',            false)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE tab_formas_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_select" ON tab_formas_pagamento FOR SELECT USING (true);
CREATE POLICY "fp_insert" ON tab_formas_pagamento FOR INSERT WITH CHECK (true);
CREATE POLICY "fp_update" ON tab_formas_pagamento FOR UPDATE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tab_formas_pagamento;

-- ── Tabela de pagamentos registrados (histórico/relatório) ───
CREATE TABLE IF NOT EXISTS tab_pagamentos (
  id          bigint primary key generated always as identity,
  mesa        text,
  comandas    text[]  not null default '{}',
  total       numeric(10,2) not null default 0,
  troco       numeric(10,2) not null default 0,
  detalhes    jsonb   not null default '[]',  -- [{ forma, valor }]
  criado_em   timestamptz not null default now()
);
ALTER TABLE tab_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pg_select" ON tab_pagamentos FOR SELECT USING (true);
CREATE POLICY "pg_insert" ON tab_pagamentos FOR INSERT WITH CHECK (true);
