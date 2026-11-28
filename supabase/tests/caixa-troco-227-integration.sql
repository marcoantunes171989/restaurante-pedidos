-- Teste da migration 227 (sobre 208, 218, 221, 222, 224, 225 e 226) em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/caixa-troco-227-integration.sql   (a partir da raiz do projeto)
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
create table public.tab_caixas (id bigint primary key, loja_id bigint, status text, aberto_em timestamptz not null default now(), fechado_em timestamptz,
  valor_esperado numeric(10,2), valor_fechamento numeric(10,2), diferenca numeric(10,2));
create table public.tab_caixa_mov (id bigint generated always as identity primary key, loja_id bigint, caixa_id bigint, tipo text, valor numeric(10,2), descricao text, usuario_id bigint, criado_em timestamptz not null default now());
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

-- Sem a 222 a migration para no precheck e não cria nada.
\echo '(os erros até a linha "sem a 222 nada é criado" são esperados)'
\set ON_ERROR_STOP off
\i supabase/migrations/227_caixa_venda_sem_o_troco.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin
  if to_regprocedure('public.app_pp_parcelas_no_caixa(bigint, jsonb, numeric)') is not null then raise exception 'FALHOU precheck sem a 222'; end if;
  raise notice 'ok - sem a 222 nada é criado';
end $$;

\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql
\i supabase/migrations/224_estoque_baixado_pelo_servidor.sql
\i supabase/migrations/225_historico_de_vendas_e_de_estoque.sql
\i supabase/migrations/226_estorno_de_venda.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2');
insert into public.tab_usuarios values
  (1, 'Gestora', 'gestor@l1', true, false, 1, 'Gestor', '{admin,cashier}'), (2, 'Caixa Um', 'caixa@l1', true, false, 1, 'Caixa', '{cashier}');
-- "PIX" da loja 2 permite troco: não vale para a loja 1.
insert into public.tab_formas_pagamento (loja_id, nome, permite_troco) values (1, 'PIX', false), (1, 'Vale', true), (2, 'PIX', true);
insert into public.tab_produtos (id, loja_id, nome, categoria, preco, custo, estoque) values (10, 1, 'Burger', 'Lanches', 30, 12, 500);
insert into public.tab_clientes (nome, telefone, loja_id) values ('Ana', '11900000000', 1);
insert into public.tab_fidelidade_regras (loja_id) values (1);
insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao) values (1, 1, 5000, 'adjust', 'Saldo inicial');
insert into public.tab_caixas (id, loja_id, status) values (1, 1, 'aberto');

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio not like esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
-- Fecha uma conta de um item no valor pedido (retirada: sem taxa de serviço). A mesa leva o id do pedido.
create function public.t_vender(p_id text, p_valor numeric, p_parcelas jsonb, p_caixa bigint) returns jsonb language plpgsql as $$
begin
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, cliente, cliente_telefone, itens)
  values (p_id, 1, 'Externo · Retirada ' || p_id, 'C-' || p_id, 'Ana', '11900000000',
          jsonb_build_array(jsonb_build_object('productId', 10, 'name', 'Burger', 'price', p_valor, 'quantity', 1)));
  return public.app_fechar_conta(array[p_id], p_parcelas, p_caixa_id => p_caixa, p_pontos_no_servidor => true);
end $$;
-- Lançamentos de uma venda no caixa, na ordem gravada: "Dinheiro=20.00 PIX=10.00".
create function public.t_mov(p_id text) returns text language sql as $$
  select coalesce(string_agg(split_part(descricao, ' ', 2) || '=' || valor, ' ' order by id), '') from public.tab_caixa_mov
   where tipo = 'venda' and descricao like '% ' || p_id $$;
-- A mesma conta da tela (sem abertura): dinheiro vendido − dinheiro estornado.
create function public.t_dinheiro(p_caixa bigint) returns numeric language sql as $$
  select coalesce(sum(case when tipo = 'estorno' then -valor else valor end), 0)
    from public.tab_caixa_mov where caixa_id = p_caixa and descricao ilike '% dinheiro %' $$;

set t.email = 'caixa@l1';

-- ── Antes da 227: o troco entra no caixa (o problema) ──
select public.t_vender('ANTES', 60, '[{"forma":"Dinheiro","valor":100}]', 1);
select public.t_vale('antes da 227 o caixa recebe o valor entregue', public.t_mov('ANTES') = 'Dinheiro=100.00' and public.t_dinheiro(1) = 100);
create table public.t_antigos as select to_jsonb(m) as linha from public.tab_caixa_mov m;

