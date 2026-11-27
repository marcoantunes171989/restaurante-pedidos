-- ════════════════════════════════════════════════════════════════════════
--  214_cardapio_publico_permissoes.sql — devolve ao cardápio e ao site as funções que eles chamam
--
--  Origem: HOMOLOGAÇÃO, 2026-11-27. Oito assinaturas só podiam ser executadas pelo servidor; o cardápio público e o
--  formulário do site recebiam "permission denied for function". As mesmas funções são abertas na PRODUÇÃO e as
--  migrations 050, 057, 059, 072 e 073 já previam esse acesso.
--   • pub_criar_chamado        chamar garçom, ajuda ou limpeza
--   • pub_solicitar_conta      pedir o fechamento da conta (as duas assinaturas)
--   • pub_upsert_cliente       cadastrar o cliente pelo telefone
--   • pub_buscar_cliente       preencher o nome pelo telefone (devolve o nome: dado pessoal)
--   • pub_saldo_fidelidade     mostrar os pontos pelo telefone
--   • pub_pesquisa_satisfacao  gravar a avaliação do pedido
--   • pub_criar_lead           formulário do site
--  Libera somente EXECUTE dessas assinaturas para anon e authenticated. Não abre tabela, não troca o corpo de nenhuma
--  função e não altera dados. Idempotente. Se alguma função faltar ou estiver sem proteção, nada é alterado.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_alvo text;
  v_oid oid;
  v_alvos constant text[] := array[
    'public.pub_criar_chamado(bigint, text, text, text)',
    'public.pub_solicitar_conta(bigint, text)',
    'public.pub_solicitar_conta(bigint, text, boolean)',
    'public.pub_upsert_cliente(bigint, text, text)',
    'public.pub_buscar_cliente(bigint, text)',
    'public.pub_saldo_fidelidade(bigint, text)',
    'public.pub_pesquisa_satisfacao(text, bigint, text, text, text, jsonb, text)',
    'public.pub_criar_lead(text, text, text, text, integer, text)'];
begin
  foreach v_alvo in array v_alvos loop
    v_oid := to_regprocedure(v_alvo);
    if v_oid is null then
      raise exception 'precheck 214: função % não encontrada.', v_alvo;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_oid and p.prosecdef
                     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%') then
      raise exception 'precheck 214: a função % precisa ser security definer com search_path fixo.', v_alvo;
    end if;
  end loop;

  foreach v_alvo in array v_alvos loop
    execute format('revoke all on function %s from public', v_alvo);
    execute format('grant execute on function %s to anon, authenticated', v_alvo);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 8 linhas, todas com visitante = true e logado = true.
select p.oid::regprocedure::text as funcao,
       has_function_privilege('anon', p.oid, 'execute') as visitante,
       has_function_privilege('authenticated', p.oid, 'execute') as logado
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('pub_criar_chamado', 'pub_solicitar_conta', 'pub_upsert_cliente', 'pub_buscar_cliente',
                     'pub_saldo_fidelidade', 'pub_pesquisa_satisfacao', 'pub_criar_lead')
 order by 1;
