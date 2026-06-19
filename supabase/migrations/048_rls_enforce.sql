-- ════════════════════════════════════════════════════════════
--  048 — RLS REAL por empresa (ENFORCE)
--  ⚠️ APLIQUE SOMENTE depois que o login via Supabase Auth (AUTH_MODE
--  = 'supabase') estiver 100% validado numa BRANCH do Supabase.
--  Antes disso, o app (modo legacy, chave anon) PERDE acesso.
--
--  Não apaga nem altera dados — apenas troca as POLICIES de cada tabela
--  de permissivas para restritivas por loja_id. Reversível pela 049.
--
--  Regra: super admin vê tudo; demais veem apenas a própria loja.
-- ════════════════════════════════════════════════════════════

-- 1) Tabelas com coluna loja_id → restringe por loja_id
do $$
declare
  t   text;
  pol text;
  tabelas text[] := array[
    'tab_produtos','tab_pedidos','tab_mesas','tab_comandas','tab_clientes',
    'tab_formas_pagamento','tab_categorias','tab_usuarios',
    'tab_estoque_mov','tab_promocoes','tab_grupos_opcoes','tab_opcoes',
    'tab_setores_cozinha','tab_caixas','tab_caixa_mov','tab_fidelidade_regras',
    'tab_fidelidade_recompensas','tab_fidelidade_transacoes','tab_chamados',
    'tab_auditoria','tab_assinaturas','tab_dispositivos','tab_licenca_historico'
  ];
begin
  -- Só aplica nas tabelas que REALMENTE têm a coluna loja_id (salvaguarda
  -- contra erro 42703 caso alguma tabela não tenha a coluna nesta base).
  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=t and column_name='loja_id') then
      continue;
    end if;
    -- remove todas as policies atuais da tabela
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all using (public.app_is_super() or loja_id = public.app_loja_id()) with check (public.app_is_super() or loja_id = public.app_loja_id())',
      'rls_loja_'||t, t);
  end loop;
end $$;

-- 1b) tab_pagamentos — NÃO tem loja_id (histórico de cupons). O app só INSERE
--     (nunca lê). Liberamos a inserção e restringimos a leitura ao super admin.
do $$
declare pol text;
begin
  if to_regclass('public.tab_pagamentos') is not null then
    for pol in select policyname from pg_policies where schemaname='public' and tablename='tab_pagamentos' loop
      execute format('drop policy %I on public.tab_pagamentos', pol);
    end loop;
    alter table public.tab_pagamentos enable row level security;
    create policy "rls_pag_insert" on public.tab_pagamentos for insert with check (true);
    create policy "rls_pag_super"  on public.tab_pagamentos for select using (public.app_is_super());
  end if;
end $$;

-- 2) tab_lojas → o usuário vê a PRÓPRIA empresa (id = loja do JWT); super vê todas
do $$
declare pol text;
begin
  if to_regclass('public.tab_lojas') is not null then
    for pol in select policyname from pg_policies where schemaname='public' and tablename='tab_lojas' loop
      execute format('drop policy %I on public.tab_lojas', pol);
    end loop;
    alter table public.tab_lojas enable row level security;
    create policy "rls_lojas" on public.tab_lojas for all
      using (public.app_is_super() or id = public.app_loja_id())
      with check (public.app_is_super() or id = public.app_loja_id());
  end if;
end $$;

-- 3) Catálogos globais (planos, módulos, vínculos, cargos, acessos) →
--    leitura liberada a usuários autenticados; escrita só super admin.
do $$
declare t text; pol text;
  catalogos text[] := array['tab_planos','tab_modulos','tab_plano_modulos','tab_cargos','tab_acessos'];
begin
  foreach t in array catalogos loop
    if to_regclass('public.'||t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (true)', 'rls_'||t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.app_is_super()) with check (public.app_is_super())', 'rls_'||t||'_write', t);
  end loop;
end $$;
