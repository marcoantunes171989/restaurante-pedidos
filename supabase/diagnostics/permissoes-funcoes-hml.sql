-- ════════════════════════════════════════════════════════════════════════
--  Permissões das funções que o app chama — SOMENTE LEITURA (HOMOLOGAÇÃO)
--
--  Não cria, não altera e não apaga nada. Devolve uma linha por assinatura, com quem pode executá-la hoje.
--  "situacao" começa com ATENÇÃO quando a tela precisa da função e ela está bloqueada, ou o contrário.
--  Como usar: SQL Editor → New query → colar → Run → conferir (ou "Export" → CSV).
-- ════════════════════════════════════════════════════════════════════════
with alvo(grupo, nome, quem, tela) as (values
  ('1 controle de acessos', 'app_listar_sessoes',           'logado',  'Controle de Acessos: sessões'),
  ('1 controle de acessos', 'app_sessoes_metricas',         'logado',  'Controle de Acessos: indicadores'),
  ('1 controle de acessos', 'app_listar_eventos_acesso',    'logado',  'Controle de Acessos: eventos e alertas'),
  ('1 controle de acessos', 'app_listar_page_stays_sessao', 'logado',  'Controle de Acessos: detalhe da sessão'),
  ('1 controle de acessos', 'app_listar_permanencia',       'logado',  'Controle de Acessos: permanência'),
  ('1 controle de acessos', 'app_sessao_encerrar_remota',   'logado',  'Controle de Acessos: encerrar sessão'),
  ('1 controle de acessos', 'app_sessao_excluir',           'logado',  'Controle de Acessos: excluir sessão'),
  ('1 controle de acessos', 'app_evento_acesso_excluir',    'logado',  'Controle de Acessos: excluir evento'),
  ('2 nota simulada',       'app_reservar_numero_nfce',     'logado',  'Testes (homologação): emitir simulação'),
  ('2 nota simulada',       'app_registrar_nfce_simulada',  'logado',  'Testes (homologação): histórico'),
  ('3 sem tela',            'app_registrar_pagamento_v2',   'ninguem', 'nenhuma (pagamentos V2 desligado)'),
  ('4 fechada de propósito', 'app_admin_criar_usuario',     'ninguem', 'o app usa a rota do servidor'),
  ('4 fechada de propósito', 'app_admin_salvar_usuario',    'ninguem', 'o app usa a rota do servidor'),
  ('4 fechada de propósito', 'app_criar_usuario',           'ninguem', 'o app usa a rota do servidor'),
  ('4 fechada de propósito', 'app_salvar_usuario',          'ninguem', 'o app usa a rota do servidor'),
  ('4 fechada de propósito', 'app_validar_login',           'ninguem', 'senha antiga'),
  ('5 cardápio (214)',      'pub_criar_chamado',            'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_solicitar_conta',          'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_upsert_cliente',           'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_buscar_cliente',           'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_saldo_fidelidade',         'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_pesquisa_satisfacao',      'visitante', 'Cardápio'),
  ('5 cardápio (214)',      'pub_criar_lead',               'visitante', 'Site')
), estado as (
  select a.grupo, a.nome, a.quem, a.tela, p.oid,
         has_function_privilege('anon', p.oid, 'execute') as visitante,
         has_function_privilege('authenticated', p.oid, 'execute') as logado,
         has_function_privilege('service_role', p.oid, 'execute') as servidor
    from alvo a
    left join pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = a.nome
)
select grupo,
       coalesce(oid::regprocedure::text, nome) as funcao,
       tela, visitante, logado, servidor,
       case
         when oid is null then 'não existe neste banco'
         when quem = 'logado'    and logado    then 'ok'
         when quem = 'logado'                  then 'ATENÇÃO: bloqueada para quem está logado (a 215 libera)'
         when quem = 'visitante' and visitante then 'ok'
         when quem = 'visitante'               then 'ATENÇÃO: bloqueada para o visitante (a 214 libera)'
         when visitante or logado              then 'ATENÇÃO: aberta, conferir'
         else 'fechada, como esperado'
       end as situacao
  from estado
 order by grupo, funcao;
