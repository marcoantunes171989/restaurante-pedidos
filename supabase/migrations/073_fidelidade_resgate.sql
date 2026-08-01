-- ════════════════════════════════════════════════════════════
--  Fidelidade — pagamento com pontos (resgate)
--
--  Complementa a migration 043 (regras/recompensas/transações):
--   1) valor de RESGATE configurável na regra (pontos_por_real);
--   2) RPC público (security definer) de LEITURA do saldo por telefone,
--      para o cardápio externo mostrar os pontos do cliente identificado;
--   3) intenção "pagar com pontos" no fechamento externo — o caixa efetiva
--      o débito (nenhuma escrita anônima no ledger de pontos).
-- ════════════════════════════════════════════════════════════

-- 1) Valor de resgate: quantos pontos equivalem a R$ 1,00 (default 100 → 100 pts = R$ 1).
alter table public.tab_fidelidade_regras
  add column if not exists pontos_por_real numeric(10,2) not null default 100;

-- 2) Saldo de pontos do cliente (por telefone) — leitura pública/anônima.
--    Resolve o cliente por telefone + loja e soma o ledger. Espelha o padrão
--    de pub_pedidos_cliente (050_cardapio_publico.sql).
create or replace function public.pub_saldo_fidelidade(
  p_loja_id bigint, p_telefone text
) returns integer
language sql security definer set search_path = public as $$
  select coalesce(sum(t.pontos), 0)::integer
    from public.tab_fidelidade_transacoes t
    join public.tab_clientes c on c.id = t.cliente_id
   where c.loja_id = p_loja_id
     and c.telefone = p_telefone
     and t.loja_id = p_loja_id
$$;

-- 3) Fechamento da conta com intenção de pagar com pontos.
--    Overload novo (mantém a assinatura antiga intacta): quando p_usar_pontos,
--    marca pagamento_forma = 'Pontos (solicitado)' — sinal que o caixa lê para
--    efetivar o resgate no fechamento. NÃO toca o ledger de pontos.
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text, p_usar_pontos boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.tab_pedidos
     set status_pagamento = 'solicitado',
         pagamento_forma = case when p_usar_pontos then 'Pontos (solicitado)' else pagamento_forma end
   where loja_id = p_loja_id and comanda = p_comanda and status_pagamento = 'aberto';
end; $$;

grant execute on function public.pub_saldo_fidelidade(bigint, text)            to anon, authenticated;
grant execute on function public.pub_solicitar_conta(bigint, text, boolean)    to anon, authenticated;
