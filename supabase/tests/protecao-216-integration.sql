-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 216 (proteção das funções públicas). Transação com ROLLBACK.
--  Feito para banco DESCARTÁVEL com a 216 aplicada. Não rode na produção: usa o contador e grava linhas de teste.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t216_res (n serial, ok boolean, msg text);
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t216_res (ok, msg) values (coalesce(p_ok, false), p_msg);
end $$;
-- Executa e devolve o código do erro (ou 'ok').
create function pg_temp.codigo(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then return sqlstate;
end $$;
create function pg_temp.visitante(p_ip text) returns void language plpgsql as $$
begin
  perform set_config('request.headers', case when p_ip is null then '{}' else json_build_object('cf-connecting-ip', p_ip)::text end, true);
end $$;

do $$
declare
  a bigint; b bigint; inativa bigint; c_ana bigint; c_bia bigint; r text; j jsonb; i integer; n integer;
begin
  insert into public.tab_lojas (nome, prefixo) values ('T216 A', 'TAA') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('T216 B', 'TBB') returning id into b;
  insert into public.tab_lojas (nome, prefixo, ativo) values ('T216 Inativa', 'TCC', false) returning id into inativa;
  delete from public.tab_leads;
  delete from public.tab_limite_publico;

  -- ── Nome pelo telefone ──
  insert into public.tab_clientes (nome, telefone, loja_id, criado_em) values ('Ana Souza', '11911110001', a, now() - interval '3 days') returning id into c_ana;
  insert into public.tab_clientes (nome, telefone, loja_id, criado_em) values ('Bia Lima', '11911110002', a, now() - interval '3 days') returning id into c_bia;
  insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos) values (a, c_ana, 120);
  perform pg_temp.visitante('203.0.113.1');
  perform pg_temp.chk(public.pub_buscar_cliente(a, '11911110001') is null, 'buscar cliente não devolve o nome');

  -- ── Saldo ──
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '11911110001') = 120, 'saldo de quem tem pontos');
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '123') = 0, 'saldo com telefone curto é zero');
  for i in 1..29 loop perform public.pub_saldo_fidelidade(a, '119000' || lpad(i::text, 5, '0')); end loop;
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '11999999999') is null, 'saldo: 31º telefone diferente é recusado');
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '11911110001') = 120, 'saldo: telefone já consultado continua respondendo');
  perform pg_temp.chk(public.pub_saldo_fidelidade(b, '11999999999') = 0, 'saldo: limite é por loja');
  perform pg_temp.visitante('203.0.113.2');
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '11999999999') = 0, 'saldo: limite é por visitante');

  -- ── Cadastro ──
  perform pg_temp.visitante('203.0.113.3');
  perform public.pub_upsert_cliente(a, 'Invasor', '(11) 91111-0001');
  perform pg_temp.chk((select nome from public.tab_clientes where id = c_ana) = 'Ana Souza', 'cadastro antigo não é renomeado (telefone com máscara)');
  perform public.pub_upsert_cliente(a, 'Jo', '11922220001');
  perform public.pub_upsert_cliente(a, 'Joana', '11922220001');
  perform pg_temp.chk((select nome from public.tab_clientes where telefone = '11922220001' and loja_id = a) = 'Joana', 'cadastro recém-criado acompanha a digitação');
  insert into public.tab_clientes (nome, telefone, loja_id, criado_em) values ('Cliente', '11922220002', a, now() - interval '3 days');
  perform public.pub_upsert_cliente(a, 'Carla', '11922220002');
  perform pg_temp.chk((select nome from public.tab_clientes where telefone = '11922220002' and loja_id = a) = 'Carla', 'nome genérico é substituído');
  perform public.pub_upsert_cliente(a, null, '11922220001');
  perform pg_temp.chk((select nome from public.tab_clientes where telefone = '11922220001' and loja_id = a) = 'Joana', 'nome vazio não apaga');
  select count(*) into n from public.tab_clientes;
  perform public.pub_upsert_cliente(a, 'X', 'abc');
  perform public.pub_upsert_cliente(a, 'X', '12345678901234');
  perform public.pub_upsert_cliente(inativa, 'X', '11922220009');
  perform public.pub_upsert_cliente(null, 'X', '11922220009');
  perform pg_temp.chk((select count(*) from public.tab_clientes) = n, 'telefone inválido, loja inativa ou vazia não criam cadastro');
  perform public.pub_upsert_cliente(a, repeat('n', 200), '11922220003');
  perform pg_temp.chk((select length(nome) from public.tab_clientes where telefone = '11922220003' and loja_id = a) = 80, 'nome limitado a 80');
  for i in 1..18 loop perform public.pub_upsert_cliente(a, 'Novo', '119333' || lpad(i::text, 5, '0')); end loop;
  r := pg_temp.codigo(format('select public.pub_upsert_cliente(%s, %L, %L)', a, 'Demais', '11944440000'));
  perform pg_temp.chk(r = 'PT429' and not exists (select 1 from public.tab_clientes where telefone = '11944440000'), 'cadastro: 21º novo é recusado');
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_upsert_cliente(%s, %L, %L)', a, 'Joana Dias', '11922220001')) = 'ok', 'cadastro: limite não afeta quem já existe');

  -- ── Pedir a conta ──
  insert into public.tab_pedidos (id, loja_id, comanda, mesa, cliente, cliente_telefone, status, status_pagamento, pagamento_forma, itens) values
    ('P1', a, 'TAA-000001', 'Mesa 01', 'Ana Souza', '11911110001', 'entregue',   'aberto', 'PIX', '[]'),
    ('P2', a, 'TAA-000001', 'Mesa 01', 'Ana Souza', '11911110001', 'preparando', 'aberto', 'PIX', '[]'),
    ('P3', a, 'TAA-000002', 'Mesa 02', 'Bia Lima',  '11911110002', 'entregue',   'aberto', 'PIX', '[]'),
    ('P4', a, 'TAA-000003', 'Mesa 03', 'Sem fone',  null,          'entregue',   'aberto', null,  '[]');
  perform pg_temp.visitante('203.0.113.4');
  perform public.pub_solicitar_conta(a, 'TAA-000001', true);
  perform pg_temp.chk((select status_pagamento = 'solicitado' and pagamento_forma = 'Pontos (solicitado)' from public.tab_pedidos where id = 'P1'), 'conta com pontos marca o entregue');
  perform pg_temp.chk((select status_pagamento = 'aberto' and pagamento_forma = 'PIX' from public.tab_pedidos where id = 'P2'), 'pedido não entregue fica como está');
  perform public.pub_solicitar_conta(a, 'TAA-000002', true);
  perform pg_temp.chk((select status_pagamento = 'solicitado' and pagamento_forma = 'PIX' from public.tab_pedidos where id = 'P3'), 'sem saldo, a forma de pagamento não é trocada');
  perform public.pub_solicitar_conta(a, 'TAA-000003');
  perform pg_temp.chk((select status_pagamento = 'solicitado' from public.tab_pedidos where id = 'P4'), 'assinatura antiga pede a conta');
  for i in 1..18 loop
    insert into public.tab_pedidos (id, loja_id, comanda, status, status_pagamento, itens) values ('L' || i, a, 'TAA-1' || lpad(i::text, 5, '0'), 'entregue', 'aberto', '[]');
  end loop;
  for i in 1..17 loop perform public.pub_solicitar_conta(a, 'TAA-1' || lpad(i::text, 5, '0')); end loop;
  r := pg_temp.codigo(format('select public.pub_solicitar_conta(%s, %L)', a, 'TAA-100018'));
  perform pg_temp.chk(r = 'PT429' and (select status_pagamento = 'aberto' from public.tab_pedidos where id = 'L18'), 'conta: 21ª comanda é recusada (2 argumentos)');
  r := pg_temp.codigo(format('select public.pub_solicitar_conta(%s, %L, false)', a, 'TAA-100018'));
  perform pg_temp.chk(r = 'PT429', 'conta: 21ª comanda é recusada (3 argumentos)');
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_solicitar_conta(%s, %L)', a, 'TAA-000001')) = 'ok', 'conta já pedida pode ser reenviada sem erro');

  -- ── Chamado ──
  perform pg_temp.visitante('203.0.113.5');
  perform public.pub_criar_chamado(a, 'Mesa 01', 'TAA-000001', 'garcom');
  perform public.pub_criar_chamado(a, 'Mesa 01', 'TAA-000001', 'garcom');
  perform pg_temp.chk((select count(*) from public.tab_chamados where loja_id = a) = 1, 'chamado repetido em 2 min é ignorado');
  perform public.pub_criar_chamado(a, 'Mesa 01', 'TAA-000001', 'limpeza');
  perform public.pub_criar_chamado(a, 'Mesa 01', '', null);
  perform pg_temp.chk((select count(*) from public.tab_chamados where loja_id = a) = 3, 'outro tipo ou outra comanda entra; sem tipo vira garçom');
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_criar_chamado(%s, %L, null, %L)', a, 'Mesa 01', 'outro')) = '22023', 'tipo desconhecido é recusado');
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_criar_chamado(%s, %L, null, %L)', inativa, 'Mesa 01', 'garcom')) = '22023', 'loja inativa é recusada');
  perform pg_temp.chk(pg_temp.codigo('select public.pub_criar_chamado(null, ''Mesa 01'', null, ''garcom'')') = '22023', 'loja vazia é recusada');
  for i in 1..57 loop perform public.pub_criar_chamado(a, 'M' || i, null, 'ajuda'); end loop;
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_criar_chamado(%s, %L, null, %L)', a, 'M999', 'ajuda')) = 'PT429', 'chamado: 61º do visitante é recusado');
  perform pg_temp.visitante('203.0.113.6');
  for i in 1..40 loop perform public.pub_criar_chamado(a, 'N' || i, null, 'ajuda'); end loop;
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_criar_chamado(%s, %L, null, %L)', a, 'N999', 'ajuda')) = 'PT429', 'chamado: 101º pendente da loja é recusado');
  update public.tab_chamados set criado_em = now() - interval '13 hours' where loja_id = a;
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_criar_chamado(%s, %L, null, %L)', a, 'N999', 'ajuda')) = 'ok', 'pendente antigo não bloqueia');

  -- ── Contato do site ──
  perform pg_temp.visitante('203.0.113.7');
  perform public.pub_criar_lead('  Lia ', 'Cantina', '+55 (11) 95555-0001', 'torto', 5000, repeat('o', 90));
  perform pg_temp.chk((select nome = 'Lia' and whatsapp = '5511955550001' and email is null and numero_mesas is null and length(origem) = 40
                         from public.tab_leads), 'contato: campos limpos, opcionais fora do esperado descartados');
  perform public.pub_criar_lead('Lia', 'Cantina', '5511955550001');
  perform pg_temp.chk((select count(*) from public.tab_leads) = 1, 'mesmo WhatsApp em 24 h é ignorado');
  perform pg_temp.chk(pg_temp.codigo('select public.pub_criar_lead(''A'', ''B'', ''123'')') = '22023', 'WhatsApp curto é recusado');
  perform pg_temp.chk(pg_temp.codigo('select public.pub_criar_lead('' '', ''B'', ''11955550009'')') = '22023', 'nome vazio é recusado');
  for i in 2..5 loop perform public.pub_criar_lead('N', 'E', '1195555000' || i, 'n@e.com', 10); end loop;
  perform pg_temp.chk((select count(*) from public.tab_leads where email = 'n@e.com' and numero_mesas = 10) = 4, 'contato válido mantém e-mail e mesas');
  perform pg_temp.chk(pg_temp.codigo('select public.pub_criar_lead(''N'', ''E'', ''11955550006'')') = 'PT429', 'contato: 6º do visitante na hora é recusado');
  insert into public.tab_leads (nome, nome_estabelecimento, whatsapp) select 'n', 'e', '1196666' || lpad(g::text, 4, '0') from generate_series(1, 55) g;
  perform pg_temp.visitante('203.0.113.8');
  perform pg_temp.chk(pg_temp.codigo('select public.pub_criar_lead(''N'', ''E'', ''11955550007'')') = 'PT429', 'contato: 61º no total da hora é recusado');

  -- ── Pesquisa ──
  insert into public.tab_pedidos (id, loja_id, comanda, cliente_telefone, status, status_pagamento, itens) values
    ('S1', a, 'TAA-200001', '11911110001', 'entregue', 'pago', '[]'),
    ('S2', a, 'TAA-200002', '11911110001', 'entregue', 'aberto', '[]'),
    ('S3', a, 'TAA-200003', '11911110001', 'finalizado', 'pago', '[]'),
    ('S4', b, 'TBB-200001', '11911110001', 'entregue', 'pago', '[]');
  perform public.pub_pesquisa_satisfacao(null, a, null, null, null, '{"exp_geral":1}', 'x');
  perform public.pub_pesquisa_satisfacao('', a, null, null, null, '{"exp_geral":1}', 'x');
  perform public.pub_pesquisa_satisfacao('S2', a, null, null, null, '{"exp_geral":1}', 'x');
  perform public.pub_pesquisa_satisfacao('S3', a, null, null, null, '{"exp_geral":1}', 'x');
  perform public.pub_pesquisa_satisfacao('S4', a, null, null, null, '{"exp_geral":1}', 'x');
  perform pg_temp.chk((select count(*) from public.tab_pesquisa_satisfacao where loja_id in (a, b)) = 0, 'sem pedido, não pago, não entregue ou de outra loja não grava');
  perform public.pub_pesquisa_satisfacao('S1', a, '11900000000', 'Mesa 01', 'mesa', '{"exp_geral":5,"tempo":""}', repeat('c', 3000));
  perform public.pub_pesquisa_satisfacao('S1', a, null, null, null, '{"exp_geral":1}', 'segunda');
  perform pg_temp.chk((select count(*) = 1 and min(exp_geral) = 5 and min(cliente_telefone) = '11911110001' and min(length(comentario)) = 1000
                         from public.tab_pesquisa_satisfacao where pedido_id = 'S1'), 'pesquisa: uma por pedido, telefone do pedido, comentário até 1000');

  -- ── Acompanhamento ──
  perform pg_temp.visitante('203.0.113.9');
  j := public.pub_acompanhar_pedidos(a, null, 'TAA-000001');
  perform pg_temp.chk(jsonb_array_length(j) = 2, 'acompanhar por comanda devolve os pedidos');
  perform pg_temp.chk(not exists (select 1 from jsonb_array_elements(j) e where e->>'cliente' is not null or e->>'cliente_telefone' is not null), 'por comanda não sai nome nem telefone');
  j := public.pub_acompanhar_pedidos(a, '(11) 91111-0002', null);
  perform pg_temp.chk(jsonb_array_length(j) = 1 and j->0->>'cliente_telefone' = '11911110002' and j->0->>'cliente' is null, 'por telefone volta o telefone consultado, sem nome');
  perform pg_temp.chk(j->0->>'status' = 'entregue' and j->0->>'pagamento_forma' = 'PIX', 'demais campos do acompanhamento continuam');
  for i in 1..149 loop perform public.pub_acompanhar_pedidos(a, null, 'TAA-9' || lpad(i::text, 5, '0')); end loop;
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_acompanhar_pedidos(%s, null, %L)', a, 'TAA-999999')) = 'PT429', 'acompanhar: 151ª comanda é recusada');
  perform pg_temp.chk(jsonb_array_length(public.pub_acompanhar_pedidos(a, null, 'TAA-000001')) = 2, 'comanda já acompanhada continua atualizando');
  for i in 1..59 loop perform public.pub_acompanhar_pedidos(a, '118' || lpad(i::text, 8, '0'), null); end loop;
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_acompanhar_pedidos(%s, %L, null)', a, '11800009999')) = 'PT429', 'acompanhar: 61º telefone é recusado');
  perform pg_temp.chk(public.pub_acompanhar_pedidos(inativa, null, 'TAA-000001') = '[]'::jsonb, 'loja inativa não devolve pedidos');

  -- ── Contador ──
  perform pg_temp.chk(not exists (select 1 from public.tab_limite_publico
                                   where origem ~ '203\.0\.113' or alvo ~ '11911110001|TAA-'), 'contador não guarda IP, telefone ou comanda em texto');
  perform pg_temp.chk((select count(distinct fonte_ip) = 1 and min(fonte_ip) = 'cf-connecting-ip' from public.tab_limite_publico), 'contador registra de onde veio o IP');
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.7, 10.0.0.1"}', true);
  perform public.pub_saldo_fidelidade(a, '11911110001');
  perform pg_temp.chk(exists (select 1 from public.tab_limite_publico where fonte_ip = 'x-forwarded-for'), 'sem o cabeçalho principal usa o x-forwarded-for');
  perform pg_temp.visitante(null);
  for i in 1..40 loop perform public.pub_saldo_fidelidade(a, '117' || lpad(i::text, 8, '0')); end loop;
  perform pg_temp.chk(public.pub_saldo_fidelidade(a, '11700009999') = 0, 'sem IP não bloqueia');
  perform pg_temp.chk(exists (select 1 from public.tab_limite_publico where fonte_ip = 'sem-ip'), 'sem IP fica registrado para a conferência');
  perform set_config('request.headers', 'isto não é json', true);
  perform pg_temp.chk(pg_temp.codigo(format('select public.pub_saldo_fidelidade(%s, %L)', a, '11911110001')) = 'ok', 'cabeçalho ilegível não derruba a função');
  update public.tab_limite_publico set janela = now() - interval '2 days';
  perform pg_temp.visitante('203.0.113.10');
  perform public.pub_saldo_fidelidade(a, '11911110001');
  perform pg_temp.chk((select count(*) from public.tab_limite_publico) = 1, 'registros com mais de 1 dia são apagados');
