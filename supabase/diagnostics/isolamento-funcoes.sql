-- ════════════════════════════════════════════════════════════════════════
--  2ª consulta de isolamento — SOMENTE LEITURA (não cria, não altera, não apaga)
--  Traz o código das funções que estão no banco e não conferem com o repositório, quais colunas de usuários e empresas
--  o navegador consegue ler e uma conferência das ações feitas em outra empresa por quem NÃO é administrador geral.
--  Sem dados de clientes: só código, nomes de colunas e contagens.
--  Como usar: igual à anterior; salvar o resultado em supabase\diagnostics\resultado\hml-2.csv
-- ════════════════════════════════════════════════════════════════════════
with
funcoes as (
  select p.proname::text as nome, pg_get_functiondef(p.oid) as codigo,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname in ('app_alternar_loja_usuarios', 'app_atualizar_categoria', 'app_atualizar_cupom', 'app_atualizar_loja', 'app_atualizar_mesa', 'app_atualizar_produto', 'app_atualizar_produtos_fiscal_lote', 'app_baixar_estoque_produto', 'app_canonical_session_close', 'app_canonical_session_heartbeat', 'app_canonical_session_start', 'app_checkout_begin', 'app_checkout_cancel', 'app_checkout_commit', 'app_checkout_fail', 'app_checkout_status', 'app_criar_categoria', 'app_criar_cupom', 'app_criar_loja', 'app_criar_mesa', 'app_criar_pedido', 'app_criar_produto', 'app_dispositivo_registrar', 'app_excluir_categoria', 'app_excluir_cupom', 'app_excluir_produto', 'app_feature_enabled', 'app_is_super', 'app_listar_cargos', 'app_loja_id', 'app_onboarding_cancel', 'app_onboarding_criar_categoria', 'app_onboarding_criar_loja', 'app_onboarding_finish', 'app_onboarding_salvar_emitente', 'app_onboarding_seed_formas_pagamento', 'app_pedido_atualizar_cliente', 'app_pedido_atualizar_itens', 'app_pedido_atualizar_status', 'app_pedido_marcar_pago', 'app_pedido_marcar_setor_pronto', 'app_pedido_solicitar_conta_mesa', 'app_pedido_transferir_mesa', 'app_pode_controle_acessos', 'app_pode_receber_pagamento', 'app_pode_ver_relatorio_vendas', 'app_relatorio_vendas_resumo_v1', 'app_salvar_funcionamento_loja', 'app_sessao_trocar_contexto', 'cupom_consumir', 'cupom_validar', 'pub_criar_pedido_v2')
),
colunas as (
  select table_name::text as tabela, grantee::text as papel, privilege_type::text as acao, string_agg(column_name, ', ' order by column_name) as colunas
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('tab_usuarios', 'tab_lojas', 'tab_clientes', 'loja_fiscal_credencial', 'tab_sistema_status')
   group by 1, 2, 3
),
fora_da_loja as (
  select 'tab_access_page_stays.user_id'::text as referencia, count(*) as linhas from public.tab_access_page_stays f join public.tab_usuarios u on u.id = f.user_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_auditoria.usuario_id'::text as referencia, count(*) as linhas from public.tab_auditoria f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_fiscal_lote_log.usuario_id'::text as referencia, count(*) as linhas from public.tab_fiscal_lote_log f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_user_sessions.user_id'::text as referencia, count(*) as linhas from public.tab_user_sessions f join public.tab_usuarios u on u.id = f.user_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'loja_fiscal_documento_evento.usuario_id'::text as referencia, count(*) as linhas from public.loja_fiscal_documento_evento f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_chamados.atendido_por'::text as referencia, count(*) as linhas from public.tab_chamados f join public.tab_usuarios u on u.id = f.atendido_por
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'loja_fiscal_documento.usuario_id'::text as referencia, count(*) as linhas from public.loja_fiscal_documento f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_caixa_mov.usuario_id'::text as referencia, count(*) as linhas from public.tab_caixa_mov f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_notificacoes.usuario_id'::text as referencia, count(*) as linhas from public.tab_notificacoes f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_caixas.aberto_por'::text as referencia, count(*) as linhas from public.tab_caixas f join public.tab_usuarios u on u.id = f.aberto_por
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'loja_fiscal_config_venda.atualizado_por'::text as referencia, count(*) as linhas from public.loja_fiscal_config_venda f join public.tab_usuarios u on u.id = f.atualizado_por
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'loja_fiscal_numero_nao_usado.usuario_id'::text as referencia, count(*) as linhas from public.loja_fiscal_numero_nao_usado f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_caixas.fechado_por'::text as referencia, count(*) as linhas from public.tab_caixas f join public.tab_usuarios u on u.id = f.fechado_por
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
  union all
  select 'tab_push_subscriptions.usuario_id'::text as referencia, count(*) as linhas from public.tab_push_subscriptions f join public.tab_usuarios u on u.id = f.usuario_id
   where coalesce(u.super_admin, false) = false and f.loja_id is not null and u.loja_id is distinct from f.loja_id
)
select jsonb_build_object(
  'funcoes', (select jsonb_agg(to_jsonb(x) order by x.nome) from funcoes x),
  'colunas', (select jsonb_agg(to_jsonb(x) order by x.tabela, x.papel, x.acao) from colunas x),
  'acoes_em_outra_loja_sem_ser_admin_geral', (select jsonb_agg(to_jsonb(x) order by x.linhas desc) from fora_da_loja x)
) as diagnostico;
