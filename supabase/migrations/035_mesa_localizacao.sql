-- ════════════════════════════════════════════════════════════
--  035 — Mesa: localização, observação e status operacional
--  (briefing item 16 — controle operacional da mesa)
--  status_operacional: 'disponivel' | 'reservada' | null (ocupação
--  real continua derivada dos pedidos em aberto da mesa).
-- ════════════════════════════════════════════════════════════

alter table public.tab_mesas
  add column if not exists localizacao        text,
  add column if not exists observacao         text,
  add column if not exists permite_tablet     boolean not null default true,
  add column if not exists permite_qr         boolean not null default true,
  add column if not exists status_operacional text;
