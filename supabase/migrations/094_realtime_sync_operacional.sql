-- ════════════════════════════════════════════════════════════
--  094_realtime_sync_operacional.sql
--
--  Completa o sync banco → tela para entidades operacionais
--  que o app já lê/escreve mas ainda não estavam na publication
--  (ou tinham tipagem incompatível com tab_pedidos.id text).
-- ════════════════════════════════════════════════════════════

-- 1) Realtime: lançamentos + usos de cupom + movimentos de caixa
do $$
declare
  t text;
  tabelas text[] := array['tab_lancamentos', 'tab_cupom_usos', 'tab_caixa_mov'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2) Alinha order_id da fidelidade com tab_pedidos.id (text)
--    Antes: bigint não conseguia referenciar pedidos (PK text).
do $$
declare
  typ text;
begin
  if to_regclass('public.tab_fidelidade_transacoes') is null then return; end if;
  select data_type into typ
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'tab_fidelidade_transacoes'
     and column_name = 'order_id';
  if typ is null then return; end if;
  if typ in ('bigint', 'integer', 'numeric') then
    alter table public.tab_fidelidade_transacoes
      alter column order_id type text using nullif(order_id::text, '');
  end if;
  -- limpa órfãos e cria FK (SET NULL)
  update public.tab_fidelidade_transacoes t
     set order_id = null
   where order_id is not null
     and not exists (select 1 from public.tab_pedidos p where p.id = t.order_id);
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_fid_trans_pedido'
      and conrelid = 'public.tab_fidelidade_transacoes'::regclass
  ) then
    begin
      alter table public.tab_fidelidade_transacoes
        add constraint fk_fid_trans_pedido
        foreign key (order_id) references public.tab_pedidos(id)
        on delete set null;
    exception when others then
      raise notice 'fk_fid_trans_pedido: %', SQLERRM;
    end;
  end if;
end $$;

-- 3) pesquisa_satisfacao.pedido_id → tab_pedidos
do $$
begin
  if to_regclass('public.tab_pesquisa_satisfacao') is null then return; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tab_pesquisa_satisfacao' and column_name='pedido_id'
  ) then return; end if;
  update public.tab_pesquisa_satisfacao s
     set pedido_id = null
   where pedido_id is not null
     and not exists (select 1 from public.tab_pedidos p where p.id = s.pedido_id);
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_pesquisa_pedido'
      and conrelid = 'public.tab_pesquisa_satisfacao'::regclass
  ) then
    begin
      alter table public.tab_pesquisa_satisfacao
        add constraint fk_pesquisa_pedido
        foreign key (pedido_id) references public.tab_pedidos(id)
        on delete set null;
    exception when others then
      raise notice 'fk_pesquisa_pedido: %', SQLERRM;
    end;
  end if;
end $$;
