-- ============================================================
-- MIGRATION 018 — Imagens realistas por produto (demo)
-- Define url_imagem com foto temática (loremflickr) conforme o tipo do prato.
-- Estável por produto via ?lock=<id>. Execute no SQL Editor.
-- (As mesmas imagens já foram aplicadas via API durante a validação;
--  este script reproduz o resultado caso a base seja recriada.)
-- ============================================================
UPDATE tab_produtos SET url_imagem =
  'https://loremflickr.com/600/400/' ||
  CASE
    WHEN lower(nome) LIKE '%pizza%'        THEN 'pizza'
    WHEN lower(nome) LIKE '%sashimi%'      THEN 'sashimi'
    WHEN lower(nome) LIKE '%niguiri%'      THEN 'nigiri'
    WHEN lower(nome) LIKE '%temaki%'       THEN 'temaki'
    WHEN lower(nome) LIKE '%uramaki%'      THEN 'sushi-roll'
    WHEN lower(nome) LIKE '%hossomaki%'    THEN 'sushi-roll'
    WHEN lower(nome) LIKE '%hot %'         THEN 'sushi-roll'
    WHEN lower(nome) LIKE '%philadelphia%' THEN 'sushi-roll'
    WHEN lower(nome) LIKE '%combinado%'    THEN 'sushi'
    WHEN lower(nome) LIKE '%edamame%'      THEN 'edamame'
    WHEN lower(nome) LIKE '%guioza%'       THEN 'gyoza'
    WHEN lower(nome) LIKE '%sunomono%'     THEN 'cucumber-salad'
    WHEN lower(nome) LIKE '%cheeseburger%' THEN 'cheeseburger'
    WHEN lower(nome) LIKE '%x-%'           THEN 'hamburger'
    WHEN lower(nome) LIKE '%smash%'        THEN 'hamburger'
    WHEN lower(nome) LIKE '%burger%'       THEN 'hamburger'
    WHEN lower(nome) LIKE '%combo%'        THEN 'hamburger'
    WHEN lower(nome) LIKE '%batata com%'   THEN 'loaded-fries'
    WHEN lower(nome) LIKE '%batata%'       THEN 'french-fries'
    WHEN lower(nome) LIKE '%fritas%'       THEN 'french-fries'
    WHEN lower(nome) LIKE '%onion%'        THEN 'onion-rings'
    WHEN lower(nome) LIKE '%nuggets%'      THEN 'chicken-nuggets'
    WHEN lower(nome) LIKE '%milkshake%'    THEN 'milkshake'
    WHEN lower(nome) LIKE '%refrigerante%' THEN 'soda'
    WHEN lower(nome) LIKE '%suco%'         THEN 'orange-juice'
    WHEN lower(nome) LIKE '%chá%'          THEN 'iced-tea'
    WHEN lower(nome) LIKE '%feijoada%'     THEN 'feijoada'
    WHEN lower(nome) LIKE '%parmegiana%'   THEN 'schnitzel'
    WHEN lower(nome) LIKE '%strogonoff%'   THEN 'stroganoff'
    WHEN lower(nome) LIKE '%picanha%'      THEN 'steak'
    WHEN lower(nome) LIKE '%lasanha%'      THEN 'lasagna'
    WHEN lower(nome) LIKE '%macarron%'     THEN 'pasta'
    WHEN lower(nome) LIKE '%pudim%'        THEN 'flan'
    WHEN lower(nome) LIKE '%mousse%'       THEN 'mousse'
    WHEN lower(nome) LIKE '%caldo%'        THEN 'soup'
    WHEN lower(nome) LIKE '%bacalhau%'     THEN 'codfish'
    WHEN lower(nome) LIKE '%prato feito%'  THEN 'rice-beans-steak'
    WHEN lower(nome) LIKE '%arroz%'        THEN 'rice-beans'
    WHEN lower(nome) LIKE '%borda%'        THEN 'pizza'
    WHEN lower(categoria) LIKE '%bebida%'    THEN 'drink'
    WHEN lower(categoria) LIKE '%sobremesa%' THEN 'dessert'
    WHEN lower(categoria) LIKE '%entrada%'   THEN 'appetizer'
    ELSE 'food'
  END || '/all?lock=' || id::text;
