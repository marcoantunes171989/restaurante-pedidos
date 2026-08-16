-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — Fundação Financeira V2 (app_registrar_pagamento_v2)
--
--  ⚠️ SOMENTE HOMOLOGAÇÃO. Requer a migration 118 aplicada.
--  Tudo roda dentro de UMA transação com ROLLBACK ao final: NENHUM dado é
--  persistido. As sessões de usuário são simuladas via request.jwt.claims
--  (set_config local), do mesmo jeito que a RLS/definer leem em produção.
--
--  Resultado: mensagens NOTICE 'PASS: ...' / 'FAIL: ...'. Zero FAIL = verde.
--  A concorrência REAL (duas sessões simultâneas) não cabe num único script —
--  ver o bloco "SESSÃO A / SESSÃO B" ao final para reproduzir manualmente.
-- ════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_lojaA bigint; v_lojaB bigint;
  v_userOk bigint; v_userNo bigint;
  v_caixaA bigint; v_caixaFech bigint; v_caixaB bigint;
  v_formaA bigint; v_formaInat bigint; v_formaB bigint;
  v_res jsonb; v_id1 uuid; v_ok boolean; v_msg text;
  claimsOk   text; claimsNo text; claimsSuper text;
begin
  -- ── Fixtures (dados de teste claramente marcados) ─────────
  insert into public.tab_lojas (nome, prefixo) values ('PV2 Loja A','PV2A') returning id into v_lojaA;
  insert into public.tab_lojas (nome, prefixo) values ('PV2 Loja B','PV2B') returning id into v_lojaB;

  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id, permissoes_acoes)
    values ('PV2 Caixa OK','pv2.ok@teste.local','Operador', true, array['cashier'], v_lojaA, '{}'::jsonb)
    returning id into v_userOk;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id, permissoes_acoes)
    values ('PV2 Sem Perm','pv2.no@teste.local','Cozinha', true, array['kitchen'], v_lojaA, '{}'::jsonb)
    returning id into v_userNo;

  insert into public.tab_caixas (loja_id, status) values (v_lojaA,'aberto')  returning id into v_caixaA;
  insert into public.tab_caixas (loja_id, status) values (v_lojaA,'fechado') returning id into v_caixaFech;
  insert into public.tab_caixas (loja_id, status) values (v_lojaB,'aberto')  returning id into v_caixaB;

  insert into public.tab_formas_pagamento (nome, tipo, ativo, loja_id) values ('PV2 Pix A','pix',true, v_lojaA)  returning id into v_formaA;
  insert into public.tab_formas_pagamento (nome, tipo, ativo, loja_id) values ('PV2 Inat A','pix',false,v_lojaA) returning id into v_formaInat;
  insert into public.tab_formas_pagamento (nome, tipo, ativo, loja_id) values ('PV2 Pix B','pix',true, v_lojaB)  returning id into v_formaB;

  -- Pedidos: itens com price×quantity conhecidos. Total canônico = Σ price×qty.
  -- P1 = 30,00 (10*1 + 20*1) | P2 = 50,00 (25*2) | PB (loja B) = 40,00 | PCanc cancelado.
  insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
    values ('PV2-P1','1','PV2-C1','recebido','aberto',
      '[{"name":"X","price":10,"quantity":1},{"name":"Y","price":20,"quantity":1}]'::jsonb, v_lojaA);
  insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
    values ('PV2-P2','2','PV2-C2','recebido','aberto',
      '[{"name":"Z","price":25,"quantity":2}]'::jsonb, v_lojaA);
  insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
    values ('PV2-PB','3','PV2-CB','recebido','aberto',
      '[{"name":"B","price":40,"quantity":1}]'::jsonb, v_lojaB);
  insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
    values ('PV2-PC','4','PV2-CC','cancelado','aberto',
      '[{"name":"C","price":10,"quantity":1}]'::jsonb, v_lojaA);

  claimsOk    := json_build_object('email','pv2.ok@teste.local','role','authenticated')::text;
  claimsNo    := json_build_object('email','pv2.no@teste.local','role','authenticated')::text;
  claimsSuper := json_build_object('email','pv2.ok@teste.local','super_admin',true,'role','authenticated')::text;

  -- Helper de valor canônico (deve casar com os fixtures).
  if public.app_pedido_valor_total((select itens from public.tab_pedidos where id='PV2-P1')) = 30.00
     and public.app_pedido_valor_total((select itens from public.tab_pedidos where id='PV2-P2')) = 50.00
  then raise notice 'PASS: valor canônico (30/50)'; else raise notice 'FAIL: valor canônico'; end if;

  -- ── T0b: VALOR CANÔNICO FAIL-CLOSED (cada caso deve LANÇAR, sem persistir) ──
  declare
    c text; ok boolean;
    casos jsonb[] := array[
      '[{"name":"X","price":10}]'::jsonb,                       -- quantity ausente
      '[{"name":"X","price":10,"quantity":0}]'::jsonb,          -- quantity zero
      '[{"name":"X","price":10,"quantity":-2}]'::jsonb,         -- quantity negativa
      '[{"name":"X","quantity":1}]'::jsonb,                     -- price ausente
      '[{"name":"X","price":"abc","quantity":1}]'::jsonb,       -- price inválido
      '[{"name":"X","price":-5,"quantity":1}]'::jsonb,          -- price negativo
      '{"nao":"array"}'::jsonb,                                 -- itens não-array
      '[123]'::jsonb                                            -- item não-objeto
    ];
    v jsonb;
  begin
    foreach v in array casos loop
      ok := false;
      begin
        perform public.app_pedido_valor_total(v);
      exception when others then
        if SQLERRM like '%PAYMENT_V2_PEDIDO_VALOR_INVALIDO%' then ok := true; end if;
      end;
      if ok then raise notice 'PASS: valor inválido rejeitado (%)', v
      else raise notice 'FAIL: valor inválido NÃO rejeitado (%)', v; end if;
    end loop;
  end;

  -- T0c: RPC com pedido de itens inválidos → erro + NENHUMA transação persistida.
  declare v_antes0 int; v_depois0 int; begin
    insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
      values ('PV2-PBAD','9','PV2-CBAD','recebido','aberto','[{"name":"N","price":10,"quantity":0}]'::jsonb, v_lojaA);
    select count(*) into v_antes0 from public.pagamento_transacoes where loja_id=v_lojaA;
    perform set_config('request.jwt.claims', claimsOk, true);
    begin
      perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-PBAD","valor":10}]'::jsonb, 10, v_lojaA);
    exception when others then null; end;
    select count(*) into v_depois0 from public.pagamento_transacoes where loja_id=v_lojaA;
    if v_antes0 = v_depois0 then raise notice 'PASS: T0c pedido com item inválido não gera transação'; else raise notice 'FAIL: T0c persistiu transação'; end if;
  end;

  -- ── T1: usuário autorizado paga P1 integral (30) ──────────
  perform set_config('request.jwt.claims', claimsOk, true);
  v_res := public.app_registrar_pagamento_v2(
    gen_random_uuid(), '[{"pedido_id":"PV2-P1","valor":30}]'::jsonb, 30, v_lojaA,
    'manual','manual', v_formaA, v_caixaA, 0, '{}'::jsonb, true);
  if (v_res->>'status')='PAID' and (select status_pagamento from public.tab_pedidos where id='PV2-P1')='pago'
  then raise notice 'PASS: T1 pagamento integral marca pago'; else raise notice 'FAIL: T1 %', v_res; end if;

  -- ── T2: usuário SEM permissão → FORBIDDEN ─────────────────
  perform set_config('request.jwt.claims', claimsNo, true);
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P2","valor":50}]'::jsonb, 50, v_lojaA);
    raise notice 'FAIL: T2 deveria bloquear sem permissão';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_FORBIDDEN%' then raise notice 'PASS: T2 sem permissão bloqueado'; else raise notice 'FAIL: T2 %', SQLERRM; end if;
  end;

  -- ── T3: pagamento PARCIAL de P2 (25 de 50) NÃO marca pago ─
  perform set_config('request.jwt.claims', claimsOk, true);
  perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P2","valor":25}]'::jsonb, 25, v_lojaA, 'manual','manual', v_formaA, v_caixaA);
  if (select status_pagamento from public.tab_pedidos where id='PV2-P2')='aberto'
  then raise notice 'PASS: T3 parcial mantém pedido não quitado'; else raise notice 'FAIL: T3 marcou pago cedo demais'; end if;

  -- ── T4: segundo pagamento completa o saldo (25) → pago ────
  perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P2","valor":25}]'::jsonb, 25, v_lojaA, 'manual','manual', v_formaA, v_caixaA);
  if (select status_pagamento from public.tab_pedidos where id='PV2-P2')='pago'
  then raise notice 'PASS: T4 saldo zerado marca pago'; else raise notice 'FAIL: T4 não quitou'; end if;

  -- ── T5: pagamento acima do saldo (P2 já quitado) → EXCEDE/JA_PAGO ─
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P2","valor":10}]'::jsonb, 10, v_lojaA);
    raise notice 'FAIL: T5 deveria rejeitar pedido já pago';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_PEDIDO_JA_PAGO%' or SQLERRM like '%PAYMENT_V2_EXCEDE_SALDO%'
    then raise notice 'PASS: T5 pedido já pago/excede saldo'; else raise notice 'FAIL: T5 %', SQLERRM; end if;
  end;

  -- ── T6: idempotência sequencial (mesma key 2×) → 1 transação ─
  -- Pedido novo P3 (12,00) para um cenário limpo de idempotência.
  insert into public.tab_pedidos (id, mesa, comanda, status, status_pagamento, itens, loja_id)
    values ('PV2-P3','5','PV2-C3','recebido','aberto','[{"name":"W","price":12,"quantity":1}]'::jsonb, v_lojaA);
  v_id1 := gen_random_uuid();
  v_res := public.app_registrar_pagamento_v2(v_id1, '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA);
  declare v_res2 jsonb; begin
    v_res2 := public.app_registrar_pagamento_v2(v_id1, '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA);
    if (v_res->>'id') = (v_res2->>'id') and (v_res2->>'idempotente')='true'
       and (select count(*) from public.pagamento_transacoes where idempotency_key=v_id1)=1
    then raise notice 'PASS: T6 idempotência sequencial (1 transação)'; else raise notice 'FAIL: T6 %', v_res2; end if;
  end;

  -- ── T7: pedido cancelado → erro ───────────────────────────
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-PC","valor":10}]'::jsonb, 10, v_lojaA);
    raise notice 'FAIL: T7 deveria rejeitar cancelado';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_PEDIDO_CANCELADO%' then raise notice 'PASS: T7 pedido cancelado'; else raise notice 'FAIL: T7 %', SQLERRM; end if;
  end;

  -- ── T8: pedido cross-tenant (loja B) → erro ───────────────
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-PB","valor":40}]'::jsonb, 40, v_lojaA);
    raise notice 'FAIL: T8 deveria bloquear cross-tenant';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_CROSS_TENANT%' then raise notice 'PASS: T8 pedido cross-tenant'; else raise notice 'FAIL: T8 %', SQLERRM; end if;
  end;

  -- ── T9: caixa cross-tenant / fechado / forma inválida ─────
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA, 'manual','manual', null, v_caixaB);
    raise notice 'FAIL: T9a caixa cross-tenant deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_CAIXA_CROSS_TENANT%' then raise notice 'PASS: T9a caixa cross-tenant'; else raise notice 'FAIL: T9a %', SQLERRM; end if;
  end;
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA, 'manual','manual', null, v_caixaFech);
    raise notice 'FAIL: T9b caixa fechado deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_CAIXA_FECHADO%' then raise notice 'PASS: T9b caixa fechado'; else raise notice 'FAIL: T9b %', SQLERRM; end if;
  end;
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA, 'manual','manual', v_formaB);
    raise notice 'FAIL: T9c forma cross-tenant deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_FORMA_CROSS_TENANT%' then raise notice 'PASS: T9c forma cross-tenant'; else raise notice 'FAIL: T9c %', SQLERRM; end if;
  end;
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 12, v_lojaA, 'manual','manual', v_formaInat);
    raise notice 'FAIL: T9d forma inativa deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_FORMA_INATIVA%' then raise notice 'PASS: T9d forma inativa'; else raise notice 'FAIL: T9d %', SQLERRM; end if;
  end;

  -- ── T10: soma das alocações != bruto → erro ───────────────
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":12}]'::jsonb, 20, v_lojaA);
    raise notice 'FAIL: T10 soma inválida deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_SOMA_INVALIDA%' then raise notice 'PASS: T10 soma inválida'; else raise notice 'FAIL: T10 %', SQLERRM; end if;
  end;

  -- ── T11: pedido inexistente → erro ────────────────────────
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-NAO-EXISTE","valor":5}]'::jsonb, 5, v_lojaA);
    raise notice 'FAIL: T11 inexistente deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_PEDIDO_INEXISTENTE%' then raise notice 'PASS: T11 pedido inexistente'; else raise notice 'FAIL: T11 %', SQLERRM; end if;
  end;

  -- ── T12: JSON inválido (valor não numérico / duplicado) ───
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":"abc"}]'::jsonb, 12, v_lojaA);
    raise notice 'FAIL: T12a valor não numérico deveria falhar';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_INVALID%' then raise notice 'PASS: T12a JSON inválido'; else raise notice 'FAIL: T12a %', SQLERRM; end if;
  end;
  begin
    perform public.app_registrar_pagamento_v2(gen_random_uuid(), '[{"pedido_id":"PV2-P3","valor":6},{"pedido_id":"PV2-P3","valor":6}]'::jsonb, 12, v_lojaA);
    raise notice 'FAIL: T12b pedido duplicado deveria falhar';
  exception when others then
    if SQLERRM like '%duplicado%' or SQLERRM like '%PAYMENT_V2_INVALID%' then raise notice 'PASS: T12b pedido duplicado'; else raise notice 'FAIL: T12b %', SQLERRM; end if;
  end;

  -- ── T13: evento é append-only (UPDATE/DELETE negado) ──────
  begin
    update public.pagamento_eventos set tipo='PAID' where pagamento_id = (v_res->>'id')::uuid;
    raise notice 'FAIL: T13 UPDATE de evento deveria ser negado';
  exception when others then
    if SQLERRM like '%PAYMENT_V2_EVENTO_IMUTAVEL%' then raise notice 'PASS: T13 evento imutável (update negado)'; else raise notice 'FAIL: T13 %', SQLERRM; end if;
  end;

  -- ── T14: rollback após erro no meio (multi-pedido, 1 inválido) ─
  declare v_antes int; v_depois int; begin
    select count(*) into v_antes from public.pagamento_transacoes where loja_id=v_lojaA;
    begin
      perform public.app_registrar_pagamento_v2(gen_random_uuid(),
        '[{"pedido_id":"PV2-P3","valor":6},{"pedido_id":"PV2-PB","valor":6}]'::jsonb, 12, v_lojaA);
    exception when others then null; end;
    select count(*) into v_depois from public.pagamento_transacoes where loja_id=v_lojaA;
    if v_antes = v_depois then raise notice 'PASS: T14 rollback total (nada persistido)'; else raise notice 'FAIL: T14 persistiu parcial'; end if;
  end;

  raise notice '──────── FIM DOS TESTES (procure por FAIL acima) ────────';
