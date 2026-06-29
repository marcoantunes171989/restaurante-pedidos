-- ════════════════════════════════════════════════════════════
--  062_promocao_produtos.sql
--  Permite vincular VÁRIOS produtos a uma mesma promoção (antes era 1 só,
--  via produto_id). Coluna jsonb com a lista de ids dos produtos.
--  Mantém produto_id (= 1º produto) para compatibilidade com telas antigas.
--    produto_ids: [12, 34, 56]
-- ════════════════════════════════════════════════════════════

alter table public.tab_promocoes
  add column if not exists produto_ids jsonb not null default '[]'::jsonb;
