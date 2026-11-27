-- ════════════════════════════════════════════════════════════════════════
--  217_preco_do_pedido_no_servidor.sql — o banco não aceita item abaixo do preço do cadastro
--
--  Problema: o painel (tablet e caixa) enviava o preço de cada item e o banco gravava o que viesse. Quem tinha acesso
--  à loja podia registrar pedido com valor adulterado. O cardápio público já calcula o preço no servidor.
--
--  Regra (vale para quem está logado; o cardápio sem login continua pelo cálculo próprio dele):
--   • Item NOVO precisa ser de um produto da própria empresa e custar no mínimo o MENOR preço válido do cadastro:
--     preço, preço promocional do produto, promoção ativa, parte proporcional de combo, mais opções e adicionais.
--     As telas calculam de formas diferentes; por isso o banco confere o piso e não troca o valor cobrado.
--     Horário e dia da semana da promoção não são conferidos (carrinho montado antes do fim continua valendo).
--   • Item que já estava no pedido, com o mesmo preço, continua valendo (preço da hora da venda).
--   • Item trazido de outra conta em aberto da mesma empresa, com o mesmo preço, continua valendo (separar contas).
--   • Quantidade precisa ser maior que zero.
--  Não altera dados nem pedidos antigos. Idempotente.
--  Desfazer, se preciso:  drop trigger if exists trg_pp_pedido_preco on public.tab_pedidos;
-- ════════════════════════════════════════════════════════════════════════
begin;

-- Número guardado como número ou texto no JSON; qualquer outra coisa vira nulo.
create or replace function public.app_pp_numero(p jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
    when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric
  end
$$;

-- Menor preço unitário válido do item na empresa. Nulo = o produto não é do cadastro dela.
create or replace function public.app_pp_preco_minimo(p_loja bigint, p_item jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_pid     numeric := public.app_pp_numero(p_item -> 'productId');
  v_prod    public.tab_produtos%rowtype;
  v_pr      public.tab_promocoes%rowtype;
  v_base    numeric;
  v_minimo  numeric;
  v_unit    numeric;
  v_ids     jsonb;
  v_soma    numeric;
  v_extra   numeric := 0;
  v_hoje    date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  if v_pid is null or v_pid <> trunc(v_pid) then return null; end if;
  select * into v_prod from public.tab_produtos where id = v_pid::bigint and loja_id = p_loja;
  if not found then return null; end if;

  v_base := coalesce(v_prod.preco, 0);
  v_minimo := v_base;
  if v_prod.preco_promocional is not null then v_minimo := least(v_minimo, v_prod.preco_promocional); end if;

  -- Promoções ativas (um dia de folga nas datas, por causa de fuso e virada do dia).
  for v_pr in
    select * from public.tab_promocoes pr
     where pr.loja_id = p_loja and pr.ativo is true and coalesce(pr.tipo, '') <> 'combo'
       and (pr.data_inicio is null or pr.data_inicio <= v_hoje + 1)
       and (pr.data_fim is null or pr.data_fim >= v_hoje - 1)
  loop
    v_ids := case
      when jsonb_typeof(to_jsonb(v_pr.produto_ids)) = 'array' and jsonb_array_length(to_jsonb(v_pr.produto_ids)) > 0
        then to_jsonb(v_pr.produto_ids)
      when v_pr.produto_id is not null then jsonb_build_array(v_pr.produto_id)
      else '[]'::jsonb end;
    if (jsonb_array_length(v_ids) > 0 or v_pr.categoria_id is not null)
       and not (v_ids @> to_jsonb(v_prod.id) or v_ids @> to_jsonb(v_prod.id::text))
       and not (v_pr.categoria_id is not null and (
             v_prod.categoria_id is not distinct from v_pr.categoria_id
             or exists (select 1 from public.tab_categorias c
                         where c.id = v_pr.categoria_id and c.loja_id = p_loja and c.nome = v_prod.categoria))) then
      continue;
    end if;
    if coalesce(v_pr.desconto_percent, 0) > 0 then
      v_minimo := least(v_minimo, greatest(0, round(v_base * (1 - v_pr.desconto_percent / 100), 2)));
    elsif coalesce(v_pr.desconto_valor, 0) > 0 then
      v_minimo := least(v_minimo, greatest(0, round(v_base - v_pr.desconto_valor, 2)));
    end if;
  end loop;

  -- Combos: o preço fechado é dividido entre os itens na proporção do preço de cada um.
  v_unit := v_minimo;
  for v_pr in
    select * from public.tab_promocoes pr
     where pr.loja_id = p_loja and pr.ativo is true and pr.tipo = 'combo' and coalesce(pr.desconto_valor, 0) > 0
       and (pr.data_inicio is null or pr.data_inicio <= v_hoje + 1)
       and (pr.data_fim is null or pr.data_fim >= v_hoje - 1)
  loop
    v_ids := case
      when jsonb_typeof(to_jsonb(v_pr.produto_ids)) = 'array' and jsonb_array_length(to_jsonb(v_pr.produto_ids)) > 0
        then to_jsonb(v_pr.produto_ids)
      when v_pr.produto_id is not null then jsonb_build_array(v_pr.produto_id)
      else '[]'::jsonb end;
    if not (v_ids @> to_jsonb(v_prod.id) or v_ids @> to_jsonb(v_prod.id::text)) then continue; end if;
    select sum(coalesce(p.preco, 0)) into v_soma
      from jsonb_array_elements_text(v_ids) r(id)
      join public.tab_produtos p on p.id::text = r.id and p.loja_id = p_loja;
    if coalesce(v_soma, 0) > 0 then
      -- 5 centavos de folga: o último item do combo fecha o arredondamento.
      v_minimo := least(v_minimo, greatest(0, trunc(v_unit * v_pr.desconto_valor / v_soma, 2) - 0.05));
    end if;
  end loop;

  -- Opções escolhidas (por id; item antigo sem id, pelo nome). Cada opção conta uma vez.
  if jsonb_typeof(p_item -> 'selectedOptions') = 'array' then
    select coalesce(sum(x.preco_delta), 0) into v_extra from (
      select distinct on (o.id) o.id, o.preco_delta
        from jsonb_array_elements(p_item -> 'selectedOptions') e
        join public.tab_opcoes o on o.loja_id = p_loja
         and case when public.app_pp_numero(e -> 'optionId') is not null
                  then o.id = public.app_pp_numero(e -> 'optionId')
                  else o.nome = e ->> 'nome' end
        join public.tab_grupos_opcoes g on g.id = o.grupo_id and g.produto_id = v_prod.id and g.loja_id = p_loja
       order by o.id
    ) x;
    v_minimo := v_minimo + v_extra;
  end if;

  -- Adicionais do produto, pelo nome. Cada um conta uma vez.
  if jsonb_typeof(p_item -> 'extraIngredients') = 'array' then
    select coalesce(sum(x.preco), 0) into v_extra from (
      select distinct on (a ->> 'nome') a ->> 'nome' as nome, coalesce(public.app_pp_numero(a -> 'preco'), 0) as preco
        from jsonb_array_elements(coalesce(to_jsonb(v_prod.adicionais), '[]'::jsonb)) a
       where a ->> 'nome' in (select jsonb_array_elements_text(p_item -> 'extraIngredients'))
       order by a ->> 'nome'
    ) x;
    v_minimo := v_minimo + v_extra;
  end if;

  return greatest(0, round(v_minimo, 2));
end;
$$;

-- Há, na lista, este mesmo item (produto e nome) pelo mesmo preço?
create or replace function public.app_pp_item_ja_vendido(p_lista jsonb, p_item jsonb)
returns boolean language sql immutable set search_path = public as $$
  select exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(p_lista) = 'array' then p_lista else '[]'::jsonb end) e
     where public.app_pp_numero(e -> 'productId') is not distinct from public.app_pp_numero(p_item -> 'productId')
       and e ->> 'name' is not distinct from p_item ->> 'name'
       and abs(public.app_pp_numero(e -> 'price') - public.app_pp_numero(p_item -> 'price')) < 0.005
  )
