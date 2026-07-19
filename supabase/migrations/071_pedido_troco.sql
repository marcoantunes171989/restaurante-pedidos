-- ════════════════════════════════════════════════════════════
--  071_pedido_troco.sql
--  "Precisa de troco?" — valor declarado pelo cliente no checkout ao
--  escolher pagamento em Dinheiro (retirada/entrega/mesa — pagamento
--  imediato). Permite à equipe separar o troco antes do cliente chegar.
--  NÃO se aplica a "Consumir no local" (pagamento só no fechamento da
--  conta, ver migration 061 + regra de negócio no front-end).
--
--  • Adiciona 1 coluna numeric em tab_pedidos (tolerante: NULL quando
--    não informado — pagamento não é em dinheiro, ou não precisa de troco).
--  • Estende a RPC pub_criar_pedido com 1 parâmetro OPCIONAL adicional
--    (default null), mantendo compatibilidade com chamadas antigas
--    (10 argumentos, migration 066).
--  • ADITIVO: não altera dados existentes, não remove colunas nem pedidos.
--
--  APLICAÇÃO MANUAL: rode este arquivo direto no SQL editor do Supabase
--  (Dashboard → SQL Editor). Não é executado automaticamente.
-- ════════════════════════════════════════════════════════════

alter table public.tab_pedidos
  add column if not exists pagamento_troco_para numeric;

comment on column public.tab_pedidos.pagamento_troco_para is
  'Valor em dinheiro que o cliente vai usar para pagar (para a equipe calcular o troco). NULL quando não é dinheiro ou o cliente não precisa de troco.';

-- Assinatura muda (mais um parâmetro) → DROP + CREATE, igual ao padrão
-- já usado nas migrations 061/065/066.
drop function if exists public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint);

create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb,
  p_pag_forma text default null, p_pag_momento text default null,
  p_mesa_numero integer default null, p_mesa_id bigint default null,
  p_troco_para numeric default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  perform public.pub_validar_pedido_mesa(p_loja_id, p_mesa_numero, p_mesa_id);

  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos
    (id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id,
     pagamento_forma, pagamento_momento, pagamento_troco_para)
  values
    (v_id, p_mesa, p_comanda, nullif(p_cliente, ''), nullif(p_telefone, ''),
     'recebido', 'aberto', coalesce(p_itens, '[]'::jsonb), p_loja_id,
     nullif(p_pag_forma, ''), nullif(p_pag_momento, ''),
     case when p_troco_para > 0 then p_troco_para else null end);

  return v_id;
end; $$;

grant execute on function public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric) to anon, authenticated;
