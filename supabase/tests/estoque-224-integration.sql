-- Teste da migration 224 (sobre 218 e 222) em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/estoque-224-integration.sql   (a partir da raiz do projeto)
do $$ begin
  if to_regclass('public.tab_pedidos') is not null then raise exception 'Este teste é só para um banco local vazio. Nada foi feito.'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

create table public.tab_lojas (id bigint primary key, nome text);
create table public.tab_usuarios (id bigint primary key, email text, ativo boolean, super_admin boolean, loja_id bigint, perfil text, ids_acesso text[]);
create table public.tab_pedidos (id text primary key, loja_id bigint, mesa text, comanda text, cliente_telefone text, itens jsonb default '[]',
  status text default 'finalizado', status_pagamento text default 'aberto', pagamento_forma text, criado_em timestamptz default now());
create table public.tab_formas_pagamento (id bigint generated always as identity primary key, loja_id bigint, nome text, permite_troco boolean default false);
create table public.tab_pagamentos (id bigint generated always as identity primary key, mesa text, comandas text[] default '{}', total numeric(10,2),
  troco numeric(10,2), detalhes jsonb, loja_id bigint, criado_em timestamptz default now());
create table public.tab_caixas (id bigint primary key, loja_id bigint, status text);
create table public.tab_caixa_mov (id bigint generated always as identity primary key, loja_id bigint, caixa_id bigint, tipo text, valor numeric(10,2), descricao text, usuario_id bigint);
create table public.tab_clientes (id bigint generated always as identity primary key, nome text, telefone text, loja_id bigint);
create table public.tab_fidelidade_regras (id bigint generated always as identity primary key, loja_id bigint, valor_por_ponto numeric(10,2) not null default 1, pontos_por_real numeric(10,2) not null default 100, ativo boolean not null default true);
create table public.tab_fidelidade_recompensas (id bigint generated always as identity primary key, loja_id bigint, nome text not null, pontos_necessarios integer not null default 0, ativo boolean not null default true);
create table public.tab_fidelidade_transacoes (id bigint generated always as identity primary key, loja_id bigint, cliente_id bigint, order_id bigint, pontos integer not null default 0, tipo text not null default 'earn', descricao text, criado_em timestamptz not null default now());
create table public.tab_produtos (id bigint primary key, loja_id bigint, nome text, estoque integer, estoque_minimo integer);
create table public.tab_estoque_mov (id bigint generated always as identity primary key, loja_id bigint, produto_id bigint, produto_nome text not null,
  quantidade integer not null, estoque_antes integer not null, estoque_depois integer not null, comandas text, origem text not null default 'baixa_caixa', criado_em timestamptz not null default now());

create function public.app_caller_email() returns text language sql as $$ select nullif(current_setting('t.email', true), '') $$;
create function public.app_pp_numero(p jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
              when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric end $$;
create function public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text) returns json language sql as $$ select json_build_object('ok', false) $$;
create function public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text, p_comandas text[], p_cliente_telefone text, p_canal text)
returns json language sql as $$ select json_build_object('ok', true) $$;
create function public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text default null, p_status text default null)
returns public.tab_pedidos language plpgsql security definer set search_path = public as $$
declare v_row public.tab_pedidos%rowtype;
begin
  update public.tab_pedidos set status_pagamento = 'pago', status = coalesce(p_status, status) where id = p_pedido_id returning * into v_row;
  return v_row;
end $$;
-- Trava de manutenção e a função antiga, como estão nos bancos.
create function public.app_assert_business_write_allowed(a text, b text) returns void language plpgsql as $$
begin if current_setting('t.manutencao', true) = '1' then raise exception 'manutencao'; end if; end $$;
create function public.app_baixar_estoque_produto(p_loja_id bigint, p_itens jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.app_assert_business_write_allowed(null, null);
  update public.tab_produtos set estoque = 0 where loja_id = p_loja_id;
  return '{}'::jsonb;
end $$;
grant execute on function public.app_baixar_estoque_produto(bigint, jsonb) to authenticated;

\i supabase/migrations/218_caixa_parametros_e_fechamento.sql
\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2');
insert into public.tab_usuarios values (2, 'caixa@l1', true, false, 1, 'Caixa', '{cashier}'), (5, 'cozinha@l1', true, false, 1, 'Cozinha', '{kitchen}');
insert into public.tab_produtos values (10, 1, 'Burger', 50, 5), (11, 1, 'Suco', 3, 0), (12, 1, 'Fritas', 20, 0), (13, 1, 'Sem controle', null, null),
  (20, 2, 'Burger', 70, 0);
insert into public.tab_caixas values (10, 1, 'aberto');

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio not like esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
create function public.t_item(p_pid text, p_nome text, p_qtd numeric) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('productId', p_pid, 'name', p_nome, 'price', 10, 'quantity', p_qtd)) $$;
create function public.t_pedido(p_id text, variadic p_itens jsonb[]) returns text language sql as $$
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, itens) values (p_id, 1, 'Mesa 1', 'C-' || p_id, to_jsonb(p_itens)) returning id $$;
-- Fecha pagando em dinheiro, que permite troco (o valor não importa para o estoque).
create function public.t_fechar(variadic p_ids text[]) returns jsonb language sql as $$
  select public.app_fechar_conta(p_ids, '[{"forma":"Dinheiro","valor":100000}]'::jsonb) $$;
create function public.t_estoque(p_id bigint) returns integer language sql as $$ select estoque from public.tab_produtos where id = p_id $$;
set t.email = 'caixa@l1';

