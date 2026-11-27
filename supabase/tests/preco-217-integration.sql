-- Teste da migration 217 em um PostgreSQL LOCAL E VAZIO (nunca no Supabase: o primeiro bloco impede).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/preco-217-integration.sql   (executar a partir da raiz do projeto)
do $$ begin
  if to_regclass('public.tab_pedidos') is not null then
    raise exception 'Este teste é só para um banco local vazio. Nada foi feito.';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table public.tab_produtos (id bigint primary key, loja_id bigint, nome text, preco numeric(10,2),
  preco_promocional numeric(10,2), adicionais jsonb not null default '[]', categoria text, categoria_id bigint);
create table public.tab_categorias (id bigint primary key, loja_id bigint, nome text);
create table public.tab_promocoes (id bigint primary key, loja_id bigint, tipo text default 'percentual', desconto_percent numeric(5,2),
  desconto_valor numeric(10,2), produto_id bigint, produto_ids jsonb, categoria_id bigint, data_inicio date, data_fim date, ativo boolean default true);
create table public.tab_grupos_opcoes (id bigint primary key, loja_id bigint, produto_id bigint);
create table public.tab_opcoes (id bigint primary key, loja_id bigint, grupo_id bigint, nome text, preco_delta numeric(10,2));
create table public.tab_pedidos (id text primary key, loja_id bigint, itens jsonb not null default '[]',
  status text default 'recebido', status_pagamento text default 'aberto');

\i supabase/migrations/217_preco_do_pedido_no_servidor.sql
-- Rodar de novo é seguro.
\i supabase/migrations/217_preco_do_pedido_no_servidor.sql

insert into public.tab_categorias values (7, 1, 'Sobremesas');
insert into public.tab_produtos values
  (1, 1, 'Burger', 30.00, 27.00, '[{"nome":"Bacon","preco":5}]', 'Lanches', null),
  (2, 1, 'Refri', 8.00, null, '[]', 'Bebidas', null),
  (3, 2, 'Prato da outra loja', 50.00, null, '[]', 'Pratos', null),
  (4, 1, 'Pudim', 12.00, null, '[]', 'Sobremesas', null),
  (5, 1, 'Suco', 10.00, null, '[]', 'Bebidas', null);
insert into public.tab_grupos_opcoes values (100, 1, 1);
insert into public.tab_opcoes values (10, 1, 100, 'Ao ponto', 0), (11, 1, 100, 'Dobro de carne', 9);
insert into public.tab_promocoes (id, loja_id, tipo, desconto_percent, desconto_valor, produto_id, produto_ids, categoria_id, data_inicio, data_fim, ativo) values
  (1, 1, 'percentual', 10, null, 2, null, null, null, null, true),
  (2, 1, 'percentual', 90, null, 1, null, null, null, current_date - 5, true),   -- vencida
  (3, 1, 'percentual', 90, null, 1, null, null, null, null, false),              -- desligada
  (4, 1, 'combo', null, 30.00, null, '[1,2]', null, null, null, true),
  (5, 1, 'valor', null, 4.00, null, null, 7, null, null, true),                  -- categoria Sobremesas
  (6, 2, 'percentual', 99, null, null, null, null, null, null, true);            -- de outra loja

create function public.t_item(pid bigint, nome text, preco numeric, qtd numeric default 1, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('productId', pid, 'name', nome, 'price', preco, 'quantity', qtd) || extra) $$;

-- Executa o comando e confere se passou ('ok') ou qual recusa veio.
create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio <> esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_novo(rotulo text, esperado text, itens jsonb, loja bigint default 1) returns void language sql as $$
  select public.t_espera(rotulo, esperado, format(
    'insert into public.tab_pedidos (id, loja_id, itens, status) values (%L, %s, %L::jsonb, %L)',
    'P-' || md5(rotulo), loja, itens, 'cancelado')) $$;   -- cancelado: não serve de origem para os casos seguintes

set request.jwt.claims = '{"role":"authenticated"}';
select public.t_novo('preço de cadastro', 'ok', public.t_item(1, 'Burger', 30));
select public.t_novo('preço promocional do produto', 'ok', public.t_item(1, 'Burger', 27));
select public.t_novo('promoção percentual', 'ok', public.t_item(2, 'Refri', 7.20));
select public.t_novo('promoção por categoria', 'ok', public.t_item(4, 'Pudim', 8.00));
select public.t_novo('combo: parte do burger', 'ok', public.t_item(1, 'Burger', 23.68));
select public.t_novo('combo: parte do refri', 'ok', public.t_item(2, 'Refri', 6.32));
select public.t_novo('adicional e opção somados', 'ok', public.t_item(1, 'Burger', 41, 1, '{"extraIngredients":["Bacon"],"selectedOptions":[{"optionId":11}]}'));
select public.t_novo('opção antiga pelo nome', 'item_preco_abaixo_do_cadastro', public.t_item(1, 'Burger', 27, 1, '{"selectedOptions":[{"nome":"Dobro de carne"}]}'));
select public.t_novo('preço acima do cadastro', 'ok', public.t_item(5, 'Suco', 11));
select public.t_novo('número em texto', 'ok', '[{"productId":"5","name":"Suco","price":"10.00","quantity":"2"}]');
select public.t_novo('um centavo de tolerância', 'ok', public.t_item(5, 'Suco', 9.99));

