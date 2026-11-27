-- Teste das migrations 222 e 223 (sobre a 218) em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/pontos-222-integration.sql   (a partir da raiz do projeto)
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
create table public.tab_fidelidade_regras (id bigint generated always as identity primary key, loja_id bigint, valor_por_ponto numeric(10,2) not null default 1,
  pontos_por_real numeric(10,2) not null default 100, ativo boolean not null default true);
create table public.tab_fidelidade_recompensas (id bigint generated always as identity primary key, loja_id bigint, nome text not null,
  pontos_necessarios integer not null default 0, ativo boolean not null default true);
create table public.tab_fidelidade_transacoes (id bigint generated always as identity primary key, loja_id bigint, cliente_id bigint, order_id bigint,
  pontos integer not null default 0, tipo text not null default 'earn', descricao text, criado_em timestamptz not null default now());
alter table public.tab_fidelidade_regras enable row level security;
alter table public.tab_fidelidade_recompensas enable row level security;
alter table public.tab_fidelidade_transacoes enable row level security;
create policy isolamento on public.tab_fidelidade_regras for all using (true) with check (true);
create policy isolamento on public.tab_fidelidade_recompensas for all using (true) with check (true);
create policy isolamento on public.tab_fidelidade_transacoes for all using (true) with check (true);
grant select, insert on public.tab_fidelidade_transacoes to authenticated;
grant select, insert, update, delete on public.tab_fidelidade_regras, public.tab_fidelidade_recompensas to authenticated;

create function public.app_caller_email() returns text language sql as $$ select nullif(current_setting('t.email', true), '') $$;
create function public.app_pp_numero(p jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
              when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric end $$;
create function public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text) returns json language sql as $$
  select json_build_object('ok', false, 'motivo', 'Cupom não encontrado.') $$;
create function public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text, p_comandas text[], p_cliente_telefone text, p_canal text)
returns json language sql as $$ select json_build_object('ok', true) $$;
create function public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text default null, p_status text default null)
returns public.tab_pedidos language plpgsql security definer set search_path = public as $$
declare v_row public.tab_pedidos%rowtype;
begin
  update public.tab_pedidos set status_pagamento = 'pago', pagamento_forma = coalesce(p_pagamento_forma, pagamento_forma), status = coalesce(p_status, status)
   where id = p_pedido_id returning * into v_row;
  return v_row;
end $$;

\i supabase/migrations/218_caixa_parametros_e_fechamento.sql
\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql
\i supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2');
insert into public.tab_usuarios values
  (1, 'gestor@l1', true, false, 1, 'Gestor', '{admin,cashier}'), (2, 'caixa@l1', true, false, 1, 'Caixa', '{cashier}'),
  (3, 'gestor@l2', true, false, 2, 'Gestor', '{admin,cashier}'), (4, 'super@x', true, true, null, 'Admin', '{cashier}'),
  (6, 'inativo@l1', false, false, 1, 'Gestor', '{admin,cashier}');
insert into public.tab_formas_pagamento (loja_id, nome, permite_troco) values (1, 'PIX', false), (1, 'Dinheiro', true), (1, 'Pontos', true);
insert into public.tab_clientes (nome, telefone, loja_id) values ('Ana', '11900000000', 1), ('Bia', '11911111111', 1), ('Caio', '11900000000', 2);
insert into public.tab_fidelidade_regras (loja_id, valor_por_ponto, pontos_por_real) values (1, 1, 100);
insert into public.tab_fidelidade_recompensas (loja_id, nome, pontos_necessarios, ativo) values (1, 'Suco', 50, true), (2, 'Outra', 10, true), (1, 'Antiga', 5, false);

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio not like esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
-- Pedido de um item só.
create function public.t_pedido(p_id text, p_valor numeric, p_tel text default '11900000000', p_mesa text default 'Mesa 1', p_loja bigint default 1) returns text language sql as $$
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, cliente_telefone, itens, criado_em)
  values (p_id, p_loja, p_mesa, 'C-' || p_id, p_tel, jsonb_build_array(jsonb_build_object('name', 'A', 'price', p_valor, 'quantity', 1)), clock_timestamp()) returning id $$;
