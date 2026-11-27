-- ════════════════════════════════════════════════════════════════════════
--  224_estoque_baixado_pelo_servidor.sql — a venda baixa o estoque dentro do banco
--
--  Antes: depois do pagamento o NAVEGADOR mandava a lista de itens para app_baixar_estoque_produto. Qualquer usuário
--  logado da empresa podia chamar a função com a lista que quisesse, a baixa podia falhar com a venda já gravada e
--  duas vendas simultâneas podiam perder uma das baixas.
--  Agora:
--   • um gatilho em tab_pagamentos baixa o estoque dos itens dos pedidos pagos, na mesma operação da venda, com a
--     linha do produto travada (produto pelo código do item; sem código, pelo nome, sempre dentro da empresa);
--   • app_baixar_estoque_produto continua existindo, mas não altera mais nada — o app publicado segue funcionando,
--     sem baixa em dobro e sem erro na tela.
--  Uma falha na baixa não derruba a venda: fica registrada no pagamento (composicao -> estoqueBaixado = false).
--  Não pede publicação do app. Requer a 218. Não altera dados existentes. Idempotente.
--  Rodar a parte de app_baixar_estoque_produto da migration 124 de novo traria a baixa em dobro: rode a 224 em seguida.
--  Desfazer: drop trigger trg_pagamento_baixa_estoque on public.tab_pagamentos; e recriar a função anterior.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regclass('public.tab_produtos') is null or to_regclass('public.tab_estoque_mov') is null
     or to_regprocedure('public.app_pp_numero(jsonb)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'tab_pagamentos' and column_name = 'composicao') then
    raise exception 'precheck 224: falta a migration 218 ou as tabelas de estoque; nada foi alterado.';
  end if;
end $$;

create or replace function public.app_pp_baixar_estoque_da_venda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item   record;
  v_nome   text;
  v_antes  integer;
  v_depois integer;
begin
  -- Só o fechamento pelo servidor grava a lista de pedidos na composição.
  if new.composicao is null or coalesce(jsonb_typeof(new.composicao -> 'pedidos'), '') <> 'array' then return new; end if;
  begin
    for v_item in
      with itens as (
        select e as item
          from public.tab_pedidos p
          cross join lateral jsonb_array_elements(case when jsonb_typeof(p.itens) = 'array' then p.itens else '[]'::jsonb end) e
         where p.id in (select jsonb_array_elements_text(new.composicao -> 'pedidos')) and p.loja_id = new.loja_id
      ), achados as (
        select coalesce(
                 (select pr.id from public.tab_produtos pr
                   where pr.loja_id = new.loja_id
                     and pr.id = case when public.app_pp_numero(i.item -> 'productId') = trunc(public.app_pp_numero(i.item -> 'productId'))
                                       and public.app_pp_numero(i.item -> 'productId') between 1 and 9223372036854775807
                                      then public.app_pp_numero(i.item -> 'productId')::bigint end),
                 (select pr.id from public.tab_produtos pr
                   where pr.loja_id = new.loja_id and pr.nome = i.item ->> 'name' order by pr.id limit 1)) as produto_id,
               public.app_pp_numero(i.item -> 'quantity') as quantidade
          from itens i
      )
      select produto_id, round(sum(quantidade))::integer as quantidade
        from achados where produto_id is not null and quantidade > 0
       group by produto_id
       order by produto_id -- ordem fixa: duas vendas com os mesmos produtos não se travam uma à outra
    loop
      select pr.nome, coalesce(pr.estoque, 0) into v_nome, v_antes
        from public.tab_produtos pr where pr.id = v_item.produto_id for update;
      v_depois := greatest(0, v_antes - v_item.quantidade);
      update public.tab_produtos set estoque = v_depois where id = v_item.produto_id;
      -- O histórico não pode impedir a baixa.
      begin
        insert into public.tab_estoque_mov (loja_id, produto_id, produto_nome, quantidade, estoque_antes, estoque_depois)
        values (new.loja_id, v_item.produto_id, v_nome, v_item.quantidade, v_antes, v_depois);
      exception when others then
        raise warning 'histórico de estoque não gravado: %', sqlerrm;
      end;
    end loop;
    new.composicao := new.composicao || jsonb_build_object('estoqueBaixado', true);
  exception when others then
    -- Nada da baixa fica pela metade; a venda segue e o pagamento guarda o motivo.
    raise warning 'baixa de estoque não aplicada: %', sqlerrm;
    new.composicao := new.composicao || jsonb_build_object('estoqueBaixado', false, 'estoqueErro', left(sqlerrm, 200));
  end;
  return new;
end;
$$;
revoke all on function public.app_pp_baixar_estoque_da_venda() from public, anon, authenticated;

drop trigger if exists trg_pagamento_baixa_estoque on public.tab_pagamentos;
create trigger trg_pagamento_baixa_estoque before insert on public.tab_pagamentos
  for each row execute function public.app_pp_baixar_estoque_da_venda();

-- A função antiga passa a não alterar nada. Onde ela tem a trava de manutenção, a trava continua.
do $migracao$
declare
  v_trava constant text := 'perform public.app_assert_business_write_allowed(null, null);';
  v_tinha boolean;
begin
  select position('app_assert_business_write_allowed' in p.prosrc) > 0 into v_tinha
    from pg_proc p where p.oid = to_regprocedure('public.app_baixar_estoque_produto(bigint, jsonb)');
  execute replace($funcao$
create or replace function public.app_baixar_estoque_produto(p_loja_id bigint, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $corpo$
-- [estoque 224] a baixa acontece no gatilho do pagamento; esta chamada fica só para o app publicado.
begin
  --@trava@
  return jsonb_build_object('movimentos', '[]'::jsonb, 'alertas', '[]'::jsonb, 'noServidor', true);
end;
$corpo$
$funcao$, '--@trava@', case when v_tinha then v_trava else '' end);
end
$migracao$;
revoke all on function public.app_baixar_estoque_produto(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_baixar_estoque_produto(bigint, jsonb) to authenticated;
comment on function public.app_baixar_estoque_produto(bigint, jsonb) is
  'Sem efeito desde a migration 224: o estoque é baixado pelo gatilho de tab_pagamentos.';

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 1 | true | false | false
select
  (select count(*) from pg_trigger where tgrelid = 'public.tab_pagamentos'::regclass and tgname = 'trg_pagamento_baixa_estoque' and not tgisinternal) as gatilho,
  (select position('[estoque 224]' in prosrc) > 0 from pg_proc where oid = to_regprocedure('public.app_baixar_estoque_produto(bigint, jsonb)')) as funcao_antiga_sem_efeito,
  has_table_privilege('authenticated', 'public.tab_produtos', 'update') as navegador_altera_produtos,
  has_function_privilege('anon', 'public.app_baixar_estoque_produto(bigint, jsonb)', 'execute') as visitante_executa;
