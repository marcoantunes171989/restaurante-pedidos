-- ════════════════════════════════════════════════════════════
--  054_setores_cozinha_indices.sql  (OPCIONAL)
--  Índices de performance + unicidade para os setores de cozinha.
--
--  A tela "Setores de Cozinha" reutiliza a tabela EXISTENTE
--  public.tab_setores_cozinha (criada na migration 041) e a coluna
--  public.tab_produtos.setor_id — NÃO cria tabelas novas, para não
--  quebrar o vínculo produto↔setor já em uso.
--
--  Esta migration apenas reforça índices. O front-end já valida
--  duplicidade (case-insensitive por loja); o índice único abaixo
--  garante isso também no banco.
--
--  ⚠️ Se a criação do índice ÚNICO falhar, há setores com nome
--  repetido na mesma loja — renomeie/limpe antes de reaplicar.
-- ════════════════════════════════════════════════════════════

create unique index if not exists idx_unique_setor_cozinha_loja_nome
  on public.tab_setores_cozinha (loja_id, lower(nome));

create index if not exists idx_setor_cozinha_loja
  on public.tab_setores_cozinha (loja_id);

create index if not exists idx_setor_cozinha_ativo
  on public.tab_setores_cozinha (ativo);

create index if not exists idx_produtos_setor_id
  on public.tab_produtos (setor_id);