\i supabase/migrations/227_caixa_venda_sem_o_troco.sql
\i supabase/migrations/227_caixa_venda_sem_o_troco.sql

select public.t_vale('movimentos já gravados não mudam',
  (select count(*) from public.tab_caixa_mov) = 1 and not exists (select to_jsonb(m) from public.tab_caixa_mov m except select linha from public.t_antigos));
select public.t_vale('uma só versão do fechamento, sem acesso do visitante',
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'app_fechar_conta') = 1
  and has_function_privilege('authenticated', 'public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint, boolean)', 'execute'));
select public.t_vale('conta interna fechada ao navegador e ao visitante',
  not has_function_privilege('authenticated', 'public.app_pp_parcelas_no_caixa(bigint, jsonb, numeric)', 'execute')
  and not has_function_privilege('anon', 'public.app_pp_parcelas_no_caixa(bigint, jsonb, numeric)', 'execute'));

-- ── Depois da 227 ──
-- Venda do caminho antigo do navegador: pagamento sem empresa nem composição e lançamentos gravados logo depois.
insert into public.tab_pagamentos (mesa, total, troco, detalhes) values ('Mesa 7', 22, 8, '[{"forma":"Dinheiro","valor":30}]');
insert into public.tab_caixa_mov (loja_id, caixa_id, tipo, valor, descricao, criado_em) values (1, 1, 'venda', 30, 'Venda Dinheiro · Mesa 7', now() + interval '2 seconds');
-- Troco sem lançamento da mesma mesa por perto: não é apontado.
insert into public.tab_pagamentos (mesa, total, troco, detalhes) values ('Mesa 8', 22, 8, '[{"forma":"Dinheiro","valor":30}]');
update public.tab_caixas set status = 'fechado', fechado_em = now(), valor_esperado = 130, valor_fechamento = 82, diferenca = -48 where id = 1;
insert into public.tab_caixas (id, loja_id, status) values (2, 1, 'aberto');

select public.t_vale('o retorno continua informando o troco', (public.t_vender('S1', 60, '[{"forma":"Dinheiro","valor":100}]', 2) ->> 'troco')::numeric = 40);
select public.t_vale('dinheiro com troco: entra o total', public.t_mov('S1') = 'Dinheiro=60.00');
select public.t_vender('S2', 30, '[{"forma":"Dinheiro","valor":50},{"forma":"PIX","valor":10}]', 2);
select public.t_vale('duas formas: o troco sai do dinheiro', public.t_mov('S2') = 'Dinheiro=20.00 PIX=10.00');
select public.t_vender('S3', 30, '[{"forma":"PIX","valor":10},{"forma":"Dinheiro","valor":50}]', 2);
select public.t_vale('a ordem do recebimento não muda a conta', public.t_mov('S3') = 'PIX=10.00 Dinheiro=20.00');
select public.t_vender('S4', 30, '[{"forma":"Dinheiro","valor":20},{"forma":"Dinheiro","valor":50},{"forma":"PIX","valor":10}]', 2);
select public.t_vale('parcela toda devolvida em troco não gera lançamento', public.t_mov('S4') = 'Dinheiro=20.00 PIX=10.00');
select public.t_vender('S5', 60, '[{"forma":"Dinheiro","valor":10},{"forma":"Vale","valor":100}]', 2);
select public.t_vale('troco maior que o dinheiro: o resto sai da forma que permite troco', public.t_mov('S5') = 'Vale=60.00');
select public.t_vender('S6', 60, '[{"forma":"Pontos","valor":5},{"forma":"Dinheiro","valor":100}]', 2);
select public.t_vale('pontos não dão troco', public.t_mov('S6') = 'Pontos=5.00 Dinheiro=55.00');
select public.t_vender('S7', 33.33, '[{"forma":"Dinheiro","valor":50}]', 2);
select public.t_vale('centavos', public.t_mov('S7') = 'Dinheiro=33.33');
select public.t_vender('S8', 40, '[{"forma":"Dinheiro","valor":15},{"forma":"Dinheiro","valor":15},{"forma":"PIX","valor":10}]', 2);
select public.t_vale('sem troco: um lançamento por parcela, com o valor dela', public.t_mov('S8') = 'Dinheiro=15.00 Dinheiro=15.00 PIX=10.00');
select public.t_vender('S9', 25, '[{"forma":"Dinheiro","valor":"30.00"}]', 2);
select public.t_vale('valor enviado como texto', public.t_mov('S9') = 'Dinheiro=25.00');

