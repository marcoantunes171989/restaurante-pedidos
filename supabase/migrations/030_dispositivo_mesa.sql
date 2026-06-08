-- ════════════════════════════════════════════════════════════
--  030 — Mesa em uso por aparelho (tab_dispositivos.mesa)
--  Cada tablet reporta a mesa que está atendendo. Assim a tela de
--  seleção de mesa mostra como indisponível a mesa já em uso por
--  outro dispositivo (ativo recentemente).
-- ════════════════════════════════════════════════════════════

alter table public.tab_dispositivos
  add column if not exists mesa text;
