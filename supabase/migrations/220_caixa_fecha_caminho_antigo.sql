-- ════════════════════════════════════════════════════════════════════════
--  220_caixa_fecha_caminho_antigo.sql — o navegador deixa de marcar pedido como pago e de gravar pagamento
--
--  RODAR SOMENTE DEPOIS que o app que usa app_fechar_conta (migration 218) estiver publicado e testado no ambiente.
--  A partir daqui, todo pagamento passa pela conferência do servidor.
--   • app_pedido_marcar_pago continua existindo, chamada apenas por dentro do servidor;
--   • o navegador não insere em tab_pagamentos;
--   • as funções antigas de checkout (app_checkout_begin, app_checkout_commit e app_registrar_pagamento_v2), onde
--     existirem, deixam de ser chamadas pelo navegador: o app não as usa e elas aceitam valores sem os limites.
--  Não altera dados. Idempotente.
--  Desfazer: grant execute on function public.app_pedido_marcar_pago(text, text, text) to authenticated;
--            grant insert on public.tab_pagamentos to authenticated;
--            (funções antigas de checkout: grant execute ... to authenticated, uma a uma)
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint)') is null
     and to_regprocedure('public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint, boolean)') is null then -- 222
    raise exception 'precheck 220: rode antes a migration 218; nada foi alterado.';
  end if;
end $$;

revoke all on function public.app_pedido_marcar_pago(text, text, text) from public, anon, authenticated;
grant execute on function public.app_pedido_marcar_pago(text, text, text) to service_role;
revoke insert on public.tab_pagamentos from anon, authenticated;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as funcao from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('app_checkout_begin', 'app_checkout_commit', 'app_registrar_pagamento_v2')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.funcao);
    execute format('grant execute on function %s to service_role', r.funcao);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: false | false | 0.
select has_function_privilege('authenticated', 'public.app_pedido_marcar_pago(text, text, text)', 'execute') as navegador_marca_pago,
       has_table_privilege('authenticated', 'public.tab_pagamentos', 'insert') as navegador_grava_pagamento,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in ('app_checkout_begin', 'app_checkout_commit', 'app_registrar_pagamento_v2')
           and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) as checkout_antigo_aberto;
