-- Teste da migration 226 (sobre 208, 218, 221, 222, 224 e 225) em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/estorno-226-integration.sql   (a partir da raiz do projeto)
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
create table public.loja_fiscal_documento (id uuid primary key default gen_random_uuid(), loja_id bigint not null, modelo smallint not null, serie integer not null default 1,
  numero bigint not null, ambiente text not null default 'homologacao', status text not null, chave text, valor_total numeric(14,2) default 0, pedidos_ids text[] not null default '{}',
  dh_autorizacao timestamptz, criado_em timestamptz not null default now());
create table public.tab_cupons (id bigint primary key, loja_id bigint, codigo text, quantidade_usada integer not null default 0, atualizado_em timestamptz default now());
create table public.tab_cupom_usos (id bigint generated always as identity primary key, cupom_id bigint not null, loja_id bigint, codigo text not null, criado_em timestamptz not null default now());

create function public.app_caller_email() returns text language sql as $$ select nullif(current_setting('t.email', true), '') $$;
create function public.app_pp_numero(p jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
              when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric end $$;
create function public.app_pode_receber_pagamento(p_loja_id bigint) returns boolean language sql as $$ select true $$;
create function public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text) returns json language sql as $$
  select json_build_object('ok', true, 'id', 1, 'desconto', 5) $$;
create function public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text, p_comandas text[], p_cliente_telefone text, p_canal text)
returns json language plpgsql as $$ begin
  update public.tab_cupons set quantidade_usada = quantidade_usada + 1 where id = p_cupom_id;
  insert into public.tab_cupom_usos (cupom_id, loja_id, codigo) values (p_cupom_id, p_loja_id, 'DEZ');
  return json_build_object('ok', true);
end $$;
create function public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text default null, p_status text default null)
returns public.tab_pedidos language plpgsql security definer set search_path = public as $$
declare v_row public.tab_pedidos%rowtype;
begin
  update public.tab_pedidos set status_pagamento = 'pago', status = coalesce(p_status, status) where id = p_pedido_id returning * into v_row;
  return v_row;
end $$;

\i supabase/migrations/208_venda_caixa_registro.sql
\i supabase/migrations/218_caixa_parametros_e_fechamento.sql
\i supabase/migrations/221_relatorios_valor_cobrado.sql
\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2'), (3, 'Loja sem caixa');
insert into public.tab_usuarios values
  (1, 'Gestora', 'gestor@l1', true, false, 1, 'Gestor', '{admin,cashier}'), (2, 'Caixa Um', 'caixa@l1', true, false, 1, 'Caixa', '{cashier}'),
  (3, 'Gestor Dois', 'gestor@l2', true, false, 2, 'Gestor', '{admin,cashier}'), (4, 'Gestor Três', 'gestor@l3', true, false, 3, 'Gestor', '{admin,cashier}');
insert into public.tab_produtos (id, loja_id, nome, categoria, preco, custo, estoque) values
  (10, 1, 'Burger', 'Lanches', 30, 12, 50), (11, 1, 'Suco', 'Bebidas', 10, 0, 20), (12, 1, 'Raro', 'Lanches', 5, 1, 1),
  (13, 1, 'Passageiro', 'Lanches', 5, 1, 9), (30, 3, 'Burger', 'Lanches', 30, 9, 70);
insert into public.tab_clientes (nome, telefone, loja_id) values ('Ana', '11900000000', 1);
insert into public.tab_fidelidade_regras (loja_id) values (1);
insert into public.tab_cupons (id, loja_id, codigo) values (1, 1, 'DEZ');
insert into public.tab_caixas values (1, 1, 'aberto');

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio not like esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
create function public.t_pedido(p_id text, p_itens jsonb, p_loja bigint default 1) returns text language sql as $$
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, cliente, cliente_telefone, itens)
  values (p_id, p_loja, 'Externo · Retirada', 'C-' || p_id, 'Ana', '11900000000', p_itens) returning id $$;
create function public.t_item(p_id bigint, p_nome text, p_preco numeric, p_qtd integer) returns jsonb language sql as $$
  select jsonb_build_object('productId', p_id, 'name', p_nome, 'price', p_preco, 'quantity', p_qtd) $$;
create function public.t_fechar(p_id text, p_parcelas jsonb, p_cupom text default null, p_caixa bigint default null) returns jsonb language sql as $$
  select public.app_fechar_conta(array[p_id], p_parcelas, p_cupom_codigo => p_cupom, p_caixa_id => p_caixa, p_pontos_no_servidor => true) $$;
