-- ════════════════════════════════════════════════════════════
--  060_crm_config.sql
--  Configuração do CRM por EMPRESA (regras de VIP e inatividade),
--  persistida no banco (antes ficava só no localStorage do navegador).
--  Coluna jsonb em tab_lojas, no mesmo padrão de config_externo.
--    { "vipPedidos": 5, "vipValor": 200, "inatividadeDias": 30 }
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists config_crm jsonb not null default '{}'::jsonb;
