-- Teste da migration 228 em um PostgreSQL LOCAL E VAZIO. Roda antes o teste da 226 (que monta o banco) e segue dali.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/validade-228-integration.sql   (a partir da raiz do projeto)
\i supabase/tests/estorno-226-integration.sql

create function public.app_limite_publico(a text, b bigint, c text, d integer, e integer) returns boolean language sql as $$ select true $$;
create function public.pub_saldo_fidelidade(p_loja_id bigint, p_telefone text) returns integer language sql security definer as $$ select 0 $$;
grant execute on function public.pub_saldo_fidelidade(bigint, text) to anon, authenticated;

\i supabase/migrations/228_validade_dos_pontos.sql
\i supabase/migrations/228_validade_dos_pontos.sql

insert into public.tab_clientes (nome, telefone, loja_id) values ('Bia', '11922222222', 1), ('Caio', '11933333333', 2);
update public.tab_caixas set status = 'aberto' where id = 2;

create function public.t_bia() returns bigint language sql as $$ select id from public.tab_clientes where telefone = '11922222222' $$;
create function public.t_pts() returns bigint language sql as $$ select public.app_pp_saldo_pontos(1, public.t_bia()) $$;
create function public.t_soma() returns bigint language sql as $$ select coalesce(sum(pontos), 0)::bigint from public.tab_fidelidade_transacoes where cliente_id = public.t_bia() $$;
create function public.t_lancar(p integer, p_tipo text default 'adjust') returns bigint language sql as $$
  select (public.app_pontos_lancar(public.t_bia(), p, p_tipo, 'teste') ->> 'id')::bigint $$;
create function public.t_resta(p_lote bigint) returns integer language sql as $$ select restante from public.tab_fidelidade_lote where lote_id = p_lote $$;
create function public.t_prazo(p_lote bigint, p_dias integer) returns void language sql as $$
  update public.tab_fidelidade_lote set expira_em = now() + make_interval(days => p_dias) where lote_id = p_lote $$;
create function public.t_compra(p_id text, p_qtd integer, p_parcelas jsonb) returns void language plpgsql as $$
declare v_antes text := current_setting('t.email', true);
begin
  perform set_config('t.email', 'caixa@l1', false);
  insert into public.tab_pedidos (id, loja_id, mesa, comanda, cliente, cliente_telefone, itens)
  values (p_id, 1, 'Externo · Retirada', 'C-' || p_id, 'Bia', '11922222222', jsonb_build_array(public.t_item(10, 'Burger', 10, p_qtd)));
  perform public.t_fechar(p_id, p_parcelas);
  perform set_config('t.email', v_antes, false);
end $$;
create function public.t_lote_da(p_id text) returns bigint language sql as $$
  select l.lote_id from public.tab_fidelidade_lote l join public.tab_venda v on v.pagamento_id = l.pagamento_id where v.id = public.t_venda(p_id) $$;

set t.email = 'gestor@l1';

-- ── Sem validade: nada muda ──
select public.t_lancar(100) as antigo \gset
select public.t_vale('sem validade não cria lote nem data',
  (select count(*) from public.tab_fidelidade_lote) = 0 and (select expira_em from public.tab_fidelidade_transacoes where id = :antigo) is null and public.t_pts() = 100);
select public.t_espera('validade zero é recusada', '%chk_fidelidade_validade%', $$update public.tab_fidelidade_regras set validade_dias = 0 where loja_id = 1$$);

