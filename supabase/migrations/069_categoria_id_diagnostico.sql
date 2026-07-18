-- ════════════════════════════════════════════════════════════
--  069 — Diagnóstico + reforço do vínculo categoria_id (migration 068)
--
--  Depois de rodar a 068, o agrupamento por categoria no cardápio ainda
--  não refletiu a mudança. As duas causas mais prováveis (e o motivo de
--  cada uma produzir EXATAMENTE o mesmo sintoma — tudo continua
--  agrupado como antes, pelo texto):
--
--  A) Cache de schema do PostgREST desatualizado — quando uma coluna é
--     criada via SQL Editor (fora do fluxo de migration do painel), a
--     API (PostgREST) às vezes só percebe a coluna nova depois de um
--     "reload". Até lá, `select('*')` do app simplesmente NÃO traz
--     categoria_id (sem erro nenhum) — todo produto volta com
--     categoria_id ausente, e o app usa o mesmo caminho de antes (por
--     texto) pra 100% dos produtos. É indistinguível de "não migrou".
--
--  B) O backfill (passo 4 da 068) comparava o nome EXATO
--     (`c.nome = p.categoria`) — qualquer diferença de espaço, maiúscula
--     ou acento entre o texto salvo no produto e o nome cadastrado na
--     categoria faz a correspondência falhar silenciosamente, e o
--     produto fica com categoria_id NULL (cai no mesmo fallback por
--     texto de sempre).
--
--  EXECUÇÃO MANUAL — cole este arquivo inteiro no SQL Editor.
--  Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ════════════════════════════════════════════════════════════

-- 1) Força o PostgREST a recarregar o schema agora (cobre a causa A).
--    Sem efeito nos dados — só avisa a API que existe coluna nova.
notify pgrst, 'reload schema';

-- 2) Reforça o backfill: ignora espaços nas pontas e maiúscula/minúscula
--    na comparação (cobre a causa B). Só toca produto que AINDA está
--    com categoria_id nulo — não sobrescreve nenhum vínculo já feito.
update public.tab_produtos p
   set categoria_id = c.id
  from public.tab_categorias c
 where p.categoria_id is null
   and trim(lower(c.nome)) = trim(lower(p.categoria))
   and c.loja_id is not distinct from p.loja_id;

-- 3) DIAGNÓSTICO — rode esta consulta e confira o resultado:
--    • Se "sem_vinculo" continuar igual ao total de produtos mesmo
--      depois do passo 2 acima → o nome salvo no produto não tem
--      NENHUMA categoria cadastrada correspondente (diferença maior que
--      espaço/maiúscula, ou a categoria foi excluída). Veja a segunda
--      consulta (item 4) para identificar quais.
--    • Se "com_vinculo" > 0 mas o cardápio digital continuar sem
--      agrupar corretamente → é a causa A (cache do PostgREST) ou algo
--      no front-end; nesse caso aguarde ~1 min após o passo 1 acima e
--      teste de novo (o reload do schema não é sempre instantâneo).
select
  count(*) filter (where categoria_id is not null) as com_vinculo,
  count(*) filter (where categoria_id is null)     as sem_vinculo,
  count(*)                                          as total
from public.tab_produtos;

-- 4) Lista os produtos que ainda ficaram sem vínculo, pra corrigir a
--    categoria deles manualmente no admin (ela é obrigatória agora).
-- select id, nome, categoria, loja_id
--   from public.tab_produtos
--  where categoria_id is null
--  order by loja_id, categoria;
