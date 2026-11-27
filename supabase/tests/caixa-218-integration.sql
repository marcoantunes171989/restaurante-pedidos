-- Teste das migrations 218, 219 e 220 em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/caixa-218-integration.sql   (a partir da raiz do projeto)
do $$ begin
  if to_regclass('public.tab_pedidos') is not null then raise exception 'Este teste é só para um banco local vazio. Nada foi feito.'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table public.tab_lojas (id bigint primary key, nome text);
create table public.tab_usuarios (id bigint primary key, email text, ativo boolean, super_admin boolean, loja_id bigint, perfil text, ids_acesso text[]);
create table public.tab_pedidos (id text primary key, loja_id bigint, mesa text, comanda text, cliente_telefone text, itens jsonb default '[]',
  status text default 'finalizado', status_pagamento text default 'aberto', pagamento_forma text, criado_em timestamptz default now());
create table public.tab_formas_pagamento (id bigint generated always as identity primary key, loja_id bigint, nome text, permite_troco boolean default false);
create table public.tab_pagamentos (id bigint generated always as identity primary key, mesa text, comandas text[] default '{}', total numeric(10,2),
  troco numeric(10,2), detalhes jsonb, loja_id bigint, criado_em timestamptz default now());
create table public.tab_caixas (id bigint primary key, loja_id bigint, status text);
create table public.tab_caixa_mov (id bigint generated always as identity primary key, loja_id bigint, caixa_id bigint, tipo text, valor numeric(10,2), descricao text, usuario_id bigint);
create table public.t_cupom (usos integer);
insert into public.t_cupom values (0);
grant insert, select on public.tab_pagamentos to authenticated;
create function public.app_caller_email() returns text language sql as $$ select nullif(current_setting('t.email', true), '') $$;
create function public.app_pp_numero(p jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
              when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p #>> '{}')::numeric end $$;
-- Cupom de teste: "DEZ" vale R$ 10,00; "TUDO" vale a conta inteira.
create function public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text) returns json language sql as $$
  select case when upper(p_codigo) = 'DEZ' then json_build_object('ok', true, 'id', 1, 'desconto', least(10, p_valor_conta))
              when upper(p_codigo) = 'TUDO' then json_build_object('ok', true, 'id', 2, 'desconto', p_valor_conta)
              else json_build_object('ok', false, 'motivo', 'Cupom não encontrado.') end $$;
create function public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text, p_comandas text[], p_cliente_telefone text, p_canal text)
returns json language plpgsql as $$ begin update public.t_cupom set usos = usos + 1; return json_build_object('ok', true); end $$;
-- Função real de pagamento, com as travas de pedido.
create function public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text default null, p_status text default null)
returns public.tab_pedidos language plpgsql security definer set search_path = public as $$
declare v_row public.tab_pedidos%rowtype;
begin
  if (select status from public.tab_pedidos where id = p_pedido_id) = 'cancelado' then raise exception 'pedido_cancelado_nao_pode_ser_pago'; end if;
  update public.tab_pedidos set status_pagamento = 'pago', pagamento_forma = coalesce(p_pagamento_forma, pagamento_forma), status = coalesce(p_status, status)
   where id = p_pedido_id returning * into v_row;
  return v_row;
end $$;
grant execute on function public.app_pedido_marcar_pago(text, text, text) to authenticated;

\i supabase/migrations/218_caixa_parametros_e_fechamento.sql
\i supabase/migrations/218_caixa_parametros_e_fechamento.sql

insert into public.tab_lojas (id, nome) values (1, 'Loja 1'), (2, 'Loja 2');
insert into public.tab_usuarios values
  (1, 'gestor@l1', true, false, 1, 'Gestor', '{admin,cashier}'), (2, 'caixa@l1', true, false, 1, 'Caixa', '{cashier}'),
  (3, 'gestor@l2', true, false, 2, 'Gestor', '{admin,cashier}'), (4, 'super@x', true, true, null, 'Admin', '{}'),
  (5, 'cozinha@l1', true, false, 1, 'Cozinha', '{kitchen}'), (6, 'inativo@l1', false, false, 1, 'Gestor', '{admin,cashier}');
insert into public.tab_formas_pagamento (loja_id, nome, permite_troco) values (1, 'PIX', false), (1, 'Dinheiro', true), (1, 'Vale da casa', true);
insert into public.tab_caixas values (10, 1, 'aberto'), (11, 1, 'fechado'), (20, 2, 'aberto');

