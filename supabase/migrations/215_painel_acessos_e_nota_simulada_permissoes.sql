-- ════════════════════════════════════════════════════════════════════════
--  215_painel_acessos_e_nota_simulada_permissoes.sql — devolve ao usuário logado funções que duas telas chamam
--
--  Origem: HOMOLOGAÇÃO, diagnóstico somente leitura de 2026-11-27. Dez funções do painel só podiam ser executadas
--  pelo servidor. São abertas ao usuário logado na PRODUÇÃO e as migrations 098–103 e 117 já previam esse acesso.
--   • Controle de Acessos (cada função recusa quem não é administrador geral):
--       app_listar_sessoes, app_sessoes_metricas, app_listar_eventos_acesso, app_listar_page_stays_sessao,
--       app_listar_permanencia, app_sessao_encerrar_remota, app_sessao_excluir, app_evento_acesso_excluir
--   • Testes (homologação), nota simulada (recusa empresa que não seja a do usuário):
--       app_reservar_numero_nfce, app_registrar_nfce_simulada
--  Libera somente EXECUTE dessas assinaturas para authenticated; visitante continua sem acesso. Não abre tabela, não
--  troca o corpo de nenhuma função e não altera dados. app_registrar_pagamento_v2 continua fechada (nenhuma tela usa).
--  Idempotente. Se alguma função faltar ou estiver sem a própria conferência de quem chama, nada é alterado.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_alvo record;
  v_oid oid;
  v_alvos constant jsonb := '[
    {"f": "public.app_listar_sessoes(text, text, text, bigint, timestamptz, timestamptz, text, integer, integer)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_sessoes_metricas(timestamptz, timestamptz, bigint)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_listar_eventos_acesso(uuid, text[], timestamptz, timestamptz, integer, integer, bigint)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_listar_page_stays_sessao(uuid, integer)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_listar_permanencia(text, timestamptz, timestamptz, bigint, integer, integer)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_sessao_encerrar_remota(uuid)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_sessao_excluir(uuid)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_evento_acesso_excluir(uuid)", "confere": "app_pode_controle_acessos"},
    {"f": "public.app_reservar_numero_nfce(bigint)", "confere": "app_pode_gerir_loja"},
    {"f": "public.app_registrar_nfce_simulada(bigint, text, integer, integer, text, text, text, numeric, integer, text, jsonb)", "confere": "app_pode_gerir_loja"}
  ]';
begin
  for v_alvo in select * from jsonb_to_recordset(v_alvos) as x(f text, confere text) loop
    v_oid := to_regprocedure(v_alvo.f);
    if v_oid is null then
      raise exception 'precheck 215: função % não encontrada.', v_alvo.f;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_oid and p.prosecdef
                     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%') then
      raise exception 'precheck 215: a função % precisa ser security definer com search_path fixo.', v_alvo.f;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_oid and position(v_alvo.confere in p.prosrc) > 0) then
      raise exception 'precheck 215: a função % não confere quem chama (%).', v_alvo.f, v_alvo.confere;
    end if;
  end loop;

  for v_alvo in select * from jsonb_to_recordset(v_alvos) as x(f text, confere text) loop
    execute format('revoke all on function %s from public, anon', v_alvo.f);
    execute format('grant execute on function %s to authenticated', v_alvo.f);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 10 linhas, todas com logado = true e visitante = false.
select p.oid::regprocedure::text as funcao,
       has_function_privilege('authenticated', p.oid, 'execute') as logado,
       has_function_privilege('anon', p.oid, 'execute') as visitante
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('app_listar_sessoes', 'app_sessoes_metricas', 'app_listar_eventos_acesso', 'app_listar_page_stays_sessao',
                     'app_listar_permanencia', 'app_sessao_encerrar_remota', 'app_sessao_excluir', 'app_evento_acesso_excluir',
                     'app_reservar_numero_nfce', 'app_registrar_nfce_simulada')
 order by 1;
