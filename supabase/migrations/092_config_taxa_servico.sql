-- ════════════════════════════════════════════════════════════
--  092_config_taxa_servico.sql
--
--  Persiste a taxa de serviço por empresa em tab_lojas
--  (antes ficava só no localStorage do navegador — cada caixa
--  podia ter regra diferente).
--
--  Formato JSONB (mesmo contrato do front):
--    {
--      "enabled": true,
--      "percent": 10,
--      "chargingRule": "opcional",   -- fixa | opcional | nao_cobrar
--      "partialStrategy": "proporcional_itens"
--    }
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists config_taxa_servico jsonb not null default '{}'::jsonb;

comment on column public.tab_lojas.config_taxa_servico is
  'Parametrização da taxa de serviço do PDV/caixa por empresa.';