create function public.t_estoque(p_id bigint) returns integer language sql as $$ select estoque from public.tab_produtos where id = p_id $$;
create function public.t_saldo() returns bigint language sql as $$ select public.app_pp_saldo_pontos(1, 1) $$;

\i supabase/migrations/225_historico_de_vendas_e_de_estoque.sql
\i supabase/migrations/226_estorno_de_venda.sql
\i supabase/migrations/226_estorno_de_venda.sql

create function public.t_venda(p_id text) returns bigint language sql as $$ select v.id from public.tab_venda v where p_id = any(v.pedidos_ids) $$;
create function public.t_estornar(p_id text) returns text language sql as $$
  select format('select public.app_venda_estornar(%s, %L)', public.t_venda(p_id), 'Cliente desistiu da compra no balcão') $$;

-- ── Venda completa: estoque, pontos, cupom, troco e caixa ──
insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao) values (1, 1, 1000, 'adjust', 'Saldo inicial');
set t.email = 'caixa@l1';
select public.t_pedido('V1', jsonb_build_array(public.t_item(10, 'Burger', 30, 2), public.t_item(11, 'Suco', 10, 1)));
select public.t_vale('venda V1 fechada', (public.t_fechar('V1', '[{"forma":"Pontos","valor":5},{"forma":"Dinheiro","valor":100}]', 'DEZ', 1) ->> 'ok') = 'true');
select public.app_venda_caixa_registrar(1, jsonb_build_object('codigo', 'B1', 'tipo', 'balcao', 'mesa', 'Externo',
  'composicao', jsonb_build_object('total', 65), 'pagamento', jsonb_build_object('total', 65, 'troco', 40, 'detalhes', '[{"forma":"Dinheiro","valor":105}]'::jsonb),
  'pedidos', '[{"id":"V1"}]'::jsonb));
select public.t_vale('antes do estorno: estoque baixado, saldo 560, cupom usado, 1 venda no balcão',
  public.t_estoque(10) = 48 and public.t_estoque(11) = 19 and public.t_saldo() = 560
  and (select quantidade_usada from public.tab_cupons) = 1 and jsonb_array_length(public.app_venda_caixa_listar(1) -> 'vendas') = 1);

select public.t_espera('operador do caixa não vê a prévia', 'venda_nao_encontrada', format('select public.app_venda_estorno_previa(%s)', public.t_venda('V1')));
select public.t_espera('operador do caixa não estorna', 'venda_nao_encontrada', public.t_estornar('V1'));
set t.email = 'gestor@l2';
select public.t_espera('gestor de outra empresa não vê a prévia', 'venda_nao_encontrada', format('select public.app_venda_estorno_previa(%s)', public.t_venda('V1')));
select public.t_espera('gestor de outra empresa não estorna', 'venda_nao_encontrada', public.t_estornar('V1'));
set t.email = 'gestor@l1';
select public.t_espera('justificativa curta é recusada', 'justificativa_obrigatoria', format('select public.app_venda_estornar(%s, %L)', public.t_venda('V1'), 'curta'));
select public.t_espera('venda inexistente', 'venda_nao_encontrada', $$select public.app_venda_estornar(999, 'Cliente desistiu da compra no balcão')$$);

select public.t_vale('prévia sem bloqueio, com 2 produtos, 2 lançamentos de pontos e a saída por forma',
  p -> 'bloqueios' = '[]'::jsonb and jsonb_array_length(p -> 'estoque') = 2 and jsonb_array_length(p -> 'pontos') = 2
  and p -> 'caixa' = '[{"forma":"Dinheiro","valor":60.00},{"forma":"Pontos","valor":5.00}]'::jsonb and (p ->> 'caixaId') = '1')
  from (select public.app_venda_estorno_previa(public.t_venda('V1')) as p) x;
select public.t_vale('a prévia não altera nada', public.t_estoque(10) = 48 and (select count(*) from public.tab_venda_estorno) = 0);

create table public.t_antes as select to_jsonb(v) as venda, to_jsonb(p) as pagamento from public.tab_venda v join public.tab_pagamentos p on p.id = v.pagamento_id where v.id = public.t_venda('V1');
select public.t_vale('gestora estorna', (public.app_venda_estornar(public.t_venda('V1'), 'Cliente desistiu da compra no balcão') ->> 'ok') = 'true');