create function public.t_espera(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v_veio text := 'ok';
begin
  begin execute comando; exception when others then v_veio := sqlerrm; end;
  if v_veio <> esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v_veio; end if;
  raise notice 'ok - %', rotulo;
end $$;
create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
-- Conta nova da loja 1: R$ 100,00 em itens na mesa (taxa de 10%).
create function public.t_conta(p_id text, p_mesa text default 'Mesa 1', p_loja bigint default 1) returns text language sql as $$
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, itens) values
    (p_id, p_loja, p_mesa, 'C-' || p_id, '[{"name":"A","price":40,"quantity":2},{"name":"B","price":"20.00","quantity":"1"}]') returning p_id $$;
create function public.t_pagar(rotulo text, esperado text, p_id text, valor numeric, extra text default '', forma text default 'PIX') returns void language sql as $$
  select public.t_espera(rotulo, esperado, format('select public.app_fechar_conta(array[%L], %L::jsonb %s)',
    p_id, jsonb_build_array(jsonb_build_object('forma', forma, 'valor', valor)), extra)) $$;

-- ── Parâmetros ──
set t.email = 'caixa@l1';
select public.t_vale('padrão sem definição: taxa 10 e sem limite próprio',
  (public.app_parametros_caixa(1) #>> '{taxaServico,percent}')::numeric = 10 and public.app_parametros_caixa(1) #>> '{desconto,percentualMax}' is null
  and public.app_parametros_caixa(1) ->> 'definido' = 'false');
select public.t_espera('caixa não altera parâmetros', 'forbidden', $c$select public.app_salvar_parametros_caixa(1, '{}')$c$);
select public.t_espera('outra empresa não lê', 'forbidden', $c$select public.app_parametros_caixa(2)$c$);
set t.email = 'gestor@l2';
select public.t_espera('gestor de outra empresa não altera', 'forbidden', $c$select public.app_salvar_parametros_caixa(1, '{}')$c$);
set t.email = 'inativo@l1';
select public.t_espera('inativo não altera', 'forbidden', $c$select public.app_salvar_parametros_caixa(1, '{}')$c$);
set t.email = 'gestor@l1';
select public.t_espera('percentual de 100% recusado', 'parametro_invalido', $c$select public.app_salvar_parametros_caixa(1, '{"desconto":{"percentualMax":100}}')$c$);
select public.t_espera('percentual negativo recusado', 'parametro_invalido', $c$select public.app_salvar_parametros_caixa(1, '{"acrescimo":{"percentualMax":-1}}')$c$);
select public.t_espera('valor negativo recusado', 'parametro_invalido', $c$select public.app_salvar_parametros_caixa(1, '{"desconto":{"valorMax":-5}}')$c$);
select public.t_espera('texto no lugar de número recusado', 'parametro_invalido', $c$select public.app_salvar_parametros_caixa(1, '{"desconto":{"valorMax":"abc"}}')$c$);
select public.t_espera('regra de taxa desconhecida recusada', 'parametro_invalido', $c$select public.app_salvar_parametros_caixa(1, '{"taxaServico":{"chargingRule":"x"}}')$c$);
select public.t_espera('gestor salva: desconto 10% ou R$ 15, acréscimo R$ 5', 'ok',
  $c$select public.app_salvar_parametros_caixa(1, '{"desconto":{"percentualMax":10,"valorMax":15},"acrescimo":{"valorMax":5}}')$c$);
select public.t_vale('limite: vale o menor (10% de R$ 100)', public.app_pp_limite_centavos(public.app_parametros_caixa(1) -> 'desconto', 10000) = 1000);
select public.t_vale('limite: vale o menor (R$ 15 em compra de R$ 200)', public.app_pp_limite_centavos(public.app_parametros_caixa(1) -> 'desconto', 20000) = 1500);
select public.t_vale('teto do sistema: 99,99% sem limite próprio', public.app_pp_limite_centavos('{}', 10000) = 9999);
select public.t_vale('teto do sistema vale para valor alto', public.app_pp_limite_centavos('{"valorMax":500}', 10000) = 9999);

-- ── Fechamento: R$ 100 + 10% = R$ 110 ──
set t.email = 'caixa@l1';
select public.t_conta('P1');
select public.t_pagar('valor abaixo do total', 'valor_recebido_insuficiente', 'P1', 109.99);
select public.t_pagar('desconto acima do limite', 'desconto_acima_do_limite', 'P1', 99.99, ', p_desconto => 10.01, p_motivo => ''cliente fiel''');
select public.t_pagar('acréscimo acima do limite', 'acrescimo_acima_do_limite', 'P1', 120, ', p_acrescimo => 5.01, p_motivo => ''embalagem''');
select public.t_pagar('desconto sem motivo', 'motivo_do_ajuste_obrigatorio', 'P1', 100, ', p_desconto => 10');
select public.t_pagar('desconto negativo', 'parametro_invalido', 'P1', 200, ', p_desconto => -1, p_motivo => ''abc''');
select public.t_pagar('troco em PIX não existe', 'troco_acima_do_permitido', 'P1', 120);
select public.t_pagar('cupom inexistente', 'cupom_recusado', 'P1', 110, ', p_cupom_codigo => ''NAO''');
select public.t_pagar('cupom que zeraria a venda', 'venda_nao_pode_zerar', 'P1', 1, ', p_cupom_codigo => ''TUDO''');
select public.t_pagar('parcela zero', 'parcela_invalida', 'P1', 0);
select public.t_pagar('caixa fechado', 'caixa_invalido', 'P1', 110, ', p_caixa_id => 11');
select public.t_pagar('caixa de outra empresa', 'caixa_invalido', 'P1', 110, ', p_caixa_id => 20');
select public.t_vale('nada ficou gravado nas recusas', (select status_pagamento from public.tab_pedidos where id = 'P1') = 'aberto'
  and not exists (select 1 from public.tab_pagamentos) and not exists (select 1 from public.tab_caixa_mov) and (select usos from public.t_cupom) = 0);
select public.t_pagar('fecha com desconto no limite e cupom, dinheiro com troco', 'ok', 'P1', 100,
  ', p_desconto => 10, p_motivo => ''cliente fiel'', p_cupom_codigo => ''DEZ'', p_caixa_id => 10', 'Dinheiro');
select public.t_vale('gravou pedido, pagamento, caixa e cupom', (select status_pagamento = 'pago' and status = 'entregue' and pagamento_forma = 'Dinheiro' from public.tab_pedidos where id = 'P1')
  and (select total = 90 and troco = 10 and loja_id = 1 and usuario_id = 2 and (composicao ->> 'taxaServico')::numeric = 10 and (composicao ->> 'descontoCupom')::numeric = 10 from public.tab_pagamentos)
  and (select count(*) = 1 and sum(valor) = 100 from public.tab_caixa_mov) and (select usos from public.t_cupom) = 1);
select public.t_pagar('não paga duas vezes', 'pedido_ja_pago', 'P1', 110);

select public.t_conta('P2');
select public.t_pagar('acréscimo no limite, sem taxa', 'ok', 'P2', 105, ', p_acrescimo => 5, p_motivo => ''embalagem'', p_taxa_removida => true, p_manter_status => true');
select public.t_vale('manter status e taxa removida registrada', (select status from public.tab_pedidos where id = 'P2') = 'finalizado'
  and exists (select 1 from public.tab_pagamentos where total = 105 and composicao ->> 'taxaRemovida' = 'true'));
select public.t_conta('P3', 'Externo · Retirada');
select public.t_pagar('retirada não tem taxa', 'ok', 'P3', 100);
select public.t_conta('P4');
select public.t_espera('duas parcelas de formas diferentes', 'ok',
  $c$select public.app_fechar_conta(array['P4'], '[{"forma":"PIX","valor":60},{"forma":"Vale da casa","valor":60}]')$c$);
select public.t_vale('forma composta e troco da forma permitida', (select pagamento_forma from public.tab_pedidos where id = 'P4') = 'PIX + Vale da casa'
  and exists (select 1 from public.tab_pagamentos where total = 110 and troco = 10));

select public.t_conta('P5'); select public.t_conta('L2', 'Mesa 1', 2);
select public.t_espera('pedidos de empresas diferentes', 'conta_de_empresas_diferentes', $c$select public.app_fechar_conta(array['P5','L2'], '[{"forma":"PIX","valor":220}]')$c$);
select public.t_pagar('pedido de outra empresa', 'forbidden', 'L2', 110);
select public.t_pagar('pedido que não existe', 'pedido_nao_encontrado', 'XXX', 110);
update public.tab_pedidos set status = 'cancelado' where id = 'P5';
select public.t_pagar('pedido cancelado', 'pedido_cancelado_nao_pode_ser_pago', 'P5', 110);
set t.email = 'cozinha@l1';
select public.t_conta('P6');
select public.t_pagar('sem acesso ao caixa', 'forbidden', 'P6', 110);
set t.email = 'super@x';
select public.t_pagar('administrador geral fecha qualquer empresa (limites da empresa valem)', 'desconto_acima_do_limite', 'P6', 50, ', p_desconto => 60, p_motivo => ''teste''');
set t.email = '';
select public.t_pagar('sem acesso', 'not_authenticated', 'P6', 110);

-- Empresa sem limite próprio: vale o teto de 99,99%, nunca zera.
set t.email = 'gestor@l2';
select public.t_pagar('sem limite próprio: 100% de desconto recusado', 'desconto_acima_do_limite', 'L2', 1, ', p_desconto => 100, p_taxa_removida => true, p_motivo => ''teste''');
select public.t_pagar('sem limite próprio: 99,99% aceito', 'ok', 'L2', 0.01, ', p_desconto => 99.99, p_taxa_removida => true, p_motivo => ''teste''');

select public.t_vale('funções de apoio fechadas e visitante sem acesso',
  not has_function_privilege('authenticated', 'public.app_pp_quem_chama()', 'execute')
  and not has_function_privilege('anon', 'public.app_parametros_caixa(bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint)', 'execute'));

-- ── 219: taxa pública do cardápio ──
reset t.email;
\i supabase/migrations/219_taxa_publica_do_cardapio.sql
\i supabase/migrations/219_taxa_publica_do_cardapio.sql
select public.t_vale('empresa sem parâmetros: taxa padrão 10', public.pub_taxa_servico(2) = 10);
update public.tab_lojas set config_caixa = '{"taxaServico":{"enabled":true,"percent":12.5,"chargingRule":"opcional"}}' where id = 2;
select public.t_vale('taxa da empresa', public.pub_taxa_servico(2) = 12.5);
update public.tab_lojas set config_caixa = '{"taxaServico":{"enabled":false,"percent":12.5}}' where id = 2;
select public.t_vale('cobrança desligada: zero', public.pub_taxa_servico(2) = 0);
update public.tab_lojas set config_caixa = '{"taxaServico":{"enabled":true,"percent":12.5,"chargingRule":"nao_cobrar"}}' where id = 2;
select public.t_vale('não cobrar: zero', public.pub_taxa_servico(2) = 0);
select public.t_vale('empresa inexistente: nada', public.pub_taxa_servico(999) is null);
set role anon;
select public.pub_taxa_servico(1) as visitante_le;
reset role;
select public.t_vale('visitante lê só a taxa; parâmetros seguem fechados',
  has_function_privilege('anon', 'public.pub_taxa_servico(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.app_parametros_caixa(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.app_pp_config_caixa(jsonb)', 'execute'));

-- ── 220: fecha o caminho antigo ──
-- Funções antigas de checkout (existem em alguns bancos), abertas ao usuário logado.
create function public.app_checkout_begin(p_loja_id bigint, p_pedido_ids text[]) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
create function public.app_checkout_commit(p_operation_id uuid, p_payload jsonb) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
grant execute on function public.app_checkout_begin(bigint, text[]), public.app_checkout_commit(uuid, jsonb) to authenticated;
\i supabase/migrations/220_caixa_fecha_caminho_antigo.sql
\i supabase/migrations/220_caixa_fecha_caminho_antigo.sql
select public.t_vale('checkout antigo fechado para o navegador e mantido para o servidor',
  not has_function_privilege('authenticated', 'public.app_checkout_begin(bigint, text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.app_checkout_commit(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.app_checkout_commit(uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.app_checkout_commit(uuid, jsonb)', 'execute'));
select public.t_vale('navegador não marca pago nem insere pagamento',
  not has_function_privilege('authenticated', 'public.app_pedido_marcar_pago(text, text, text)', 'execute')
  and not has_table_privilege('authenticated', 'public.tab_pagamentos', 'insert'));
set role authenticated;
set t.email = 'caixa@l1';
select public.app_fechar_conta(array['P6'], '[{"forma":"PIX","valor":110}]') ->> 'ok' as fechou_apos_220;
reset role;
select public.t_vale('fechamento continua funcionando como navegador', (select status_pagamento from public.tab_pedidos where id = 'P6') = 'pago');
select 'TODOS OS CASOS PASSARAM' as resultado;
