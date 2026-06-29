-- ════════════════════════════════════════════════════════════
--  061_pedido_pagamento.sql
--  Forma e momento de pagamento escolhidos pelo cliente no checkout
--  do cardápio (pedidos internos = mesa/QR e externos = link).
--  Aplica as configurações da aba "Pagamento" (config_externo):
--    pagPix/pagCartao/pagDinheiro (formas) + pagOnline/pagEntrega/pagRetirada (momento).
--
--  • Adiciona 2 colunas texto em tab_pedidos (tolerante: NULL quando ausente).
--  • Estende a RPC pub_criar_pedido com 2 parâmetros OPCIONAIS (default null),
--    mantendo compatibilidade com chamadas antigas de 6 argumentos.
-- ════════════════════════════════════════════════════════════

alter table public.tab_pedidos
  add column if not exists pagamento_forma   text,
  add column if not exists pagamento_momento text;

-- Recria a RPC com os 2 novos parâmetros opcionais (Postgres resolve as
-- chamadas de 6 args pelos defaults). Trocar a assinatura exige DROP + CREATE.
drop function if exists public.pub_criar_pedido(bigint, text, text, text, text, jsonb);

create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb,
  p_pag_forma text default null, p_pag_momento text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos
    (id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id,
     pagamento_forma, pagamento_momento)
  values
    (v_id, p_mesa, p_comanda, nullif(p_cliente, ''), nullif(p_telefone, ''),
     'recebido', 'aberto', coalesce(p_itens, '[]'::jsonb), p_loja_id,
     nullif(p_pag_forma, ''), nullif(p_pag_momento, ''));

  return v_id;
end; $$;

grant execute on function public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text) to anon, authenticated;
