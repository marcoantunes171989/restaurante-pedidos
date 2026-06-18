-- ════════════════════════════════════════════════════════════
--  049 — ROLLBACK da RLS real (volta ao estado permissivo atual)
--  Use se o login Supabase falhar ou precisar voltar ao modo legacy.
--  Restaura, em cada tabela, uma policy permissiva `using(true)`,
--  devolvendo o acesso pela chave anon. Não toca em dados.
--
--  Lembre de também voltar AUTH_MODE = 'legacy' (src/lib/authMode.js)
--  e republicar o app.
-- ════════════════════════════════════════════════════════════

do $$
declare
  t   text;
  pol text;
  tabelas text[] := array[
    'tab_produtos','tab_pedidos','tab_mesas','tab_comandas','tab_clientes',
    'tab_formas_pagamento','tab_categorias','tab_usuarios','tab_pagamentos',
    'tab_estoque_mov','tab_promocoes','tab_grupos_opcoes','tab_opcoes',
    'tab_setores_cozinha','tab_caixas','tab_caixa_mov','tab_fidelidade_regras',
    'tab_fidelidade_recompensas','tab_fidelidade_transacoes','tab_chamados',
    'tab_auditoria','tab_assinaturas','tab_dispositivos','tab_licenca_historico',
    'tab_lojas','tab_planos','tab_modulos','tab_plano_modulos','tab_cargos','tab_acessos'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_all', t);
  end loop;
end $$;
