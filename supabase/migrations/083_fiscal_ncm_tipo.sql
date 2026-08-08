-- ════════════════════════════════════════════════════════════
--  083 — Campo "tipo" no cadastro de NCM (importação da TIPI)
--
--  A importação da Tabela TIPI (XLSX) traz, por NCM: código, descrição e
--  o "tipo" (coluna ALÍQUOTA da TIPI — ex.: "NT" = não tributado, ou a
--  alíquota de IPI). Guardamos esse valor no NCM para referência.
-- ════════════════════════════════════════════════════════════

alter table public.tab_fiscal_ncm
  add column if not exists tipo text;
