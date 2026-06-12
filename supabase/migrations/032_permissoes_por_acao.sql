-- ════════════════════════════════════════════════════════════
--  032 — Permissões por ação dentro do módulo (briefing item 23)
--  Mapa módulo → ações liberadas, compatível com o modelo atual:
--  ids_acesso continua controlando o MENU; este campo refina as
--  AÇÕES por módulo. Formato:
--  { "products": ["ver","incluir","alterar","inativar"],
--    "cashier":  ["ver","fechar_conta","aplicar_desconto"] }
--  Ausência do módulo no mapa = todas as ações liberadas (retrocompatível).
-- ════════════════════════════════════════════════════════════

alter table public.tab_usuarios
  add column if not exists permissoes_acoes jsonb not null default '{}'::jsonb;
