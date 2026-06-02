-- ============================================================
-- MIGRATION 014 — Cargos / Perfis (cadastro reutilizável)
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Tabela de cargos/perfis (definições reutilizáveis no cadastro de usuário)
CREATE TABLE IF NOT EXISTS tab_cargos (
  id         bigint primary key generated always as identity,
  nome       text    not null,
  descricao  text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Vínculo do usuário ao cargo (mantém também o nome em tab_usuarios.perfil para histórico)
ALTER TABLE tab_usuarios ADD COLUMN IF NOT EXISTS cargo_id bigint REFERENCES tab_cargos(id);

-- Cargos iniciais (idempotente por nome)
INSERT INTO tab_cargos (nome, descricao)
SELECT v.nome, v.descricao FROM (VALUES
  ('Gestor',   'Administração geral da empresa'),
  ('Operador', 'Operação geral do sistema'),
  ('Caixa',    'Financeiro e fechamento de contas'),
  ('Cozinha',  'Produção e preparo dos pedidos'),
  ('Garçom',   'Atendimento e comandas das mesas'),
  ('Painel',   'Exibição do painel de pedidos'),
  ('Cliente',  'Acesso ao tablet/cardápio')
) AS v(nome, descricao)
WHERE NOT EXISTS (SELECT 1 FROM tab_cargos c WHERE c.nome = v.nome);

-- Vincula cargo_id dos usuários existentes pelo nome do perfil já gravado
UPDATE tab_usuarios u
   SET cargo_id = c.id
  FROM tab_cargos c
 WHERE u.cargo_id IS NULL AND lower(u.perfil) = lower(c.nome);

-- RLS + Realtime
ALTER TABLE tab_cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cargos_select ON tab_cargos;
DROP POLICY IF EXISTS cargos_insert ON tab_cargos;
DROP POLICY IF EXISTS cargos_update ON tab_cargos;
DROP POLICY IF EXISTS cargos_delete ON tab_cargos;
CREATE POLICY cargos_select ON tab_cargos FOR SELECT USING (true);
CREATE POLICY cargos_insert ON tab_cargos FOR INSERT WITH CHECK (true);
CREATE POLICY cargos_update ON tab_cargos FOR UPDATE USING (true);
CREATE POLICY cargos_delete ON tab_cargos FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE tab_cargos;
