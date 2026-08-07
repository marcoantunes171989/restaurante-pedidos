-- ════════════════════════════════════════════════════════════
--  Produto — dados FISCAIS (NF-e/NFC-e) e configuração OPERACIONAL
--
--  O modal de produto foi reescrito em 5 abas (Geral · Comercial &
--  Estoque · Operação · Fiscal · NF-e/NFC-e). As abas Fiscal e
--  NF-e/NFC-e são inteiramente novas e não tinham onde persistir.
--
--  Em vez de dezenas de colunas, guardamos os grupos novos em duas
--  colunas JSONB flexíveis:
--   • fiscal   → todos os campos das abas Fiscal + NF-e/NFC-e
--                (sku, ncm, cest, cfop*, cst*, aliquota*, ibs/cbs,
--                 indPres, crt, danfe, etc.).
--   • operacao → toggles/seletores NOVOS das abas Comercial/Operação
--                que ainda não têm coluna (prioridade, exibirNoPainel,
--                canais salão/retirada/delivery, regras comerciais e
--                operacionais).
--
--  Campos que já possuem coluna (is_featured, featured_label,
--  visivel_*, disponivel, controla_estoque, estoque_minimo,
--  preco_promocional, setor_id, impressora_id) continuam nas colunas
--  atuais — não migram para o JSON.
-- ════════════════════════════════════════════════════════════

alter table public.tab_produtos
  add column if not exists fiscal   jsonb not null default '{}'::jsonb,
  add column if not exists operacao jsonb not null default '{}'::jsonb;
