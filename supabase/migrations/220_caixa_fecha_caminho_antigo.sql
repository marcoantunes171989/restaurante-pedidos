-- ════════════════════════════════════════════════════════════════════════
--  220_caixa_fecha_caminho_antigo.sql — o navegador deixa de marcar pedido como pago e de gravar pagamento
--
--  RODAR SOMENTE DEPOIS que o app que usa app_fechar_conta (migration 218) estiver publicado e testado no ambiente.
--  A partir daqui, todo pagamento passa pela conferência do servidor.
--   • app_pedido_marcar_pago continua existindo, chamada apenas por dentro do servidor;
--   • o navegador não insere em tab_pagamentos.
--  Não altera dados. Idempotente.
--  Desfazer: grant execute on function public.app_pedido_marcar_pago(text, text, text) to authenticated;
--            grant insert on public.tab_pagamentos to authenticated;
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint)') is null then
    raise exception 'precheck 220: rode antes a migration 218; nada foi alterado.';
  end if;
end $$;

revoke all on function public.app_pedido_marcar_pago(text, text, text) from public, anon, authenticated;
grant execute on function public.app_pedido_marcar_pago(text, text, text) to service_role;
revoke insert on public.tab_pagamentos from anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: false | false.
select has_function_privilege('authenticated', 'public.app_pedido_marcar_pago(text, text, text)', 'execute') as navegador_marca_pago,
       has_table_privilege('authenticated', 'public.tab_pagamentos', 'insert') as navegador_grava_pagamento;