$$;

create or replace function public.app_pp_conferir_preco_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_papel  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_item   jsonb;
  v_preco  numeric;
  v_qtd    numeric;
  v_minimo numeric;
  v_nome   text;
begin
  -- Só quem está logado. Cardápio sem login, servidor e SQL Editor seguem as regras próprias.
  if v_papel <> 'authenticated' then return new; end if;
  if tg_op = 'UPDATE' and new.itens is not distinct from old.itens then return new; end if;
  if jsonb_typeof(new.itens) is distinct from 'array' then raise exception 'item_invalido'; end if;

  for v_item in select * from jsonb_array_elements(new.itens) loop
    v_nome := coalesce(v_item ->> 'name', 'item');
    v_preco := public.app_pp_numero(v_item -> 'price');
    v_qtd := public.app_pp_numero(v_item -> 'quantity');
    if v_preco is null or v_preco < 0 or v_qtd is null or v_qtd <= 0 then
      raise exception 'item_invalido' using detail = v_nome;
    end if;

    if tg_op = 'UPDATE' and public.app_pp_item_ja_vendido(old.itens, v_item) then continue; end if;

    v_minimo := public.app_pp_preco_minimo(new.loja_id, v_item);
    if v_minimo is not null and v_preco >= v_minimo - 0.01 then continue; end if;

    -- Só quando o cadastro não explica o preço se procura nas outras contas em aberto (separar contas).
    if exists (
      select 1 from public.tab_pedidos p
       where p.loja_id = new.loja_id and p.id is distinct from new.id
         and p.status_pagamento is distinct from 'pago' and p.status is distinct from 'cancelado'
         and public.app_pp_item_ja_vendido(p.itens, v_item)
    ) then continue; end if;

    if v_minimo is null then
      raise exception 'item_sem_produto_no_cadastro' using detail = v_nome;
    end if;
    raise exception 'item_preco_abaixo_do_cadastro' using detail = v_nome;
  end loop;
  return new;
end;
$$;

revoke all on function public.app_pp_numero(jsonb) from public, anon, authenticated;
revoke all on function public.app_pp_preco_minimo(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.app_pp_item_ja_vendido(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.app_pp_conferir_preco_pedido() from public, anon, authenticated;

drop trigger if exists trg_pp_pedido_preco on public.tab_pedidos;
create trigger trg_pp_pedido_preco
  before insert or update of itens on public.tab_pedidos
  for each row execute function public.app_pp_conferir_preco_pedido();

commit;

-- Conferência (não altera nada). Esperado: 1.
select count(*) as trava_de_preco_ativa from pg_trigger
 where tgname = 'trg_pp_pedido_preco' and tgrelid = 'public.tab_pedidos'::regclass and tgenabled <> 'D';