select public.t_pedido('A', public.t_item('10', 'Burger', 2), public.t_item('11', 'Suco', 1));
select public.t_pedido('B', public.t_item('10', 'Burger', 3));
select public.t_vale('venda baixa pelo código, somando os pedidos', (public.t_fechar('A', 'B') ->> 'ok') = 'true'
  and public.t_estoque(10) = 45 and public.t_estoque(11) = 2);
select public.t_vale('um lançamento por produto, com antes e depois', (select count(*) from public.tab_estoque_mov) = 2
  and exists (select 1 from public.tab_estoque_mov where produto_id = 10 and quantidade = 5 and estoque_antes = 50 and estoque_depois = 45 and loja_id = 1 and origem = 'baixa_caixa'));
select public.t_vale('pagamento registra que baixou', (select composicao ->> 'estoqueBaixado' from public.tab_pagamentos order by id desc limit 1) = 'true');
select public.t_vale('a outra empresa não mudou', public.t_estoque(20) = 70);

select public.t_pedido('C', public.t_item(null, 'Fritas', 4));
select public.t_vale('item sem código: pelo nome', (public.t_fechar('C') ->> 'ok') = 'true' and public.t_estoque(12) = 16);
select public.t_pedido('D', public.t_item('20', 'Burger', 1));
select public.t_vale('código de outra empresa: vale o produto de mesmo nome da própria', (public.t_fechar('D') ->> 'ok') = 'true'
  and public.t_estoque(10) = 44 and public.t_estoque(20) = 70);
select public.t_pedido('E', public.t_item('11', 'Suco', 9));
select public.t_vale('estoque não fica negativo', (public.t_fechar('E') ->> 'ok') = 'true' and public.t_estoque(11) = 0);
select public.t_pedido('F', public.t_item('999', 'Não existe', 1), public.t_item('abc', 'Também não', 1), public.t_item('13', 'Sem controle', 2));
select public.t_vale('item desconhecido é ignorado; estoque vazio conta como zero', (public.t_fechar('F') ->> 'ok') = 'true' and public.t_estoque(13) = 0);

select public.t_pedido('G', public.t_item('10', 'Burger', 1));
select public.t_espera('venda recusada não baixa', 'valor_recebido_insuficiente', $c$select public.app_fechar_conta(array['G'], '[{"forma":"PIX","valor":0.01}]')$c$);
select public.t_espera('venda desfeita depois da baixa desfaz a baixa', 'caixa_invalido',
  $c$select public.app_fechar_conta(array['G'], '[{"forma":"Dinheiro","valor":100}]', p_caixa_id => 99)$c$);
select public.t_vale('estoque intacto', public.t_estoque(10) = 44);
select public.t_vale('com o pedido mantido na cozinha também baixa', (public.app_fechar_conta(array['G'], '[{"forma":"Dinheiro","valor":100}]', p_manter_status => true) ->> 'ok') = 'true'
  and public.t_estoque(10) = 43);
select public.t_espera('pagar de novo não baixa de novo', 'pedido_ja_pago', $c$select public.t_fechar('G')$c$);

-- A chamada antiga do navegador não altera nada.
set role authenticated;
select public.t_vale('função antiga sem efeito', public.app_baixar_estoque_produto(1, '[{"nome":"Burger","quantidade":40}]') ->> 'noServidor' = 'true');
select public.t_espera('navegador não altera produtos', 'permission denied%', $c$update public.tab_produtos set estoque = 1$c$);
select public.t_espera('função do gatilho fechada', 'permission denied%', $c$select public.app_pp_baixar_estoque_da_venda()$c$);
reset role;
select public.t_vale('estoque igual depois da chamada antiga', public.t_estoque(10) = 43);
set t.manutencao = '1';
select public.t_espera('trava de manutenção continua na função antiga', 'manutencao', $c$select public.app_baixar_estoque_produto(1, '[]')$c$);
set t.manutencao = '';
set role anon;
select public.t_espera('visitante sem execução', 'permission denied%', $c$select public.app_baixar_estoque_produto(1, '[]')$c$);
reset role;

-- Falha na baixa não derruba a venda e não deixa baixa pela metade.
create function public.t_recusa() returns trigger language plpgsql as $$ begin if new.id = 12 then raise exception 'produto bloqueado'; end if; return new; end $$;
create trigger t_bloqueio before update on public.tab_produtos for each row execute function public.t_recusa();
select public.t_pedido('H', public.t_item('10', 'Burger', 1), public.t_item('12', 'Fritas', 1));
select public.t_vale('venda conclui mesmo com falha no estoque', (public.t_fechar('H') ->> 'ok') = 'true');
select public.t_vale('pedido ficou pago', (select status_pagamento from public.tab_pedidos where id = 'H') = 'pago');
select public.t_vale('nada pela metade e motivo guardado', public.t_estoque(10) = 43 and public.t_estoque(12) = 16
  and (select composicao ->> 'estoqueBaixado' from public.tab_pagamentos order by id desc limit 1) = 'false'
  and (select composicao ->> 'estoqueErro' from public.tab_pagamentos order by id desc limit 1) = 'produto bloqueado');
drop trigger t_bloqueio on public.tab_produtos;

-- Pagamento sem a lista de pedidos não mexe no estoque; rodar a migration de novo não cria outro gatilho.
insert into public.tab_pagamentos (mesa, total, loja_id) values ('X', 1, 1);
select public.t_vale('pagamento sem composição não baixa', public.t_estoque(10) = 43 and (select composicao from public.tab_pagamentos order by id desc limit 1) is null);
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql
select public.t_pedido('I', public.t_item('10', 'Burger', 1));
select public.t_vale('depois de rodar de novo, baixa uma vez só', (public.t_fechar('I') ->> 'ok') = 'true' and public.t_estoque(10) = 42);
select 'TODOS OS CASOS PASSARAM' as resultado;