select public.t_vale('estoque devolvido', public.t_estoque(10) = 50 and public.t_estoque(11) = 20);
select public.t_vale('movimentos de estorno com origem, motivo, usuário e pagamento',
  (select count(*) from public.tab_estoque_mov m join public.tab_venda v on v.pagamento_id = m.pagamento_id
    where v.id = public.t_venda('V1') and m.tipo = 'estorno' and m.origem = 'estorno' and m.usuario_id = 1 and m.motivo like 'Estorno: Cliente desistiu%' and m.estoque_depois > m.estoque_antes) = 2);
select public.t_vale('nenhum movimento a mais', (select count(*) from public.tab_estoque_mov) = 4);
select public.t_vale('saldo de pontos volta ao de antes da venda', public.t_saldo() = 1000);
select public.t_vale('totais de emitidos e resgatados se anulam',
  (select coalesce(sum(pontos), 0) from public.tab_fidelidade_transacoes where tipo = 'earn') = 0
  and (select coalesce(sum(pontos), 0) from public.tab_fidelidade_transacoes where tipo = 'redeem') = 0);
select public.t_vale('caixa: saída igual ao total da venda, sem o troco',
  (select sum(valor) from public.tab_caixa_mov where tipo = 'estorno') = 65
  and (select valor from public.tab_caixa_mov where tipo = 'estorno' and descricao like 'Estorno Dinheiro · %') = 60);
select public.t_vale('cupom devolvido e uso marcado', (select quantidade_usada from public.tab_cupons) = 0 and (select count(*) from public.tab_cupom_usos where estornado_em is not null) = 1);
select public.t_vale('pedido cancelado, sem pagamento e marcado',
  (select status = 'cancelado' and status_pagamento = 'aberto' and estornado_em is not null and motivo_cancelamento = 'Venda estornada' from public.tab_pedidos where id = 'V1'));
select public.t_vale('venda e pagamento originais intactos',
  (select a.venda = to_jsonb(v) and a.pagamento = to_jsonb(p) from public.t_antes a, public.tab_venda v join public.tab_pagamentos p on p.id = v.pagamento_id where v.id = public.t_venda('V1')));
select public.t_vale('registro do estorno com autor, motivo e valor',
  (select usuario_nome = 'Gestora' and valor = 65 and caixa_id = 1 and motivo = 'Cliente desistiu da compra no balcão' and not (resumo ? 'bloqueios') from public.tab_venda_estorno));
select public.t_espera('não estorna duas vezes', 'venda_ja_estornada', public.t_estornar('V1'));
select public.t_vale('segunda tentativa não alterou nada', public.t_estoque(10) = 50 and public.t_saldo() = 1000 and (select count(*) from public.tab_caixa_mov where tipo = 'estorno') = 2);
select public.t_espera('registro de estorno não muda', 'registro_de_venda_nao_se_altera', $$update public.tab_venda_estorno set motivo = 'x'$$);
select public.t_espera('registro de estorno não é apagado', 'registro_de_venda_nao_se_altera', $$delete from public.tab_venda_estorno$$);
select public.t_espera('pedido estornado não é pago de novo', 'pedido_cancelado_nao_pode_ser_pago', $$select public.t_fechar('V1', '[{"forma":"PIX","valor":70}]')$$);

