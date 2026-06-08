-- ════════════════════════════════════════════════════════════
--  029 — Adicionais (extras) por produto
--  Lista de extras cadastrados e vinculados ao produto, que o
--  cliente pode selecionar ao pedir. Formato: [{ "nome": "Bacon",
--  "preco": 4.5 }, ...]
-- ════════════════════════════════════════════════════════════

alter table public.tab_produtos
  add column if not exists adicionais jsonb not null default '[]'::jsonb;
