-- ════════════════════════════════════════════════════════════
--  034 — Produto: estoque avançado, promoção e visibilidade
--  (briefing item 14 — seções Estoque e Visibilidade do produto)
-- ════════════════════════════════════════════════════════════

alter table public.tab_produtos
  add column if not exists controla_estoque   boolean not null default false,
  add column if not exists estoque_minimo     integer not null default 0,
  add column if not exists estoque_maximo     integer,
  add column if not exists unidade            text,
  add column if not exists preco_promocional  numeric(10,2),
  add column if not exists visivel_tablet     boolean not null default true,
  add column if not exists visivel_qr         boolean not null default true,
  add column if not exists visivel_externo    boolean not null default true,
  add column if not exists obs_interna        text,
  add column if not exists obs_cozinha        text,
  add column if not exists ordem_exibicao     integer;