end $$;

-- ROLLBACK: nada é persistido.
rollback;

-- ════════════════════════════════════════════════════════════
--  RLS / GRANTS COM PAPÉIS EFETIVOS (SET ROLE) — prova REAL de isolamento.
--  ⚠️ set_config(request.jwt.claims) sozinho NÃO prova RLS quando o editor roda
--  como owner/postgres (o owner IGNORA RLS). Aqui trocamos o PAPEL efetivo para
--  'authenticated' e 'anon' — só então a RLS/os grants são aplicados de fato.
--  Rode conectado como owner/postgres (SQL Editor) para poder SET ROLE. ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
do $$
declare v_a bigint; v_b bigint; v_pa uuid; v_pb uuid;
begin
  insert into public.tab_lojas (nome, prefixo) values ('PV2 RLS A','PV2RA') returning id into v_a;
  insert into public.tab_lojas (nome, prefixo) values ('PV2 RLS B','PV2RB') returning id into v_b;
  perform set_config('pv2.loja_a', v_a::text, true);
  perform set_config('pv2.loja_b', v_b::text, true);
  insert into public.tab_usuarios (nome,email,perfil,ativo,ids_acesso,loja_id,permissoes_acoes)
    values ('PV2 RLS UserA','pv2.rls.a@teste.local','Operador',true,array['cashier'],v_a,'{}'::jsonb);
  -- Pagamentos diretos (owner) — 1 por loja — só para testar leitura isolada.
  insert into public.pagamento_transacoes (loja_id,valor_bruto,valor_taxa,valor_liquido,status,provider,idempotency_key)
    values (v_a,10,0,10,'PAID','manual',gen_random_uuid()) returning id into v_pa;
  insert into public.pagamento_transacoes (loja_id,valor_bruto,valor_taxa,valor_liquido,status,provider,idempotency_key)
    values (v_b,20,0,20,'PAID','manual',gen_random_uuid()) returning id into v_pb;
  insert into public.pagamento_eventos (loja_id,pagamento_id,tipo,status_novo) values (v_a,v_pa,'CREATED','PAID');
