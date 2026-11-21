-- HOMOLOGAÇÃO (HML, zzixvyspwszewhxzusot) — PARIDADE-2: permissão do usuário logado igual ao PROD
-- em 24 tabelas que as telas usam direto (sem função do banco).
-- Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
--
-- Por quê (16/11/2026): no uso diário simulado, telas do HML falhavam com
-- "permission denied" (Biblioteca Fiscal vazia, NCM/ICMS, fidelidade, caixa,
-- formas de pagamento, lançamentos, notificações…). No PROD funcionam.
-- Decisão do usuário: igualar a permissão no HML ao PROD.
--
-- O que faz: só GRANT para "authenticated" (usuário logado), nos mesmos
-- privilégios que o PROD dá. NÃO dá nada a "anon" (visitante sem login).
-- As regras de linha (RLS) já são idênticas às do PROD nas 24 tabelas
-- (conferido por md5): cada loja continua vendo só os seus dados.
-- Também libera o uso dos contadores de ID (sequences) dessas tabelas.
-- Não altera dados. Para desfazer: HML-PARIDADE-2_desfazer.sql.
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. O projeto aberto parece ser o PROD: pare e abra o link do HML.'; end if;
end $$;

grant select, insert, update, delete on public.fiscal_regra to authenticated;
grant select, insert, update, delete on public.fiscal_regra_versao to authenticated;
grant select, insert, update, delete on public.loja_fiscal_nfce to authenticated;
grant select, insert, update, delete on public.tab_assinaturas to authenticated;
grant select, insert, update, delete on public.tab_auditoria to authenticated;
grant select, insert, update, delete on public.tab_caixa_mov to authenticated;
grant select, insert, update, delete on public.tab_estoque_mov to authenticated;
grant select, insert, update, delete on public.tab_fidelidade_recompensas to authenticated;
grant select, insert, update, delete on public.tab_fidelidade_regras to authenticated;
grant select, insert, update, delete on public.tab_fiscal_icms to authenticated;
grant select, insert, update, delete on public.tab_fiscal_lote_log to authenticated;
grant select, insert, update, delete on public.tab_fiscal_ncm to authenticated;
grant select, insert, update, delete on public.tab_fiscal_perfis to authenticated;
grant select, insert, update, delete on public.tab_formas_pagamento to authenticated;
grant select, insert, update, delete on public.tab_lancamentos to authenticated;
grant select, insert, update, delete on public.tab_licenca_historico to authenticated;
grant select, insert, update, delete on public.tab_modulos to authenticated;
grant select, insert, update, delete on public.tab_notificacao_prefs to authenticated;
grant select, insert, update, delete on public.tab_notificacoes to authenticated;
grant select, insert, update, delete on public.tab_pagamentos to authenticated;
grant select, insert, update, delete on public.tab_plano_modulos to authenticated;
grant select, insert, update, delete on public.tab_planos to authenticated;
grant select, insert, update, delete on public.tab_push_subscriptions to authenticated;
grant select on public.tab_usuarios to authenticated;   -- no PROD também é só leitura

-- contadores de ID (sequences) das 24 tabelas
do $$
declare s record;
begin
  for s in
    select sq.oid::regclass as seq
      from pg_class t join pg_depend d on d.refobjid = t.oid and d.deptype in ('a', 'i')
      join pg_class sq on sq.oid = d.objid and sq.relkind = 'S'
     where t.relnamespace = 'public'::regnamespace
       and t.relname = any (array[
         'fiscal_regra', 'fiscal_regra_versao', 'loja_fiscal_nfce', 'tab_assinaturas', 'tab_auditoria', 'tab_caixa_mov', 'tab_estoque_mov', 'tab_fidelidade_recompensas', 'tab_fidelidade_regras', 'tab_fiscal_icms', 'tab_fiscal_lote_log', 'tab_fiscal_ncm', 'tab_fiscal_perfis', 'tab_formas_pagamento', 'tab_lancamentos', 'tab_licenca_historico', 'tab_modulos', 'tab_notificacao_prefs', 'tab_notificacoes', 'tab_pagamentos', 'tab_plano_modulos', 'tab_planos', 'tab_push_subscriptions', 'tab_usuarios'])
  loop
    execute format('grant usage, select on sequence %s to authenticated', s.seq);
  end loop;
end $$;

-- Conferência (deve mostrar 24 linhas com confere = true)
select t.relname as tabela,
       has_table_privilege('authenticated', t.oid, 'select')
       and (t.relname = 'tab_usuarios' or (has_table_privilege('authenticated', t.oid, 'insert')
            and has_table_privilege('authenticated', t.oid, 'update') and has_table_privilege('authenticated', t.oid, 'delete')))
       and not has_table_privilege('anon', t.oid, 'insert')
       and t.relrowsecurity as confere
  from pg_class t
 where t.relnamespace = 'public'::regnamespace
   and t.relname = any (array[
     'fiscal_regra', 'fiscal_regra_versao', 'loja_fiscal_nfce', 'tab_assinaturas', 'tab_auditoria', 'tab_caixa_mov', 'tab_estoque_mov', 'tab_fidelidade_recompensas', 'tab_fidelidade_regras', 'tab_fiscal_icms', 'tab_fiscal_lote_log', 'tab_fiscal_ncm', 'tab_fiscal_perfis', 'tab_formas_pagamento', 'tab_lancamentos', 'tab_licenca_historico', 'tab_modulos', 'tab_notificacao_prefs', 'tab_notificacoes', 'tab_pagamentos', 'tab_plano_modulos', 'tab_planos', 'tab_push_subscriptions', 'tab_usuarios'])
 order by 1;
commit;
