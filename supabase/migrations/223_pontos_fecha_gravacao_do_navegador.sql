-- ════════════════════════════════════════════════════════════════════════
--  223_pontos_fecha_gravacao_do_navegador.sql — o navegador deixa de gravar pontos
--
--  Rodar SOMENTE depois que o app que usa a 222 estiver publicado (aparelhos com a versão antiga aberta precisam
--  atualizar a página para lançar pontos à mão; nas vendas o banco passa a gravar os pontos sozinho).
--   • tab_fidelidade_transacoes: o navegador só lê. Ganho, resgate e ajuste nascem nas funções do banco.
--   • Regra e recompensas do programa: só quem administra a empresa cria, altera ou exclui.
--  Desfazer: grant insert on public.tab_fidelidade_transacoes to authenticated;
--            e drop das políticas pp_fid_*_gestor_*.
--  Não altera dados existentes. Idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pontos_lancar(bigint, integer, text, text, bigint)') is null
     or to_regprocedure('public.app_pp_gestor_da_loja(bigint)') is null then
    raise exception 'precheck 223: rode a migration 222 antes; nada foi alterado.';
  end if;
end $$;

revoke insert, update, delete, truncate on public.tab_fidelidade_transacoes from public, anon, authenticated;

-- Políticas restritivas: somam-se às de isolamento por empresa, sem substituí-las. A leitura não muda.
do $$
declare
  t record;
begin
  for t in select * from (values ('tab_fidelidade_regras', 'pp_fid_regras_gestor'), ('tab_fidelidade_recompensas', 'pp_fid_recompensas_gestor')) v(tabela, prefixo)
  loop
    execute format('drop policy if exists %I on public.%I', t.prefixo || '_insert', t.tabela);
    execute format('drop policy if exists %I on public.%I', t.prefixo || '_update', t.tabela);
    execute format('drop policy if exists %I on public.%I', t.prefixo || '_delete', t.tabela);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.app_pp_gestor_da_loja(loja_id))', t.prefixo || '_insert', t.tabela);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.app_pp_gestor_da_loja(loja_id)) with check (public.app_pp_gestor_da_loja(loja_id))', t.prefixo || '_update', t.tabela);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.app_pp_gestor_da_loja(loja_id))', t.prefixo || '_delete', t.tabela);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: false | false | true | 6
select has_table_privilege('authenticated', 'public.tab_fidelidade_transacoes', 'insert') as navegador_grava,
       has_table_privilege('anon', 'public.tab_fidelidade_transacoes', 'insert') as visitante_grava,
       has_table_privilege('authenticated', 'public.tab_fidelidade_transacoes', 'select') as navegador_le,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'pp\_fid\_%\_gestor\_%') as politicas_de_gestor;