end $$;

-- Papel AUTHENTICATED simulando a sessão da Loja A.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('email','pv2.rls.a@teste.local','role','authenticated')::text, true);
do $$
declare v_a bigint := current_setting('pv2.loja_a')::bigint;
        v_b bigint := current_setting('pv2.loja_b')::bigint;
        n_a int; n_b int; blocked boolean;
begin
  select count(*) into n_a from public.pagamento_transacoes where loja_id = v_a;
  select count(*) into n_b from public.pagamento_transacoes where loja_id = v_b;
  if n_a >= 1 and n_b = 0 then raise notice 'PASS: RLS — Loja A vê a própria, NÃO vê a Loja B'; else raise notice 'FAIL: RLS leitura (A=% B=%)', n_a, n_b; end if;

  blocked := false;
  begin
    insert into public.pagamento_transacoes (loja_id,valor_bruto,valor_taxa,valor_liquido,status,provider,idempotency_key)
      values (v_a,1,0,1,'PAID','manual',gen_random_uuid());
  exception when others then blocked := true; end;
  if blocked then raise notice 'PASS: authenticated NÃO faz INSERT direto'; else raise notice 'FAIL: INSERT direto permitido'; end if;

  blocked := false;
  begin update public.pagamento_eventos set tipo='PAID' where loja_id = v_a; exception when others then blocked := true; end;
  if blocked then raise notice 'PASS: authenticated NÃO faz UPDATE de evento'; else raise notice 'FAIL: UPDATE de evento permitido'; end if;

  blocked := false;
  begin delete from public.pagamento_eventos where loja_id = v_a; exception when others then blocked := true; end;
  if blocked then raise notice 'PASS: authenticated NÃO faz DELETE de evento'; else raise notice 'FAIL: DELETE de evento permitido'; end if;