end $$;

-- ── Como visitante: funciona pelas funções e não alcança o contador ──
select pg_temp.visitante('203.0.113.20');
grant all on t216_res to anon;
grant usage on sequence t216_res_n_seq to anon;
set local role anon;
do $$
declare a bigint := 1; r text;
begin
  perform public.pub_buscar_cliente(a, '11911110001');
  perform public.pub_saldo_fidelidade(a, '11911110001');
  perform public.pub_upsert_cliente(a, 'V', '11911110001');
  perform public.pub_solicitar_conta(a, 'ZZZ-000001');
  perform public.pub_acompanhar_pedidos(a, null, 'ZZZ-000001');
  insert into t216_res (ok, msg) values (true, 'visitante executa as funções do cardápio');
  foreach r in array array[
    'select * from public.tab_limite_publico',
    'select * from public.tab_limite_publico_sal',
    'delete from public.tab_limite_publico',
    'select public.app_limite_publico(''saldo'', 1, ''x'', 999999, 10)',
    'select * from public.pub_pedidos_comanda(1, ''ZZZ-000001'')',
    'select * from public.pub_pedidos_cliente(1, ''11911110001'')'
  ] loop
    begin
      execute r;
      insert into t216_res (ok, msg) values (false, 'visitante deveria ser barrado: ' || r);
    exception when insufficient_privilege then
      insert into t216_res (ok, msg) values (true, 'visitante barrado: ' || r);
    end;
  end loop;
end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end as r, msg from t216_res order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok) as falharam from t216_res;
rollback;
