-- ════════════════════════════════════════════════════════════════════════
--  211_desempenho_para_escala.sql — desempenho do banco para muitas empresas
--
--  Origem: diagnóstico somente leitura do HML em 2026-11-27.
--   1. Cada consulta procurava o usuário percorrendo a tabela inteira (milhões de leituras completas): índice por e-mail.
--   2. Listas por empresa sem índice (produtos, formas de pagamento, opções, pagamentos…) e sem índice por empresa + data.
--   3. As regras de acesso recalculavam "quem é o usuário" para CADA linha; passam a calcular uma vez por consulta.
--      O resultado das regras é o mesmo.
--  Não altera dados nem permissões. Idempotente. Rode depois da 210, primeiro na HOMOLOGAÇÃO.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin if to_regclass('public.tab_usuarios') is not null then create index if not exists idx_pp_usuarios_email_norm on public.tab_usuarios (lower(trim(email))); end if; end $$;
do $$ begin if to_regclass('public.tab_usuarios') is not null then create index if not exists idx_pp_usuarios_loja on public.tab_usuarios (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_pedidos') is not null then create index if not exists idx_pp_pedidos_loja_data on public.tab_pedidos (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_produtos') is not null then create index if not exists idx_pp_produtos_loja on public.tab_produtos (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_clientes') is not null then create index if not exists idx_pp_clientes_loja_data on public.tab_clientes (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_chamados') is not null then create index if not exists idx_pp_chamados_loja_data on public.tab_chamados (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_estoque_mov') is not null then create index if not exists idx_pp_estoque_loja_data on public.tab_estoque_mov (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_estoque_mov') is not null then create index if not exists idx_pp_estoque_produto on public.tab_estoque_mov (produto_id); end if; end $$;
do $$ begin if to_regclass('public.tab_fidelidade_transacoes') is not null then create index if not exists idx_pp_fidelidade_loja_data on public.tab_fidelidade_transacoes (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_fidelidade_transacoes') is not null then create index if not exists idx_pp_fidelidade_pedido on public.tab_fidelidade_transacoes (order_id); end if; end $$;
do $$ begin if to_regclass('public.tab_pesquisa_satisfacao') is not null then create index if not exists idx_pp_pesquisa_loja_data on public.tab_pesquisa_satisfacao (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_lancamentos') is not null then create index if not exists idx_pp_lancamentos_loja_data on public.tab_lancamentos (loja_id, data desc); end if; end $$;
do $$ begin if to_regclass('public.tab_caixas') is not null then create index if not exists idx_pp_caixas_loja_data on public.tab_caixas (loja_id, aberto_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_caixa_mov') is not null then create index if not exists idx_pp_caixa_mov_loja on public.tab_caixa_mov (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_fiscal_lote_log') is not null then create index if not exists idx_pp_lote_log_loja_data on public.tab_fiscal_lote_log (loja_id, criado_em desc); end if; end $$;
do $$ begin if to_regclass('public.tab_fiscal_lote_log') is not null then create index if not exists idx_pp_lote_log_produto on public.tab_fiscal_lote_log (produto_id); end if; end $$;
do $$ begin if to_regclass('public.tab_formas_pagamento') is not null then create index if not exists idx_pp_formas_loja on public.tab_formas_pagamento (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_opcoes') is not null then create index if not exists idx_pp_opcoes_loja on public.tab_opcoes (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_pagamentos') is not null then create index if not exists idx_pp_pagamentos_loja on public.tab_pagamentos (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_notificacoes') is not null then create index if not exists idx_pp_notificacoes_loja on public.tab_notificacoes (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_notificacao_prefs') is not null then create index if not exists idx_pp_notif_prefs_loja on public.tab_notificacao_prefs (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_pedido_endereco') is not null then create index if not exists idx_pp_pedido_endereco_loja on public.tab_pedido_endereco (loja_id); end if; end $$;
do $$ begin if to_regclass('public.tab_promocoes') is not null then create index if not exists idx_pp_promocoes_produto on public.tab_promocoes (produto_id); end if; end $$;
do $$ begin if to_regclass('public.tab_promocoes') is not null then create index if not exists idx_pp_promocoes_categoria on public.tab_promocoes (categoria_id); end if; end $$;
do $$ begin if to_regclass('public.loja_fiscal_documento_evento') is not null then create index if not exists idx_pp_doc_evento_loja on public.loja_fiscal_documento_evento (loja_id); end if; end $$;
do $$ begin if to_regclass('public.loja_fiscal_documento_xml') is not null then create index if not exists idx_pp_doc_xml_loja on public.loja_fiscal_documento_xml (loja_id); end if; end $$;
do $$ begin if to_regclass('public.loja_fiscal_evento_sefaz') is not null then create index if not exists idx_pp_evento_sefaz_loja on public.loja_fiscal_evento_sefaz (loja_id); end if; end $$;
do $$ begin if to_regclass('public.app_feature_flags_loja') is not null then create index if not exists idx_pp_flags_loja on public.app_feature_flags_loja (loja_id); end if; end $$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_cest' and policyname = 'fiscal_catalogo_cest_write') then
    alter policy fiscal_catalogo_cest_write on public.fiscal_catalogo_cest
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_cfop' and policyname = 'fiscal_catalogo_cfop_write') then
    alter policy fiscal_catalogo_cfop_write on public.fiscal_catalogo_cfop
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_csosn' and policyname = 'fiscal_catalogo_csosn_write') then
    alter policy fiscal_catalogo_csosn_write on public.fiscal_catalogo_csosn
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_cst_cofins' and policyname = 'fiscal_catalogo_cst_cofins_write') then
    alter policy fiscal_catalogo_cst_cofins_write on public.fiscal_catalogo_cst_cofins
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_cst_icms' and policyname = 'fiscal_catalogo_cst_icms_write') then
    alter policy fiscal_catalogo_cst_icms_write on public.fiscal_catalogo_cst_icms
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_cst_pis' and policyname = 'fiscal_catalogo_cst_pis_write') then
    alter policy fiscal_catalogo_cst_pis_write on public.fiscal_catalogo_cst_pis
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_catalogo_ncm' and policyname = 'fiscal_catalogo_ncm_write') then
    alter policy fiscal_catalogo_ncm_write on public.fiscal_catalogo_ncm
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_regra' and policyname = 'fiscal_regra_write') then
    alter policy fiscal_regra_write on public.fiscal_regra
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_regra_versao' and policyname = 'fiscal_regra_versao_write') then
    alter policy fiscal_regra_versao_write on public.fiscal_regra_versao
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_template' and policyname = 'fiscal_template_write') then
    alter policy fiscal_template_write on public.fiscal_template
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_template_regra' and policyname = 'fiscal_template_regra_write') then
    alter policy fiscal_template_regra_write on public.fiscal_template_regra
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_config_venda' and policyname = 'loja_fiscal_config_venda_select_loja') then
    alter policy loja_fiscal_config_venda_select_loja on public.loja_fiscal_config_venda
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_credencial' and policyname = 'loja_fiscal_credencial_select_loja') then
    alter policy loja_fiscal_credencial_select_loja on public.loja_fiscal_credencial
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_documento' and policyname = 'loja_fiscal_documento_select_loja') then
    alter policy loja_fiscal_documento_select_loja on public.loja_fiscal_documento
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_documento_evento' and policyname = 'loja_fiscal_documento_evento_select_loja') then
    alter policy loja_fiscal_documento_evento_select_loja on public.loja_fiscal_documento_evento
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_emitente' and policyname = 'loja_fiscal_emitente_rw') then
    alter policy loja_fiscal_emitente_rw on public.loja_fiscal_emitente
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_nfce' and policyname = 'loja_fiscal_nfce_rw') then
    alter policy loja_fiscal_nfce_rw on public.loja_fiscal_nfce
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_numero_nao_usado' and policyname = 'loja_fiscal_numero_nao_usado_select_loja') then
    alter policy loja_fiscal_numero_nao_usado_select_loja on public.loja_fiscal_numero_nao_usado
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_regra' and policyname = 'loja_fiscal_regra_all') then
    alter policy loja_fiscal_regra_all on public.loja_fiscal_regra
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loja_fiscal_serie' and policyname = 'loja_fiscal_serie_select_loja') then
    alter policy loja_fiscal_serie_select_loja on public.loja_fiscal_serie
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagamento_alocacoes' and policyname = 'pagamento_alocacoes_select_loja') then
    alter policy pagamento_alocacoes_select_loja on public.pagamento_alocacoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagamento_eventos' and policyname = 'pagamento_eventos_select_loja') then
    alter policy pagamento_eventos_select_loja on public.pagamento_eventos
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagamento_transacoes' and policyname = 'pagamento_transacoes_select_loja') then
    alter policy pagamento_transacoes_select_loja on public.pagamento_transacoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_access_page_stays' and policyname = 'page_stays_insert_own') then
    alter policy page_stays_insert_own on public.tab_access_page_stays
      with check ((user_id = (select public.app_usuario_id())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_access_page_stays' and policyname = 'page_stays_update_own') then
    alter policy page_stays_update_own on public.tab_access_page_stays
      using ((user_id = (select public.app_usuario_id()))) with check ((user_id = (select public.app_usuario_id())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_acessos' and policyname = 'rls_tab_acessos_write') then
    alter policy rls_tab_acessos_write on public.tab_acessos
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_auditoria' and policyname = 'rls_loja_tab_auditoria') then
    alter policy rls_loja_tab_auditoria on public.tab_auditoria
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_caixa_mov' and policyname = 'rls_loja_tab_caixa_mov') then
    alter policy rls_loja_tab_caixa_mov on public.tab_caixa_mov
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_caixas' and policyname = 'rls_loja_tab_caixas') then
    alter policy rls_loja_tab_caixas on public.tab_caixas
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_cargos' and policyname = 'rls_tab_cargos_write') then
    alter policy rls_tab_cargos_write on public.tab_cargos
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_categorias' and policyname = 'rls_loja_tab_categorias') then
    alter policy rls_loja_tab_categorias on public.tab_categorias
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_chamados' and policyname = 'rls_loja_tab_chamados') then
    alter policy rls_loja_tab_chamados on public.tab_chamados
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_clientes' and policyname = 'rls_loja_tab_clientes') then
    alter policy rls_loja_tab_clientes on public.tab_clientes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_comandas' and policyname = 'rls_loja_tab_comandas') then
    alter policy rls_loja_tab_comandas on public.tab_comandas
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_estoque_mov' and policyname = 'rls_loja_tab_estoque_mov') then
    alter policy rls_loja_tab_estoque_mov on public.tab_estoque_mov
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_fidelidade_recompensas' and policyname = 'rls_loja_tab_fidelidade_recompensas') then
    alter policy rls_loja_tab_fidelidade_recompensas on public.tab_fidelidade_recompensas
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_fidelidade_regras' and policyname = 'rls_loja_tab_fidelidade_regras') then
    alter policy rls_loja_tab_fidelidade_regras on public.tab_fidelidade_regras
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_fidelidade_transacoes' and policyname = 'rls_loja_tab_fidelidade_transacoes') then
    alter policy rls_loja_tab_fidelidade_transacoes on public.tab_fidelidade_transacoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_formas_pagamento' and policyname = 'rls_loja_tab_formas_pagamento') then
    alter policy rls_loja_tab_formas_pagamento on public.tab_formas_pagamento
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_grupos_opcoes' and policyname = 'rls_loja_tab_grupos_opcoes') then
    alter policy rls_loja_tab_grupos_opcoes on public.tab_grupos_opcoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoes_cozinha' and policyname = 'tab_impressoes_cozinha_insert_tenant') then
    alter policy tab_impressoes_cozinha_insert_tenant on public.tab_impressoes_cozinha
      with check (((loja_id IS NOT NULL) AND ((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoes_cozinha' and policyname = 'tab_impressoes_cozinha_select_tenant') then
    alter policy tab_impressoes_cozinha_select_tenant on public.tab_impressoes_cozinha
      using (((loja_id IS NOT NULL) AND ((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoes_cozinha' and policyname = 'tab_impressoes_cozinha_update_tenant') then
    alter policy tab_impressoes_cozinha_update_tenant on public.tab_impressoes_cozinha
      using (((loja_id IS NOT NULL) AND ((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))))) with check (((loja_id IS NOT NULL) AND ((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoras' and policyname = 'tab_impressoras_delete_tenant') then
    alter policy tab_impressoras_delete_tenant on public.tab_impressoras
      using (((select public.app_is_super()) OR ((loja_id IS NOT NULL) AND (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoras' and policyname = 'tab_impressoras_insert_tenant') then
    alter policy tab_impressoras_insert_tenant on public.tab_impressoras
      with check (((select public.app_is_super()) OR ((loja_id IS NOT NULL) AND (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoras' and policyname = 'tab_impressoras_select_tenant') then
    alter policy tab_impressoras_select_tenant on public.tab_impressoras
      using (((select public.app_is_super()) OR ((loja_id IS NOT NULL) AND (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_impressoras' and policyname = 'tab_impressoras_update_tenant') then
    alter policy tab_impressoras_update_tenant on public.tab_impressoras
      using (((select public.app_is_super()) OR ((loja_id IS NOT NULL) AND (loja_id = (select public.app_loja_id()))))) with check (((select public.app_is_super()) OR ((loja_id IS NOT NULL) AND (loja_id = (select public.app_loja_id())))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_lancamentos' and policyname = 'rls_loja_tab_lancamentos') then
    alter policy rls_loja_tab_lancamentos on public.tab_lancamentos
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_leads' and policyname = 'rls_leads_select_seguro') then
    alter policy rls_leads_select_seguro on public.tab_leads
      using ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_modulos' and policyname = 'rls_tab_modulos_write') then
    alter policy rls_tab_modulos_write on public.tab_modulos
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_notificacao_prefs' and policyname = 'notif_prefs_dono') then
    alter policy notif_prefs_dono on public.tab_notificacao_prefs
      using (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id())))) with check (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_notificacoes' and policyname = 'notificacoes_select_dono') then
    alter policy notificacoes_select_dono on public.tab_notificacoes
      using (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_notificacoes' and policyname = 'notificacoes_update_dono') then
    alter policy notificacoes_update_dono on public.tab_notificacoes
      using (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id())))) with check (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_opcoes' and policyname = 'rls_loja_tab_opcoes') then
    alter policy rls_loja_tab_opcoes on public.tab_opcoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_pagamentos' and policyname = 'rls_pag_super') then
    alter policy rls_pag_super on public.tab_pagamentos
      using ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_pedidos' and policyname = 'rls_loja_tab_pedidos') then
    alter policy rls_loja_tab_pedidos on public.tab_pedidos
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_pesquisa_satisfacao' and policyname = 'rls_pesquisa_select_seguro') then
    alter policy rls_pesquisa_select_seguro on public.tab_pesquisa_satisfacao
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_plano_modulos' and policyname = 'rls_tab_plano_modulos_write') then
    alter policy rls_tab_plano_modulos_write on public.tab_plano_modulos
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_planos' and policyname = 'rls_tab_planos_write') then
    alter policy rls_tab_planos_write on public.tab_planos
      using ((select public.app_is_super())) with check ((select public.app_is_super()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_produtos' and policyname = 'rls_loja_tab_produtos') then
    alter policy rls_loja_tab_produtos on public.tab_produtos
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_promocoes' and policyname = 'rls_loja_tab_promocoes') then
    alter policy rls_loja_tab_promocoes on public.tab_promocoes
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_push_subscriptions' and policyname = 'push_subs_dono') then
    alter policy push_subs_dono on public.tab_push_subscriptions
      using (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id())))) with check (((select public.app_is_super()) OR (usuario_id = (select public.app_usuario_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_setores_cozinha' and policyname = 'rls_loja_tab_setores_cozinha') then
    alter policy rls_loja_tab_setores_cozinha on public.tab_setores_cozinha
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_user_sessions' and policyname = 'user_sessions_insert_own') then
    alter policy user_sessions_insert_own on public.tab_user_sessions
      with check ((user_id = (select public.app_usuario_id())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_user_sessions' and policyname = 'user_sessions_update_own') then
    alter policy user_sessions_update_own on public.tab_user_sessions
      using ((user_id = (select public.app_usuario_id()))) with check ((user_id = (select public.app_usuario_id())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tab_usuarios' and policyname = 'rls_loja_tab_usuarios') then
    alter policy rls_loja_tab_usuarios on public.tab_usuarios
      using (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id())))) with check (((select public.app_is_super()) OR (loja_id = (select public.app_loja_id()))));
  end if;
end $$;

commit;

analyze public.tab_usuarios;
analyze public.tab_pedidos;
analyze public.tab_produtos;

-- Conferência (não altera nada):
-- select indexname from pg_indexes where schemaname = 'public' and indexname like 'idx_pp_%' order by 1;
