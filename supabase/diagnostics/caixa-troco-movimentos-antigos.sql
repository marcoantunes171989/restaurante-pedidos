-- Caixas com venda gravada junto com o troco (antes da migration 227). SOMENTE LEITURA: não altera nada.
-- Aponta a venda quando os lançamentos dela somam o total MAIS o troco:
--   • fechada pelo servidor (218 em diante): pagamento e lançamentos nascem no mesmo instante;
--   • caminho antigo do navegador (pagamento sem composição): lançamentos da mesma mesa gravados em até 1 minuto.
--     Duas vendas da mesma mesa nesse intervalo não são apontadas.
-- "dinheiro_a_mais" é quanto o "Esperado em dinheiro" do caixa ficou acima do real. As colunas "sem_o_troco" são o
-- recálculo do que foi gravado no fechamento (vazias com o caixa ainda aberto).
with vendas as (
  select p.id, p.loja_id, p.mesa, p.composicao, p.criado_em, p.total, p.troco,
         (select coalesce(sum(public.app_pp_numero(e -> 'valor')), 0) from jsonb_array_elements(p.detalhes) e
           where e ->> 'forma' ilike '%dinheiro%' and e ->> 'forma' !~* 'pontos') as em_dinheiro
    from public.tab_pagamentos p
   where p.troco > 0 and jsonb_typeof(p.detalhes) = 'array'
), afetadas as (
  select m.caixa_id, least(v.troco, v.em_dinheiro) as a_mais
    from vendas v
   cross join lateral (
     select x.caixa_id from public.tab_caixa_mov x
      where x.tipo = 'venda' and (v.loja_id is null or x.loja_id = v.loja_id)
        and case when v.composicao is not null then x.criado_em = v.criado_em
                 else x.criado_em between v.criado_em - interval '5 seconds' and v.criado_em + interval '1 minute'
                      and right(x.descricao, length(v.mesa) + 3) = ' · ' || v.mesa end
      group by x.caixa_id
     having sum(x.valor) = v.total + v.troco) m
   where least(v.troco, v.em_dinheiro) > 0
)
select c.loja_id, c.id as caixa_id, c.status, c.aberto_em, c.fechado_em,
       count(*) as vendas_com_troco, sum(a.a_mais) as dinheiro_a_mais,
       c.valor_esperado as esperado_gravado, c.valor_esperado - sum(a.a_mais) as esperado_sem_o_troco,
       c.valor_fechamento as contado, c.diferenca as diferenca_gravada,
       c.valor_fechamento - (c.valor_esperado - sum(a.a_mais)) as diferenca_sem_o_troco
  from afetadas a
  join public.tab_caixas c on c.id = a.caixa_id
 group by c.id
 order by c.loja_id, c.id;
