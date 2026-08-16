-- ════════════════════════════════════════════════════════════
--  DIAGNÓSTICO (SOMENTE LEITURA) — Pré-flight da Fundação Financeira V2
--
--  Mede pré-requisitos e órfãos ANTES de aplicar a 118 / endurecer o tenant.
--  ⚠️ NÃO altera nada (só SELECT/COUNT). Rode em HOMOLOGAÇÃO e PRODUÇÃO e
--  guarde/exporte o relatório. Nada corrige automaticamente.
--
--  A última query devolve um RESULTADO CONSOLIDADO (verificacao, qtd, severidade)
--  fácil de exportar em CSV pelo SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════

-- 0) PRÉ-REQUISITOS — funções usadas pela RPC precisam existir.
select 'fn app_is_super()'   as verificacao, (to_regprocedure('public.app_is_super()')   is not null) as presente
union all select 'fn app_loja_id()',    (to_regprocedure('public.app_loja_id()')    is not null)
union all select 'fn app_usuario_id()', (to_regprocedure('public.app_usuario_id()') is not null)
union all select 'fn app_caller_email()', (to_regprocedure('public.app_caller_email()') is not null);

-- 0b) COLUNAS necessárias nas tabelas legadas (a RPC/relatórios dependem delas).
select c.tabela, c.coluna,
       exists (select 1 from information_schema.columns i
               where i.table_schema='public' and i.table_name=c.tabela and i.column_name=c.coluna) as existe
from (values
  ('tab_pedidos','loja_id'), ('tab_pedidos','itens'), ('tab_pedidos','status'),
  ('tab_pedidos','status_pagamento'), ('tab_pedidos','pagamento_forma'), ('tab_pedidos','comanda'),
  ('tab_pagamentos','loja_id'), ('tab_pagamentos','comandas'),
  ('tab_caixa_mov','loja_id'), ('tab_caixa_mov','caixa_id'),
  ('tab_caixas','loja_id'), ('tab_caixas','status'),
  ('tab_formas_pagamento','loja_id'), ('tab_formas_pagamento','ativo'),
  ('tab_usuarios','permissoes_acoes'), ('tab_usuarios','ids_acesso'), ('tab_usuarios','ativo')
) as c(tabela, coluna);

-- ════════════════════════════════════════════════════════════
-- RELATÓRIO CONSOLIDADO (exportável em CSV) — verificacao | qtd | severidade
-- ════════════════════════════════════════════════════════════
with r as (
  -- órfãos loja_id NULL
  select 'tab_pagamentos.loja_id NULL' as verificacao, count(*) as qtd, 'alto' as severidade from public.tab_pagamentos where loja_id is null
  union all select 'tab_pedidos.loja_id NULL',   count(*), 'alto'  from public.tab_pedidos   where loja_id is null
  union all select 'tab_caixa_mov.loja_id NULL',  count(*), 'medio' from public.tab_caixa_mov where loja_id is null
  union all select 'tab_caixas.loja_id NULL',     count(*), 'medio' from public.tab_caixas    where loja_id is null
  union all select 'tab_formas_pagamento.loja_id NULL (global)', count(*), 'info' from public.tab_formas_pagamento where loja_id is null

  -- FKs inconsistentes (loja preenchida apontando para loja inexistente)
  union all select 'tab_pagamentos → loja inexistente', count(*), 'critico'
    from public.tab_pagamentos p left join public.tab_lojas l on l.id=p.loja_id where p.loja_id is not null and l.id is null
  union all select 'tab_pedidos → loja inexistente', count(*), 'critico'
    from public.tab_pedidos p left join public.tab_lojas l on l.id=p.loja_id where p.loja_id is not null and l.id is null
  union all select 'tab_caixa_mov → loja inexistente', count(*), 'critico'
    from public.tab_caixa_mov m left join public.tab_lojas l on l.id=m.loja_id where m.loja_id is not null and l.id is null

  -- movimento sem caixa
  union all select 'tab_caixa_mov → caixa inexistente', count(*), 'alto'
    from public.tab_caixa_mov m left join public.tab_caixas c on c.id=m.caixa_id where c.id is null

  -- pagamentos legados com comandas PARCIALMENTE identificadas (alguma comanda
  -- não-vazia SEM âncora em tab_pedidos com loja). NÃO são backfill-elegíveis.
  union all select 'tab_pagamentos com comanda parcialmente identificada', count(*), 'alto'
    from public.tab_pagamentos p
    where p.loja_id is null
      and exists (
        select 1 from unnest(coalesce(p.comandas,'{}'::text[])) cmd
        where btrim(cmd) <> ''
          and not exists (select 1 from public.tab_pedidos ped where ped.loja_id is not null and ped.comanda = cmd)
      )

  -- tenant NÃO inferível: loja NULL e sem QUALQUER comanda âncora.
  union all select 'tab_pagamentos sem tenant inferível', count(*), 'alto'
    from public.tab_pagamentos p
    where p.loja_id is null
      and not exists (
        select 1 from unnest(coalesce(p.comandas,'{}'::text[])) cmd
        join public.tab_pedidos ped on ped.loja_id is not null and ped.comanda = cmd
        where btrim(cmd) <> ''
      )

  -- BACKFILL-ELEGÍVEL (regra ESTRITA): loja NULL, há ao menos uma comanda
  -- não-vazia, TODAS as comandas não-vazias têm âncora válida E todas apontam
  -- para EXATAMENTE UMA loja. Correspondência apenas parcial NÃO conta.
  union all select 'tab_pagamentos backfill-elegível (1 loja, 100% âncora)', count(*), 'info'
    from (
      select p.id
      from public.tab_pagamentos p
      where p.loja_id is null
        and cardinality(array(select cmd from unnest(coalesce(p.comandas,'{}'::text[])) cmd where btrim(cmd)<>'')) > 0
        -- nenhuma comanda não-vazia sem âncora:
        and not exists (
          select 1 from unnest(coalesce(p.comandas,'{}'::text[])) cmd
          where btrim(cmd)<>'' and not exists (
            select 1 from public.tab_pedidos ped where ped.loja_id is not null and ped.comanda = cmd)
        )
        -- e todas as âncoras convergem para 1 loja:
        and (
          select count(distinct ped.loja_id)
          from unnest(coalesce(p.comandas,'{}'::text[])) cmd
          join public.tab_pedidos ped on ped.loja_id is not null and ped.comanda = cmd
          where btrim(cmd)<>''
        ) = 1
    ) t
)
select verificacao, qtd, severidade from r order by
  case severidade when 'critico' then 0 when 'alto' then 1 when 'medio' then 2 else 3 end, verificacao;

-- ════════════════════════════════════════════════════════════
-- ESTADO DO RLS (confirma enforce × permissivo) — informativo.
-- ════════════════════════════════════════════════════════════
select relname as tabela, relrowsecurity as rls_habilitada, relforcerowsecurity as rls_forcada
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in ('tab_pagamentos','tab_pedidos','tab_caixa_mov','tab_formas_pagamento',
                    'pagamento_transacoes','pagamento_alocacoes','pagamento_eventos')
  order by relname;

select schemaname, tablename, policyname, cmd, roles, qual
  from pg_policies
  where schemaname='public'
    and tablename in ('tab_pagamentos','tab_pedidos','tab_caixa_mov','tab_formas_pagamento',
                      'pagamento_transacoes','pagamento_alocacoes','pagamento_eventos')
  order by tablename, policyname;
