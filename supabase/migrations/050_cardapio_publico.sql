-- ════════════════════════════════════════════════════════════
--  050 — Cardápio público sob RLS (leitura do menu + RPCs do pedido)
--  Pré-requisito do enforce (048). Mantém o /cardapio anônimo
--  funcionando depois que a RLS estrita estiver ligada:
--    • leitura PÚBLICA das tabelas de menu (dados já públicos);
--    • criar/acompanhar pedido, conta e chamado via RPC security definer
--      (o anônimo NÃO ganha leitura de pedidos/clientes de ninguém).
--  ADITIVO: cria policies de SELECT e funções. Não altera dados.
-- ════════════════════════════════════════════════════════════

-- 1) Leitura pública do menu (produtos/categorias/promoções/opções/loja).
--    São dados exibidos no cardápio por URL — públicos por natureza.
do $$
declare t text; tabelas text[] := array[
  'tab_lojas','tab_produtos','tab_categorias','tab_promocoes','tab_grupos_opcoes','tab_opcoes'
];
begin
  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'pub_read_'||t, t);
    execute format('create policy %I on public.%I for select using (true)', 'pub_read_'||t, t);
  end loop;
end $$;

-- 2) RPCs do fluxo público (security definer → ignoram RLS de forma controlada)

-- Cria um pedido vindo do cardápio público
create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.tab_pedidos (mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id)
  values (p_mesa, p_comanda, nullif(p_cliente,''), nullif(p_telefone,''), 'recebido', 'aberto', coalesce(p_itens,'[]'::jsonb), p_loja_id)
  returning id into v_id;
  return v_id;
end; $$;

-- Cadastra/atualiza o cliente do pedido externo
create or replace function public.pub_upsert_cliente(
  p_loja_id bigint, p_nome text, p_telefone text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_telefone,'') = '' then return; end if;
  if exists (select 1 from public.tab_clientes where telefone = p_telefone and loja_id = p_loja_id) then
    update public.tab_clientes set nome = coalesce(nullif(p_nome,''), nome) where telefone = p_telefone and loja_id = p_loja_id;
  else
    insert into public.tab_clientes (nome, telefone, loja_id) values (coalesce(nullif(p_nome,''),'Cliente'), p_telefone, p_loja_id);
  end if;
end; $$;

-- Lista os pedidos de uma comanda (acompanhamento, substitui o realtime anônimo)
create or replace function public.pub_pedidos_comanda(
  p_loja_id bigint, p_comanda text
) returns setof public.tab_pedidos
language sql security definer set search_path = public as $$
  select * from public.tab_pedidos
   where loja_id = p_loja_id and comanda = p_comanda
   order by criado_em asc
$$;

-- Lista os pedidos de um cliente (pedido externo, acompanhamento por telefone)
create or replace function public.pub_pedidos_cliente(
  p_loja_id bigint, p_telefone text
) returns setof public.tab_pedidos
language sql security definer set search_path = public as $$
  select * from public.tab_pedidos
   where loja_id = p_loja_id and cliente_telefone = p_telefone
   order by criado_em asc
$$;

-- Solicita o fechamento da conta (marca os pedidos da comanda como 'solicitado')
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.tab_pedidos set status_pagamento = 'solicitado'
   where loja_id = p_loja_id and comanda = p_comanda and status_pagamento = 'aberto';
end; $$;

-- Registra um chamado de mesa (garçom/ajuda/limpeza)
create or replace function public.pub_criar_chamado(
  p_loja_id bigint, p_mesa text, p_comanda text, p_tipo text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.tab_chamados') is null then return; end if;
  insert into public.tab_chamados (loja_id, mesa, comanda, tipo, status)
  values (p_loja_id, nullif(p_mesa,''), nullif(p_comanda,''), coalesce(p_tipo,'garcom'), 'pendente');
end; $$;

-- Permissões para o cliente anônimo executar as RPCs
grant execute on function public.pub_criar_pedido(bigint,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.pub_upsert_cliente(bigint,text,text)              to anon, authenticated;
grant execute on function public.pub_pedidos_comanda(bigint,text)                  to anon, authenticated;
grant execute on function public.pub_pedidos_cliente(bigint,text)                  to anon, authenticated;
grant execute on function public.pub_solicitar_conta(bigint,text)                  to anon, authenticated;
grant execute on function public.pub_criar_chamado(bigint,text,text,text)          to anon, authenticated;