select public.t_vale('em cada venda o caixa soma exatamente o total cobrado',
  (select count(*) = 9 and bool_and(p.total = (select sum(m.valor) from public.tab_caixa_mov m where m.tipo = 'venda' and m.criado_em = p.criado_em))
     from public.tab_pagamentos p where p.mesa ~ ' S[0-9]$'));
select public.t_vale('o pagamento continua com o valor entregue e o troco',
  (select troco = 40 and total = 60 and detalhes = '[{"forma":"Dinheiro","valor":100}]'::jsonb from public.tab_pagamentos where mesa like '% S1'));
select public.t_vale('esperado em dinheiro igual ao que ficou na gaveta', public.t_dinheiro(2) = 60 + 20 + 20 + 20 + 55 + 33.33 + 30 + 25);
select public.t_vale('histórico da venda continua com o troco', (select troco = 40 and total = 60 from public.tab_venda where pedidos_ids = '{S1}'));

select public.t_espera('troco sem dinheiro continua recusado (permissão de outra loja não vale)', 'troco_acima_do_permitido',
  $$select public.t_vender('R1', 30, '[{"forma":"PIX","valor":50}]', 2)$$);
select public.t_espera('caixa fechado continua recusado', 'caixa_invalido', $$select public.t_vender('R2', 30, '[{"forma":"Dinheiro","valor":50}]', 1)$$);
select public.t_vender('SEM', 30, '[{"forma":"Dinheiro","valor":50}]', null);
select public.t_vale('sem caixa informado e venda recusada não lançam nada', public.t_mov('SEM') = '' and public.t_mov('R1') = '' and public.t_mov('R2') = '');

-- ── Venda e estorno (226) fazem a mesma conta ──
set t.email = 'gestor@l1';
select public.t_vale('a prévia do estorno devolve, por forma, o mesmo que a venda lançou',
  (select count(*) = 9 and bool_and(
       (select jsonb_object_agg(e ->> 'forma', (e ->> 'valor')::numeric) from jsonb_array_elements(public.app_venda_estorno_previa(v.id) -> 'caixa') e)
     = (select jsonb_object_agg(t.forma, t.valor) from (
          select split_part(m.descricao, ' ', 2) as forma, sum(m.valor) as valor from public.tab_caixa_mov m
           where m.tipo = 'venda' and m.criado_em = p.criado_em group by 1) t))
     from public.tab_venda v join public.tab_pagamentos p on p.id = v.pagamento_id where v.mesa ~ ' S[0-9]$'));
do $$ declare r record; begin
  for r in select v.id from public.tab_venda v where v.mesa ~ ' S[0-9]$' order by v.id loop
    perform public.app_venda_estornar(r.id, 'Cliente desistiu da compra no balcão');
  end loop;
end $$;
select public.t_vale('estornadas todas as vendas, o caixa zera em cada forma',
  (select count(*) > 0 from public.tab_caixa_mov where tipo = 'estorno')
  and not exists (select 1 from public.tab_caixa_mov where caixa_id = 2
                   group by split_part(descricao, ' ', 2) having sum(case when tipo = 'estorno' then -valor else valor end) <> 0));

-- ── Consulta dos caixas antigos (somente leitura) ──
-- Primeiro como o dono vai rodar, com a sessão em somente leitura; depois o resultado é guardado para conferir.
set default_transaction_read_only = on;
\i supabase/diagnostics/caixa-troco-movimentos-antigos.sql
set default_transaction_read_only = off;
\set consulta `node -e "process.stdout.write(require('fs').readFileSync('supabase/diagnostics/caixa-troco-movimentos-antigos.sql','utf8'))"`
create table public.t_diagnostico as :consulta
select public.t_vale('a consulta aponta só o caixa com venda antiga, com o recálculo',
  (select count(*) = 1 and bool_and(caixa_id = 1 and vendas_com_troco = 2 and dinheiro_a_mais = 48 and esperado_gravado = 130
          and esperado_sem_o_troco = 82 and contado = 82 and diferenca_gravada = -48 and diferenca_sem_o_troco = 0) from public.t_diagnostico));

do $$ begin raise notice 'FIM - migration 227 conferida'; end $$;
