-- ============================================================
-- MIGRATION 002 — Dados iniciais (seed)
-- Execute APÓS a migration 001
-- ============================================================

-- ── Permissões de acesso ─────────────────────────────────────
insert into accesses (id, label, description, type) values
  ('tablet',  'Tablet do cliente', 'Pedido, comanda e solicitação de conta',    'Operacional'),
  ('kitchen', 'Cozinha',           'Pedidos recebidos, preparo e finalização',  'Operacional'),
  ('panel',   'Painel público',    'Acompanhamento dos pedidos',                'Visualização'),
  ('cashier', 'Pagamento',         'Conta da mesa e fechamento',                'Financeiro'),
  ('admin',   'Administrativo',    'Produtos, preços, usuários e permissões',   'Gestão')
on conflict (id) do nothing;

-- ── Usuários demo (senha: 123456) ────────────────────────────
insert into app_users (name, email, password, role, active, access_ids) values
  ('Administrador', 'admin@restaurante.com',    '123456', 'Gestor',     true, ARRAY['tablet','kitchen','panel','cashier','admin']),
  ('Tablet Mesa',   'tablet@restaurante.com',   '123456', 'Cliente',    true, ARRAY['tablet','panel']),
  ('Equipe Cozinha','cozinha@restaurante.com',  '123456', 'Produção',   true, ARRAY['kitchen']),
  ('Painel TV',     'painel@restaurante.com',   '123456', 'Painel',     true, ARRAY['panel']),
  ('Caixa',         'caixa@restaurante.com',    '123456', 'Financeiro', true, ARRAY['cashier'])
on conflict (email) do nothing;

-- ── Produtos do cardápio ─────────────────────────────────────
insert into products (name, category, price, cost, active, time, description, badge, image_url, ingredients) values
(
  'Risoto de Filé Mignon', 'Pratos principais', 58.90, 31.20, true, '25-35 min',
  'Arroz arbóreo, filé em tiras, parmesão e toque de vinho branco.',
  'Mais pedido',
  'https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=900&q=80',
  ARRAY['Arroz arbóreo','Filé mignon','Parmesão','Vinho branco','Manteiga','Caldo especial']
),
(
  'Parmegiana Executivo', 'Pratos principais', 46.50, 24.80, true, '20-30 min',
  'Filé empanado, molho artesanal, queijo gratinado, arroz e fritas.',
  'Clássico',
  'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?auto=format&fit=crop&w=900&q=80',
  ARRAY['Filé empanado','Molho de tomate','Muçarela','Arroz','Batata frita','Orégano']
),
(
  'Burger Artesanal', 'Lanches', 34.90, 17.60, true, '15-25 min',
  'Blend bovino, cheddar, bacon, cebola caramelizada e molho da casa.',
  'Novo',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
  ARRAY['Pão brioche','Blend bovino','Cheddar','Bacon','Cebola caramelizada','Molho da casa']
),
(
  'Salada Mediterrânea', 'Entradas', 29.90, 12.40, true, '10-15 min',
  'Mix de folhas, tomate cereja, queijo branco, azeitonas e azeite especial.',
  'Leve',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',
  ARRAY['Alface','Rúcula','Tomate cereja','Queijo branco','Azeitonas','Azeite especial']
),
(
  'Suco Natural 500ml', 'Bebidas', 12.90, 4.10, true, '5-10 min',
  'Laranja, limão, abacaxi, maracujá ou morango.',
  'Natural',
  'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=80',
  ARRAY['Fruta natural','Água filtrada','Gelo','Açúcar opcional']
),
(
  'Pudim da Casa', 'Sobremesas', 17.90, 6.70, true, '5-10 min',
  'Pudim cremoso com calda de caramelo artesanal.',
  'Especial',
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
  ARRAY['Leite condensado','Leite','Ovos','Calda de caramelo']
);
