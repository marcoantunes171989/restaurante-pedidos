-- Teste da migration 225 (sobre 218, 222 e 224) em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/historicos-225-integration.sql   (a partir da raiz do projeto)
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
create table public.tab_usuarios (id bigint primary key, nome text, email text, ativo boolean, super_admin boolean, loja_id bigint, perfil text, ids_acesso text[]);
create table public.tab_pedidos (id text primary key, loja_id bigint, mesa text, comanda text, cliente text, cliente_telefone text, itens jsonb default '[]',
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
create table public.tab_produtos (id bigint primary key, loja_id bigint, nome text not null, categoria text, preco numeric not null default 0, custo numeric not null default 0, estoque integer not null default 0, estoque_minimo integer);
create table public.tab_estoque_mov (id bigint generated always as identity primary key, loja_id bigint, produto_id bigint, produto_nome text not null,
  quantidade integer not null, estoque_antes integer not null, estoque_depois integer not null, comandas text, origem text not null default 'baixa_caixa', criado_em timestamptz not null default now());
create table public.loja_fiscal_documento (id bigint generated always as identity primary key, loja_id bigint not null, modelo smallint not null, serie integer not null default 1,
  numero bigint not null, ambiente text not null default 'homologacao', status text not null, chave text, valor_total numeric(14,2) default 0, pedidos_ids text[] not null default '{}',
  dh_autorizacao timestamptz, criado_em timestamptz not null default now());

create function public.app_caller_email() returns text language sql as $$ select nullif(current_setting('t.email', true), '') $$;
create function public.app_pp_numero(p jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
              when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric end $$;
create function public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text) returns json language sql as $$
  select json_build_object('ok', true, 'id', 1, 'desconto', 5) $$;
create function public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text, p_comandas text[], p_cliente_telefone text, p_canal text)
returns json language sql as $$ select json_build_object('ok', true) $$;
create function public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text default null, p_status text default null)
returns public.tab_pedidos language plpgsql security definer set search_path = public as $$
declare v_row public.tab_pedidos%rowtype;
begin
  update public.tab_pedidos set status_pagamento = 'pago', status = coalesce(p_status, status) where id = p_pedido_id returning * into v_row;
  return v_row;
end $$;

\i supabase/migrations/218_caixa_parametros_e_fechamento.sql
\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2');
insert into public.tab_usuarios values
  (1, 'Gestora', 'gestor@l1', true, false, 1, 'Gestor', '{admin,cashier}'), (2, 'Caixa Um', 'caixa@l1', true, false, 1, 'Caixa', '{cashier}'),
  (3, 'Gestor Dois', 'gestor@l2', true, false, 2, 'Gestor', '{admin,cashier}');
insert into public.tab_produtos (id, loja_id, nome, categoria, preco, custo, estoque) values
  (10, 1, 'Burger', 'Lanches', 30, 12, 50), (11, 1, 'Suco', 'Bebidas', 10, 0, 20), (20, 2, 'Burger', 'Lanches', 30, 9, 70);
insert into public.tab_clientes (nome, telefone, loja_id) values ('Ana', '11900000000', 1);
insert into public.tab_fidelidade_regras (loja_id) values (1);

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio not like esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
create function public.t_pedido(p_id text, p_itens jsonb, p_mesa text default 'Mesa 1', p_loja bigint default 1) returns text language sql as $$
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, cliente, cliente_telefone, itens) values (p_id, p_loja, p_mesa, 'C-' || p_id, 'Ana', '11900000000', p_itens) returning id $$;
create function public.t_fechar(p_id text, p_cupom text default null) returns jsonb language sql as $$
  select public.app_fechar_conta(array[p_id], '[{"forma":"Dinheiro","valor":1000}]'::jsonb, p_cupom_codigo => p_cupom, p_pontos_no_servidor => true) $$;

