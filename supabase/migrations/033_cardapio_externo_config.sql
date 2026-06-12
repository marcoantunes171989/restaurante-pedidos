-- ════════════════════════════════════════════════════════════
--  033 — Configurações do cardápio externo (briefing item 19)
--  Um JSONB por empresa cobrindo as abas: pedido externo, pagamento,
--  entrega/retirada e horários. Formato sugerido:
--  {
--    "aceitaPedidoExterno": true, "consumoLocal": true,
--    "entrega": true, "retirada": true, "pedidoMinimo": 20,
--    "pagamento": { "online": false, "naEntrega": true, "naRetirada": true,
--                   "formas": ["pix","cartao","dinheiro"] },
--    "taxaEntrega": 8, "tempoEntregaMin": 45, "areaAtendimento": "",
--    "obsEntrega": "",
--    "horarios": { "seg": ["18:00","23:00"], ... },
--    "bloquearForaHorario": true
--  }
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists config_externo jsonb not null default '{}'::jsonb;
