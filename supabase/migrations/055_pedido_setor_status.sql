-- ════════════════════════════════════════════════════════════
--  055_pedido_setor_status.sql
--  Status por setor (cozinha / bar) dentro de um mesmo pedido.
--
--  Em vez de uma tabela à parte, guardamos um mapa jsonb no próprio
--  pedido: { "cozinha": "ready", "bar": "preparing" }. Simples, sem
--  joins e tolerante (front-end funciona com ou sem esta coluna).
--
--  O status GERAL do pedido (coluna status) continua sendo a fonte de
--  verdade para todas as telas existentes — ele só avança para "pronto"
--  quando TODOS os setores com itens estão prontos. Enquanto isso, a
--  Operação Mobile mostra "parcialmente pronto".
-- ════════════════════════════════════════════════════════════

alter table public.tab_pedidos
  add column if not exists setor_status jsonb not null default '{}'::jsonb;