-- Uma venda anterior à 225: tem composição, não tem registro.
set t.email = 'caixa@l1';
select public.t_pedido('ANTIGA', '[{"productId":10,"name":"Burger","price":30,"quantity":1}]');
select public.t_vale('venda anterior fechada', (public.t_fechar('ANTIGA') ->> 'ok') = 'true');

\i supabase/migrations/225_historico_de_vendas_e_de_estoque.sql
\i supabase/migrations/225_historico_de_vendas_e_de_estoque.sql

select public.t_vale('venda antiga reconstruída, sem custo', (select origem = 'reconstruida' and custo_total is null and total = 33 from public.tab_venda));
select public.t_vale('movimento antigo ligado ao pagamento', exists (select 1 from public.tab_estoque_mov m join public.tab_venda v on v.pagamento_id = m.pagamento_id where m.tipo = 'venda'));

-- ── Venda nova ──
select public.t_pedido('P1', '[{"productId":10,"name":"Burger","price":30,"quantity":2,"observation":"sem cebola"},{"productId":11,"name":"Suco","price":10,"quantity":1}]', 'Externo · Retirada');
select public.t_vale('fecha com cupom', (public.t_fechar('P1', 'CINCO') ->> 'ok') = 'true');
select public.t_vale('venda registrada com valores, canal, cliente e operador', (
  select origem = 'venda' and canal = 'retirada' and subtotal = 70 and desconto_cupom = 5 and total = 65 and cupom_codigo = 'CINCO'
     and cliente_nome = 'Ana' and cliente_id = 1 and operador_nome = 'Caixa Um' and qtd_itens = 3 and loja_id = 1
    from public.tab_venda where pedidos_ids = '{P1}'));
select public.t_vale('custo vazio quando um item não tem custo', (select custo_total is null from public.tab_venda where pedidos_ids = '{P1}'));
select public.t_vale('itens com preço, custo da época, categoria e observação', (
  select count(*) = 2 and sum(i.total) = 70 and max(custo_unitario) filter (where produto_id = 10) = 12 and bool_or(categoria = 'Bebidas')
     and bool_or(detalhes ->> 'observation' = 'sem cebola') from public.tab_venda_item i join public.tab_venda v on v.id = i.venda_id where v.pedidos_ids = '{P1}'));
select public.t_vale('movimentos de venda ligados e com usuário', (
  select count(*) = 2 and bool_and(m.tipo = 'venda' and m.usuario_id = 2) from public.tab_estoque_mov m join public.tab_venda v on v.pagamento_id = m.pagamento_id where v.pedidos_ids = '{P1}'));
select public.t_vale('pagamento marcado', (select composicao ->> 'historico' = 'true' and composicao ->> 'estoqueBaixado' = 'true' from public.tab_pagamentos order by id desc limit 1));
update public.tab_produtos set custo = 99, preco = 99 where id = 10;
select public.t_vale('mudar o cadastro não muda a venda registrada', (select max(custo_unitario) = 12 from public.tab_venda_item where produto_id = 10));
update public.tab_produtos set custo = 12 where id = 11;
select public.t_pedido('P2', '[{"productId":11,"name":"Suco","price":10,"quantity":2}]');
select public.t_vale('custo total quando todos têm custo', (public.t_fechar('P2') ->> 'ok') = 'true');
select public.t_vale('custo = 24', (select custo_total = 24 and canal = 'mesa' and taxa_servico = 2 from public.tab_venda where pedidos_ids = '{P2}'));

select public.t_espera('venda não se altera', 'registro_de_venda_nao_se_altera', $c$update public.tab_venda set total = 0$c$);
select public.t_espera('item não se apaga', 'registro_de_venda_nao_se_altera', $c$delete from public.tab_venda_item$c$);
select public.t_pedido('P3', '[{"productId":10,"name":"Burger","price":99,"quantity":1}]');
select public.t_espera('venda recusada não registra', 'valor_recebido_insuficiente', $c$select public.app_fechar_conta(array['P3'], '[{"forma":"PIX","valor":1}]')$c$);
select public.t_vale('nada de P3', not exists (select 1 from public.tab_venda where pedidos_ids = '{P3}'));