end $$;
reset role;

-- Papel ANON — sem NENHUM acesso financeiro.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
declare n int; denied boolean := false;
begin
  begin
    select count(*) into n from public.pagamento_transacoes;
    if n = 0 then denied := true; end if;   -- RLS sem policy p/ anon → 0 linhas
  exception when others then denied := true; -- ou permission denied (revoke all)
  end;
  if denied then raise notice 'PASS: anon sem acesso financeiro'; else raise notice 'FAIL: anon leu % linhas', n; end if;
end $$;
reset role;

rollback;

-- ════════════════════════════════════════════════════════════
--  CONCORRÊNCIA REAL — reproduzir com DUAS conexões (Sessão A / Sessão B).
--  (Não automatizável num único script: precisa de duas transações vivas.)
--
--  Caso 1 — mesma idempotency_key concorrente → exatamente 1 transação:
--    A) begin; select set_config('request.jwt.claims', '{"email":"...","role":"authenticated"}', true);
--       select app_registrar_pagamento_v2('<KEY>', '[{"pedido_id":"PX","valor":10}]', 10, <loja>);  -- segura o advisory lock
--    B) begin; (mesmos claims);
--       select app_registrar_pagamento_v2('<KEY>', '[{"pedido_id":"PX","valor":10}]', 10, <loja>);  -- BLOQUEIA aguardando A
--    A) commit;   B) desbloqueia e retorna idempotente=true (mesma id). Verificar:
--       select count(*) from pagamento_transacoes where idempotency_key='<KEY>';  -- = 1
--
--  Caso 2 — duas KEYS diferentes disputando o ÚLTIMO saldo do mesmo pedido:
--    A) begin; app_registrar_pagamento_v2('<KEY1>', '[{"pedido_id":"PY","valor":<saldo>}]', <saldo>, <loja>);  -- FOR UPDATE segura o pedido
--    B) begin; app_registrar_pagamento_v2('<KEY2>', '[{"pedido_id":"PY","valor":<saldo>}]', <saldo>, <loja>);  -- espera A
--    A) commit;  B) recalcula saldo=0 e retorna PAYMENT_V2_PEDIDO_JA_PAGO / EXCEDE_SALDO.
--       → o saldo é cobrado UMA única vez.
-- ════════════════════════════════════════════════════════════
