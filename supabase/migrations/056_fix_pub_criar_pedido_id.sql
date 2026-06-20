-- ════════════════════════════════════════════════════════════
--  056_fix_pub_criar_pedido_id.sql  (CORREÇÃO DE BUG)
--
--  Bug: ao finalizar um pedido pelo cardápio público (rota /cardapio,
--  modo mesa OU externo), a RPC pub_criar_pedido falhava com:
--    23502 — null value in column "id" of relation "tab_pedidos"
--            violates not-null constraint
--
--  Causa: tab_pedidos.id é TEXT NOT NULL (o app gera ids "PED-...") e
--  não tem default; a RPC inseria SEM informar o id e ainda declarava
--  returns bigint / v_id bigint (incompatível com id texto).
--
--  Correção: recria a função gerando um id texto no padrão "PED-XXXXXXXXNN"
--  e retornando text. (Trocar o tipo de retorno exige DROP + CREATE.)
-- ════════════════════════════════════════════════════════════

drop function if exists public.pub_criar_pedido(bigint, text, text, text, text, jsonb);

create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  -- id no mesmo padrão do app: PED- + 7 dígitos (epoch ms) + 2 dígitos aleatórios
  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos
    (id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id)
  values
    (v_id, p_mesa, p_comanda, nullif(p_cliente, ''), nullif(p_telefone, ''),
     'recebido', 'aberto', coalesce(p_itens, '[]'::jsonb), p_loja_id);

  return v_id;
end; $$;

grant execute on function public.pub_criar_pedido(bigint, text, text, text, text, jsonb) to anon, authenticated;