-- ── Ligando a validade: só o que vier depois ──
update public.tab_fidelidade_regras set validade_dias = 30 where loja_id = 1;
select public.t_vale('o saldo anterior continua sem validade', (select count(*) from public.tab_fidelidade_lote) = 0 and public.t_pts() = 100);
select public.t_lancar(50) as manual \gset
select public.t_vale('lançamento à mão vence no fim do 30º dia, horário de Brasília',
  (select (expira_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date + 30
          and to_char(expira_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') = '23:59:59' from public.tab_fidelidade_transacoes where id = :manual)
  and public.t_resta(:manual) = 50);
select public.t_compra('B1', 4, '[{"forma":"PIX","valor":40}]');
select public.t_lote_da('B1') as compra \gset
select public.t_vale('compra cria lote com a venda', public.t_resta(:compra) = 40 and public.t_pts() = 190);
select public.t_prazo(:compra, 10);
select public.t_prazo(:manual, 20);

-- ── Resgate: primeiro o que vence antes ──
select public.t_lancar(-60, 'redeem');
select public.t_vale('consome o que vence antes e depois o seguinte', public.t_resta(:compra) = 0 and public.t_resta(:manual) = 30 and public.t_pts() = 130);
select public.t_lancar(-40, 'redeem');
select public.t_vale('o que falta sai dos pontos sem validade', public.t_resta(:manual) = 0 and public.t_pts() = 90
  and (select sum(pontos) from public.tab_fidelidade_consumo) = 90);

-- ── Vencimento ──
select public.t_lancar(80) as a \gset
select public.t_prazo(:a, -1);
select public.t_vale('o vencido já não conta no saldo, antes de qualquer registro', public.t_pts() = 90 and public.t_soma() = 170
  and public.pub_saldo_fidelidade(1, '11922222222') = 90);
set t.email = 'gestor@l2';
select public.t_espera('outra empresa não registra vencimento', 'forbidden', 'select public.app_pontos_expirar(1)');
set t.email = 'caixa@l1';
select public.t_vale('o registro lança o vencimento', public.app_pontos_expirar(1) = '{"clientes": 1, "pontos": 80}'::jsonb);
select public.t_vale('vencimento gravado com data e lote',
  (select pontos = -80 and lote_id = :a and expira_em = (select expira_em from public.tab_fidelidade_lote where lote_id = :a) and descricao like 'Pontos vencidos em %'
     from public.tab_fidelidade_transacoes where tipo = 'expire') and public.t_resta(:a) = 0 and public.t_soma() = 90 and public.t_pts() = 90);
select public.t_vale('registrar de novo não repete', public.app_pontos_expirar(1) = '{"clientes": 0, "pontos": 0}'::jsonb);
set t.email = 'gestor@l1';

select public.t_lancar(30) as b \gset
select public.t_prazo(:b, -1);
select public.t_espera('não resgata pontos vencidos', 'saldo_de_pontos_insuficiente', 'select public.t_lancar(-91, ''redeem'')');
select public.t_lancar(-90, 'redeem');
select public.t_vale('o resgate registra junto o que venceu',
  public.t_soma() = 0 and public.t_resta(:b) = 0 and (select pontos from public.tab_fidelidade_transacoes where tipo = 'expire' and lote_id = :b) = -30);

-- Saldo menor que o lote: vencimento nunca deixa o saldo negativo, e o lote não volta a cobrar depois.
select public.t_lancar(60) as c \gset
insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao) values (1, public.t_bia(), -60, 'adjust', 'saiu do saldo');
update public.tab_fidelidade_lote set restante = 60 where lote_id = :c; -- simula um lote com mais do que o saldo
select public.t_prazo(:c, -1);
select public.app_pontos_expirar(1);
select public.t_vale('sem saldo não há lançamento e o lote encerra', public.t_resta(:c) = 0 and public.t_soma() = 0
  and not exists (select 1 from public.tab_fidelidade_transacoes where tipo = 'expire' and lote_id = :c));

-- ── Pagamento com pontos e estorno: os pontos voltam ao lote de origem ──
select public.t_lancar(500) as d \gset
select public.t_compra('B2', 5, '[{"forma":"Pontos","valor":3},{"forma":"PIX","valor":47}]');
select public.t_lote_da('B2') as ganho2 \gset
select public.t_vale('pagamento com pontos consome o lote', public.t_resta(:d) = 200 and public.t_resta(:ganho2) = 47 and public.t_pts() = 247);
select public.app_venda_estornar(public.t_venda('B2'), 'Teste de estorno com pontos');
select public.t_vale('estorno devolve ao lote e desfaz o ganho', public.t_resta(:d) = 500 and public.t_resta(:ganho2) = 0 and public.t_pts() = 500 and public.t_soma() = 500);

-- Ganho que já venceu e depois a venda é estornada: o saldo volta exatamente ao de antes.
select public.t_compra('B3', 4, '[{"forma":"PIX","valor":40}]');
select public.t_lote_da('B3') as ganho3 \gset
select public.t_prazo(:ganho3, -1);
select public.app_pontos_expirar(1);
select public.t_vale('ganho da compra venceu', public.t_soma() = 500);
select public.app_venda_estornar(public.t_venda('B3'), 'Teste de estorno apos vencer');
select public.t_vale('estorno desfaz o vencimento em vez de tirar duas vezes', public.t_soma() = 500 and public.t_pts() = 500
  and (select sum(pontos) from public.tab_fidelidade_transacoes where tipo = 'expire' and lote_id = :ganho3) = 0);

-- Resgate cujo lote venceu antes do estorno: o que volta já vence.
select public.t_compra('B4', 2, '[{"forma":"Pontos","valor":2},{"forma":"PIX","valor":18}]');
select public.t_vale('resgate de 200 e ganho de 18', public.t_resta(:d) = 300 and public.t_pts() = 318);
select public.t_prazo(:d, -1);
select public.app_pontos_expirar(1);
select public.app_venda_estornar(public.t_venda('B4'), 'Teste de estorno com lote vencido');
select public.t_vale('pontos devolvidos a um lote vencido vencem em seguida', public.t_resta(:d) = 0 and public.t_pts() = 0 and public.t_soma() = 0
  and (select -sum(pontos) from public.tab_fidelidade_transacoes where tipo = 'expire' and lote_id = :d) = 500);

-- ── Painel gerencial ──
select public.t_lancar(70) as e \gset
select public.t_compra('B5', 3, '[{"forma":"Pontos","valor":0.5},{"forma":"PIX","valor":29.5}]');
insert into public.loja_fiscal_documento (loja_id, modelo, numero, status, pedidos_ids, valor_total) values (1, 65, 4321, 'autorizado', '{B5}', 30);
select public.t_vale('relatório separa usados e vencidos e liga à venda e à nota',
  (r #>> '{resumo,vencidos}')::int = (select -sum(pontos) from public.tab_fidelidade_transacoes where loja_id = 1 and tipo = 'expire')
  and (r #>> '{resumo,usados}')::int = (select -sum(pontos) from public.tab_fidelidade_transacoes where loja_id = 1 and tipo = 'redeem')
  and (r #>> '{resumo,aVencer}')::int = (select coalesce(sum(restante), 0) from public.tab_fidelidade_lote where loja_id = 1 and restante > 0 and expira_em > now() and expira_em <= now() + interval '30 days')
  and jsonb_array_length(r -> 'porDia') >= 1)
  from (select public.app_pontos_relatorio(1) as r) x;
select public.t_vale('valor em reais dos pontos usados desconta os estornos',
  (public.app_pontos_relatorio(1, p_tipo => 'usado') #>> '{resumo,valorUsado}')::numeric = 0.50); -- V1, B2 e B4 foram estornadas: sobra só B5
select public.t_vale('busca pelo número da nota acha o resgate',
  r ->> 'total' = '1' and r #>> '{linhas,0,notas,0,numero}' = '4321' and (r #>> '{linhas,0,valor}')::numeric = 0.50 and r #>> '{linhas,0,grupo}' = 'usado')
  from (select public.app_pontos_relatorio(1, p_busca => '4321') as r) x;
select public.t_vale('filtro de vencidos traz só vencidos',
  not exists (select 1 from jsonb_array_elements(public.app_pontos_relatorio(1, p_tipo => 'vencido') -> 'linhas') l where l ->> 'grupo' <> 'vencido'));
select public.t_vale('paginação', jsonb_array_length(public.app_pontos_relatorio(1, p_por_pagina => 2) -> 'linhas') = 2);
select public.t_vale('histórico do cliente: saldo, a vencer, lançamentos e compras',
  (h ->> 'saldo')::bigint = public.t_pts() and jsonb_array_length(h -> 'aVencer') >= 1 and jsonb_array_length(h -> 'movimentos') > 5
  and jsonb_array_length(h -> 'compras') = 5 and h #>> '{compras,0,itens}' = '3× Burger'
  and (select count(*) from jsonb_array_elements(h -> 'compras') c where c ->> 'estornada' = 'true') = 3)
  from (select public.app_pontos_cliente(1, public.t_bia()) as h) x;
select public.t_espera('cliente de outra empresa não aparece', 'cliente_nao_encontrado', 'select public.app_pontos_cliente(1, (select id from public.tab_clientes where telefone = ''11933333333''))');
set t.email = 'caixa@l1';
select public.t_espera('operador do caixa não vê o painel', 'forbidden', 'select public.app_pontos_relatorio(1)');
select public.t_espera('operador do caixa não vê o histórico', 'forbidden', 'select public.app_pontos_cliente(1, public.t_bia())');
set t.email = 'gestor@l2';
select public.t_espera('outra empresa não vê o painel', 'forbidden', 'select public.app_pontos_relatorio(1)');
select public.t_vale('painel da outra empresa não traz nada desta', public.app_pontos_relatorio(2) ->> 'total' = '0');

-- Desligar a validade não muda o que já foi lançado.
set t.email = 'gestor@l1';
create table public.t_datas as select lote_id, expira_em from public.tab_fidelidade_lote;
update public.tab_fidelidade_regras set validade_dias = null where loja_id = 1;
select public.t_lancar(5) as f \gset
select public.t_vale('desligada: novos sem data, antigos mantêm a sua',
  (select expira_em from public.tab_fidelidade_transacoes where id = :f) is null
  and not exists (select 1 from public.t_datas a join public.tab_fidelidade_lote l using (lote_id) where a.expira_em <> l.expira_em));
select public.t_vale('rotina geral não gera lançamento sem pendência', public.app_pp_expirar_tudo() = 0);

-- ── Acesso ──
select public.t_espera('consumo não muda', 'registro_de_venda_nao_se_altera', 'update public.tab_fidelidade_consumo set pontos = 0');
select public.t_vale('tabelas novas sem acesso direto e com RLS',
  not exists (select 1 from pg_class c where c.oid in ('public.tab_fidelidade_lote'::regclass, 'public.tab_fidelidade_consumo'::regclass)
    and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))));
select public.t_vale('visitante não executa; internas não são chamadas pelo app',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_pontos_expirar', 'app_pontos_relatorio', 'app_pontos_cliente', 'app_pp_expirar_tudo', 'app_pp_expirar_cliente')
    and has_function_privilege('anon', p.oid, 'execute'))
  and not has_function_privilege('authenticated', 'public.app_pp_expirar_cliente(bigint, bigint)', 'execute')
  and not has_function_privilege('authenticated', 'public.app_pp_expirar_tudo()', 'execute')
  and not has_function_privilege('authenticated', 'public.app_pp_saldo_pontos(bigint, bigint)', 'execute')
  and has_function_privilege('anon', 'public.pub_saldo_fidelidade(bigint, text)', 'execute'));