select public.t_vale('histórico mostra o estorno e tira dos totais',
  r #>> '{resumo,vendas}' = '0' and r #>> '{resumo,estornadas}' = '1' and (r #>> '{resumo,valorEstornado}')::numeric = 65 and (r #>> '{resumo,valor}')::numeric = 0
  and r #>> '{linhas,0,estorno,por}' = 'Gestora' and r ->> 'total' = '1')
  from (select public.app_vendas_historico(1) as r) x;
select public.t_vale('detalhe mostra o estorno, os estornos de estoque e de pontos',
  d #>> '{estorno,motivo}' = 'Cliente desistiu da compra no balcão' and jsonb_array_length(d -> 'estoque') = 4 and jsonb_array_length(d -> 'pontos') = 4)
  from (select public.app_venda_detalhe(public.t_venda('V1')) as d) x;
select public.t_vale('valores cobrados ignoram o pagamento estornado', jsonb_array_length(public.app_valores_cobrados(1)) = 0);
select public.t_vale('venda estornada sai da Venda Balcão', jsonb_array_length(public.app_venda_caixa_listar(1) -> 'vendas') = 0);
select public.t_espera('venda estornada não recebe nota nova', 'venda_estornada_nao_emite_nota',
  $$insert into public.loja_fiscal_documento (loja_id, modelo, numero, status, pedidos_ids) values (1, 65, 90, 'reservado', '{V1}')$$);

-- ── Nota fiscal impede o estorno enquanto estiver ativa ──
set t.email = 'caixa@l1';
select public.t_pedido('N1', jsonb_build_array(public.t_item(10, 'Burger', 30, 1)));
select public.t_fechar('N1', '[{"forma":"PIX","valor":30}]');
insert into public.loja_fiscal_documento (loja_id, modelo, numero, status, pedidos_ids, valor_total) values (1, 65, 7, 'autorizado', '{N1}', 30);
set t.email = 'gestor@l1';
select public.t_espera('nota autorizada impede', 'venda_com_nota_ativa', public.t_estornar('N1'));
select public.t_vale('prévia informa qual nota', (public.app_venda_estorno_previa(public.t_venda('N1')) #>> '{bloqueios,0,detalhe}') = 'NFC-e nº 7 (autorizado)');
select public.t_vale('nota leva à venda, só para quem administra',
  jsonb_array_length(public.app_venda_da_nota((select id from public.loja_fiscal_documento where numero = 7))) = 1);
set t.email = 'caixa@l1';
select public.t_vale('operador não recebe a venda da nota', public.app_venda_da_nota((select id from public.loja_fiscal_documento where numero = 7)) = '[]'::jsonb);
set t.email = 'gestor@l2';
select public.t_vale('outra empresa não recebe a venda da nota', public.app_venda_da_nota((select id from public.loja_fiscal_documento where numero = 7)) = '[]'::jsonb);
set t.email = 'gestor@l1';
do $$
declare s text;
begin
  foreach s in array array['reservado', 'assinado', 'enviado', 'contingencia', 'erro'] loop
    update public.loja_fiscal_documento set status = s where numero = 7;
    perform public.t_espera('nota em "' || s || '" impede', 'venda_com_nota_ativa', public.t_estornar('N1'));
  end loop;
end $$;
update public.loja_fiscal_documento set status = 'rejeitado' where numero = 7;
insert into public.loja_fiscal_documento (loja_id, modelo, numero, status, pedidos_ids) values (1, 65, 8, 'descartado', '{N1}'), (1, 65, 9, 'cancelado', '{N1}');
select public.t_vale('rejeitada, descartada e cancelada não impedem', (public.app_venda_estornar(public.t_venda('N1'), 'Nota cancelada e venda desfeita') ->> 'ok') = 'true');
select public.t_vale('venda sem cupom e sem caixa informado ainda lança no caixa aberto',
  (select count(*) from public.tab_caixa_mov where tipo = 'estorno' and descricao like 'Estorno PIX · %' and valor = 30 and caixa_id = 1) = 1);
select public.t_espera('nota rejeitada de venda estornada não é refeita', 'venda_estornada_nao_emite_nota', $$update public.loja_fiscal_documento set status = 'reservado' where numero = 7$$);
update public.loja_fiscal_documento set status = 'autorizado' where numero = 7;
select public.t_vale('o retorno da SEFAZ continua podendo ser registrado', (select status from public.loja_fiscal_documento where numero = 7) = 'autorizado');
select public.t_vale('nota já estornada não é oferecida de novo', public.app_venda_da_nota((select id from public.loja_fiscal_documento where numero = 9)) = '[]'::jsonb);

-- ── Caixa: dinheiro pede caixa aberto; PIX não ──
set t.email = 'caixa@l1';
select public.t_pedido('C1', jsonb_build_array(public.t_item(10, 'Burger', 30, 1)));
select public.t_fechar('C1', '[{"forma":"Dinheiro","valor":50},{"forma":"PIX","valor":10}]');
select public.t_pedido('C2', jsonb_build_array(public.t_item(10, 'Burger', 30, 1)));
select public.t_fechar('C2', '[{"forma":"PIX","valor":30}]');
update public.tab_caixas set status = 'fechado' where id = 1;
set t.email = 'gestor@l1';
select public.t_espera('dinheiro sem caixa aberto é recusado', 'abra_o_caixa_para_estornar', public.t_estornar('C1'));
select public.t_vale('PIX estorna com o caixa fechado', (public.app_venda_estornar(public.t_venda('C2'), 'Cobrança feita em duplicidade') ->> 'ok') = 'true');
insert into public.tab_caixas values (2, 1, 'aberto');
select public.app_venda_estornar(public.t_venda('C1'), 'Cobrança feita em duplicidade');
select public.t_vale('troco sai do dinheiro: devolve 20 em dinheiro e 10 em PIX',
  (select jsonb_object_agg(split_part(descricao, ' ', 2), valor) from public.tab_caixa_mov where caixa_id = 2) = '{"Dinheiro": 20.00, "PIX": 10.00}'::jsonb);
set t.email = 'gestor@l3';
select public.t_pedido('S1', jsonb_build_array(public.t_item(30, 'Burger', 30, 1)), 3);
select public.t_fechar('S1', '[{"forma":"Dinheiro","valor":30}]');
select public.t_vale('empresa que não usa caixa estorna dinheiro sem lançamento',
  (public.app_venda_estornar(public.t_venda('S1'), 'Pedido lançado por engano') -> 'resumo' ->> 'caixaId') is null
  and public.t_estoque(30) = 70 and (select count(*) from public.tab_caixa_mov where loja_id = 3) = 0);

-- ── Estoque: devolve só o que foi baixado ──
set t.email = 'caixa@l1';
select public.t_pedido('E1', jsonb_build_array(public.t_item(12, 'Raro', 5, 3), public.t_item(13, 'Passageiro', 5, 2)));
select public.t_fechar('E1', '[{"forma":"PIX","valor":25}]');
select public.t_vale('baixa limitada ao que havia', public.t_estoque(12) = 0 and public.t_estoque(13) = 7);
delete from public.tab_produtos where id = 13;
set t.email = 'gestor@l1';
select public.t_vale('prévia marca o produto que não existe mais',
  exists (select 1 from jsonb_array_elements(public.app_venda_estorno_previa(public.t_venda('E1')) -> 'estoque') e where e ->> 'produtoId' = '13' and e ->> 'existe' = 'false'));
select public.app_venda_estornar(public.t_venda('E1'), 'Produto entregue errado ao cliente');
select public.t_vale('devolve 1 (o que saiu), não 3', public.t_estoque(12) = 1);

-- Venda sem movimento ligado (anterior à 224): estorna sem mexer no estoque.
set t.email = 'caixa@l1';
select public.t_pedido('A1', jsonb_build_array(public.t_item(10, 'Burger', 30, 1)));
select public.t_fechar('A1', '[{"forma":"PIX","valor":30}]');
update public.tab_estoque_mov set pagamento_id = null where pagamento_id = (select pagamento_id from public.tab_venda where id = public.t_venda('A1'));
create table public.t_burger as select public.t_estoque(10) as antes;
set t.email = 'gestor@l1';
select public.t_vale('sem registro de baixa, avisa e não devolve',
  (public.app_venda_estornar(public.t_venda('A1'), 'Venda antiga lançada por engano') -> 'resumo' ->> 'semRegistroDeEstoque') = 'true'
  and public.t_estoque(10) = (select antes from public.t_burger));

-- Ajuste manual continua como antes.
select public.app_estoque_ajustar(10, 99, 'contagem do dia');
select public.t_vale('ajuste segue como ajuste manual', (select tipo = 'ajuste' and origem = 'ajuste_manual' from public.tab_estoque_mov order by id desc limit 1));

-- Pedido que deixou de constar como pago impede.
set t.email = 'caixa@l1';
select public.t_pedido('P1', jsonb_build_array(public.t_item(10, 'Burger', 30, 1)));
select public.t_fechar('P1', '[{"forma":"PIX","valor":30}]');
update public.tab_pedidos set status = 'cancelado' where id = 'P1';
set t.email = 'gestor@l1';
select public.t_espera('pedido já cancelado impede', 'pedido_nao_consta_como_pago', public.t_estornar('P1'));

-- ── Acesso ──
select public.t_vale('tabela do estorno sem acesso direto e com RLS',
  not has_table_privilege('authenticated', 'public.tab_venda_estorno', 'select') and not has_table_privilege('anon', 'public.tab_venda_estorno', 'select')
  and (select relrowsecurity from pg_class where oid = 'public.tab_venda_estorno'::regclass));
select public.t_vale('visitante não executa as funções novas',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
    ('app_venda_estorno_previa', 'app_venda_estornar', 'app_venda_da_nota', 'app_vendas_historico', 'app_venda_detalhe', 'app_venda_caixa_listar', 'app_valores_cobrados')
    and has_function_privilege('anon', p.oid, 'execute')));
select public.t_vale('funções internas não são chamadas pelo app',
  not has_function_privilege('authenticated', 'public.app_pp_estorno_plano(bigint)', 'execute')
  and not has_function_privilege('authenticated', 'public.app_pp_nota_de_venda_estornada()', 'execute'));