-- ── Estoque fora da venda ──
set t.email = 'gestor@l1';
update public.tab_produtos set estoque = estoque + 10 where id = 10;
select public.t_vale('alteração pelo cadastro registrada', (select tipo = 'ajuste' and origem = 'cadastro' and motivo = 'Alteração pelo cadastro do produto' and usuario_id = 1
    and quantidade = 10 and estoque_depois = estoque_antes + 10 and pagamento_id is null from public.tab_estoque_mov order by id desc limit 1));
insert into public.tab_produtos (id, loja_id, nome, estoque) values (12, 1, 'Fritas', 8);
select public.t_vale('estoque inicial registrado', (select tipo = 'cadastro' and estoque_antes = 0 and estoque_depois = 8 from public.tab_estoque_mov where produto_id = 12));
update public.tab_produtos set nome = 'Fritas P' where id = 12;
select public.t_vale('mudança sem estoque não registra', (select count(*) = 1 from public.tab_estoque_mov where produto_id = 12));
select public.t_vale('ajuste manual com justificativa', r ->> 'tipo' = 'ajuste' and r ->> 'motivo' = 'perda na cozinha' and r ->> 'estoque_depois' = '5' and r ->> 'quantidade' = '3' and r ->> 'origem' = 'ajuste_manual' and r ->> 'usuario_id' = '1')
  from (select public.app_estoque_ajustar(12, 5, '  perda na cozinha ') r) x;
select public.t_espera('sem justificativa', 'justificativa_obrigatoria', $c$select public.app_estoque_ajustar(12, 9, ' ')$c$);
select public.t_espera('negativo', 'parametro_invalido', $c$select public.app_estoque_ajustar(12, -1, 'teste')$c$);
select public.t_espera('sem mudança', 'estoque_sem_mudanca', $c$select public.app_estoque_ajustar(12, 5, 'teste')$c$);
select public.t_espera('produto de outra empresa', 'produto_nao_encontrado', $c$select public.app_estoque_ajustar(20, 1, 'teste')$c$);
set t.email = 'caixa@l1';
select public.t_espera('caixa não ajusta', 'produto_nao_encontrado', $c$select public.app_estoque_ajustar(12, 1, 'teste')$c$);

