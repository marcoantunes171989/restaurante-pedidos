-- ════════════════════════════════════════════════════════════
--  038 — Produtos em destaque + disponibilidade
--  ADITIVO. Colunas com default seguro: nenhum produto existente
--  muda de comportamento (destaque off, disponível por padrão).
-- ════════════════════════════════════════════════════════════

alter table public.tab_produtos
  add column if not exists is_featured    boolean not null default false,
  add column if not exists featured_label text,
  add column if not exists featured_order integer not null default 0,
  add column if not exists show_on_home   boolean not null default true,
  add column if not exists disponivel     boolean not null default true;

create index if not exists idx_tab_produtos_featured on public.tab_produtos (is_featured, featured_order);