create function public.t_parcelas(variadic v text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('forma', v[i], 'valor', v[i + 1]::numeric)) from generate_series(1, cardinality(v), 2) i $$;
create function public.t_saldo(p_cliente bigint) returns bigint language sql as $$
  select coalesce(sum(pontos), 0)::bigint from public.tab_fidelidade_transacoes where cliente_id = p_cliente $$;

-- ── App publicado antes (não pede pontos ao banco) ──
set t.email = 'caixa@l1';
select public.t_pedido('V1', 100);
select public.t_vale('app antigo: banco não grava pontos', r #>> '{pontos,noServidor}' = 'false' and (select count(*) from public.tab_fidelidade_transacoes) = 0)
  from (select public.app_fechar_conta(array['V1'], public.t_parcelas('PIX', '110')) r) x;

-- ── Ganho sobre o total pago ──
select public.t_pedido('P1', 100);
select public.t_vale('ganho: itens + taxa', r #>> '{pontos,noServidor}' = 'true' and jsonb_array_length(r #> '{pontos,lancamentos}') = 1
    and r #>> '{pontos,lancamentos,0,pontos}' = '110' and r #>> '{pontos,lancamentos,0,descricao}' = 'Compra R$ 110,00'
    and r #>> '{pontos,lancamentos,0,usuario_id}' = '2' and r #>> '{pontos,lancamentos,0,pagamento_id}' = r ->> 'pagamento_id')
  from (select public.app_fechar_conta(array['P1'], public.t_parcelas('PIX', '110'), p_pontos_no_servidor => true) r) x;
select public.t_pedido('P2', 100);
select public.t_vale('ganho: desconto reduz os pontos', r #>> '{pontos,lancamentos,0,pontos}' = '100')
  from (select public.app_fechar_conta(array['P2'], public.t_parcelas('PIX', '100'), p_desconto => 10, p_motivo => 'cliente fiel', p_pontos_no_servidor => true) r) x;
select public.t_vale('saldo da Ana = 210', public.t_saldo(1) = 210);

-- ── Pagamento com pontos só com saldo ──
select public.t_pedido('P3', 100, '11911111111');
select public.t_espera('sem saldo', 'saldo_de_pontos_insuficiente', $c$select public.app_fechar_conta(array['P3'], public.t_parcelas('Pontos', '1', 'PIX', '109'), p_pontos_no_servidor => true)$c$);
select public.t_espera('sem saldo, app antigo também é recusado', 'saldo_de_pontos_insuficiente', $c$select public.app_fechar_conta(array['P3'], public.t_parcelas('Pontos', '1', 'PIX', '109'))$c$);
select public.t_pedido('P4', 100);
select public.t_espera('um centavo acima do saldo', 'saldo_de_pontos_insuficiente', $c$select public.app_fechar_conta(array['P4'], public.t_parcelas('Pontos', '2.11', 'PIX', '107.89'), p_pontos_no_servidor => true)$c$);
select public.t_pedido('P5', 100, null);
select public.t_espera('conta sem cliente', 'pontos_sem_cliente', $c$select public.app_fechar_conta(array['P5'], public.t_parcelas('Pontos', '1', 'PIX', '109'))$c$);
select public.t_pedido('P6', 100, '11999999999');
select public.t_espera('telefone sem cadastro', 'pontos_sem_cliente', $c$select public.app_fechar_conta(array['P6'], public.t_parcelas('Pontos', '1', 'PIX', '109'))$c$);
set t.email = 'super@x';
select public.t_pedido('L2', 100, '11900000000', 'Mesa 1', 2);
select public.t_espera('empresa sem programa', 'pontos_indisponiveis', $c$select public.app_fechar_conta(array['L2'], public.t_parcelas('Pontos', '1', 'PIX', '109'))$c$);
select public.t_vale('empresa sem programa não ganha pontos', jsonb_array_length(r #> '{pontos,lancamentos}') = 0)
  from (select public.app_fechar_conta(array['L2'], public.t_parcelas('PIX', '110'), p_pontos_no_servidor => true) r) x;
set t.email = 'caixa@l1';
update public.tab_fidelidade_regras set ativo = false where loja_id = 1;
select public.t_espera('programa desligado', 'pontos_indisponiveis', $c$select public.app_fechar_conta(array['P4'], public.t_parcelas('Pontos', '1', 'PIX', '109'))$c$);
update public.tab_fidelidade_regras set ativo = true where loja_id = 1;
select public.t_vale('recusas não pagaram nada', (select count(*) from public.tab_pedidos where id in ('P3','P4','P5','P6') and status_pagamento = 'pago') = 0
  and public.t_saldo(1) = 210);
select public.t_espera('falha depois dos pontos desfaz tudo', 'caixa_invalido',
  $c$select public.app_fechar_conta(array['P4'], public.t_parcelas('Pontos', '2.10', 'PIX', '107.90'), p_caixa_id => 99, p_pontos_no_servidor => true)$c$);
select public.t_vale('saldo intacto após a falha', public.t_saldo(1) = 210);
select public.t_vale('resgate e ganho na mesma venda', jsonb_array_length(r #> '{pontos,lancamentos}') = 2
    and r #>> '{pontos,lancamentos,0,pontos}' = '-210' and r #>> '{pontos,lancamentos,0,descricao}' = 'Pagamento com pontos R$ 2,10'
    and r #>> '{pontos,lancamentos,1,pontos}' = '107' and r #>> '{pontos,lancamentos,1,descricao}' = 'Compra R$ 107,90')
  from (select public.app_fechar_conta(array['P4'], public.t_parcelas('Pontos', '2.10', 'PIX', '107.90'), p_pontos_no_servidor => true) r) x;
select public.t_vale('saldo = 107', public.t_saldo(1) = 107);
select public.t_espera('repetir a venda não repete pontos', 'pedido_ja_pago', $c$select public.app_fechar_conta(array['P4'], public.t_parcelas('PIX', '110'), p_pontos_no_servidor => true)$c$);

-- ── Pontos nunca viram troco ──
insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo) values (1, 1, 100000, 'adjust');
select public.t_pedido('P7', 100);
select public.t_espera('pontos acima do total', 'troco_acima_do_permitido', $c$select public.app_fechar_conta(array['P7'], public.t_parcelas('Pontos', '120'), p_pontos_no_servidor => true)$c$);
select public.t_vale('conta toda em pontos não gera pontos', jsonb_array_length(r #> '{pontos,lancamentos}') = 1 and r #>> '{pontos,lancamentos,0,pontos}' = '-11000')
  from (select public.app_fechar_conta(array['P7'], public.t_parcelas('Pontos', '110'), p_pontos_no_servidor => true) r) x;

-- ── Vários pedidos e clientes: repartição igual à da tela ──
select public.t_pedido('R1', 10.01);
select public.t_pedido('R2', 20, '11911111111', 'Externo · Retirada');
select public.t_vale('reparte o total por pedido', (r ->> 'total')::numeric = 32.01
    and r #>> '{pontos,lancamentos,0,descricao}' = 'Compra R$ 20,64' and r #>> '{pontos,lancamentos,0,pontos}' = '20'
    and r #>> '{pontos,lancamentos,1,descricao}' = 'Compra R$ 11,37' and r #>> '{pontos,lancamentos,1,pontos}' = '11')
  from (select public.app_fechar_conta(array['R1','R2'], public.t_parcelas('PIX', '32.01'), p_acrescimo => 1, p_motivo => 'embalagem', p_pontos_no_servidor => true) r) x;
select public.t_pedido('S1', 10, '(11) 90000-0000');
select public.t_pedido('S2', 10, '11900000000');
select public.t_pedido('S3', 10, null);
select public.t_vale('mesmo cliente soma; pedido sem cliente ocupa a sua parte', jsonb_array_length(r #> '{pontos,lancamentos}') = 1
    and r #>> '{pontos,lancamentos,0,cliente_id}' = '1' and r #>> '{pontos,lancamentos,0,descricao}' = 'Compra R$ 22,00')
  from (select public.app_fechar_conta(array['S1','S2','S3'], public.t_parcelas('PIX', '33'), p_pontos_no_servidor => true) r) x;
select public.t_pedido('M1', 1500);
select public.t_vale('milhar na descrição', r #>> '{pontos,lancamentos,0,descricao}' = 'Compra R$ 1.650,00')
  from (select public.app_fechar_conta(array['M1'], public.t_parcelas('PIX', '1650'), p_pontos_no_servidor => true) r) x;

-- ── Lançamento manual ──
set t.email = 'caixa@l1';
select public.t_espera('caixa não lança', 'forbidden', $c$select public.app_pontos_lancar(2, 10, 'adjust')$c$);
set t.email = 'gestor@l2';
select public.t_espera('gestor de outra empresa não lança', 'forbidden', $c$select public.app_pontos_lancar(2, 10, 'adjust')$c$);
set t.email = 'inativo@l1';
select public.t_espera('inativo não lança', 'forbidden', $c$select public.app_pontos_lancar(2, 10, 'adjust')$c$);
set t.email = '';
select public.t_espera('sem login não lança', 'not_authenticated', $c$select public.app_pontos_lancar(2, 10, 'adjust')$c$);
set t.email = 'gestor@l1';
select public.t_vale('gestor ajusta', r ->> 'pontos' = '60' and r ->> 'loja_id' = '1' and r ->> 'usuario_id' = '1' and r ->> 'descricao' = 'Ajuste manual')
  from (select public.app_pontos_lancar(2, 60, 'adjust', 'Ajuste manual') r) x;
select public.t_espera('não existe ganho manual', 'parametro_invalido', $c$select public.app_pontos_lancar(2, 10, 'earn')$c$);
select public.t_espera('resgate positivo', 'parametro_invalido', $c$select public.app_pontos_lancar(2, 10, 'redeem')$c$);
select public.t_espera('zero', 'parametro_invalido', $c$select public.app_pontos_lancar(2, 0, 'adjust')$c$);
select public.t_espera('quantidade absurda', 'parametro_invalido', $c$select public.app_pontos_lancar(2, 2000000, 'adjust')$c$);
select public.t_espera('resgate acima do saldo', 'saldo_de_pontos_insuficiente', $c$select public.app_pontos_lancar(2, -999, 'redeem')$c$);
select public.t_espera('ajuste negativo acima do saldo', 'saldo_de_pontos_insuficiente', $c$select public.app_pontos_lancar(2, -999, 'adjust')$c$);
select public.t_vale('recompensa vale o cadastro, não o navegador', r ->> 'pontos' = '-50' and r ->> 'descricao' = 'Resgate: Suco')
  from (select public.app_pontos_lancar(2, -1, 'redeem', 'x', 1) r) x;
select public.t_espera('recompensa sem saldo', 'saldo_de_pontos_insuficiente', $c$select public.app_pontos_lancar(2, -1, 'redeem', 'x', 1)$c$);
select public.t_espera('recompensa de outra empresa', 'recompensa_indisponivel', $c$select public.app_pontos_lancar(2, -1, 'redeem', 'x', 2)$c$);
select public.t_espera('recompensa inativa', 'recompensa_indisponivel', $c$select public.app_pontos_lancar(2, -1, 'redeem', 'x', 3)$c$);
select public.t_espera('recompensa como ajuste', 'recompensa_indisponivel', $c$select public.app_pontos_lancar(2, -1, 'adjust', 'x', 1)$c$);
select public.t_espera('cliente inexistente', 'cliente_nao_encontrado', $c$select public.app_pontos_lancar(999, 10, 'adjust')$c$);
set t.email = 'super@x';
select public.t_vale('administrador geral lança na empresa do cliente', r ->> 'loja_id' = '2') from (select public.app_pontos_lancar(3, 5, 'adjust') r) x;
set t.email = 'caixa@l1';
select public.t_pedido('T1', 10);
select public.t_pedido('T2', 10, '11911111111');
select public.t_vale('dois clientes na conta: os pontos saem do pedido mais recente, como na tela',
    r #>> '{pontos,lancamentos,0,tipo}' = 'redeem' and r #>> '{pontos,lancamentos,0,cliente_id}' = '2' and r #>> '{pontos,lancamentos,0,pontos}' = '-9')
  from (select public.app_fechar_conta(array['T1','T2'], public.t_parcelas('Pontos', '0.09', 'PIX', '21.91'), p_pontos_no_servidor => true) r) x;
set role anon;
select public.t_espera('visitante sem execução', 'permission denied%', $c$select public.app_pontos_lancar(2, 10, 'adjust')$c$);
reset role;
set role authenticated;
select public.t_espera('funções internas fechadas', 'permission denied%', $c$select public.app_pp_saldo_pontos(1, 1)$c$);
reset role;

-- ── 223: o navegador deixa de gravar ──
\i supabase/migrations/223_pontos_fecha_gravacao_do_navegador.sql
\i supabase/migrations/223_pontos_fecha_gravacao_do_navegador.sql
set role authenticated;
set t.email = 'gestor@l1';
select public.t_espera('navegador não insere pontos', 'permission denied%', $c$insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos) values (1, 1, 5)$c$);
select public.t_vale('navegador ainda lê', (select count(*) from public.tab_fidelidade_transacoes) > 0);
select public.t_vale('gestor lança pela função', (public.app_pontos_lancar(2, 1, 'adjust') ->> 'pontos') = '1');
select public.t_espera('gestor salva recompensa', 'ok', $c$insert into public.tab_fidelidade_recompensas (loja_id, nome, pontos_necessarios) values (1, 'Nova', 10)$c$);
select public.t_espera('gestor não cria na outra empresa', '%row-level security%', $c$insert into public.tab_fidelidade_recompensas (loja_id, nome) values (2, 'X')$c$);
update public.tab_fidelidade_regras set pontos_por_real = 90 where loja_id = 1;
select public.t_vale('gestor altera a regra', (select pontos_por_real from public.tab_fidelidade_regras where loja_id = 1) = 90);
set t.email = 'caixa@l1';
update public.tab_fidelidade_regras set pontos_por_real = 1 where loja_id = 1;
delete from public.tab_fidelidade_recompensas where loja_id = 1;
select public.t_vale('caixa não altera regra nem exclui recompensa', (select pontos_por_real from public.tab_fidelidade_regras where loja_id = 1) = 90
  and (select count(*) from public.tab_fidelidade_recompensas where loja_id = 1) = 3);
select public.t_espera('caixa não cria regra', '%row-level security%', $c$insert into public.tab_fidelidade_regras (loja_id) values (1)$c$);
reset role;
select public.t_pedido('F1', 100);
set role authenticated;
select public.t_vale('depois da 223, app antigo continua e o banco grava', r #>> '{pontos,noServidor}' = 'true' and r #>> '{pontos,lancamentos,0,pontos}' = '110')
  from (select public.app_fechar_conta(array['F1'], public.t_parcelas('PIX', '110')) r) x;
reset role;
select 'TODOS OS CASOS PASSARAM' as resultado;