-- ── Consultas e isolamento ──
insert into public.loja_fiscal_documento (loja_id, modelo, numero, status, pedidos_ids) values (1, 65, 7, 'cancelado', '{P1}'), (1, 65, 8, 'autorizado', '{P1}'), (2, 65, 9, 'autorizado', '{P1}');
select public.t_espera('caixa não consulta vendas', 'forbidden', $c$select public.app_vendas_historico(1)$c$);
select public.t_espera('caixa não consulta estoque', 'forbidden', $c$select public.app_estoque_movimentos(1)$c$);
set t.email = 'gestor@l2';
select public.t_espera('outra empresa não consulta', 'forbidden', $c$select public.app_vendas_historico(1)$c$);
select public.t_espera('outra empresa não vê o detalhe', 'venda_nao_encontrada', $c$select public.app_venda_detalhe((select min(id) from public.tab_venda))$c$);
select public.t_vale('loja 2 vê só o que é dela', (public.app_vendas_historico(2) ->> 'total') = '0' and (public.app_estoque_movimentos(2) ->> 'total') = '0');
select public.t_espera('sem empresa informada', 'forbidden', $c$select public.app_vendas_historico(null)$c$);
set t.email = 'gestor@l1';
select public.t_vale('lista de vendas com resumo', r ->> 'total' = '3' and (r #>> '{resumo,valor}')::numeric = 120 and r #>> '{resumo,semCusto}' = '2' and (r #>> '{resumo,custo}')::numeric = 24
    and r -> 'formas' @> '["Dinheiro"]') from (select public.app_vendas_historico(1) r) x;
select public.t_vale('busca por produto, cupom e pedido', (public.app_vendas_historico(1, p_busca => 'suco') ->> 'total') = '2' and (public.app_vendas_historico(1, p_busca => 'cinco') ->> 'total') = '1'
    and (public.app_vendas_historico(1, p_busca => 'P2') ->> 'total') = '1' and (public.app_vendas_historico(1, p_busca => '%') ->> 'total') = '0');
select public.t_vale('filtro por forma e período', (public.app_vendas_historico(1, p_forma => 'PIX') ->> 'total') = '0' and (public.app_vendas_historico(1, p_de => now() + interval '1 day') ->> 'total') = '0');
select public.t_vale('paginação', jsonb_array_length(public.app_vendas_historico(1, p_pagina => 2, p_por_pagina => 2) -> 'linhas') = 1);
select public.t_vale('nota autorizada primeiro, só da própria empresa', r #>> '{linhas,0,notas,0,numero}' = '8' and jsonb_array_length(r #> '{linhas,0,notas}') = 2)
  from (select public.app_vendas_historico(1, p_busca => 'cinco') r) x;
select public.t_vale('movimentos com venda e nota', r #>> '{linhas,0,notas,0,numero}' = '8' and r #>> '{linhas,0,tipo}' = 'venda' and r #>> '{linhas,0,cliente}' = 'Ana')
  from (select public.app_estoque_movimentos(1, p_produto_id => 11, p_pagina => 2, p_por_pagina => 1) r) x;
select public.t_vale('filtro por tipo e totais', (public.app_estoque_movimentos(1, p_tipo => 'ajuste') ->> 'total') = '2'
  and (public.app_estoque_movimentos(1, p_tipo => 'ajuste') ->> 'entradas') = '10' and (public.app_estoque_movimentos(1, p_tipo => 'ajuste') ->> 'saidas') = '3');
select public.t_vale('detalhe completo', r #>> '{venda,total}' = '65.00' and jsonb_array_length(r -> 'itens') = 2 and jsonb_array_length(r -> 'estoque') = 2
    and jsonb_array_length(r -> 'pontos') = 1 and r #>> '{pontos,0,tipo}' = 'earn')
  from (select public.app_venda_detalhe((select id from public.tab_venda where pedidos_ids = '{P1}')) r) x;
set role authenticated;
select public.t_espera('sem leitura direta das vendas', 'permission denied%', $c$select * from public.tab_venda$c$);
select public.t_espera('sem leitura direta dos itens', 'permission denied%', $c$select * from public.tab_venda_item$c$);
select public.t_espera('função de registro fechada', 'permission denied%', $c$select public.app_pp_registrar_venda(null::public.tab_pagamentos, 'venda')$c$);
reset role;
set role anon;
select public.t_espera('visitante sem consulta', 'permission denied%', $c$select public.app_vendas_historico(1)$c$);
reset role;

-- ── Falha no histórico não derruba a venda ──
alter table public.tab_venda add constraint t_bloqueio check (total < 1) not valid;
set t.email = 'caixa@l1';
select public.t_vale('venda conclui mesmo com falha no histórico', (public.t_fechar('P3') ->> 'ok') = 'true');
select public.t_vale('motivo guardado e estoque baixado', (select composicao ->> 'historico' = 'false' and composicao ->> 'estoqueBaixado' = 'true' from public.tab_pagamentos order by id desc limit 1)
  and not exists (select 1 from public.tab_venda where pedidos_ids = '{P3}'));
alter table public.tab_venda drop constraint t_bloqueio;
\i supabase/migrations/225_historico_de_vendas_e_de_estoque.sql
select public.t_vale('rodar de novo reconstrói o que faltou, sem custo', (select origem = 'reconstruida' and custo_total is null from public.tab_venda where pedidos_ids = '{P3}'));
select 'TODOS OS CASOS PASSARAM' as resultado;
