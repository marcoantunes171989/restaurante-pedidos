-- ════════════════════════════════════════════════════════════
--  070 — Auditoria categorias × produtos (cardápio digital)
--
--  Este arquivo é SÓ DIAGNÓSTICO — nenhuma linha altera dado nenhum
--  (só SELECT). Rode manualmente no SQL Editor do Supabase quando quiser
--  conferir a saúde do vínculo produto→categoria usado pela navegação do
--  cardápio digital (src/CardapioPublico.jsx + src/lib/cardapioCategorias.js).
--
--  Colunas em português (schema real do banco — tab_produtos.nome,
--  .categoria, .ativo; tab_categorias.nome, .ativo — não confundir com os
--  nomes em inglês (name/category/active) usados só no lado JS, traduzidos
--  em src/lib/supabase.js).
--
--  O FRONT-END já é tolerante a cada um destes casos (produto sem
--  categoria_id cai no fallback por texto/"Outros", categoria inativa não
--  aparece, nome duplicado gera IDs únicos no DOM) — rodar isso não é
--  obrigatório pro cardápio funcionar. Serve pra você decidir se vale a
--  pena arrumar os dados na origem (cadastro de produto/categoria).
-- ════════════════════════════════════════════════════════════

-- 1) Produtos com categoria_id que aponta pra uma categoria que NÃO existe
--    mais (deveria ser impossível — a FK de migration 068 é ON DELETE
--    RESTRICT — mas confere mesmo assim). Se isso retornar alguma linha,
--    algo escreveu categoria_id direto no banco por fora do app.
select p.id, p.nome, p.categoria_id, p.loja_id
  from public.tab_produtos p
 where p.categoria_id is not null
   and not exists (
     select 1 from public.tab_categorias c where c.id = p.categoria_id
   );

-- 2) Produtos ainda sem categoria_id (usando o fallback por texto,
--    tab_produtos.categoria) — candidatos a vincular pelo admin pra ganhar
--    ordenação/robustez completa (nome renomeado não quebra o vínculo).
select id, nome, categoria, loja_id
  from public.tab_produtos
 where categoria_id is null
 order by loja_id, categoria;

-- 3) Categorias INATIVAS que ainda têm produto ATIVO vinculado — o produto
--    continua aparecendo no cardápio (o front-end agrupa pelo texto salvo
--    no produto quando a categoria cadastrada está inativa), só não como
--    parte da lista de categorias/carrossel. Útil pra decidir se a
--    categoria devia ser reativada ou os produtos remapeados.
select c.id as categoria_id, c.nome as categoria_nome, c.loja_id,
       count(p.id) as produtos_ativos_vinculados
  from public.tab_categorias c
  join public.tab_produtos p on p.categoria_id = c.id and p.ativo
 where c.ativo = false
 group by c.id, c.nome, c.loja_id
having count(p.id) > 0;

-- 4) Categorias com o MESMO nome cadastradas duas vezes na mesma empresa —
--    não quebra a navegação (cada categoria tem seu próprio id/seção), mas
--    é sinal de cadastro duplicado por engano.
select loja_id, nome, count(*) as qtd, array_agg(id order by id) as ids
  from public.tab_categorias
 where ativo is not false
 group by loja_id, nome
having count(*) > 1;
