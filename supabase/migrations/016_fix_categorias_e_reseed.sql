-- ============================================================
-- MIGRATION 016 — Corrige unicidade de categorias (multi-empresa) + re-seed
-- Execute no: Supabase Dashboard → SQL Editor → New Query
-- Pode ser executada várias vezes (idempotente para as 4 empresas demo).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Corrige constraints UNIQUE globais → passam a ser por empresa
-- ─────────────────────────────────────────────────────────────
-- Categorias: o nome deve ser único POR empresa, não no sistema todo
ALTER TABLE tab_categorias DROP CONSTRAINT IF EXISTS tab_categorias_nome_key;
DROP INDEX IF EXISTS tab_categorias_nome_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_nome_loja
  ON tab_categorias (loja_id, lower(nome));

-- Formas de pagamento: idem (defensivo — só age se a constraint existir)
ALTER TABLE tab_formas_pagamento DROP CONSTRAINT IF EXISTS tab_formas_pagamento_nome_key;

-- ─────────────────────────────────────────────────────────────
-- 2) Remove empresas demo existentes (para re-seed limpo) — NÃO toca na Matriz
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_ids bigint[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM tab_lojas WHERE prefixo IN ('SUS','RES','HAM','PIZ');
  IF v_ids IS NOT NULL THEN
    DELETE FROM tab_pedidos          WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_produtos         WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_categorias       WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_formas_pagamento WHERE loja_id = ANY(v_ids);
    DELETE FROM tab_usuarios         WHERE loja_id = ANY(v_ids) AND super_admin = false;
    DELETE FROM tab_lojas            WHERE id = ANY(v_ids);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Funções auxiliares
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_demo_empresa(
  p_nome text, p_prefixo text, p_email_dominio text, p_categorias text[]
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_loja bigint; v_cat text; i int := 0;
  c_gestor bigint; c_caixa bigint; c_cozinha bigint; c_garcom bigint; c_painel bigint;
BEGIN
  INSERT INTO tab_lojas (nome, prefixo, plano, ativo, email_responsavel)
  VALUES (p_nome, p_prefixo, 'free', true, 'gestor.'||p_email_dominio)
  RETURNING id INTO v_loja;

  FOREACH v_cat IN ARRAY p_categorias LOOP
    i := i + 1;
    INSERT INTO tab_categorias (nome, ordem, ativo, loja_id) VALUES (v_cat, i, true, v_loja);
  END LOOP;

  INSERT INTO tab_formas_pagamento (nome, tipo, permite_troco, ativo, loja_id) VALUES
    ('Dinheiro','dinheiro',true,true,v_loja),
    ('Cartão de Crédito','cartao_credito',false,true,v_loja),
    ('Cartão de Débito','cartao_debito',false,true,v_loja),
    ('PIX','pix',false,true,v_loja);

  SELECT id INTO c_gestor  FROM tab_cargos WHERE lower(nome)='gestor'   LIMIT 1;
  SELECT id INTO c_caixa   FROM tab_cargos WHERE lower(nome)='caixa'    LIMIT 1;
  SELECT id INTO c_cozinha FROM tab_cargos WHERE lower(nome)='cozinha'  LIMIT 1;
  SELECT id INTO c_garcom  FROM tab_cargos WHERE lower(nome)='garçom'   LIMIT 1;
  SELECT id INTO c_painel  FROM tab_cargos WHERE lower(nome)='painel'   LIMIT 1;

  INSERT INTO tab_usuarios (nome, email, senha, perfil, cargo_id, ativo, ids_acesso, loja_id) VALUES
    ('Gestor '||p_nome,  'gestor.'||p_email_dominio,  '123456','Gestor',  c_gestor,  true, ARRAY['tablet','kitchen','panel','cashier','admin'], v_loja),
    ('Caixa '||p_nome,   'caixa.'||p_email_dominio,   '123456','Caixa',   c_caixa,   true, ARRAY['cashier'], v_loja),
    ('Cozinha '||p_nome, 'cozinha.'||p_email_dominio, '123456','Cozinha', c_cozinha, true, ARRAY['kitchen'], v_loja),
    ('Garçom '||p_nome,  'garcom.'||p_email_dominio,  '123456','Garçom',  c_garcom,  true, ARRAY['tablet'], v_loja),
    ('Painel '||p_nome,  'painel.'||p_email_dominio,  '123456','Painel',  c_painel,  true, ARRAY['panel'], v_loja);

  RETURN v_loja;
END $$;

CREATE OR REPLACE FUNCTION seed_demo_produto(
  p_loja bigint, p_nome text, p_cat text, p_preco numeric, p_custo numeric, p_tempo text, p_desc text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tab_produtos (nome, categoria, preco, custo, ativo, tempo_preparo, descricao, destaque, url_imagem, ingredientes, estoque, loja_id)
  VALUES (p_nome, p_cat, p_preco, p_custo, true, p_tempo, p_desc, '', '', '{}', 100, p_loja);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4) Seed dos 4 segmentos
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE L bigint;
BEGIN
  -- ===== SUSHI =====
  L := seed_demo_empresa('Sushi House', 'SUS', 'sushi@demo.com',
        ARRAY['Entradas','Niguiri & Sashimi','Makis','Temaki','Hot Roll','Combinados','Bebidas']);
  PERFORM seed_demo_produto(L,'Edamame','Entradas',18.90,6.50,'10-15 min','Vagens de soja cozidas com sal grosso.');
  PERFORM seed_demo_produto(L,'Guioza (6un)','Entradas',24.90,9.00,'12-18 min','Pastéis japoneses grelhados de carne suína.');
  PERFORM seed_demo_produto(L,'Sunomono','Entradas',16.90,5.50,'8-12 min','Salada de pepino agridoce com gergelim.');
  PERFORM seed_demo_produto(L,'Niguiri Salmão (2un)','Niguiri & Sashimi',19.90,8.00,'8-12 min','Bolinho de arroz coberto com salmão fresco.');
  PERFORM seed_demo_produto(L,'Sashimi Salmão (5un)','Niguiri & Sashimi',32.90,15.00,'8-12 min','Fatias de salmão fresco.');
  PERFORM seed_demo_produto(L,'Hossomaki Salmão (8un)','Makis',22.90,9.50,'10-15 min','Enrolado fino de salmão e arroz.');
  PERFORM seed_demo_produto(L,'Uramaki Filadélfia (8un)','Makis',28.90,12.00,'10-15 min','Salmão, cream cheese e cebolinha.');
  PERFORM seed_demo_produto(L,'Temaki Salmão','Temaki',26.90,11.00,'6-10 min','Cone de alga recheado com salmão e arroz.');
  PERFORM seed_demo_produto(L,'Temaki Filadélfia','Temaki',29.90,12.50,'6-10 min','Salmão, cream cheese e cebolinha no cone.');
  PERFORM seed_demo_produto(L,'Hot Roll Salmão (8un)','Hot Roll',27.90,11.50,'12-18 min','Enrolado empanado e frito com salmão.');
  PERFORM seed_demo_produto(L,'Hot Philadelphia (8un)','Hot Roll',30.90,13.00,'12-18 min','Hot roll com cream cheese e salmão.');
  PERFORM seed_demo_produto(L,'Combinado 20 peças','Combinados',69.90,30.00,'15-25 min','Mix de niguiri, sashimi e makis.');
  PERFORM seed_demo_produto(L,'Combinado 30 peças','Combinados',99.90,44.00,'15-25 min','Combinado completo para 2 pessoas.');
  PERFORM seed_demo_produto(L,'Refrigerante Lata','Bebidas',7.00,3.00,'1-3 min','Refrigerante gelado 350ml.');
  PERFORM seed_demo_produto(L,'Chá Gelado','Bebidas',9.00,3.50,'1-3 min','Chá gelado de limão 400ml.');

  -- ===== RESTAURANTE DE COMIDA =====
  L := seed_demo_empresa('Sabor Caseiro', 'RES', 'restaurante@demo.com',
        ARRAY['Entradas','Pratos principais','Massas','Guarnições','Sobremesas','Bebidas']);
  PERFORM seed_demo_produto(L,'Caldo Verde','Entradas',18.90,6.00,'10-15 min','Caldo cremoso de batata com calabresa.');
  PERFORM seed_demo_produto(L,'Bolinho de Bacalhau (6un)','Entradas',26.90,11.00,'12-18 min','Bolinhos crocantes de bacalhau.');
  PERFORM seed_demo_produto(L,'Prato Feito Executivo','Pratos principais',32.90,14.00,'15-25 min','Arroz, feijão, bife, salada e fritas.');
  PERFORM seed_demo_produto(L,'Feijoada Completa','Pratos principais',45.90,20.00,'20-30 min','Feijoada com acompanhamentos.');
  PERFORM seed_demo_produto(L,'Filé à Parmegiana','Pratos principais',48.90,22.00,'20-30 min','Filé empanado com molho e queijo.');
  PERFORM seed_demo_produto(L,'Strogonoff de Frango','Pratos principais',39.90,17.00,'15-25 min','Strogonoff com arroz e batata palha.');
  PERFORM seed_demo_produto(L,'Picanha na Chapa','Pratos principais',64.90,30.00,'20-30 min','Picanha grelhada com acompanhamentos.');
  PERFORM seed_demo_produto(L,'Lasanha à Bolonhesa','Massas',38.90,16.00,'18-28 min','Lasanha caseira ao molho bolonhesa.');
  PERFORM seed_demo_produto(L,'Macarronada','Massas',29.90,11.00,'15-22 min','Macarrão ao sugo com parmesão.');
  PERFORM seed_demo_produto(L,'Porção de Fritas','Guarnições',22.90,8.00,'10-15 min','Batata frita crocante.');
  PERFORM seed_demo_produto(L,'Arroz e Feijão','Guarnições',14.90,5.00,'8-12 min','Porção de arroz branco e feijão.');
  PERFORM seed_demo_produto(L,'Pudim de Leite','Sobremesas',14.90,5.00,'2-5 min','Pudim cremoso de leite condensado.');
  PERFORM seed_demo_produto(L,'Mousse de Maracujá','Sobremesas',13.90,4.50,'2-5 min','Mousse gelada de maracujá.');
  PERFORM seed_demo_produto(L,'Suco Natural','Bebidas',10.90,3.50,'3-6 min','Suco da fruta 400ml.');
  PERFORM seed_demo_produto(L,'Refrigerante Lata','Bebidas',7.00,3.00,'1-3 min','Refrigerante gelado 350ml.');

  -- ===== HAMBURGUERIA =====
  L := seed_demo_empresa('Burger Station', 'HAM', 'hamburgueria@demo.com',
        ARRAY['Hambúrgueres','Combos','Acompanhamentos','Sobremesas','Bebidas']);
  PERFORM seed_demo_produto(L,'Cheeseburger','Hambúrgueres',22.90,9.00,'12-18 min','Pão, hambúrguer 120g, queijo e molho.');
  PERFORM seed_demo_produto(L,'X-Salada','Hambúrgueres',25.90,10.50,'12-18 min','Hambúrguer, queijo, alface e tomate.');
  PERFORM seed_demo_produto(L,'X-Bacon','Hambúrgueres',28.90,12.00,'12-18 min','Hambúrguer, queijo e bacon crocante.');
  PERFORM seed_demo_produto(L,'X-Tudo','Hambúrgueres',34.90,15.00,'15-22 min','Completo com ovo, bacon e salada.');
  PERFORM seed_demo_produto(L,'Smash Duplo','Hambúrgueres',32.90,14.00,'12-18 min','Dois smash 80g com queijo.');
  PERFORM seed_demo_produto(L,'Burger Vegetariano','Hambúrgueres',29.90,12.00,'12-18 min','Hambúrguer de grão-de-bico e legumes.');
  PERFORM seed_demo_produto(L,'Combo Cheese + Fritas + Refri','Combos',36.90,16.00,'15-22 min','Cheeseburger, batata e refrigerante.');
  PERFORM seed_demo_produto(L,'Combo Bacon + Fritas + Refri','Combos',42.90,19.00,'15-22 min','X-Bacon, batata e refrigerante.');
  PERFORM seed_demo_produto(L,'Batata Frita','Acompanhamentos',18.90,6.00,'8-14 min','Porção de batata crocante.');
  PERFORM seed_demo_produto(L,'Batata com Cheddar e Bacon','Acompanhamentos',26.90,10.00,'10-16 min','Batata com cheddar e bacon.');
  PERFORM seed_demo_produto(L,'Onion Rings','Acompanhamentos',22.90,8.00,'10-16 min','Anéis de cebola empanados.');
  PERFORM seed_demo_produto(L,'Nuggets (10un)','Acompanhamentos',24.90,9.00,'10-16 min','Nuggets de frango com molho.');
  PERFORM seed_demo_produto(L,'Milkshake','Sobremesas',18.90,7.00,'5-8 min','Milkshake cremoso 400ml.');
  PERFORM seed_demo_produto(L,'Refrigerante Lata','Bebidas',7.00,3.00,'1-3 min','Refrigerante gelado 350ml.');
  PERFORM seed_demo_produto(L,'Suco Lata','Bebidas',8.00,3.20,'1-3 min','Suco gelado 350ml.');

  -- ===== PIZZARIA =====
  L := seed_demo_empresa('Forno & Lenha', 'PIZ', 'pizzaria@demo.com',
        ARRAY['Pizzas Salgadas','Pizzas Doces','Bordas','Bebidas']);
  PERFORM seed_demo_produto(L,'Pizza Margherita','Pizzas Salgadas',42.90,16.00,'20-30 min','Molho, muçarela, tomate e manjericão.');
  PERFORM seed_demo_produto(L,'Pizza Calabresa','Pizzas Salgadas',44.90,17.00,'20-30 min','Calabresa fatiada e cebola.');
  PERFORM seed_demo_produto(L,'Pizza Portuguesa','Pizzas Salgadas',48.90,19.00,'20-30 min','Presunto, ovo, cebola e ervilha.');
  PERFORM seed_demo_produto(L,'Pizza Quatro Queijos','Pizzas Salgadas',52.90,21.00,'20-30 min','Muçarela, provolone, parmesão e gorgonzola.');
  PERFORM seed_demo_produto(L,'Pizza Frango c/ Catupiry','Pizzas Salgadas',49.90,20.00,'20-30 min','Frango desfiado com catupiry.');
  PERFORM seed_demo_produto(L,'Pizza Pepperoni','Pizzas Salgadas',51.90,21.00,'20-30 min','Muçarela e fatias de pepperoni.');
  PERFORM seed_demo_produto(L,'Pizza Vegetariana','Pizzas Salgadas',47.90,18.00,'20-30 min','Legumes grelhados e muçarela.');
  PERFORM seed_demo_produto(L,'Pizza Bacon','Pizzas Salgadas',50.90,20.00,'20-30 min','Muçarela e bacon crocante.');
  PERFORM seed_demo_produto(L,'Pizza Napolitana','Pizzas Salgadas',46.90,18.00,'20-30 min','Muçarela, tomate e parmesão.');
  PERFORM seed_demo_produto(L,'Pizza Chocolate','Pizzas Doces',44.90,16.00,'18-26 min','Chocolate ao leite derretido.');
  PERFORM seed_demo_produto(L,'Pizza Banana c/ Canela','Pizzas Doces',42.90,15.00,'18-26 min','Banana, açúcar e canela.');
  PERFORM seed_demo_produto(L,'Pizza Romeu e Julieta','Pizzas Doces',45.90,16.50,'18-26 min','Goiabada com queijo.');
  PERFORM seed_demo_produto(L,'Borda Recheada Catupiry','Bordas',9.90,3.00,'1-3 min','Adicional de borda recheada.');
  PERFORM seed_demo_produto(L,'Refrigerante 2L','Bebidas',14.90,7.00,'1-3 min','Refrigerante 2 litros.');
  PERFORM seed_demo_produto(L,'Suco Natural 500ml','Bebidas',12.90,4.50,'3-6 min','Suco da fruta 500ml.');
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5) Limpeza das funções
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS seed_demo_produto(bigint, text, text, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS seed_demo_empresa(text, text, text, text[]);

-- ─────────────────────────────────────────────────────────────
-- 6) Conferência
-- ─────────────────────────────────────────────────────────────
SELECT l.nome, l.prefixo, l.ativo,
       (SELECT count(*) FROM tab_produtos  p WHERE p.loja_id=l.id) AS produtos,
       (SELECT count(*) FROM tab_categorias c WHERE c.loja_id=l.id) AS categorias,
       (SELECT count(*) FROM tab_usuarios  u WHERE u.loja_id=l.id) AS usuarios
  FROM tab_lojas l ORDER BY l.id;
