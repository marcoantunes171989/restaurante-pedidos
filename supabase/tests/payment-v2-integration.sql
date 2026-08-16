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
