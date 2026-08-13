-- ════════════════════════════════════════════════════════════
--  105 — CENTRAL FISCAL PRIME (Fase 5: Produto → config fiscal da loja)
--
--  O produto passa a apontar para a CONFIGURAÇÃO FISCAL DA LOJA
--  (loja_fiscal_regra, migration 087) em vez de repetir os parâmetros
--  tributários. Assim a tributação vem da regra importada/customizada,
--  com origem, versão, status e aviso de atualização.
--
--  ⚠️ ADITIVA E NÃO DESTRUTIVA: só ADICIONA a coluna de vínculo. Mantém
--  os campos fiscais atuais do produto (ncm_id/cfop_id/… e o JSONB fiscal)
--  para migração gradual, sem quebra de compatibilidade.
--
--  on delete set null: remover a config da loja apenas desvincula o
--  produto (não o apaga).
-- ════════════════════════════════════════════════════════════

alter table public.tab_produtos
  add column if not exists loja_fiscal_regra_id bigint
    references public.loja_fiscal_regra(id) on delete set null;

create index if not exists idx_tab_produtos_loja_fiscal_regra
  on public.tab_produtos (loja_fiscal_regra_id);
