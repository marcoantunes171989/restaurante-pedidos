-- ════════════════════════════════════════════════════════════
--  DIAGNÓSTICO (SOMENTE LEITURA) — Pré-flight da Fundação Financeira V2
--
--  Objetivo: medir o estoque de dados que impedem endurecer o tenant
--  (loja_id NOT NULL + FK RESTRICT) ANTES de qualquer backfill/migration.
--
--  ⚠️ NÃO altera nada. Nenhum UPDATE/DELETE/INSERT. Só SELECT/COUNT.
--  Rode no SQL Editor (homologação e produção) e guarde o relatório.
--  Nada aqui corrige automaticamente — a decisão de backfill é humana.
-- ════════════════════════════════════════════════════════════

-- 1) Contagem de órfãos por loja_id NULL (núcleo financeiro/operacional).
select 'tab_pagamentos.loja_id NULL'  as verificacao, count(*) as qtd from public.tab_pagamentos  where loja_id is null
union all
select 'tab_pedidos.loja_id NULL',     count(*) from public.tab_pedidos     where loja_id is null
union all
select 'tab_caixa_mov.loja_id NULL',   count(*) from public.tab_caixa_mov   where loja_id is null;

-- 2) FKs inconsistentes: loja_id preenchido, mas apontando para loja inexistente
--    (não deveria ocorrer com FK ativa, mas confirma integridade real).
select 'tab_pagamentos → loja inexistente' as verificacao, count(*) as qtd
  from public.tab_pagamentos p left join public.tab_lojas l on l.id = p.loja_id
  where p.loja_id is not null and l.id is null
union all
select 'tab_pedidos → loja inexistente', count(*)
  from public.tab_pedidos p left join public.tab_lojas l on l.id = p.loja_id
  where p.loja_id is not null and l.id is null
union all
select 'tab_caixa_mov → loja inexistente', count(*)
  from public.tab_caixa_mov m left join public.tab_lojas l on l.id = m.loja_id
  where m.loja_id is not null and l.id is null;

-- 3) Movimentos de caixa sem caixa (FK quebrada — caixa_id NOT NULL na 042,
--    mas confirma se algum ficou órfão por ambiente antigo).
select 'tab_caixa_mov → caixa inexistente' as verificacao, count(*) as qtd
  from public.tab_caixa_mov m left join public.tab_caixas c on c.id = m.caixa_id
  where c.id is null;

-- 4) Caixa sem loja (para inferência de tenant do movimento).
select 'tab_caixas.loja_id NULL' as verificacao, count(*) as qtd
  from public.tab_caixas where loja_id is null;

-- 5) Pagamentos (legado) cujo tenant NÃO pode ser inferido: loja_id NULL e
--    não há caixa/pedido relacionável para deduzir a loja.
--    O legado tab_pagamentos vincula pedidos por `comandas text[]` (não FK),
--    então a inferência é heurística — aqui só medimos o volume "sem âncora".
select 'tab_pagamentos sem tenant inferível' as verificacao, count(*) as qtd
  from public.tab_pagamentos p
  where p.loja_id is null
    and not exists (
      select 1 from public.tab_pedidos ped
      where ped.loja_id is not null
        and ped.comanda = any(coalesce(p.comandas, '{}'::text[]))
    );

-- 6) Pagamentos (legado) com loja_id NULL mas com pedido âncora de UMA única
--    loja (candidatos a backfill seguro — NÃO corrige aqui, só lista o total).
select 'tab_pagamentos c/ tenant inferível (1 loja)' as verificacao, count(*) as qtd
  from (
    select p.id, count(distinct ped.loja_id) as lojas
    from public.tab_pagamentos p
    join public.tab_pedidos ped
      on ped.loja_id is not null and ped.comanda = any(coalesce(p.comandas, '{}'::text[]))
    where p.loja_id is null
    group by p.id
    having count(distinct ped.loja_id) = 1
  ) t;

-- 7) Estado do RLS nas tabelas críticas (confirma enforce × permissivo).
select schemaname, tablename, policyname, cmd, qual
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tab_pagamentos','tab_pedidos','tab_caixa_mov',
                      'pagamento_transacoes','pagamento_alocacoes','pagamento_eventos')
  order by tablename, policyname;

-- 8) RLS habilitada? (rowsecurity = true por tabela)
select relname as tabela, relrowsecurity as rls_habilitada, relforcerowsecurity as rls_forcada
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in ('tab_pagamentos','tab_pedidos','tab_caixa_mov',
                    'pagamento_transacoes','pagamento_alocacoes','pagamento_eventos')
  order by relname;