select public.t_novo('preço adulterado', 'item_preco_abaixo_do_cadastro', public.t_item(5, 'Suco', 1));
select public.t_novo('abaixo por 2 centavos', 'item_preco_abaixo_do_cadastro', public.t_item(5, 'Suco', 9.98));
select public.t_novo('promoção vencida ou desligada não vale', 'item_preco_abaixo_do_cadastro', public.t_item(1, 'Burger', 3));
select public.t_novo('adicional não cobrado', 'item_preco_abaixo_do_cadastro', public.t_item(1, 'Burger', 22, 1, '{"extraIngredients":["Bacon"]}'));
select public.t_novo('opção e adicional repetidos contam uma vez', 'ok', public.t_item(1, 'Burger', 36, 1, '{"selectedOptions":[{"optionId":11},{"optionId":11}],"extraIngredients":["Bacon","Bacon"]}'));
select public.t_novo('opção de outro produto não conta', 'ok', public.t_item(5, 'Suco', 10, 1, '{"selectedOptions":[{"optionId":11}]}'));
select public.t_novo('produto de outra loja', 'item_sem_produto_no_cadastro', public.t_item(3, 'Prato da outra loja', 50));
select public.t_novo('item sem produto', 'item_sem_produto_no_cadastro', '[{"name":"Avulso","price":10,"quantity":1}]');
select public.t_novo('productId inválido', 'item_sem_produto_no_cadastro', '[{"productId":"abc","name":"X","price":10,"quantity":1}]');
select public.t_novo('preço negativo', 'item_invalido', public.t_item(5, 'Suco', -1));
select public.t_novo('quantidade zero', 'item_invalido', public.t_item(5, 'Suco', 10, 0));
select public.t_novo('quantidade negativa', 'item_invalido', public.t_item(5, 'Suco', 10, -2));
select public.t_novo('sem preço', 'item_invalido', '[{"productId":5,"name":"Suco","quantity":1}]');
select public.t_novo('itens que não são lista', 'item_invalido', '{"productId":5}');
select public.t_novo('um item ruim derruba o pedido', 'item_preco_abaixo_do_cadastro', public.t_item(5, 'Suco', 10) || public.t_item(1, 'Burger', 0));

-- Pedido antigo (gravado sem sessão) com preço que hoje seria recusado.
reset request.jwt.claims;
insert into public.tab_pedidos (id, loja_id, itens) values
  ('ANTIGO', 1, public.t_item(5, 'Suco', 5)),
  ('PAGO', 1, public.t_item(5, 'Suco', 4)),
  ('LOJA2', 2, public.t_item(5, 'Suco', 3));
update public.tab_pedidos set status_pagamento = 'pago' where id = 'PAGO';
set request.jwt.claims = '{"role":"authenticated"}';

select public.t_espera('aumentar quantidade mantém o preço da venda', 'ok', $c$update public.tab_pedidos set itens = public.t_item(5, 'Suco', 5, 3) where id = 'ANTIGO'$c$);
select public.t_espera('baixar o preço de item existente', 'item_preco_abaixo_do_cadastro', $c$update public.tab_pedidos set itens = public.t_item(5, 'Suco', 2, 3) where id = 'ANTIGO'$c$);
select public.t_espera('trocar o nome não herda o preço antigo', 'item_preco_abaixo_do_cadastro', $c$update public.tab_pedidos set itens = public.t_item(5, 'Outro', 5) where id = 'ANTIGO'$c$);
select public.t_espera('incluir item novo barato', 'item_preco_abaixo_do_cadastro', $c$update public.tab_pedidos set itens = itens || public.t_item(1, 'Burger', 1) where id = 'ANTIGO'$c$);
select public.t_espera('incluir item novo correto', 'ok', $c$update public.tab_pedidos set itens = itens || public.t_item(1, 'Burger', 30) where id = 'ANTIGO'$c$);
select public.t_espera('remover item', 'ok', $c$update public.tab_pedidos set itens = public.t_item(5, 'Suco', 5, 3) where id = 'ANTIGO'$c$);
select public.t_espera('mudar status não confere itens', 'ok', $c$update public.tab_pedidos set status = 'pronto' where id = 'ANTIGO'$c$);
select public.t_espera('separar conta: item vindo de conta em aberto', 'ok', $c$insert into public.tab_pedidos (id, loja_id, itens) values ('SEPARADO', 1, public.t_item(5, 'Suco', 5))$c$);
select public.t_novo('conta paga não serve de origem', 'item_preco_abaixo_do_cadastro', public.t_item(5, 'Suco', 4));
select public.t_novo('conta de outra loja não serve de origem', 'item_preco_abaixo_do_cadastro', public.t_item(5, 'Suco', 3));

set request.jwt.claims = '{"role":"anon"}';
select public.t_novo('visitante: segue o cálculo do cardápio', 'ok', public.t_item(5, 'Suco', 0.5));
reset request.jwt.claims;
select public.t_novo('sem sessão (servidor, SQL Editor)', 'ok', public.t_item(5, 'Suco', 0.4));

-- Quem está logado não chama as funções de apoio diretamente.
select public.t_espera('funções de apoio fechadas', 'ok', $c$do $d$ begin
  if has_function_privilege('authenticated', 'public.app_pp_preco_minimo(bigint, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.app_pp_preco_minimo(bigint, jsonb)', 'execute') then raise exception 'aberta'; end if; end $d$$c$);
select 'TODOS OS CASOS PASSARAM' as resultado;
